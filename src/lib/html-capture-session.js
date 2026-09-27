// One opaque-origin sandbox per capture. Both fidelity preview and MP4 export
// use this exact frame protocol, preventing independent render implementations.
import {buildPreviewDoc,PREVIEW_CHANNEL} from './preview.js';
import {TIMELINE_CHANNEL} from './timeline-runtime.js';
import {checkedCaptureMessage,validateHtmlVideoOptions} from './html-video-plan.js';

export class HtmlExportCancelled extends Error{
  constructor(){super('HTML frame capture cancelled.');this.name='HtmlExportCancelled';}
}
export async function withHtmlCaptureSession(options,{signal}={},callback){
  const plan=validateHtmlVideoOptions(options);
  if(signal?.aborted)throw new HtmlExportCancelled();
  const session=crypto.randomUUID();
  const doc=buildPreviewDoc({...options,session,controlled:true,capture:true});
  const frame=document.createElement('iframe');
  frame.title='Private HTML export renderer';
  frame.setAttribute('sandbox','allow-scripts'); // no shared origin, forms or popups
  frame.referrerPolicy='no-referrer';
  Object.assign(frame.style,{
    position:'fixed',left:'-10000px',top:'-10000px',
    width:plan.width+'px',height:plan.height+'px',border:'0',
    pointerEvents:'none',zIndex:'-100'
  });
  let ready=false,settled=false,resolveReady,rejectReady,readyTimer=null,pending=null,index=-1;
  let runtimeFailure=null;
  const readyPromise=new Promise((resolve,reject)=>{resolveReady=resolve;rejectReady=reject;});
  readyPromise.catch(()=>{});
  const clearPending=()=>{
    if(pending)clearTimeout(pending.timeout);
    pending=null;
  };
  const abort=()=>{
    const error=new HtmlExportCancelled();
    if(!ready&&!settled){settled=true;clearTimeout(readyTimer);rejectReady(error);}
    if(pending){const reject=pending.reject;clearPending();reject(error);}
  };
  const receive=event=>{
    if(event.source!==frame.contentWindow)return;
    const data=event.data;
    if(!data||data.session!==session)return;
    // Diagnostics and timeline share the exact session+iframe origin check.
    // Inline scripts that throw (e.g. failed WebGL shader compilation) must
    // NEVER quietly turn into a verified video of a blank canvas.
    if(data.channel===PREVIEW_CHANNEL&&data.fatal===true){
      runtimeFailure=new Error('HTML script failed: '+String(data.message||'Unknown script error').slice(0,180));
      if(pending){const reject=pending.reject;clearPending();reject(runtimeFailure);}
      else if(!ready&&!settled){settled=true;clearTimeout(readyTimer);rejectReady(runtimeFailure);}
      return;
    }
    if(data.channel!==TIMELINE_CHANNEL)return;
    if(data.kind==='ready'){
      if(!ready&&!settled){ready=true;settled=true;clearTimeout(readyTimer);resolveReady();}
      return;
    }
    if(data.kind==='failure'){
      const error=new Error(typeof data.message==='string'?
        data.message.slice(0,180):'HTML snapshot failed.');
      if(pending&&(!data.id||data.id===pending.id)){
        const reject=pending.reject;clearPending();reject(error);
      }else if(!ready&&!settled){settled=true;clearTimeout(readyTimer);rejectReady(error);}
      return;
    }
    if(data.kind!=='captured'||!pending||data.id!==pending.id)return;
    const current=pending;
    try{
      const bytes=checkedCaptureMessage(data,current,plan);
      clearPending();current.resolve(new Blob([bytes],{type:'image/png'}));
    }catch(error){
      clearPending();current.reject(error);
    }
  };
  window.addEventListener('message',receive);
  signal?.addEventListener('abort',abort,{once:true});
  const capture=async frameIndex=>{
    if(signal?.aborted)throw new HtmlExportCancelled();
    if(runtimeFailure)throw runtimeFailure;
    if(!Number.isInteger(frameIndex)||frameIndex!==index+1||frameIndex>=plan.frames)
      throw new RangeError('HTML frames must be requested sequentially from frame zero.');
    const id=crypto.randomUUID();
    const png=await new Promise((resolve,reject)=>{
      const timeout=window.setTimeout(()=>{
        if(pending?.id===id){pending=null;reject(new Error('HTML frame '+frameIndex+' timed out.'));}
      },options.document?60000:25000);
      pending={id,frame:frameIndex,timeout,resolve,reject};
      frame.contentWindow?.postMessage({
        channel:TIMELINE_CHANNEL,session,kind:'seek',id,
        frame:frameIndex,fps:plan.fps,width:plan.width,height:plan.height,capture:true
      },'*');
    });
    if(signal?.aborted)throw new HtmlExportCancelled();
    if(runtimeFailure)throw runtimeFailure;
    index=frameIndex;
    return png;
  };
  try{
    readyTimer=window.setTimeout(()=>{
      if(!settled){settled=true;rejectReady(new Error('HTML sandbox initialization timed out.'));}
    },options.document?30000:15000);
    frame.onload=()=>frame.contentWindow?.postMessage({
      channel:TIMELINE_CHANNEL,session,kind:'hello'
    },'*');
    // Reserve and lay out the real capture viewport BEFORE parsing srcdoc.
    // Full HTML scripts often read innerWidth/innerHeight synchronously while
    // constructing canvas/WebGL renderers. An unattached srcdoc iframe can
    // expose 0x0 and silently generate a permanently blank video.
    document.body.appendChild(frame);
    const rect=frame.getBoundingClientRect();
    if(Math.abs(rect.width-plan.width)>1||Math.abs(rect.height-plan.height)>1)
      throw new Error('HTML capture viewport could not be laid out at the requested resolution.');
    frame.srcdoc=doc;
    await readyPromise;
    if(signal?.aborted)throw new HtmlExportCancelled();
    return await callback({plan,capture});
  }finally{
    signal?.removeEventListener('abort',abort);
    window.removeEventListener('message',receive);
    clearTimeout(readyTimer);clearPending();
    frame.remove();
  }
}
export async function captureHtmlFrame(options,index=0,{signal}={}){
  const plan=validateHtmlVideoOptions(options);
  if(!Number.isInteger(index)||index<0||index>=plan.frames)
    throw new RangeError('Requested preview frame is outside the selected duration.');
  return withHtmlCaptureSession(options,{signal},async({capture})=>{
    let png;
    for(let i=0;i<=index;i++)png=await capture(i);
    return png;
  });
}

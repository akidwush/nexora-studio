// One opaque-origin sandbox per capture. Both fidelity preview and MP4 export
// use this exact frame protocol, preventing independent render implementations.
import {buildPreviewDoc} from './preview.js';
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
    if(!data||data.channel!==TIMELINE_CHANNEL||data.session!==session)return;
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
    if(!Number.isInteger(frameIndex)||frameIndex!==index+1||frameIndex>=plan.frames)
      throw new RangeError('HTML frames must be requested sequentially from frame zero.');
    const id=crypto.randomUUID();
    const png=await new Promise((resolve,reject)=>{
      const timeout=window.setTimeout(()=>{
        if(pending?.id===id){pending=null;reject(new Error('HTML frame '+frameIndex+' timed out.'));}
      },25000);
      pending={id,frame:frameIndex,timeout,resolve,reject};
      frame.contentWindow?.postMessage({
        channel:TIMELINE_CHANNEL,session,kind:'seek',id,
        frame:frameIndex,fps:plan.fps,width:plan.width,height:plan.height,capture:true
      },'*');
    });
    if(signal?.aborted)throw new HtmlExportCancelled();
    index=frameIndex;
    return png;
  };
  try{
    readyTimer=window.setTimeout(()=>{
      if(!settled){settled=true;rejectReady(new Error('HTML sandbox initialization timed out.'));}
    },15000);
    frame.onload=()=>frame.contentWindow?.postMessage({
      channel:TIMELINE_CHANNEL,session,kind:'hello'
    },'*');
    frame.srcdoc=doc;
    document.body.appendChild(frame);
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

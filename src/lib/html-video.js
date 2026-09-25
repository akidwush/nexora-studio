// DOM/inline SVG --> computed snapshot PNG inside opaque iframe --> CanvasSource
// --> WebCodecs H.264 MP4. Capture and encode can run more slowly than real time:
// encoded PTS/DTS always come from the *requested integer frame index*.
import {buildPreviewDoc} from './preview.js';
import {TIMELINE_CHANNEL,frameTimestamp} from './timeline-runtime.js';
import {validateHtmlVideoOptions,checkedCaptureMessage} from './html-video-plan.js';

export class HtmlExportCancelled extends Error{
  constructor(){super('HTML video export cancelled.');this.name='HtmlExportCancelled';}
}
function downloadFrameBlob(bytes){
  return new Blob([bytes],{type:'image/png'});
}
export async function encodeHtmlVideo(options,{signal,onProgress,onFrame}={}){
  const plan=validateHtmlVideoOptions(options);
  if(signal?.aborted)throw new HtmlExportCancelled();
  if(typeof window.VideoEncoder==='undefined')
    throw new Error('WebCodecs H.264 is unavailable. Use current Chrome or Edge.');
  const config={codec:'avc1.42001f',width:plan.width,height:plan.height,
    bitrate:plan.width*plan.height>=900_000?7_000_000:3_000_000,
    framerate:plan.fps,hardwareAcceleration:'no-preference'};
  const support=await VideoEncoder.isConfigSupported(config);
  if(!support.supported)throw new Error('H.264 encoding at this format is not supported by your browser.');
  const {Output,Mp4OutputFormat,BufferTarget,CanvasSource}=await import('mediabunny');
  const session=crypto.randomUUID();
  const doc=buildPreviewDoc({...options,session,controlled:true,capture:true});
  const frame=document.createElement('iframe');
  frame.title='Private HTML export renderer';
  frame.setAttribute('sandbox','allow-scripts'); // NEVER add allow-same-origin.
  frame.referrerPolicy='no-referrer';
  Object.assign(frame.style,{
    position:'fixed',left:'-10000px',top:'-10000px',
    width:plan.width+'px',height:plan.height+'px',border:'0',
    pointerEvents:'none',zIndex:'-100'
  });
  const canvas=document.createElement('canvas');canvas.width=plan.width;canvas.height=plan.height;
  const ctx=canvas.getContext('2d',{alpha:false});
  if(!ctx)throw new Error('Canvas encoder is not available.');
  const output=new Output({format:new Mp4OutputFormat(),target:new BufferTarget()});
  const track=new CanvasSource(canvas,{
    codec:'avc',bitrate:config.bitrate,latencyMode:'quality',keyFrameInterval:1
  });
  output.addVideoTrack(track);
  let started=false,ready=false,readyResolve,readyReject,readyTimeout=null,pending=null;
  const assertNotCancelled=()=>{if(signal?.aborted)throw new HtmlExportCancelled();};
  const clearPending=()=>{
    if(pending){clearTimeout(pending.timeout);pending=null;}
  };
  const readyPromise=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  // Prevent a late rejection from becoming unhandled if setup fails before await.
  readyPromise.catch(()=>{});
  const onMessage=event=>{
    if(event.source!==frame.contentWindow)return;
    const data=event.data;
    if(!data||data.channel!==TIMELINE_CHANNEL||data.session!==session)return;
    if(data.kind==='ready'){
      if(!ready){ready=true;clearTimeout(readyTimeout);readyResolve();}
      return;
    }
    if(data.kind==='failure'){
      const message=typeof data.message==='string'?data.message.slice(0,180):'Sandbox failed to capture a frame.';
      const err=new Error(message);
      if(pending&&(!data.id||data.id===pending.id)){
        const reject=pending.reject;clearPending();reject(err);
      }else if(!ready){clearTimeout(readyTimeout);readyReject(err);}
      return;
    }
    if(data.kind!=='captured'||!pending||data.id!==pending.id)return;
    const current=pending;
    try{
      const bytes=checkedCaptureMessage(data,current,plan);
      clearPending();current.resolve(bytes);
    }catch(err){
      clearPending();current.reject(err);
    }
  };
  const onAbort=()=>{
    const err=new HtmlExportCancelled();
    if(!ready){clearTimeout(readyTimeout);readyReject(err);}
    if(pending){const reject=pending.reject;clearPending();reject(err);}
  };
  window.addEventListener('message',onMessage);
  signal?.addEventListener('abort',onAbort,{once:true});
  try{
    readyTimeout=window.setTimeout(()=>readyReject(new Error('Sandbox initialization timed out.')),15000);
    frame.onload=()=>frame.contentWindow?.postMessage({
      channel:TIMELINE_CHANNEL,session,kind:'hello'
    },'*');
    frame.srcdoc=doc;
    document.body.appendChild(frame);
    await readyPromise;
    assertNotCancelled();
    await output.start();started=true;
    for(let index=0;index<plan.frames;index++){
      assertNotCancelled();
      const id=crypto.randomUUID();
      const png=await new Promise((resolve,reject)=>{
        const timeout=window.setTimeout(()=>{
          if(pending?.id===id){pending=null;reject(new Error('HTML frame '+index+' timed out.'));}
        },25000);
        pending={id,frame:index,timeout,resolve,reject};
        frame.contentWindow?.postMessage({
          channel:TIMELINE_CHANNEL,session,kind:'seek',id,
          frame:index,fps:plan.fps,width:plan.width,height:plan.height,capture:true
        },'*');
      });
      assertNotCancelled();
      const bitmap=await createImageBitmap(downloadFrameBlob(png));
      try{
        if(bitmap.width!==plan.width||bitmap.height!==plan.height)
          throw new Error('Captured frame does not match requested video dimensions.');
        ctx.fillStyle='#fff';ctx.fillRect(0,0,plan.width,plan.height);
        ctx.drawImage(bitmap,0,0,plan.width,plan.height);
        await track.add(index/plan.fps,1/plan.fps,{keyFrame:index%plan.fps===0});
        if(typeof onFrame==='function'&&(index===0||index===plan.frames-1))
          onFrame({frame:index,png:downloadFrameBlob(png)});
      }finally{bitmap.close();}
      onProgress?.((index+1)/plan.frames,index+1,plan.frames);
      // Permit paint/cancel between sequential frames, not clock advancement.
      if(index%3===0)await new Promise(resolve=>setTimeout(resolve,0));
    }
    assertNotCancelled();
    await output.finalize();
    assertNotCancelled();
    const buffer=output.target.buffer;
    if(!buffer||buffer.byteLength<256)
      throw new Error('MP4 output was incomplete.');
    return new Blob([buffer],{type:'video/mp4'});
  }catch(error){
    if(started){try{await output.cancel();}catch{}}
    throw error;
  }finally{
    signal?.removeEventListener('abort',onAbort);
    window.removeEventListener('message',onMessage);
    clearTimeout(readyTimeout);clearPending();
    frame.remove();
  }
}

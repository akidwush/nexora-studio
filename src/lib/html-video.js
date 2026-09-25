// Identical opaque-origin capture code for exact preview and MP4 exports.
// MP4 has no alpha: we explicitly composite on the same user-selected matte
// shown in preview. Raw PNG preview retains its alpha separately.
import {withHtmlCaptureSession,HtmlExportCancelled,captureHtmlFrame} from './html-capture-session.js';
import {validateHtmlVideoOptions} from './html-video-plan.js';
import {drawOnMatte,assertExactRawFrame,makeMattePreview,verifyMp4Frame} from './html-frame-parity.js';
export {captureHtmlFrame,HtmlExportCancelled,makeMattePreview};
export async function encodeHtmlVideo(options,{
  signal,onProgress,onFrame,onQuality,reference
}={}){
  const plan=validateHtmlVideoOptions(options);
  if(signal?.aborted)throw new HtmlExportCancelled();
  if(typeof VideoEncoder==='undefined')
    throw new Error('WebCodecs H.264 is unavailable. Use current Chrome or Edge.');
  const bitrate=plan.width*plan.height>=900_000?7_000_000:3_000_000;
  const support=await VideoEncoder.isConfigSupported({
    codec:'avc1.42001f',width:plan.width,height:plan.height,
    bitrate,framerate:plan.fps,hardwareAcceleration:'no-preference'
  });
  if(!support.supported)throw new Error('This browser cannot encode H.264 at the selected format.');
  if(reference&&(!Number.isInteger(reference.index)||reference.index<0||
    reference.index>=plan.frames||!(reference.png instanceof Blob)))
    throw new Error('The export reference is not a valid preview frame.');
  const {Output,Mp4OutputFormat,BufferTarget,CanvasSource}=await import('mediabunny');
  if(signal?.aborted)throw new HtmlExportCancelled();
  return withHtmlCaptureSession(options,{signal},async({capture})=>{
    const canvas=document.createElement('canvas');
    canvas.width=plan.width;canvas.height=plan.height;
    const ctx=canvas.getContext('2d',{alpha:false});
    if(!ctx)throw new Error('Canvas video encoding is unavailable.');
    const target=new BufferTarget();
    const output=new Output({format:new Mp4OutputFormat(),target});
    const track=new CanvasSource(canvas,{
      codec:'avc',bitrate,latencyMode:'quality',keyFrameInterval:1
    });
    output.addVideoTrack(track);
    let started=false,rawReference=null;
    const qualityIndex=reference?.index??0;
    try{
      await output.start();started=true;
      for(let index=0;index<plan.frames;index++){
        if(signal?.aborted)throw new HtmlExportCancelled();
        const png=await capture(index);
        const bitmap=await createImageBitmap(png);
        try{
          if(bitmap.width!==plan.width||bitmap.height!==plan.height)
            throw new Error('Captured PNG dimensions changed.');
          if(index===qualityIndex){
            if(reference)await assertExactRawFrame(reference.png,png,plan.width,plan.height);
            rawReference=png;
          }
          drawOnMatte(ctx,bitmap,plan.width,plan.height,plan.matte);
          await track.add(index/plan.fps,1/plan.fps,{
            keyFrame:index%plan.fps===0
          });
          if(onFrame&&(index===0||index===plan.frames-1))
            onFrame({frame:index,png});
        }finally{bitmap.close();}
        onProgress?.((index+1)/plan.frames,index+1,plan.frames);
        if(index%3===0)await new Promise(resolve=>setTimeout(resolve,0));
      }
      if(signal?.aborted)throw new HtmlExportCancelled();
      await output.finalize();
      if(signal?.aborted)throw new HtmlExportCancelled();
      if(!target.buffer||target.buffer.byteLength<256)
        throw new Error('MP4 encoder returned an incomplete file.');
      const blob=new Blob([target.buffer],{type:'video/mp4'});
      if(!rawReference)throw new Error('No captured reference frame was available.');
      const matchedMatte=await makeMattePreview(
        rawReference,plan.width,plan.height,plan.matte
      );
      // An actual video decoder checks the *encoded* frame against the same
      // matte-composited preview, tolerating bounded H.264 color quantization.
      const quality=await verifyMp4Frame(
        blob,matchedMatte,plan.width,plan.height,qualityIndex,plan.fps
      );
      if(signal?.aborted)throw new HtmlExportCancelled();
      onQuality?.({...quality,frame:qualityIndex,referenceMatched:Boolean(reference)});
      return blob;
    }catch(error){
      if(started){try{await output.cancel();}catch{}}
      throw error;
    }
  });
}

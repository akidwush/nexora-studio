// Preview and export share the same opaque-origin deterministic capture clock.
// BufferTarget remains the compatible fallback; StreamTarget writes bounded
// chunks to temporary OPFS storage on browsers with a secure file picker.
import {withHtmlCaptureSession,HtmlExportCancelled,captureHtmlFrame} from './html-capture-session.js';
import {validateHtmlVideoOptions} from './html-video-plan.js';
import {drawOnMatte,assertExactRawFrame,makeMattePreview,verifyMp4Frames} from './html-frame-parity.js';
import {createMp4Sink,criticalFrameIndices} from './mp4-output-sink.js';
import {makeRenderReport} from './render-fidelity-report.js';
import {MOBILE_AVC_CODEC,MOBILE_MP4_FORMAT,inspectAndroidMp4} from './android-mp4.js';
export {captureHtmlFrame,HtmlExportCancelled,makeMattePreview};
export async function encodeHtmlVideo(options,{
  signal,onProgress,onFrame,onQuality,onReport,reference,fileHandle
}={}){
  const plan=validateHtmlVideoOptions(options);
  const mode=fileHandle?'stream':'memory';
  let stage='initialize',measured=[];
  try{
    if(signal?.aborted)throw new HtmlExportCancelled();
    if(typeof VideoEncoder==='undefined')
      throw new Error('WebCodecs H.264 is unavailable. Use current Chrome or Edge.');
    const bitrate=plan.width*plan.height>=900_000?7_000_000:3_000_000;
    const support=await VideoEncoder.isConfigSupported({
      codec:MOBILE_AVC_CODEC,width:plan.width,height:plan.height,
      bitrate,framerate:plan.fps,hardwareAcceleration:'no-preference'
    });
    if(!support.supported)throw new Error('This browser cannot encode H.264 at the selected format.');
    if(reference&&(!Number.isInteger(reference.index)||reference.index<0||
      reference.index>=plan.frames||!(reference.png instanceof Blob)))
      throw new Error('The export reference is not a valid preview frame.');
    const {Output,Mp4OutputFormat,BufferTarget,StreamTarget,CanvasSource}=await import('mediabunny');
    if(signal?.aborted)throw new HtmlExportCancelled();
    const important=criticalFrameIndices(plan.frames);
    const selectedIndex=reference?.index??0;
    return await withHtmlCaptureSession(options,{signal},async({capture})=>{
      const canvas=document.createElement('canvas');
      canvas.width=plan.width;canvas.height=plan.height;
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)throw new Error('Canvas video encoding is unavailable.');
      const sink=await createMp4Sink({fileHandle,BufferTarget,StreamTarget});
      // Memory download retains Mediabunny's proven compact Fast Start path;
      // only OPFS-backed streaming needs reserved random-access metadata.
      const output=new Output({format:new Mp4OutputFormat(fileHandle?
        MOBILE_MP4_FORMAT:{fastStart:'in-memory'}),target:sink.target});
      const track=new CanvasSource(canvas,{
        codec:'avc',fullCodecString:MOBILE_AVC_CODEC,
        bitrate,latencyMode:'quality',keyFrameInterval:1
      });
      // Reserve exactly enough moov metadata up front without buffering all
      // media chunks in RAM: still a regular, seekable, non-fragmented MP4.
      output.addVideoTrack(track,{maximumPacketCount:plan.frames});
      let started=false,finalized=false;
      const captured=new Map();
      try{
        stage='capture';
        await output.start();started=true;
        for(let index=0;index<plan.frames;index++){
          if(signal?.aborted)throw new HtmlExportCancelled();
          const png=await capture(index);
          const bitmap=await createImageBitmap(png);
          try{
            if(bitmap.width!==plan.width||bitmap.height!==plan.height)
              throw new Error('Captured PNG dimensions changed.');
            if(important.includes(index)||index===selectedIndex){
              if(reference&&index===reference.index){
                // The external preview is captured independently. Compare
                // decoded raw RGBA including alpha, not just opaque matte.
                await assertExactRawFrame(reference.png,png,plan.width,plan.height);
              }
              captured.set(index,png);
            }
            drawOnMatte(ctx,bitmap,plan.width,plan.height,plan.matte);
            await track.add(index/plan.fps,1/plan.fps,{
              keyFrame:index%plan.fps===0
            });
            if(onFrame&&important.includes(index))onFrame({frame:index,png});
          }finally{bitmap.close();}
          onProgress?.((index+1)/plan.frames,index+1,plan.frames);
          if(index%3===0)await new Promise(resolve=>setTimeout(resolve,0));
        }
        if(signal?.aborted)throw new HtmlExportCancelled();
        await output.finalize();finalized=true;
        if(signal?.aborted)throw new HtmlExportCancelled();
        stage='decode-verify';
        const stagedVideo=await sink.read();
        const mobile=await inspectAndroidMp4(stagedVideo,{expectedFrames:plan.frames});
        const samples=important.map(frame=>({frame,png:captured.get(frame)}));
        if(samples.some(sample=>!(sample.png instanceof Blob)))
          throw new Error('Critical-frame capture was incomplete.');
        const references=[];
        for(const sample of samples)references.push({
          frame:sample.frame,
          png:await makeMattePreview(sample.png,plan.width,plan.height,plan.matte)
        });
        // Three independent decoded H.264 checks: first, middle, last.
        measured=await verifyMp4Frames(stagedVideo,references,plan.width,plan.height,plan.fps,
          result=>{measured.push(result);});
        if(signal?.aborted)throw new HtmlExportCancelled();
        stage='publish';
        // Only now touch the user's chosen file; stream with backpressure
        // from a verified temporary file instead of retaining MP4 in RAM.
        const video=await sink.publish({signal});
        // A successful OPFS staging encode is not sufficient if the browser
        // picker writes incomplete/truncated destination bytes.
        const saved=await inspectAndroidMp4(video,{expectedFrames:plan.frames});
        if(video.size!==stagedVideo.size||saved.codec!==mobile.codec)
          throw Error('Saved MP4 did not match the verified temporary video. Try Compatible download.');
        const quality={
          meanError:Math.max(...measured.map(s=>s.meanError)),
          severeFraction:Math.max(...measured.map(s=>s.severeFraction)),
          frames:measured,referenceMatched:Boolean(reference),outputMode:sink.kind,
          compatibility:mobile
        };
        onQuality?.(quality);
        onReport?.(makeRenderReport(plan,{mode:sink.kind,frames:measured,compatibility:mobile}));
        return video;
      }catch(error){
        // Before finalization, cancel closes the staged writer without
        // committing even a partial MP4 to the chosen destination.
        if(started&&!finalized){try{await output.cancel();}catch{}}
        throw error;
      }finally{
        await sink.cleanup();
      }
    });
  }catch(error){
    onReport?.(makeRenderReport(plan,{mode,frames:measured,error,phase:stage}));
    throw error;
  }
}

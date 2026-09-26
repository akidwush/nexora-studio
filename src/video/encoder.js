// Canvas-only preset rendering. Untrusted user HTML/JS NEVER runs here.
// File-backed export uses a bounded OPFS staging file, verifying before save.
import {Output,Mp4OutputFormat,BufferTarget,StreamTarget,CanvasSource} from 'mediabunny';
import {drawMotionFrame} from './draw.js';
import {validateScene} from '../ai/scene.js';
import {validateVideoOptions} from './timeline.js';
import {criticalFrameIndices,createMp4Sink} from '../lib/mp4-output-sink.js';
import {verifyMp4Frames} from '../lib/html-frame-parity.js';
import {makeRenderReport} from '../lib/render-fidelity-report.js';
export class ExportCancelled extends Error{
 constructor(){super('Video export cancelled');this.name='ExportCancelled';}
}
export async function canEncodeAvc(width=640,height=360,fps=24){
 if(typeof VideoEncoder==='undefined')return false;
 try{return Boolean((await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width,height,bitrate:2_000_000,framerate:fps,hardwareAcceleration:'no-preference'})).supported);}
 catch{return false;}
}
const pngBlob=canvas=>new Promise((resolve,reject)=>
  canvas.toBlob(blob=>blob?resolve(blob):reject(Error('Canvas reference PNG could not be captured.')),'image/png'));
export async function encodeMotionMp4(options,{signal,onProgress,onQuality,onReport,fileHandle}={}){
 const opts=validateVideoOptions(options);
 const scene=options?.scene?validateScene(options.scene):null;
 const mode=fileHandle?'stream':'memory';
 const plan={size:opts.size,width:opts.width,height:opts.height,fps:opts.fps,duration:opts.duration,matte:'#000000'};
 let stage='initialize',measured=[];
 try{
   if(!(await canEncodeAvc(opts.width,opts.height,opts.fps)))
     throw new Error('H.264 encoding is unavailable at this size; try Fast mode on Chrome or Edge.');
   if(signal?.aborted)throw new ExportCancelled();
   const canvas=document.createElement('canvas');canvas.width=opts.width;canvas.height=opts.height;
   const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas unavailable');
   const sink=await createMp4Sink({fileHandle,BufferTarget,StreamTarget});
   const output=new Output({format:new Mp4OutputFormat(),target:sink.target});
   const source=new CanvasSource(canvas,{codec:'avc',
     bitrate:Math.min(14_000_000,Math.max(2_000_000,opts.width*opts.height*opts.fps*.12)),
     keyFrameInterval:1,latencyMode:'quality'});
   output.addVideoTrack(source);
   let started=false,finalized=false;
   const important=criticalFrameIndices(opts.frames),refs=[];
   try{
     await output.start();started=true;stage='encode';
     for(let i=0;i<opts.frames;i++){
       if(signal?.aborted)throw new ExportCancelled();
       const time=i/opts.fps;drawMotionFrame(ctx,{...opts,time,scene});
       if(important.includes(i))refs.push({frame:i,png:await pngBlob(canvas)});
       await source.add(time,1/opts.fps,{keyFrame:i%opts.fps===0});
       if((i+1)%Math.max(1,Math.floor(opts.fps/3))===0||i===opts.frames-1)
         onProgress?.((i+1)/opts.frames);
       if(i%3===0)await new Promise(resolve=>setTimeout(resolve,0));
     }
     if(signal?.aborted)throw new ExportCancelled();
     await output.finalize();finalized=true;
     if(signal?.aborted)throw new ExportCancelled();
     stage='decode-verify';
     measured=await verifyMp4Frames(await sink.read(),refs,opts.width,opts.height,opts.fps,
       result=>{measured.push(result);});
     if(signal?.aborted)throw new ExportCancelled();
     stage='publish';
     const video=await sink.publish({signal});
     onQuality?.({frames:measured,meanError:Math.max(...measured.map(s=>s.meanError)),
       severeFraction:Math.max(...measured.map(s=>s.severeFraction)),outputMode:sink.kind});
     onReport?.(makeRenderReport(plan,{mode:sink.kind,frames:measured}));
     return video;
   }catch(error){
     if(started&&!finalized)try{await output.cancel();}catch{}
     throw error;
   }finally{await sink.cleanup();}
 }catch(error){
   onReport?.(makeRenderReport(plan,{mode,frames:measured,error,phase:stage}));
   throw error;
 }
}

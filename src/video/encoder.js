// Canvas-only preset rendering. Untrusted user HTML/JS NEVER runs here.
import {Output,Mp4OutputFormat,BufferTarget,CanvasSource} from 'mediabunny';
import {drawMotionFrame} from './draw.js';
import {validateVideoOptions} from './timeline.js';
export class ExportCancelled extends Error{
 constructor(){super('Video export cancelled');this.name='ExportCancelled';}
}
export async function canEncodeAvc(width=640,height=360,fps=24){
 if(typeof VideoEncoder==='undefined')return false;
 try{return Boolean((await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width,height,bitrate:2_000_000,framerate:fps,hardwareAcceleration:'no-preference'})).supported);}
 catch{return false;}
}
export async function encodeMotionMp4(options,{signal,onProgress}={}){
 const opts=validateVideoOptions(options);
 if(!(await canEncodeAvc(opts.width,opts.height,opts.fps)))
   throw new Error('H.264 encoding is unavailable at this size; try Fast mode on Chrome or Edge.');
 if(signal?.aborted)throw new ExportCancelled();
 const canvas=document.createElement('canvas');canvas.width=opts.width;canvas.height=opts.height;
 const ctx=canvas.getContext('2d',{alpha:false});if(!ctx)throw new Error('Canvas unavailable');
 const target=new BufferTarget();
 const output=new Output({format:new Mp4OutputFormat(),target});
 const source=new CanvasSource(canvas,{codec:'avc',bitrate:Math.min(14_000_000,Math.max(2_000_000,opts.width*opts.height*opts.fps*.12)),keyFrameInterval:1,latencyMode:'quality'});
 output.addVideoTrack(source);
 let started=false;
 try{
   await output.start();started=true;
   for(let i=0;i<opts.frames;i++){
     if(signal?.aborted)throw new ExportCancelled();
     const time=i/opts.fps;drawMotionFrame(ctx,{...opts,time});
     await source.add(time,1/opts.fps,{keyFrame:i%opts.fps===0});
     if((i+1)%Math.max(1,Math.floor(opts.fps/3))===0||i===opts.frames-1)onProgress?.((i+1)/opts.frames);
     if(i%3===0)await new Promise(resolve=>setTimeout(resolve,0));
   }
   if(signal?.aborted)throw new ExportCancelled();
   await output.finalize();
   if(signal?.aborted)throw new ExportCancelled();
   if(!target.buffer||target.buffer.byteLength<128)throw new Error('MP4 encoder returned an empty result');
   return new Blob([target.buffer],{type:'video/mp4'});
 }catch(error){
   if(started)try{await output.cancel();}catch{}
   throw error;
 }
}

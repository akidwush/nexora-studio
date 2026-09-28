import {MAX_TIMELINE_FRAMES,frameTimestamp} from './timeline-runtime.js';
import {UNIVERSAL_EXPORT_DURATION} from './export-policy.js';
export const HTML_VIDEO_SIZES=Object.freeze({
  compact:{width:640,height:360,label:'16:9 · 640×360 (fast)'},
  landscape:{width:1280,height:720,label:'16:9 · 1280×720 (HD)'},
  portrait:{width:720,height:1280,label:'9:16 · 720×1280 (HD)'},
  square:{width:720,height:720,label:'1:1 · 720×720'}
});
export function validateMatte(value){
  const matte=value??'#FFFFFF';
  if(typeof matte!=='string'||!/^#[0-9a-fA-F]{6}$/.test(matte))
    throw new Error('MP4 matte must be a six-digit hexadecimal color.');
  return matte.toUpperCase();
}
export function validateHtmlVideoOptions(options){
  const size=options?.size, fps=Number(options?.fps),duration=Number(options?.duration);
  const matte=validateMatte(options?.matte);
  if(!Object.hasOwn(HTML_VIDEO_SIZES,size))throw new Error('Unsupported HTML output size.');
  if(![24,30,60].includes(fps))throw new Error('HTML capture supports 24, 30 or 60 FPS.');
  const fullDocument=typeof options?.document==='string';
  const supportedDurations=fullDocument?[1,2,3,5,8,10]:[1,2,3,UNIVERSAL_EXPORT_DURATION];
  if(!supportedDurations.includes(duration))
    throw new Error(fullDocument?'Complete HTML exports allow the legacy test durations and the standard 8-second export.':'HTML export supports the standard 8-second export and legacy short regression clips.');
  // Keep historical short/10s plans available for regression tests. The
  // simple product flow uses 8s; long HD remains an explicit local stream.
  const hdLong=duration>=UNIVERSAL_EXPORT_DURATION&&size==='landscape'&&
    (fps===24||fps===30)&&options?.stream===true;
  if(duration>3&&size!=='compact'&&!hdLong)
    throw new Error('Ekspor 8 detik ukuran HD memerlukan streaming lokal. Pilih 640×360 untuk konfigurasi Android yang aman.');
  if(fps===60&&size!=='compact')
    throw new Error('60 FPS HTML export currently supports 640×360 only to protect mobile memory.');
  const {width,height}=HTML_VIDEO_SIZES[size];
  if(width*height>1_000_000||fps*duration>MAX_TIMELINE_FRAMES)
    throw new Error('HTML capture exceeds the frame or pixel budget.');
  return Object.freeze({size,width,height,fps,duration,frames:fps*duration,matte,hdLong});
}
// Animated gradients and shader rings need more bitrate than short flat UI
// scenes. Preserve AVC Baseline <=3.1, and do not change existing short clips.
export function htmlVideoBitrate(plan){
  if(plan.width*plan.height>=900_000)return plan.hdLong?9_000_000:7_000_000;
  return plan.duration>=8?5_000_000:3_000_000;
}
export function checkedCaptureMessage(message,request,plan){
  if(!message||message.kind!=='captured'||message.id!==request.id||
    message.frame!==request.frame||message.fps!==plan.fps||
    message.ms!==frameTimestamp(request.frame,plan.fps)||
    !(message.bytes instanceof ArrayBuffer)||
    message.bytes.byteLength<80||message.bytes.byteLength>6_000_000)
      throw new Error('Invalid or out-of-order sandbox frame.');
  const header=new Uint8Array(message.bytes,0,8);
  if([...header].join(',')!=='137,80,78,71,13,10,26,10')
    throw new Error('Sandbox did not return PNG frame data.');
  return message.bytes;
}

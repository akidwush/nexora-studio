// Shared opaque MP4 matte + exact preview compositing and parity diagnostics.
// This is bounded RGB visual comparison, never a security claim about iframe IPC.
import {validateMatte} from './html-video-plan.js';

export function drawOnMatte(ctx,bitmap,width,height,matte='#FFFFFF'){
  ctx.save();
  ctx.globalCompositeOperation='source-over';
  ctx.fillStyle=validateMatte(matte);
  ctx.fillRect(0,0,width,height);
  ctx.drawImage(bitmap,0,0,width,height);
  ctx.restore();
}
function getCanvas(w,h){
  const canvas=document.createElement('canvas');canvas.width=w;canvas.height=h;
  const ctx=canvas.getContext('2d',{alpha:true,willReadFrequently:true});
  if(!ctx)throw new Error('Browser canvas fidelity comparison unavailable.');
  return {canvas,ctx};
}
const pngBlob=canvas=>new Promise((resolve,reject)=>
  canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG compositing failed.')),'image/png'));

export async function makeMattePreview(raw,w,h,matte){
  const bitmap=await createImageBitmap(raw);
  try{
    if(bitmap.width!==w||bitmap.height!==h)throw new Error('Preview frame dimensions changed.');
    const {canvas,ctx}=getCanvas(w,h);
    drawOnMatte(ctx,bitmap,w,h,matte);
    return await pngBlob(canvas);
  }finally{bitmap.close();}
}
// Exact decoded reference vs freshly captured raw frame, including alpha.
// A mismatch aborts the export before claiming preview parity.
export async function assertExactRawFrame(reference,current,w,h){
  const [left,right]=await Promise.all([createImageBitmap(reference),createImageBitmap(current)]);
  try{
    if(left.width!==w||right.width!==w||left.height!==h||right.height!==h)
      throw new Error('Preview/export image dimensions differ.');
    const a=getCanvas(w,h),b=getCanvas(w,h);
    a.ctx.clearRect(0,0,w,h);a.ctx.drawImage(left,0,0);
    b.ctx.clearRect(0,0,w,h);b.ctx.drawImage(right,0,0);
    const x=a.ctx.getImageData(0,0,w,h).data,y=b.ctx.getImageData(0,0,w,h).data;
    // Independent DOM-to-SVG raster runs may differ by tiny subpixel/font
    // antialiasing rounding. Keep tight, explicit RGBA thresholds instead of
    // rejecting legitimate GPU/font antialiasing differences between two
    // independent sandbox captures. The much stricter bound on severe-pixel
    // prevalence still rejects materially different frames or missing graphics.
    let sumRgb=0,sumAlpha=0,severe=0,alphaSevere=0,maxDelta=0;
    const pixels=w*h;
    for(let i=0;i<x.length;i+=4){
      let biggest=0;
      for(let c=0;c<3;c++){
        const delta=Math.abs(x[i+c]-y[i+c]);
        biggest=Math.max(biggest,delta);sumRgb+=delta;
      }
      const alpha=Math.abs(x[i+3]-y[i+3]);
      sumAlpha+=alpha;
      if(biggest>9)severe++;
      if(alpha>3)alphaSevere++;
      maxDelta=Math.max(maxDelta,biggest,alpha);
    }
    const meanRgb=sumRgb/(pixels*3),meanAlpha=sumAlpha/pixels;
    if(meanRgb>2||meanAlpha>3||severe/pixels>.016||alphaSevere/pixels>.016)
      throw new Error('Preview/export source frames differ beyond the tight RGBA budget: '+
        'RGB '+meanRgb.toFixed(3)+', alpha '+meanAlpha.toFixed(3)+
        ', severe '+(severe/pixels*100).toFixed(3)+'%, peak '+maxDelta+
        '. Regenerate the matching preview.');
    return true;
  }finally{left.close();right.close();}
}
export function rgbaSimilarity(expected,actual,{stride=1}={}){
  if(!expected||!actual||expected.length!==actual.length||expected.length%4)
    throw new Error('Visual comparison requires equal RGBA buffers.');
  let total=0,severe=0,pixels=0;
  for(let i=0;i<expected.length;i+=4*Math.max(1,stride)){
    let max=0;
    for(let c=0;c<3;c++){
      const delta=Math.abs(expected[i+c]-actual[i+c]);
      total+=delta;max=Math.max(max,delta);
    }
    if(max>65)severe++;
    pixels++;
  }
  return {meanError:total/(pixels*3),severeFraction:severe/pixels};
}
export async function verifyMp4Frame(videoBlob,opaqueReference,w,h,frame,fps){
  const video=document.createElement('video');
  video.muted=true;video.playsInline=true;video.preload='auto';
  const url=URL.createObjectURL(videoBlob);
  video.src=url;
  try{
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('Encoded video decode timed out.')),15000);
      video.onloadeddata=()=>{clearTimeout(timeout);resolve();};
      video.onerror=()=>{clearTimeout(timeout);reject(new Error('Encoded MP4 failed to decode.'));};
      video.load();
    });
    if(video.videoWidth!==w||video.videoHeight!==h)
      throw new Error('Decoded MP4 dimensions differ from export preview.');
    const desired=(frame+0.35)/fps;
    if(desired<video.duration){
      await new Promise((resolve,reject)=>{
        const timeout=setTimeout(()=>reject(new Error('MP4 frame seeking timed out.')),15000);
        video.onseeked=()=>{clearTimeout(timeout);resolve();};
        video.onerror=()=>{clearTimeout(timeout);reject(new Error('MP4 video seek failed.'));};
        video.currentTime=desired;
      });
    }
    const bitmap=await createImageBitmap(opaqueReference);
    try{
      const actual=getCanvas(w,h),expected=getCanvas(w,h);
      actual.ctx.drawImage(video,0,0,w,h);
      expected.ctx.drawImage(bitmap,0,0,w,h);
      const score=rgbaSimilarity(
        expected.ctx.getImageData(0,0,w,h).data,
        actual.ctx.getImageData(0,0,w,h).data
      );
      if(score.meanError>10||score.severeFraction>.045)
        throw new Error('MP4 visually differs from the matching preview (mean RGB error '+
          score.meanError.toFixed(2)+'). Try simpler styles or a different browser.');
      return score;
    }finally{bitmap.close();}
  }finally{
    video.removeAttribute('src');video.load();URL.revokeObjectURL(url);
  }
}

// Verify different timeline states rather than one flattering still frame.
// Each comparison uses the actual decoded H.264 pixels, not encoded metadata.
export async function verifyMp4Frames(videoBlob,references,w,h,fps,onFrame){
  if(!Array.isArray(references)||!references.length)throw Error('No keyframe references available.');
  const seen=new Set(),results=[];
  for(const item of references){
    if(!Number.isInteger(item.frame)||item.frame<0||seen.has(item.frame)||
       !(item.png instanceof Blob))throw Error('Invalid or duplicate fidelity reference frame.');
    seen.add(item.frame);
    let quality;
    try{quality=await verifyMp4Frame(videoBlob,item.png,w,h,item.frame,fps);}
    catch(error){throw new Error('MP4 frame '+item.frame+' parity failed: '+(error instanceof Error?error.message:'decode failure'));}
    const result={frame:item.frame,...quality};
    results.push(result);
    onFrame?.(result);
  }
  return results;
}

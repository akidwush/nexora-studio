import React, {useEffect,useRef,useState} from 'react';
import {VIDEO_PRESETS,VIDEO_SIZES} from './timeline.js';
import {drawMotionFrame} from './draw.js';
import {encodeMotionMp4,canEncodeAvc,ExportCancelled} from './encoder.js';

type Props={onBack:()=>void};
type SizeKey=keyof typeof VIDEO_SIZES;
type PresetKey='orbit'|'kinetic'|'waves';
function downloadBlob(url:string,name:string){
 const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
}
export default function VideoWorkspace({onBack}:Props){
 const [preset,setPreset]=useState<PresetKey>('orbit');
 const [size,setSize]=useState<SizeKey>('landscape');
 const [fps,setFps]=useState(24);
 const [duration,setDuration]=useState(4);
 const [playing,setPlaying]=useState(true);
 const [position,setPosition]=useState(0);
 const [progress,setProgress]=useState(0);
 const [working,setWorking]=useState(false);
 const [status,setStatus]=useState('Choose a preset, customize the timeline, then export a genuine MP4.');
 const [downloadUrl,setDownloadUrl]=useState('');
 const [codecOk,setCodecOk]=useState<boolean|null>(null);
 const controller=useRef<AbortController|null>(null);
 const canvasRef=useRef<HTMLCanvasElement|null>(null);
 const playbackTime=useRef(0);
 const previewDims=VIDEO_SIZES[size];
 const previewWidth=previewDims.width>previewDims.height?480:previewDims.width===previewDims.height?370:230;
 const previewHeight=Math.round(previewWidth*previewDims.height/previewDims.width);
 useEffect(()=>{let alive=true;setCodecOk(null);
   canEncodeAvc(previewDims.width,previewDims.height,fps).then(value=>{if(alive)setCodecOk(value);});
   return()=>{alive=false;};
 },[previewDims.width,previewDims.height,fps]);
 useEffect(()=>{playbackTime.current=0;setPosition(0);},[preset,size,duration]);
 useEffect(()=>{
   const canvas=canvasRef.current,ctx=canvas?.getContext('2d',{alpha:false});
   if(!canvas||!ctx)return;
   let raf=0;let lastEmit=0;
   const start=performance.now()-playbackTime.current*1000;
   const draw=(t:number)=>drawMotionFrame(ctx,{preset,time:t,duration,width:canvas.width,height:canvas.height});
   draw(playbackTime.current);
   if(playing){
     const tick=(now:number)=>{
       playbackTime.current=((now-start)/1000)%duration;
       draw(playbackTime.current);
       if(now-lastEmit>125){lastEmit=now;setPosition(playbackTime.current);}
       raf=requestAnimationFrame(tick);
     };
     raf=requestAnimationFrame(tick);
   }
   return()=>cancelAnimationFrame(raf);
 },[preset,size,duration,playing,previewWidth,previewHeight]);
 useEffect(()=>()=>{if(downloadUrl)URL.revokeObjectURL(downloadUrl);},[downloadUrl]);
 useEffect(()=>()=>controller.current?.abort(),[]);
 function setPlayback(next:number){
   setPlaying(false);playbackTime.current=next;setPosition(next);
   const canvas=canvasRef.current,ctx=canvas?.getContext('2d',{alpha:false});
   if(canvas&&ctx)drawMotionFrame(ctx,{preset,time:next,duration,width:canvas.width,height:canvas.height});
 }
 async function exportVideo(){
   if(working)return;
   setWorking(true);setProgress(0);setStatus('Preparing H.264 video encoder...');
   if(downloadUrl){URL.revokeObjectURL(downloadUrl);setDownloadUrl('');}
   const signal=new AbortController();controller.current=signal;
   try{
     const output=await encodeMotionMp4({preset,size,fps,duration},{
       signal:signal.signal,
       onProgress:(value:number)=>{setProgress(value);setStatus('Encoding '+Math.round(value*100)+'% · local browser rendering');}
     });
     if(signal.signal.aborted)throw new ExportCancelled();
     const url=URL.createObjectURL(output);
     setDownloadUrl(url);
     setStatus('MP4 ready · '+(output.size/1024/1024).toFixed(2)+' MB · silent video');
     // Link persists for browsers which restrict programmatic downloads after async encoding.
     downloadBlob(url,'nexora-motion-'+preset+'-'+size+'.mp4');
   }catch(e){
     setStatus(e instanceof ExportCancelled?'Export cancelled. No partial file saved.':e instanceof Error?e.message:'Video export failed.');
   }finally{if(controller.current===signal)controller.current=null;setWorking(false);}
 }
 return <main className="container workspace video-workspace">
   <div className="workspace-title">
     <div><button className="back" onClick={onBack}>← All tools</button><h1>Canvas Motion Video</h1><p>Real MP4 export. Exact frames, native canvas, zero upload.</p></div>
     <span className="codec-badge" data-supported={String(codecOk)}>{codecOk===null?'Checking encoder…':codecOk?'H.264 available':'H.264 unavailable'}</span>
   </div>
   <div className="video-grid">
     <section className="panel video-controls">
       <div className="panel-head"><b>COMPOSITION</b><span>FRAME-ACCURATE</span></div>
       <div className="video-fields">
         <label htmlFor="video-preset">Motion preset
           <select id="video-preset" disabled={working} value={preset} onChange={e=>setPreset(e.target.value as PresetKey)}>
             {VIDEO_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
           </select>
         </label>
         <label htmlFor="video-size">Canvas resolution
           <select id="video-size" disabled={working} value={size} onChange={e=>setSize(e.target.value as SizeKey)}>
             {Object.entries(VIDEO_SIZES).map(([key,s])=><option value={key} key={key}>{s.label} · {s.width}×{s.height}</option>)}
           </select>
         </label>
         <div className="video-dual">
           <label htmlFor="video-duration">Duration
             <select id="video-duration" value={duration} disabled={working} onChange={e=>setDuration(Number(e.target.value))}>
               {[1,2,3,4,5,6,8,10,12].map(n=><option key={n} value={n}>{n} sec</option>)}
             </select>
           </label>
           <label htmlFor="video-fps">Frame rate
             <select id="video-fps" value={fps} disabled={working} onChange={e=>setFps(Number(e.target.value))}>
               {[12,24,30].map(n=><option key={n} value={n}>{n} FPS</option>)}
             </select>
           </label>
         </div>
         <div className="video-plan"><span>FRAMES</span><b>{fps*duration}</b><span>CODEC</span><b>H.264 / MP4</b><span>SIZE</span><b>{previewDims.width} × {previewDims.height}</b></div>
         <button disabled={working||codecOk!==true} className="primary video-export" onClick={()=>void exportVideo()}>{working?'Encoding…':'↓ Export MP4'}</button>
         {working&&<><progress className="encode-progress" aria-label="MP4 export progress" value={progress} max={1}/><button className="cancel-export" onClick={()=>controller.current?.abort()}>Cancel export</button></>}
         {downloadUrl&&<a className="video-download" href={downloadUrl} download={'nexora-motion-'+preset+'-'+size+'.mp4'}>Download MP4 again ↗</a>}
         <p className="video-status" role="status" aria-live="polite">{status}</p>
         <p className="video-disclaimer">Silent MP4, no audio track. This tool renders built-in canvas presets, not arbitrary HTML/CSS clips.</p>
       </div>
     </section>
     <section className="panel video-preview-panel">
       <div className="panel-head"><b>FRAME PREVIEW</b><span>CANVAS / LOCAL</span></div>
       <div className="video-preview-stage">
         <canvas ref={canvasRef} width={previewWidth} height={previewHeight} aria-label="Canvas video preview" role="img"/>
       </div>
       <div className="video-timeline">
         <div className="timeline-head"><b>FRAME TIMELINE</b><span>{position.toFixed(1)} / {duration.toFixed(1)} s</span></div>
         <input type="range" aria-label="Scrub video timeline" min={0} max={duration} step={1/fps} value={position} disabled={working} onChange={e=>setPlayback(Number(e.target.value))}/>
         <div className="timeline-actions"><button disabled={working} onClick={()=>{if(!playing){playbackTime.current=position;}setPlaying(p=>!p);}}>{playing?'Ⅱ Pause':'▶ Play'}</button><span>{VIDEO_PRESETS.find(p=>p.id===preset)?.description}</span></div>
       </div>
     </section>
   </div>
 </main>;
}

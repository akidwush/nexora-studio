import React, {useEffect,useRef,useState} from 'react';
import {VIDEO_PRESETS,VIDEO_SIZES} from './timeline.js';
import {drawMotionFrame} from './draw.js';
import {encodeMotionMp4,canEncodeAvc,ExportCancelled} from './encoder.js';
import {supportsStreamingSave,beginMp4FilePick} from '../lib/mp4-output-sink.js';
import {UNIVERSAL_EXPORT_DURATION,STANDARD_EXPORT_FPS,assessEightSecondExport,deviceMemoryGb} from '../lib/export-policy.js';

type Props={onBack:()=>void};
type SizeKey=keyof typeof VIDEO_SIZES;
type PresetKey='orbit'|'kinetic'|'waves';
function downloadBlob(url:string,name:string){
 const a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();a.remove();
}
export default function VideoWorkspace({onBack}:Props){
 const [preset,setPreset]=useState<PresetKey>('orbit');
 const [size,setSize]=useState<SizeKey>('compact');
 const [fps,setFps]=useState(STANDARD_EXPORT_FPS);
 const [duration,setDuration]=useState(UNIVERSAL_EXPORT_DURATION);
 const [playing,setPlaying]=useState(true);
 const [position,setPosition]=useState(0);
 const [progress,setProgress]=useState(0);
 const [working,setWorking]=useState(false);
 const [status,setStatus]=useState('Siap membuat video MP4 8 detik.');
 const [downloadUrl,setDownloadUrl]=useState('');
 const [codecOk,setCodecOk]=useState<boolean|null>(null);
 const [saveMode,setSaveMode]=useState<'download'|'stream'>('download');
 const [canStream,setCanStream]=useState(false);
 const [frameQuality,setFrameQuality]=useState<{frame:number;meanError:number;severeFraction:number}[]>([]);
 const [fidelityReport,setFidelityReport]=useState<Record<string,unknown>|null>(null);
 const controller=useRef<AbortController|null>(null);
 const canvasRef=useRef<HTMLCanvasElement|null>(null);
 const playbackTime=useRef(0);
 const previewDims=VIDEO_SIZES[size];
 const previewWidth=previewDims.width>previewDims.height?480:previewDims.width===previewDims.height?370:230;
 const previewHeight=Math.round(previewWidth*previewDims.height/previewDims.width);
 const policy=assessEightSecondExport({width:previewDims.width,height:previewDims.height,fps,
   streamAvailable:canStream,memoryGb:deviceMemoryGb(),finePointer:window.matchMedia('(pointer:fine)').matches});
 const configurationProblem=duration===UNIVERSAL_EXPORT_DURATION&&!policy.supported?
   policy.reason+' '+policy.alternative:'';
 useEffect(()=>{setCanStream(supportsStreamingSave(window));},[]);
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
 useEffect(()=>{
   if(downloadUrl){URL.revokeObjectURL(downloadUrl);setDownloadUrl('');}
   setFrameQuality([]);setFidelityReport(null);
 },[preset,size,fps,duration]);
 function setPlayback(next:number){
   setPlaying(false);playbackTime.current=next;setPosition(next);
   const canvas=canvasRef.current,ctx=canvas?.getContext('2d',{alpha:false});
   if(canvas&&ctx)drawMotionFrame(ctx,{preset,time:next,duration,width:canvas.width,height:canvas.height});
 }
 async function exportVideo(){
   if(working)return;
   const name='nexora-motion-'+preset+'-'+size+'.mp4';
   let picker:Promise<unknown>|null=null;
   try{if(saveMode==='stream')picker=beginMp4FilePick(name);}
   catch(error){setStatus(error instanceof Error?error.message:'Streaming picker unavailable.');return;}
   setWorking(true);setProgress(0);setFrameQuality([]);setFidelityReport(null);
   setStatus('Mempersiapkan animasi...');
   if(downloadUrl){URL.revokeObjectURL(downloadUrl);setDownloadUrl('');}
   const signal=new AbortController();controller.current=signal;
   let checkedFrames=0;
   try{
     const fileHandle=picker?await picker:null;
     const output=await encodeMotionMp4({preset,size,fps,duration},{
       fileHandle,signal:signal.signal,
       onQuality:(result:{frames:{frame:number;meanError:number;severeFraction:number}[]})=>{checkedFrames=result.frames.length;setFrameQuality(result.frames);},
       onReport:(report:Record<string,unknown>)=>setFidelityReport(report),
       onProgress:(value:number)=>{setProgress(value);setStatus(value>=1?'Memeriksa kualitas...':'Memproses video... '+Math.round(value*100)+'%');}
     });
     if(signal.signal.aborted)throw new ExportCancelled();
     const url=URL.createObjectURL(output);
     setDownloadUrl(url);
     setStatus('Video berhasil dibuat. '+checkedFrames+' titik kualitas diperiksa · '+(output.size/1024/1024).toFixed(2)+' MB');
     // A streamed MP4 was already committed after verification. Do not initiate
     // a second download by accident, especially on low-memory Android.
     if(!fileHandle)downloadBlob(url,name);
   }catch(e){
     setStatus(e instanceof Error&&e.name==='AbortError'?'File selection cancelled.':
       e instanceof ExportCancelled?'Pembuatan video dibatalkan. File sebagian tidak disimpan.':e instanceof Error?e.message:'Pembuatan video gagal.');
   }finally{if(controller.current===signal)controller.current=null;setWorking(false);}
 }
 return <main className="container workspace video-workspace">
   <div className="workspace-title">
     <div><button className="back" onClick={onBack}>← Semua alat</button><h1>Canvas Motion Video</h1><p>Pilih animasi, lihat pratinjau, lalu buat MP4 8 detik.</p></div>
   </div>
   <div className="video-grid">
     <section className="panel video-controls">
       <div className="panel-head"><b>PENGATURAN VIDEO</b><span>8 DETIK</span></div>
       <div className="video-fields">
         <label htmlFor="video-preset">Animasi
           <select id="video-preset" disabled={working} value={preset} onChange={e=>setPreset(e.target.value as PresetKey)}>
             {VIDEO_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}
           </select>
         </label>
         <label htmlFor="video-size">Ukuran Video
           <select id="video-size" disabled={working} value={size} onChange={e=>{
             const next=e.target.value as SizeKey;setSize(next);
             const dims=VIDEO_SIZES[next];
             const nextPolicy=assessEightSecondExport({width:dims.width,height:dims.height,fps,
               streamAvailable:canStream,memoryGb:deviceMemoryGb(),finePointer:window.matchMedia('(pointer:fine)').matches});
             if(nextPolicy.supported)setSaveMode(nextPolicy.mode as 'download'|'stream');
           }}>
             {Object.entries(VIDEO_SIZES).map(([key,s])=><option value={key} key={key}>{s.label} · {s.width}×{s.height}</option>)}
           </select>
         </label>
         <div className="duration-card"><span>Durasi</span><strong>{UNIVERSAL_EXPORT_DURATION} Detik</strong><small>{fps} FPS</small></div>
         <select id="video-duration" className="engine-duration-compat" aria-hidden="true" tabIndex={-1}
           value={duration} disabled={working} onChange={e=>setDuration(Number(e.target.value))}>
           {[1,2,3,4,5,6,8,10,12].map(n=><option key={n} value={n}>{n}</option>)}
         </select>
         {configurationProblem&&<div className="compatibility-choice" role="alert"><span>{configurationProblem}</span><button onClick={()=>{setSize('compact');setSaveMode('download');setFps(STANDARD_EXPORT_FPS);}}>Gunakan 640×360</button></div>}
         <div className="simple-video-actions"><button className="secondary" disabled={working} onClick={()=>{playbackTime.current=0;setPosition(0);setPlaying(true);}}>Pratinjau</button><button aria-label="Export MP4 / Buat Video" disabled={working||codecOk!==true||Boolean(configurationProblem)} className="primary video-export" onClick={()=>void exportVideo()}>{working?'Memproses…':'Buat Video'}</button></div>
         {working&&<><progress className="encode-progress" aria-label="Progres pembuatan MP4" value={progress} max={1}/><button className="cancel-export" aria-label="Cancel export / Batalkan" onClick={()=>controller.current?.abort()}>Batalkan</button></>}
         {downloadUrl&&<a className="video-download primary-download" aria-label="Download MP4 again / Unduh Video" href={downloadUrl} download={'nexora-motion-'+preset+'-'+size+'.mp4'}>Unduh Video</a>}
         <p className="video-status" role="status" aria-live="polite">{status}</p>
         <details className="advanced-settings">
           <summary>Pengaturan Lanjutan</summary>
           <div className="advanced-grid">
             <label htmlFor="video-fps">FPS<select id="video-fps" value={fps} disabled={working} onChange={e=>setFps(Number(e.target.value))}>{[12,24,30].map(n=><option key={n} value={n}>{n} FPS</option>)}</select></label>
             <label htmlFor="video-save-mode">Penyimpanan<select id="video-save-mode" disabled={working} value={saveMode} onChange={e=>setSaveMode(e.target.value as 'download'|'stream')}><option value="download">Unduh biasa</option>{canStream&&<option value="stream">Streaming lokal</option>}</select></label>
           </div>
           <div className="video-plan"><span>FRAME</span><b>{fps*duration}</b><span>CODEC</span><b>H.264 / MP4</b><span>UKURAN</span><b>{previewDims.width} × {previewDims.height}</b></div>
           <span className="codec-badge" data-supported={String(codecOk)}>{codecOk===null?'Memeriksa encoder…':codecOk?'H.264 tersedia':'H.264 tidak tersedia'}</span>
           {frameQuality.length>0&&<div className="video-frame-checks">{frameQuality.map(item=><span key={item.frame}>Frame {item.frame}: RGB {item.meanError.toFixed(2)} · berat {(item.severeFraction*100).toFixed(2)}%</span>)}</div>}
           {fidelityReport&&<button className="secondary" onClick={()=>{const url=URL.createObjectURL(new Blob([JSON.stringify(fidelityReport,null,2)],{type:'application/json'}));downloadBlob(url,'nexora-canvas-fidelity-report.json');window.setTimeout(()=>URL.revokeObjectURL(url),3000);}}>Unduh laporan fidelitas</button>}
           <p className="video-disclaimer">Streaming memakai penyimpanan lokal sementara dan hasil hanya dipublikasikan setelah pemeriksaan kualitas lolos.</p>
         </details>
         <p className="video-disclaimer">MP4 tanpa audio. Seluruh proses berlangsung di perangkat ini.</p>
       </div>
     </section>
     <section className="panel video-preview-panel">
       <div className="panel-head"><b>PRATINJAU</b><span>CANVAS / LOKAL</span></div>
       <div className="video-preview-stage">
         <canvas ref={canvasRef} width={previewWidth} height={previewHeight} aria-label="Canvas video preview" role="img"/>
       </div>
       <details className="advanced-settings preview-advanced"><summary>Kontrol Timeline</summary><div className="video-timeline">
         <div className="timeline-head"><b>FRAME TIMELINE</b><span>{position.toFixed(1)} / {duration.toFixed(1)} s</span></div>
         <input type="range" aria-label="Scrub video timeline" min={0} max={duration} step={1/fps} value={position} disabled={working} onChange={e=>setPlayback(Number(e.target.value))}/>
         <div className="timeline-actions"><button disabled={working} onClick={()=>{if(!playing){playbackTime.current=position;}setPlaying(p=>!p);}}>{playing?'Ⅱ Pause':'▶ Play'}</button><span>{VIDEO_PRESETS.find(p=>p.id===preset)?.description}</span></div>
       </div></details>
     </section>
   </div>
 </main>;
}

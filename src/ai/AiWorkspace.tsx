import React,{useEffect,useRef,useState} from 'react';
import {SCENE_PALETTES,SCENE_TEMPLATES,SCENE_ENERGIES,localSceneFromPrompt,validateScene,validatePrompt} from './scene.js';
import {drawAiScene} from './render.js';
import {VIDEO_SIZES} from '../video/timeline.js';
import {canEncodeAvc,encodeMotionMp4,ExportCancelled} from '../video/encoder.js';

type Props={onBack:()=>void};
type SizeKey=keyof typeof VIDEO_SIZES;
type Scene=ReturnType<typeof validateScene>;
const IDEAS=['Futuristic glowing purple tech introduction','Calm blue ocean waves for a meditation reel','Vibrant kinetic geometry for a product launch'];
const FORMATS=['compact','landscape','portrait','square'] as const;
function downloadLink(href:string,name:string){
 const a=document.createElement('a');a.href=href;a.download=name;document.body.appendChild(a);a.click();a.remove();
}
export default function AiWorkspace({onBack}:Props){
 const [prompt,setPrompt]=useState(IDEAS[0]);
 const [scene,setScene]=useState<Scene>(()=>localSceneFromPrompt(IDEAS[0]));
 const [mode,setMode]=useState<'sample'|'local'|'gemini'>('sample');
 const [apiReady,setApiReady]=useState<boolean|null>(null);
 const [thinking,setThinking]=useState(false);
 const [message,setMessage]=useState('Start with a local draft, or use real AI after the secure server is configured.');
 const [size,setSize]=useState<SizeKey>('compact');
 const [fps,setFps]=useState(24);
 const [duration,setDuration]=useState(4);
 const [playing,setPlaying]=useState(true);
 const [playhead,setPlayhead]=useState(0);
 const [codecOk,setCodecOk]=useState<boolean|null>(null);
 const [rendering,setRendering]=useState(false);
 const [progress,setProgress]=useState(0);
 const [downloadUrl,setDownloadUrl]=useState('');
 const canvasRef=useRef<HTMLCanvasElement|null>(null);
 const abortRef=useRef<AbortController|null>(null);
 const clock=useRef(0);
 const dims=VIDEO_SIZES[size];
 const previewWidth=dims.width>dims.height?480:dims.width===dims.height?360:230;
 const previewHeight=Math.round(previewWidth*dims.height/dims.width);

 useEffect(()=>{
   const stop=new AbortController();
   fetch('/api/generate-motion',{method:'GET',headers:{Accept:'application/json'},signal:stop.signal})
     .then(async r=>r.ok?await r.json():null)
     .then(d=>setApiReady(d?.ok===true&&d?.ready===true))
     .catch(()=>{if(!stop.signal.aborted)setApiReady(false);});
   return()=>stop.abort();
 },[]);
 useEffect(()=>{
   let alive=true;setCodecOk(null);
   canEncodeAvc(dims.width,dims.height,fps).then(ok=>{if(alive)setCodecOk(ok);});
   return()=>{alive=false;};
 },[dims.width,dims.height,fps]);
 useEffect(()=>{
   if(downloadUrl){URL.revokeObjectURL(downloadUrl);setDownloadUrl('');}
 // Every editable scene change invalidates the previous video download, so metadata cannot go stale.
 },[scene,size,fps,duration]);
 useEffect(()=>()=>{abortRef.current?.abort();if(downloadUrl)URL.revokeObjectURL(downloadUrl);},[downloadUrl]);
 useEffect(()=>{
   clock.current=0;setPlayhead(0);
 },[scene.template,size,duration]);

 useEffect(()=>{
   const canvas=canvasRef.current,ctx=canvas?.getContext('2d',{alpha:false});
   if(!canvas||!ctx)return;
   const start=performance.now()-clock.current*1000;
   let raf=0,lastEmit=0;
   const frame=(t:number)=>drawAiScene(ctx,{scene,time:t,duration,width:canvas.width,height:canvas.height});
   frame(clock.current);
   if(playing){
     const tick=(now:number)=>{
       clock.current=((now-start)/1000)%duration;
       frame(clock.current);
       if(now-lastEmit>130){lastEmit=now;setPlayhead(clock.current);}
       raf=requestAnimationFrame(tick);
     };
     raf=requestAnimationFrame(tick);
   }
   return()=>cancelAnimationFrame(raf);
 },[scene,playing,size,duration,previewWidth,previewHeight]);

 function editScene(patch:Partial<Scene>){
   setScene(current=>({...current,...patch}));
 }
 async function generate(useAi:boolean){
   let clean:string;
   try{clean=validatePrompt(prompt);}
   catch(e){setMessage(e instanceof Error?e.message:'Invalid prompt.');return;}
   if(!useAi){
     setScene(localSceneFromPrompt(clean));setMode('local');
     setMessage('Local Draft ready. This is a deterministic offline composition, NOT an AI response.');
     return;
   }
   if(apiReady!==true){setMessage('Real AI is unavailable. Configure server-side AI and rate limits; Local Draft works now.');return;}
   setThinking(true);setMessage('Requesting an AI-generated scene description from the secure server…');
   const signal=new AbortController();abortRef.current=signal;
   try{
     const r=await fetch('/api/generate-motion',{
       method:'POST',
       headers:{'Content-Type':'application/json',Accept:'application/json'},
       body:JSON.stringify({prompt:clean}),
       signal:signal.signal
     });
     const json=await r.json();
     if(!r.ok||json?.ok!==true||json?.mode!=='gemini')throw new Error(typeof json?.error==='string'?json.error:'AI request failed.');
     const safe=validateScene(json.scene);
     setScene(safe);setMode('gemini');
     setMessage('Genuine server AI composition received and validated. Edit it, preview it, then render it locally.');
   }catch(e){if(!signal.signal.aborted)setMessage(e instanceof Error?e.message:'AI request failed. Local Draft remains available.');}
   finally{if(abortRef.current===signal)abortRef.current=null;setThinking(false);}
 }
 function seek(value:number){
   setPlaying(false);clock.current=value;setPlayhead(value);
   const canvas=canvasRef.current,ctx=canvas?.getContext('2d',{alpha:false});
   if(canvas&&ctx)drawAiScene(ctx,{scene,time:value,duration,width:canvas.width,height:canvas.height});
 }
 async function exportScene(){
   if(rendering)return;
   const signal=new AbortController();abortRef.current=signal;
   setRendering(true);setProgress(0);setMessage('Encoding validated storyboard into a silent MP4 locally…');
   try{
     const safe=validateScene(scene);
     const blob=await encodeMotionMp4({preset:safe.template,size,fps,duration,scene:safe},{
       signal:signal.signal,
       onProgress:(n:number)=>{setProgress(n);setMessage('Encoding MP4 locally: '+Math.round(n*100)+'%');}
     });
     if(signal.signal.aborted)throw new ExportCancelled();
     const url=URL.createObjectURL(blob);
     setDownloadUrl(url);
     setMessage('Rendered silent MP4 ready. '+(blob.size/1024).toFixed(1)+' KB; no video uploaded.');
     downloadLink(url,'nexora-scene-'+safe.template+'.mp4');
   }catch(e){setMessage(e instanceof ExportCancelled?'Export cancelled; no partial file saved.':e instanceof Error?e.message:'Video export failed.');}
   finally{if(abortRef.current===signal)abortRef.current=null;setRendering(false);}
 }
 function downloadScene(){
   try{
     const json=JSON.stringify(validateScene(scene),null,2);
     const href=URL.createObjectURL(new Blob([json],{type:'application/json'}));
     downloadLink(href,'nexora-motion-scene.json');
     window.setTimeout(()=>URL.revokeObjectURL(href),2000);
   }catch(e){setMessage(e instanceof Error?e.message:'Could not export scene JSON.');}
 }
 const isBusy=thinking||rendering;
 return <main className="container workspace ai-workspace">
   <div className="workspace-title">
     <div><button className="back" onClick={onBack}>← All tools</button><h1>AI Motion Generator</h1><p>Describe a scene, customize it, then export a real browser-rendered MP4.</p></div>
     <span className="ai-availability" data-ready={String(apiReady)}>{apiReady===null?'Checking AI…':apiReady?'SERVER AI READY':'LOCAL MODE · NO API'}</span>
   </div>
   <div className="ai-grid">
     <section className="panel ai-input">
       <div className="panel-head"><b>01 / CREATIVE BRIEF</b><span>IDEA → STORYBOARD</span></div>
       <div className="ai-fields">
         <label htmlFor="ai-prompt">Describe your animation</label>
         <textarea id="ai-prompt" value={prompt} disabled={isBusy} maxLength={500} onChange={e=>setPrompt(e.target.value)} placeholder="Describe colors, visual style, mood and text…" rows={4}/>
         <div className="ai-count">{prompt.length}/500</div>
         <div className="ai-examples">{IDEAS.map(item=><button key={item} disabled={isBusy} onClick={()=>setPrompt(item)}>{item}</button>)}</div>
         <div className="ai-modes">
           <button className="secondary" disabled={isBusy} onClick={()=>void generate(false)}>✳ Create local draft</button>
           <button className="primary" disabled={isBusy||apiReady!==true} onClick={()=>void generate(true)}>{thinking?'Generating…':'✦ Generate with AI'}</button>
         </div>
         <p className="ai-hint">{apiReady?'AI uses a protected server-side Gemini endpoint.':'Real AI requires server configuration and rate limiting. Local Draft works without keys.'}</p>
         <div className="ai-divider"></div>
         <div className="ai-edit-head"><b>02 / EDIT YOUR STORYBOARD</b><span className="ai-mode" data-mode={mode}>{mode==='gemini'?'GEMINI SCENE':mode==='local'?'LOCAL DRAFT':'SAMPLE'}</span></div>
         <label htmlFor="ai-title">Headline</label>
         <input id="ai-title" maxLength={38} disabled={rendering} value={scene.title} onChange={e=>editScene({title:e.target.value})}/>
         <label htmlFor="ai-subtitle">Supporting text</label>
         <input id="ai-subtitle" maxLength={90} disabled={rendering} value={scene.subtitle} onChange={e=>editScene({subtitle:e.target.value})}/>
         <div className="ai-half">
           <label htmlFor="ai-template">Animation type
             <select id="ai-template" value={scene.template} disabled={rendering} onChange={e=>editScene({template:e.target.value})}>
               {SCENE_TEMPLATES.map(id=><option value={id} key={id}>{id[0].toUpperCase()+id.slice(1)}</option>)}
             </select>
           </label>
           <label htmlFor="ai-energy">Energy
             <select id="ai-energy" value={scene.energy} disabled={rendering} onChange={e=>editScene({energy:e.target.value})}>
               {SCENE_ENERGIES.map(id=><option value={id} key={id}>{id[0].toUpperCase()+id.slice(1)}</option>)}
             </select>
           </label>
         </div>
         <span className="ai-label">COLOR THEMES</span>
         <div className="ai-palettes">{Object.entries(SCENE_PALETTES).map(([id,pal])=>
           <button key={id} aria-label={'Apply '+id+' theme'} disabled={rendering} title={id} onClick={()=>editScene({palette:pal})} style={{background:pal.primary,borderColor:scene.palette.primary===pal.primary?'#fff':'transparent'}}/>
         )}</div>
         <button className="ai-json" disabled={isBusy} onClick={downloadScene}>↓ Export editable scene JSON</button>
       </div>
     </section>
     <section className="panel ai-output">
       <div className="panel-head"><b>03 / MOTION PREVIEW</b><span>FRAME-DETERMINISTIC</span></div>
       <div className="video-preview-stage ai-preview-stage">
         <canvas aria-label="Generated scene preview" role="img" ref={canvasRef} width={previewWidth} height={previewHeight}/>
       </div>
       <div className="video-timeline">
         <div className="timeline-head"><b>FRAME TIMELINE</b><span>{playhead.toFixed(1)} / {duration} s</span></div>
         <input type="range" aria-label="Scrub generated scene" min={0} max={duration} step={1/fps} value={playhead} disabled={isBusy} onChange={e=>seek(Number(e.target.value))}/>
         <div className="timeline-actions"><button disabled={isBusy} onClick={()=>setPlaying(v=>!v)}>{playing?'Ⅱ Pause':'▶ Play'}</button><span>Frame-by-frame export uses the same visual scene as this preview.</span></div>
       </div>
       <div className="ai-export">
         <div className="ai-half">
           <label htmlFor="ai-size">Output format
             <select id="ai-size" disabled={isBusy} value={size} onChange={e=>setSize(e.target.value as SizeKey)}>
               {FORMATS.map(id=><option key={id} value={id}>{VIDEO_SIZES[id].label} · {VIDEO_SIZES[id].width}×{VIDEO_SIZES[id].height}</option>)}
             </select>
           </label>
           <label htmlFor="ai-fps">FPS
             <select id="ai-fps" disabled={isBusy} value={fps} onChange={e=>setFps(Number(e.target.value))}>
               {[12,24,30].map(v=><option key={v} value={v}>{v} FPS</option>)}
             </select>
           </label>
         </div>
         <label htmlFor="ai-duration">Duration
           <select id="ai-duration" disabled={isBusy} value={duration} onChange={e=>setDuration(Number(e.target.value))}>
             {[1,2,3,4,5,6,8,10,12].map(v=><option key={v} value={v}>{v} seconds</option>)}
           </select>
         </label>
         <span className="ai-codec">{codecOk===null?'Checking H.264 encoder…':codecOk?'H.264 READY / LOCAL MP4':'H.264 unsupported at selected format'}</span>
         <button className="primary ai-render" disabled={isBusy||codecOk!==true} onClick={()=>void exportScene()}>{rendering?'Rendering…':'↓ Render MP4'}</button>
         {rendering&&<><progress value={progress} max={1} aria-label="Storyboard encoding progress"/><button className="cancel-export" onClick={()=>abortRef.current?.abort()}>Cancel render</button></>}
         {downloadUrl&&<a className="video-download" download={'nexora-scene-'+scene.template+'.mp4'} href={downloadUrl}>Download rendered MP4 again ↗</a>}
         <p role="status" aria-live="polite" className="video-status">{message}</p>
         <p className="video-disclaimer">The real AI endpoint generates a validated design plan; all video encoding happens locally. The output is silent, not generative video footage.</p>
       </div>
     </section>
   </div>
 </main>;
}

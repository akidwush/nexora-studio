import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildPreviewDoc } from './lib/preview.js';
import { resolveStudioProUrl } from './lib/studio-pro-url.js';
import HtmlSandbox from './components/HtmlSandbox';
import HtmlVideoExport from './components/HtmlVideoExport';
import type {TimelineUpdate} from './components/HtmlSandbox';
import { pixelGridToSvg } from './lib/vector.js';
import { MOTION_PRESETS, getMotionPreset } from './lib/presets.js';
import { svgToPngBlob } from './lib/export.js';
import {frameTimestamp} from './lib/timeline-runtime.js';
import {assertDocumentSource,isCompleteHtml,DOCUMENT_LIMIT} from './lib/html-document.js';
const VideoWorkspace=React.lazy(()=>import('./video/VideoWorkspace'));
const AiWorkspace=React.lazy(()=>import('./ai/AiWorkspace'));
import './styles.css';

type Page = 'home' | 'motion' | 'image' | 'video' | 'ai';
type CodeKind = 'html' | 'css' | 'svg' | 'js';
type Ratio = '16:9' | '9:16' | '1:1';
const DEFAULT_HTML = '<main><div class="orb"></div><span class="eyebrow">NEXORA / MOTION STUDIO</span><h1>MAKE IDEAS<br><em>MOVE.</em></h1><p>Your canvas. Your code. Your motion.</p></main>';
const DEFAULT_CSS = 'main{box-sizing:border-box;min-height:100vh;background:radial-gradient(circle at 72% 25%,#493071,transparent 45%),#110d23;display:flex;flex-direction:column;justify-content:center;padding:9%;color:white;font-family:system-ui;overflow:hidden;position:relative}.eyebrow{font-size:12px;letter-spacing:4px;color:#b9a9ff;z-index:1}h1{font-size:clamp(36px,8vw,90px);line-height:1.05;letter-spacing:-.06em;z-index:1;margin:20px 0}em{font-style:normal;color:#b9a9ff}p{color:#c4b9dc;z-index:1}.orb{position:absolute;right:10%;top:12%;width:42vmin;height:42vmin;border-radius:32%;background:linear-gradient(135deg,#d7c4ff,#744be4 65%,#281650);box-shadow:0 25px 85px #744be483;animation:float 4s ease-in-out infinite}@keyframes float{50%{transform:translateY(-24px) rotate(25deg)}}';
const DEFAULT_JS = '// Custom JavaScript runs inside an isolated iframe.\nconsole.log("NEXORA Motion Lab ready");';
const SVG_EXAMPLE = '<svg id="motion-svg" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 320 200" width="100%" role="img" aria-label="Animated SVG demo"><style>.nx-spin{transform-origin:160px 100px;animation:nx-spin 4s linear infinite}@keyframes nx-spin{to{transform:rotate(360deg)}}</style><rect width="320" height="200" rx="30" fill="#1c1b3e"/><g class="nx-spin"><circle cx="160" cy="100" r="62" stroke="#bda2ff" stroke-width="5" fill="none"/><circle cx="222" cy="100" r="14" fill="#ffe3b3"/></g><text x="160" y="106" text-anchor="middle" fill="#fff" font-size="16">SVG MOTION</text></svg>';
function createSandboxSnapshot(input: {html?:string;css?:string;svg?:string;js?:string;document?:string},controlled=false) {
  const session=crypto.randomUUID();
  return {session,doc:buildPreviewDoc({...input,session,controlled})};
}

function download(name: string, value: string, type: string) {
  const url = URL.createObjectURL(new Blob([value], { type }));
  const a = document.createElement('a');
  a.href = url; a.download = name; a.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 2000);
}

function readPageFromLocation(): Page {
  const raw=new URLSearchParams(window.location.search).get('tool');
  return raw==='motion'||raw==='image'||raw==='video'||raw==='ai'?raw:'home';
}

function App() {
  const [page, setPage] = useState<Page>(()=>readPageFromLocation());
  const [sourceMode,setSourceMode]=useState<'tabs'|'document'>('tabs');
  const [documentSource,setDocumentSource]=useState('');
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [css, setCss] = useState(DEFAULT_CSS);
  const [js, setJs] = useState(DEFAULT_JS);
  const [svgCode, setSvgCode] = useState('');
  const [codeTab, setCodeTab] = useState<CodeKind>('html');
  const [presetId, setPresetId] = useState('custom');
  const [ratio, setRatio] = useState<Ratio>('16:9');
  const [preview, setPreview] = useState(() => createSandboxSnapshot({html:DEFAULT_HTML,css:DEFAULT_CSS,svg:'',js:DEFAULT_JS}));
  const [previewActive,setPreviewActive]=useState(true);
  const [previewIssue,setPreviewIssue]=useState('');
  const [clockEnabled,setClockEnabled]=useState(false);
  const [clockFps,setClockFps]=useState(30);
  const [clockDuration,setClockDuration]=useState(4);
  const [clockFrame,setClockFrame]=useState(0);
  const [clockStatus,setClockStatus]=useState<TimelineUpdate|null>(null);
  const [svg, setSvg] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [message, setMessage] = useState('Choose an image to generate vector mosaic artwork.');
  const studioUrl=resolveStudioProUrl(import.meta.env.VITE_STUDIO_PRO_URL,window.location.origin);
  const [mobilePreview, setMobilePreview] = useState(false);

  useEffect(()=>{
    const onPop=()=>{setPage(readPageFromLocation());setMobilePreview(false);window.scrollTo(0,0);};
    window.addEventListener('popstate',onPop);
    return()=>window.removeEventListener('popstate',onPop);
  },[]);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  function navigate(next: Page) {
    if(next===page)return;
    const nextUrl=new URL(window.location.href);
    if(next==='home')nextUrl.searchParams.delete('tool');
    else nextUrl.searchParams.set('tool',next);
    window.history.pushState({nexoraTool:next},'',nextUrl.pathname+nextUrl.search+nextUrl.hash);
    setPage(next);setMobilePreview(false);window.scrollTo(0,0);
  }
  const selectedScene=()=>sourceMode==='document'?{document:assertDocumentSource(documentSource)}:
    {html,css,svg:svgCode,js};
  function runPreview() {
    try{
      const next=createSandboxSnapshot(selectedScene(),clockEnabled);
      setClockFrame(0);setClockStatus(null);
      setPreview(next);setPreviewActive(true);setPreviewIssue('');setMobilePreview(true);
    }catch(error){setPreviewActive(false);setMobilePreview(true);setPreviewIssue(error instanceof Error?error.message:'Preview could not start.');}
  }
  function enableClock(enabled:boolean){
    try{
      const next=createSandboxSnapshot(selectedScene(),enabled);
      setClockEnabled(enabled);setClockFrame(0);setClockStatus(null);
      setPreview(next);setPreviewActive(true);setPreviewIssue('');setMobilePreview(true);
    }catch(error){setPreviewIssue(error instanceof Error?error.message:'Timeline initialization failed.');}
  }
  function changeClockFps(next:number){
    try{
      const snapshot=createSandboxSnapshot(selectedScene(),clockEnabled);
      setClockFps(next);setClockFrame(0);setClockStatus(null);
      if(clockEnabled){setPreview(snapshot);setPreviewActive(true);}
    }catch(error){setPreviewIssue(error instanceof Error?error.message:'Timeline reconfiguration failed.');}
  }
  function exportHtml(){
    try{
      if(sourceMode==='document')download('nexora-full-motion.html',assertDocumentSource(documentSource),'text/html');
      else download('nexora-motion.html',buildPreviewDoc({html,css,svg:svgCode,js}),'text/html');
      setPreviewIssue('');
    }catch(error){setPreviewIssue(error instanceof Error?error.message:'HTML export failed.');}
  }
  function selectPreset(id: string) {
    const preset = getMotionPreset(id);
    if (!preset) { setPresetId('custom'); return; }
    setSourceMode('tabs');setPresetId(id);
    setHtml(preset.html); setCss(preset.css); setJs(preset.js);setSvgCode('');
    setPreview(createSandboxSnapshot({html:preset.html,css:preset.css,svg:'',js:preset.js},clockEnabled));
    setClockFrame(0);setClockStatus(null);
    setPreviewActive(true);setPreviewIssue('');setMobilePreview(true);
  }
  async function downloadPng() {
    if (!svg) return;
    try {
      const blob = await svgToPngBlob(svg) as Blob;
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href=url; a.download='nexora-mosaic.png'; a.click();
      window.setTimeout(()=>URL.revokeObjectURL(url),2000);
      setMessage('PNG downloaded. All processing stayed in your browser.');
    } catch { setMessage('PNG render failed. SVG download is still available.'); }
  }
  const code = codeTab==='html'?html:codeTab==='css'?css:codeTab==='svg'?svgCode:js;
  const updateCode = codeTab==='html'?setHtml:codeTab==='css'?setCss:codeTab==='svg'?setSvgCode:setJs;
  const codeLimit = codeTab==='html'||codeTab==='svg'?200000:100000;
  async function uploadFullHtml(file?:File){
    if(!file)return;
    if(file.size>DOCUMENT_LIMIT){setPreviewIssue('Full HTML file exceeds 200 KB.');return;}
    try{
      const source=assertDocumentSource(await file.text());
      setDocumentSource(source);setSourceMode('document');setPresetId('custom');
      setPreviewActive(false);setClockFrame(0);setClockStatus(null);
      setPreviewIssue('Complete HTML loaded. Click Run preview; export uses the same source.');
      setMobilePreview(false);
    }catch(error){setPreviewIssue(error instanceof Error?error.message:'Invalid HTML file.');}
  }

  async function makeMosaic(file?: File) {
    if (!file) return;
    if (!['image/png','image/jpeg','image/webp'].includes(file.type) || file.size > 15*1024*1024) {
      setMessage('Please select a PNG, JPG, or WebP under 15 MB.'); return;
    }
    try {
      const bitmap = await createImageBitmap(file);
      const width = Math.max(1, Math.round(56*bitmap.width/Math.max(bitmap.width,bitmap.height)));
      const height = Math.max(1, Math.round(56*bitmap.height/Math.max(bitmap.width,bitmap.height)));
      const canvas = document.createElement('canvas');
      canvas.width=width;canvas.height=height;
      const ctx = canvas.getContext('2d',{willReadFrequently:true});
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(bitmap,0,0,width,height);
      const generated = pixelGridToSvg(ctx.getImageData(0,0,width,height),bitmap.width,bitmap.height);
      bitmap.close();
      setSvg(generated);
      setImageUrl(URL.createObjectURL(file));
      setMessage('SVG generated from a sampled pixel grid. No image was uploaded.');
    } catch {
      setMessage('Image conversion failed. Try a smaller or different picture.');
    }
  }

  return <div className="shell">
    <header className="header">
      <button className="brand" onClick={() => navigate('home')} aria-label="NEXORA Studio home">
        <span className="logo">N<span>✦</span></span><span>NEXORA <b>STUDIO</b></span>
      </button>
      <nav className="navigation" aria-label="Tools navigation">
        <button className={page==='home'?'active':''} onClick={() => navigate('home')}>Explore</button>
        <button className={page==='motion'?'active':''} onClick={() => navigate('motion')}>Motion Lab</button>
        <button className={page==='image'?'active':''} onClick={() => navigate('image')}>Image Tools</button>
        <button className={page==='video'?'active':''} onClick={() => navigate('video')}>Video Lab</button>
      </nav>
      <span className="version">CREATIVE SUITE / BETA</span>
    </header>

    {page==='home' && <main className="container">
      <section className="hero">
        <div className="hero-text">
          <div className="eyebrow"><span className="dot"></span> THE NEW CREATIVE WORKSPACE</div>
          <h1>Creativity<br/>without <em>limits.</em></h1>
          <p>Code, animate, design and experiment. One focused workspace for makers who love to create.</p>
          <div className="buttons"><button className="primary" onClick={() => navigate('motion')}>Launch Motion Lab <span>↗</span></button><button className="secondary" onClick={() => document.getElementById('tools')?.scrollIntoView({behavior:'smooth'})}>Explore tools ↓</button></div>
          <small>LOCAL-FIRST CREATION &nbsp; · &nbsp; BUILT FOR THE BROWSER</small>
        </div>
        <div className="hero-art" aria-hidden="true"><div className="ring one"></div><div className="ring two"></div><div className="art-core">✳</div><span>IDEAS → OUTPUT</span></div>
      </section>
      <div id="tools" className="section-title"><div><span className="eyebrow">DISCOVER THE WORKSPACE</span><h2>Tools made to create.</h2></div><span>01 — 05 / CREATIVE TOOLS</span></div>
      <div className="cards">
        <article className="tool violet"><div className="tool-top"><span className="tool-icon">&lt;/&gt;</span><span>01</span></div><div><small>AVAILABLE NOW</small><h3>HTML Motion Lab</h3><p>Run HTML, CSS, SVG and JavaScript in an opaque-origin sandbox. Four motion presets included.</p></div><button onClick={() => navigate('motion')}>Open workspace <span>↗</span></button></article>
        <article className="tool blue"><div className="tool-top"><span className="tool-icon">▦</span><span>02</span></div><div><small>AVAILABLE NOW</small><h3>Image to Vector Mosaic</h3><p>Turn a local image into colorful SVG pixel-vector artwork without server uploads.</p></div><button onClick={() => navigate('image')}>Open workspace <span>↗</span></button></article>
        <article className="tool magenta"><div className="tool-top"><span className="tool-icon">◉</span><span>03</span></div><div><small>AVAILABLE NOW</small><h3>Canvas Motion Video</h3><p>Render real frame-accurate, silent MP4 videos directly in your browser. Three motion presets included.</p></div><button onClick={() => navigate('video')}>Open video renderer <span>↗</span></button></article>
        <article className="tool amber"><div className="tool-top"><span className="tool-icon">▶</span><span>04</span></div><div><small>OPTIONAL MODULE</small><h3>Studio Pro Editor</h3><p>Multi-track timeline and video export, deployed on an independent HTTPS site. Never runs with dashboard login access.</p></div>{studioUrl?<a className="tool-link" href={studioUrl} target="_blank" rel="noopener noreferrer">Open isolated workspace <span>↗</span></a>:<span className="disabled">Unavailable: dedicated HTTPS origin not configured</span>}</article>
        <article className="tool emerald"><div className="tool-top"><span className="tool-icon">✦</span><span>05</span></div><div><small>LOCAL NOW · AI OPTIONAL</small><h3>AI Motion Generator</h3><p>Turn your ideas into editable motion storyboards. Local drafts work offline; server AI needs secure setup.</p></div><button onClick={() => navigate("ai")}>Open creative generator <span>↗</span></button></article>
      </div>
    </main>}

    {page==='motion' && <main className="container workspace">
      <div className="workspace-title"><div><button className="back" onClick={() => navigate('home')}>← All tools</button><h1>HTML Motion Lab</h1><p>Four-tab motion or a complete HTML file · isolated preview · local MP4.</p></div><div className="buttons"><button className="secondary" onClick={exportHtml}>↓ Export HTML</button><button className="primary" onClick={runPreview}>▶ Run preview</button><button className="secondary" onClick={()=>{setPreviewActive(false);setPreviewIssue('');setMobilePreview(true);}}>■ Stop preview</button></div></div>
      <div className="editor">
        <section className={'panel code-panel'+(mobilePreview?' mobile-hidden':'')}>
          <div className="panel-head"><b>CODE EDITOR</b><span>ISOLATED</span></div>
          <div className="full-doc-mode" role="group" aria-label="HTML source mode">
            <button className={sourceMode==='tabs'?'active':''} onClick={()=>{
              setSourceMode('tabs');setPreviewActive(false);setPreviewIssue('Press Run preview to load the four-tab source.');
            }}>Four tabs</button>
            <button className={sourceMode==='document'?'active':''} onClick={()=>{
              setSourceMode('document');setPreviewActive(false);
              setPreviewIssue('Paste a complete .html document or upload your file, then Run preview.');
            }}>Full HTML file · WebGL</button>
          </div>
          {sourceMode==='tabs'?
            <>
              <div className="preset-bar"><label htmlFor="motion-preset">MOTION PRESET</label><select id="motion-preset" value={presetId} onChange={e=>selectPreset(e.target.value)}><option value="custom">Custom code</option>{MOTION_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
              <div className="tabs">{(['html','css','svg','js'] as CodeKind[]).map(t=><button key={t} className={codeTab===t?'active':''} onClick={() => setCodeTab(t)}>{t.toUpperCase()}</button>)}</div>
              {codeTab==='svg'&&<div className="svg-insert"><button onClick={()=>{setSvgCode(SVG_EXAMPLE);setPresetId('custom');}}>Insert animated SVG example</button></div>}
              <textarea spellCheck={false} maxLength={codeLimit} value={code} onChange={e => {
                const next=e.target.value;
                // Paste the user's complete .html in the existing HTML tab and
                // seamlessly switch to the correct ONE-FILE/ESM/WebGL engine.
                if(codeTab==='html'&&isCompleteHtml(next)&&next.trimEnd().toLowerCase().endsWith('</html>')){
                  setDocumentSource(next);setSourceMode('document');setPreviewActive(false);
                  setPreviewIssue('Complete HTML detected. Press Run preview to render the whole document.');
                }else{updateCode(next);setPresetId('custom');}
              }} aria-label={codeTab.toUpperCase()+' code editor'}/>
              <p className="panel-note">Four-tab code runs without remote resources. Pasting a complete &lt;html&gt;...&lt;/html&gt; file in the HTML tab automatically switches to the one-file renderer.</p>
            </>:
            <>
              <div className="full-doc-upload">
                <label>↑ Import complete .html file
                  <input type="file" accept=".html,.htm,text/html" aria-label="Import complete HTML file"
                    onChange={e=>{void uploadFullHtml(e.target.files?.[0]);e.target.value='';}}/>
                </label>
                <span>HTML + CSS + importmap + module JS in ONE file</span>
              </div>
              <textarea spellCheck={false} maxLength={DOCUMENT_LIMIT} value={documentSource}
                onChange={e=>setDocumentSource(e.target.value)}
                placeholder={'<!doctype html>\n<html>\n<head>...\n<body>...\n</html>'}
                aria-label="Full HTML document code editor"/>
              <p className="panel-note">Experimental full HTML + WebGL: Three.js 0.172 modules are normalized to a pinned CDN (internet required). Source executes only in an opaque sandbox. Use a smaller L-system iteration count for mobile.</p>
            </>
          }

        </section>
        <section className={'panel preview-panel'+(!mobilePreview?' preview-mobile-hidden':'')}>
          <div className="panel-head"><b>PREVIEW</b><div className="ratios">{(['16:9','9:16','1:1'] as Ratio[]).map(r=><button key={r} className={r===ratio?'active':''} onClick={() => setRatio(r)}>{r}</button>)}</div></div>
          <HtmlSandbox preview={preview} active={previewActive} ratio={ratio}
            timeline={{enabled:clockEnabled,frame:clockFrame,fps:clockFps,onUpdate:setClockStatus}}/>
          <HtmlVideoExport source={sourceMode==='document'?{document:documentSource}:{html,css,svg:svgCode,js}}/>
          <div className="frame-clock-controls">
            <div className="frame-clock-header">
              <strong>DETERMINISTIC TIMELINE</strong>
              <button
                className={clockEnabled?'enabled':''}
                aria-label={clockEnabled?'Disable deterministic timeline':'Enable deterministic timeline'}
                aria-pressed={clockEnabled}
                onClick={()=>enableClock(!clockEnabled)}>
                {clockEnabled?'✓ Frame clock enabled':'Enable frame clock'}
              </button>
            </div>
            {clockEnabled&&<>
              <div className="frame-clock-config">
                <label htmlFor="motion-clock-fps">Frame rate
                  <select id="motion-clock-fps" value={clockFps} onChange={event=>changeClockFps(Number(event.target.value))}>
                    {[12,24,30,60].map(n=><option key={n} value={n}>{n} FPS</option>)}
                  </select>
                </label>
                <label htmlFor="motion-clock-duration">Timeline length
                  <select id="motion-clock-duration" value={clockDuration} onChange={event=>{
                    const next=Number(event.target.value);
                    setClockDuration(next);
                    setClockFrame(old=>Math.min(old,clockFps*next-1));
                  }}>
                    {[1,2,3,4,5,8,10,12].map(n=><option key={n} value={n}>{n} seconds</option>)}
                  </select>
                </label>
              </div>
              <div className="frame-clock-readout">
                <span>FRAME <b data-testid="requested-frame">{clockFrame}</b> / {clockFps*clockDuration-1}</span>
                <span>TIME <b data-testid="requested-time">{frameTimestamp(clockFrame,clockFps).toFixed(3)} ms</b></span>
              </div>
              <input type="range" aria-label="Select exact HTML animation frame"
                min={0} max={clockFps*clockDuration-1} step={1} value={clockFrame}
                onChange={event=>setClockFrame(Number(event.target.value))}/>
              <div className="frame-clock-actions">
                <button onClick={()=>setClockFrame(0)} disabled={clockFrame===0}>⏮ Frame 0</button>
                <button onClick={()=>setClockFrame(n=>Math.max(0,n-1))} disabled={clockFrame===0}>← Previous</button>
                <button onClick={()=>setClockFrame(n=>Math.min(clockFps*clockDuration-1,n+1))} disabled={clockFrame===clockFps*clockDuration-1}>Next →</button>
              </div>
              <p className="frame-clock-status" role="status" data-state={clockStatus?.state||'loading'}>
                {clockStatus?.state==='ready'&&clockStatus.frame===clockFrame?
                  'FRAME READY · '+clockStatus.ms.toFixed(3)+' ms':
                  clockStatus?.state==='error'?'CLOCK ERROR · '+clockStatus.message:
                  clockStatus?.state==='loading'?(clockStatus.message||'Reloading clock…'):
                  'Seeking frame '+clockFrame+'…'}
              </p>
              <p className="frame-clock-note">Exact frame replay for supported CSS, JavaScript and WebGL canvas; heavy shaders may render slowly. Rewind reloads the isolated frame.</p>
            </>}
          </div>
          {previewIssue&&<p className="sandbox-issue" role="alert">{previewIssue}</p>}
          <p className="panel-note">Sandboxed preview and locally encoded MP4 are separate. Exported standalone HTML remains untrusted code.</p>
        </section>
      </div><div className="mobile-toggle"><button onClick={() => setMobilePreview(false)}>Edit code</button><button onClick={runPreview}>Preview ↗</button></div>
    </main>}

    {page==='video' && <React.Suspense fallback={<main className="container workspace" aria-live="polite">Loading local video renderer…</main>}><VideoWorkspace onBack={()=>navigate('home')} /></React.Suspense>}
    {page==='ai' && <React.Suspense fallback={<main className="container workspace" aria-live="polite">Loading creative generator…</main>}><AiWorkspace onBack={()=>navigate('home')} /></React.Suspense>}

    {page==='image' && <main className="container workspace">
      <div className="workspace-title"><div><button className="back" onClick={() => navigate('home')}>← All tools</button><h1>Image to Vector Mosaic</h1><p>Offline sampled SVG conversion. True contour tracing is planned separately.</p></div>{svg && <div className="buttons"><button className="secondary" onClick={() => download('nexora-mosaic.svg',svg,'image/svg+xml')}>↓ Download SVG</button><button className="primary" onClick={() => void downloadPng()}>↓ Download PNG</button></div>}</div>
      <div className="editor">
        <section className="panel upload-panel"><div className="panel-head"><b>SOURCE IMAGE</b><span>LOCAL ONLY</span></div><label className="upload"><span>↑</span><b>Select an image</b><small>PNG · JPEG · WEBP / MAX 15 MB</small><input type="file" accept="image/png,image/jpeg,image/webp" onChange={e => void makeMosaic(e.target.files?.[0])}/></label>{imageUrl && <img className="original" src={imageUrl} alt="Source uploaded from your device"/>}<p className="panel-note">{message}</p></section>
        <section className="panel"><div className="panel-head"><b>VECTOR OUTPUT</b><span>SVG</span></div><div className="result">{svg?<img src={'data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg)} alt="Vector mosaic preview"/>:<div className="placeholder">▦<p>Your vector artwork will appear here.</p></div>}</div><p className="panel-note">Each pixel sample becomes an editable SVG rectangle. This is not an AI reconstruction.</p></section>
      </div>
    </main>}
    <footer><span>NEXORA STUDIO © 2026</span><span>BUILD, NOT BLOAT.</span></footer>
  </div>;
}
createRoot(document.getElementById('root')!).render(<React.StrictMode><App/></React.StrictMode>);

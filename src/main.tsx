import React, { useEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';
import { buildPreviewDoc } from './lib/preview.js';
import { pixelGridToSvg } from './lib/vector.js';
import { MOTION_PRESETS, getMotionPreset } from './lib/presets.js';
import { svgToPngBlob } from './lib/export.js';
const VideoWorkspace=React.lazy(()=>import('./video/VideoWorkspace'));
const AiWorkspace=React.lazy(()=>import('./ai/AiWorkspace'));
import './styles.css';

type Page = 'home' | 'motion' | 'image' | 'video' | 'ai';
type CodeKind = 'html' | 'css' | 'js';
type Ratio = '16:9' | '9:16' | '1:1';
const DEFAULT_HTML = '<main><div class="orb"></div><span class="eyebrow">NEXORA / MOTION STUDIO</span><h1>MAKE IDEAS<br><em>MOVE.</em></h1><p>Your canvas. Your code. Your motion.</p></main>';
const DEFAULT_CSS = 'main{box-sizing:border-box;min-height:100vh;background:radial-gradient(circle at 72% 25%,#493071,transparent 45%),#110d23;display:flex;flex-direction:column;justify-content:center;padding:9%;color:white;font-family:system-ui;overflow:hidden;position:relative}.eyebrow{font-size:12px;letter-spacing:4px;color:#b9a9ff;z-index:1}h1{font-size:clamp(36px,8vw,90px);line-height:1.05;letter-spacing:-.06em;z-index:1;margin:20px 0}em{font-style:normal;color:#b9a9ff}p{color:#c4b9dc;z-index:1}.orb{position:absolute;right:10%;top:12%;width:42vmin;height:42vmin;border-radius:32%;background:linear-gradient(135deg,#d7c4ff,#744be4 65%,#281650);box-shadow:0 25px 85px #744be483;animation:float 4s ease-in-out infinite}@keyframes float{50%{transform:translateY(-24px) rotate(25deg)}}';
const DEFAULT_JS = '// Custom JavaScript runs inside an isolated iframe.\nconsole.log("NEXORA Motion Lab ready");';

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
  const [html, setHtml] = useState(DEFAULT_HTML);
  const [css, setCss] = useState(DEFAULT_CSS);
  const [js, setJs] = useState(DEFAULT_JS);
  const [codeTab, setCodeTab] = useState<CodeKind>('html');
  const [presetId, setPresetId] = useState('custom');
  const [ratio, setRatio] = useState<Ratio>('16:9');
  const [preview, setPreview] = useState(() => buildPreviewDoc({html: DEFAULT_HTML, css: DEFAULT_CSS, js: DEFAULT_JS}));
  const [svg, setSvg] = useState('');
  const [imageUrl, setImageUrl] = useState('');
  const [message, setMessage] = useState('Choose an image to generate vector mosaic artwork.');
  const [studioReady, setStudioReady] = useState(false);
  const [mobilePreview, setMobilePreview] = useState(false);

  useEffect(()=>{
    const onPop=()=>{setPage(readPageFromLocation());setMobilePreview(false);window.scrollTo(0,0);};
    window.addEventListener('popstate',onPop);
    return()=>window.removeEventListener('popstate',onPop);
  },[]);

  useEffect(() => {
    fetch('/studio-pro/index.html', {cache: 'no-store'})
      .then(r => r.ok ? r.text() : '')
      .then(text => setStudioReady(text.includes('StudioPro') || text.includes('Studio Pro')))
      .catch(() => setStudioReady(false));
  }, []);

  useEffect(() => () => { if (imageUrl) URL.revokeObjectURL(imageUrl); }, [imageUrl]);

  function navigate(next: Page) {
    if(next===page)return;
    const nextUrl=new URL(window.location.href);
    if(next==='home')nextUrl.searchParams.delete('tool');
    else nextUrl.searchParams.set('tool',next);
    window.history.pushState({nexoraTool:next},'',nextUrl.pathname+nextUrl.search+nextUrl.hash);
    setPage(next);setMobilePreview(false);window.scrollTo(0,0);
  }
  function runPreview() { setPreview(buildPreviewDoc({html,css,js})); setMobilePreview(true); }
  function selectPreset(id: string) {
    const preset = getMotionPreset(id);
    if (!preset) { setPresetId('custom'); return; }
    setPresetId(id);
    setHtml(preset.html); setCss(preset.css); setJs(preset.js);
    setPreview(buildPreviewDoc(preset));
    setMobilePreview(true);
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
  const code = codeTab === 'html' ? html : codeTab === 'css' ? css : js;
  const updateCode = codeTab === 'html' ? setHtml : codeTab === 'css' ? setCss : setJs;

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
        <article className="tool violet"><div className="tool-top"><span className="tool-icon">&lt;/&gt;</span><span>01</span></div><div><small>AVAILABLE NOW</small><h3>HTML Motion Lab</h3><p>Write HTML, CSS and JavaScript. Start from four motion presets or create your own animation.</p></div><button onClick={() => navigate('motion')}>Open workspace <span>↗</span></button></article>
        <article className="tool blue"><div className="tool-top"><span className="tool-icon">▦</span><span>02</span></div><div><small>AVAILABLE NOW</small><h3>Image to Vector Mosaic</h3><p>Turn a local image into colorful SVG pixel-vector artwork without server uploads.</p></div><button onClick={() => navigate('image')}>Open workspace <span>↗</span></button></article>
        <article className="tool magenta"><div className="tool-top"><span className="tool-icon">◉</span><span>03</span></div><div><small>AVAILABLE NOW</small><h3>Canvas Motion Video</h3><p>Render real frame-accurate, silent MP4 videos directly in your browser. Three motion presets included.</p></div><button onClick={() => navigate('video')}>Open video renderer <span>↗</span></button></article>
        <article className="tool amber"><div className="tool-top"><span className="tool-icon">▶</span><span>04</span></div><div><small>OPTIONAL MODULE</small><h3>Studio Pro Editor</h3><p>Multi-track timeline and video export in a separately built, license-preserving editor.</p></div>{studioReady?<a className="tool-link" href="/studio-pro/">Open workspace <span>↗</span></a>:<span className="disabled">Requires optional build</span>}</article>
        <article className="tool emerald"><div className="tool-top"><span className="tool-icon">✦</span><span>05</span></div><div><small>LOCAL NOW · AI OPTIONAL</small><h3>AI Motion Generator</h3><p>Turn your ideas into editable motion storyboards. Local drafts work offline; server AI needs secure setup.</p></div><button onClick={() => navigate("ai")}>Open creative generator <span>↗</span></button></article>
      </div>
    </main>}

    {page==='motion' && <main className="container workspace">
      <div className="workspace-title"><div><button className="back" onClick={() => navigate('home')}>← All tools</button><h1>HTML Motion Lab</h1><p>Your code. Your preview. Entirely in the browser.</p></div><div className="buttons"><button className="secondary" onClick={() => download('nexora-motion.html',buildPreviewDoc({html,css,js}),'text/html')}>↓ Export HTML</button><button className="primary" onClick={runPreview}>▶ Run preview</button></div></div>
      <div className="editor">
        <section className={'panel code-panel'+(mobilePreview?' mobile-hidden':'')}>
          <div className="panel-head"><b>CODE EDITOR</b><span>ISOLATED</span></div>
          <div className="preset-bar"><label htmlFor="motion-preset">MOTION PRESET</label><select id="motion-preset" value={presetId} onChange={e=>selectPreset(e.target.value)}><option value="custom">Custom code</option>{MOTION_PRESETS.map(p=><option key={p.id} value={p.id}>{p.label}</option>)}</select></div>
          <div className="tabs">{(['html','css','js'] as CodeKind[]).map(t=><button key={t} className={codeTab===t?'active':''} onClick={() => setCodeTab(t)}>{t.toUpperCase()}</button>)}</div>
          <textarea spellCheck={false} value={code} onChange={e => {updateCode(e.target.value);setPresetId('custom');}} aria-label={codeTab.toUpperCase()+' code editor'}/>
          <p className="panel-note">Press Run preview to apply changes. Scripts cannot access the parent page.</p>
        </section>
        <section className={'panel preview-panel'+(!mobilePreview?' preview-mobile-hidden':'')}>
          <div className="panel-head"><b>PREVIEW</b><div className="ratios">{(['16:9','9:16','1:1'] as Ratio[]).map(r=><button key={r} className={r===ratio?'active':''} onClick={() => setRatio(r)}>{r}</button>)}</div></div>
          <div className="canvas"><iframe title="Sandboxed code preview" data-ratio={ratio} sandbox="allow-scripts" referrerPolicy="no-referrer" srcDoc={preview} style={{aspectRatio: ratio.replace(':',' / ')}}/></div>
          <p className="panel-note">Sandbox + restrictive CSP. Export is an HTML document, not a video.</p>
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

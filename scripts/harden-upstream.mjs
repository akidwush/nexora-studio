// Deterministic downstream security patch for pinned MPL-2.0 Studio Pro.
// Build fails closed if upstream changes invalidate any expected source anchor.
import {readFile,writeFile,copyFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const vendor=resolve('vendor/studio-pro');
const patch=resolve('patches/studio-pro');
async function exactReplace(path,find,replacement){
  const original=await readFile(path,'utf8');
  const start=original.indexOf(find);
  if(start<0||original.indexOf(find,start+find.length)!==-1)
    throw new Error('Upstream source drift; abort security patch: '+path+' '+find.slice(0,40));
  const updated=original.slice(0,start)+replacement+original.slice(start+find.length);
  await writeFile(path,updated);
}
const rendererPath=resolve(vendor,'src/html-clips/renderer.js');
let renderer=await readFile(rendererPath,'utf8');
const renderStart=renderer.indexOf('// ── Renderer ');
const drawStart=renderer.indexOf('/**\n * Draw HTML clip to canvas context');
if(renderStart<0||drawStart<=renderStart||!renderer.slice(renderStart,drawStart).includes('doc.write('))
  throw new Error('Upstream HTML clip renderer drift: not safe to continue');
const isolatedRenderer=`// ── Isolated renderer; NEVER read frame DOM ──────────────────
export async function renderHtmlClip(clip,width=1920,height=1080){
  const signature=getCacheSignature(clip);
  if(isCacheValid(clip,signature))return renderCache.get(clip.id).bitmap;
  let session;
  try{
    session=await createIsolatedHtmlSession(clip,width,height);
    const bitmap=await session.captureFrame(0);
    storeInCache(clip,signature,bitmap);
    return bitmap;
  }catch(error){
    console.warn('[HTMLClip] Opaque-origin render failed',error);
    const canvas=document.createElement('canvas');
    canvas.width=width;canvas.height=height;
    const ctx=canvas.getContext('2d');
    ctx.fillStyle='#374151';ctx.fillRect(0,0,width,height);
    ctx.fillStyle='#ffffff';ctx.font='24px system-ui';
    ctx.fillText('HTML render unavailable',24,40);
    return createImageBitmap(canvas);
  }finally{session?.destroy();}
}

`;
renderer=renderer.slice(0,renderStart)+isolatedRenderer+renderer.slice(drawStart);
if(!renderer.startsWith('/**'))throw new Error('Unexpected upstream renderer header');
renderer="import {createIsolatedHtmlSession} from './isolated-frame.js';\n"+renderer;
if(renderer.includes('doc.write(')||renderer.includes('contentDocument'))throw new Error('Unsafe renderer survived patch');
await writeFile(rendererPath,renderer);

const editorPath=resolve(vendor,'src/html-clips/editor.js');
const editor=await readFile(editorPath,'utf8');
const previewStart=editor.indexOf('  // Clear and write new content\n  preview.innerHTML = `');
const previewEnd=editor.indexOf('\n}\n\n// ── Clip Creation',previewStart);
if(previewStart<0||previewEnd<0)throw new Error('Upstream HTML preview drift; abort security patch');
let safeEditor="import {mountIsolatedHtmlPreview,destroyIsolatedHtmlPreview} from './isolated-frame.js';\n"+
  editor.slice(0,previewStart)+
  "  // HTML/CSS/JS is executed ONLY in the opaque-origin preview iframe.\n"+
  "  mountIsolatedHtmlPreview(preview,{html,css,js});"+
  editor.slice(previewEnd);
safeEditor=safeEditor.replace(
  "  currentClip = null;\n}\n\n/**\n * Apply changes to clip",
  "  const preview=document.getElementById('htmlClipPreview');\n  if(preview)destroyIsolatedHtmlPreview(preview);\n  currentClip = null;\n}\n\n/**\n * Apply changes to clip"
);
if(!safeEditor.includes('open: openEditor,'))throw new Error('Upstream editor API drift');
safeEditor=safeEditor.replace('open: openEditor,','open: showHtmlEditor,');
if(safeEditor.includes('preview.innerHTML ='))throw new Error('Unsafe preview survived patch');
await writeFile(editorPath,safeEditor);

// Upstream re-exports did not establish local bindings for its global facade.
const indexPath=resolve(vendor,'src/html-clips/index.js');
let index=await readFile(indexPath,'utf8');
if(!index.includes("export {\n  renderHtmlClip,")||
   !index.includes("export {\n  showHtmlEditor,"))
  throw new Error('Upstream HTML clip entrypoint drift');
index="import {renderHtmlClip,drawHtmlClip,preRenderHtmlClips,clearCache,clearAllCache,getCacheStats} from './renderer.js';\n"+
  "import {showHtmlEditor,closeEditor,createHtmlClip,HTML_CLIP_TEMPLATES} from './editor.js';\n"+index;
await writeFile(indexPath,index);

await copyFile(resolve(patch,'isolated-frame.js'),resolve(vendor,'src/html-clips/isolated-frame.js'));
await copyFile(resolve(patch,'html-canvas-renderer.js'),resolve(vendor,'src/html-in-canvas/renderer.js'));
const htmlCanvas=await readFile(resolve(vendor,'src/html-in-canvas/renderer.js'),'utf8');
if(htmlCanvas.includes('new Function(')||htmlCanvas.includes('sandbox.innerHTML'))
  throw new Error('Privileged HTML Canvas execution survived patch');
console.log('PASS: pinned Studio Pro HTML clip renderer, preview and HTML Canvas now sandboxed');

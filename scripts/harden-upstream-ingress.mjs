// Fail-closed quarantine for the additional unreviewed MONOLITHIC Studio Pro
// browser surface. This runs only on the pinned upstream, AFTER the three
// modular renderer fixes. Never treat these guards as an XSS sanitizer or as
// approval to process untrusted multi-tenant projects.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {createHash} from 'node:crypto';

const root=resolve('vendor/studio-pro');
const htmlPath=resolve(root,'index.html');
const original=await readFile(htmlPath);
const gitBlob=createHash('sha1').update('blob '+original.byteLength+'\0').update(original).digest('hex');
const LOCKED_BLOB='ea5835d1f1ae408433b46d3f82a3dcc37362f127';
if(gitBlob!==LOCKED_BLOB)throw new Error('Upstream monolithic index changed; stop public-ingress hardening until fully re-audited: '+gitBlob);
let html=original.toString('utf8').replace(/\r\n/g,'\n');
const changes=[];
function once(label,source,target){
 const count=html.split(source).length-1;
 if(count!==1)throw new Error('Upstream '+label+' drifted or is ambiguous; observed '+count);
 html=html.replace(source,target);
 changes.push(label);
}
function all(label,source,target,expected){
 const found=html.split(source).length-1;
 if(found!==expected)throw new Error('Upstream '+label+' drifted: expected '+expected+', got '+found);
 html=html.split(source).join(target);
 changes.push(label+':'+found);
}
function gate(label,anchor){
 once(label,anchor,anchor+"\n            return __nexoraDisabled("+JSON.stringify(label)+"); // ALL unreviewed external import surfaces disabled until reviewed");
}
const guard=`
<script id="nexora-editor-security-gates">
"use strict";
window.__NEXORA_PUBLIC_IMPORTS_ENABLED__ = false;\nif (navigator.serviceWorker) { navigator.serviceWorker.getRegistrations().then(rs=>rs.forEach(r=>r.unregister())).catch(()=>{}); }
// This dedicated origin is intentionally treated as disposable; never give
// the editor dashboard cookies, API secrets or credentialed CORS.
function __nexoraDisabled(feature) {
  const message = feature + ' is temporarily disabled: untrusted project imports and dynamic code require a full renderer/asset audit.';
  console.warn('[NEXORA security gate] ' + message);
  const status = document.getElementById('nexoraImportSafetyStatus');
  if (status) status.textContent = message;
  if (typeof showNoticeModal === 'function') {
    try { showNoticeModal({tone:'error',title:'Security gate',message,confirmLabel:'OK'}); } catch {}
  }
  return false;
}
function __nexoraCreateOpaqueFrame() {
  const frame = document.createElement('iframe');
  frame.setAttribute('sandbox','allow-scripts');
  frame.referrerPolicy = 'no-referrer';
  return frame;
}
function __nexoraSafeMedia(file,kind) {
  if (!(file instanceof File) || !Number.isFinite(file.size) || file.size<1) return false;
  const types = {
    image:/^image\\/(?:png|jpeg|webp|gif)$/,
    audio:/^audio\\/(?:mpeg|wav|x-wav|ogg|mp4|webm)$/,
    video:/^video\\/(?:mp4|webm|quicktime)$/,
    font:/^font\\/(?:woff|woff2|ttf|otf)$|^application\\/(?:font-woff|font-woff2|x-font-ttf|x-font-otf)$/
  };
  const limits={image:20*1024*1024,audio:90*1024*1024,video:250*1024*1024,font:2.5*1024*1024};
  const fallbackFont=kind==='font' && file.type==='' && /\\.(?:woff2?|ttf|otf)$/i.test(file.name);
  return Boolean((types[kind]?.test(file.type) || fallbackFont) && file.size <= limits[kind]);
}
// Signature checks are separate from a trusted decoder; a valid header is
// necessary but never a guarantee of safe media or decompression bounds.
async function __nexoraInspectMedia(file,kind) {
  if(!__nexoraSafeMedia(file,kind))return false;
  let head;
  try{head=new Uint8Array(await file.slice(0,16).arrayBuffer());}
  catch{return false;}
  if(head.length<8)return false;
  const str=(start,len)=>String.fromCharCode(...head.subarray(start,start+len));
  const riff=str(0,4)==='RIFF',ftyp=str(4,4)==='ftyp',ebml=head[0]===26&&head[1]===69&&head[2]===223&&head[3]===163;
  switch(kind){
    case 'image':
      if(file.type==='image/png')return head[0]===137&&str(1,3)==='PNG'&&head[4]===13&&head[5]===10&&head[6]===26&&head[7]===10;
      if(file.type==='image/jpeg')return head[0]===255&&head[1]===216&&head[2]===255;
      if(file.type==='image/webp')return riff&&str(8,4)==='WEBP';
      if(file.type==='image/gif')return str(0,6)==='GIF87a'||str(0,6)==='GIF89a';
      return false;
    case 'video':return file.type==='video/webm'?ebml:ftyp;
    case 'audio':
      if(file.type==='audio/mpeg')return str(0,3)==='ID3'||head[0]===255&&(head[1]&224)===224;
      if(file.type==='audio/wav'||file.type==='audio/x-wav')return riff&&str(8,4)==='WAVE';
      if(file.type==='audio/ogg')return str(0,4)==='OggS';
      if(file.type==='audio/webm')return ebml;
      if(file.type==='audio/mp4')return ftyp;
      return false;
    case 'font':
      return str(0,4)==='wOFF'||str(0,4)==='wOF2'||str(0,4)==='OTTO'||
        (head[0]===0&&head[1]===1&&head[2]===0&&head[3]===0);
    default:return false;
  }
}
function __nexoraSafeFontRecord(font) {
  if (!font || typeof font.name!=='string' || typeof font.dataUri!=='string' ||
      font.dataUri.length>3600000 || !/^[a-z0-9 ._-]{1,60}$/i.test(font.name)) return false;
  const comma=font.dataUri.indexOf(',');
  if (comma<0) return false;
  const prefix=font.dataUri.slice(0,comma+1).toLowerCase();
  const valid=['data:font/woff;base64,','data:font/woff2;base64,',
    'data:font/ttf;base64,','data:font/otf;base64,',
    'data:application/font-woff;base64,','data:application/font-woff2;base64,',
    'data:application/x-font-ttf;base64,','data:application/x-font-otf;base64,',
    'data:application/octet-stream;base64,'];
  return valid.includes(prefix) && /^[a-z0-9+/=]+$/i.test(font.dataUri.slice(comma+1));
}
function __nexoraAssertSafeProject(data) {
  if (!data || typeof data!=='object' || !Array.isArray(data.clips) ||
      !Array.isArray(data.tracks) || data.clips.length>220 || data.tracks.length>32)
    throw new Error('Local project layout rejected by the security gate.');
  const serialized=JSON.stringify(data);
  if (serialized.length>2*1024*1024 || /"(?:__proto__|prototype|constructor)"\\s*:/.test(serialized))
    throw new Error('Local project exceeds a safe size or contains unsafe object keys.');
  for (const clip of data.clips) {
    if(!clip || typeof clip!=='object')throw new Error('Invalid local clip.');
    if(clip.type==='html'||clip.type==='hic'||clip._isWaaapi)
      throw new Error('Legacy HTML/HIC/WAAPI clips are quarantined until the monolithic renderer is replaced.');
    for(const key of ['src','fileUrl','_srcUrl','url','textureSrc']) {
      const value=clip[key];
      if(typeof value==='string' && /^(?:https?:|javascript:|data:text\\/html|data:image\\/svg\\+xml)/i.test(value))
        throw new Error('Local project contains a remote or active-content asset.');
    }
  }
  return true;
}
</script>
`;

once('no-external-lucide','<script src="https://unpkg.com/lucide@1.28.0/dist/umd/lucide.min.js" onerror="window.__loadLocalLucide && window.__loadLocalLucide()"></script>','<script src="vendor/lucide.min.js"></script>');
all('remove-google-preconnect','<link rel="preconnect" href="https://fonts.googleapis.com">','<!-- external font preconnect blocked -->',1);
all('remove-google-font-preconnect','<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>','<!-- external font preconnect blocked -->',1);
all('opaque-runtime-iframes',"document.createElement('iframe')","__nexoraCreateOpaqueFrame()",4);
once('main-head','<html lang="en" class="dark">\n<head>','<html lang="en" class="dark">\n<head>\n<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; media-src \'self\' blob: data:; font-src \'self\' data:; connect-src \'self\'; frame-src \'self\' about:; child-src \'self\' about:; worker-src \'self\' blob:; object-src \'none\'; base-uri \'none\'; form-action \'none\'">\n'+guard);
// Do not replace the iframe creator inserted in the guard: it does not have
// to be traversed in the monolithic source; it constructs a fresh native frame.
once('html-modal-iframe','<iframe id="htmlEditorPreview"','<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" id="htmlEditorPreview"');
once('hic-modal-iframe','<iframe id="hicEditorPreview"','<iframe sandbox="allow-scripts" referrerpolicy="no-referrer" id="hicEditorPreview"');

// Import ingress: includes all file picker AND drag-and-drop callers, since
// the shared implementation functions are disabled, not just UI controls.
gate('JSON project file import','function importProjectFileObj(file) {');
gate('portable .spcomp composition import','function importSpcomp(spcompData) {');
gate('portable .spcomp file picker','function importSpcompFile() {');
gate('arbitrary .js/.mjs composition scripts','function loadCompositionScript() {');
gate('external design template JSON','function importDesignTemplateFile(input) {');
gate('external custom preset JSON','window.importPresets = function(event) {');

// The monolithic index predates the three modular renderer patches. Deny
// entry to ALL legacy inline HTML/HIC/WAAPI render/preview paths, including
// restored local projects. The vetted isolated first-party NEXORA HTML Motion
// renderer remains available in the separate dashboard.
gate('legacy HTML clip creation','window.addHtmlClipToTimeline = function(template) {');
gate('legacy HIC clip creation','window.addHicClipToTimeline = function(presetKey) {');
gate('legacy HTML editor','window.openHtmlEditor = function(clipId) {');
gate('legacy HIC editor','window.openHicEditor = function(clipId) {');
gate('legacy HTML pre-render','window.preRenderHtmlClip = async function(clip) {');
gate('legacy HTML editor preview','function _updateHtmlEditorPreview() {');
gate('legacy HIC preview','window._updateHicEditorPreview = function() {');
gate('legacy WAAPI seeker','window.__waapiSeekFrame = function(iframe, frame, fps) {');
gate('legacy WAAPI preset','window._applyWaaapiPreset = function(clipId, presetKey) {');
once('HTML runtime drawing gated',"} else if (clip.type === 'html') {","} else if (false && clip.type === 'html') {");
once('HIC runtime drawing gated',"} else if (clip.type === 'hic') {","} else if (false && clip.type === 'hic') {");
once('WAAPI overlay never invokes old iframe pipeline','if (!c._isWaaapi) return;','if (true || !c._isWaaapi) return; // quarantined until message-only sandbox rendering');
once('persistent-local-project-validation',"function applyProject(data) {","function applyProject(data) {\n            __nexoraAssertSafeProject(data);");

once('project registry id validation',
 "if (idx && Array.isArray(idx.projects)) return idx.projects;",
 "if (idx && Array.isArray(idx.projects)) return idx.projects.filter(p => p && typeof p.id==='string' && /^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|p[a-z0-9]{5,42})$/i.test(p.id) && typeof p.name==='string' && p.name.length<=120).slice(0,100);");
once('active project id validation',
 "if (a && a.id) return a;",
 "if (a && typeof a.id==='string' && /^(?:[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}|p[a-z0-9]{5,42})$/i.test(a.id)) return a;");
const legacyStart='        function initProjects() {\n';
const legacyEnd='            syncSideStoresFromState();';
const legacyStartAt=html.indexOf(legacyStart);
const legacyEndAt=html.indexOf(legacyEnd,legacyStartAt);
if(legacyStartAt<0||legacyEndAt<legacyStartAt||!html.slice(legacyStartAt,legacyEndAt).includes('applyProject(getProject(active.id))'))
  throw new Error('Upstream initProjects lifecycle anchor changed; old projects must not be silently overwritten');
const replacement=`        function initProjects() {
            migrateLegacyAutosave();
            const projects = listProjects();
            const active = getActiveProject();
            const preferred = active && projects.some(p=>p.id===active.id) && getProject(active.id)
              ? {id:active.id,name:active.name||'Untitled',data:getProject(active.id)}
              : null;
            const firstValid = projects.map(p=>({id:p.id,name:p.name,data:getProject(p.id)}))
              .find(p=>p.data);
            const selected=preferred||firstValid;
            if(selected) {
              try {
                // Validate BEFORE selecting, mutating current state, or running
                // any rich template/clip rendering. No quarantine bypass for
                // old autosaves or manually edited localStorage records.
                __nexoraAssertSafeProject(selected.data);
                setActiveProject(selected.id,selected.name);
                applyProject(selected.data);
              }catch(err) {
                console.warn('[NEXORA] Prior local project preserved but quarantined:',err.message);
                const id=newProjectId(),name='Safe workspace';
                const blank=createEmptyProject();
                saveProject(id,blank,name); // Original project bytes remain untouched
                setActiveProject(id,name);
                applyProject(blank);
                setTimeout(()=>{
                  try{showNoticeModal({
                    title:'Existing project quarantined',tone:'error',
                    message:'The previous project contains unsafe or unsupported content. It was NOT deleted. Export it from the Projects menu for offline migration. Studio Pro opened a safe new workspace.',
                    confirmLabel:'OK'
                  });}catch{}
                },0);
              }
            }else {
              const id=newProjectId(),name=defaultProjectName(),blank=createEmptyProject();
              saveProject(id,blank,name);
              setActiveProject(id,name);
              applyProject(blank);
            }
`;
html=html.slice(0,legacyStartAt)+replacement+html.slice(legacyEndAt);
changes.push('safe local-project startup recovery without deleting old project');

// Replace remaining privileged script compilers even within unreachable
// branches, so a future refactor cannot quietly re-enable them.
once('HIC parent compiler',"try { _hr._onFrame = new Function('time', clip.js + '\\n;return typeof onFrame === \"function\" ? onFrame : null;')(); }","try { throw new Error('HIC parent compiler disabled by NEXORA'); }");
once('composition script compiler',"const scriptFn = new Function('return ' + fnStr)();","const scriptFn = () => { throw new Error('Unreviewed composition code execution denied'); };");
const hicBootStart=html.indexOf('            const boot =\n',html.indexOf('window._updateHicEditorPreview = function() {'));
const hicBootEnd=html.indexOf('            preview.srcdoc = ',hicBootStart);
if(hicBootStart<0||hicBootEnd<hicBootStart||!html.slice(hicBootStart,hicBootEnd).includes('new Function('))
  throw new Error('HIC preview dynamic compiler drift');
html=html.slice(0,hicBootStart)+"            const boot = ''; // privileged user-code compilation removed\n"+html.slice(hicBootEnd);
changes.push('HIC preview compiler removed');
// Guard legacy project preview thumbnail attribute: old stored data URL must
// never be an active SVG or attribute-injection payload.
once('project thumbnail allowlist',
 "const projData = getProject(p.id);",
 "const safeThumb = typeof p.thumbnail === 'string' && p.thumbnail.length < 700000 && /^data:image\\/(?:png|jpeg|webp);base64,[a-z0-9+/=]+$/i.test(p.thumbnail) ? p.thumbnail : '';\n            const projData = getProject(p.id);");
once('project thumbnail sink',
 "${p.thumbnail ? '<img src=\"' + p.thumbnail + '\" class=\"w-full h-full object-contain\" alt=\"\">' : '<i data-lucide=\"layers\" class=\"w-8 h-8 text-surface-400\"></i>'}",
 "${safeThumb ? '<img src=\"' + safeThumb + '\" class=\"w-full h-full object-contain\" alt=\"\">' : '<i data-lucide=\"layers\" class=\"w-8 h-8 text-surface-400\"></i>'}");

// Restrict file-type/size BEFORE first read, including drag/drop and folder
// re-import. The browser's input accept attribute is NOT a security check.
once('local media picker allowlist',
 "mediaInput.addEventListener('change', async (e) => {\n            const files = Array.from(e.target.files);\n            if (!files.length) return;",
 "mediaInput.addEventListener('change', async (e) => {\n            const files = [];\n            for(const file of Array.from(e.target.files)) {\n                const kind=file.type.startsWith('image/')?'image':'video';\n                if(await __nexoraInspectMedia(file,kind)) files.push(file);\n            }\n            if (!files.length) { __nexoraDisabled('Rejected media signature, type or size'); return; }");
once('audio library import allowlist',
 "async function importAudioFilesIntoLibrary(files, group) {", "async function importAudioFilesIntoLibrary(files, group) {");
// Previously imported custom JSON templates/presets may remain in browser
// storage from older unsafe builds; never parse them into live rich HTML.
once('legacy custom preset recovery quarantine',
 "function loadCustomPresets() {",
 "function loadCustomPresets() {\\n            return []; // old stored presets retained but quarantined until typed schema review");
once('legacy custom preset save quarantine',
 "function saveCustomPresets(presets) {",
 "function saveCustomPresets(presets) {\\n            return __nexoraDisabled('Unreviewed custom preset storage');");
once('legacy design template recovery quarantine',
 "function loadDesignTemplates() {",
 "function loadDesignTemplates() {\\n            return []; // old stored templates retained but not evaluated");
once('legacy design template save quarantine',
 "function saveDesignTemplates(list) {",
 "function saveDesignTemplates(list) {\\n            return __nexoraDisabled('Unreviewed template storage');");
// Imported fonts are treated as data but their old names and data URIs
// entered a privileged editor-owned <style> without adequate validation.
once('font CSS injection guard',
 "function registerCustomFont(name, dataUri) {",
 "function registerCustomFont(name, dataUri) {\\n            if(!__nexoraSafeFontRecord({name,dataUri}))return false;");
once('stored custom font allowlist',
 "fonts = fonts.filter(f => f && f.name && !f.name.startsWith('._'));",
 "fonts = fonts.filter(f => f && __nexoraSafeFontRecord(f) && !f.name.startsWith('._'));");
once('never overwrite unsafe legacy font originals',
 "localStorage.setItem('studiopro_custom_fonts', JSON.stringify(fonts));",
 "// Preserve the original legacy font bytes in storage for offline recovery.");
once('async font upload validation',
 "fontInput.addEventListener('change', (e) => {",
 "fontInput.addEventListener('change', async (e) => {");
once('font picker signature and name check',
 "if (file.size > 2.5 * 1024 * 1024) {",
 "if(!(await __nexoraInspectMedia(file,'font')) || !/^[a-z0-9 ._-]{1,55}\\.(?:woff2?|ttf|otf)$/i.test(file.name)){\\n                __nexoraDisabled('Font type, signature or filename rejected');fontInput.value='';return;\\n            }\\n            if (file.size > 2.5 * 1024 * 1024) {");
once('audio library import files mutable',
 "const entries = [...(files || [])].map(f => {",
 "let entries = [...(files || [])].map(f => {");
once('audio library import signatures',
 "}).filter(e => isImportableAudioFile(e.file));",
 "}).filter(e => isImportableAudioFile(e.file) && __nexoraSafeMedia(e.file,'audio'));\n            const verified=[];\n            for(const entry of entries) if(await __nexoraInspectMedia(entry.file,'audio')) verified.push(entry);\n            entries=verified;");
once('reimport allowlist',
 "for (const f of files) {\n                const firstIdx = pool.findIndex(c => clipMatchesFile(c, f));",
 "for (const f of files) {\n                const kind=f.type.startsWith('image/')?'image':f.type.startsWith('video/')?'video':'audio';\n                if (!(await __nexoraInspectMedia(f,kind))) { unmatched.push(String(f?.name||'invalid')); continue; }\n                const firstIdx = pool.findIndex(c => clipMatchesFile(c, f));");
once('subtitle import size guard',
 "for (const f of e.target.files) {\n                    const entries = parseSRT(await f.text());",
 "for (const f of e.target.files) {\n                    if(!(f instanceof File)||f.size>1024*1024||!/\\.(?:srt|vtt)$/i.test(f.name)){__nexoraDisabled('Oversized or invalid subtitle');continue;}\n                    const entries = parseSRT(await f.text());");
// No plaintext AI keys may be newly saved/read on this untrusted editor site.
// The authenticated dashboard must provide any future server-side AI proxy.
gate('AI credentials panel','function openAIPanel() {');
gate('plaintext AI key persistence','function saveAIApiKey() {');
all('no-localstorage-AI-key-reads',"localStorage.getItem('studiopro_ai_key_' + provider) || ''","'' /* API key storage disabled */",2);
all('no-plaintext-AI-key-writes',"localStorage.setItem('studiopro_ai_key_' + provider, key);","__nexoraDisabled('AI key persistence disabled');",1);
// Disable PWA service-worker registration/caching and raw demo HTML copies by
// rewriting the small vendor build config. Vendored licensing preserved.
const vitePath=resolve(root,'vite.config.js');
const vite=await readFile(vitePath,'utf8');
if(!vite.includes('VitePWA(')||!vite.includes('viteStaticCopy(')||!vite.includes("base = isActions ? '/studio-pro/' : '/'"))
  throw new Error('Vendor Vite PWA/static-copy config drifted');
await writeFile(vitePath,`// NEXORA public-import quarantine: do not install an upstream service worker,
// cache executable third-party CDNs, or ship undocumented raw demo entrypoints.
import {defineConfig} from 'vite';
export default defineConfig({
  base:'/',
  server:{port:3000,open:false},
  build:{outDir:'dist',rollupOptions:{input:{main:'./index.html'}}}
});
`);
if(html.includes('new Function(')||html.includes('eval(')||html.includes('src="https://unpkg.com/'))
  throw new Error('Privileged dynamic compilation or remote script hook remains in public editor');
await writeFile(htmlPath,html);
console.log('PASS: audited pinned upstream main editor import/dynamic-code/PWA gates '+changes.length);
console.log(JSON.stringify({indexGitBlob:gitBlob,quarantineChanges:changes,publishedProjectImports:false,
  warning:'Not cleared for public untrusted project ingestion'},null,2));

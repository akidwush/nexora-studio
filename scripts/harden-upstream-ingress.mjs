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
let html=original.toString('utf8');
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
window.__NEXORA_PUBLIC_IMPORTS_ENABLED__ = false;
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
  return Boolean(types[kind]?.test(file.type) && file.size <= limits[kind]);
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
once('main-head','<head>','<head>\n<meta http-equiv="Content-Security-Policy" content="default-src \'none\'; script-src \'self\' \'unsafe-inline\'; style-src \'self\' \'unsafe-inline\'; img-src \'self\' data: blob:; media-src \'self\' blob: data:; font-src \'self\' data:; connect-src \'self\'; frame-src \'self\' about:; child-src \'self\' about:; worker-src \'self\' blob:; object-src \'none\'; base-uri \'none\'; form-action \'none\'; navigate-to \'self\'">\n'+guard+'\n<div id="nexoraImportSafetyStatus" style="display:none" role="status"></div>');
once('no-external-lucide','<script src="https://unpkg.com/lucide@1.28.0/dist/umd/lucide.min.js" onerror="window.__loadLocalLucide && window.__loadLocalLucide()"></script>','<script src="vendor/lucide.min.js"></script>');
all('remove-google-preconnect','<link rel="preconnect" href="https://fonts.googleapis.com">','<!-- external font preconnect blocked -->',1);
all('remove-google-font-preconnect','<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>','<!-- external font preconnect blocked -->',1);
all('opaque-runtime-iframes',"document.createElement('iframe')","__nexoraCreateOpaqueFrame()",3);
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
// Replace remaining privileged script compilers even within unreachable
// branches, so a future refactor cannot quietly re-enable them.
once('HIC parent compiler',"try { _hr._onFrame = new Function('time', clip.js + '\\n;return typeof onFrame === \"function\" ? onFrame : null;')(); }","throw new Error('HIC parent compiler disabled by NEXORA');");
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
 "const files = Array.from(e.target.files);\n            if (!files.length) return;",
 "const files = Array.from(e.target.files).filter(file => __nexoraSafeMedia(file,'image') || __nexoraSafeMedia(file,'video'));\n            if (!files.length) { __nexoraDisabled('Rejected media type or size'); return; }");
once('audio library import allowlist',
 "}).filter(e => isImportableAudioFile(e.file));",
 "}).filter(e => isImportableAudioFile(e.file) && __nexoraSafeMedia(e.file,'audio'));");
once('reimport allowlist',
 "for (const f of files) {\n                const firstIdx = pool.findIndex(c => clipMatchesFile(c, f));",
 "for (const f of files) {\n                if (!['image','video','audio'].some(kind=>__nexoraSafeMedia(f,kind))) { unmatched.push(String(f?.name||'invalid')); continue; }\n                const firstIdx = pool.findIndex(c => clipMatchesFile(c, f));");
once('subtitle import size guard',
 "for (const f of e.target.files) {\n                    const entries = parseSRT(await f.text());",
 "for (const f of e.target.files) {\n                    if(!(f instanceof File)||f.size>1024*1024||!/\\.(?:srt|vtt)$/i.test(f.name)){__nexoraDisabled('Oversized or invalid subtitle');continue;}\n                    const entries = parseSRT(await f.text());");
// No plaintext AI keys may be newly saved/read on this untrusted editor site.
// The authenticated dashboard must provide any future server-side AI proxy.
gate('AI credentials panel','function openAIPanel() {');
gate('plaintext AI key persistence','function saveAIApiKey() {');
all('no-localstorage-AI-key-reads',"localStorage.getItem('studiopro_ai_key_' + provider) || ''","'' /* API key storage disabled */",2);
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
if(/new Function\\s*\\(/.test(html)||/onload=[\"'][^\\n]*https:\/\//i.test(html))
  throw new Error('Privileged dynamic compilation or remote script hook remains in public editor');
await writeFile(htmlPath,html);
console.log('PASS: audited pinned upstream main editor import/dynamic-code/PWA gates '+changes.length);
console.log(JSON.stringify({indexGitBlob:gitBlob,quarantineChanges:changes,publishedProjectImports:false,
  warning:'Not cleared for public untrusted project ingestion'},null,2));

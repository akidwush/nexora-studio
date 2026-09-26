// Mandatory second pass for secondary media-ingest surfaces in the pinned
// upstream monolith. MIME, file size and a bounded magic-byte check must
// precede ANY state mutation, object URL creation, audio/video decoder or
// directory import. This is still quarantine, not general public upload.
import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
const path=resolve('vendor/studio-pro/index.html');
let code=await readFile(path,'utf8');
if(!code.includes('window.__NEXORA_PUBLIC_IMPORTS_ENABLED__ = false')||
   !code.includes('function __nexoraInspectMedia(file,kind)'))
  throw Error('Mandatory main ingress patch was skipped');
const changed=[];
function one(name,before,after){
 const count=code.split(before).length-1;
 if(count!==1)throw Error('Secondary asset patch drifted: '+name+' count='+count);
 code=code.replace(before,after);changed.push(name);
}
one('replace-audio-video-image-clip-before-mutation',
`window.replaceClipSource = async function(clipId, files) {
            if (!files || !files.length) return;
            const clip = State.clips.find(c => c.id === clipId);
            if (!clip) return;`,
`window.replaceClipSource = async function(clipId, files) {
            if (!files || !files.length) return;
            const clip = State.clips.find(c => c.id === clipId);
            if (!clip) return;
            const selected=files[0];
            const kind=clip.type==='image'?'image':clip.type==='audio'
              ? (selected?.type?.startsWith('video/')?'video':'audio'):'video';
            if (!(await __nexoraInspectMedia(selected,kind)))
              return __nexoraDisabled('Invalid or oversized replacement media');`);
one('replace-audio-library-before-mutation',
`window.replaceAudioLibFile = async function(id, files) {
            const audio = State.audioLibrary.find(a => a.id === id);
            const file = files && files[0];
            if (!audio || !file) return;
            stopAudioLibPlayback(true);`,
`window.replaceAudioLibFile = async function(id, files) {
            const audio = State.audioLibrary.find(a => a.id === id);
            const file = files && files[0];
            if (!audio || !file) return;
            const kind=file.type.startsWith('video/')?'video':'audio';
            if (!(await __nexoraInspectMedia(file,kind)))
              return __nexoraDisabled('Invalid audio-library replacement');
            stopAudioLibPlayback(true);`);
one('single-clip-sound-import',
`window.importClipSfx = async function(clipId, files) {
            const clip = State.clips.find(c => c.id === clipId);
            if (!clip || !files || !files.length) return;
            const file = files[0];
            try {`,
`window.importClipSfx = async function(clipId, files) {
            const clip = State.clips.find(c => c.id === clipId);
            if (!clip || !files || !files.length) return;
            const file = files[0];
            if (!(await __nexoraInspectMedia(file,'audio')))
              return __nexoraDisabled('Invalid or oversized sound effect');
            try {`);
one('named-markdown-sound-import',
`window.importMarkdownAudioFor = async function(name, files) {
            if (!name || !files || !files.length) return;
            ensureAudioContext();`,
`window.importMarkdownAudioFor = async function(name, files) {
            if (!name || !files || !files.length) return;
            if (!(await __nexoraInspectMedia(files[0],'audio')))
              return __nexoraDisabled('Invalid named Markdown audio');
            ensureAudioContext();`);
one('markdown-batch-audio-import',
`window.importMarkdownAudioBatch = async function(fileList) {
            window.__mdBatchResult = null;
            if (!fileList || !fileList.length) return;
            const files = [...fileList].filter(f => (f.type || '').startsWith('audio/'));`,
`window.importMarkdownAudioBatch = async function(fileList) {
            window.__mdBatchResult = null;
            if (!fileList || !fileList.length) return;
            if (fileList.length>64)return __nexoraDisabled('Too many Markdown audio files');
            const files=[];
            for(const file of fileList)
              if(await __nexoraInspectMedia(file,'audio'))files.push(file);`);
one('markdown-bulk-audio-import',
`window.importMarkdownAudio = async function(files) {
            if (!files || !files.length) return;
            ensureAudioContext();`,
`window.importMarkdownAudio = async function(files) {
            if (!files || !files.length) return;
            if(files.length>64)return __nexoraDisabled('Too many Markdown audio files');
            const verified=[];
            for(const file of files)
              if(await __nexoraInspectMedia(file,'audio'))verified.push(file);
            if(!verified.length)return __nexoraDisabled('No valid Markdown audio');
            files=verified;
            ensureAudioContext();`);
one('audio-library-folder-reimport',
`async function reimportAudioLibrary(files) {
            const audioFiles = [...(files || [])].filter(isImportableAudioFile);`,
`async function reimportAudioLibrary(files) {
            if ((files?.length||0)>64)return __nexoraDisabled('Too many audio-library files');
            const audioFiles=[];
            for(const file of files||[])
              if(isImportableAudioFile(file) &&
                 await __nexoraInspectMedia(file,file.type.startsWith('video/')?'video':'audio'))
                audioFiles.push(file);`);
one('primary-media-batch-budget',
`mediaInput.addEventListener('change', async (e) => {
            const files = [];`,
`mediaInput.addEventListener('change', async (e) => {
            if((e.target.files?.length||0)>20)return __nexoraDisabled('Too many media files');
            const files = [];`);
one('main-folder-reimport-budget',
`async function runReimport(files, opts) {
            const fromFolder = !!(opts && opts.fromFolder);`,
`async function runReimport(files, opts) {
            if((files?.length||0)>64)return __nexoraDisabled('Too many replacement files');
            const fromFolder = !!(opts && opts.fromFolder);`);
// Additional conservative validation of legacy on-device state. No repair or
// implicit deserialization of a blocked project: preserve the original bytes.
// Since the 2.6MB upstream monolith has many rich UI sinks, reject suspicious
// metadata rather than assuming all existing templates are XSS-safe.
const deepGuard="function __nexoraPersistedDeepCheck(data) {\n  const plainId=/^[a-z0-9_-]{1,90}$/i;\n  const nameKeys=new Set(['title','name','fileName','sourceName','group','label','audioLibGroup']);\n  const idKeys=new Set(['id','trackId','sceneId','subtitleId']);\n  const urlKeys=new Set(['src','fileUrl','_srcUrl','url','textureSrc','href','poster','thumbnailSrc']);\n  const stack=[[data,0]],seen=new WeakSet();\n  let visited=0;\n  while(stack.length){\n    const [value,depth]=stack.pop();\n    if(++visited>12000||depth>14)\n      throw new Error('Stored project nesting or object count exceeds safe limits.');\n    if(typeof value==='number') {\n      if(!Number.isFinite(value)||Math.abs(value)>1e15)\n        throw new Error('Stored project contains out-of-range numeric data.');\n      continue;\n    }\n    if(typeof value==='string') {\n      if(value.length>1800000 || /<\\s*\\/?\\s*[a-z][^>]*>/i.test(value))\n        throw new Error('Stored project contains oversized or active markup content.');\n      continue;\n    }\n    if(value===undefined || value===null || typeof value==='boolean')continue;\n    if(typeof value!=='object')throw new Error('Unsupported persisted project value.');\n    if(seen.has(value))throw new Error('Cyclic project state is not supported.');\n    seen.add(value);\n    if(Array.isArray(value)){\n      if(value.length>1024)throw new Error('Stored project array exceeds safe budget.');\n      for(const entry of value)stack.push([entry,depth+1]);\n      continue;\n    }\n    if(Object.getPrototypeOf(value)!==Object.prototype)\n      throw new Error('Stored project object does not have a plain prototype.');\n    const entries=Object.entries(value);\n    if(entries.length>140)throw new Error('Stored project object has too many keys.');\n    for(const [key,item] of entries){\n      if(['__proto__','prototype','constructor'].includes(key)||/^on[a-z]{3,}$/i.test(key))\n        throw new Error('Stored project contains a forbidden object key.');\n      if(idKeys.has(key)&&item!=null&&(typeof item!=='string'||!plainId.test(item)))\n        throw new Error('Stored project contains an unsafe identifier: '+key);\n      if(nameKeys.has(key)&&item!=null&&(typeof item!=='string'||item.length>140||\n        /[<>\"'\\x60]/.test(item)))\n        throw new Error('Stored project contains unsafe unescaped UI metadata: '+key);\n      if(['js','html','onFrame'].includes(key)&&typeof item==='string'&&item.trim())\n        throw new Error('Stored project includes unreviewed executable content.');\n      if(urlKeys.has(key)&&typeof item==='string'&&\n        /^\\s*(?:https?:|blob:|javascript:|data:text\\/html|data:image\\/svg\\+xml)/i.test(item))\n        throw new Error('Stored project references untrusted remote or active media.');\n      stack.push([item,depth+1]);\n    }\n  }\n  return true;\n}";
one('deep schema guard on legacy persisted project metadata',
  'function __nexoraAssertSafeProject(data) {',
  deepGuard+'\nfunction __nexoraAssertSafeProject(data) {');
one('validate nested local project before any state mutation',
  '  for (const clip of data.clips) {',
  '  __nexoraPersistedDeepCheck(data);\n  for (const clip of data.clips) {');

if(code.includes("window.__NEXORA_PUBLIC_IMPORTS_ENABLED__ = true"))
  throw Error('Untrusted project imports must not be enabled');
await writeFile(path,code);
console.log('PASS: secondary media source / SFX / Markdown / library / folder guards',changed);

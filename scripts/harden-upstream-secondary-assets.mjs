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
if(code.includes("window.__NEXORA_PUBLIC_IMPORTS_ENABLED__ = true"))
  throw Error('Untrusted project imports must not be enabled');
await writeFile(path,code);
console.log('PASS: secondary media source / SFX / Markdown / library / folder guards',changed);

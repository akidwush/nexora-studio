// Additional Chromium proof: all clip/audio/Markdown secondary file paths
// reject a disguised image/script BEFORE any state mutation or media decoder.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';

const host='http://127.0.0.1:4194';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview',
  '--host','127.0.0.1','--port','4194','--strictPort'],{
    cwd:'vendor/studio-pro',stdio:['ignore','pipe','pipe'],
    env:{...process.env,GITHUB_ACTIONS:'false'}
  });
let logs='';
server.stdout.on('data',v=>logs+=v.toString());
server.stderr.on('data',v=>logs+=v.toString());
let browser;
try {
  let ready=false;
  for(let count=0;count<80;count++){
    if(server.exitCode!==null)throw Error('Secure Studio preview exited: '+logs);
    try{if((await fetch(host)).ok){ready=true;break;}}catch{}
    await new Promise(done=>setTimeout(done,250));
  }
  assert.ok(ready,'Secure Studio preview server did not start: '+logs);
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  const errors=[];
  page.on('pageerror',error=>errors.push(error.message.slice(0,200)));
  await page.goto(host+'/',{waitUntil:'domcontentloaded'});
  const results=await page.evaluate(async()=>{
    const state=window.State || (typeof State!=='undefined'?State:null);
    if(!state || !Array.isArray(state.clips)||!Array.isArray(state.audioLibrary))
      throw Error('Studio Pro state not initialized for secondary import regression.');
    const code='<svg xmlns="http://www.w3.org/2000/svg" onload="parent.__badMediaRan=true"/>';
    const forgedPng=new File([code],'cover.png',{type:'image/png'});
    const forgedMp4=new File([code],'movie.mp4',{type:'video/mp4'});
    const forgedAudio=new File([code],'sound.mp3',{type:'audio/mpeg'});
    window.__badMediaRan=false;
    const clip={id:'nx_security_replace',type:'image',src:'safe-old-image',
      fileUrl:'safe-old-url',_mdMock:true,title:'Safe local test',effects:{}};
    const sfxClip={id:'nx_security_sfx',type:'shape',sfx:{marker:'unchanged'}};
    const audio={id:'nx_security_audio',name:'safe-local-sound',marker:'unchanged'};
    state.clips.push(clip,sfxClip);
    state.audioLibrary.push(audio);
    const selectedObjects=Object.keys(state).filter(key=>/markdownAudio/i.test(key));
    const mediaRead=await window.__nexoraInspectMedia(forgedPng,'image');
    const replaceImage=await window.replaceClipSource(clip.id,[forgedPng]);
    const afterImage={src:clip.src,fileUrl:clip.fileUrl,mdMock:clip._mdMock};
    const replaceAudio=await window.replaceAudioLibFile(audio.id,[forgedAudio]);
    const afterAudio=audio.marker;
    const clipSfx=await window.importClipSfx(sfxClip.id,[forgedAudio]);
    const afterSfx=sfxClip.sfx?.marker;
    const namedSound=await window.importMarkdownAudioFor('unsafe-audio',[forgedAudio]);
    const bulkSound=await window.importMarkdownAudio(Array.from({length:65},()=>forgedAudio));
    const batchSound=await window.importMarkdownAudioBatch(Array.from({length:65},()=>forgedAudio));
    const afterBulkState=Object.keys(state).filter(key=>/markdownAudio/i.test(key));
    const videoClip={id:'nx_security_video',type:'video',src:'safe-old-video',_mdMock:true};
    state.clips.push(videoClip);
    const replaceVideo=await window.replaceClipSource(videoClip.id,[forgedMp4]);
    const afterVideo={src:videoClip.src,mdMock:videoClip._mdMock};
    state.clips.splice(state.clips.indexOf(clip),1);
    state.clips.splice(state.clips.indexOf(sfxClip),1);
    state.clips.splice(state.clips.indexOf(videoClip),1);
    state.audioLibrary.splice(state.audioLibrary.indexOf(audio),1);
    return {mediaRead,replaceImage,replaceAudio,clipSfx,namedSound,bulkSound,batchSound,
      replaceVideo,afterImage,afterAudio,afterSfx,afterVideo,
      noScriptExecution:!window.__badMediaRan,
      noNewMarkdownAudioState:selectedObjects.length===afterBulkState.length};
  });
  for(const path of ['mediaRead','replaceImage','replaceAudio','clipSfx',
    'namedSound','bulkSound','batchSound','replaceVideo'])
    assert.equal(results[path],false,path+' did not fail before decode/state mutation');
  assert.deepEqual(results.afterImage,{src:'safe-old-image',fileUrl:'safe-old-url',mdMock:true});
  assert.deepEqual(results.afterVideo,{src:'safe-old-video',mdMock:true});
  assert.equal(results.afterAudio,'unchanged');
  assert.equal(results.afterSfx,'unchanged');
  assert.ok(results.noScriptExecution);
  assert.ok(results.noNewMarkdownAudioState);
  await mkdir('artifacts',{recursive:true});
  await writeFile('artifacts/studio-pro-secondary-assets-regression.json',
    JSON.stringify({status:'SECONDARY_INGRESS_QUARANTINE_PASS',results,
      pageErrors:errors},null,2));
  console.log('PASS: secondary source replacement, audio, SFX, Markdown and batch uploads reject disguised inputs without mutating state');
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}

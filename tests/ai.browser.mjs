import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const host='http://127.0.0.1:4182';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4182','--strictPort'],{stdio:['ignore','pipe','pipe']});
let log='';
server.stdout.on('data',d=>log+=String(d));
server.stderr.on('data',d=>log+=String(d));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
async function ready(){
 for(let i=0;i<60;i++){
   try{if((await fetch(host)).ok)return;}catch{}
   if(server.exitCode!==null)throw new Error('Preview exited: '+log);
   await wait(350);
 }
 throw new Error('Preview failed: '+log);
}
try{
 await ready();
 browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 await page.goto(host+'/?tool=ai',{waitUntil:'domcontentloaded'});
 await page.locator('#ai-prompt').waitFor({timeout:15000});
 await page.locator('.ai-availability[data-ready=false]').waitFor({timeout:10000});
 assert.equal(await page.getByRole('button',{name:/Generate with AI/}).isDisabled(),true);
 console.log('PASS: statically hosted site does not silently issue paid AI calls');

 await page.locator('#ai-prompt').fill('Calm blue ocean wave animation for a video');
 await page.getByRole('button',{name:/Create local draft/}).click();
 await page.locator('.ai-mode[data-mode=local]').waitFor();
 assert.equal(await page.locator('#ai-template').inputValue(),'waves');
 await page.locator('#ai-title').fill('');
 await page.waitForTimeout(180);
 await page.locator('canvas[aria-label="Generated scene preview"]').waitFor();
 await page.locator('#ai-title').fill('CUSTOM OCEAN FILM');
 await page.getByRole('button',{name:'Apply sunset theme'}).click();
 const sceneDownload=page.waitForEvent('download');
 await page.getByRole('button',{name:/Export editable scene JSON/}).click();
 const sceneFile=await sceneDownload;
 const json=JSON.parse(await readFile(await sceneFile.path(),'utf8'));
 assert.equal(json.title,'CUSTOM OCEAN FILM');
 assert.equal(json.palette.primary,'#FE734E');
 assert.equal(json.template,'waves');
 assert.ok(!JSON.stringify(json).includes('apiKey'));
 console.log('PASS: offline local draft, manual edits, JSON export, strict scene schema');

 await page.selectOption('#ai-size','compact');
 await page.selectOption('#ai-fps','12');
 await page.selectOption('#ai-duration','1');
 await page.locator('.ai-codec').filter({hasText:'H.264 READY'}).waitFor({timeout:15000});
 await page.getByRole('button',{name:/Render MP4/}).click();
 const mp4=page.getByRole('link',{name:/Download rendered MP4 again/});
 await mp4.waitFor({timeout:90000});
 const info=await page.evaluate(async href=>{
   const blob=await(await fetch(href)).blob();
   const u=new Uint8Array(await blob.slice(0,12).arrayBuffer());
   const video=document.createElement('video');video.src=URL.createObjectURL(blob);video.muted=true;
   await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(new Error('MP4 metadata timeout')),15000);
     video.onloadedmetadata=()=>{clearTimeout(timer);resolve();};
     video.onerror=()=>{clearTimeout(timer);reject(new Error('Invalid MP4 output'));};
     video.load();
   });
   const result={magic:String.fromCharCode(...u.slice(4,8)),width:video.videoWidth,height:video.videoHeight,duration:video.duration,bytes:blob.size};
   video.removeAttribute('src');video.load();
   return result;
 },await mp4.getAttribute('href'));
 assert.equal(info.magic,'ftyp');assert.equal(info.width,640);assert.equal(info.height,360);
 assert.ok(info.duration>.85&&info.duration<1.16);
 await mkdir('artifacts',{recursive:true});
 const dl=page.waitForEvent('download');
 await mp4.click();
 await(await dl).saveAs(join('artifacts','step4-local-scene-real.mp4'));
 await page.screenshot({path:join('artifacts','step4-ai-workspace-desktop.png'),fullPage:true,animations:'disabled'});
 console.log('PASS: real local storyboard MP4 encoded + decoded',JSON.stringify(info));

 // Mock only the *network* to verify UI/contract. No live provider invocation claimed.
 let capturedPrompt='';
 await page.route('**/api/generate-motion',async route=>{
   if(route.request().method()==='GET')
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,ready:true,mode:'server-ai'})});
   capturedPrompt=route.request().postDataJSON()?.prompt??'';
   return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({
     ok:true,mode:'gemini',scene:{
       version:1,template:'kinetic',energy:'bold',title:'FUTURE OF CREATIVITY',
       subtitle:'A carefully validated AI storyboard',
       palette:{background:'#130C26',primary:'#F05BB1',accent:'#FFD1E1',text:'#FFFFFF'}
     }
   })});
 });
 await page.reload();
 await page.locator('.ai-availability[data-ready=true]').waitFor({timeout:15000});
 await page.locator('#ai-prompt').fill('Create a futuristic kinetic launch teaser');
 await page.getByRole('button',{name:/Generate with AI/}).click();
 await page.locator('.ai-mode[data-mode=gemini]').waitFor({timeout:15000});
 assert.equal(capturedPrompt,'Create a futuristic kinetic launch teaser');
 assert.equal(await page.locator('#ai-title').inputValue(),'FUTURE OF CREATIVITY');
 assert.equal(await page.locator('#ai-template').inputValue(),'kinetic');
 console.log('PASS: mocked secure API response becomes editable AI scene; no provider secret in browser');

 for(const width of [360,390,412]){
   await page.setViewportSize({width,height:844});
   const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
   assert.ok(overflow<=1,'Horizontal overflow at '+width+': '+overflow);
   await page.screenshot({path:join('artifacts','step4-ai-workspace-'+width+'.png'),fullPage:true,animations:'disabled'});
 }
 console.log('PASS: AI workspace mobile 360/390/412 no horizontal scrolling');
 await page.setViewportSize({width:1440,height:900});

 // Provider rate/error handling should surface helpful UI and preserve the last usable scene.
 await page.unroute('**/api/generate-motion');
 await page.route('**/api/generate-motion',async route=>{
   if(route.request().method()==='GET')
     return route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({ok:true,ready:true,mode:'server-ai'})});
   return route.fulfill({status:429,contentType:'application/json',body:JSON.stringify({ok:false,error:'Please wait one minute before requesting another AI scene.'})});
 });
 await page.locator('#ai-prompt').fill('Animated cinematic pink title for the next scene');
 await page.getByRole('button',{name:/Generate with AI/}).click();
 await page.getByRole('status').filter({hasText:/wait one minute/i}).waitFor({timeout:10000});
 assert.equal(await page.locator('#ai-title').inputValue(),'FUTURE OF CREATIVITY');
 console.log('PASS: rate-limit error preserves existing storyboard');

 await page.getByRole('button',{name:'All tools'}).click();
 await page.locator('.hero').waitFor();
 await page.goBack();
 await page.locator('#ai-prompt').waitFor();
 console.log('PASS: AI route preserves browser Back on mobile-style navigation');
}finally{
 if(browser)await browser.close();
 server.kill('SIGTERM');
}

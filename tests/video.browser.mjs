// Browser integration: creates and decodes an actual MP4 in Chromium.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';
const url='http://127.0.0.1:4174';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4174','--strictPort'],{stdio:['ignore','pipe','pipe']});
let stderr='';
server.stdout.on('data',d=>stderr+=String(d));
server.stderr.on('data',d=>stderr+=String(d));
const wait=ms=>new Promise(r=>setTimeout(r,ms));
let browser;
async function ready(){
  for(let i=0;i<70;i++){
    try{if((await fetch(url)).ok)return;}catch{}
    if(server.exitCode!==null)throw new Error('Preview server stopped: '+stderr);
    await wait(400);
  }
  throw new Error('Preview server timeout: '+stderr);
}
try{
  await ready();
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const context=await browser.newContext({acceptDownloads:true,viewport:{width:1440,height:900}});
  const page=await context.newPage();
  await page.goto(url,{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Video Lab',exact:true}).click();
  await page.selectOption('#video-size','compact');
  await page.selectOption('#video-fps','12');
  await page.selectOption('#video-duration','1');
  console.log('Video encoder diagnostics',JSON.stringify(await page.evaluate(async()=>({encoderAvailable:typeof VideoEncoder==='function',avc:typeof VideoEncoder==='function'?await VideoEncoder.isConfigSupported({codec:'avc1.42001f',width:640,height:360,bitrate:2_000_000,framerate:12}):null,badge:document.querySelector('.codec-badge')?.outerHTML}))));
  await page.locator('.codec-badge[data-supported=true]').waitFor({timeout:15000});
  const first=await page.locator('canvas[aria-label="Canvas video preview"]').screenshot();
  await page.getByRole('button',{name:/Export MP4/}).click();
  const readyLink=page.getByRole('link',{name:/Download MP4 again/});
  await readyLink.waitFor({timeout:90000});
  const firstDecoded=await page.evaluate(async href=>{
    const blob=await (await fetch(href)).blob();
    const bytes=new Uint8Array(await blob.arrayBuffer());
    const magic=String.fromCharCode(...bytes.slice(4,8));
    const video=document.createElement('video');
    video.muted=true;video.preload='auto';video.src=URL.createObjectURL(blob);
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('MP4 metadata load timeout')),20000);
      video.onloadedmetadata=()=>{clearTimeout(timeout);resolve();};
      video.onerror=()=>{clearTimeout(timeout);reject(new Error('MP4 decode unsupported'));};
      video.load();
    });
    const info={magic,size:blob.size,width:video.videoWidth,height:video.videoHeight,duration:video.duration,canPlay:video.canPlayType('video/mp4; codecs="avc1.42001f"')};
    video.currentTime=.5;
    await new Promise((resolve,reject)=>{
      const timeout=setTimeout(()=>reject(new Error('MP4 seek timeout')),20000);
      video.onseeked=()=>{clearTimeout(timeout);resolve();};
      video.onerror=()=>{clearTimeout(timeout);reject(new Error('MP4 seek decode error'));};
    });
    info.seeked=video.currentTime;
    URL.revokeObjectURL(video.src);return info;
  },await readyLink.getAttribute('href'));
  assert.equal(firstDecoded.magic,'ftyp','output must be a genuine MP4 container');
  assert.ok(firstDecoded.size>1024,'output must not be empty');
  assert.equal(firstDecoded.width,640);assert.equal(firstDecoded.height,360);
  assert.ok(firstDecoded.duration>.85&&firstDecoded.duration<1.16,'encoded length ≈1 second: '+firstDecoded.duration);
  assert.ok(firstDecoded.seeked>.4,'MP4 must support seeking');
  console.log('PASS: real silent MP4 encode + decode + metadata + seek',JSON.stringify(firstDecoded));
  await mkdir('artifacts',{recursive:true});
  await page.screenshot({path:join('artifacts','video-editor-desktop.png'),fullPage:true,animations:'disabled'});
  const event=page.waitForEvent('download');
  await readyLink.click();
  const item=await event, file=await readFile(await item.path());
  assert.equal(file.subarray(4,8).toString('ascii'),'ftyp');
  console.log('PASS: manual MP4 download has real ftyp header',item.suggestedFilename());
  for(const width of [360,390,412]){
    await page.setViewportSize({width,height:844});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,'Video Lab horizontal overflow at '+width+': '+overflow);
    await page.screenshot({path:join('artifacts','video-editor-mobile-'+width+'.png'),fullPage:true,animations:'disabled'});
  }
  console.log('PASS: video controls and canvas at 360 / 390 / 412');

  await page.setViewportSize({width:1440,height:900});
  await page.selectOption('#video-size','portrait');
  await page.selectOption('#video-fps','30');
  await page.selectOption('#video-duration','12');
  await page.locator('.codec-badge[data-supported=true]').waitFor({timeout:15000});
  await page.getByRole('button',{name:/Export MP4/}).click();
  await page.getByRole('button',{name:'Cancel export'}).click();
  await page.getByRole('status').filter({hasText:/cancelled/i}).waitFor({timeout:25000});
  assert.equal(await page.getByRole('link',{name:/Download MP4 again/}).count(),0,'cancelled render must not provide file');
  console.log('PASS: long export cancellation prevents partial download');

  // Check unsupported-codec state in a fresh isolated browser context.
  const unsupported=await browser.newContext();
  await unsupported.addInitScript(()=>Object.defineProperty(window,'VideoEncoder',{value:undefined,configurable:true}));
  const unsupportedPage=await unsupported.newPage();
  await unsupportedPage.goto(url,{waitUntil:'domcontentloaded'});
  await unsupportedPage.getByRole('button',{name:'Video Lab',exact:true}).click();
  await unsupportedPage.locator('.codec-badge[data-supported=false]').waitFor({timeout:10000});
  assert.equal(await unsupportedPage.getByRole('button',{name:/Export MP4/}).isDisabled(),true);
  await unsupported.close();
  console.log('PASS: unsupported encoder disables export with explicit message');
}finally{
 if(browser)await browser.close();
 server.kill('SIGTERM');
}

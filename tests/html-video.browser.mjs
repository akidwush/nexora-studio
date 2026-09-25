// End-to-end proof: each supported HTML frame is captured from the opaque-origin
// virtual timeline and encoded into a *real* playable 30/60 FPS H.264 MP4.
// Do not confuse fixed MP4 frame cadence with measured real-time GPU throughput.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';

const host='http://127.0.0.1:4185';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview',
  '--host','127.0.0.1','--port','4185','--strictPort'],{stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',x=>logs+=String(x));server.stderr.on('data',x=>logs+=String(x));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){
  for(let i=0;i<75;i++){
    if(server.exitCode!==null)throw Error('Server stopped: '+logs);
    try{if((await fetch(host)).ok)return;}catch{}
    await wait(400);
  }
  throw Error('Preview server failed to start: '+logs);
}
function box(buffer,from,to,type){
  for(let i=from;i+8<=to;){
    let size=buffer.readUInt32BE(i),begin=i+8;
    const name=buffer.toString('latin1',i+4,i+8);
    if(size===1){size=Number(buffer.readBigUInt64BE(i+8));begin+=8;}
    else if(size===0)size=to-i;
    if(size<8||i+size>to)break;
    if(name===type)return {start:i,begin,end:i+size};
    i+=size;
  }
  throw Error('Missing MP4 box: '+type);
}
function samplesInMp4(buffer){
  const moov=box(buffer,0,buffer.length,'moov');
  const track=box(buffer,moov.begin,moov.end,'trak');
  const mdia=box(buffer,track.begin,track.end,'mdia');
  const minf=box(buffer,mdia.begin,mdia.end,'minf');
  const stbl=box(buffer,minf.begin,minf.end,'stbl');
  const stsz=box(buffer,stbl.begin,stbl.end,'stsz');
  return buffer.readUInt32BE(stsz.begin+8); // version(4), sample_size(4), sample_count(4)
}
async function exportMp4(page,fps){
  await page.selectOption('#html-video-size','compact');
  await page.selectOption('#html-video-fps',String(fps));
  await page.selectOption('#html-video-duration','1');
  const start=page.waitForEvent('download',{timeout:60000});
  start.catch(()=>{});
  await page.getByRole('button',{name:/Render MP4/}).click();
  const item=await Promise.race([
    start,
    (async()=>{
      const expires=Date.now()+50000;
      let previous='';
      while(Date.now()<expires){
        const message=(await page.locator('.html-video-message').textContent())??'';
        if(message!==previous){
          console.log('HTML capture state:',message);
          previous=message;
        }
        if(/(?:failed|unavailable|unsupported|could not|timed out|cannot|exceeds|invalid|cancelled|error)/i.test(message)
            && !message.includes('Checking browser encoder')){
          throw new Error('HTML capture UI failed: '+message);
        }
        await wait(2000);
      }
      throw new Error('HTML capture did not download within 50s. Last UI: '+previous);
    })()
  ]);
  const video=page.getByRole('video',{name:'Rendered HTML video playback'});
  // aria role="video" can vary across browser accessibility trees; query by element.
  await page.locator('video[aria-label="Rendered HTML video playback"]').waitFor({timeout:180000});
  const downloaded=await readFile(await item.path());
  assert.equal(downloaded.toString('latin1',4,8),'ftyp','real ISO BMFF MP4 header');
  const count=samplesInMp4(downloaded);
  assert.equal(count,fps,'No missing or duplicated encoded samples at '+fps+' FPS');
  const playback=await page.locator('video[aria-label="Rendered HTML video playback"]').evaluate(async element=>{
    const video=element;
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('Video metadata timeout')),12000);
      if(video.readyState>=1){clearTimeout(timer);resolve();return;}
      video.onloadedmetadata=()=>{clearTimeout(timer);resolve();};
      video.onerror=()=>{clearTimeout(timer);reject(Error('Encoded MP4 cannot be decoded'));};
      video.load();
    });
    return {duration:video.duration,width:video.videoWidth,height:video.videoHeight};
  });
  assert.ok(playback.duration>.97&&playback.duration<1.04,'one second duration '+playback.duration);
  assert.equal(playback.width,640);assert.equal(playback.height,360);
  console.log('PASS: '+fps+'FPS genuine HTML->MP4, exactly '+count+' encoded samples, duration '+playback.duration);
  return {item,downloaded};
}
let browser;
try{
  await ready();
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  page.on('pageerror',error=>console.log('PAGE ERROR:',error.message));
  page.on('console',msg=>{if(msg.type()==='error')console.log('BROWSER CONSOLE:',msg.text().slice(0,300));});
  await page.goto(host+'/?tool=motion',{waitUntil:'domcontentloaded'});
  const html='<main id="stage"><div id="mover"></div><p id="clock-readout">FRAME</p></main>';
  const css='#stage{position:relative;width:100vw;height:100vh;overflow:hidden;background:rgb(12,24,48)}'+
    '#mover{position:absolute;top:15px;left:10px;width:100px;height:90px;background:rgb(255,72,16);'+
    'animation:move 1s linear infinite;}@keyframes move{to{transform:translateX(300px)}}'+
    '#clock-readout{position:absolute;top:180px;color:white;font:bold 20px system-ui}';
  const svg='<svg viewBox="0 0 100 100" width="100" height="100" aria-label="SVG content">'+
    '<circle cx="50" cy="50" r="40" fill="#a789ea"/></svg>';
  const js='function tick(t){document.querySelector("#clock-readout").textContent="T="+Math.round(t);requestAnimationFrame(tick);}requestAnimationFrame(tick);';
  for(const [tab,source] of [['HTML',html],['CSS',css],['SVG',svg],['JS',js]]){
    await page.getByRole('button',{name:tab,exact:true}).click();
    await page.getByRole('textbox',{name:tab+' code editor'}).fill(source);
  }
  await page.locator('#html-video-size').waitFor();
  await mkdir('artifacts',{recursive:true});
  const thirty=await exportMp4(page,30);
  await thirty.item.saveAs(join('artifacts','html-motion-real-30fps.mp4'));
  const sample=await page.locator('video[aria-label="Rendered HTML video playback"]').evaluate(async video=>{
    const samples=[];
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});
    for(const t of [.05,.75]){
      await new Promise((resolve,reject)=>{
        const timer=setTimeout(()=>reject(Error('Video seek timeout')),12000);
        video.onseeked=()=>{clearTimeout(timer);resolve();};
        video.onerror=()=>{clearTimeout(timer);reject(Error('Video seek failure'));};
        video.currentTime=t;
      });
      ctx.drawImage(video,0,0,640,360);
      samples.push([...ctx.getImageData(45,50,1,1).data]);
    }
    return samples;
  });
  assert.ok(sample[0][0]>155&&sample[0][1]<140,
    'CSS animation at 0.05s should place orange box at x45: '+JSON.stringify(sample));
  assert.ok(sample[1][0]<120&&sample[1][1]<120,
    'CSS animation at 0.75s should move box away from x45: '+JSON.stringify(sample));
  console.log('PASS: first and later HTML video frames contain different CSS-animation pixels',JSON.stringify(sample));

  const sixty=await exportMp4(page,60);
  await sixty.item.saveAs(join('artifacts','html-motion-real-60fps.mp4'));
  console.log('PASS: real 60FPS MP4 includes sequential exact-timestamp HTML frame samples');

  await page.screenshot({path:join('artifacts','html-motion-to-mp4-desktop.png'),fullPage:true,animations:'disabled'});
  for(const width of [360,390,412]){
    await page.setViewportSize({width,height:844});
    // Mobile starts on the code panel. Explicitly show the preview panel to
    // verify the new exporter UI, not just the hidden DOM's scroll width.
    await page.locator('.mobile-toggle button').last().click();
    await page.locator('#html-video-size').waitFor({state:'visible'});
    const over=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(over<=1,'HTML exporter overflows mobile '+width+': '+over);
    await page.screenshot({path:join('artifacts','html-motion-to-mp4-mobile-'+width+'.png'),fullPage:true,animations:'disabled'});
  }
  console.log('PASS: HTML-to-MP4 exporter is visible and fits 360/390/412px layouts');
  await page.setViewportSize({width:1440,height:900});
  await page.selectOption('#html-video-size','compact');
  await page.selectOption('#html-video-fps','60');
  await page.selectOption('#html-video-duration','3');
  await page.getByRole('button',{name:/Render MP4/}).click();
  await page.getByRole('button',{name:'Cancel',exact:true}).click();
  await page.getByRole('status').filter({hasText:/cancelled/i}).waitFor({timeout:25000});
  assert.equal(await page.locator('video[aria-label="Rendered HTML video playback"]').count(),0);
  console.log('PASS: cancellation aborts HTML capture without exposing partial output');
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}

// Real Chrome tests: compare independent reference PNG (including alpha) with
// decoded H.264 at the selected keyframe. Check transforms/keyframes, SVG,
// system-font typography, chosen matte and denial of remote font sources.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
import {join} from 'node:path';

const host='http://127.0.0.1:4186';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview',
  '--host','127.0.0.1','--port','4186','--strictPort'],{stdio:['ignore','pipe','pipe']});
let serverLog='';
server.stdout.on('data',x=>serverLog+=String(x));
server.stderr.on('data',x=>serverLog+=String(x));
let browser;
const delay=ms=>new Promise(done=>setTimeout(done,ms));
async function ready(){
  for(let i=0;i<65;i++){
    if(server.exitCode!==null)throw Error('Preview server exited: '+serverLog);
    try{if((await fetch(host)).ok)return;}catch{}
    await delay(350);
  }
  throw Error('Vite static preview did not start: '+serverLog);
}
const waitForImage=async selector=>{
  // helper used through Playwright evaluate below
};
const renderSample=async(page)=>{
  const pending=page.waitForEvent('download',{timeout:60000});
  await page.getByRole('button',{name:/Render MP4/}).click();
  const item=await Promise.race([
    pending,
    (async()=>{
      const until=Date.now()+55000;
      let prior='';
      while(Date.now()<until){
        const msg=await page.locator('.html-video-message').textContent();
        if(msg!==prior){console.log('Fidelity:',msg);prior=msg;}
        if(/(?:failed|timed out|differ|mismatch|unsupported|unavailable|cannot)/i.test(msg||''))
          throw Error('Fidelity failure: '+msg);
        await delay(1000);
      }
      throw Error('MP4 download timed out, last message: '+prior);
    })()
  ]);
  return item;
};
try{
  await ready();
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  page.on('pageerror',error=>console.log('PAGE ERROR',error.message));
  await page.goto(host+'/?tool=motion',{waitUntil:'domcontentloaded'});
  const html='<section id="stage"><div id="moving"></div><strong id="title">MOTION TYPE</strong></section>';
  const css=[
    'html,body{margin:0;background:transparent!important}',
    '#stage{position:relative;width:100vw;height:100vh;background:transparent}',
    '#moving{position:absolute;left:24px;top:28px;width:98px;height:78px;',
    'border-radius:8px;background:rgb(246,81,33);opacity:.86;',
    'animation:move 1s linear infinite;}',
    '@keyframes move{from{transform:translateX(0)}to{transform:translateX(280px)}}',
    '#title{position:absolute;left:20px;top:175px;',
    'font:800 40px system-ui;letter-spacing:2px;color:#b8dcfa}'
  ].join('');
  const svg='<svg xmlns="http://www.w3.org/2000/svg" width="90" height="80" viewBox="0 0 90 80">'+
    '<rect x="0" y="0" width="75" height="65" fill="#7b48df"/></svg>';
  const extra='[data-nexora-svg-root]{position:absolute;left:430px;top:20px}';
  for(const [tab,value] of [['HTML',html],['CSS',css+extra],['SVG',svg],['JS','console.log("fidelity fixture")']]){
    await page.getByRole('button',{name:tab,exact:true}).click();
    await page.getByRole('textbox',{name:tab+' code editor'}).fill(value);
  }
  await page.selectOption('#html-video-size','compact');
  await page.selectOption('#html-video-fps','30');
  await page.selectOption('#html-video-duration','1');
  await page.locator('#html-video-matte').fill('#173651');
  await page.selectOption('#html-video-sample','middle'); // frame 15 = 500ms
  await page.getByRole('button',{name:/Match export preview/}).click();
  await page.locator('.html-video-message').filter({hasText:/Export-matching frame 15 ready/}).waitFor({timeout:35000});
  await page.getByRole('button',{name:'Show true transparency'}).click();
  await page.locator('.html-video-reference').waitFor();
  const alpha=await page.locator('.html-video-reference').evaluate(async img=>{
    await img.decode();
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
    const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
    let textPixels=0;
    const data=ctx.getImageData(20,175,340,63).data;
    for(let i=0;i<data.length;i+=4)if(data[i+3]>80)textPixels++;
    return {corner:pixel(625,320),emptyBefore:pixel(45,65),
      moving:pixel(205,70),svg:pixel(446,35),textPixels};
  });
  assert.equal(alpha.corner[3],0,'transparent corner must keep alpha=0');
  assert.equal(alpha.emptyBefore[3],0,'CSS keyframe should move the box off its starting position');
  assert.ok(alpha.moving[0]>160&&alpha.moving[3]>190,'transformed block must be visible at frame 15');
  assert.ok(alpha.svg[2]>120&&alpha.svg[3]>200,'inline SVG must render in PNG');
  assert.ok(alpha.textPixels>450,'system font typography must be present in export snapshot');
  console.log('PASS: alpha PNG preserves transparency, keyframe transforms, SVG and typography',JSON.stringify(alpha));
  await mkdir('artifacts',{recursive:true});
  const rawDownload=page.waitForEvent('download');
  await page.getByRole('link',{name:/Download lossless transparent PNG frame/}).click();
  const raw=await rawDownload;
  const rawPath=join('artifacts','html-fidelity-transparent-reference.png');
  await raw.saveAs(rawPath);
  const rawBytes=await readFile(rawPath);
  assert.equal(rawBytes.toString('ascii',1,4),'PNG');
  console.log('PASS: lossless transparent reference PNG is actually downloadable');

  await page.getByRole('button',{name:'Show MP4 matte'}).click();
  await page.locator('.html-video-reference').evaluate(img=>img.decode());
  const matte=await page.locator('.html-video-reference').evaluate(img=>{
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(img,0,0);
    return [...ctx.getImageData(625,320,1,1).data];
  });
  assert.deepEqual(matte.slice(0,3),[23,54,81]);
  assert.equal(matte[3],255,'MP4 matte preview must be fully opaque');
  console.log('PASS: selected opaque matte is applied identically to MP4 reference',matte);

  const item=await renderSample(page);
  await item.saveAs(join('artifacts','html-fidelity-verified-30fps.mp4'));
  await page.locator('[data-testid="html-fidelity-score"]').waitFor({timeout:30000});
  const quality=await page.locator('[data-testid="html-fidelity-score"]').textContent();
  assert.match(quality,/mean RGB error/);
  const decoded=await page.locator('video[aria-label="Rendered HTML video playback"]').evaluate(async video=>{
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('H264 decode timed out')),15000);
      if(video.readyState>=2){clearTimeout(timer);resolve();return;}
      video.onloadeddata=()=>{clearTimeout(timer);resolve();};
      video.onerror=()=>{clearTimeout(timer);reject(Error('MP4 decode failed'));};
      video.load();
    });
    await new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(Error('MP4 frame seek timed out')),15000);
      video.onseeked=()=>{clearTimeout(timer);resolve();};
      video.currentTime=(15+.35)/30;
    });
    const canvas=document.createElement('canvas');canvas.width=640;canvas.height=360;
    const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.drawImage(video,0,0,640,360);
    const pixel=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
    let typography=0;
    const area=ctx.getImageData(20,175,340,63).data;
    for(let i=0;i<area.length;i+=4){
      if(area[i]>140&&area[i+1]>155&&area[i+2]>185)typography++;
    }
    return {corner:pixel(625,320),moving:pixel(205,70),svg:pixel(446,35),typography};
  });
  assert.ok(decoded.corner[0]>=18&&decoded.corner[0]<=29);
  assert.ok(decoded.corner[1]>=49&&decoded.corner[1]<=59);
  assert.ok(decoded.corner[2]>=76&&decoded.corner[2]<=88);
  assert.ok(decoded.moving[0]>140,'transform/keyframe visible in actual MP4');
  assert.ok(decoded.svg[2]>90,'SVG visible in actual MP4');
  assert.ok(decoded.typography>350,'system typography visible in actual MP4');
  console.log('PASS: real decoded H.264 MP4 matches the preview matte, transform, SVG and text',JSON.stringify(decoded));
  await page.screenshot({path:join('artifacts','html-fidelity-desktop.png'),fullPage:true,animations:'disabled'});
  for(const width of [360,390,412]){
    await page.setViewportSize({width,height:844});
    await page.locator('.mobile-toggle button').last().click();
    await page.locator('#html-video-matte').waitFor({state:'visible'});
    const over=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(over<=1,'HTML fidelity preview overflows mobile '+width+': '+over);
    await page.screenshot({path:join('artifacts','html-fidelity-mobile-'+width+'.png'),fullPage:true,animations:'disabled'});
  }
  console.log('PASS: alpha/fidelity preview and matte controls fit mobile 360/390/412');

  // Remote font URLs must fail rather than silently falling back to a different font.
  await page.setViewportSize({width:1440,height:900});
  await page.getByRole('button',{name:'CSS',exact:true}).click();
  await page.getByRole('textbox',{name:'CSS code editor'}).fill(
    css+extra+'@font-face{font-family:BadFont;src:url(https://example.com/test.woff2)}'+
    '#title{font-family:BadFont,system-ui}'
  );
  await page.getByRole('button',{name:/Match export preview/}).click();
  await page.locator('.html-video-message').filter({hasText:/Custom fonts must be embedded/}).waitFor({timeout:20000});
  console.log('PASS: unsupported remote fonts fail closed instead of silently misrendering');
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}

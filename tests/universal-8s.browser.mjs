// End-to-end universal 8-second reference workload: Canvas2D black-hole art + CSS
// animation + inline JavaScript, submitted as ONE original HTML document.
// Uses built production UI and native Chrome/WebCodecs/OPFS, not a fake codec.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn,execFileSync} from 'node:child_process';
import {readFile,mkdir,writeFile} from 'node:fs/promises';
import {inspectAndroidMp4} from '../src/lib/android-mp4.js';

const host='http://127.0.0.1:4199';
const output='artifacts/studio-black-hole-8-seconds.mp4';
const source=await readFile(new URL('../fixtures/black-hole-8s.html',import.meta.url),'utf8');
assert.match(source,/<style>/);
assert.match(source,/<script>/);
assert.match(source,/getContext\(['"]2d/);
assert.doesNotMatch(source,/https?:\/\//);
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host',
  '127.0.0.1','--port','4199','--strictPort'],{stdio:['ignore','pipe','pipe']});
let serverLog='';
server.stdout.on('data',part=>serverLog+=String(part));
server.stderr.on('data',part=>serverLog+=String(part));
const wait=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function awaitMatchingFrame(page,timeoutMs){
  const deadline=Date.now()+timeoutMs;
  let last='';
  while(Date.now()<deadline){
    const status=(await page.locator('.html-video-message').textContent())||'';
    if(status!==last){console.log('PREVIEW DIAGNOSTIC:',status);last=status;}
    const detail=page.locator('.html-render-failure-detail');
    if(await detail.count())
      throw Error('Matching preview failed: '+status+' / '+(await detail.allTextContents()).join(' | '));
    if(/Pratinjau siap/i.test(status))return;
    if(/script failed|preview failed|WebGL context|shader|unsupported module|could not initialize/i.test(status))
      throw Error('Matching preview failed early: '+status);
    await wait(300);
  }
  throw Error('Matching preview did not finish: '+last);
}
let browser;
try{
  let ready=false;
  for(let n=0;n<100;n++){
    try{if((await fetch(host)).ok){ready=true;break;}}catch{}
    if(server.exitCode!==null)throw Error('Studio preview server failed: '+serverLog);
    await wait(250);
  }
  assert.ok(ready,'Studio preview server unavailable: '+serverLog);
  browser=await chromium.launch({channel:'chrome',headless:true,args:[
    '--no-sandbox','--use-gl=angle','--use-angle=swiftshader',
    '--enable-unsafe-swiftshader','--enable-webgl'
  ]});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  // Simulate only the operating-system save dialog, keeping the real engine
  // OPFS staging, StreamTarget, Canvas2D renderer and H.264 encoder untouched.
  await page.addInitScript(()=>{
    const chunks=[];
    window.__cinematicOutput=chunks;
    window.__cinematicWrites=0;
    Object.defineProperty(navigator,'deviceMemory',{value:8,configurable:true});
    Object.defineProperty(window,'showSaveFilePicker',{configurable:true,
      value:async()=>({
        createWritable:async()=>new WritableStream({
          write(chunk){window.__cinematicWrites++;chunks.push(chunk);}
        }),
        getFile:async()=>new Blob(chunks,{type:'video/mp4'})
      })
    });
  });
  const errors=[];
  page.on('pageerror',error=>errors.push(String(error).slice(0,170)));
  page.on('console',item=>{
    if(item.text().includes('BLACKHOLE_SHADER_PROBE')||item.type()==='error')
      console.log('SANDBOX CONSOLE:',item.text().slice(0,280));
  });
  await page.goto(host+'/?tool=motion',{waitUntil:'domcontentloaded'});
  await page.getByRole('button',{name:'Full HTML file · WebGL'}).click();
  await page.getByRole('textbox',{name:'Full HTML document code editor'}).fill(source);
  await page.getByRole('button',{name:/Run preview/}).click();
  await page.locator('#html-video-fps').evaluate(element=>{element.closest('details').open=true;});
  await page.selectOption('#html-video-size','compact');
  await page.selectOption('#html-video-fps','30');
  await page.selectOption('#html-video-duration','8');
  await page.selectOption('#html-video-storage','stream');
  await page.getByRole('button',{name:/Pratinjau/}).click();
  await awaitMatchingFrame(page,100000);
  const reference=page.getByAltText('Exact export-matching frame');
  await reference.waitFor({timeout:30000});
  const originalSrc=await reference.getAttribute('src');
  const previewProof=await reference.evaluate(async img=>{
    await img.decode();
    const c=document.createElement('canvas');
    c.width=img.naturalWidth;c.height=img.naturalHeight;
    const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
    window.__firstShaderPreview=ctx.getImageData(0,0,c.width,c.height).data;
    const sample=(x,y)=>[...ctx.getImageData(x,y,1,1).data];
    return {ring:sample(410,180),horizon:sample(320,180)};
  });
  console.log('BLACK-HOLE FIRST FRAME PREVIEW PIXELS:',JSON.stringify(previewProof));
  assert.ok(previewProof.ring[0]>85&&previewProof.horizon[0]<50,
    'Original preview must show the actual black-hole canvas before exporting: '+
      JSON.stringify(previewProof));
  // Replaying frame zero in a fresh sandbox must be pixel-repeatable before
  // we ask the user to trust the same independent preview/export contract.
  await page.getByRole('button',{name:/Pratinjau/}).click();
  await page.locator('.html-video-message').filter({hasText:/Mempersiapkan|timeline/i})
    .waitFor({timeout:10000});
  await awaitMatchingFrame(page,100000);
  await page.waitForFunction(old=>{
    const img=document.querySelector('img.html-video-reference');
    return Boolean(img&&img.src!==old&&img.complete&&img.naturalWidth===640);
  },originalSrc,{timeout:30000});
  const repeated=await reference.evaluate(async img=>{
    await img.decode();
    const c=document.createElement('canvas');c.width=img.naturalWidth;c.height=img.naturalHeight;
    const ctx=c.getContext('2d');ctx.drawImage(img,0,0);
    const left=window.__firstShaderPreview,right=ctx.getImageData(0,0,c.width,c.height).data;
    let total=0,severe=0;
    for(let i=0;i<left.length;i+=4){
      let peak=0;
      for(let channel=0;channel<3;channel++){
        const d=Math.abs(left[i+channel]-right[i+channel]);
        total+=d;peak=Math.max(peak,d);
      }
      if(peak>9)severe++;
    }
    return {meanRGB:total/(c.width*c.height*3),
      severeFraction:severe/(c.width*c.height)};
  });
  console.log('INDEPENDENT BLACK-HOLE FRAME 0 PREVIEW REPEATABILITY:',JSON.stringify(repeated));
  assert.ok(repeated.meanRGB<2&&repeated.severeFraction<.016,
    'Two independent captures of shader frame 0 must agree before export: '+JSON.stringify(repeated));
  assert.equal(await page.getByRole('button',{name:/Buat Video/}).isEnabled(),true);
  assert.equal(await page.evaluate(()=>window.__cinematicWrites),0,
    'No destination bytes may be written before fidelity checks complete.');
  await page.getByRole('button',{name:/Buat Video/}).click();
  let finished=false,last='';
  const complete=page.locator('.html-video-message')
    .filter({hasText:/Video berhasil dibuat/i}).waitFor({timeout:480000});
  complete.catch(()=>{});
  await Promise.race([
    complete,
    (async()=>{
      for(let n=0;n<1600&&!finished;n++){
        const status=await page.locator('.html-video-message').textContent()||'';
        if(status!==last){console.log('BLACK HOLE:',status);last=status;}
        const failure=page.locator('.html-render-failure-detail');
        if(await failure.count()){
          const detail=await failure.allTextContents();
          throw Error('8s black-hole export failed: '+status+' '+detail.join(' ')+
            '; script errors: '+errors.slice(-5).join(' | '));
        }
        if(status.includes('Video berhasil dibuat'))return;
        await wait(300);
      }
      if(!finished)throw Error('8s black-hole render timed out: '+last+
        '; script errors: '+errors.slice(-5).join(' | '));
    })()
  ]);
  finished=true;
  const quality=await page.getByTestId('html-fidelity-score').textContent();
  for(const index of [0,60,120,180,239])
    assert.match(quality,new RegExp('Frame '+index+': RGB'),
      '8-second output must verify all five distributed timeline checkpoints');
  assert.match(await page.locator('.html-render-compatibility').textContent(),
    /avc1\.42.*Fast Start/i);
  assert.ok((await page.evaluate(()=>window.__cinematicWrites))>0,
    'Verified file must be committed to the selected output.');
  const encoded=await page.evaluate(async()=>{
    const bytes=new Blob(window.__cinematicOutput,{type:'video/mp4'});
    if(bytes.size<1024)throw Error('Empty cinematic MP4 save destination.');
    return await new Promise((resolve,reject)=>{
      const reader=new FileReader();
      reader.onload=()=>resolve(reader.result.split(',')[1]);
      reader.onerror=()=>reject(reader.error);
      reader.readAsDataURL(bytes);
    });
  });
  const saved=Buffer.from(encoded,'base64');
  await mkdir('artifacts',{recursive:true});
  await writeFile(output,saved);
  const header=await inspectAndroidMp4(new Blob([saved],{type:'video/mp4'}),
    {expectedFrames:240});
  assert.equal(header.fastStart,true);
  assert.equal(header.profile,66);
  assert.ok(header.level<=31);
  const info=JSON.parse(execFileSync('ffprobe',[
    '-v','error','-count_frames','-show_entries',
    'format=duration:stream=codec_name,profile,level,pix_fmt,width,height,nb_read_frames',
    '-of','json',output
  ],{encoding:'utf8',maxBuffer:2_000_000,timeout:120000}));
  const video=info.streams?.find(item=>item.codec_name==='h264');
  assert.ok(video,'Independent FFprobe must find the actual H.264 stream.');
  assert.equal(video.width,640);assert.equal(video.height,360);
  assert.equal(video.pix_fmt,'yuv420p');
  assert.equal(+video.nb_read_frames,240);
  assert.ok(Math.abs(+info.format.duration-8)<.07,'MP4 must last eight seconds.');
  const rendered=execFileSync('ffmpeg',[
    '-v','error','-i',output,'-vf',
    'select=eq(n\\,0)+eq(n\\,120)+eq(n\\,239)',
    '-vsync','0','-pix_fmt','rgb24','-f','rawvideo','-'
  ],{maxBuffer:3_000_000,timeout:120000});
  const size=640*360*3;
  assert.equal(rendered.byteLength,3*size,'FFmpeg must independently decode three actual frames.');
  // The orange accretion ring must exist and animate; the independent pixel
  // test catches "moving HUD over a frozen / missing animated black-hole canvas" false PASS.
  const ringPixel=frame=>{
    const at=frame*size+(180*640+410)*3;
    return [...rendered.subarray(at,at+3)];
  };
  const colors=[ringPixel(0),ringPixel(1),ringPixel(2)];
  assert.ok(colors[0][0]>85,'The decoded animated black-hole canvas accretion ring must be visible.');
  assert.ok(Math.max(...colors.map(rgb=>rgb[1]))-
    Math.min(...colors.map(rgb=>rgb[1]))>20,
    'The black-hole canvas itself must visibly change between decoded frames: '+JSON.stringify(colors));
  console.log('PASS: real 8s black-hole canvas + CSS/JS -> 240-frame 640x360 H.264; five real decoded-frame fidelity checks; independent FFprobe and animated-ring FFmpeg evidence. '+JSON.stringify({
    bytes:saved.length,codec:header.codec,level:header.level,
    duration:info.format.duration,frames:video.nb_read_frames,ringSamples:colors
  }));
  await page.screenshot({path:'artifacts/black-hole-8s-studio-ui.png',fullPage:true});

  // Opt-in HD must be offered only when a browser advertises desktop-class
  // memory and real local OPFS streaming; do not silently promote mobile.
  await page.selectOption('#html-video-size','landscape');
  assert.equal(await page.locator('#html-video-duration').inputValue(),'8');
  await page.getByRole('button',{name:/Pratinjau/}).click();
  await awaitMatchingFrame(page,150000);
  const hdDimensions=await page.getByAltText('Exact export-matching frame')
    .evaluate(img=>({width:img.naturalWidth,height:img.naturalHeight}));
  assert.deepEqual(hdDimensions,{width:1280,height:720},
    'Desktop opt-in 720p must capture native resolution, not upscale 360p.');
  await page.selectOption('#html-video-storage','download');
  assert.equal(await page.locator('#html-video-duration').inputValue(),'8',
    'Incompatible storage must never silently shorten the video.');
  assert.match(await page.locator('.compatibility-choice').textContent(),/640×360/);
  assert.equal(await page.getByRole('button',{name:/Buat Video/}).isDisabled(),true);
  console.log('PASS: desktop 8s HD preview is native 1280x720; incompatible download fails closed without changing duration.');

  for(const width of [360,390,412]){
    await page.setViewportSize({width,height:820});
    await page.goto(host+'/?tool=motion',{waitUntil:'domcontentloaded'});
    assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),
      'No horizontal overflow at '+width+'px.');
    const buttons=await page.locator('.html-video-actions button').all();
    for(const button of buttons){const box=await button.boundingBox();if(box)assert.ok(box.height>=43,'Touch target too short at '+width+'px');}
  }
  console.log('PASS: simple exporter has no horizontal overflow at Android 360/390/412 widths.');
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}

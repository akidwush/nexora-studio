// Stage A/B Chromium matrix: different effects, custom embedded font, broken
// assets, three decoded frames, transactional OPFS StreamTarget + file backpressure.
// Fixtures live in this file so any failed report can be replayed locally.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,readdir,stat,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const host='http://127.0.0.1:4188';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4188','--strictPort'],
  {stdio:['ignore','pipe','pipe']});
let log='';server.stdout.on('data',d=>log+=String(d));server.stderr.on('data',d=>log+=String(d));
let browser;
try{
  let ready=false;
  for(let i=0;i<75;i++){
    if(server.exitCode!==null)throw Error('Dev browser server exited: '+log);
    try{if((await fetch(host)).ok){ready=true;break;}}catch{}
    await new Promise(done=>setTimeout(done,250));
  }
  if(!ready)throw Error('Dev browser server did not start: '+log);
  const fontDir='vendor/studio-pro/public/fonts';
  const files=(await readdir(fontDir)).filter(name=>name.endsWith('.woff2'));
  const sizes=await Promise.all(files.map(async name=>({name,bytes:(await stat(join(fontDir,name))).size})));
  const chosen=sizes.filter(item=>item.bytes<65_000).sort((a,b)=>a.bytes-b.bytes)[0];
  assert.ok(chosen,'Pinned editor must include at least one bounded local custom WOFF2 for the test');
  const encodedFont=(await readFile(join(fontDir,chosen.name))).toString('base64');
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1120,height:850}});
  page.on('pageerror',error=>console.log('MATRIX PAGE ERROR',error.message));
  await page.goto(host+'/?tool=motion',{waitUntil:'domcontentloaded'});
  const results=await page.evaluate(async fontData=>{
    const {captureHtmlFrame,encodeHtmlVideo}=await import('/src/lib/html-video.js');
    const {makeRenderReport}=await import('/src/lib/render-fidelity-report.js');
    const {criticalFrameIndices,supportsStreamingSave}=await import('/src/lib/mp4-output-sink.js');
    const image=document.createElement('canvas');image.width=18;image.height=18;
    image.getContext('2d').fillStyle='#21da9a';
    image.getContext('2d').fillRect(0,0,18,18);
    const src=image.toDataURL('image/png');
    const options={size:'compact',fps:24,duration:1,matte:'#173651'};
    const sample=criticalFrameIndices(24);
    const fixtures=[
      {
        id:'transform-opacity-embedded-custom-font-and-image',
        html:'<main class="fixture"><div class="moving"></div><h1 class="font-test">STUDIO</h1><img width="18" height="18" src="'+src+'"></main>',
        css:'@font-face{font-family:TestEmbedded;src:url(data:font/woff2;base64,'+fontData+') format("woff2");font-weight:400}'+
          'html,body{background:transparent!important}.fixture{position:relative;width:100vw;height:100vh}'+
          '.moving{position:absolute;left:10px;top:25px;width:90px;height:90px;background:#f09b55;opacity:.82;'+
          'animation:shift 1s linear infinite}@keyframes shift{to{transform:translateX(240px) rotate(38deg)}}'+
          '.font-test{position:absolute;left:30px;top:170px;font:400 38px TestEmbedded,system-ui;color:#e1ddc5}',
        svg:'<svg xmlns="http://www.w3.org/2000/svg" width="82" height="65">'+
          '<rect x="4" y="4" width="72" height="55" rx="12" fill="#7d4de7"/></svg>',
        js:''
      },
      {
        id:'gradients-opacity-shadow-svg-pseudo-element',
        html:'<main id="stage"><section class="panel"><span>LIGHT</span></section></main>',
        css:'html,body{background:transparent!important}#stage{width:100vw;height:100vh;position:relative}'+
          '.panel{width:230px;height:140px;margin:30px;padding:14px;opacity:.83;'+
          'background:linear-gradient(110deg,#bb3de1,#37c6cb);box-shadow:0 13px 17px #2b426680;'+
          'animation:reveal 1s linear infinite}@keyframes reveal{to{transform:translateX(110px) scale(.88)}}'+
          '.panel span{color:white;font:700 30px system-ui}.panel:after{content:"✓";color:#fff}',
        svg:'<svg xmlns="http://www.w3.org/2000/svg" width="70" height="65"><circle cx="30" cy="30" r="25" fill="#e5c751"/></svg>',
        js:''
      }
    ];
    // Headless Chrome may hide the real picker. We inject the file handle
    // directly while retaining real OPFS + StreamTarget + WritableStream IO.
    if(!window.showSaveFilePicker)Object.defineProperty(window,'showSaveFilePicker',{
      configurable:true,value:async()=>{throw Error('Picker not used by injected-handle test');}
    });
    const output=[],failureReports=[];
    for(let k=0;k<fixtures.length;k++){
      const fixture=fixtures[k];
      const input={...fixture,...options};
      const preview=await captureHtmlFrame(input,sample[1]);
      let quality=null,report=null;
      let writes=0,fileHandle=null;
      if(k===1&&supportsStreamingSave({
        isSecureContext:window.isSecureContext,
        showSaveFilePicker:()=>{},navigator,
        WritableStream
      })){
        const chunks=[];
        fileHandle={
          createWritable:async()=>new WritableStream({write(bytes){
            writes++;chunks.push(bytes);
          }}),
          getFile:async()=>new Blob(chunks,{type:'video/mp4'})
        };
      }
      let lastProgressWrites=0;
      const blob=await encodeHtmlVideo(input,{
        fileHandle,
        reference:{index:sample[1],png:preview},
        onQuality:result=>{quality=result;},
        onReport:result=>{report=result;},
        onProgress:(fraction,frame,total)=>{if(frame===total)lastProgressWrites=writes;}
      });
      if(!quality||!report)throw Error('Missing quality metrics and local report for '+fixture.id);
      if(fileHandle&&(lastProgressWrites!==0||writes===0))
        throw Error('Streaming destination was written before verification or never committed');
      const startBytes=new Uint8Array(await blob.slice(4,8).arrayBuffer());
      const signature=String.fromCharCode(...startBytes);
      output.push({id:fixture.id,quality,report,savedBytes:blob.size,
        mp4Signature:signature,streamed:Boolean(fileHandle),writes});
    }
    const brokenImage={...options,html:'<img src="data:image/png;base64,invalid-image-bytes" width="30" height="30">',css:'',svg:'',js:''};
    try{await captureHtmlFrame(brokenImage,0);throw Error('Broken image was silently accepted');}
    catch(error){
      if(String(error.message).includes('silently accepted'))throw error;
      failureReports.push(makeRenderReport(options,{fixture:'broken-data-image',error,phase:'asset-decode',
        includeSource:true,source:brokenImage}));
    }
    const brokenFont={...options,html:'<h1 style="font:20px BadFont">NO FALLBACK</h1>',
      css:'@font-face{font-family:BadFont;src:url(data:font/woff2;base64,AAAA) format("woff2")}',
      svg:'',js:''};
    try{await captureHtmlFrame(brokenFont,0);throw Error('Invalid embedded font was silently accepted');}
    catch(error){
      if(String(error.message).includes('silently accepted'))throw error;
      failureReports.push(makeRenderReport(options,{fixture:'broken-data-font',error,phase:'font-load',
        includeSource:true,source:brokenFont}));
    }
    let leakedStaged=[];
    if(navigator.storage?.getDirectory){
      const root=await navigator.storage.getDirectory();
      for await(const [name] of root.entries())if(name.startsWith('nexora-temporary-export-'))leakedStaged.push(name);
    }
    return {font:'local font fixture from pinned upstream; not embedded in report',
      options,frames:sample,results:output,failures:failureReports,leakedStaged};
  },encodedFont);
  assert.equal(results.results.length,2);
  for(const row of results.results){
    assert.deepEqual(row.quality.frames.map(x=>x.frame),[0,12,23]);
    assert.equal(row.mp4Signature,'ftyp');
    assert.equal(row.report.result.status,'PASSED');
    assert.equal(row.report.source,undefined,'Do not put scene code into ordinary reports');
    assert.ok(row.quality.meanError<10,'Effect fixture exceeded mean RGB budget: '+row.id);
  }
  assert.equal(results.results[1].streamed,true,'Chrome local secure test must use StreamTarget');
  assert.ok(results.results[1].writes>0,'Verified MP4 must be copied through streaming file writer');
  assert.equal(results.failures.length,2);
  assert.equal(results.failures[0].result.code,'IMAGE');
  assert.equal(results.failures[1].result.code,'FONT');
  assert.deepEqual(results.leakedStaged,[],'Do not retain completed OPFS project exports');
  await mkdir('artifacts',{recursive:true});
  await writeFile('artifacts/html-render-fidelity-matrix.json',JSON.stringify(results,null,2));
  console.log('PASS: effects + embedded custom font, images, 3 decoded H264 frames, OPFS streamed save and reproducible negative reports');
  console.log('RENDER MATRIX:',JSON.stringify(results.results.map(r=>({id:r.id,frames:r.quality.frames,bytes:r.savedBytes,streamed:r.streamed}))));
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}

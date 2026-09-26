// Real Chrome E2E: pasted ONE-FILE HTML keeps its own head/style/script,
// WebGL framebuffer is captured as a changing PNG on the exact virtual frame
// clock, and first/mid/last decoded H.264 MP4 video passes existing fidelity.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {join} from 'node:path';

const host='http://127.0.0.1:4195';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview',
 '--host','127.0.0.1','--port','4195','--strictPort'],{stdio:['ignore','pipe','pipe']});
let logs='';server.stdout.on('data',x=>logs+=x);server.stderr.on('data',x=>logs+=x);
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const fullDocument='<!doctype html><html><head><meta charset="utf-8">'+
 '<style>html,body{margin:0;background:#02030b;overflow:hidden}canvas{display:block;width:100vw;height:100vh}</style>'+
 '</head><body><script>'+
 'const c=document.createElement("canvas");c.width=640;c.height=360;document.body.appendChild(c);'+
 'const gl=c.getContext("webgl2",{antialias:true});'+
 'if(!gl)throw Error("Chromium WebGL2 unavailable");'+
 'function draw(t){gl.viewport(0,0,640,360);gl.clearColor(0.12+Math.min(0.7,t/1250),0.31,0.7,1);gl.clear(gl.COLOR_BUFFER_BIT);requestAnimationFrame(draw)}'+
 'requestAnimationFrame(draw);'+
 '</script></body></html>';
const threeHtml='<!doctype html><html><head>'+
 '<script src="https://cdnjs.cloudflare.com/ajax/libs/three.js/0.172.0/three.tsl.js"></script>'+
 '<style>body{margin:0;background:#060606;overflow:hidden}canvas{display:block}</style></head>'+
 '<body><script type="importmap">'+JSON.stringify({imports:{
  './three':'https://assets.codepen.io/25387/three.webgpu.min.js',
  './three/webgl':'https://esm.sh/three@0.172.0/src/renderers/WebGLRenderer.js',
  './three/tsl':'https://assets.codepen.io/25387/three.tsl.js',
  './three/addons/':'https://esm.sh/three@0.172.0/examples/jsm/'
}})+'</script><script type="module">'+
 'import * as THREE from "./three";'+
 'import {WebGLRenderer} from "./three/webgl";'+
 'import * as Utils from "./three/addons/utils/BufferGeometryUtils.js";'+
 'import {OrbitControls} from "./three/addons/controls/OrbitControls.js";'+
 'const geometry=Utils.mergeGeometries([new THREE.BoxGeometry(3,3,3),new THREE.BoxGeometry(1,5,1).translate(0,2,0)],true);'+
 'const scene=new THREE.Scene();scene.background=new THREE.Color("#050505");'+
 'const camera=new THREE.PerspectiveCamera(45,640/360,0.1,100);camera.position.set(0,0,14);'+
 'const material=new THREE.ShaderMaterial({uniforms:{uTime:{value:0}},vertexShader:"varying vec3 p; void main(){p=position;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}",'+
 'fragmentShader:"uniform float uTime;varying vec3 p;void main(){gl_FragColor=vec4(.6+.3*sin(uTime*3.),.2+.3*sin(p.y),.5,1.);}"});'+
 'const mesh=new THREE.Mesh(geometry,material);scene.add(mesh);'+
 'const renderer=new WebGLRenderer({antialias:true});renderer.setSize(innerWidth,innerHeight);'+
 'document.body.appendChild(renderer.domElement);'+
 'const controls=new OrbitControls(camera,renderer.domElement);controls.enabled=false;'+
 'function draw(){const t=performance.now()/1000;material.uniforms.uTime.value=t;mesh.rotation.y=t;renderer.render(scene,camera);requestAnimationFrame(draw)}'+
 'requestAnimationFrame(draw);'+
 '</script></body></html>';

async function seekPixel(page,t){
 return page.locator('video[aria-label="Rendered HTML video playback"]').evaluate(async(video,time)=>{
   await new Promise((resolve,reject)=>{
     const timer=setTimeout(()=>reject(Error('MP4 seek timed out')),12000);
     video.onseeked=()=>{clearTimeout(timer);resolve();};
     video.onerror=()=>{clearTimeout(timer);reject(Error('MP4 seek decode error'));};
     video.currentTime=time;
   });
   const c=document.createElement('canvas');c.width=640;c.height=360;
   const context=c.getContext('2d');context.drawImage(video,0,0,640,360);
   return [...context.getImageData(320,180,1,1).data];
 },t);
}
let browser;
try{
 let ready=false;
 for(let i=0;i<80;i++){
   try{if((await fetch(host)).ok){ready=true;break;}}catch{}
   if(server.exitCode!==null)throw Error('Preview server exited: '+logs);
   await wait(250);
 }
 assert.ok(ready,'Preview server not ready: '+logs);
 browser=await chromium.launch({channel:'chrome',headless:true,args:[
  '--no-sandbox','--use-gl=angle','--use-angle=swiftshader','--enable-unsafe-swiftshader',
  '--enable-webgl'
 ]});
 const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
 // Mimic only the platform Save dialog. Real OPFS, Mediabunny StreamTarget,
 // Chrome canvas/WebCodecs and file.stream().pipeTo backpressure stay native.
 // Vite preview does not expose /src/lib modules for runtime imports.
 await page.addInitScript(()=>{
   const bytes=[];
   window.__androidFiveSecondDestination=bytes;
   Object.defineProperty(window,'showSaveFilePicker',{
     configurable:true,value:async()=>({
       createWritable:async()=>new WritableStream({write(chunk){bytes.push(chunk);}}),
       getFile:async()=>new Blob(bytes,{type:'video/mp4'})
     })
   });
 });
 const pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message.slice(0,170)));
 page.on('console',message=>{if(message.type()==='error')console.log('WEBGL CONSOLE:',message.text().slice(0,260));});
 await page.goto(host+'/?tool=motion',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Full HTML file · WebGL'}).click();
 assert.equal(await page.getByRole('button',{name:/Render MP4/}).isDisabled(),true,
   'Empty complete HTML must not produce an unhelpful RENDER failure report.');
 assert.equal(await page.locator('.sandbox-issue[role="alert"]').count(),0,
   'Selecting full HTML is an information state, not a red security/render error.');
 assert.equal(await page.getByRole('button',{name:/Match export preview/}).isDisabled(),true);
 assert.match(await page.getByTestId('full-html-export-gate').textContent(),/complete|paste|upload/i);
 await page.getByRole('textbox',{name:'Full HTML document code editor'}).fill(fullDocument);
 assert.equal(await page.getByRole('button',{name:/Render MP4/}).isDisabled(),true,
   'Pasting alone must not reuse an unrelated old preview.');
 await page.getByRole('button',{name:/Run preview/}).click();
 await page.locator('iframe[title="Sandboxed code preview"]').waitFor();
 const srcdoc=await page.locator('iframe[title="Sandboxed code preview"]').getAttribute('srcdoc');
 assert.ok(srcdoc.includes('preserveDrawingBuffer'), 'WebGL framebuffer retention bootstrap must be injected into sandbox');
 assert.match(srcdoc,/sandbox|webgl/);
 assert.doesNotMatch(srcdoc,/allow-same-origin/);
 await page.selectOption('#html-video-size','compact');
 await page.selectOption('#html-video-fps','30');
 await page.selectOption('#html-video-duration','1');
 await page.getByRole('button',{name:/Match export preview/}).click();
 await page.getByAltText('Exact export-matching frame').waitFor({timeout:50000});
 assert.equal(await page.getByRole('button',{name:/Render MP4/}).isEnabled(),true,
   'A validated and matching frame must unlock full-document MP4.');
 const readyText=(await page.locator('.html-video-message').textContent())||'';
 assert.match(readyText,/ready/i);
 const begin=page.waitForEvent('download',{timeout:120000});
 await page.getByRole('button',{name:/Render MP4/}).click();
 begin.catch(()=>{}); // observed by the race, even if UI reports failure first
 let downloadMonitorDone=false;
 const download=await Promise.race([
   begin,
   (async()=>{
     let last='';
     for(let attempt=0;attempt<390&&!downloadMonitorDone;attempt++){
       const status=(await page.locator('.html-video-message').textContent())||'';
       if(status!==last){console.log('ANDROID HTML MP4 STATUS:',status);last=status;}
       if(await page.locator('.html-render-failure-detail').count()){
         const failure=await page.locator('.html-render-failure-detail').allTextContents();
         throw Error('Full HTML MP4 failed before download: '+status+' '+failure.join(' '));
       }
       await wait(300);
     }
     if(!downloadMonitorDone)throw Error('Full HTML MP4 stalled, last status: '+last);
     return null;
   })()
 ]);
 downloadMonitorDone=true;
 assert.ok(download,'A real MP4 download was required.');

 await mkdir('artifacts',{recursive:true});
 await download.saveAs(join('artifacts','full-document-webgl-30fps.mp4'));
 const bytes=await readFile(join('artifacts','full-document-webgl-30fps.mp4'));
 assert.equal(bytes.toString('latin1',4,8),'ftyp');
 await page.locator('video[aria-label="Rendered HTML video playback"]').waitFor({timeout:30000});
 const first=await seekPixel(page,0.05),last=await seekPixel(page,0.8);
 assert.ok(last[0]-first[0]>45,
   'WebGL video must contain full animated frames rather than one screenshot: '+JSON.stringify({first,last}));
 assert.ok(first[2]>120&&last[2]>120,'WebGL RGB must be captured, not a black blank canvas.');
 assert.match((await page.locator('.html-video-message').textContent())||'',/verified/i);
 // Long one-file preview should use document-specific duration validation,
 // but this lightweight UI proof captures only frame zero (not 150 frames).
 await page.selectOption('#html-video-duration','5');
 await page.getByRole('button',{name:/Match export preview/}).click();
 await page.locator('.html-video-message').filter({hasText:/frame 0 ready/i}).waitFor({timeout:45000});
 await page.selectOption('#html-video-duration','1');
 console.log('PASS: 5-second experimental full-document output is accepted by UI preflight.');

 // Real five-second STREAMING smoke through the production UI, not source
 // imports: Vite's production preview does NOT serve /src/lib/*.js.
 await page.selectOption('#html-video-storage','stream');
 await page.selectOption('#html-video-duration','5');
 await page.getByRole('button',{name:/Match export preview/}).click();
 await page.locator('.html-video-message').filter({hasText:/frame 0 ready/i})
   .waitFor({timeout:55000});
 await page.getByRole('button',{name:/Render MP4/}).click();
 const complete=page.locator('.html-video-message')
   .filter({hasText:/Streaming save complete/i}).waitFor({timeout:170000});
 complete.catch(()=>{});
 await Promise.race([
   complete,
   (async()=>{
     let previous='';
     for(let n=0;n<550;n++){
       const status=await page.locator('.html-video-message').textContent()||'';
       if(status!==previous){console.log('5S STREAM UI:',status);previous=status;}
       if(await page.locator('.html-render-failure-detail').count()){
         const errors=await page.locator('.html-render-failure-detail').allTextContents();
         throw Error('Real 5-second OPFS/Android MP4 failed: '+status+' '+errors.join(' '));
       }
       if(status.includes('Streaming save complete'))return;
       await wait(300);
     }
     throw Error('Five-second OPFS stream did not complete: '+previous);
   })()
 ]);
 const five=await page.evaluate(async()=>{
   const parts=window.__androidFiveSecondDestination;
   if(!Array.isArray(parts)||!parts.length)
     throw Error('Streaming destination was never committed.');
   const file=new Blob(parts,{type:'video/mp4'});
   return {bytes:Array.from(new Uint8Array(await file.arrayBuffer()))};
 });
 const scores=await page.getByTestId('html-fidelity-score').textContent();
 assert.match(scores,/Frame 0: RGB/);
 assert.match(scores,/Frame 75: RGB/);
 assert.match(scores,/Frame 149: RGB/);
 assert.match(await page.locator('.html-render-compatibility').textContent(),/Fast Start/);
  assert.ok(five.bytes.length>300);
 assert.ok((await page.locator('.html-render-compatibility').textContent()).includes('avc1.42'));
 await writeFile('artifacts/android-webgl-five-seconds-stream.mp4',Buffer.from(five.bytes));
 console.log('PASS: real 5s 150-frame OPFS streaming produced verified Baseline Fast Start MP4 for ffprobe; bytes '+five.bytes.length);
 await page.selectOption('#html-video-storage','download');

 // Returning to legacy four-tab mode must restore its 1–3s menu automatically.
 await page.selectOption('#html-video-duration','5');
 await page.getByRole('button',{name:'Four tabs'}).click();
 await page.waitForFunction(()=>document.querySelector('#html-video-duration')?.value==='3',null,{timeout:6000});
 await page.getByRole('button',{name:'Full HTML file · WebGL'}).click();
 await page.selectOption('#html-video-duration','1');
 console.log('PASS: switching from extended WebGL duration to the old four-tab editor resets unsupported 5s selection.');
 console.log('PASS: full-file inline WebGL canvas -> actual 30 FPS H.264 with changing decoded pixels',JSON.stringify({first,last,bytes:bytes.length}));
 // The user's original CodePen-style HTML importmap MUST be recognized and
 // rewritten to one consistent Three.js version, never raw CodePen/esm mixture.
 await page.getByRole('textbox',{name:'Full HTML document code editor'}).fill(threeHtml);
 await page.getByRole('button',{name:/Run preview/}).click();
 const mapped=await page.locator('iframe[title="Sandboxed code preview"]').getAttribute('srcdoc');
 assert.match(mapped,/cdn\.jsdelivr\.net\/npm\/three@0\.172\.0\/build\/three\.module\.js/);
 assert.ok(!mapped.includes('https://assets.codepen.io/25387/three.webgpu.min.js'));
 await page.getByRole('button',{name:/Match export preview/}).click();
 await page.getByAltText('Exact export-matching frame').waitFor({timeout:90000});
 const threeReady=(await page.locator('.html-video-message').textContent())||'';
 assert.match(threeReady,/ready/i);
 const threeDownload=page.waitForEvent('download',{timeout:150000});
 await page.getByRole('button',{name:/Render MP4/}).click();
 const threeFile=await threeDownload;await threeFile.saveAs(join('artifacts','full-document-three-r172.mp4'));
 const threeBytes=await readFile(join('artifacts','full-document-three-r172.mp4'));
 assert.equal(threeBytes.toString('latin1',4,8),'ftyp');
 console.log('PASS: CodePen-style importmap + real pinned Three.js ShaderMaterial & BufferGeometryUtils -> verified MP4, bytes '+threeBytes.length);
 // Regression for the reported Android error: the user's import map may
 // declare bare "three" via a different known CDN URL instead of "./three".
 // Both declarations must share ONE pinned r172 instance and produce video.
 const bareThreeHtml=threeHtml
   .replace('"./three":"https://assets.codepen.io/25387/three.webgpu.min.js",',
     '"three":"https://esm.sh/three@0.172.0?bundle","./three":"https://assets.codepen.io/25387/three.webgpu.min.js",')
   .replace('import * as THREE from "./three";','import * as THREE from "three";');
 assert.notEqual(bareThreeHtml,threeHtml,'Bare-three regression fixture was not changed');
 await page.getByRole('textbox',{name:'Full HTML document code editor'}).fill(bareThreeHtml);
 assert.equal(await page.getByRole('button',{name:/Render MP4/}).isDisabled(),true,
   'Changing bare-three source must require a fresh verified preview.');
 await page.getByRole('button',{name:/Run preview/}).click();
 const bareDoc=await page.locator('iframe[title="Sandboxed code preview"]').getAttribute('srcdoc');
 assert.ok(!bareDoc.includes('Unsupported module mapping: three'));
 assert.ok(bareDoc.includes('"three":"https://cdn.jsdelivr.net/npm/three@0.172.0/build/three.module.js"'),
   'Bare three must be normalized to the exact pinned jsDelivr r172 module');
 assert.ok(!bareDoc.includes('https://esm.sh/three@0.172.0?bundle'),
   'ESM alias must be rewritten to the pinned CDN, not passed through.');
 await page.getByRole('button',{name:/Match export preview/}).click();
 await page.getByAltText('Exact export-matching frame').waitFor({timeout:90000});
 const bareDownload=page.waitForEvent('download',{timeout:150000});
 await page.getByRole('button',{name:/Render MP4/}).click();
 const bareFile=await bareDownload;await bareFile.saveAs(join('artifacts','full-document-bare-three-r172.mp4'));
 const bareBytes=await readFile(join('artifacts','full-document-bare-three-r172.mp4'));
 assert.equal(bareBytes.toString('latin1',4,8),'ftyp');
 assert.match((await page.locator('.html-video-message').textContent())||'',/verified/i);
 console.log('PASS: user-reported bare three alias from esm.sh normalized to pinned Three.js and exported verified real H.264 MP4, bytes '+bareBytes.length);

 for(const width of [360,390,412]){
   await page.setViewportSize({width,height:844});
   await page.locator('.mobile-toggle button').first().click();
   await page.getByRole('textbox',{name:'Full HTML document code editor'}).waitFor({state:'visible'});
   assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1,
     'Full-file editor overflows '+width+'px mobile viewport');
 }
 console.log('PASS: full-file UI fits mobile 360/390/412 and retains traditional four-tab editor.');
 await page.setViewportSize({width:1440,height:900});
 await page.screenshot({path:'artifacts/full-html-document-webgl-desktop.png',fullPage:true});

 // Negative full-document ingress tests: invalid external dependencies
 // must fail before iframe creation; malicious inline code may run only in
 // its opaque origin and must never read or mutate dashboard state.
 await page.evaluate(()=>{
   localStorage.setItem('nx-full-doc-parent-secret','untouched');
   window.__fullDocParentModified=false;
 });
 const badRemote='<!doctype html><html><head><script src="https://attacker.invalid/malicious.js"></script></head><body>Remote is not allowed.</body></html>';
 await page.getByRole('textbox',{name:'Full HTML document code editor'}).fill(badRemote);
 assert.equal(await page.getByRole('button',{name:/Render MP4/}).isDisabled(),true,
   'Changing source must revoke permission to export stale verified frames.');
 await page.getByRole('button',{name:/Run preview/}).click();
 await page.getByRole('alert').filter({hasText:/External script tags/}).waitFor();
 assert.equal(await page.locator('iframe[title="Sandboxed code preview"]').count(),0,
   'Invalid full-page source must stop the previous live preview, not show stale pixels.');
 const badMap='<!doctype html><html><head><script type="importmap">'+
   JSON.stringify({imports:{'./three':'https://attacker.invalid/three.js'}})+
   '</script></head><body><script type="module">import * as THREE from "./three";</script></body></html>';
 await page.getByRole('textbox',{name:'Full HTML document code editor'}).fill(badMap);
 await page.getByRole('button',{name:/Run preview/}).click();
 await page.getByRole('alert').filter({hasText:/Unsupported module mapping/}).waitFor();
 const wrongVersion='<!doctype html><html><head><script type="importmap">'+
   JSON.stringify({imports:{three:'https://esm.sh/three@0.180.0'}})+
   '</script></head><body><script type="module">import * as THREE from "three";</script></body></html>';
 await page.getByRole('textbox',{name:'Full HTML document code editor'}).fill(wrongVersion);
 await page.getByRole('button',{name:/Run preview/}).click();
 await page.getByRole('alert').filter({hasText:/Unsupported module mapping: three/}).waitFor();
 assert.equal(await page.getByRole('button',{name:/Render MP4/}).isDisabled(),true);
 console.log('PASS: unknown remote modules and mismatched Three.js versions remain blocked.');

 const attemptedParentAccess='<!doctype html><html><head><style>body{background:#111;color:white}</style></head>'+
   '<body><p>Opaque sandbox security</p><script>'+
   'try{parent.document.body.dataset.pwned="yes";parent.__fullDocParentModified=true;}catch{}'+
   'try{parent.localStorage.setItem("nx-full-doc-parent-secret","STOLEN");}catch{}'+
   '</script></body></html>';
 await page.getByRole('textbox',{name:'Full HTML document code editor'}).fill(attemptedParentAccess);
 await page.getByRole('button',{name:/Run preview/}).click();
 await page.locator('iframe[title="Sandboxed code preview"]').waitFor();
 await wait(400);
 const parent=await page.evaluate(()=>({
   secret:localStorage.getItem('nx-full-doc-parent-secret'),
   mutated:window.__fullDocParentModified,
   body:document.body.dataset.pwned||null,
   sandbox:document.querySelector('iframe[title="Sandboxed code preview"]')?.getAttribute('sandbox'),
   directAccess:document.querySelector('iframe[title="Sandboxed code preview"]')?.contentDocument!==null
 }));
 assert.deepEqual(parent,{secret:'untouched',mutated:false,body:null,sandbox:'allow-scripts',directAccess:false});
 console.log('PASS: full-doc remote module/script denied and malicious inline JS cannot read privileged parent DOM/storage.');
 await page.getByRole('button',{name:'Four tabs'}).click();
 await page.getByRole('textbox',{name:'HTML code editor',exact:true}).fill(fullDocument);
 await page.getByRole('textbox',{name:'Full HTML document code editor'}).waitFor();
 assert.equal(await page.getByRole('textbox',{name:'Full HTML document code editor'}).inputValue(),fullDocument,
   'Pasting a complete HTML document in the legacy HTML tab must switch automatically and preserve the exact full source.');
 console.log('PASS: legacy HTML tab auto-detects one-file HTML and preserves full document without manual splitting.');

}finally{
 if(browser)await browser.close();
 server.kill('SIGTERM');
}

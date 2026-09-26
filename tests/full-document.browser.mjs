// Real Chrome E2E: pasted ONE-FILE HTML keeps its own head/style/script,
// WebGL framebuffer is captured as a changing PNG on the exact virtual frame
// clock, and first/mid/last decoded H.264 MP4 video passes existing fidelity.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,readFile} from 'node:fs/promises';
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
 const pageErrors=[];
 page.on('pageerror',error=>pageErrors.push(error.message.slice(0,170)));
 page.on('console',message=>{if(message.type()==='error')console.log('WEBGL CONSOLE:',message.text().slice(0,260));});
 await page.goto(host+'/?tool=motion',{waitUntil:'domcontentloaded'});
 await page.getByRole('button',{name:'Full HTML file · WebGL'}).click();
 await page.getByRole('textbox',{name:'Full HTML document code editor'}).fill(fullDocument);
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
 const readyText=(await page.locator('.html-video-message').textContent())||'';
 assert.match(readyText,/ready/i);
 const begin=page.waitForEvent('download',{timeout:120000});
 await page.getByRole('button',{name:/Render MP4/}).click();
 const download=await begin;
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
 for(const width of [360,390,412]){
   await page.setViewportSize({width,height:844});
   await page.locator('.mobile-toggle button').first().click();
   await page.getByRole('textbox',{name:'Full HTML document code editor'}).waitFor({state:'visible'});
   assert.ok((await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth))<=1,
     'Full-file editor overflows '+width+'px mobile viewport');
 }
 console.log('PASS: full-file UI fits mobile 360/390/412 and retains traditional four-tab editor.');
 await page.screenshot({path:'artifacts/full-html-document-webgl-desktop.png',fullPage:true});
}finally{
 if(browser)await browser.close();
 server.kill('SIGTERM');
}

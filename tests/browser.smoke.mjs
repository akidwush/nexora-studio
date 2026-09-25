import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir,readFile} from 'node:fs/promises';
import {spawn} from 'node:child_process';
import {join} from 'node:path';

const host='http://127.0.0.1:4173';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4173','--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';
server.stdout.on('data',d=>{output+=String(d);});
server.stderr.on('data',d=>{output+=String(d);});
let browser;
const timeout=ms=>new Promise(r=>setTimeout(r,ms));
async function ready(){
  for(let i=0;i<45;i++){
    if(server.exitCode!==null) throw new Error('Preview server exited: '+output);
    try {const r=await fetch(host);if(r.ok)return;}catch{}
    await timeout(500);
  }
  throw new Error('Preview server failed to start: '+output);
}
async function capture(page,filename){
  await mkdir('artifacts',{recursive:true});
  await page.screenshot({path:join('artifacts',filename),fullPage:true,animations:'disabled'});
}
try{
  await ready();
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  await page.goto(host,{waitUntil:'domcontentloaded'});
  await page.locator('.tool').first().waitFor();
  assert.equal(await page.locator('.tool').count(),4,'four standalone tools');
  await capture(page,'landing-desktop.png');

  await page.getByRole('button',{name:'Motion Lab',exact:true}).click();
  await page.locator('select#motion-preset').selectOption('neon');
  await page.getByRole('button',{name:'9:16',exact:true}).click();
  const portrait=await page.locator('iframe[title="Sandboxed code preview"]').boundingBox();
  assert.ok(portrait && Math.abs(portrait.width/portrait.height-9/16)<0.02,'portrait preview must preserve 9:16');
  await page.getByRole('button',{name:'16:9',exact:true}).click();
  await page.frameLocator('iframe[title="Sandboxed code preview"]').locator('.neon-scene h1').waitFor();
  const neon=await page.frameLocator('iframe[title="Sandboxed code preview"]').locator('h1').innerText();
  assert.ok(neon.includes('THE NEXT'),'isolated preview renders preset');
  const htmlDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:/Export HTML/}).click();
  assert.equal((await htmlDownload).suggestedFilename(),'nexora-motion.html');
  console.log('PASS: Motion Lab preset, sandbox preview and HTML export');

  await page.getByRole('button',{name:'Image Tools'}).click();
  await page.evaluate(async()=>{
    const canvas=document.createElement('canvas');canvas.width=12;canvas.height=12;
    const context=canvas.getContext('2d');context.fillStyle='#f00';context.fillRect(0,0,12,12);
    const blob=await new Promise(resolve=>canvas.toBlob(resolve,'image/png'));
    const dt=new DataTransfer();dt.items.add(new File([blob],'red.png',{type:'image/png'}));
    const input=document.querySelector('input[type=file]');
    input.files=dt.files;input.dispatchEvent(new Event('change',{bubbles:true}));
  });
  await page.getByRole('button',{name:/Download SVG/}).waitFor({timeout:10000});
  const svgDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:/Download SVG/}).click();
  assert.equal((await svgDownload).suggestedFilename(),'nexora-mosaic.svg');
  const pngDownload=page.waitForEvent('download');
  await page.getByRole('button',{name:/Download PNG/}).click();
  const png=await pngDownload; assert.equal(png.suggestedFilename(),'nexora-mosaic.png');
  const pngPath=await png.path();assert.ok(pngPath,'PNG must exist');
  const bytes=await readFile(pngPath);assert.equal(bytes.subarray(0,8).toString('hex'),'89504e470d0a1a0a','valid PNG magic bytes');
  console.log('PASS: Image -> SVG + real PNG export');

  await page.setViewportSize({width:390,height:844});
  await page.goto(host);
  await page.locator('.tool').first().waitFor();
  const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
  assert.ok(overflow<=1,'landing page has horizontal overflow at 390px: '+overflow);
  await capture(page,'landing-mobile-390.png');
  console.log('PASS: 390px mobile no horizontal overflow');

  const loaded=[];
  page.on('response',r=>{if(r.url().includes('/studio-pro/assets/')&&r.ok())loaded.push(r.url());});
  await page.setViewportSize({width:1440,height:900});
  await page.goto(host+'/studio-pro/',{waitUntil:'load',timeout:60000});
  const title=await page.title();
  assert.match(title,/studio/i,'upstream editor page title');
  assert.ok(loaded.length>0,'at least one compiled Studio Pro asset loaded');
  await capture(page,'studio-pro-desktop.png');
  console.log('PASS: Upstream Studio Pro loads compiled assets, title='+title+', asset responses='+loaded.length);
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}

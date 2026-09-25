// Browser-level proof of actual HTML + CSS + inline SVG + JS sandbox execution.
// This tests the FIRST-PARTY Motion Lab, not the separately built upstream editor.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {mkdir} from 'node:fs/promises';
import {join} from 'node:path';
import {spawn} from 'node:child_process';

const host='http://127.0.0.1:4183';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4183','--strictPort'],{stdio:['ignore','pipe','pipe']});
let output='';
server.stdout.on('data',data=>output+=String(data));
server.stderr.on('data',data=>output+=String(data));
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
async function ready(){
  for(let i=0;i<65;i++){
    if(server.exitCode!==null)throw new Error('Preview server exited: '+output);
    try{if((await fetch(host)).ok)return;}catch{}
    await delay(400);
  }
  throw new Error('Preview server did not start: '+output);
}
let browser;
try{
  await ready();
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1440,height:900},acceptDownloads:true});
  await page.goto(host+'/?tool=motion',{waitUntil:'domcontentloaded'});
  await page.locator('iframe[title="Sandboxed code preview"]').waitFor();
  const sandboxAttr=await page.locator('iframe[title="Sandboxed code preview"]').getAttribute('sandbox');
  assert.equal(sandboxAttr,'allow-scripts','sandbox grants scripts but never access to app origin');
  let escapedRequests=0;
  await page.route('**/sandbox-egress-probe/**',route=>{
    escapedRequests++;
    return route.abort();
  });
  const html='<main id="test-main"><p id="test-target">HTML WORKS</p></main>'+
    '<img src="/sandbox-egress-probe/blocked.png" alt="blocked remote image">';
  const svg='<svg id="test-svg" viewBox="0 0 220 100" width="220" height="100" xmlns="http://www.w3.org/2000/svg">'+
    '<rect id="animated-rect" x="10" y="10" width="70" height="70"/></svg>';
  const css='#test-main{background:rgb(18,32,71)} #animated-rect{fill:rgb(155,68,218);animation:spin 3s linear infinite;transform-origin:center}@keyframes spin{to{transform:rotate(360deg)}}';
  const js=[
    'document.querySelector("#test-target").dataset.executed="true";',
    'try { parent.document.querySelector("#root").innerHTML="PARENT_BREACH"; }',
    'catch(e) { document.body.dataset.parentDenied=e.name; }',
    'try { localStorage.setItem("nexora-escape","bad"); }',
    'catch(e) { document.body.dataset.storageDenied=e.name; }',
    'fetch("/sandbox-egress-probe/private")',
    ' .then(()=>{document.body.dataset.networkDenied="false";})',
    ' .catch(()=>{document.body.dataset.networkDenied="true";});',
    'console.log("<img id=\\"injected-console\\" src=x onerror=alert(1)>");',
  ].join('\n');

  for(const [kind,value] of [['HTML',html],['CSS',css],['SVG',svg],['JS',js]]){
    await page.getByRole('button',{name:kind,exact:true}).click();
    await page.getByRole('textbox',{name:kind+' code editor'}).fill(value);
  }
  await page.getByRole('button',{name:'Run preview',exact:false}).click();
  const frame=page.frameLocator('iframe[title="Sandboxed code preview"]');
  await frame.locator('#test-target[data-executed=true]').waitFor({timeout:15000});
  await frame.locator('body[data-network-denied=true]').waitFor({timeout:15000});
  const facts=await frame.locator('body').evaluate(body=>{
    const shape=body.querySelector('#animated-rect'),html=body.querySelector('#test-main');
    return {
      frameOrigin:globalThis.origin,
      parentDenied:body.dataset.parentDenied,
      storageDenied:body.dataset.storageDenied,
      networkDenied:body.dataset.networkDenied,
      svgExists:Boolean(body.querySelector('svg#test-svg')),
      svgFill:getComputedStyle(shape).fill,
      svgAnimation:getComputedStyle(shape).animationName,
      htmlBackground:getComputedStyle(html).backgroundColor
    };
  });
  assert.equal(facts.frameOrigin,'null','iframe has unique opaque origin');
  assert.ok(['SecurityError','TypeError'].includes(facts.parentDenied),'parent DOM denied');
  assert.ok(['SecurityError','TypeError'].includes(facts.storageDenied),'localStorage denied');
  assert.equal(facts.networkDenied,'true','fetch blocked by sandbox CSP');
  assert.equal(facts.svgExists,true,'inline SVG is inside frame');
  assert.equal(facts.svgFill,'rgb(155, 68, 218)');
  assert.equal(facts.svgAnimation,'spin');
  assert.equal(facts.htmlBackground,'rgb(18, 32, 71)');
  assert.equal(escapedRequests,0,'blocked fetch/image must not hit application endpoint');
  assert.equal(await page.locator('#root').count(),1,'parent app remains intact');
  await page.locator('.sandbox-console-entries').getByText('injected-console',{exact:false}).waitFor();
  assert.equal(await page.locator('#injected-console').count(),0,'console text must never become HTML');
  console.log('PASS: HTML/CSS/inline SVG/JS execute inside an opaque-origin frame; fetch, images, parent DOM and storage blocked');

  const standalone=page.waitForEvent('download');
  await page.getByRole('button',{name:/Export HTML/}).click();
  const download=await standalone;
  assert.equal(download.suggestedFilename(),'nexora-motion.html');
  console.log('PASS: exported standalone HTML contains user code (outside the preview boundary)');
  await mkdir('artifacts',{recursive:true});
  await page.screenshot({path:join('artifacts','step1-isolated-html-desktop.png'),fullPage:true,animations:'disabled'});

  await page.getByRole('button',{name:/Stop preview/}).click();
  assert.equal(await page.locator('iframe[title="Sandboxed code preview"]').count(),0,'stopping unmounts frame');
  await page.getByRole('button',{name:/Run preview/}).click();
  await page.frameLocator('iframe[title="Sandboxed code preview"]').locator('#test-target[data-executed=true]').waitFor();
  const newSandbox=await page.locator('iframe[title="Sandboxed code preview"]').getAttribute('sandbox');
  assert.equal(newSandbox,'allow-scripts');
  console.log('PASS: Stop destroys frame and Run creates a fresh isolated frame');

  await page.getByRole('button',{name:'JS',exact:true}).click();
  await page.getByRole('textbox',{name:'JS code editor'}).fill('throw new Error("EXPECTED_SANDBOX_ERROR")');
  await page.getByRole('button',{name:/Run preview/}).click();
  await page.locator('.sandbox-console-entries').getByText(/EXPECTED_SANDBOX_ERROR/).waitFor({timeout:15000});
  console.log('PASS: sandbox runtime errors are displayed as plain text');

  await page.getByRole('button',{name:'SVG',exact:true}).click();
  await page.getByRole('button',{name:/Insert animated SVG example/}).click();
  await page.getByRole('button',{name:/Run preview/}).click();
  await page.frameLocator('iframe[title="Sandboxed code preview"]').locator('#motion-svg .nx-spin').waitFor();
  console.log('PASS: dedicated SVG tab inserts and executes local SVG animation');

  for(const width of [360,390,412]){
    await page.setViewportSize({width,height:844});
    const overflow=await page.evaluate(()=>document.documentElement.scrollWidth-innerWidth);
    assert.ok(overflow<=1,'Motion Lab horizontal overflow at '+width+': '+overflow);
    await page.screenshot({path:join('artifacts','step1-isolated-html-mobile-'+width+'.png'),fullPage:true,animations:'disabled'});
  }
  console.log('PASS: HTML sandbox controls fit 360/390/412px mobile');
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}

// Real Chrome negative isolation test against the patched pinned upstream source.
// Run only after npm run studio:sync && npm run studio:build.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';

const base='http://127.0.0.1:4175';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','--host','127.0.0.1','--port','4175','--strictPort'],{
  cwd:'vendor/studio-pro',stdio:['ignore','pipe','pipe'],env:{...process.env,GITHUB_ACTIONS:'false'}
});
let output='';
server.stdout.on('data',d=>{output+=String(d)});
server.stderr.on('data',d=>{output+=String(d)});
let browser;
try{
  let ready=false;
  for(let i=0;i<80;i++){
    try{const res=await fetch(base+'/');if(res.ok){ready=true;break;}}catch{}
    if(server.exitCode!==null)throw new Error('Upstream dev preview exited: '+output);
    await new Promise(resolve=>setTimeout(resolve,300));
  }
  if(!ready)throw new Error('Patched Studio Pro dev preview unavailable: '+output);
  browser=await chromium.launch({headless:true,args:['--no-sandbox']});
  const page=await browser.newPage();
  await page.goto(base+'/',{waitUntil:'domcontentloaded'});
  const result=await page.evaluate(async()=>{
    const observed=[];
    const observer=new MutationObserver(records=>{
      for(const record of records){
        for(const node of record.addedNodes){
          if(node instanceof HTMLIFrameElement && node.hasAttribute('data-nx-isolated-frame')){
            observed.push({sandbox:node.getAttribute('sandbox'),
              directAccess:node.contentDocument!==null,
              srcdocIncludesCSP:node.srcdoc.includes('Content-Security-Policy')});
          }
        }
      }
    });
    observer.observe(document.body,{childList:true,subtree:true});
    localStorage.setItem('parent-secret','editor-only-data');
    window.__parentModified=false;
    const malicious={
      id:'security-test',
      html:'<div id="clip-target" style="width:160px;height:90px;background:rgb(10,10,10)"></div>',
      css:'body{padding:0}',
      js:`try { parent.document.body.dataset.pwned='yes'; parent.__parentModified=true; } catch {}
        try { parent.localStorage.setItem('parent-secret','STOLEN'); } catch {}
        document.getElementById('clip-target').style.background='rgb(12, 200, 56)';`
    };
    const {renderHtmlClip}=await import('/src/html-clips/renderer.js');
    const bitmap=await renderHtmlClip(malicious,160,90);
    const canvas=document.createElement('canvas');canvas.width=160;canvas.height=90;
    const ctx=canvas.getContext('2d');ctx.drawImage(bitmap,0,0);
    const pixel=Array.from(ctx.getImageData(20,20,1,1).data);
    const {quickRender}=await import('/src/html-in-canvas/renderer.js');
    const image=await quickRender(malicious.html,malicious.css,malicious.js,0,160,90);
    const {mountIsolatedHtmlPreview,destroyIsolatedHtmlPreview}=await import('/src/html-clips/isolated-frame.js');
    const preview=document.createElement('div');document.body.appendChild(preview);
    await mountIsolatedHtmlPreview(preview,malicious);
    const sandbox=preview.querySelector('iframe')?.getAttribute('sandbox');
    const childAccessible=preview.querySelector('iframe')?.contentDocument!==null;
    destroyIsolatedHtmlPreview(preview);preview.remove();
    observer.disconnect();
    return {observed,pixel,
      imagePng:image.startsWith('data:image/png;base64,'),
      sandbox,childAccessible,parentModified:window.__parentModified,
      parentSecret:localStorage.getItem('parent-secret'),
      bodyModified:document.body.dataset.pwned||null};
  });
  assert.ok(result.observed.length>=3,'offscreen HTML clip, HTML Canvas and live preview frames must all be isolated');
  for(const item of result.observed){
    assert.equal(item.sandbox,'allow-scripts');
    assert.equal(item.directAccess,false,'host cannot read sandbox document');
    assert.equal(item.srcdocIncludesCSP,true);
  }
  assert.equal(result.sandbox,'allow-scripts');
  assert.equal(result.childAccessible,false);
  assert.equal(result.parentModified,false);
  assert.equal(result.parentSecret,'editor-only-data');
  assert.equal(result.bodyModified,null);
  assert.ok(result.imagePng,'HTML Canvas safe adapter must produce a PNG');
  assert.ok(result.pixel[1]>150&&result.pixel[0]<70,'sandbox JS/CSS should still render green, got '+result.pixel);
  console.log('PASS: isolated upstream HTML clip, HTML Canvas and live preview render, no parent DOM/storage access');
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}

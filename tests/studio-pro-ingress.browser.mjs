// End-to-end Chromium proof that publicly supplied JSON/.spcomp/.js/templates
// and the monolithic HTML/HIC/WAAPI editor paths cannot execute project code.
// Run against the pinned, patched vendor build; never touch NEXORA V1/V2.
import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';

const host='http://127.0.0.1:4193';
const server=spawn(process.execPath,['node_modules/vite/bin/vite.js','preview','--host','127.0.0.1','--port','4193','--strictPort'],
  {cwd:'vendor/studio-pro',stdio:['ignore','pipe','pipe'],env:{...process.env,GITHUB_ACTIONS:'false'}});
let logs='';server.stdout.on('data',b=>logs+=String(b));server.stderr.on('data',b=>logs+=String(b));
let browser;
try{
  let up=false;
  for(let i=0;i<90;i++){
    try{if((await fetch(host)).ok){up=true;break;}}catch{}
    if(server.exitCode!==null)throw Error('Vendor server stopped: '+logs);
    await new Promise(done=>setTimeout(done,250));
  }
  assert.ok(up,'Vendor preview server unavailable: '+logs);
  browser=await chromium.launch({channel:'chrome',headless:true,args:['--no-sandbox']});
  const page=await browser.newPage({viewport:{width:1170,height:850}});
  const pageErrors=[];
  page.on('pageerror',error=>pageErrors.push(error.message.slice(0,150)));
  await page.goto(host+'/',{waitUntil:'domcontentloaded'});
  const results=await page.evaluate(async()=>{
    const rejection=e=>{try{return e()}catch{return false;}};
    const oldProjects=Object.keys(localStorage).filter(key=>key.startsWith('studiopro_project_'));
    const sentinel='<img src=x onerror="parent.__evilProjectExecuted=true">';
    window.__evilProjectExecuted=false;
    const dangerous={
      app:'StudioPro',version:1,tracks:[],
      clips:[{id:'attack',type:'html',title:sentinel,
        html:'<img src=x onerror="parent.__evilProjectExecuted=true">',js:'parent.__evilProjectExecuted=true'}]
    };
    const input={files:[new File([JSON.stringify(dangerous)],'evil-project.json',{type:'application/json'})],value:'evil'};
    const projectResult=window.importProjectFile(input);
    const presetsResult=window.importPresets({target:{files:[
      new File([JSON.stringify([{id:'a',name:sentinel,type:'text',effects:{}}])],'evil-presets.json',
        {type:'application/json'})
    ]}});
    const guards={
      publicFlag:window.__NEXORA_PUBLIC_IMPORTS_ENABLED__,
      projectResult,presetsResult,
      spcompResult:rejection(()=>window.importSpcompFile()),
      scriptResult:rejection(()=>window.loadCompositionScript()),
      templateResult:rejection(()=>window.importDesignTemplateFile({files:[],value:''})),
      htmlResult:rejection(()=>window.addHtmlClipToTimeline()),
      hicResult:rejection(()=>window.addHicClipToTimeline()),
      htmlEditorResult:rejection(()=>window.openHtmlEditor('malicious')),
      hicEditorResult:rejection(()=>window.openHicEditor('malicious')),
      htmlPreviewResult:rejection(()=>window.preRenderHtmlClip(dangerous.clips[0])),
      remoteProjectDenied:rejection(()=>window.__nexoraAssertSafeProject({
        app:'StudioPro',version:1,tracks:[],clips:[{id:'x',type:'image',src:'https://private.example/api'}]
      })),
      scriptProjectDenied:rejection(()=>window.__nexoraAssertSafeProject(dangerous)),
      emptyLocalProjectAllowed:rejection(()=>window.__nexoraAssertSafeProject({
        app:'StudioPro',version:1,clips:[],tracks:[]
      })),
      svgMediaRejected:window.__nexoraSafeMedia(
        new File(['<svg onload="alert(1)"/>'],'evil.svg',{type:'image/svg+xml'}),'image'),
      validPngAllowed:window.__nexoraSafeMedia(
        new File([new Uint8Array([137,80,78,71,13,10,26,10])],'sample.png',{type:'image/png'}),'image'),
      presetStorage:localStorage.getItem('custom_presets'),
      projectKeys:Object.keys(localStorage).filter(key=>key.startsWith('studiopro_project_')),
      oldProjects,executed:window.__evilProjectExecuted,
      staticSandbox:document.getElementById('htmlEditorPreview')?.getAttribute('sandbox'),
      hicSandbox:document.getElementById('hicEditorPreview')?.getAttribute('sandbox'),
      meta:document.querySelector('meta[http-equiv="Content-Security-Policy"]')?.content,
      status:document.getElementById('nexoraImportSafetyStatus')?.textContent||''
    };
    // The explicit rejected media and local project objects must not create
    // a native unsandboxed offscreen frame.
    guards.unsandboxedFrames=[...document.querySelectorAll('iframe')].some(
      iframe=>iframe.getAttribute('sandbox')!=='allow-scripts');
    return guards;
  });
  assert.equal(results.publicFlag,false);
  for(const key of ['spcompResult','scriptResult','templateResult','htmlResult','hicResult',
    'htmlEditorResult','hicEditorResult','remoteProjectDenied','scriptProjectDenied','svgMediaRejected']){
    assert.equal(results[key],false,key+' must fail closed');
  }
  assert.equal(results.validPngAllowed,true);
  assert.equal(results.emptyLocalProjectAllowed,true);
  assert.equal(results.executed,false);
  assert.deepEqual(results.projectKeys,results.oldProjects,'Untrusted import must not persist a new project');
  assert.equal(results.staticSandbox,'allow-scripts');
  assert.equal(results.hicSandbox,'allow-scripts');
  assert.equal(results.unsandboxedFrames,false);
  assert.ok(results.meta.includes("connect-src 'self'"));
  assert.ok(results.meta.includes("object-src 'none'"));
  assert.ok(!results.meta.includes('unsafe-eval'));
  const preview=await page.evaluate(()=>{
    const media=document.createElement('img');
    media.src='data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg"/>';
    const html=document.documentElement.outerHTML;
    return {button:document.getElementById('btnAddHtml')?.id,
      scriptSrc:[...document.scripts].map(tag=>tag.src).filter(Boolean),
      hasServiceWorker:'serviceWorker' in navigator,
      allFrames:[...document.querySelectorAll('iframe')].map(frame=>frame.getAttribute('sandbox')),
      safeNotice:html.includes('Security gate')};
  });
  assert.ok(preview.button,'Normal timeline editing shell must remain intact');
  assert.ok(preview.scriptSrc.every(src=>src.startsWith(host)||src.startsWith('blob:')),
    'Editor must not import third-party CDN JavaScript');
  // Only expected browser environment restrictions; no attacker mutations.
  assert.equal(results.executed,false);
  await mkdir('artifacts',{recursive:true});
  await writeFile('artifacts/studio-pro-public-ingress-chromium.json',JSON.stringify({
    status:'QUARANTINE_PASS',publicImportsAuthorized:false,
    guards:results,preview,pageErrors
  },null,2));
  await page.screenshot({path:'artifacts/studio-pro-quarantined-editor.png',fullPage:true});
  console.log('PASS: malicious project/template/preset/script denied and HTML/HIC/WAAPI legacy routes quarantined in Chrome');
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}

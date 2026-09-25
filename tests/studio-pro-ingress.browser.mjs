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
      pngMagicAllowed:await window.__nexoraInspectMedia(
        new File([new Uint8Array([137,80,78,71,13,10,26,10])],'valid.png',{type:'image/png'}),'image'),
      forgedPngDenied:await window.__nexoraInspectMedia(
        new File(['<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'],'forged.png',{type:'image/png'}),'image'),
      forgedMp4Denied:await window.__nexoraInspectMedia(
        new File(['<svg onload="alert(1)"/>'],'forged.mp4',{type:'video/mp4'}),'video'),
      validWebmMagic:await window.__nexoraInspectMedia(
        new File([new Uint8Array([26,69,223,163,0,0,0,0])],'movie.webm',{type:'video/webm'}),'video'),
      forgedFontDenied:await window.__nexoraInspectMedia(
        new File(['<script>alert(1)</script>'],'fake.woff2',{type:'font/woff2'}),'font'),
      validWoffMagic:await window.__nexoraInspectMedia(
        new File(['wOF2'+String.fromCharCode(0,0,0,0)],'font.woff2',{type:'font/woff2'}),'font'),
      maliciousStoredFontDenied:window.__nexoraSafeFontRecord({
        name:'evil-font-payload";}body{display:none}',dataUri:'data:font/woff2;base64,d09GMgAAAAA='
      }),
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
  assert.equal(results.pngMagicAllowed,true,'PNG signature must be recognized');
  assert.equal(results.forgedPngDenied,false,'A forged SVG cannot be imported as a PNG');
  assert.equal(results.forgedMp4Denied,false,'Media magic bytes must precede decode');
  assert.equal(results.validWebmMagic,true,'Known WebM header should be accepted for further decode');
  assert.equal(results.forgedFontDenied,false,'Font MIME must not bypass byte signature validation');
  assert.equal(results.validWoffMagic,true);
  assert.equal(results.maliciousStoredFontDenied,false,'Stored CSS font name injection rejected');
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
  // Legacy on-device autosave must not brick the editor or execute old HTML
  // projects. Preserve the original bytes for explicit offline export.
  const legacyPage=await browser.newPage({viewport:{width:390,height:844}});
  await legacyPage.addInitScript(()=>{
    const id='00000000-0000-4000-8000-000000000001';
    const project={app:'StudioPro',version:1,duration:60,tracks:[],clips:[
      {id:'untrusted',type:'html',html:'<img src=x onerror="parent.__legacyExec=true">',
        js:'parent.__legacyExec=true',title:'Legacy HTML'}
    ]};
    localStorage.setItem('studiopro_projects_index',JSON.stringify({version:1,
      projects:[{id,name:'Unreviewed legacy project',savedAt:1,duration:60},
        {id:"bad'id",name:'Malicious forged ID',savedAt:1,duration:60}]}));
    localStorage.setItem('studiopro_project_'+id,JSON.stringify(project));
    localStorage.setItem('studiopro_active_project',JSON.stringify({id,name:'Unreviewed legacy project'}));
    // These legacy attacker-controlled JSON/font stores were previously
    // deserialized directly into editor HTML and @font-face rules.
    localStorage.setItem('custom_presets',JSON.stringify([{id:'x',name:'<img src=x onerror=parent.__legacyExec=true>',type:'text',effects:{}}]));
    localStorage.setItem('studioPro_designTemplates',JSON.stringify([{id:'x',name:'<img src=x onerror=parent.__legacyExec=true>'}]));
    localStorage.setItem('studiopro_custom_fonts',JSON.stringify([{name:'evil-font-payload";}body{display:none}',dataUri:'data:font/woff2;base64,d09GMgAAAAA='}]));
    window.__legacyExec=false;
  });
  await legacyPage.goto(host+'/',{waitUntil:'domcontentloaded'});
  await legacyPage.waitForFunction(()=>{
    const value=localStorage.getItem('studiopro_active_project');
    if(!value)return false;
    try{return JSON.parse(value).id!=='00000000-0000-4000-8000-000000000001';}
    catch{return false;}
  },null,{timeout:15000});
  const legacy=await legacyPage.evaluate(()=>{
    const id='00000000-0000-4000-8000-000000000001';
    const old=JSON.parse(localStorage.getItem('studiopro_project_'+id));
    const active=JSON.parse(localStorage.getItem('studiopro_active_project'));
    const saved=JSON.parse(localStorage.getItem('studiopro_project_'+active.id));
    const index=JSON.parse(localStorage.getItem('studiopro_projects_index'));
    return {oldPreserved:old?.clips?.[0]?.type==='html',
      safeActive:active.id!==id&&saved?.clips?.length===0,
      legacyExecuted:window.__legacyExec,registered:index.projects.map(p=>p.id),
      safeName:active.name,
      oldStoresStillPresent:['custom_presets','studioPro_designTemplates','studiopro_custom_fonts'].every(key=>!!localStorage.getItem(key)),
      presetsQuarantined:window.loadCustomPresets?.().length===0,
      templatesQuarantined:window.loadDesignTemplates?.().length===0,
      importedFontCssInjected:document.head.textContent?.includes('evil-font-payload')||false};
  });
  assert.equal(legacy.oldPreserved,true,'Blocked historical project bytes must not be erased');
  assert.equal(legacy.safeActive,true,'A clean workspace should open when old project is unsafe');
  assert.equal(legacy.legacyExecuted,false,'Startup must never execute untrusted legacy HTML');
  assert.equal(legacy.oldStoresStillPresent,true,'Old user content must not be silently erased');
  assert.equal(legacy.presetsQuarantined,true,'Old custom preset JSON must not reach HTML sinks');
  assert.equal(legacy.templatesQuarantined,true,'Old template JSON must not reach HTML sinks');
  assert.equal(legacy.importedFontCssInjected,false,'Unsafe restored font names cannot poison privileged editor CSS');
  assert.ok(legacy.registered.includes('00000000-0000-4000-8000-000000000001'));
  assert.equal(legacy.registered.some(id=>id.includes("'")),false,
    'Malformed registry ID cannot flow into onclick HTML attributes');
  await legacyPage.screenshot({path:'artifacts/studio-pro-legacy-project-recovery-mobile.png',fullPage:true});
  await legacyPage.close();
  console.log('PASS: legacy unsafe project preserved, malicious registry identifiers rejected, clean mobile workspace auto-recovered');
  console.log('PASS: malicious project/template/preset/script denied and HTML/HIC/WAAPI legacy routes quarantined in Chrome');
}finally{
  if(browser)await browser.close();
  server.kill('SIGTERM');
}

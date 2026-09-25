// NEXORA downstream MPL-2.0 patch for the pinned Studio Pro HTML renderer.
// User HTML/CSS/JS never runs in the editor document or a same-origin iframe.
// The host receives UNTRUSTED PNG bytes only; messages are not auth signals.
import {captureBootstrap} from './nexora-frame-capture.js';

const MAX_PIXELS=8_300_000;
const MAX_PNG_BYTES=32*1024*1024;
const MAX_SOURCE_BYTES=300_000;
const sessions=new WeakMap();
const textSize=value=>new TextEncoder().encode(value).byteLength;
function assertSize(width,height,clip) {
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
    width>4096||height>4096||width*height>MAX_PIXELS) throw new Error('HTML frame dimensions exceed safe limits');
  for(const key of ['html','css','js']){
    if(typeof (clip[key]||'')!=='string'||textSize(clip[key]||'')>MAX_SOURCE_BYTES)
      throw new Error('HTML clip source exceeds safe limits');
  }
}
function hasPngSignature(bytes,width,height) {
  if(!(bytes instanceof ArrayBuffer)||bytes.byteLength<33||bytes.byteLength>MAX_PNG_BYTES)return false;
  const h=new Uint8Array(bytes,0,16);
  if(![137,80,78,71,13,10,26,10].every((n,i)=>h[i]===n))return false;
  const header=new DataView(bytes);
  // Reject PNG decompression bombs before the browser's image decoder sees
  // bytes. Valid PNG starts with a 13-byte IHDR declaring exact dimensions.
  return header.getUint32(8)===13 &&
    String.fromCharCode(...h.slice(12,16))==='IHDR' &&
    header.getUint32(16)===width && header.getUint32(20)===height;
}
function makeSrcdoc(session,width,height) {
  // Reuse NEXORA's Chrome-tested computed-style SVG snapshot capture engine
  // *inside* the opaque iframe. No html2canvas nested frame/document access.
  const policy="default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'"+
    "; frame-src 'none'; worker-src 'none'; form-action 'none'; object-src 'none'; base-uri 'none'; media-src 'none'";
  const runtime=`
    (() => {
      'use strict';
      const session=${JSON.stringify(session)};
      const root=document.getElementById('nx-root');
      const style=document.getElementById('nx-user-css');
      let initialized=false;
      let onFrame=null;
      const send=(kind,extra={},transfer=[])=>parent.postMessage({kind,session,...extra},'*',transfer);
      const frame=()=>Promise.race([new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(resolve))),new Promise(resolve=>setTimeout(resolve,150))]);
      window.addEventListener('message',async event=>{
        if(event.source!==parent||!event.data||event.data.session!==session)return;
        const data=event.data;
        if(data.kind==='nx-init'&&!initialized){
          initialized=true;
          try{
            style.textContent='*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden}'+data.css;
            root.style.background=data.backgroundColor||'transparent';
            root.innerHTML=data.html; // Only inside the opaque-origin sandbox.
            if(data.js){
              const script=document.createElement('script');
              script.textContent=data.js;
              document.body.appendChild(script);
            }
            try{onFrame=typeof window.onFrame==='function'?window.onFrame:typeof onFrame==='function'?onFrame:null;}catch{}
            await frame();
            send('nx-init-ok');
          }catch(error){send('nx-error',{message:'Sandbox initialization failed'});}
          return;
        }
        if(data.kind==='nx-frame'&&initialized){
          try{
            if(onFrame)await onFrame(data.timeMs);
            await frame();
            if(typeof window.__nexoraFrameCapture!=='function')throw new Error('Snapshot capture bootstrap unavailable');
            const bytes=await window.__nexoraFrameCapture(${width},${height});
            send('nx-png',{requestId:data.requestId,width:${width},height:${height},bytes},[bytes]);
          }catch(error){
            console.error('[NEXORA isolated frame capture]',String(error?.message||error).slice(0,160));
            send('nx-error',{requestId:data.requestId,message:'Sandbox frame capture failed'});
          }
        }
      });
      send('nx-ready');
    })();
  `;
  // None of the user-supplied strings are interpolated into srcdoc.
  // They arrive only in a structured postMessage after the sandbox boots.
  return '<!doctype html><html><head><meta charset="utf-8">'+
    '<meta http-equiv="Content-Security-Policy" content="'+policy+'">'+
    '<style>html,body{width:100%;height:100%;margin:0;overflow:hidden}#nx-root{width:'+width+'px;height:'+height+'px;overflow:hidden}</style>'+
    '<style id="nx-user-css"></style>'+
    captureBootstrap()+'</head><body>'+
    '<div id="nx-root"></div><script>'+runtime+'</script></body></html>';
}
export async function createIsolatedHtmlSession(clip,width,height,{container=null}={}) {
  assertSize(width,height,clip);
  const session=crypto.randomUUID();
  const iframe=document.createElement('iframe');
  iframe.setAttribute('sandbox','allow-scripts'); // Opaque-origin sandbox.
  iframe.setAttribute('referrerpolicy','no-referrer');
  iframe.setAttribute('title','Isolated HTML clip');
  iframe.setAttribute('data-nx-isolated-frame','');
  iframe.style.cssText=container?
    'width:100%;height:100%;border:0;display:block;background:transparent':
    'position:fixed;left:-10000px;top:-10000px;width:'+width+'px;height:'+height+'px;border:0;pointer-events:none';
  iframe.width=String(width);iframe.height=String(height);
  iframe.srcdoc=makeSrcdoc(session,width,height);
  let readyResolve,readyReject,initResolve,initReject;
  let destroyed=false;
  const pending=new Map();
  const ready=new Promise((resolve,reject)=>{readyResolve=resolve;readyReject=reject;});
  const init=new Promise((resolve,reject)=>{initResolve=resolve;initReject=reject;});
  let phase='boot';
  const timeout=setTimeout(()=>{if(phase==='boot')readyReject(new Error('Sandbox boot timeout'));else initReject(new Error('Sandbox init timeout'));},8000);
  function destroy() {
    if(destroyed)return;destroyed=true;
    clearTimeout(timeout);
    window.removeEventListener('message',onMessage);
    for(const waiter of pending.values()){clearTimeout(waiter.timeout);waiter.reject(new Error('Sandbox destroyed'));}
    pending.clear();iframe.remove();
  }
  function onMessage(event) {
    if(destroyed||event.source!==iframe.contentWindow||event.data?.session!==session)return;
    const data=event.data;
    if(data.kind==='nx-ready')readyResolve();
    else if(data.kind==='nx-init-ok')initResolve();
    else if(data.kind==='nx-error'&&data.requestId){
      const waiter=pending.get(data.requestId);
      if(waiter){pending.delete(data.requestId);clearTimeout(waiter.timeout);waiter.reject(new Error('HTML capture failed'));}
    }else if(data.kind==='nx-error'){initReject(new Error('HTML sandbox initialization failed'));}
    else if(data.kind==='nx-png'){
      const waiter=pending.get(data.requestId);
      if(!waiter)return;
      pending.delete(data.requestId);clearTimeout(waiter.timeout);
      if(data.width!==width||data.height!==height||!hasPngSignature(data.bytes,width,height)){
        waiter.reject(new Error('Invalid sandbox PNG response'));return;
      }
      waiter.resolve(data.bytes);
    }
  }
  window.addEventListener('message',onMessage);
  (container||document.body).appendChild(iframe);
  try {
    await ready;
    phase='init';
    if(destroyed)throw new Error('Sandbox destroyed');
    iframe.contentWindow.postMessage({kind:'nx-init',session,
      html:clip.html||'',css:clip.css||'',js:clip.js||'',
      backgroundColor:clip.backgroundColor||'transparent'},'*');
    await init;
    clearTimeout(timeout);
    return {
      iframe,
      async captureFrame(timeMs=0){
        if(destroyed)throw new Error('Sandbox destroyed');
        if(pending.size)throw new Error('Sandbox frame capture already in progress');
        if(!Number.isFinite(timeMs)||timeMs<0||timeMs>3600000)throw new Error('Invalid frame timestamp');
        const requestId=crypto.randomUUID();
        const bytes=await new Promise((resolve,reject)=>{
          const timer=setTimeout(()=>{pending.delete(requestId);reject(new Error('HTML frame timeout'));},12000);
          pending.set(requestId,{resolve,reject,timeout:timer});
          iframe.contentWindow.postMessage({kind:'nx-frame',session,requestId,timeMs},'*');
        });
        const bitmap=await createImageBitmap(new Blob([bytes],{type:'image/png'}));
        if(bitmap.width!==width||bitmap.height!==height){bitmap.close();throw new Error('Decoded frame dimensions mismatch');}
        return bitmap;
      },
      destroy
    };
  }catch(error){destroy();throw error;}
}
export function destroyIsolatedHtmlPreview(container) {
  const entry=sessions.get(container);
  if(entry){sessions.delete(container);entry.controller.aborted=true;entry.session?.destroy();}
  container.replaceChildren();
}
export async function mountIsolatedHtmlPreview(container,clip) {
  destroyIsolatedHtmlPreview(container);
  const controller={aborted:false,session:null};
  sessions.set(container,{controller});
  try{
    const session=await createIsolatedHtmlSession(clip,320,180,{container});
    controller.session=session;
    if(controller.aborted)session.destroy();
  }catch(error){
    if(!controller.aborted)container.textContent='Preview unavailable: isolated HTML failed';
  }
}

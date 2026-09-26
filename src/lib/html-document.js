// Experimental ONE-FILE HTML document mode. Trusted libraries are pinned to
// Three.js r172; arbitrary external scripts/assets stay blocked. Never run
// generated srcDoc outside sandbox="allow-scripts" (no allow-same-origin).
export const DOCUMENT_LIMIT=200_000;
const CDN='https://cdn.jsdelivr.net/npm/three@0.172.0/';
const CANONICAL={
  './three':CDN+'build/three.module.js',
  './three/webgl':CDN+'build/three.module.js',
  './three/tsl':CDN+'build/three.tsl.js',
  './three/addons/':CDN+'examples/jsm/',
  'three':CDN+'build/three.module.js',
  'three/addons/':CDN+'examples/jsm/'
};
const EXPECTED={
  './three':['https://assets.codepen.io/25387/three.webgpu.min.js',CANONICAL['./three']],
  './three/webgl':['https://esm.sh/three@0.172.0/src/renderers/WebGLRenderer.js',CANONICAL['./three/webgl']],
  './three/tsl':['https://assets.codepen.io/25387/three.tsl.js',CANONICAL['./three/tsl']],
  './three/addons/':['https://esm.sh/three@0.172.0/examples/jsm/',CANONICAL['./three/addons/']]
};
const POLICY=[
 "default-src 'none'","base-uri 'none'","object-src 'none'",
 "form-action 'none'","connect-src 'none'",
 "script-src 'unsafe-inline' https://cdn.jsdelivr.net",
 "style-src 'unsafe-inline'","img-src data: blob:","font-src data:",
 "media-src data: blob:","frame-src 'none'","child-src 'none'",
 "worker-src 'none'","manifest-src 'none'"
].join('; ');
function installWebGlCaptureCompatibility(){
  const getContext=HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext=function(type,attrs){
    if(type==='webgl'||type==='webgl2'||type==='experimental-webgl'){
      return getContext.call(this,type,Object.assign({},attrs||{},{preserveDrawingBuffer:true}));
    }
    return getContext.call(this,type,attrs);
  };
  // Screen DPR cannot silently quadruple GPU and PNG readback allocations.
  try{Object.defineProperty(window,'devicePixelRatio',{configurable:false,value:1});}catch{}
  addEventListener('webglcontextlost',event=>{
    console.error('WebGL context lost. Reduce geometry/shader complexity before export.');
    event.preventDefault();
  },true);
}
export function isCompleteHtml(value){
  return typeof value==='string' && /^\s*(?:<!doctype\s+html\s*>\s*)?<html(?:\s|>)/i.test(value);
}
export function assertDocumentSource(value){
  if(typeof value!=='string'||value.length<30||value.length>DOCUMENT_LIMIT||!isCompleteHtml(value))
    throw Error('Upload or paste a complete <!doctype html> file up to 200 KB.');
  if(/<\s*(?:base|iframe|frame|frameset|object|embed)\b/i.test(value))
    throw Error('Nested frames, plugins and base tags are unsupported in full-document mode.');
  return value;
}
export function buildFullDocument(input,{diagnostics='',timeline='',capture=''}={}){
  const source=assertDocumentSource(input?.document);
  if(typeof DOMParser==='undefined')throw Error('Full HTML document mode requires a browser DOM parser.');
  // Inert DOMParser markup is serialized only into the opaque sandbox frame.
  const doc=new DOMParser().parseFromString(source,'text/html');
  if(!doc.head||!doc.body)throw Error('Missing document head/body.');
  if(doc.querySelector('base,iframe,frame,frameset,object,embed'))
    throw Error('Full document has unsupported browser elements.');
  for(const el of doc.querySelectorAll('meta[http-equiv]')){
    if(el.getAttribute('http-equiv')?.toLowerCase()==='content-security-policy')el.remove();
    if(el.getAttribute('http-equiv')?.toLowerCase()==='refresh')throw Error('HTML refresh redirects are blocked.');
  }
  for(const el of doc.querySelectorAll('link')){
    if(/\b(?:stylesheet|preload|modulepreload|prefetch|dns-prefetch|preconnect|manifest)\b/i.test(el.getAttribute('rel')||''))
      throw Error('External stylesheet/preload links are disabled. Embed fonts and CSS.');
  }
  for(const el of doc.querySelectorAll('img,video,audio,source,track')){
    const url=el.getAttribute('src')||'';
    if(!/^data:(?:image\/(?:png|jpeg|webp|gif)|video\/mp4|audio\/(?:mpeg|wav));/i.test(url)||el.hasAttribute('srcset'))
      throw Error('Use embedded data:image assets. Remote media and srcset are unsupported.');
  }
  for(const el of doc.querySelectorAll('[src],[href]')){
    if(['script','img','video','audio','source','track','link'].includes(el.localName))continue;
    const url=el.getAttribute('src')||el.getAttribute('href')||'';
    if(/^\s*(?:https?:|\/\/|javascript:|blob:|file:)/i.test(url))
      throw Error('External element URLs must be embedded in the HTML file.');
  }
  const maps=[...doc.querySelectorAll('script[type="importmap"]')];
  if(maps.length>1)throw Error('Only one pinned importmap is supported.');
  if(maps.length){
    let map;
    try{map=JSON.parse(maps[0].textContent||'');}catch{throw Error('Invalid importmap JSON.');}
    if(!map||!map.imports||map.scopes||Object.keys(map).some(key=>key!=='imports'))
      throw Error('Only a simple pinned Three.js importmap is supported.');
    const keys=Object.keys(map.imports);
    if(!keys.length||keys.length>8)throw Error('Unsupported importmap size.');
    for(const key of keys){
      if(!EXPECTED[key]?.includes(map.imports[key])&&CANONICAL[key]!==map.imports[key])
        throw Error('Unsupported module mapping: '+key+'. Only Three.js 0.172 is enabled in this experiment.');
      map.imports[key]=CANONICAL[key];
    }
    // Ensure addons and WebGLRenderer share ONE Three.js module instance.
    map.imports.three=CANONICAL.three;
    map.imports['three/addons/']=CANONICAL['three/addons/'];
    maps[0].textContent=JSON.stringify(map).replace(/</g,'\\u003c');
    doc.documentElement.setAttribute('data-nexora-require-module-canvas','true');
  }
  for(const script of doc.querySelectorAll('script')){
    const src=script.getAttribute('src');
    if(src){
      // Redundant legacy CodePen TSL global: the scene's ES modules provide
      // all of its own imports; the original CDN URL is not a valid library.
      if(src==='https://cdnjs.cloudflare.com/ajax/libs/three.js/0.172.0/three.tsl.js'){
        script.remove();continue;
      }
      throw Error('External script tags are blocked. Use the pinned Three.js importmap.');
    }
    const type=(script.getAttribute('type')||'').toLowerCase().trim();
    if(type&&!['module','importmap','text/javascript','application/javascript'].includes(type))
      throw Error('Unsupported full-document script type: '+type);
    if(/\bimport\s*(?:\(|[\s\S]*?\bfrom\s*)['"]\s*(?:https?:|\/\/|data:|blob:)/.test(script.textContent||''))
      throw Error('Unlisted remote imports are not supported by the experimental document renderer.');
  }
  const webgl='<script>('+installWebGlCaptureCompatibility.toString()+')();</script>';
  // Keep original script/importmap order; compatibility and virtual clock MUST
  // run before user scripts. Only ever use this within opaque sandbox srcdoc.
  const html=doc.documentElement.outerHTML;
  const prep='<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<meta name="referrer" content="no-referrer">'+
    '<meta http-equiv="Content-Security-Policy" content="'+POLICY+'">'+
    webgl+diagnostics+timeline+capture;
  return '<!doctype html>'+html.replace(/<head([^>]*)>/i,(match)=>match+prep);
}

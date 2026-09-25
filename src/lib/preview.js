import {captureBootstrap} from './html-frame-capture.js';
import {timelineBootstrap} from './timeline-runtime.js';
// First-party HTML Motion Lab sandbox. The resulting srcDoc MUST be used only in
// iframe sandbox="allow-scripts" WITHOUT allow-same-origin or other permissions.
// CSP blocks ordinary network APIs/resources, but is not total egress/CPU isolation.
// Untrusted console messages must only ever be rendered as plain text.
export const PREVIEW_CHANNEL='nexora-preview-console-v1';
export const PREVIEW_CSP=[
  "default-src 'none'",
  "base-uri 'none'",
  "object-src 'none'",
  "form-action 'none'",
  "connect-src 'none'",
  "script-src 'unsafe-inline'",
  "style-src 'unsafe-inline'",
  "img-src data: blob:",
  "font-src data:",
  "media-src data: blob:",
  "frame-src 'none'",
  "child-src 'none'",
  "worker-src 'none'",
  "manifest-src 'none'"
].join('; ');

export function assertPreviewSize({html='',css='',svg='',js=''}={}){
  const input={html,css,svg,js};
  const ceilings={html:200_000,css:100_000,svg:200_000,js:100_000};
  for(const [name,value] of Object.entries(input)){
    if(typeof value!=='string'||value.length>ceilings[name]){
      throw new Error(name.toUpperCase()+' exceeds the preview code size limit.');
    }
  }
  return input;
}
const closeStyle=content=>content.replace(/<\/style/gi,'<\\/style');
const closeScript=content=>content.replace(/<\/script/gi,'<\\/script');

function diagnosticsScript(session){
  // The session distinguishes old iframe diagnostics; it is not a secret.
  if(!session)return '';
  const id=JSON.stringify(session).replace(/</g,'\\u003c');
  const channel=JSON.stringify(PREVIEW_CHANNEL);
  const code=[
    '(function(){',
    'const session='+id+', channel='+channel+';let entries=0;',
    'const emit=(level,message)=>{if(++entries>40)return;try{parent.postMessage({channel,session,level,message:String(message).slice(0,240)},"*");}catch{}};',
    'const stringify=value=>{try{return typeof value==="string"?value:JSON.stringify(value)??String(value);}catch{return String(value);}};',
    'for(const level of ["log","warn","error"]){const previous=console[level];console[level]=(...args)=>{emit(level,args.map(stringify).join(" "));if(typeof previous==="function")previous.apply(console,args);};}',
    'addEventListener("error",event=>emit("error",event.message||"Preview script error"));',
    'addEventListener("unhandledrejection",event=>emit("error",String(event.reason)));',
    'addEventListener("securitypolicyviolation",event=>emit("warn","Blocked by CSP: "+event.violatedDirective));',
    'addEventListener("DOMContentLoaded",()=>emit("ready","HTML / CSS / SVG / JS preview loaded."));',
    '})();'
  ].join('');
  return '<script>'+code+'</script>';
}
export function buildPreviewDoc(input={}){
  const {html,css,svg,js}=assertPreviewSize(input);
  const session=input.session;
  if(session!==undefined&&(typeof session!=='string'||session.length>120))throw new Error('Invalid preview session.');
  return [
    '<!doctype html><html><head>',
    '<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">',
    '<meta name="referrer" content="no-referrer">',
    '<meta http-equiv="Content-Security-Policy" content="'+PREVIEW_CSP+'">',
    diagnosticsScript(session),
    input.controlled?timelineBootstrap(session):'',
    input.controlled&&input.capture?captureBootstrap():'',
    '<style>html,body{margin:0;min-height:100%}*{box-sizing:border-box}'+closeStyle(css)+'</style>',
    '</head><body>',
    html,
    svg?'<div data-nexora-svg-root="">'+svg+'</div>':'',
    js?'<script>'+closeScript(js)+'</script>':'',
    '</body></html>'
  ].join('');
}

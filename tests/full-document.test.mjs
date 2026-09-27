import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertDocumentSource,isCompleteHtml,DOCUMENT_LIMIT,normalizePinnedThreeImportMap} from '../src/lib/html-document.js';
import {validateHtmlVideoOptions} from '../src/lib/html-video-plan.js';
import {buildPreviewDoc} from '../src/lib/preview.js';

const sample='<!doctype html><html><head><style>canvas{display:block}</style></head><body>'+
  '<canvas></canvas><script>requestAnimationFrame(function spin(){requestAnimationFrame(spin)});</script></body></html>';

test('one complete HTML document is accepted; four-tab behavior is unchanged',()=>{
 assert.ok(isCompleteHtml(sample));
 assert.equal(assertDocumentSource(sample),sample);
 assert.equal(isCompleteHtml('<main>fragment only</main>'),false);
 const old=buildPreviewDoc({html:'<p>works</p>',css:'p{color:red}',svg:'',js:''});
 assert.match(old,/data-nexora-svg-root|<p>works<\/p>/);
 assert.doesNotMatch(old,/cdn\.jsdelivr\.net/);
});

test('full document input must be complete and bounded without privileged frames',()=>{
 for(const source of ['','<main>not a document</main>','x'.repeat(DOCUMENT_LIMIT+1),
  '<!doctype html><html><head><base href="https://attacker.invalid/"></head><body></body></html>',
  '<!doctype html><html><body><iframe src="javascript:alert(1)"></iframe></body></html>']){
   assert.throws(()=>assertDocumentSource(source));
 }
});

test('long full-document export only at limited mobile-safe resolution',()=>{
 assert.equal(validateHtmlVideoOptions({document:sample,size:'compact',fps:30,duration:10}).frames,300);
 assert.throws(()=>validateHtmlVideoOptions({document:sample,size:'landscape',fps:30,duration:5}));
 assert.throws(()=>validateHtmlVideoOptions({size:'compact',fps:30,duration:5}));
 assert.throws(()=>validateHtmlVideoOptions({document:sample,size:'landscape',fps:60,duration:1}));
});

import {classifyRenderError,makeRenderReport} from '../src/lib/render-fidelity-report.js';
test('full HTML reports distinguish invalid input, WebGL loss and module error without leaking code',()=>{
 assert.equal(classifyRenderError(new Error('Upload or paste a complete <!doctype html> file')),'INPUT');
 assert.equal(classifyRenderError(new Error('WebGL context lost after GPU reset')),'WEBGL');
 assert.equal(classifyRenderError(new Error('Pinned Three.js module failed to load')),'MODULE');
 const source={document:'<!doctype html><html><head></head><body>private</body></html>'};
 assert.equal(makeRenderReport({}, {error:new Error('Upload or paste a complete html'),source}).source,undefined);
 assert.equal(makeRenderReport({}, {includeSource:true,source}).source.document,source.document);
});

test('common bare three and CodePen relative r172 importmap aliases normalize to one pinned graph',()=>{
 const accepted=[
   'https://esm.sh/three@0.172.0',
   'https://esm.sh/three@0.172.0?bundle',
   'https://esm.sh/three@0.172.0?target=es2022',
   'https://cdn.jsdelivr.net/npm/three@0.172.0/+esm',
   'https://unpkg.com/three@0.172.0/build/three.module.js',
   'https://assets.codepen.io/25387/three.webgpu.min.js'
 ];
 for(const alias of accepted){
   const result=normalizePinnedThreeImportMap({imports:{
     three:alias,
     './three':'https://assets.codepen.io/25387/three.webgpu.min.js',
     './three/webgl':'https://esm.sh/three@0.172.0/src/renderers/WebGLRenderer.js',
     './three/addons/':'https://esm.sh/three@0.172.0/examples/jsm/'
   }});
   const pinned='https://cdn.jsdelivr.net/npm/three@0.172.0/';
   assert.equal(result.imports.three,pinned+'build/three.module.js');
   assert.equal(result.imports['./three'],result.imports.three);
   assert.equal(result.imports['./three/webgl'],result.imports.three);
   assert.equal(result.imports['./three/addons/'],pinned+'examples/jsm/');
   assert.equal(result.imports['three/addons/'],pinned+'examples/jsm/');
   assert.ok(!JSON.stringify(result).includes('esm.sh'));
 }
 const defaults=normalizePinnedThreeImportMap({imports:{'three':'https://esm.sh/three@0.172.0'}});
 assert.equal(defaults.imports['three/addons/'],
   'https://cdn.jsdelivr.net/npm/three@0.172.0/examples/jsm/');
});

test('fail-closed importmap rejects unrecognized versions, hosts, credentials and custom scripts',()=>{
 const unsafe=[
   'https://esm.sh/three@0.180.0',
   'https://cdn.jsdelivr.net/npm/three@0.173.0/build/three.module.js',
   'https://cdn.jsdelivr.net/npm/not-three@0.172.0/build/three.module.js',
   'https://attacker.invalid/three@0.172.0/build/three.module.js',
   'http://esm.sh/three@0.172.0',
   'javascript:alert(1)',
   'https://user:password@esm.sh/three@0.172.0',
   'https://esm.sh/three@0.172.0?external=react'
 ];
 for(const alias of unsafe)
   assert.throws(()=>normalizePinnedThreeImportMap({imports:{three:alias}}),
     /Unsupported module mapping: three/,
     'Reject unsafe r172 alias '+alias);
 for(const imports of [{react:'https://esm.sh/react@19'},
   {'__proto__':'https://esm.sh/three@0.172.0',react:'https://esm.sh/react@19'}])
   assert.throws(()=>normalizePinnedThreeImportMap({imports}));
 assert.throws(()=>normalizePinnedThreeImportMap({imports:{three:unsafe[0]},scopes:{}}));
});

test('error categorization recognizes unsupported module mapping as a module issue',()=>{
 assert.equal(classifyRenderError(new Error('Unsupported module mapping: three')),'MODULE');
});

import {normalizeKnownThreeDirectImports} from '../src/lib/html-document.js';
test('Cosmic Animation five esm.sh imports normalize to ONE explicit r172 module graph',()=>{
 const originals=[
  'three','three/addons/controls/OrbitControls.js',
  'three/addons/postprocessing/EffectComposer.js',
  'three/addons/postprocessing/RenderPass.js',
  'three/addons/postprocessing/UnrealBloomPass.js'
 ];
 const input=originals.map((path,i)=>'import {X'+i+'} from "https://esm.sh/'+path+'";').join('\n');
 const out=normalizeKnownThreeDirectImports(input);
 assert.equal(out.count,5);
 assert.equal(out.unpinned,true);
 assert.deepEqual(out.code.split('\n'),originals.map((path,i)=>
   'import {X'+i+'} from "'+path+'";'));
 for(const path of originals){
   const explicit=normalizeKnownThreeDirectImports("import X from 'https://esm.sh/"+
     path.replace('three','three@0.172.0')+"';");
   assert.equal(explicit.count,1);
   assert.equal(explicit.unpinned,false);
 }
});
test('Cosmic compatibility accepts packed semicolon-delimited static imports, not dynamic imports',()=>{
 const input='import * as THREE from "https://esm.sh/three";'+
   'import {EffectComposer} from "https://esm.sh/three/addons/postprocessing/EffectComposer.js";'+
   'await import("https://esm.sh/three");';
 const normalized=normalizeKnownThreeDirectImports(input);
 assert.equal(normalized.count,2);
 assert.ok(normalized.code.startsWith('import * as THREE from "three";'));
 assert.ok(normalized.code.includes('from "three/addons/postprocessing/EffectComposer.js"'));
 assert.ok(normalized.code.includes('await import("https://esm.sh/three")'));
});

test('Cosmic bridge refuses unknown hosts, unsafe versions, arbitrary addons, and dynamic imports',()=>{
 for(const url of [
  'https://esm.sh/three@0.180.0','https://esm.sh/three/addons/loaders/Unsafe.js',
  'https://esm.sh.attacker.example/three','http://esm.sh/three',
  'https://esm.sh/three?external=react','https://esm.sh/react'
 ]){
   const text="import X from '"+url+"';";
   assert.deepEqual(normalizeKnownThreeDirectImports(text),{code:text,count:0,unpinned:false});
 }
 const dynamic='await import("https://esm.sh/three")';
 assert.deepEqual(normalizeKnownThreeDirectImports(dynamic),{code:dynamic,count:0,unpinned:false});
});

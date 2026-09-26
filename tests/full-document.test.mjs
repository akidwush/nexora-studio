import {test} from 'node:test';
import assert from 'node:assert/strict';
import {assertDocumentSource,isCompleteHtml,DOCUMENT_LIMIT} from '../src/lib/html-document.js';
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

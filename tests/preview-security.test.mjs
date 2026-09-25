import {test} from 'node:test';
import assert from 'node:assert/strict';
import {buildPreviewDoc,PREVIEW_CSP,PREVIEW_CHANNEL,assertPreviewSize} from '../src/lib/preview.js';

test('sandbox CSP forbids ordinary network APIs and privilege-bearing elements',()=>{
  const s=buildPreviewDoc({html:'<h1>Hi</h1>',css:'h1{color:red}',svg:'<svg><circle r="10"/></svg>',js:'console.log(2)',session:'session-1'});
  for(const directive of ["default-src 'none'","connect-src 'none'","frame-src 'none'","worker-src 'none'","form-action 'none'","base-uri 'none'"]){
    assert.ok(PREVIEW_CSP.includes(directive),directive);
    assert.ok(s.includes(directive),directive);
  }
  assert.ok(s.includes('data-nexora-svg-root'));assert.ok(s.includes('<circle r="10"'));
  assert.ok(s.includes(PREVIEW_CHANNEL));assert.ok(s.includes('session-1'));
});
test('closing script/style tags cannot break user source embedding',()=>{
  const s=buildPreviewDoc({css:'p:after{content:"</style><img id=escape>"}',js:'const x="</script><script>window.escaped=true</script>";'});
  assert.ok(!s.includes('</style><img id=escape>'));
  assert.ok(!s.includes('</script><script>window.escaped'));
  assert.ok(s.includes('<\\/style>'));
  assert.ok(s.includes('<\\/script>'));
});
test('bounded preview input and session checks',()=>{
  assert.throws(()=>buildPreviewDoc({js:'x'.repeat(100001)}),/JS exceeds/);
  assert.throws(()=>buildPreviewDoc({svg:'y'.repeat(200001)}),/SVG exceeds/);
  assert.throws(()=>buildPreviewDoc({session:43}),/Invalid preview session/);
  assert.deepEqual(assertPreviewSize({}),{html:'',css:'',svg:'',js:''});
});
test('standalone HTML export does not inject parent console bridge',()=>{
  const s=buildPreviewDoc({html:'<main>Standalone</main>',js:'console.log("works")'});
  assert.ok(s.includes('<main>Standalone</main>'));
  assert.ok(!s.includes(PREVIEW_CHANNEL));
});

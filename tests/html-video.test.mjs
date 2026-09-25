import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateHtmlVideoOptions,HTML_VIDEO_SIZES,checkedCaptureMessage} from '../src/lib/html-video-plan.js';
import {frameTimestamp} from '../src/lib/timeline-runtime.js';
test('HTML export plans have bounded exact index-derived durations',()=>{
  const p=validateHtmlVideoOptions({size:'compact',fps:60,duration:3});
  assert.equal(p.frames,180);assert.equal(frameTimestamp(1,p.fps),1000/60);
  for(const size of Object.values(HTML_VIDEO_SIZES)){
    assert.equal(size.width%2,0);assert.equal(size.height%2,0);
  }
});
test('rejects unsupported 60 FPS HD and resource-heavy durations',()=>{
  for(const opt of [
    {size:'landscape',fps:60,duration:1},
    {size:'portrait',fps:60,duration:1},
    {size:'compact',fps:120,duration:1},
    {size:'compact',fps:30,duration:8}
  ])assert.throws(()=>validateHtmlVideoOptions(opt));
});
test('strict transfer rejects wrong frame/time, oversized payload and non-PNG',()=>{
 const p=validateHtmlVideoOptions({size:'compact',fps:30,duration:1});
 const raw=new Uint8Array(100);raw.set([137,80,78,71,13,10,26,10]);
 const request={id:'test-id',frame:3};
 const msg={kind:'captured',id:'test-id',frame:3,fps:30,ms:100,bytes:raw.buffer};
 assert.equal(checkedCaptureMessage(msg,request,p),raw.buffer);
 assert.throws(()=>checkedCaptureMessage({...msg,ms:99},request,p),/Invalid/);
 assert.throws(()=>checkedCaptureMessage({...msg,frame:2},request,p),/Invalid/);
 assert.throws(()=>checkedCaptureMessage({...msg,bytes:new Uint8Array(100).buffer},request,p),/PNG/);
});

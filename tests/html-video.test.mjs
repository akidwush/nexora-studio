import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateHtmlVideoOptions,HTML_VIDEO_SIZES,htmlVideoBitrate,checkedCaptureMessage} from '../src/lib/html-video-plan.js';
import {frameTimestamp} from '../src/lib/timeline-runtime.js';
import {criticalFrameIndices} from '../src/lib/mp4-output-sink.js';
test('HTML export plans have bounded exact index-derived durations',()=>{
  const p=validateHtmlVideoOptions({size:'compact',fps:60,duration:3});
  assert.equal(p.frames,180);assert.equal(frameTimestamp(1,p.fps),1000/60);
  for(const size of Object.values(HTML_VIDEO_SIZES)){
    assert.equal(size.width%2,0);assert.equal(size.height%2,0);
  }
});
test('four-tab and complete HTML share the real 8-second 30 FPS contract',()=>{
  const tabs=validateHtmlVideoOptions({size:'compact',fps:30,duration:8});
  const document=validateHtmlVideoOptions({document:'<!doctype html><html><body>ok</body></html>',size:'compact',fps:30,duration:8});
  assert.equal(tabs.frames,240);assert.equal(document.frames,240);
  assert.equal(tabs.duration,8);assert.equal(htmlVideoBitrate(tabs),5_000_000);
});
test('rejects unsupported 60 FPS HD and resource-heavy durations',()=>{
  for(const opt of [
    {size:'landscape',fps:60,duration:1},
    {size:'portrait',fps:60,duration:1},
    {size:'compact',fps:120,duration:1},
    {size:'compact',fps:30,duration:10}
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

test('ten-second cinematic HTML verifies seven spread decoded frames and uses higher bitrate',()=>{
  const long=validateHtmlVideoOptions({
    document:'<!doctype html><html><head></head><body>motion</body></html>',
    size:'compact',fps:30,duration:10
  });
  assert.equal(long.frames,300);
  assert.equal(htmlVideoBitrate(long),5_000_000);
  assert.deepEqual(criticalFrameIndices(300,{duration:10}),[0,50,100,150,200,250,299]);
  assert.deepEqual(criticalFrameIndices(150),[0,75,149]);
  assert.deepEqual(criticalFrameIndices(192,{duration:8}),[0,48,96,144,191]);
  assert.deepEqual(criticalFrameIndices(30),[0,15,29]);
  assert.deepEqual(criticalFrameIndices(180),[0,90,179]);
  assert.deepEqual(criticalFrameIndices(300,{duration:5}),[0,150,299]);
  assert.deepEqual(criticalFrameIndices(1),[0]);
});
test('8/10-second 720p is explicit local stream only, never a hidden mobile allocation',()=>{
  const source={document:'<!doctype html><html><head></head><body>motion</body></html>',
    size:'landscape',fps:30,duration:10};
  assert.throws(()=>validateHtmlVideoOptions(source),/640/);
  assert.throws(()=>validateHtmlVideoOptions({...source,stream:false}),/640/);
  assert.throws(()=>validateHtmlVideoOptions({...source,fps:60,stream:true}),/640|60 FPS/);
  assert.throws(()=>validateHtmlVideoOptions({...source,size:'portrait',stream:true}),/640/);
  const standard=validateHtmlVideoOptions({...source,duration:8,stream:true});
  assert.equal(standard.frames,240);
  assert.equal(standard.hdLong,true);
  const hd=validateHtmlVideoOptions({...source,stream:true});
  assert.equal(hd.hdLong,true);
  assert.equal(hd.frames,300);
  assert.equal(hd.width,1280);
  assert.equal(hd.height,720);
  assert.equal(htmlVideoBitrate(hd),9_000_000);
});

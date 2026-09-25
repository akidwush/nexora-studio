import {test} from 'node:test';
import assert from 'node:assert/strict';
import {Script} from 'node:vm';
import {frameTimestamp,SUPPORTED_FPS,MAX_TIMELINE_FRAMES,timelineBootstrap,VIRTUAL_EPOCH_MS} from '../src/lib/timeline-runtime.js';

test('timestamps derive from integer frame index without cumulative floating-point addition',()=>{
  for(const fps of SUPPORTED_FPS){
    for(const index of [0,1,2,13,107,MAX_TIMELINE_FRAMES-1]){
      assert.equal(frameTimestamp(index,fps),index*1000/fps);
    }
  }
  assert.equal(frameTimestamp(30,30),1000);
  assert.equal(frameTimestamp(1,60),1000/60);
  assert.equal(VIRTUAL_EPOCH_MS,Date.UTC(2020,0,1));
});
test('frame requests reject invalid FPS and negative/out-of-bounds frames',()=>{
  for(const args of [[0,0],[1,25],[-1,30],[MAX_TIMELINE_FRAMES,60],[.5,30]]){
    assert.throws(()=>frameTimestamp(...args),RangeError);
  }
});
test('inline virtual runtime parses and includes deterministic JS/timer/CSS/SMIL hooks',()=>{
  const html=timelineBootstrap('stable-session');
  const code=html.slice(8,-9);
  assert.doesNotThrow(()=>new Script(code));
  for(const signature of ['stable-session','requestAnimationFrame','getAnimations','setCurrentTime','VirtualDate','Math.random','nativeRAF','DOMContentLoaded']){
    assert.ok(html.includes(signature),'Missing '+signature);
  }
  assert.throws(()=>timelineBootstrap(''),/requires/);
});

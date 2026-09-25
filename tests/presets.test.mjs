import {test} from 'node:test';
import assert from 'node:assert/strict';
import {MOTION_PRESETS,getMotionPreset} from '../src/lib/presets.js';
import {buildPreviewDoc} from '../src/lib/preview.js';
test('four distinct local presets available',()=>{
 assert.equal(MOTION_PRESETS.length,4);
 assert.equal(new Set(MOTION_PRESETS.map(p=>p.id)).size,4);
});
test('preset content builds CSP-protected isolated document',()=>{
 for(const preset of MOTION_PRESETS){
  const doc=buildPreviewDoc(preset);
  assert.match(doc,/Content-Security-Policy/);
  assert.match(doc,/@keyframes/);
  assert.ok(!/https?:\/\//.test(preset.html+preset.css+preset.js));
  assert.equal(getMotionPreset(preset.id),preset);
 }
});
test('unknown preset returns null',()=>assert.equal(getMotionPreset('unknown'),null));

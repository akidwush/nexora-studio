import {test} from 'node:test';
import assert from 'node:assert/strict';
import {VIDEO_PRESETS,VIDEO_SIZES,validateVideoOptions,motionState} from '../src/video/timeline.js';
test('unique motion presets',()=>assert.equal(new Set(VIDEO_PRESETS.map(p=>p.id)).size,3));
test('video plan calculates an exact frame count',()=>{
 const p=validateVideoOptions({preset:'orbit',size:'compact',fps:24,duration:3});
 assert.deepEqual({frames:p.frames,width:p.width,height:p.height},{frames:72,width:640,height:360});
});
test('reject out-of-bounds render requests',()=>{
 for(const o of [{preset:'orbit',size:'compact',fps:24,duration:60},{preset:'orbit',size:'compact',fps:120,duration:3},{preset:'orbit',size:'wat',fps:24,duration:3}])assert.throws(()=>validateVideoOptions(o));
});
test('motion state deterministic and time driven',()=>{
 const a=motionState('kinetic',1.5,3);
 assert.deepEqual(a,motionState('kinetic',1.5,3));assert.equal(a.progress,.5);
 assert.throws(()=>motionState('bogus',2,3));
});
test('dimensions capped at HD and even for H264',()=>{
 for(const s of Object.values(VIDEO_SIZES)){assert.equal(s.width%2,0);assert.equal(s.height%2,0);assert.ok(s.width*s.height<=1280*720);}
});

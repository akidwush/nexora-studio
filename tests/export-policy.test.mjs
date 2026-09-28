import {test} from 'node:test';
import assert from 'node:assert/strict';
import {UNIVERSAL_EXPORT_DURATION,STANDARD_EXPORT_FPS,assessEightSecondExport} from '../src/lib/export-policy.js';

test('simple export constants are universally 8 seconds and 30 FPS',()=>{
  assert.equal(UNIVERSAL_EXPORT_DURATION,8);
  assert.equal(STANDARD_EXPORT_FPS,30);
});

test('mobile-safe export stays local while HD fails closed without streaming',()=>{
  assert.deepEqual(assessEightSecondExport({width:640,height:360,fps:30}),{
    supported:true,mode:'download',label:'Cocok untuk Android kelas menengah.'
  });
  const blocked=assessEightSecondExport({width:1280,height:720,fps:30,streamAvailable:false});
  assert.equal(blocked.supported,false);assert.match(blocked.reason,/streaming/);
  const desktop=assessEightSecondExport({width:1280,height:720,fps:30,streamAvailable:true,memoryGb:8,finePointer:true});
  assert.equal(desktop.supported,true);assert.equal(desktop.mode,'stream');
});

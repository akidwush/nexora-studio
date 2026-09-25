import {test} from 'node:test';
import assert from 'node:assert/strict';
import {validateHtmlVideoOptions,validateMatte} from '../src/lib/html-video-plan.js';
import {rgbaSimilarity} from '../src/lib/html-frame-parity.js';

test('explicit H.264 matte has normalized six-digit color and safe defaults',()=>{
  assert.equal(validateMatte(undefined),'#FFFFFF');
  assert.equal(validateMatte('#ab41ff'),'#AB41FF');
  assert.equal(validateHtmlVideoOptions({size:'compact',fps:60,duration:1,matte:'#123456'}).matte,'#123456');
  for(const matte of ['transparent','rgba(0,0,0,.2)','url(javascript:1)','#fff','FFFFFF']){
    assert.throws(()=>validateMatte(matte),/matte/);
  }
});
test('RGBA visual scoring accounts for meaningful color mismatches',()=>{
  const expected=Uint8ClampedArray.of(10,20,30,255,120,140,160,255);
  const matched=Uint8ClampedArray.of(11,21,30,255,119,140,159,255);
  const quality=rgbaSimilarity(expected,matched);
  assert.ok(quality.meanError<2);
  assert.equal(quality.severeFraction,0);
  const wrong=Uint8ClampedArray.of(240,240,240,255,120,140,160,255);
  assert.ok(rgbaSimilarity(expected,wrong).severeFraction>.49);
  assert.throws(()=>rgbaSimilarity(new Uint8ClampedArray(4),new Uint8ClampedArray(8)),/equal/);
});

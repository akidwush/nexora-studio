import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {resolveStudioProUrl} from '../src/lib/studio-pro-url.js';

test('Studio Pro link fails closed; no same-origin or downgrade fallback',()=>{
  const shell='https://studio.nexora.example';
  for(const value of [undefined,'','/studio-pro/','https://studio.nexora.example/','https://editor.nexora.example/','http://editor.other.test/','https://editor.other.test/same-path','https://user:password@editor.other.test/','javascript:alert(1)']){
    assert.equal(resolveStudioProUrl(value,shell),null,String(value));
  }
  assert.equal(resolveStudioProUrl('https://editor.separate.test/',shell),'https://editor.separate.test/');
});

test('main output never embeds unreviewed editor at a shell path',async()=>{
  const code=await readFile(new URL('../scripts/build-upstream.mjs',import.meta.url),'utf8');
  assert.match(code,/dist-studio-pro/);
  assert.doesNotMatch(code,/cp\([^\n]*resolve\(['"]dist\/studio-pro/);
  const main=await readFile(new URL('../src/main.tsx',import.meta.url),'utf8');
  assert.doesNotMatch(main,/href=['"]\/studio-pro\/|fetch\(['"]\/studio-pro/);
  assert.match(main,/noopener noreferrer/);
});

test('upstream hardening must be part of separate build, not an opt-in bypass',async()=>{
  const code=await readFile(new URL('../scripts/build-upstream.mjs',import.meta.url),'utf8');
  assert.match(code,/harden-upstream\.mjs/);
  const patch=await readFile(new URL('../patches/studio-pro/isolated-frame.js',import.meta.url),'utf8');
  assert.match(patch,/sandbox['"],\s*['"]allow-scripts/);
  assert.doesNotMatch(patch,/allow-same-origin|contentDocument|contentWindow\.document/);
  assert.match(patch,/postMessage/);
});

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


test('all unreviewed monolithic project import and script routes are locked in mandatory build',async()=>{
 const build=await readFile(new URL('../scripts/build-upstream.mjs',import.meta.url),'utf8');
 const patch=await readFile(new URL('../scripts/harden-upstream-ingress.mjs',import.meta.url),'utf8');
 const verify=await readFile(new URL('../scripts/verify-studio-public-ingress.mjs',import.meta.url),'utf8');
 assert.ok(build.includes('harden-upstream-ingress.mjs'));
 assert.ok(build.includes('harden-upstream-secondary-assets.mjs'));
 const secondary=await readFile(new URL('../scripts/harden-upstream-secondary-assets.mjs',import.meta.url),'utf8');
 for(const entry of ['replaceClipSource','replaceAudioLibFile','importClipSfx',
  'importMarkdownAudioFor','importMarkdownAudioBatch','reimportAudioLibrary','runReimport'])
   assert.ok(secondary.includes(entry),'Secondary ingest must be patched: '+entry);
 assert.match(patch,/LOCKED_BLOB/);
 for(const term of ['importProjectFileObj','importSpcomp','loadCompositionScript',
  'importDesignTemplateFile','window.importPresets','window.openHicEditor',
  'window.openHtmlEditor','window.__waapiSeekFrame',
  'false && clip.type ==='])assert.ok(patch.includes(term),term);
 assert.match(patch,/__nexoraAssertSafeProject/);
 assert.match(patch,/__nexoraSafeMedia/);
 assert.match(patch,/__nexoraInspectMedia/);
 assert.match(patch,/__nexoraSafeFontRecord/);
 for(const name of ['loadCustomPresets','loadDesignTemplates']) assert.ok(patch.includes(name));
 assert.match(patch,/PWA service-worker/);
 assert.match(verify,/publicUntrustedImportsAuthorized:false/);
 assert.ok(!build.includes('NEXORA_PUBLIC_STUDIO_IMPORTS=true'));
});

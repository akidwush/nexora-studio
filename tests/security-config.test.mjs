import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';

test('patched Vite 7 line and no automatic public dev binding',async()=>{
  const p=JSON.parse(await readFile(new URL('../package.json',import.meta.url),'utf8'));
  assert.equal(p.devDependencies.vite,'7.3.6','Keep the 7.x patch that fixes disclosed file-read advisories.');
  assert.match(p.scripts.dev,/--host\s+127\.0\.0\.1/);
  assert.doesNotMatch(p.scripts.dev,/0\.0\.0\.0|--host\s+true/);
  const config=await readFile(new URL('../vite.config.ts',import.meta.url),'utf8');
  assert.match(config,/host:\s*['"]127\.0\.0\.1['"]/);
  assert.match(config,/fs:\s*\{\s*strict:\s*true/);
});

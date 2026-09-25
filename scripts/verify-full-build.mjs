import { access, readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const base=resolve('dist');
const upstream=resolve('dist/studio-pro');
async function mustExist(file) { await access(file); }
await mustExist(join(base,'index.html'));
await mustExist(join(upstream,'index.html'));
await mustExist(join(upstream,'LICENSE'));
await mustExist(join(upstream,'NOTICE'));
const rootHtml=await readFile(join(base,'index.html'),'utf8');
const editorHtml=await readFile(join(upstream,'index.html'),'utf8');
const license=await readFile(join(upstream,'LICENSE'),'utf8');
const notice=await readFile(join(upstream,'NOTICE'),'utf8');
if(!rootHtml.includes('NEXORA Studio'))throw new Error('Missing NEXORA shell');
if(!/StudioPro|Studio Pro/i.test(editorHtml))throw new Error('Upstream editor entrypoint unexpected');
if(!license.startsWith('Mozilla Public License Version 2.0')||!notice.includes('simplearyan'))throw new Error('MPL attribution missing');
const filenames=await readdir(join(upstream,'assets'));
const compiled=filenames.filter(name=>name.endsWith('.js')||name.endsWith('.css'));
if(!compiled.some(name=>name.endsWith('.js')))throw new Error('No upstream compiled JavaScript');
if(!editorHtml.includes('/studio-pro/'))throw new Error('Upstream was not compiled for /studio-pro/ base');
if(editorHtml.includes('/studio-pro/studio-pro/'))throw new Error('Duplicated upstream asset prefix');
let bytes=0;for(const name of compiled){bytes+=(await stat(join(upstream,'assets',name))).size;}
console.log(JSON.stringify({status:'PASS',shell:true,editor:true,license:true,compiledAssetCount:compiled.length,compiledAssetBytes:bytes,base:'/studio-pro/'},null,2));

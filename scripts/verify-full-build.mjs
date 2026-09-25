import { access, readFile, readdir, stat } from 'node:fs/promises';
import { resolve, join } from 'node:path';

const base=resolve('dist');
const upstream=resolve('dist-studio-pro');
async function mustExist(file) { await access(file); }
await mustExist(join(base,'index.html'));
await mustExist(join(base,'licenses','MPL-2.0.txt'));
await mustExist(join(base,'THIRD_PARTY.txt'));
await mustExist(join(upstream,'index.html'));
await mustExist(join(upstream,'LICENSE'));
await mustExist(join(upstream,'NOTICE'));
const rootHtml=await readFile(join(base,'index.html'),'utf8');
const directLicense=await readFile(join(base,'licenses','MPL-2.0.txt'),'utf8');
const directNotice=await readFile(join(base,'THIRD_PARTY.txt'),'utf8');
if(!directLicense.startsWith('Mozilla Public License Version 2.0')||!directNotice.includes('MediaBunny'))throw new Error('NEXORA MediaBunny attribution missing');
const editorHtml=await readFile(join(upstream,'index.html'),'utf8');
const license=await readFile(join(upstream,'LICENSE'),'utf8');
const notice=await readFile(join(upstream,'NOTICE'),'utf8');
if(!rootHtml.includes('NEXORA Studio'))throw new Error('Missing NEXORA shell');
if(!/StudioPro|Studio Pro/i.test(editorHtml))throw new Error('Upstream editor entrypoint unexpected');
if(!license.startsWith('Mozilla Public License Version 2.0')||!notice.includes('simplearyan'))throw new Error('MPL attribution missing');
const filenames=await readdir(join(upstream,'assets'));
const compiled=filenames.filter(name=>name.endsWith('.js')||name.endsWith('.css'));
if(!compiled.some(name=>name.endsWith('.js')))throw new Error('No upstream compiled JavaScript');
const entryAssets=[...editorHtml.matchAll(/<(?:script|link)\\b[^>]*\\b(?:src|href)=[\"']([^\"']+)[\"'][^>]*>/gi)].map(match=>match[1]);
if(entryAssets.some(url=>url.startsWith('/studio-pro/')))throw new Error('Unsafe same-origin editor asset base');
try {await access(join(base,'studio-pro'));throw new Error('Unsafe Studio Pro present inside shell dist');} catch(error){if(error.code!=='ENOENT')throw error;}
if(!entryAssets.some(url=>url.startsWith('/assets/')))throw new Error('Dedicated editor must use root compiled asset URLs');
let bytes=0;for(const name of compiled){bytes+=(await stat(join(upstream,'assets',name))).size;}
console.log(JSON.stringify({status:'PASS',shell:true,editor:true,license:true,compiledAssetCount:compiled.length,compiledAssetBytes:bytes,base:'/'},null,2));

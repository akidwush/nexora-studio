// Explicit opt-in import of pinned MPL-2.0 upstream. Never track upstream main automatically.
import {mkdtemp,readdir,readFile,writeFile,mkdir,rename,rm} from 'node:fs/promises';
import {join,resolve} from 'node:path';
import {tmpdir} from 'node:os';
import {spawnSync} from 'node:child_process';
const SHA='a3d145faeca9b08ab53bb994bb64accb2c356b89';
const tmp=await mkdtemp(join(tmpdir(),'nexora-studio-'));
try{
 const response=await fetch('https://codeload.github.com/simplearyan/studio-pro/tar.gz/'+SHA,{signal:AbortSignal.timeout(120000)});
 if(!response.ok)throw new Error('Cannot fetch pinned Studio Pro '+response.status);
 const archive=Buffer.from(await response.arrayBuffer());
 if(archive.byteLength>40000000)throw new Error('Archive unexpectedly large');
 const filename=join(tmp,'src.tar.gz');
 await writeFile(filename,archive);
 if(spawnSync('tar',['-xzf',filename,'-C',tmp],{stdio:'inherit'}).status!==0)throw new Error('tar failed');
 const extracted=(await readdir(tmp)).find(name=>name.startsWith('studio-pro-'));
 if(!extracted)throw new Error('Unexpected upstream archive');
 const source=join(tmp,extracted);
 const license=await readFile(join(source,'LICENSE'),'utf8');
 const notice=await readFile(join(source,'NOTICE'),'utf8');
 if(!license.startsWith('Mozilla Public License Version 2.0')||!notice.includes('simplearyan'))throw new Error('Upstream attribution missing');
 await mkdir(resolve('vendor'),{recursive:true});
 await rm(resolve('vendor/studio-pro'),{recursive:true,force:true});
 await rename(source,resolve('vendor/studio-pro'));
 console.log('Pinned Studio Pro imported with original LICENSE and NOTICE');
}finally{await rm(tmp,{recursive:true,force:true});}

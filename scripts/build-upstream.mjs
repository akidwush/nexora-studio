import {access,cp,mkdir} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve('vendor/studio-pro');
try{await access(resolve(root,'LICENSE'));}catch{throw new Error('First run npm run studio:sync');}
function run(args,env=process.env){
 const result=spawnSync('npm',args,{cwd:root,stdio:'inherit',shell:process.platform==='win32',env});
 if(result.status!==0)throw new Error('Upstream command failed: npm '+args.join(' '));
}
run(['ci']);
run(['run','build'],{...process.env,GITHUB_ACTIONS:'true'});
await mkdir(resolve('dist/studio-pro'),{recursive:true});
await cp(resolve(root,'dist'),resolve('dist/studio-pro'),{recursive:true});
await cp(resolve(root,'LICENSE'),resolve('dist/studio-pro/LICENSE'));
await cp(resolve(root,'NOTICE'),resolve('dist/studio-pro/NOTICE'));
console.log('Original Studio Pro bundled under /studio-pro/ with license and notice');

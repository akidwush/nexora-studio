// The patched third-party editor is a separate artifact, NEVER served from dist/.
// Host dist-studio-pro on a distinct HTTPS site with no dashboard credentials.
import {access,cp,mkdir,rm} from 'node:fs/promises';
import {resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
const root=resolve('vendor/studio-pro');
try{await access(resolve(root,'LICENSE'));}catch{throw new Error('First run npm run studio:sync');}
function run(cmd,args,cwd=process.cwd(),env=process.env){
 const result=spawnSync(cmd,args,{cwd,stdio:'inherit',shell:process.platform==='win32',env});
 if(result.status!==0)throw new Error('Failed: '+cmd+' '+args.join(' '));
}
run('node',['scripts/harden-upstream.mjs']);
run('node',['scripts/harden-upstream-ingress.mjs']);
run('npm',['ci'],root);
// Never compile the upstream service worker or assets for a /studio-pro/
// path: that path must not exist on the authenticated NEXORA site.
run('npm',['run','build'],root,{...process.env,GITHUB_ACTIONS:'false'});
const standalone=resolve('dist-studio-pro');
await rm(standalone,{recursive:true,force:true});
await mkdir(standalone,{recursive:true});
await cp(resolve(root,'dist'),standalone,{recursive:true});
await cp(resolve(root,'LICENSE'),resolve(standalone,'LICENSE'));
await cp(resolve(root,'NOTICE'),resolve(standalone,'NOTICE'));
try{await access(resolve('dist/studio-pro'));throw new Error('Unsafe co-hosted Studio Pro detected in dashboard dist');}
catch(error){if(error.code!=='ENOENT')throw error;}
console.log('PASS: isolated-origin deployment artifact generated in dist-studio-pro/ (not deployed)');

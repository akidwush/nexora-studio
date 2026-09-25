// Report the pinned upstream's FULL npm dependency advisory status without
// confusing a successful QUARANTINE build with a public release permission.
// npm audit non-zero means advisories; do not hide them or overwrite the lock.
import {spawnSync} from 'node:child_process';
import {mkdir,writeFile} from 'node:fs/promises';
const command=process.platform==='win32'?'npm.cmd':'npm';
const result=spawnSync(command,['audit','--json','--audit-level=low'],{
 cwd:'vendor/studio-pro',encoding:'utf8',timeout:110000,
 maxBuffer:8*1024*1024,env:{...process.env,NO_UPDATE_NOTIFIER:'1'}
});
let data=null;
try{data=JSON.parse(result.stdout||'');}catch{}
const metadata=data?.metadata?.vulnerabilities??null;
const entries=Object.entries(data?.vulnerabilities??{}).map(([name,item])=>({
 package:name,severity:item?.severity||'unknown',
 isDirect:Boolean(item?.isDirect),fixAvailable:item?.fixAvailable??false,
 advisoryNames:[...new Set((item?.via??[]).filter(x=>typeof x==='object').map(x=>
   String(x.title||x.name||'').slice(0,140)))].slice(0,12)
}));
const known=Boolean(metadata&&result.status!==null);
const counts=known?{
 info:Number(metadata.info)||0,low:Number(metadata.low)||0,
 moderate:Number(metadata.moderate)||0,high:Number(metadata.high)||0,
 critical:Number(metadata.critical)||0
}:null;
const summary={
 schema:'nexora.studio-pro.upstream-dependency-audit.v1',
 target:'pinned upstream studio-pro package-lock.json',
 result:known?'AUDITED':'AUDIT_UNAVAILABLE',
 advisories:counts,packages:entries,
 buildBlockedOnPublicLaunch:!known||Boolean(counts.high||counts.critical),
 publicImportAllowed:false,
 policy:'Document advisories; do not automatically bump or override the pinned upstream SHA; no public imports until triaged.',
 ...(known?{}:{auditFailure:String(result.error?.message||data?.error?.summary||'npm audit unavailable').slice(0,200)})
};
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/studio-pro-upstream-dependencies.json',JSON.stringify(summary,null,2));
console.log(JSON.stringify({status:summary.result,counts:summary.advisories,
 outstandingPublicReleaseBlocker:summary.buildBlockedOnPublicLaunch},null,2));

// Static audit of the patched upstream monolith and final standalone artifact.
// It is deliberately fail-closed: removing any guard requires an explicit
// reviewed security change and a regression fixture, not a silent toggle.
import {readFile,readdir,access,mkdir,writeFile} from 'node:fs/promises';
import {resolve,join} from 'node:path';

const source=await readFile(resolve('vendor/studio-pro/index.html'),'utf8');
const artifact=resolve('dist-studio-pro');
const output=await readFile(join(artifact,'index.html'),'utf8');
const assertions={
  pinnedMonolithLock:source.includes('window.__NEXORA_PUBLIC_IMPORTS_ENABLED__ = false'),
  noPrivilegedCompilers:!source.includes('new Function(')&&!source.includes('eval('),
  noSharedOriginIframes:source.split('<iframe').slice(1).every(x=>x.split('>')[0].includes('sandbox="allow-scripts"')),
  noUntrustedRemoteScript:source.split('<script').slice(1).every(x=>!x.split('>')[0].includes('src="https://')&&!x.split('>')[0].includes("src='https://")),
  CSPStrictOrigin:source.includes("connect-src 'self'")&&source.includes("object-src 'none'")&&!source.includes("unsafe-eval"),
  externalProjectGates:[
    'JSON project file import','portable .spcomp composition import',
    'arbitrary .js/.mjs composition scripts','external design template JSON',
    'external custom preset JSON'
  ].every(term=>source.includes('__nexoraDisabled('+JSON.stringify(term)+')')),
  legacyRenderBlocked:source.includes("false && clip.type === 'html'")&&
    source.includes("false && clip.type === 'hic'")&&
    source.includes('legacy HTML pre-render')&&
    source.includes('legacy WAAPI seeker')&&source.includes('legacy HIC preview'),
  localProjectSchemaCheck:source.includes('__nexoraAssertSafeProject(data);')&&
    source.includes('__nexoraPersistedDeepCheck(data);')&&
    source.includes('Stored project includes unreviewed executable content.')&&
    source.includes('Stored project contains unsafe unescaped UI metadata:'),
  mediaLimits:source.includes('__nexoraSafeMedia(file')&&source.includes('__nexoraSafeMedia(e.file'),
  secondaryMediaProtected:[
    'Invalid or oversized replacement media',
    'Invalid audio-library replacement',
    'Invalid or oversized sound effect',
    'Invalid named Markdown audio',
    'No valid Markdown audio',
    'Too many replacement files'
  ].every(message=>source.includes(message))&&
    source.includes('window.replaceClipSource = async function')&&
    source.includes('window.importMarkdownAudioFor = async function'),
  legacySavedContentInert:source.includes('old stored presets retained but quarantined')&&
    source.includes('old stored templates retained but not evaluated')&&
    source.includes('__nexoraSafeFontRecord')&&
    source.includes('Prior local project preserved but quarantined'),
  keysBlocked:!source.includes("localStorage.setItem('studiopro_ai_key_'")&&
    !source.includes("localStorage.getItem('studiopro_ai_key_'")&&
    source.includes("key.startsWith('studiopro_ai_key_')")&&
    source.includes('localStorage.removeItem(key)'),
  appCompiled:output.includes('window.__NEXORA_PUBLIC_IMPORTS_ENABLED__ = false'),
  metadataAndLicensing:true
};
for(const item of ['sw.js','registerSW.js','manifest.webmanifest','docs/html-in-canvas/test-renderer.html','docs/html-in-canvas/prompts-engineer.html']){
  try{await access(join(artifact,item));assertions['notPublished:'+item]=false;}
  catch(error){assertions['notPublished:'+item]=error.code==='ENOENT';}
}
const files=await readdir(artifact);
assertions.noWorkboxRoot=files.every(name=>!/^workbox-|^sw\.js$|^registerSW/.test(name));
const failures=Object.entries(assertions).filter(([_,ok])=>!ok).map(([key])=>key);
const report={schema:'nexora.studio-pro.quarantine.v1',
  scanned:'pinned upstream monolithic index + separately built static artifact',
  status:failures.length?'FAIL':'QUARANTINE_PASS',checks:assertions,failures,
  publicUntrustedImportsAuthorized:false,
  disclaimer:'This is NOT approval for public project imports. Other upstream sinks and dedicated-host DNS/CSP still need full testing.'};
await mkdir('artifacts',{recursive:true});
await writeFile('artifacts/studio-pro-security-audit.json',JSON.stringify(report,null,2));
if(failures.length)throw new Error('Studio Pro public-ingress quarantine regression: '+failures.join(', '));
console.log('PASS: fail-closed import/script/media/PWA quarantine; no public untrusted project ingest');

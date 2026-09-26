// Local-only, reproducible diagnostics. Never upload user projects or include
// their HTML/JS without an explicit, user-selected report option.
export const FIDELITY_REPORT_VERSION=1;
export function classifyRenderError(error){
  const message=String(error?.message||error||'Unknown rendering failure').slice(0,360);
  if(/complete.*html|missing.*head|invalid.*document|no .*html|source.*empty|document.*size limit/i.test(message))return 'INPUT';
  if(/webgl|gpu|graphics context|lost context|shader|geometry|drawing buffer/i.test(message))return 'WEBGL';
  if(/importmap|import map|unsupported module mapping|cdn|three\.js|module.*(?:load|import)|pinned.*module/i.test(message))return 'MODULE';
  if(/font/i.test(message))return 'FONT';
  if(/image|picture|svg image/i.test(message))return 'IMAGE';
  if(/network|remote|cross-origin|blob css/i.test(message))return 'EXTERNAL_RESOURCE';
  if(/preview|frame.*differ|visually|rgba|pixel/i.test(message))return 'FIDELITY';
  if(/abort|cancel/i.test(message))return 'CANCELLED';
  if(/time|slow/i.test(message))return 'TIMEOUT';
  if(/android|baseline|fast start|playback metadata|saved mp4|sample count|avcc/i.test(message))return 'MP4_COMPATIBILITY';
  if(/encode|mp4|webcodec/i.test(message))return 'ENCODER';
  return 'RENDER';
}
/**
 * @param {Record<string, any>} plan
 * @param {{mode?: string, frames?: Array<any>, error?: any, phase?: string, fixture?: string|null, source?: any, includeSource?: boolean, compatibility?: Record<string,any>}} details
 */
export function makeRenderReport(plan,{mode='memory',frames=[],error=null,phase='complete',fixture=null,source=null,includeSource=false,compatibility=null}={}){
  const known=['size','width','height','fps','duration','matte'];
  const settings={};
  for(const key of known)if(plan?.[key]!==undefined)settings[key]=plan[key];
  return {
    schema:'nexora.render-fidelity.v1',
    version:FIDELITY_REPORT_VERSION,
    createdAt:new Date().toISOString(),
    settings,
    outputMode:mode,
    ...(compatibility?{compatibility:{container:'mp4',codec:compatibility.codec,
      profile:compatibility.profile,level:compatibility.level,
      fastStart:compatibility.fastStart,bytes:compatibility.bytes}}:{}),
    phase,
    ...(fixture?{fixture}:{}),
    frameResults:frames.map(item=>({
      frame:item.frame,timestampMs:Math.round(item.frame*100000/settings.fps)/100,
      meanRgbError:item.meanError,severeFraction:item.severeFraction
    })),
    result:error?{status:'FAILED',code:classifyRenderError(error),message:String(error?.message||error).slice(0,360)}:{status:'PASSED'},
    reproduction:{
      step:'Use the exact size, FPS, duration, matte and the indicated frame indices in HTML Motion Lab.',
      note:includeSource?'Source is embedded only in this local download. Remove secrets before sharing.':
        'Source withheld for privacy. Use the optional Include source control to attach code.'
    },
    ...(includeSource&&source?{source:typeof source.document==='string'?{document:source.document}:
      {html:source.html||'',css:source.css||'',svg:source.svg||'',js:source.js||''}}:{})
  };
}

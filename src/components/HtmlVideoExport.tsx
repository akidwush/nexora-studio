import {useEffect,useRef,useState} from 'react';
import {HTML_VIDEO_SIZES,validateHtmlVideoOptions} from '../lib/html-video-plan.js';
import {supportsStreamingSave,beginMp4FilePick} from '../lib/mp4-output-sink.js';
import {makeRenderReport} from '../lib/render-fidelity-report.js';
import {assertDocumentSource} from '../lib/html-document.js';

type Size=keyof typeof HTML_VIDEO_SIZES;
type Source={html:string;css:string;svg:string;js:string;document?:never}|{document:string;html?:never;css?:never;svg?:never;js?:never};
type Props={source:Source;sourceReady?:boolean};
type RawPreview={key:string;index:number;png:Blob};
type FrameScore={frame:number;meanError:number;severeFraction:number};
type Quality={meanError:number;severeFraction:number;frames:FrameScore[];outputMode:string};
type Report=ReturnType<typeof makeRenderReport>;
export default function HtmlVideoExport({source,sourceReady=true}:Props){
  const [size,setSize]=useState<Size>('compact');
  const [fps,setFps]=useState(30);
  const [duration,setDuration]=useState(1);
  const [matte,setMatte]=useState('#FFFFFF');
  const [sample,setSample]=useState('start');
  const [showAlpha,setShowAlpha]=useState(false);
  const [support,setSupport]=useState<boolean|null>(null);
  const [working,setWorking]=useState(false);
  const [previewing,setPreviewing]=useState(false);
  const [progress,setProgress]=useState(0);
  const [message,setMessage]=useState('');
  const [quality,setQuality]=useState<Quality|null>(null);
  const [report,setReport]=useState<Report|null>(null);
  const [includeSource,setIncludeSource]=useState(false);
  const [saveMode,setSaveMode]=useState<'download'|'stream'>('download');
  const [streamAvailable,setStreamAvailable]=useState(false);
  const [rawPreview,setRawPreview]=useState<RawPreview|null>(null);
  const [matteUrl,setMatteUrl]=useState('');
  const [alphaUrl,setAlphaUrl]=useState('');
  const [videoUrl,setVideoUrl]=useState('');
  const abortRef=useRef<AbortController|null>(null);
  const videoRef=useRef('');
  const fullDocument=typeof source.document==='string';
  const key=JSON.stringify([source.document,source.html,source.css,source.svg,source.js,size,fps,duration]);
  const previewIndex=sample==='middle'?Math.floor(fps*duration/2):
    sample==='last'?fps*duration-1:0;
  const busy=working||previewing;
  // Full-document 5/8/10s durations must reach the same preflight validator
  // as capture/encoder, rather than accidentally using legacy 1–3s rules.
  const opts={size,fps,duration,matte,...(fullDocument?{document:source.document}:{})};
  useEffect(()=>{
    // Reopening the old four-tab editor after a 5/8/10s WebGL experiment
    // must not strand its legacy 1–3s dropdown on an unsupported value.
    if(!fullDocument)setDuration(value=>Math.min(value,3));
  },[fullDocument]);
  const dimensions=HTML_VIDEO_SIZES[size];
  const validPreview=rawPreview?.key===key&&rawPreview.index===previewIndex?rawPreview:null;
  let documentProblem='';
  if(fullDocument){
    try{assertDocumentSource(source.document);}catch(error){
      documentProblem=error instanceof Error?error.message:'Invalid HTML document.';
    }
  }
  const renderReady=!fullDocument||(!documentProblem&&sourceReady);
  const exportReady=renderReady&&(!fullDocument||Boolean(validPreview));
  const renderBlockedReason=documentProblem||(!sourceReady&&fullDocument?
    'Run preview with the current complete HTML file before capturing frames.':'');

  useEffect(()=>{setStreamAvailable(supportsStreamingSave(window));},[]);
  useEffect(()=>{
    let mounted=true;setSupport(null);
    if(typeof VideoEncoder==='undefined'){setSupport(false);return()=>{mounted=false;};}
    const info=HTML_VIDEO_SIZES[size];
    VideoEncoder.isConfigSupported({
      codec:'avc1.42001f',width:info.width,height:info.height,
      bitrate:info.width*info.height>=900000?7000000:3000000,
      framerate:fps,hardwareAcceleration:'no-preference'
    }).then(result=>{if(mounted)setSupport(Boolean(result.supported));})
      .catch(()=>{if(mounted)setSupport(false);});
    return()=>{mounted=false;};
  },[size,fps]);
  useEffect(()=>{
    // A code/FPS/size change invalidates any previously captured preview and
    // exported video. Never display mismatched stale visual results.
    abortRef.current?.abort();
    setRawPreview(null);setQuality(null);setReport(null);setMessage('');
    if(videoRef.current){URL.revokeObjectURL(videoRef.current);videoRef.current='';}
    setVideoUrl('');
  },[key]);
  useEffect(()=>{
    if(videoRef.current){URL.revokeObjectURL(videoRef.current);videoRef.current='';}
    setVideoUrl('');setQuality(null);setReport(null);
  },[matte]);
  useEffect(()=>{
    if(!rawPreview||rawPreview.key!==key)return;
    const url=URL.createObjectURL(rawPreview.png);
    setAlphaUrl(url);
    let cancelled=false,compositeUrl='';
    import('../lib/html-frame-parity.js').then(({makeMattePreview})=>
      makeMattePreview(rawPreview.png,dimensions.width,dimensions.height,matte)
    ).then(blob=>{
      if(cancelled)return;
      compositeUrl=URL.createObjectURL(blob);setMatteUrl(compositeUrl);
    }).catch(error=>{if(!cancelled)setMessage(String(error));});
    return()=>{
      cancelled=true;URL.revokeObjectURL(url);
      if(compositeUrl)URL.revokeObjectURL(compositeUrl);
      setAlphaUrl('');setMatteUrl('');
    };
  },[rawPreview,key,matte,dimensions.width,dimensions.height]);
  useEffect(()=>()=>{abortRef.current?.abort();if(videoRef.current)URL.revokeObjectURL(videoRef.current);},[]);

  const runPreview=async()=>{
    if(busy||!renderReady)return;
    setPreviewing(true);setMessage('Replaying the exact HTML timeline to frame '+previewIndex+'…');
    const task=new AbortController();abortRef.current=task;
    try{
      validateHtmlVideoOptions(opts);
      const {captureHtmlFrame}=await import('../lib/html-video.js');
      const png=await captureHtmlFrame({...source,...opts},previewIndex,{signal:task.signal});
      if(task.signal.aborted)return;
      setRawPreview({key,index:previewIndex,png});
      setMessage('Export-matching frame '+previewIndex+' ready. Transparent PNG is available.');
    }catch(error){if(!task.signal.aborted){
      setMessage(error instanceof Error?error.message:'Preview failed.');
      setReport(makeRenderReport({...dimensions,size,fps,duration,matte},{
        error,phase:'preview',mode:'memory'
      }));
    }}
    finally{if(abortRef.current===task)abortRef.current=null;setPreviewing(false);}
  };
  const exportVideo=async()=>{
    if(busy||support!==true||!exportReady)return;
    const filename='nexora-'+(fullDocument?'full-html':'html')+'-'+size+'-'+fps+'fps.mp4';
    // File pick MUST begin in the original button gesture, before dynamic
    // imports, capture work or any other await (mobile browser requirement).
    let picker:Promise<unknown>|null=null;
    try{if(saveMode==='stream')picker=beginMp4FilePick(filename);}
    catch(error){setMessage(error instanceof Error?error.message:'File picker unavailable.');return;}
    setWorking(true);setProgress(0);setQuality(null);setReport(null);
    setMessage('Validating preview and preparing deterministic capture…');
    if(videoRef.current){URL.revokeObjectURL(videoRef.current);videoRef.current='';}
    setVideoUrl('');
    const task=new AbortController();abortRef.current=task;
    let receivedReport=false;
    try{
      const fileHandle=picker?await picker:null;
      validateHtmlVideoOptions(opts);
      const {encodeHtmlVideo}=await import('../lib/html-video.js');
      // Only independently compare RGBA when the user explicitly prepared
      // an exact preview. A setting change must never reuse stale 30/60 FPS
      // references. Otherwise take the matching preview from THIS export run.
      const ref=validPreview;
      const blob=await encodeHtmlVideo({...source,...opts},{
        signal:task.signal,fileHandle,
        ...(ref?{reference:{index:ref.index,png:ref.png}}:{}),
        onFrame:({frame,png}:{frame:number;png:Blob})=>{
          if(!ref&&frame===previewIndex&&!task.signal.aborted)
            setRawPreview({key,index:frame,png});
        },
        onQuality:(metric:Quality)=>setQuality(metric),
        onReport:(item:Report)=>{receivedReport=true;setReport(item);},
        onProgress:(value:number,frame:number,total:number)=>{
          setProgress(value);
          setMessage(frame===total?'Captures complete · verifying all 3 encoded video frames…':
            'Capturing '+frame+' / '+total+' frames · '+Math.round(value*100)+'%');
        }
      });
      if(task.signal.aborted&&!fileHandle)return;
      const url=URL.createObjectURL(blob);videoRef.current=url;setVideoUrl(url);
      setMessage(fileHandle?
        'Streaming save complete: first, middle and last frames verified before file commit.':
        'Export verified: first, middle and last decoded H.264 frames match the preview.');
      if(!fileHandle){const link=document.createElement('a');link.href=url;link.download=filename;link.click();}
    }catch(error){
      const dismissed=error instanceof Error&&error.name==='AbortError';
      setMessage(dismissed?'File selection cancelled.':task.signal.aborted?
        'Export cancelled; no partial file saved.':error instanceof Error?error.message:'Export parity check failed.');
      if(!receivedReport&&!dismissed)setReport(makeRenderReport({...dimensions,size,fps,duration,matte},{
        mode:saveMode==='stream'?'stream':'memory',error,phase:'prepare'
      }));
    }finally{if(abortRef.current===task)abortRef.current=null;setWorking(false);}
  };
  const transparentDownload=alphaUrl&&validPreview;
  const downloadReport=()=>{
    if(!report)return;
    const safe=includeSource?{...report,source:{...source},
      reproduction:{...report.reproduction,note:'Includes user source by explicit local-download consent. Review secrets before sharing.'}}:report;
    const url=URL.createObjectURL(new Blob([JSON.stringify(safe,null,2)],{type:'application/json'}));
    const a=document.createElement('a');a.href=url;a.download='nexora-render-fidelity-report.json';a.click();
    window.setTimeout(()=>URL.revokeObjectURL(url),3000);
  };
  return <section className="html-video-export" aria-label="HTML to MP4 exporter">
    <div className="html-video-head">
      <strong>{fullDocument?'FULL HTML + WEBGL → MP4':'HTML → MATCHING MP4'}</strong><span>SAME CAPTURE PIPELINE</span>
    </div>
    <div className="html-video-settings">
      <label htmlFor="html-video-size">Output
        <select id="html-video-size" disabled={busy} value={size} onChange={event=>{
          const next=event.target.value as Size;setSize(next);
          if(next!=='compact'&&fps===60)setFps(30);
          if(next!=='compact'&&duration>3)setDuration(3);
        }}>
          {Object.entries(HTML_VIDEO_SIZES).map(([id,info])=>
            <option key={id} value={id}>{info.label}</option>)}
        </select>
      </label>
      <label htmlFor="html-video-fps">Frame rate
        <select id="html-video-fps" disabled={busy} value={fps}
          onChange={event=>setFps(Number(event.target.value))}>
          {[24,30,...(size==='compact'?[60]:[])].map(rate=>
            <option value={rate} key={rate}>{rate} FPS</option>)}
        </select>
      </label>
      <label htmlFor="html-video-duration">Duration
        <select id="html-video-duration" disabled={busy} value={duration}
          onChange={event=>setDuration(Number(event.target.value))}>
          {[1,2,3,...(fullDocument&&size==='compact'?[5,8,10]:[])].map(value=><option value={value} key={value}>{value} sec</option>)}
        </select>
      </label>
      <label htmlFor="html-video-matte">MP4 background
        <input id="html-video-matte" type="color" disabled={busy} value={matte}
          onChange={event=>setMatte(event.target.value.toUpperCase())}/>
      </label>
      <label htmlFor="html-video-storage">Storage method
        <select id="html-video-storage" value={saveMode} disabled={busy}
          onChange={event=>setSaveMode(event.target.value as 'download'|'stream')}>
          <option value="download">Compatible download</option>
          {streamAvailable&&<option value="stream">Streaming · save to device</option>}
        </select>
      </label>
      <label htmlFor="html-video-sample">Inspect exact frame
        <select id="html-video-sample" value={sample} disabled={busy} onChange={event=>setSample(event.target.value)}>
          <option value="start">First · frame 0</option>
          <option value="middle">Middle · frame {Math.floor(fps*duration/2)}</option>
          <option value="last">Last · frame {fps*duration-1}</option>
        </select>
      </label>
    </div>
    <p className="html-video-limit">H.264 MP4 cannot retain alpha. Pick the same background
      used by the verified frame preview. Raw transparent PNG retains its alpha.</p>
    <div className="html-video-actions">
      <button className="secondary" disabled={busy||!renderReady} onClick={()=>void runPreview()}>
        {previewing?'Replaying…':'◉ Match export preview'}
      </button>
      <button className="primary" disabled={busy||support!==true||!exportReady} onClick={()=>void exportVideo()}>
        {working?'Verifying…':'↓ Render MP4'}
      </button>
      {busy&&<button className="cancel-export" onClick={()=>abortRef.current?.abort()}>Cancel</button>}
    </div>
    {fullDocument&&<p className="html-video-message" data-testid="full-html-export-gate" role="status">
      {renderBlockedReason||(!validPreview?'Prepare an export-matching frame before rendering the complete HTML video.':
        'Full HTML validated and matching frame ready. MP4 export unlocked.')}
    </p>}
    {validPreview&&<>
      <div className="html-video-preview-heading">
        <span>REFERENCE FRAME {previewIndex} · {Math.round(previewIndex*1000/fps)} ms</span>
        <button onClick={()=>setShowAlpha(value=>!value)}>
          {showAlpha?'Show MP4 matte':'Show true transparency'}
        </button>
      </div>
      <div className="html-video-preview-stage" data-alpha={String(showAlpha)}
        style={showAlpha?undefined:{backgroundColor:matte}}>
        {(showAlpha?alphaUrl:matteUrl)&&
          <img className="html-video-reference" alt="Exact export-matching frame"
            src={showAlpha?alphaUrl:matteUrl}/>}
      </div>
      {transparentDownload&&
        <a className="video-download" href={alphaUrl}
          download={'nexora-html-transparent-frame-'+previewIndex+'.png'}>
          ↓ Download lossless transparent PNG frame
        </a>}
    </>}
    {working&&<progress aria-label="HTML frame capture progress" max={1} value={progress}/>}
    <p className="html-video-message" role="status">{message||(
      support===null?'Checking H.264 support…':support===false?
      'H.264 unavailable in this browser.':'Generate a matching frame preview before exporting.'
    )}</p>
    {quality&&<div className="html-fidelity-score" data-testid="html-fidelity-score">
      Verified 3-frame preview ↔ MP4 · worst mean RGB error {quality.meanError.toFixed(2)}
      {' · '}large-error pixels {(quality.severeFraction*100).toFixed(2)}%
      <div className="html-video-frame-scores">{quality.frames.map(item=><span key={item.frame}>
        Frame {item.frame}: RGB {item.meanError.toFixed(2)}, severe {(item.severeFraction*100).toFixed(2)}%
      </span>)}</div>
    </div>}
    {report&&<div className="html-video-report">
      <label><input type="checkbox" checked={includeSource}
        onChange={event=>setIncludeSource(event.target.checked)}/>
        Include the current source in the downloaded report (may contain private HTML/JS)
      </label>
      <button className="secondary" onClick={downloadReport}>↓ Download reproducible rendering report (JSON)</button>
      <small>{report.result.status==='PASSED'?'All inspected frames passed.':
        'Failure recorded: '+(report.result.code||'RENDER')+'. No report data was uploaded.'}</small>
      {report.result.status==='FAILED'&&<small className="html-render-failure-detail" role="alert">
        Cause: {report.result.message}
      </small>}
    </div>}
    {videoUrl&&<>
      <a className="video-download" href={videoUrl}
        download={'nexora-html-'+size+'-'+fps+'fps.mp4'}>{saveMode==='stream'?'Download an additional MP4 copy ↗':'Download verified MP4 again ↗'}</a>
      <video className="html-video-result" controls playsInline preload="metadata" src={videoUrl}
        aria-label="Rendered HTML video playback"/>
    </>}
    <p className="html-video-limit">Streaming uses temporary device storage and only writes the selected file after parity checks. No server uploads. Compatible download is always available.</p>
    <p className="html-video-limit">{fullDocument?
      'Complete HTML/WebGL uses only the pinned Three.js 0.172 import map. It needs an available CDN and browser GPU. Extended 5/8/10 second exports are limited to 640×360.':
      'Self-contained HTML/CSS/SVG/JS with local or embedded assets only. Maximum 3 seconds; 60 FPS at 640×360.'}
      {' '}All successful exports retain preview and decoded-video parity checks.</p>
  </section>;
}

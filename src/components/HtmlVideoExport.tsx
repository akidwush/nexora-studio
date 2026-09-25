import {useEffect,useRef,useState} from 'react';
import {HTML_VIDEO_SIZES,validateHtmlVideoOptions} from '../lib/html-video-plan.js';

type Size=keyof typeof HTML_VIDEO_SIZES;
type Source={html:string;css:string;svg:string;js:string};
type Props={source:Source};
type RawPreview={key:string;index:number;png:Blob};
export default function HtmlVideoExport({source}:Props){
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
  const [quality,setQuality]=useState<{meanError:number;severeFraction:number}|null>(null);
  const [rawPreview,setRawPreview]=useState<RawPreview|null>(null);
  const [matteUrl,setMatteUrl]=useState('');
  const [alphaUrl,setAlphaUrl]=useState('');
  const [videoUrl,setVideoUrl]=useState('');
  const abortRef=useRef<AbortController|null>(null);
  const videoRef=useRef('');
  const key=JSON.stringify([source.html,source.css,source.svg,source.js,size,fps,duration]);
  const previewIndex=sample==='middle'?Math.floor(fps*duration/2):
    sample==='last'?fps*duration-1:0;
  const busy=working||previewing;
  const opts={size,fps,duration,matte};
  const dimensions=HTML_VIDEO_SIZES[size];
  const validPreview=rawPreview?.key===key&&rawPreview.index===previewIndex?rawPreview:null;

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
    setRawPreview(null);setQuality(null);
    if(videoRef.current){URL.revokeObjectURL(videoRef.current);videoRef.current='';}
    setVideoUrl('');
  },[key]);
  useEffect(()=>{
    if(videoRef.current){URL.revokeObjectURL(videoRef.current);videoRef.current='';}
    setVideoUrl('');setQuality(null);
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
    if(busy)return;
    setPreviewing(true);setMessage('Replaying the exact HTML timeline to frame '+previewIndex+'…');
    const task=new AbortController();abortRef.current=task;
    try{
      validateHtmlVideoOptions(opts);
      const {captureHtmlFrame}=await import('../lib/html-video.js');
      const png=await captureHtmlFrame({...source,...opts},previewIndex,{signal:task.signal});
      if(task.signal.aborted)return;
      setRawPreview({key,index:previewIndex,png});
      setMessage('Export-matching frame '+previewIndex+' ready. Transparent PNG is available.');
    }catch(error){if(!task.signal.aborted)setMessage(error instanceof Error?error.message:'Preview failed.');}
    finally{if(abortRef.current===task)abortRef.current=null;setPreviewing(false);}
  };
  const exportVideo=async()=>{
    if(busy||support!==true)return;
    setWorking(true);setProgress(0);setQuality(null);
    setMessage('Validating preview and preparing deterministic capture…');
    if(videoRef.current){URL.revokeObjectURL(videoRef.current);videoRef.current='';}
    setVideoUrl('');
    const task=new AbortController();abortRef.current=task;
    try{
      validateHtmlVideoOptions(opts);
      const {captureHtmlFrame,encodeHtmlVideo}=await import('../lib/html-video.js');
      let ref=validPreview;
      if(!ref){
        const png=await captureHtmlFrame({...source,...opts},previewIndex,{signal:task.signal});
        if(task.signal.aborted)return;
        ref={key,index:previewIndex,png};
        setRawPreview(ref);
      }
      const blob=await encodeHtmlVideo({...source,...opts},{
        signal:task.signal,
        reference:{index:ref.index,png:ref.png},
        onQuality:metric=>setQuality(metric),
        onProgress:(value:number,frame:number,total:number)=>{
          setProgress(value);
          setMessage('Capturing '+frame+' / '+total+' frames · '+Math.round(value*100)+'%');
        }
      });
      if(task.signal.aborted)return;
      const url=URL.createObjectURL(blob);videoRef.current=url;setVideoUrl(url);
      setMessage('Export verified: same raw preview pixels and decoded H.264 visual check passed.');
      const link=document.createElement('a');link.href=url;
      link.download='nexora-html-'+size+'-'+fps+'fps.mp4';link.click();
    }catch(error){
      setMessage(task.signal.aborted?'Export cancelled; no partial file saved.':
        error instanceof Error?error.message:'Export parity check failed.');
    }finally{if(abortRef.current===task)abortRef.current=null;setWorking(false);}
  };
  const transparentDownload=alphaUrl&&validPreview;
  return <section className="html-video-export" aria-label="HTML to MP4 exporter">
    <div className="html-video-head">
      <strong>HTML → MATCHING MP4</strong><span>SAME CAPTURE PIPELINE</span>
    </div>
    <div className="html-video-settings">
      <label htmlFor="html-video-size">Output
        <select id="html-video-size" disabled={busy} value={size} onChange={event=>{
          const next=event.target.value as Size;setSize(next);
          if(next!=='compact'&&fps===60)setFps(30);
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
          {[1,2,3].map(value=><option value={value} key={value}>{value} sec</option>)}
        </select>
      </label>
      <label htmlFor="html-video-matte">MP4 background
        <input id="html-video-matte" type="color" disabled={busy} value={matte}
          onChange={event=>setMatte(event.target.value.toUpperCase())}/>
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
      <button className="secondary" disabled={busy} onClick={()=>void runPreview()}>
        {previewing?'Replaying…':'◉ Match export preview'}
      </button>
      <button className="primary" disabled={busy||support!==true} onClick={()=>void exportVideo()}>
        {working?'Verifying…':'↓ Render MP4'}
      </button>
      {busy&&<button className="cancel-export" onClick={()=>abortRef.current?.abort()}>Cancel</button>}
    </div>
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
    {quality&&<p className="html-fidelity-score" data-testid="html-fidelity-score">
      Verified preview ↔ MP4 · mean RGB error {quality.meanError.toFixed(2)}
      {' · '}large-error pixels {(quality.severeFraction*100).toFixed(2)}%
    </p>}
    {videoUrl&&<>
      <a className="video-download" href={videoUrl}
        download={'nexora-html-'+size+'-'+fps+'fps.mp4'}>Download verified MP4 again ↗</a>
      <video className="html-video-result" controls playsInline preload="metadata" src={videoUrl}
        aria-label="Rendered HTML video playback"/>
    </>}
    <p className="html-video-limit">Self-contained HTML/CSS/SVG/JS and system or embedded
      data-fonts only. Some advanced filters or browser-specific effects may fail parity
      checks. Maximum 3 seconds; 60 FPS at 640×360. Real-time playback speed is separate
      from offline frame accuracy.</p>
  </section>;
}

import {useEffect,useRef,useState} from 'react';
import {HTML_VIDEO_SIZES,validateHtmlVideoOptions,htmlVideoBitrate} from '../lib/html-video-plan.js';
import {criticalFrameIndices} from '../lib/mp4-output-sink.js';
import {MOBILE_AVC_CODEC} from '../lib/android-mp4.js';
import {supportsStreamingSave,beginMp4FilePick} from '../lib/mp4-output-sink.js';
import {makeRenderReport} from '../lib/render-fidelity-report.js';
import {assertDocumentSource} from '../lib/html-document.js';
import {UNIVERSAL_EXPORT_DURATION,STANDARD_EXPORT_FPS} from '../lib/export-policy.js';

type Size=keyof typeof HTML_VIDEO_SIZES;
type Source={html:string;css:string;svg:string;js:string;document?:never}|{document:string;html?:never;css?:never;svg?:never;js?:never};
type Props={source:Source;sourceReady?:boolean};
type RawPreview={key:string;index:number;png:Blob};
type FrameScore={frame:number;meanError:number;severeFraction:number};
type Quality={meanError:number;severeFraction:number;frames:FrameScore[];outputMode:string;
  compatibility?:{codec:string;fastStart:boolean;profile:number;level:number;bytes:number}};
type Report=ReturnType<typeof makeRenderReport>;
export default function HtmlVideoExport({source,sourceReady=true}:Props){
  const [size,setSize]=useState<Size>('compact');
  const [fps,setFps]=useState(STANDARD_EXPORT_FPS);
  const [duration,setDuration]=useState(UNIVERSAL_EXPORT_DURATION);
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
  const [hdDesktop,setHdDesktop]=useState(false);
  const [rawPreview,setRawPreview]=useState<RawPreview|null>(null);
  const [matteUrl,setMatteUrl]=useState('');
  const [alphaUrl,setAlphaUrl]=useState('');
  const [videoUrl,setVideoUrl]=useState('');
  const [playbackError,setPlaybackError]=useState('');
  const abortRef=useRef<AbortController|null>(null);
  const videoRef=useRef('');
  const fullDocument=typeof source.document==='string';
  // A high-resolution long render is an explicit desktop-class local
  // streaming option, not an accidental huge in-memory export on Android.
  const hdLong=size==='landscape'&&duration>=UNIVERSAL_EXPORT_DURATION&&
    saveMode==='stream'&&hdDesktop;
  const key=JSON.stringify([source.document,source.html,source.css,source.svg,source.js,size,fps,duration]);
  const previewIndex=sample==='middle'?Math.floor(fps*duration/2):
    sample==='last'?fps*duration-1:0;
  const busy=working||previewing;
  // Long durations must reach the same preflight validator
  // as capture/encoder, rather than accidentally using legacy 1–3s rules.
  const opts={size,fps,duration,matte,stream:hdLong,...(fullDocument?{document:source.document}:{})};
  useEffect(()=>{
    if(!fullDocument&&!([1,2,3,UNIVERSAL_EXPORT_DURATION].includes(duration)))
      setDuration(UNIVERSAL_EXPORT_DURATION);
  },[fullDocument,duration]);
  const dimensions=HTML_VIDEO_SIZES[size];
  const validPreview=rawPreview?.key===key&&rawPreview.index===previewIndex?rawPreview:null;
  let documentProblem='';
  if(fullDocument){
    try{assertDocumentSource(source.document);}catch(error){
      documentProblem=error instanceof Error?error.message:'Invalid HTML document.';
    }
  }
  const renderReady=!fullDocument||(!documentProblem&&sourceReady);
  let configurationProblem='';
  try{validateHtmlVideoOptions(opts);}catch(error){
    configurationProblem=error instanceof Error?error.message:'Konfigurasi video tidak didukung.';
  }
  const exportReady=renderReady&&!configurationProblem;
  const renderBlockedReason=documentProblem||(!sourceReady&&fullDocument?
    'Run preview with the current complete HTML file before capturing frames.':'');

  useEffect(()=>{
    const stream=supportsStreamingSave(window);
    setStreamAvailable(stream);
    const ram=(navigator as Navigator & {deviceMemory?:number}).deviceMemory;
    // Browser memory hints are conservative and only affect opt-in HD mode.
    // No claim that hardware meeting this hint can render arbitrary scenes.
    setHdDesktop(stream&&typeof ram==='number'&&ram>=8&&
      window.matchMedia('(pointer:fine)').matches);
  },[]);
  useEffect(()=>{
    let mounted=true;setSupport(null);
    if(typeof VideoEncoder==='undefined'){setSupport(false);return()=>{mounted=false;};}
    const info=HTML_VIDEO_SIZES[size];
    VideoEncoder.isConfigSupported({
      codec:MOBILE_AVC_CODEC,width:info.width,height:info.height,
      bitrate:htmlVideoBitrate({...info,duration,hdLong}),
      framerate:fps,hardwareAcceleration:'no-preference'
    }).then(result=>{if(mounted)setSupport(Boolean(result.supported));})
      .catch(()=>{if(mounted)setSupport(false);});
    return()=>{mounted=false;};
  },[size,fps,duration,hdLong]);
  useEffect(()=>{
    // A code/FPS/size change invalidates any previously captured preview and
    // exported video. Never display mismatched stale visual results.
    abortRef.current?.abort();
    setRawPreview(null);setQuality(null);setReport(null);setMessage('');
    if(videoRef.current){URL.revokeObjectURL(videoRef.current);videoRef.current='';}
    setVideoUrl('');setPlaybackError('');
  },[key]);
  useEffect(()=>{
    if(videoRef.current){URL.revokeObjectURL(videoRef.current);videoRef.current='';}
    setVideoUrl('');setQuality(null);setReport(null);setPlaybackError('');
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
      setMessage('Pratinjau siap dan cocok dengan frame ekspor. Export-matching frame '+previewIndex+' ready.');
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
    const filename='nexora-'+(fullDocument?'full-html':'html')+'-'+size+'-'+fps+'fps-'+duration+'s.mp4';
    // File pick MUST begin in the original button gesture, before dynamic
    // imports, capture work or any other await (mobile browser requirement).
    let picker:Promise<unknown>|null=null;
    try{if(saveMode==='stream')picker=beginMp4FilePick(filename);}
    catch(error){setMessage(error instanceof Error?error.message:'File picker unavailable.');return;}
    setWorking(true);setProgress(0);setQuality(null);setReport(null);
    setMessage('Mempersiapkan animasi...');
    if(videoRef.current){URL.revokeObjectURL(videoRef.current);videoRef.current='';}
    setVideoUrl('');setPlaybackError('');
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
          setMessage(frame===total?'Memeriksa kualitas...':
            'Memproses video... '+Math.round(value*100)+'%');
        }
      });
      if(task.signal.aborted&&!fileHandle)return;
      const url=URL.createObjectURL(blob);videoRef.current=url;setVideoUrl(url);
      const checkpoints=criticalFrameIndices(fps*duration,{duration}).length;
      setMessage('Video berhasil dibuat. '+(fileHandle?'Streaming save complete. ':'Export verified. ')+checkpoints+' titik kualitas telah diperiksa.');
      if(!fileHandle){const link=document.createElement('a');link.href=url;link.download=filename;link.click();}
    }catch(error){
      const dismissed=error instanceof Error&&error.name==='AbortError';
      setMessage(dismissed?'Pemilihan file dibatalkan.':task.signal.aborted?
        'Pembuatan video dibatalkan. File sebagian tidak disimpan.':error instanceof Error?error.message:'Pemeriksaan kualitas gagal.');
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
  return <section className="html-video-export" aria-label="Pembuat video MP4 dari HTML">
    <div className="html-video-head">
      <strong>{fullDocument?'HTML LENGKAP + WEBGL → MP4':'HTML → MP4 8 DETIK'}</strong><span>LOKAL · TANPA UPLOAD</span>
    </div>
    <div className="simple-export-settings">
      <label htmlFor="html-video-size">Ukuran Video
        <select id="html-video-size" disabled={busy} value={size} onChange={event=>{
          const next=event.target.value as Size;setSize(next);
          if(next!=='compact'&&fps===60)setFps(STANDARD_EXPORT_FPS);
          if(next==='compact')setSaveMode('download');
          else if(next==='landscape'&&hdDesktop)setSaveMode('stream');
        }}>
          {Object.entries(HTML_VIDEO_SIZES).map(([id,info])=>
            <option key={id} value={id}>{info.label}</option>)}
        </select>
      </label>
      <div className="duration-card"><span>Durasi</span><strong>{UNIVERSAL_EXPORT_DURATION} Detik</strong><small>{fps} FPS</small></div>
      <select id="html-video-duration" className="engine-duration-compat" aria-hidden="true"
        tabIndex={-1} disabled={busy} value={duration} onChange={event=>setDuration(Number(event.target.value))}>
        {(fullDocument?[1,2,3,5,8,10]:[1,2,3,8]).map(value=><option value={value} key={value}>{value}</option>)}
      </select>
    </div>
    {configurationProblem&&<div className="compatibility-choice" role="alert">
      <span>{configurationProblem}</span>
      <button disabled={busy} onClick={()=>{setSize('compact');setFps(STANDARD_EXPORT_FPS);setSaveMode('download');}}>Gunakan 640×360</button>
    </div>}
    <div className="html-video-actions">
      <button className="secondary" aria-label="Match export preview / Pratinjau" disabled={busy||!renderReady} onClick={()=>void runPreview()}>
        {previewing?'Mempersiapkan…':'Pratinjau'}
      </button>
      <button className="primary" aria-label="Render MP4 / Buat Video" disabled={busy||support!==true||!exportReady} onClick={()=>void exportVideo()}>
        {working?'Memproses…':'Buat Video'}
      </button>
      {busy&&<button className="cancel-export" aria-label="Cancel / Batalkan" onClick={()=>abortRef.current?.abort()}>Batalkan</button>}
    </div>
    {fullDocument&&<p className="html-video-gate-message" data-testid="full-html-export-gate" role="status">
      {renderBlockedReason||'Pratinjau HTML terbaru siap. Pemeriksaan frame akan berjalan otomatis saat video dibuat.'}
    </p>}
    {validPreview&&<>
      <div className="html-video-preview-heading">
        <span>FRAME PRATINJAU {previewIndex} · {Math.round(previewIndex*1000/fps)} ms</span>
        <button aria-label={showAlpha?'Show MP4 matte / Lihat latar MP4':'Show true transparency / Lihat transparansi'} onClick={()=>setShowAlpha(value=>!value)}>
          {showAlpha?'Lihat latar MP4':'Lihat transparansi'}
        </button>
      </div>
      <div className="html-video-preview-stage" data-alpha={String(showAlpha)}
        style={showAlpha?undefined:{backgroundColor:matte}}>
        {(showAlpha?alphaUrl:matteUrl)&&
          <img className="html-video-reference" alt="Exact export-matching frame"
            src={showAlpha?alphaUrl:matteUrl}/>}
      </div>
      {transparentDownload&&
        <a className="video-download" aria-label="Download lossless transparent PNG frame / Unduh frame PNG transparan" href={alphaUrl}
          download={'nexora-html-transparent-frame-'+previewIndex+'.png'}>
          Unduh frame PNG transparan
        </a>}
    </>}
    {working&&<progress aria-label="HTML frame capture progress" max={1} value={progress}/>}
    <p className="html-video-message" role="status">{message||(
      support===null?'Memeriksa dukungan video…':support===false?
      'Browser ini tidak mendukung H.264. Coba Chrome atau Edge terbaru.':'Siap membuat video 8 detik.'
    )}</p>
    {videoUrl&&<>
      <a className="video-download primary-download" aria-label="Download verified MP4 again / Unduh Video" href={videoUrl}
        download={'nexora-html-'+size+'-'+fps+'fps.mp4'}>Unduh Video</a>
      <video className="html-video-result" controls playsInline preload="metadata" src={videoUrl}
        poster={matteUrl||undefined}
        onLoadedMetadata={()=>setPlaybackError('')}
        onError={()=>setPlaybackError('Browser Android tidak dapat memutar hasil ini langsung. Unduh file lengkap lalu coba Google Photos atau pemutar video Files.')}
        aria-label="Rendered HTML video playback"/>
      {playbackError&&<p role="alert" className="html-render-failure-detail">{playbackError}</p>}
    </>}
    <details className="advanced-settings">
      <summary>Pengaturan Lanjutan</summary>
      <div className="html-video-settings">
        <label htmlFor="html-video-fps">FPS
          <select id="html-video-fps" disabled={busy} value={fps} onChange={event=>setFps(Number(event.target.value))}>
            {[24,30,...(size==='compact'?[60]:[])].map(rate=><option value={rate} key={rate}>{rate} FPS</option>)}
          </select>
        </label>
        <label htmlFor="html-video-matte">Latar MP4
          <input id="html-video-matte" type="color" disabled={busy} value={matte}
            onChange={event=>setMatte(event.target.value.toUpperCase())}/>
        </label>
        <label htmlFor="html-video-storage">Penyimpanan
          <select id="html-video-storage" value={saveMode} disabled={busy} onChange={event=>setSaveMode(event.target.value as 'download'|'stream')}>
            <option value="download">Unduh biasa</option>
            {streamAvailable&&<option value="stream">Streaming lokal</option>}
          </select>
        </label>
        <label htmlFor="html-video-sample">Frame pemeriksaan
          <select id="html-video-sample" value={sample} disabled={busy} onChange={event=>setSample(event.target.value)}>
            <option value="start">Awal · frame 0</option>
            <option value="middle">Tengah · frame {Math.floor(fps*duration/2)}</option>
            <option value="last">Akhir · frame {fps*duration-1}</option>
          </select>
        </label>
      </div>
      <p className="html-video-limit">Codec H.264 Baseline, MP4 Fast Start, pemeriksaan fidelitas, dan penyimpanan OPFS tetap berjalan otomatis. MP4 tidak menyimpan transparansi.</p>
      {quality&&<div className="html-fidelity-score" data-testid="html-fidelity-score">
        {quality.frames.length} frame diperiksa · galat RGB terburuk {quality.meanError.toFixed(2)} · piksel galat besar {(quality.severeFraction*100).toFixed(2)}%
        <div className="html-video-frame-scores">{quality.frames.map(item=><span key={item.frame}>Frame {item.frame}: RGB {item.meanError.toFixed(2)} · berat {(item.severeFraction*100).toFixed(2)}%</span>)}</div>
      </div>}
      {report&&<div className="html-video-report">
        <label><input type="checkbox" checked={includeSource} onChange={event=>setIncludeSource(event.target.checked)}/>Sertakan kode saat mengunduh laporan teknis</label>
        <button className="secondary" onClick={downloadReport}>Unduh laporan fidelitas JSON</button>
        <small>{report.result.status==='PASSED'?'Semua frame pemeriksaan lolos.':'Kegagalan tercatat: '+(report.result.code||'RENDER')+'. Data tidak diunggah.'}</small>
        {report.compatibility&&<small className="html-render-compatibility">MP4: {report.compatibility.codec} · Fast Start · {report.compatibility.bytes} byte.</small>}
        {report.result.status==='FAILED'&&<small className="html-render-failure-detail" role="alert">Penyebab: {report.result.message}</small>}
      </div>}
    </details>
    <p className="html-video-limit">Animasi yang bergantung pada klik, sentuhan, atau input pengguna tidak direkam otomatis. Jadwalkan perubahan tersebut di dalam kode agar masuk ke video.</p>
    <p className="html-video-limit">Semua pemrosesan dilakukan di browser. Kode Full HTML/WebGL tetap memakai sandbox terisolasi dan Three.js r172 yang dipatok.</p>
  </section>;
}

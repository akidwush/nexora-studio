import {useEffect,useRef,useState} from 'react';
import {HTML_VIDEO_SIZES,validateHtmlVideoOptions} from '../lib/html-video-plan.js';

type Size=keyof typeof HTML_VIDEO_SIZES;
type Source={html:string;css:string;svg:string;js:string};
type Props={source:Source};
export default function HtmlVideoExport({source}:Props){
  const [size,setSize]=useState<Size>('compact');
  const [fps,setFps]=useState(30);
  const [duration,setDuration]=useState(1);
  const [support,setSupport]=useState<boolean|null>(null);
  const [working,setWorking]=useState(false);
  const [progress,setProgress]=useState(0);
  const [message,setMessage]=useState('');
  const [videoUrl,setVideoUrl]=useState('');
  const controller=useRef<AbortController|null>(null);
  const urlRef=useRef('');
  const opts={size,fps,duration};
  useEffect(()=>{
    let alive=true;setSupport(null);
    const info=HTML_VIDEO_SIZES[size];
    if(typeof VideoEncoder==='undefined'){setSupport(false);return()=>{alive=false;};}
    VideoEncoder.isConfigSupported({
      codec:'avc1.42001f',width:info.width,height:info.height,
      bitrate:info.width*info.height>=900000?7000000:3000000,
      framerate:fps,hardwareAcceleration:'no-preference'
    }).then(result=>{if(alive)setSupport(Boolean(result.supported));})
      .catch(()=>{if(alive)setSupport(false);});
    return()=>{alive=false;};
  },[size,fps]);
  useEffect(()=>()=>{
    controller.current?.abort();
    if(urlRef.current)URL.revokeObjectURL(urlRef.current);
  },[]);
  async function exportVideo(){
    if(working)return;
    try{validateHtmlVideoOptions(opts);}
    catch(err){setMessage(err instanceof Error?err.message:'Invalid video format.');return;}
    if(support!==true){setMessage('Browser does not support H.264 at this resolution.');return;}
    setWorking(true);setProgress(0);
    setMessage('Preparing a fresh, isolated HTML renderer…');
    if(urlRef.current)URL.revokeObjectURL(urlRef.current);
    urlRef.current='';setVideoUrl('');
    const task=new AbortController();controller.current=task;
    try{
      // Load capture/encoding engine only on request; avoids heavy homepage JS.
      const {encodeHtmlVideo}=await import('../lib/html-video.js');
      const blob=await encodeHtmlVideo({...source,...opts},{
        signal:task.signal,
        onProgress:(value:number,frame:number,total:number)=>{
          setProgress(value);
          setMessage('Capturing and encoding '+frame+' / '+total+
            ' exact HTML frames ('+Math.round(value*100)+'%)…');
        }
      });
      if(task.signal.aborted)return;
      const url=URL.createObjectURL(blob);urlRef.current=url;setVideoUrl(url);
      setMessage('Genuine H.264 MP4 created: '+(blob.size/1024).toFixed(1)+
        ' KB. Every frame requested at its exact timestamp.');
      const a=document.createElement('a');
      a.href=url;a.download='nexora-html-'+size+'-'+fps+'fps.mp4';a.click();
    }catch(err){
      if(!task.signal.aborted){
        setMessage(err instanceof Error?err.message:'HTML capture failed.');
      }else{
        setMessage('HTML video export cancelled; no partial file was saved.');
      }
    }finally{
      if(controller.current===task)controller.current=null;
      setWorking(false);
    }
  }
  return <section className="html-video-export" aria-label="HTML to MP4 exporter">
    <div className="html-video-head">
      <strong>HTML → REAL MP4</strong>
      <span>CONTROLLED FRAME CAPTURE</span>
    </div>
    <div className="html-video-settings">
      <label htmlFor="html-video-size">Output
        <select id="html-video-size" disabled={working} value={size} onChange={event=>{
          const next=event.target.value as Size;
          setSize(next);if(next!=='compact'&&fps===60)setFps(30);
        }}>
          {Object.entries(HTML_VIDEO_SIZES).map(([id,info])=>
            <option key={id} value={id}>{info.label}</option>)}
        </select>
      </label>
      <label htmlFor="html-video-fps">Frame rate
        <select id="html-video-fps" disabled={working} value={fps} onChange={event=>setFps(Number(event.target.value))}>
          {[24,30,...(size==='compact'?[60]:[])].map(rate=>
            <option value={rate} key={rate}>{rate} FPS</option>)}
        </select>
      </label>
      <label htmlFor="html-video-duration">Duration
        <select id="html-video-duration" disabled={working} value={duration} onChange={event=>setDuration(Number(event.target.value))}>
          {[1,2,3].map(value=><option value={value} key={value}>{value} sec</option>)}
        </select>
      </label>
    </div>
    <div className="html-video-actions">
      <button className="primary" disabled={working||support!==true}
        onClick={()=>void exportVideo()}>
        {working?'Capturing…':'↓ Export HTML as MP4'}
      </button>
      {working&&<button className="cancel-export" onClick={()=>controller.current?.abort()}>Cancel</button>}
    </div>
    {working&&<progress aria-label="HTML frame capture progress" max={1} value={progress}/>}
    <p className="html-video-message" role="status">{message||(
      support===null?'Checking browser encoder…':support===false?
      'H.264 encoder unavailable in this browser.':'Ready to render locally, without server uploads.'
    )}</p>
    {videoUrl&&<>
      <a className="video-download" href={videoUrl}
        download={'nexora-html-'+size+'-'+fps+'fps.mp4'}>Download MP4 again ↗</a>
      <video className="html-video-result" controls playsInline preload="metadata" src={videoUrl}
        aria-label="Rendered HTML video playback"/>
    </>}
    <p className="html-video-limit">Self-contained HTML/CSS/SVG/JS only. No external images,
      video/audio or embedded frames. Browser-supported computed styles may have visual
      differences. 60 FPS is limited to 640×360; maximum 3 seconds per export.</p>
  </section>;
}

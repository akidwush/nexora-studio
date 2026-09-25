import {useEffect,useRef,useState} from 'react';
import {PREVIEW_CHANNEL} from '../lib/preview.js';
import {TIMELINE_CHANNEL,frameTimestamp} from '../lib/timeline-runtime.js';

type Ratio='16:9'|'9:16'|'1:1';
type Snapshot={session:string;doc:string};
type Diagnostic={level:'ready'|'log'|'warn'|'error';message:string};
export type TimelineUpdate={state:'loading'|'seeking'|'ready'|'error';frame:number;ms:number;message?:string};
type Timeline={enabled:boolean;frame:number;fps:number;onUpdate?:(update:TimelineUpdate)=>void};
type Props={preview:Snapshot;active:boolean;ratio:Ratio;timeline?:Timeline};
type InFlight={id:string;frame:number;timeout:number};

// The controlled timeline is strictly a preview protocol, never an authority.
// User code inside an iframe can forge frame messages; do not use this as a
// security/trust boundary or as evidence of a video file having been rendered.
export default function HtmlSandbox({preview,active,ratio,timeline}:Props){
  const frameRef=useRef<HTMLIFrameElement|null>(null);
  const [entries,setEntries]=useState<Diagnostic[]>([]);
  const [epoch,setEpoch]=useState(0);
  const lastFrameRef=useRef(-1);
  const readyRef=useRef(false);
  const inFlightRef=useRef<InFlight|null>(null);
  const timelineRef=useRef(timeline);
  const pumpRef=useRef<()=>void>(()=>{});
  const onUpdateRef=useRef(timeline?.onUpdate);
  timelineRef.current=timeline;
  onUpdateRef.current=timeline?.onUpdate;

  const update=(change:TimelineUpdate)=>onUpdateRef.current?.(change);
  const cancelPending=()=>{
    if(inFlightRef.current)window.clearTimeout(inFlightRef.current.timeout);
    inFlightRef.current=null;
  };

  // Parent always sends index N after N-1. A rewind reloads the whole iframe:
  // JS mutable state, PRNG, virtual timers, and rAF are replayed from time zero.
  pumpRef.current=()=>{
    const command=timelineRef.current;
    if(!active||!command?.enabled||!readyRef.current||inFlightRef.current)return;
    const {frame,fps}=command;
    if(frame<lastFrameRef.current){
      readyRef.current=false;lastFrameRef.current=-1;
      update({state:'loading',frame,ms:frameTimestamp(frame,fps),message:'Replaying from frame zero…'});
      setEntries([]);setEpoch(value=>value+1);
      return;
    }
    if(frame===lastFrameRef.current){
      update({state:'ready',frame,ms:frameTimestamp(frame,fps)});
      return;
    }
    const next=lastFrameRef.current+1;
    const id=crypto.randomUUID();
    const timeout=window.setTimeout(()=>{
      if(inFlightRef.current?.id!==id)return;
      inFlightRef.current=null;
      readyRef.current=false;
      update({state:'error',frame:next,ms:frameTimestamp(next,fps),message:'Sandbox frame did not complete. Stop and Run preview to retry.'});
    },12000);
    inFlightRef.current={id,frame:next,timeout};
    if(next===0||next%30===0||next===frame)
      update({state:'seeking',frame:next,ms:frameTimestamp(next,fps)});
    frameRef.current?.contentWindow?.postMessage(
      {channel:TIMELINE_CHANNEL,session:preview.session,kind:'seek',id,frame:next,fps},'*'
    );
  };

  useEffect(()=>{
    setEntries([]);cancelPending();readyRef.current=false;lastFrameRef.current=-1;
    setEpoch(0);
    if(active&&timeline?.enabled)
      update({state:'loading',frame:0,ms:0,message:'Starting deterministic frame clock…'});
    return()=>{cancelPending();readyRef.current=false;};
  },[preview.session,active,timeline?.enabled]);

  useEffect(()=>{
    if(!active)return;
    const onMessage=(event:MessageEvent)=>{
      if(event.source!==frameRef.current?.contentWindow)return;
      const data=event.data;
      if(!data||typeof data!=='object'||data.session!==preview.session)return;
      if(data.channel===PREVIEW_CHANNEL){
        if(!['ready','log','warn','error'].includes(data.level)||typeof data.message!=='string')return;
        const level=data.level as Diagnostic['level'];
        setEntries(old=>[...old.slice(-11),{level,message:data.message.slice(0,240)}]);
        return;
      }
      if(data.channel!==TIMELINE_CHANNEL||!timelineRef.current?.enabled)return;
      if(data.kind==='ready'){
        readyRef.current=true;
        pumpRef.current();
      }else if(data.kind==='frame'){
        const pending=inFlightRef.current;
        if(!pending||data.id!==pending.id||data.frame!==pending.frame||
           data.fps!==timelineRef.current.fps)return;
        window.clearTimeout(pending.timeout);inFlightRef.current=null;
        lastFrameRef.current=pending.frame;
        pumpRef.current();
      }else if(data.kind==='failure'&&typeof data.message==='string'){
        if(inFlightRef.current&&data.id!==inFlightRef.current.id)return;
        cancelPending();readyRef.current=false;
        update({state:'error',frame:lastFrameRef.current,ms:lastFrameRef.current<0?0:frameTimestamp(lastFrameRef.current,timelineRef.current.fps),message:data.message.slice(0,180)});
      }else if(data.kind==='warning'&&typeof data.message==='string'){
        setEntries(old=>[...old.slice(-11),{level:'warn',message:data.message.slice(0,180)}]);
      }
    };
    window.addEventListener('message',onMessage);
    return()=>window.removeEventListener('message',onMessage);
  },[active,preview.session,epoch]);

  // Called for new target positions. While one frame is pending, ACK resumes the
  // pump using the latest target, preventing overlapping/out-of-order requests.
  useEffect(()=>{pumpRef.current();},[active,preview.session,epoch,timeline?.enabled,timeline?.fps,timeline?.frame]);

  return <>
    <div className="canvas">
      {active?
        <iframe
          ref={frameRef}
          key={preview.session+':'+epoch}
          title="Sandboxed code preview"
          data-ratio={ratio}
          data-clock={timeline?.enabled?'controlled':'live'}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={preview.doc}
          onLoad={()=>{
            if(timelineRef.current?.enabled){
              frameRef.current?.contentWindow?.postMessage(
                {channel:TIMELINE_CHANNEL,session:preview.session,kind:'hello'},'*'
              );
            }
          }}
          style={{aspectRatio:ratio.replace(':',' / ')}}
        />:
        <div className="preview-stopped" role="status">Preview stopped. Select Run preview to create a new isolated frame.</div>
      }
    </div>
    <div className="sandbox-console" role="log" aria-label="Isolated preview console">
      <div className="sandbox-console-heading"><strong>SANDBOX CONSOLE</strong><span>DISPLAY ONLY · UNTRUSTED</span></div>
      <div className="sandbox-console-entries">
        {active&&entries.length?
          entries.map((entry,index)=><p key={preview.session+'-'+epoch+'-'+index} data-level={entry.level}>
            <span>{entry.level.toUpperCase()}</span>{entry.message}
          </p>):
          <p className="sandbox-console-empty">{active?'Waiting for sandbox output…':'Sandbox is not running.'}</p>}
      </div>
    </div>
  </>;
}

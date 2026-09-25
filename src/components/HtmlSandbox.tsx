import {useEffect,useRef,useState} from 'react';
import {PREVIEW_CHANNEL} from '../lib/preview.js';

type Ratio='16:9'|'9:16'|'1:1';
type Snapshot={session:string;doc:string};
type Diagnostic={level:'ready'|'log'|'warn'|'error';message:string};
type Props={preview:Snapshot;active:boolean;ratio:Ratio};

// Diagnostics are purely cosmetic: never interpret iframe messages as trusted commands.
// iframe source identity and per-run tag reject messages from stale/unrelated frames.
export default function HtmlSandbox({preview,active,ratio}:Props){
  const frameRef=useRef<HTMLIFrameElement|null>(null);
  const [entries,setEntries]=useState<Diagnostic[]>([]);
  useEffect(()=>setEntries([]),[preview.session]);
  useEffect(()=>{
    if(!active)return;
    const onMessage=(event:MessageEvent)=>{
      if(event.source!==frameRef.current?.contentWindow)return;
      const data=event.data;
      if(!data||typeof data!=='object'||data.channel!==PREVIEW_CHANNEL||data.session!==preview.session)return;
      if(!['ready','log','warn','error'].includes(data.level)||typeof data.message!=='string')return;
      const level=data.level as Diagnostic['level'],message=data.message.slice(0,240);
      setEntries(current=>[...current.slice(-11),{level,message}]);
    };
    window.addEventListener('message',onMessage);
    return()=>window.removeEventListener('message',onMessage);
  },[active,preview.session]);
  return <>
    <div className="canvas">
      {active?
        <iframe
          ref={frameRef}
          key={preview.session}
          title="Sandboxed code preview"
          data-ratio={ratio}
          sandbox="allow-scripts"
          referrerPolicy="no-referrer"
          srcDoc={preview.doc}
          style={{aspectRatio:ratio.replace(':',' / ')}}
        />:
        <div className="preview-stopped" role="status">Preview stopped. Select Run preview to create a new isolated frame.</div>
      }
    </div>
    <div className="sandbox-console" role="log" aria-label="Isolated preview console">
      <div className="sandbox-console-heading"><strong>SANDBOX CONSOLE</strong><span>DISPLAY ONLY · UNTRUSTED</span></div>
      <div className="sandbox-console-entries">
        {active&&entries.length?
          entries.map((entry,index)=><p key={preview.session+'-'+index} data-level={entry.level}>
            <span>{entry.level.toUpperCase()}</span>{entry.message}
          </p>):
          <p className="sandbox-console-empty">{active?'Waiting for sandbox output…':'Sandbox is not running.'}</p>}
      </div>
    </div>
  </>;
}

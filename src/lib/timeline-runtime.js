// Injected *before* user HTML and scripts in the isolated iframe.
// A controlled scene is advanced only by ordered FRAME commands; no wall-clock
// requestAnimationFrame, Date.now, or setTimeout drives supported animations.
// This contract does not virtualize crypto, media decoding, offscreen workers
// (blocked by CSP), external state, or arbitrary busy loops.
export const TIMELINE_CHANNEL='nexora-timeline-v1';
export const SUPPORTED_FPS=Object.freeze([12,24,30,60]);
export const MAX_TIMELINE_FRAMES=720;
export const VIRTUAL_EPOCH_MS=1577836800000; // fixed 2020-01-01 UTC

export function frameTimestamp(frame,fps) {
  if(!Number.isInteger(frame)||frame<0||frame>=MAX_TIMELINE_FRAMES||
     !SUPPORTED_FPS.includes(fps))throw new RangeError('Unsupported timeline frame or FPS.');
  return frame*1000/fps;
}

// Self-contained on purpose: function.toString() is embedded as *inline* script.
// Never change it to import external helpers: sandbox CSP forbids external scripts.
function installTimeline(session,channel) {
  const EPOCH=1577836800000;
  const nativeDate=window.Date;
  const nativeRAF=window.requestAnimationFrame.bind(window);
  const nativeSetTimeout=window.setTimeout.bind(window);
  const nativeMathRandom=Math.random;
  let now=0,lastFrame=-1,rate=null,ready=false,queue=Promise.resolve();
  let sequence=1,seed=0x1e0f5a7d;
  const scheduled=new Map(),raf=new Map(),animationBirth=new WeakMap();
  const emit=(kind,extra={},transfer=[])=>{
    try{parent.postMessage(Object.assign({channel,session,kind},extra),'*',transfer);}catch{}
  };
  const safeInvoke=(callback,args)=>{
    try {if(typeof callback==='function')callback(...args);}
    catch(err){console.error('Virtual timeline callback:',err?.message||String(err));}
  };
  function VirtualDate(...args){
    if(new.target)return args.length?new nativeDate(...args):new nativeDate(EPOCH+now);
    return new nativeDate(EPOCH+now).toString();
  }
  VirtualDate.prototype=nativeDate.prototype;
  Object.setPrototypeOf(VirtualDate,nativeDate);
  VirtualDate.now=()=>EPOCH+now;
  VirtualDate.parse=nativeDate.parse;
  VirtualDate.UTC=nativeDate.UTC;
  window.Date=VirtualDate;
  try{Object.defineProperty(performance,'now',{configurable:true,value:()=>now});}
  catch{emit('warning',{message:'performance.now could not be virtualized on this browser.'});}
  Math.random=()=>{
    // Repeatable across frame reloads, but does not override crypto randomness.
    seed^=seed<<13;seed^=seed>>>17;seed^=seed<<5;
    return (seed>>>0)/4294967296;
  };
  const setVirtualTimer=(callback,delay,interval,args)=>{
    if(typeof callback!=='function')throw new TypeError('Virtual timers require a function, not a string.');
    const id=sequence++;
    const period=Math.max(interval?1:0,Number.isFinite(Number(delay))?Math.max(0,Number(delay)):0);
    scheduled.set(id,{callback,args,at:now+period,period,interval});
    return id;
  };
  window.setTimeout=(fn,delay,...args)=>setVirtualTimer(fn,delay,false,args);
  window.setInterval=(fn,delay,...args)=>setVirtualTimer(fn,delay,true,args);
  window.clearTimeout=id=>scheduled.delete(id);
  window.clearInterval=id=>scheduled.delete(id);
  window.requestAnimationFrame=fn=>{
    if(typeof fn!=='function')throw new TypeError('requestAnimationFrame requires a callback.');
    const id=sequence++;raf.set(id,fn);return id;
  };
  window.cancelAnimationFrame=id=>raf.delete(id);
  // WAAPI animations are immediately frozen when created by user scripts.
  const nativeAnimate=Element.prototype.animate;
  if(typeof nativeAnimate==='function'){
    Element.prototype.animate=function(...args){
      const animation=nativeAnimate.apply(this,args);
      animationBirth.set(animation,now);
      try{animation.pause();animation.currentTime=0;}catch{}
      return animation;
    };
  }
  const freezeAnimations=t=>{
    // Force style flush to include dynamically created CSS transitions/animations.
    void document.documentElement.offsetWidth;
    for(const animation of document.getAnimations({subtree:true})){
      if(!animationBirth.has(animation))animationBirth.set(animation,now);
      const elapsed=Math.max(0,t-animationBirth.get(animation));
      try{animation.pause();animation.currentTime=elapsed;}catch(error){
        console.warn('Cannot seek a browser animation:',error?.message||String(error));
      }
    }
    for(const svg of document.querySelectorAll('svg')){
      if(typeof svg.pauseAnimations!=='function')continue;
      try{svg.pauseAnimations();svg.setCurrentTime(t/1000);}catch{}
    }
  };
  const flushTimers=async target=>{
    let calls=0;
    while(true){
      let id=null,earliest=null;
      for(const [key,timer] of scheduled){
        if(timer.at>target)continue;
        if(!earliest||timer.at<earliest.at||(timer.at===earliest.at&&key<id)){
          id=key;earliest=timer;
        }
      }
      if(!earliest)break;
      if(++calls>2000)throw new Error('Virtual timer safety limit exceeded within one frame.');
      now=earliest.at;
      if(earliest.interval)earliest.at+=earliest.period;
      else scheduled.delete(id);
      safeInvoke(earliest.callback,earliest.args);
      await Promise.resolve();
      freezeAnimations(now);
    }
  };
  const nextNativePaint=()=>new Promise(resolve=>nativeRAF(()=>nativeRAF(resolve)));
  const execute=async(frame,fps,capture)=>{
    if(!ready)throw new Error('Sandbox timeline is not ready.');
    if(![12,24,30,60].includes(fps)||!Number.isInteger(frame)||frame<0||frame>=720)
      throw new Error('Frame index or FPS is outside supported limits.');
    if(rate===null)rate=fps;
    if(rate!==fps)throw new Error('Change of FPS requires rebuilding the sandbox.');
    if(frame!==lastFrame+1)throw new Error('JavaScript frame replay must be sequential; reset iframe to rewind.');
    const target=frame*1000/fps;
    await flushTimers(target);
    now=target;
    // Snapshot: an rAF scheduled inside the callback belongs to the next frame.
    const callbacks=Array.from(raf.values());
    raf.clear();
    for(const callback of callbacks)safeInvoke(callback,[now]);
    await Promise.resolve();
    freezeAnimations(now);
    if(capture){
      // The export iframe may be offscreen and compositor RAF throttled.
      // Serialize the exact paused computed DOM after a native event-loop turn.
      await new Promise(resolve=>nativeSetTimeout(resolve,0));
      const renderer=window.__nexoraFrameCapture;
      if(typeof renderer!=='function')throw new Error('HTML snapshot renderer was not installed.');
      const bytes=await renderer(capture.width,capture.height);
      lastFrame=frame;
      return {ms:target,bytes};
    }
    // Interactive preview retains a post-paint acknowledgement.
    await nextNativePaint();
    lastFrame=frame;
    return {ms:target};

  };
  window.addEventListener('message',event=>{
    if(event.source!==parent)return;
    const data=event.data;
    if(!data||data.channel!==channel||data.session!==session)return;
    // The parent may miss an early READY message on extremely fast iframe loads.
    if(data.kind==='hello'){if(ready)emit('ready',{epoch:EPOCH});return;}
    if(data.kind!=='seek')return;
    const id=data.id;
    if(typeof id!=='string'||id.length>100)return;
    queue=queue.then(async()=>{
      try{
        const capturing=data.capture===true;
        const result=await execute(data.frame,data.fps,
          capturing?{width:data.width,height:data.height}:null);
        if(capturing){
          emit('captured',{id,frame:data.frame,fps:data.fps,ms:result.ms,bytes:result.bytes},[result.bytes]);
        }else{
          emit('frame',{id,frame:data.frame,fps:data.fps,ms:result.ms});
        }
      }catch(err){
        emit('failure',{id,message:String(err?.message||err).slice(0,180)});
      }
    }).catch(err=>emit('failure',{id,message:String(err).slice(0,180)}));
  });
  document.addEventListener('DOMContentLoaded',async()=>{
    try{
      freezeAnimations(0);
      if(document.fonts)await document.fonts.ready;
      if(document.querySelector('audio,video'))emit('warning',{message:'HTML media are not timeline-synchronized.'});
      ready=true;
      emit('ready',{epoch:EPOCH});
    }catch(err){emit('failure',{message:String(err?.message||err).slice(0,180)});}
  },{once:true});
  // Retain a readable timeline diagnostic without exporting a privileged API.
  Object.defineProperty(window,'nexoraClock',{configurable:false,
    get:()=>Object.freeze({frame:lastFrame,fps:rate,ms:now,epoch:EPOCH})});
}
export function timelineBootstrap(session){
  if(typeof session!=='string'||session.length<1||session.length>120)
    throw new Error('Timeline mode requires a bounded session ID.');
  const sid=JSON.stringify(session).replace(/</g,'\\u003c');
  const channel=JSON.stringify(TIMELINE_CHANNEL);
  const script='('+installTimeline.toString()+')('+sid+','+channel+');';
  return '<script>'+script.replace(/<\/script/gi,'<\\/script')+'</script>';
}

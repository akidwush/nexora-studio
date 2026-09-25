// Deterministic frame timeline; independent of wall time.
export const VIDEO_PRESETS=Object.freeze([
 {id:'orbit',label:'Orbit Glow',description:'Rotating planetary emblem and glowing gradients.'},
 {id:'kinetic',label:'Kinetic Geometry',description:'Geometric shapes with frame-accurate choreography.'},
 {id:'waves',label:'Electric Waves',description:'Layered sine waves with soft particle glows.'}
]);
export const VIDEO_SIZES=Object.freeze({
 landscape:{width:1280,height:720,label:'16:9 HD'},
 portrait:{width:720,height:1280,label:'9:16 HD'},
 square:{width:720,height:720,label:'1:1 HD'},
 compact:{width:640,height:360,label:'16:9 Fast'}
});
export function validateVideoOptions(options){
 const {preset,size,fps,duration}=options??{};
 if(!VIDEO_PRESETS.some(p=>p.id===preset))throw new Error('Unsupported video preset');
 if(!Object.prototype.hasOwnProperty.call(VIDEO_SIZES,size))throw new Error('Unsupported output size');
 if(![12,24,30].includes(Number(fps)))throw new Error('Unsupported FPS');
 if(!Number.isInteger(Number(duration))||Number(duration)<1||Number(duration)>12)throw new Error('Duration must be 1 to 12 seconds');
 const {width,height}=VIDEO_SIZES[size];
 return {preset,size,width,height,fps:Number(fps),duration:Number(duration),frames:Number(fps)*Number(duration)};
}
export function motionState(preset,t,duration=4){
 if(!VIDEO_PRESETS.some(p=>p.id===preset)||!Number.isFinite(t)||t<0||!Number.isFinite(duration)||duration<=0)throw new Error('Invalid motion state');
 const progress=t/duration;
 return {progress,angle:2*Math.PI*progress*2,pulse:0.5+0.5*Math.sin(2*Math.PI*progress*3),slide:Math.sin(2*Math.PI*progress),phase:2*Math.PI*progress};
}

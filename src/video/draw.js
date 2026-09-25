import {motionState} from './timeline.js';
function glowCircle(ctx,x,y,r,color,shadow){
 ctx.save();ctx.fillStyle=color;ctx.shadowBlur=shadow;ctx.shadowColor=color;
 ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();ctx.restore();
}
export function drawMotionFrame(ctx,{preset,time,duration,width,height}){
 if(!ctx||!(width>0)||!(height>0))throw new Error('Invalid renderer configuration');
 const s=motionState(preset,time,duration),min=Math.min(width,height),landscape=width>=height;
 ctx.save();ctx.setTransform(1,0,0,1,0,0);ctx.clearRect(0,0,width,height);
 if(preset==='orbit'){
   const bg=ctx.createRadialGradient(width*.68,height*.3,0,width*.53,height*.5,Math.max(width,height)*.82);
   bg.addColorStop(0,'#4e3184');bg.addColorStop(.48,'#24173b');bg.addColorStop(1,'#0c0a1b');
   ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
   const cx=width*.58,cy=height*.41,r=min*.28;
   ctx.save();ctx.translate(cx,cy);ctx.rotate(s.angle);
   ctx.strokeStyle='#bca8f16e';ctx.lineWidth=Math.max(1,min*.002);
   ctx.beginPath();ctx.ellipse(0,0,r*1.6,r*.61,Math.PI*.2,0,Math.PI*2);ctx.stroke();
   glowCircle(ctx,r*1.18,0,min*.035,'#e3b5ff',min*.1);ctx.restore();
   ctx.save();ctx.translate(cx,cy);ctx.rotate(-s.angle/2);
   ctx.shadowColor='#ac7cff';ctx.shadowBlur=min*.18;
   const orb=ctx.createLinearGradient(-r,-r,r,r);orb.addColorStop(0,'#edd9ff');orb.addColorStop(.45,'#a883fc');orb.addColorStop(1,'#4c2d9a');
   ctx.fillStyle=orb;ctx.beginPath();ctx.roundRect(-r*.44,-r*.44,r*.88,r*.88,r*.25);ctx.fill();ctx.restore();
   ctx.textAlign='left';const left=landscape?width*.07:width*.085;
   ctx.fillStyle='#c9b8ed';ctx.font='700 '+Math.round(min*.025)+'px system-ui';ctx.fillText('NEXORA / MOTION',left,height*.72);
   ctx.fillStyle='#fff';ctx.font='800 '+Math.round(min*(landscape?.102:.092))+'px system-ui';
   ctx.fillText('CREATE',left,height*.83);ctx.fillStyle='#c4a7ff';ctx.fillText('IN MOTION',left,height*.93);
 }else if(preset==='kinetic'){
   ctx.fillStyle='#ffeadc';ctx.fillRect(0,0,width,height);
   const cx=width*.54,cy=height*.4,r=min*.23;
   ctx.save();ctx.translate(cx+Math.sin(s.phase)*r*.35,cy+Math.cos(s.phase)*r*.2);ctx.rotate(s.angle);
   ctx.fillStyle='#f77a78';ctx.beginPath();ctx.arc(0,0,r,0,Math.PI*2);ctx.fill();ctx.restore();
   ctx.save();ctx.translate(cx-r*.34,cy+r*.1);ctx.rotate(-s.angle*.75);ctx.globalAlpha=.82;
   ctx.fillStyle='#7355cf';ctx.beginPath();ctx.roundRect(-r*.83,-r*.83,r*1.66,r*1.66,r*.2);ctx.fill();ctx.restore();
   glowCircle(ctx,cx+r*.3+Math.sin(s.phase)*r,cy+r*.2,r*.43,'#ffc255',0);
   ctx.fillStyle='#34233d';ctx.textAlign='left';ctx.font='800 '+Math.round(min*.11)+'px system-ui';
   ctx.fillText('DESIGN',width*.09,height*.81);ctx.fillText('IN FLOW',width*.09,height*.94);
 }else if(preset==='waves'){
   const grad=ctx.createLinearGradient(0,0,width,height);grad.addColorStop(0,'#08142d');grad.addColorStop(.6,'#1c164f');grad.addColorStop(1,'#070c1d');
   ctx.fillStyle=grad;ctx.fillRect(0,0,width,height);
   for(let layer=0;layer<4;layer++){
     const base=height*(.35+layer*.13);ctx.beginPath();ctx.moveTo(0,height);
     for(let x=0;x<=width+12;x+=12){
       const y=base+Math.sin(x/width*Math.PI*(2+layer*.35)+s.phase*(layer%2?1:-1)+layer)*height*(.05+layer*.012);ctx.lineTo(x,y);
     }
     ctx.lineTo(width,height);ctx.closePath();ctx.fillStyle=['#7551f663','#4f72f678','#317dcd78','#6c5ed56a'][layer];ctx.fill();
   }
   for(let i=0;i<18;i++){
     glowCircle(ctx,((i*.618034+s.progress*.2)%1)*width,((i*.381966+s.progress*.17)%1)*height,min*(.002+(i%3)*.001),'#b3c9ff',min*.02);
   }
   ctx.textAlign='center';ctx.fillStyle='#e6e6ff';ctx.font='800 '+Math.round(min*.087)+'px system-ui';
   ctx.fillText('EVERY FRAME',width*.5,height*.22);ctx.font='600 '+Math.round(min*.036)+'px system-ui';
   ctx.fillStyle='#adbbf7';ctx.fillText('IS A NEW BEGINNING',width*.5,height*.28);
 }
 ctx.restore();
}

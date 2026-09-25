import {validateScene} from './scene.js';
function rgba(hex,alpha){
 const h=hex.slice(1);
 return 'rgba('+parseInt(h.slice(0,2),16)+','+parseInt(h.slice(2,4),16)+','+parseInt(h.slice(4,6),16)+','+alpha+')';
}
function fitLines(ctx,text,maxWidth,maxLines){
 const tokens=text.split(/\s+/),lines=[];
 for(const word of tokens){
   const current=lines.length-1;
   if(current>=0&&ctx.measureText(lines[current]+' '+word).width<=maxWidth)lines[current]+=' '+word;
   else lines.push(word);
 }
 return lines.length<=maxLines?lines:lines.slice(0,maxLines-1).concat([lines.slice(maxLines-1).join(' ')]);
}
// Pure timestamp-based animated canvas scene. No provider-generated code is evaluated.
export function drawAiScene(ctx,{scene,time,duration,width,height}){
 const s=validateScene(scene);
 if(!ctx||!Number.isFinite(time)||!(duration>0)||!(width>0)||!(height>0))throw new Error('Invalid render arguments.');
 const min=Math.min(width,height),p=time/duration*2*Math.PI,energy=s.energy==='bold'?1.55:s.energy==='calm'?.65:1;
 const phase=p*energy,colors=s.palette;
 ctx.save();
 ctx.setTransform(1,0,0,1,0,0);
 const bg=ctx.createRadialGradient(width*.7,height*.24,0,width*.5,height*.5,Math.max(width,height)*.85);
 bg.addColorStop(0,colors.primary);bg.addColorStop(1,colors.background);
 ctx.fillStyle=bg;ctx.fillRect(0,0,width,height);
 const cx=width*.53,cy=height*.37,rad=min*.2;
 if(s.template==='orbit'){
   ctx.save();ctx.translate(cx,cy);ctx.rotate(phase*2);
   ctx.lineWidth=Math.max(2,min*.003);ctx.strokeStyle=colors.accent;ctx.globalAlpha=.65;
   ctx.beginPath();ctx.ellipse(0,0,rad*1.75,rad*.77,.2,0,Math.PI*2);ctx.stroke();
   ctx.beginPath();ctx.arc(rad*1.52,0,rad*.15,0,Math.PI*2);
   ctx.fillStyle=colors.accent;ctx.shadowBlur=min*.15;ctx.shadowColor=colors.accent;ctx.fill();ctx.restore();
   ctx.save();ctx.translate(cx,cy);ctx.rotate(-phase);
   ctx.shadowColor=colors.accent;ctx.shadowBlur=min*.14;
   ctx.fillStyle=colors.accent;ctx.beginPath();ctx.roundRect(-rad*.6,-rad*.6,rad*1.2,rad*1.2,rad*.2);ctx.fill();ctx.restore();
 }else if(s.template==='kinetic'){
   for(let i=0;i<4;i++){
     const angle=phase*(i%2===0?1:-1)+i*Math.PI/2,x=cx+Math.cos(angle)*rad*.9,y=cy+Math.sin(angle)*rad*.65;
     ctx.save();ctx.translate(x,y);ctx.rotate(angle);
     ctx.fillStyle=i%2?colors.accent:colors.primary;ctx.globalAlpha=.7;
     if(i%2===0){ctx.beginPath();ctx.arc(0,0,rad*(.6+i*.07),0,Math.PI*2);ctx.fill();}
     else{ctx.beginPath();ctx.roundRect(-rad*.55,-rad*.55,rad*1.1,rad*1.1,rad*.16);ctx.fill();}
     ctx.restore();
   }
 }else if(s.template==='waves'){
   for(let layer=0;layer<4;layer++){
     const baseline=height*(.2+layer*.105);
     ctx.beginPath();ctx.moveTo(0,height);
     for(let x=0;x<=width+16;x+=12){
       const y=baseline+Math.sin(x/width*Math.PI*3+phase*(layer%2?-1:1)+layer)*min*(.07+layer*.015);
       ctx.lineTo(x,y);
     }
     ctx.lineTo(width,height);ctx.closePath();
     ctx.fillStyle=layer%2?rgba(colors.accent,.27+layer*.08):rgba(colors.primary,.38+layer*.06);ctx.fill();
   }
 }
 // Text is literal canvas input; the schema disallows HTML and length overflow.
 const fontSize=Math.round(min*(width>height?.092:.083));
 ctx.fillStyle=colors.text;ctx.textAlign='center';ctx.textBaseline='middle';
 ctx.shadowColor='rgba(0,0,0,.55)';ctx.shadowBlur=min*.03;
 ctx.font='800 '+fontSize+'px system-ui';
 const lines=fitLines(ctx,s.title.toUpperCase(),width*.86,3);
 const lineHeight=fontSize*1.07,startY=height*.73-(lines.length-1)*lineHeight/2;
 lines.forEach((line,i)=>ctx.fillText(line,width*.5,startY+i*lineHeight,width*.86));
 ctx.shadowBlur=0;
 ctx.font='500 '+Math.round(min*.03)+'px system-ui';
 ctx.fillText(s.subtitle,width*.5,Math.min(height*.95,startY+lines.length*lineHeight+min*.07),width*.88);
 ctx.restore();
}

// Local-only generated SVG -> PNG. Never draw untrusted remote images to this canvas.
export async function svgToPngBlob(svg, requestedMaxDimension=2048) {
  if(typeof svg!=='string'||!svg.startsWith('<svg')||svg.length>3000000) throw new Error('Expected generated SVG');
  const url=URL.createObjectURL(new Blob([svg],{type:'image/svg+xml'}));
  try{
    const img=new Image();
    await new Promise((resolve,reject)=>{img.onload=resolve;img.onerror=()=>reject(new Error('Cannot render SVG'));img.src=url;});
    const max=Math.max(img.width,img.height);
    const scale=Math.min(1,requestedMaxDimension/max);
    const canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(img.width*scale));
    canvas.height=Math.max(1,Math.round(img.height*scale));
    const ctx=canvas.getContext('2d');
    if(!ctx) throw new Error('Canvas unavailable');
    ctx.drawImage(img,0,0,canvas.width,canvas.height);
    const result=await new Promise((resolve,reject)=>canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG encode failed')),'image/png'));
    return result;
  }finally{URL.revokeObjectURL(url);}
}

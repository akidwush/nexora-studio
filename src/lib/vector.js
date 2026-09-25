// SVG mosaic: genuine vector rectangles but NOT contour tracing or AI reconstruction.
export function pixelGridToSvg({width,height,data},outWidth,outHeight) {
  if (!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
      width>256||height>256||!data||data.length!==width*height*4||outWidth<=0||outHeight<=0) {
    throw new Error('Invalid dimensions or pixel grid');
  }
  const rows=['<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+width+' '+height+
    '" width="'+Math.round(outWidth)+'" height="'+Math.round(outHeight)+'" shape-rendering="crispEdges">'];
  for(let y=0;y<height;y++)for(let x=0;x<width;x++){
    const i=(y*width+x)*4, a=data[i+3];
    if(!a)continue;
    const fill='#'+Array.from(data.slice(i,i+3)).map(n=>n.toString(16).padStart(2,'0')).join('');
    rows.push('<rect x="'+x+'" y="'+y+'" width="1" height="1" fill="'+fill+'"'+(a===255?'':' fill-opacity="'+(a/255).toFixed(3)+'"')+'/>');
  }
  return rows.join('')+'</svg>';
}

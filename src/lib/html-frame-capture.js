// Sandbox-only computed-style DOM snapshot renderer. The full function is inlined
// before user scripts; it runs inside the opaque-origin iframe and has no
// privileged access to the parent. Only self-contained static DOM / CSS / SVG
// and canvas image data are supported. No external assets or video/audio tracks.
export function captureBootstrap(){
  return '<script>('+installFrameCapture.toString()+')();</script>';
}
function installFrameCapture(){
  const BUDGET_NODES=650;
  const BUDGET_XML=3_000_000;
  const SUPPORTED_IMAGE=/^data:image\/(?:png|jpeg|webp|gif|svg\+xml)(?:;[^,]*)?,/i;
  const BAD_URL=/url\(\s*['"]?(?:https?:|\/\/|blob:|file:)/i;
  const styleText=style=>{
    const lines=[];
    for(let i=0;i<style.length;i++){
      const name=style.item(i),val=style.getPropertyValue(name);
      if(BAD_URL.test(val))throw new Error('Remote/blob CSS images are unsupported in HTML capture.');
      if(name==='animation'||name.startsWith('animation-')||
         name==='transition'||name.startsWith('transition-'))continue;
      lines.push(name+':'+val+';');
    }
    return lines.join('');
  };
  const supportedSrc=(src,label)=>{
    if(src&&!SUPPORTED_IMAGE.test(src))throw new Error(label+' must use a self-contained data:image source.');
  };
  const injectSvgAnimation=(original,copy)=>{
    // SMIL animated lengths aren't serialized by cloneNode. Materialize their
    // *actual* current animVal into the cloned geometry before removing <animate>.
    if(!original.namespaceURI?.includes('svg'))return;
    for(const prop of ['x','y','width','height','cx','cy','r','rx','ry','x1','y1','x2','y2','opacity']){
      const animated=original[prop];
      if(animated&&animated.animVal&&typeof animated.animVal.value==='number'){
        copy.setAttribute(prop,String(animated.animVal.value));
      }
    }
    // SVGAnimatedTransformList.animVal is read-only; calling consolidate()
    // mutates it and throws in Chrome. Compose its items non-destructively.
    const transforms=original.transform?.animVal;
    if(transforms&&transforms.numberOfItems>0){
      let matrix=new DOMMatrix();
      for(let i=0;i<transforms.numberOfItems;i++){
        const item=transforms.getItem(i).matrix;
        matrix=matrix.multiply(new DOMMatrix([item.a,item.b,item.c,item.d,item.e,item.f]));
      }
      copy.setAttribute('transform','matrix('+[matrix.a,matrix.b,matrix.c,matrix.d,matrix.e,matrix.f].join(' ')+')');
    }
  };
  const pseudoRules=[];
  const svgDocument=async(width,height)=>{
    if(!Number.isInteger(width)||!Number.isInteger(height)||width<1||height<1||
       width*height>1_000_000)throw new Error('Unsupported snapshot dimensions.');
    if(document.querySelector('video,audio,iframe,object,embed'))
      throw new Error('Embedded video/audio/iframes/plugins are not supported in HTML-to-MP4.');
    const original=[document.body,...document.body.querySelectorAll('*')];
    if(original.length>BUDGET_NODES)throw new Error('HTML scene contains too many DOM elements for capture.');
    const clone=document.body.cloneNode(true);
    const copies=[clone,...clone.querySelectorAll('*')];
    pseudoRules.length=0;
    for(let i=0;i<original.length;i++){
      const node=original[i],copy=copies[i];
      if(!copy||node.nodeType!==1)continue;
      const name=node.localName?.toLowerCase()||'';
      if(name==='script'||name==='style'||name==='animate'||name==='animatetransform'||
         name==='animatemotion'||name==='set'||name==='foreignobject'){
        copy.setAttribute('data-nexora-snapshot-remove','true');continue;
      }
      if(node instanceof HTMLImageElement){
        supportedSrc(node.getAttribute('src')||'', 'Image');
      }
      if(name==='image'&&node.namespaceURI?.includes('svg')){
        supportedSrc(node.getAttribute('href')||node.getAttribute('xlink:href')||'','SVG image');
      }
      if(node instanceof HTMLCanvasElement){
        let data;
        try{data=node.toDataURL('image/png');}
        catch{throw new Error('A tainted canvas cannot be captured.');}
        const img=document.createElement('img');img.src=data;
        img.width=node.width;img.height=node.height;
        copy.replaceWith(img);
        // copy has been replaced: apply computed style to the IMG instead.
        img.setAttribute('style',styleText(getComputedStyle(node)));
        continue;
      }
      const computed=getComputedStyle(node);
      // Inline the exact *paused* computed style instead of carrying keyframes
      // into the foreignObject, where CSS animations would restart at export time.
      copy.setAttribute('style',styleText(computed)+';animation:none!important;transition:none!important;');
      injectSvgAnimation(node,copy);
      for(const pseudo of ['::before','::after']){
        const ps=getComputedStyle(node,pseudo);
        if(!ps||ps.content==='none'||ps.content==='normal'||ps.content==='')continue;
        const marker='nx-snapshot-'+i;
        copy.setAttribute('data-nx-snapshot',marker);
        pseudoRules.push('[data-nx-snapshot="'+marker+'"]'+pseudo+'{'+
          styleText(ps)+';animation:none!important;transition:none!important;}');
      }
    }
    for(const el of clone.querySelectorAll('[data-nexora-snapshot-remove]'))el.remove();
    const rootStyle=getComputedStyle(document.documentElement);
    const rootBackground=rootStyle.backgroundColor==='rgba(0, 0, 0, 0)'?'transparent':rootStyle.backgroundColor;
    clone.setAttribute('xmlns','http://www.w3.org/1999/xhtml');
    clone.setAttribute('style',(clone.getAttribute('style')||'')+
      ';margin:0!important;width:'+width+'px!important;height:'+height+'px!important;'+
      'overflow:hidden!important;box-sizing:border-box!important;background-color:'+
      rootBackground+';');
    if(pseudoRules.length){
      const style=document.createElement('style');style.textContent=pseudoRules.join('\n');
      clone.insertBefore(style,clone.firstChild);
    }
    let xml=new XMLSerializer().serializeToString(clone);
    if(xml.length>BUDGET_XML)throw new Error('HTML capture exceeds the snapshot memory budget.');
    return '<svg xmlns="http://www.w3.org/2000/svg" width="'+width+
      '" height="'+height+'" viewBox="0 0 '+width+' '+height+'">'+
      '<foreignObject width="100%" height="100%">'+xml+'</foreignObject></svg>';
  };
  const capture=async(width,height)=>{
    const svg=await svgDocument(width,height);
    // On opaque-origin sandbox frames, SVG blob: foreignObject images taint
    // Chrome canvas and toBlob throws SecurityError. A self-contained data:
    // SVG source remains origin-clean (verified in Chromium).
    const url='data:image/svg+xml;charset=utf-8,'+encodeURIComponent(svg);
    const image=new Image();
    try{
      await new Promise((resolve,reject)=>{
        image.onload=resolve;
        image.onerror=()=>reject(new Error('Browser could not rasterize this HTML/SVG snapshot.'));
        image.src=url;
      });
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;
      const ctx=canvas.getContext('2d',{alpha:false});
      if(!ctx)throw new Error('Canvas snapshot rendering is unavailable.');
      ctx.fillStyle='#ffffff';ctx.fillRect(0,0,width,height);
      ctx.drawImage(image,0,0,width,height);
      const blob=await new Promise((resolve,reject)=>
        canvas.toBlob(blob=>blob?resolve(blob):reject(new Error('PNG snapshot encoding failed.')),'image/png')
      );
      if(blob.size>6_000_000)throw new Error('Captured frame exceeds the transfer limit.');
      return await blob.arrayBuffer();
    }finally{image.src='';}
  };
  Object.defineProperty(window,'__nexoraFrameCapture',{
    value:capture,configurable:false,writable:false,enumerable:false
  });
}

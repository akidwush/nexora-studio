// NEXORA downstream MPL-2.0 patch: no user code or markup in editor DOM.
// Persistent sandbox lets user-defined onFrame(timeMs) keep animation state.
import {createIsolatedHtmlSession} from '../html-clips/isolated-frame.js';

export class HTMLCanvasRenderer {
  constructor(width=1920,height=1080) {
    this.width=width;
    this.height=height;
    this.canvas=document.createElement('canvas');
    this.canvas.width=width;this.canvas.height=height;
    this.ctx=this.canvas.getContext('2d');
    this.session=null;
    this._ready=false;
  }
  async setClip(html,css,js){
    this.session?.destroy();
    this._ready=false;
    // Do not preload arbitrary remote URLs in the privileged editor origin.
    // Remote assets are deliberately unsupported by isolated safe mode.
    this.session=await createIsolatedHtmlSession({html,css,js},this.width,this.height);
    this._ready=true;
  }
  async renderFrame(timeMs){
    if(!this._ready||!this.session)return false;
    let bitmap;
    try {
      bitmap=await this.session.captureFrame(timeMs);
      this.ctx.clearRect(0,0,this.width,this.height);
      this.ctx.drawImage(bitmap,0,0,this.width,this.height);
      return true;
    }catch(error){
      console.warn('[HTMLCanvas] Isolated render unavailable',error);
      return false;
    }finally{bitmap?.close();}
  }
  drawTo(targetCtx,x=0,y=0,w=this.width,h=this.height){
    targetCtx.drawImage(this.canvas,0,0,this.width,this.height,x,y,w,h);
  }
  async toBlob(type='image/png',quality=0.92){
    return new Promise(resolve=>this.canvas.toBlob(resolve,type,quality));
  }
  resize(width,height){
    this.width=width;this.height=height;
    this.canvas.width=width;this.canvas.height=height;
    // Resizing requires remounting user clip with new sandbox dimensions.
    this.session?.destroy();this.session=null;this._ready=false;
  }
  destroy(){
    this.session?.destroy();this.session=null;
    this.canvas=null;this.ctx=null;this._ready=false;
  }
}
export async function quickRender(html,css,js,timeMs=0,width=800,height=600){
  const renderer=new HTMLCanvasRenderer(width,height);
  try{
    await renderer.setClip(html,css,js);
    if(!await renderer.renderFrame(timeMs))throw new Error('HTML frame failed');
    return renderer.canvas.toDataURL();
  }finally{renderer.destroy();}
}

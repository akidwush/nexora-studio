export const UNIVERSAL_EXPORT_DURATION=8;
export const STANDARD_EXPORT_FPS=30;
export const MOBILE_SAFE_PIXELS=640*360;

/** @param {any} scope @returns {number|null} */
export function deviceMemoryGb(scope=globalThis){
  const value=Number(scope?.navigator?.deviceMemory);
  return Number.isFinite(value)&&value>0?value:null;
}

/**
 * @param {{width?:number,height?:number,fps?:number,streamAvailable?:boolean,
 * memoryGb?:number|null,finePointer?:boolean}} options
 */
export function assessEightSecondExport({width,height,fps=STANDARD_EXPORT_FPS,streamAvailable=false,
  memoryGb=null,finePointer=false}={}){
  if(!Number.isFinite(width)||!Number.isFinite(height)||width<=0||height<=0)
    return {supported:false,reason:'Ukuran video tidak valid.',alternative:'Pilih 640×360.'};
  if(fps!==24&&fps!==30)
    return {supported:false,reason:'Ekspor 8 detik memakai 24 atau 30 FPS.',alternative:'Gunakan 30 FPS.'};
  if(width*height<=MOBILE_SAFE_PIXELS)
    return {supported:true,mode:'download',label:'Cocok untuk Android kelas menengah.'};
  if(!streamAvailable)
    return {supported:false,reason:'Ukuran HD 8 detik memerlukan penyimpanan streaming lokal agar RAM tidak penuh.',alternative:'Gunakan 640×360.'};
  if(memoryGb!==null&&memoryGb<8)
    return {supported:false,reason:'Memori perangkat ini belum aman untuk ekspor HD 8 detik.',alternative:'Gunakan 640×360.'};
  if(!finePointer)
    return {supported:false,reason:'HD 8 detik belum tervalidasi untuk perangkat sentuh ini.',alternative:'Gunakan 640×360.'};
  return {supported:true,mode:'stream',label:'HD akan disimpan dengan streaming lokal.'};
}

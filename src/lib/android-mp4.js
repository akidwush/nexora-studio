// Cross-player output contract. Desktop Chrome being able to decode three
// samples does NOT prove the saved file is friendly to Android's media indexer.
// Verify the first megabyte only: no huge MP4 readback on OPFS streaming.
export const MOBILE_AVC_CODEC='avc1.42001f';
export const MOBILE_MP4_FORMAT=Object.freeze({fastStart:'reserve'});
function u32(a,i){return (a[i]*0x1000000+a[i+1]*65536+a[i+2]*256+a[i+3])>>>0;}
function fourcc(a,i){return String.fromCharCode(...a.subarray(i,i+4));}
function mp4Boxes(a,end){
  const boxes=[];
  for(let i=0;i+8<=end;){
    let size=u32(a,i),header=8;
    const type=fourcc(a,i+4);
    if(size===1){
      if(i+16>end)throw Error('MP4 extended box header is truncated.');
      const high=u32(a,i+8),low=u32(a,i+12);
      const wide=high*0x100000000+low;
      if(!Number.isSafeInteger(wide))throw Error('MP4 extended box size is invalid.');
      size=wide;header=16;
    }else if(size===0){
      if(type==='mdat')return boxes; // mdat may extend beyond our bounded read
      throw Error('MP4 metadata has an unsupported zero-length box.');
    }
    if(size<header)throw Error('MP4 has a malformed box: '+type);
    boxes.push({type,start:i,end:i+size,payload:i+header});
    if(i+size>end)break;
    i+=size;
  }
  return boxes;
}
function codecConfig(moov){
  const bytes=new Uint8Array(moov);
  // Restrict the box search to moov metadata, not arbitrary media payload.
  for(let i=4;i+8<=bytes.length;i++){
    if(fourcc(bytes,i)!=='avcC')continue;
    if(i<4||bytes[i+4]!==1)continue;
    const length=u32(bytes,i-4);
    if(length<15||i-4+length>bytes.length)continue;
    const profile=bytes[i+5],compat=bytes[i+6],level=bytes[i+7];
    if(profile!==0x42||level>31)
      throw Error('Android-compatible MP4 needs H.264 Baseline (profile 66), level <=3.1. Got '+profile+' / '+level+'.');
    return {codec:'avc1.'+[profile,compat,level].map(x=>x.toString(16).padStart(2,'0')).join(''),profile,level};
  }
  throw Error('MP4 has no supported AVC decoder configuration (avcC).');
}
export async function inspectAndroidMp4(blob,{expectedFrames=null}={}){
  if(!blob||typeof blob.slice!=='function'||!Number.isFinite(blob.size)||blob.size<256)
    throw Error('MP4 is missing or incomplete.');
  const limit=Math.min(blob.size,1024*1024);
  const header=new Uint8Array(await blob.slice(0,limit).arrayBuffer());
  if(header.length<8||fourcc(header,4)!=='ftyp')
    throw Error('MP4 is missing its file type header.');
  const top=mp4Boxes(header,header.length);
  if(top[0]?.type!=='ftyp')throw Error('MP4 is missing its file type header.');
  const moov=top.find(x=>x.type==='moov');
  const mdat=top.find(x=>x.type==='mdat');
  if(!moov||moov.end>header.length)
    throw Error('MP4 Fast Start metadata was not found at the beginning of the file.');
  if(mdat&&mdat.start<moov.start)
    throw Error('MP4 puts media before playback metadata; Fast Start is required.');
  // The file may be much larger than the inspected prefix. Require the mdat
  // header, which must follow the moov plus any reserved free-space box.
  if(!mdat)throw Error('MP4 media box is missing after the Fast Start metadata prefix.');
  const metadata=header.slice(moov.start,moov.end);
  const config=codecConfig(metadata);
  if(Number.isInteger(expectedFrames)){
    let count=null;
    for(let i=4;i+12<metadata.length;i++){
      if(fourcc(metadata,i)==='stsz'&&u32(metadata,i-4)>=20){
        count=u32(metadata,i+12);
        break;
      }
    }
    if(count!==expectedFrames)
      throw Error('MP4 sample count mismatch: '+count+' instead of '+expectedFrames+'.');
  }
  return {...config,fastStart:true,bytes:blob.size,container:'mp4',sampleCount:expectedFrames};
}

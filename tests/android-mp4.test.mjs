import {test} from 'node:test';
import assert from 'node:assert/strict';
import {inspectAndroidMp4,MOBILE_AVC_CODEC,MOBILE_MP4_FORMAT} from '../src/lib/android-mp4.js';
import {classifyRenderError,makeRenderReport} from '../src/lib/render-fidelity-report.js';
function box(type,data){
 const content=data||new Uint8Array();
 const result=new Uint8Array(8+content.byteLength);
 const view=new DataView(result.buffer);view.setUint32(0,result.length);
 for(let i=0;i<4;i++)result[4+i]=type.charCodeAt(i);
 result.set(content,8);return result;
}
function join(...parts){
 const length=parts.reduce((sum,x)=>sum+x.byteLength,0);
 const out=new Uint8Array(length);let i=0;
 for(const part of parts){out.set(part,i);i+=part.byteLength;}
 return out;
}
function file({profile=0x42,level=31,frames=150,order='fast',truncate=false}={}){
 const ftyp=box('ftyp',new TextEncoder().encode('isom0000mp42'));
 const avcC=box('avcC',Uint8Array.from([1,profile,0xe0,level,0xff,0xe1,0]));
 const stsz=box('stsz',Uint8Array.from([0,0,0,0,0,0,0,0,0,0,0,frames]));
 const stbl=box('stbl',join(stsz,box('stsd',box('avc1',avcC))));
 const minf=box('minf',stbl);
 const mdia=box('mdia',minf);
 const trak=box('trak',mdia);
 const moov=box('moov',trak);
 const mdat=box('mdat',new Uint8Array(256));
 return new Blob(order==='fast'?[ftyp,moov,box('free',new Uint8Array(40)),...(truncate?[]:[mdat])]:
   [ftyp,mdat,moov],{type:'video/mp4'});
}
test('Android MP4 mobile baseline level<=3.1 and fast start are explicitly pinned',async()=>{
 assert.equal(MOBILE_AVC_CODEC,'avc1.42001f');
 assert.equal(MOBILE_MP4_FORMAT.fastStart,'reserve');
 const result=await inspectAndroidMp4(file(),{expectedFrames:150});
 assert.deepEqual({profile:result.profile,level:result.level,fastStart:result.fastStart,sampleCount:result.sampleCount},
   {profile:66,level:31,fastStart:true,sampleCount:150});
 assert.match(result.codec,/^avc1\.42/);
});
test('fails closed on incompatible H264 profile, level, order, truncation and frame count',async()=>{
 for(const settings of [
   {profile:0x4d},{profile:0x64},{level:41},{order:'last'},{truncate:true}
 ]) await assert.rejects(inspectAndroidMp4(file(settings),{expectedFrames:150}));
 await assert.rejects(inspectAndroidMp4(file(),{expectedFrames:149}),/sample count mismatch/);
 await assert.rejects(inspectAndroidMp4(new Blob([new Uint8Array(300)])),/type header/);
});
test('video compatibility report describes local metadata but never includes source by default',()=>{
 const report=makeRenderReport({width:640,height:360,fps:30,duration:5},{
   compatibility:{codec:'avc1.42e01f',profile:66,level:31,fastStart:true,bytes:10000},
   source:{document:'<html>PRIVATE</html>'}
 });
 assert.equal(report.compatibility.codec,'avc1.42e01f');
 assert.equal(report.compatibility.fastStart,true);
 assert.equal(report.source,undefined);
 assert.equal(classifyRenderError(new Error('MP4 Fast Start metadata not found')),'MP4_COMPATIBILITY');
});

import {test} from 'node:test';
import assert from 'node:assert/strict';
import {criticalFrameIndices,supportsStreamingSave,createMp4Sink} from '../src/lib/mp4-output-sink.js';
import {classifyRenderError,makeRenderReport} from '../src/lib/render-fidelity-report.js';
import {captureBootstrap} from '../src/lib/html-frame-capture.js';

test('first, middle and last unique critical frames for 12/24/30/60 FPS',()=>{
  assert.deepEqual(criticalFrameIndices(1),[0]);
  assert.deepEqual(criticalFrameIndices(2),[0,1]);
  assert.deepEqual(criticalFrameIndices(12),[0,6,11]);
  assert.deepEqual(criticalFrameIndices(30),[0,15,29]);
  assert.deepEqual(criticalFrameIndices(180),[0,90,179]);
  assert.throws(()=>criticalFrameIndices(0),/Invalid/);
});

test('streaming requires a secure picker and origin-private storage',()=>{
  const valid={isSecureContext:true,showSaveFilePicker(){},
    WritableStream, navigator:{storage:{getDirectory(){}}}};
  assert.equal(supportsStreamingSave(valid),true);
  assert.equal(supportsStreamingSave({...valid,isSecureContext:false}),false);
  assert.equal(supportsStreamingSave({...valid,showSaveFilePicker:null}),false);
  assert.equal(supportsStreamingSave({...valid,navigator:{}}),false);
});

test('OPFS StreamTarget is staged, respects a bounded chunk size and copies only at publish',async()=>{
  let staged=new Uint8Array(0),published=[],writes=0,removals=0;
  const stagedHandle={
    createWritable:async()=>new WritableStream({
      write(chunk){
        const size=chunk.position+chunk.data.byteLength;
        if(staged.length<size){const next=new Uint8Array(size);next.set(staged);staged=next;}
        staged.set(chunk.data,chunk.position);
      }
    }),
    getFile:async()=>new Blob([staged],{type:'video/mp4'})
  };
  const destination={
    createWritable:async()=>{writes++;return new WritableStream({write(bytes){published.push(bytes);}});},
    getFile:async()=>new Blob(published,{type:'video/mp4'})
  };
  const root={getFileHandle:async()=>stagedHandle,removeEntry:async()=>{removals++;}};
  const scope={isSecureContext:true,showSaveFilePicker(){},WritableStream,
    crypto:{randomUUID:()=> 'unit-test'},
    navigator:{storage:{getDirectory:async()=>root}}};
  class StreamTarget{constructor(writable,opts){this.writable=writable;this.opts=opts;}}
  class BufferTarget{constructor(){this.buffer=new ArrayBuffer(300);}}
  const sink=await createMp4Sink({fileHandle:destination,BufferTarget,StreamTarget,scope});
  assert.equal(sink.kind,'stream');
  assert.equal(sink.target.opts.chunked,true);
  assert.ok(sink.target.opts.chunkSize<=1024*1024);
  const writer=sink.target.writable.getWriter();
  const bytes=new Uint8Array(300).map((_,i)=>i%256);
  await writer.write({position:0,data:bytes});
  await writer.close();
  assert.equal(writes,0,'No destination write before verification/publish.');
  assert.equal((await sink.read()).size,300);
  assert.equal((await sink.publish()).size,300);
  assert.equal(writes,1);
  assert.deepEqual(new Uint8Array(await (await destination.getFile()).arrayBuffer()),bytes);
  await sink.cleanup();await sink.cleanup();
  assert.equal(removals,1,'Temporary user data must be removed exactly once.');
});

test('legacy buffer path remains without picker/OPFS',async()=>{
  class BufferTarget{constructor(){this.buffer=new Uint8Array(300).buffer;}}
  const sink=await createMp4Sink({BufferTarget});
  assert.equal(sink.kind,'memory');
  assert.equal((await sink.publish()).size,300);
});

test('reproducible reports are local and omit sensitive source by default',()=>{
  const plan={size:'compact',width:640,height:360,fps:30,duration:1,matte:'#FFFFFF'};
  const frames=[{frame:0,meanError:.2,severeFraction:0},{frame:15,meanError:1.2,severeFraction:.001},{frame:29,meanError:.5,severeFraction:0}];
  const code={html:'<h1>PRIVATE</h1>',js:'secret()'};
  const report=makeRenderReport(plan,{frames,source:code});
  assert.equal(report.result.status,'PASSED');
  assert.deepEqual(report.frameResults.map(x=>x.timestampMs),[0,500,966.67]);
  assert.equal(report.source,undefined);
  const opted=makeRenderReport(plan,{frames,source:code,includeSource:true});
  assert.equal(opted.source.html,code.html);
  const failed=makeRenderReport(plan,{error:new Error('Embedded image failed to decode.'),phase:'capture'});
  assert.equal(failed.result.code,'IMAGE');
  assert.equal(classifyRenderError('Embedded custom font unavailable'),'FONT');
});

test('sandbox capture checks custom font readiness and failed embedded images',()=>{
  const runtime=captureBootstrap();
  assert.ok(runtime.includes('document.fonts'));
  assert.ok(runtime.includes('img.decode()'));
  assert.match(runtime,/SVG image failed to decode/);
  assert.doesNotMatch(runtime,/allow-same-origin/);
});

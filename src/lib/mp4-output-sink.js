// Backpressure-aware local export. The selected destination is not touched
// until ALL requested video fidelity checks pass. OPFS is a temporary staging
// file, not a project upload or a permanent cache.
export function supportsStreamingSave(scope=globalThis){
  return Boolean(scope.isSecureContext && typeof scope.showSaveFilePicker==='function' &&
    scope.navigator?.storage && typeof scope.navigator.storage.getDirectory==='function' &&
    typeof scope.WritableStream==='function');
}
export function criticalFrameIndices(frames){
  if(!Number.isInteger(frames)||frames<1)throw new RangeError('Invalid video frame count.');
  // Five seconds and shorter retain the existing three decoded checks.
  // For 8-10s animations inspect evenly distributed frames: catching a
  // frozen, blank, or broken section between an otherwise correct start/end.
  const marks=frames>240?[0,1/6,1/3,1/2,2/3,5/6,1]:
    frames>150?[0,1/4,1/2,3/4,1]:[0,1/2,1];
  return [...new Set(marks.map(f=>f===1?frames-1:Math.floor(frames*f)))].sort((a,b)=>a-b);
}
export async function createMp4Sink({fileHandle,BufferTarget,StreamTarget,scope=globalThis}){
  if(!fileHandle){
    const target=new BufferTarget();
    return {
      target,kind:'memory',
      async read(){if(!target.buffer||target.buffer.byteLength<256)throw Error('Empty MP4 output.');return new Blob([target.buffer],{type:'video/mp4'});},
      async publish(){return this.read();},
      async cleanup(){}
    };
  }
  if(!supportsStreamingSave(scope))throw Error('Secure browser streaming storage is unavailable.');
  if(typeof fileHandle.createWritable!=='function'||typeof fileHandle.getFile!=='function')
    throw Error('Invalid file save destination.');
  const root=await scope.navigator.storage.getDirectory();
  const name='nexora-temporary-export-'+scope.crypto.randomUUID()+'.mp4';
  const staged=await root.getFileHandle(name,{create:true});
  let writer;
  try{writer=await staged.createWritable();}
  catch(error){await root.removeEntry(name).catch(()=>{});throw error;}
  const target=new StreamTarget(writer,{chunked:true,chunkSize:1024*1024});
  let cleaned=false;
  const cleanup=async()=>{
    if(cleaned)return;
    cleaned=true;
    // Target is closed by Output.finalize/Output.cancel. Never leave a
    // persistent copy of user projects in origin-private storage.
    await root.removeEntry(name).catch(()=>{});
  };
  return {
    target,kind:'stream',
    async read(){
      const file=await staged.getFile();
      if(file.size<256)throw Error('Incomplete streamed MP4.');
      return file;
    },
    async publish({signal}={}){
      // Backpressure propagates from File.stream() to the destination writer.
      // No giant ArrayBuffer, and the destination is untouched until verified.
      const file=await this.read();
      const destination=await fileHandle.createWritable();
      try{await file.stream().pipeTo(destination,{signal});}
      catch(error){try{await destination.abort();}catch{}throw error;}
      return fileHandle.getFile();
    },
    cleanup
  };
}

// Invoke this as the first action of an actual Save button click, before
// awaiting dynamic imports/preview generation (browser user activation).
export function beginMp4FilePick(filename){
  if(!supportsStreamingSave())throw Error('Browser cannot stream to a local file on this page.');
  return globalThis.showSaveFilePicker({
    suggestedName:filename,
    types:[{description:'MP4 video',accept:{'video/mp4':['.mp4']}}],
    excludeAcceptAllOption:true
  });
}

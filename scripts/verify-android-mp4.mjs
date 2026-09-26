// Independent FFprobe gate. Never confuse Chrome frame fidelity with proof a
// gallery app will decode a saved MP4 on a specific physical Android device.
import {readFile,writeFile} from 'node:fs/promises';
import {execFileSync} from 'node:child_process';
import {inspectAndroidMp4} from '../src/lib/android-mp4.js';

const path=process.argv[2];
if(!path)throw Error('Usage: node scripts/verify-android-mp4.mjs <5s-stream.mp4>');
const bytes=await readFile(path);
const header=await inspectAndroidMp4(new Blob([bytes],{type:'video/mp4'}),{expectedFrames:150});
const raw=execFileSync('ffprobe',[
  '-v','error','-count_frames','-show_entries',
  'format=duration:stream=codec_name,profile,level,pix_fmt,width,height,nb_frames,nb_read_frames,codec_tag_string',
  '-of','json',path
],{encoding:'utf8',maxBuffer:2_000_000,timeout:60000});
const media=JSON.parse(raw);
const streams=(media.streams||[]).filter(s=>s.codec_name==='h264');
if(streams.length!==1)throw Error('Expected one H.264 track; found '+streams.length);
const video=streams[0];
const expected={
  codec_name:'h264',profile:['Baseline','Constrained Baseline'],
  level:31,pix_fmt:'yuv420p',width:640,height:360
};
for(const [key,want] of Object.entries(expected)){
  if(Array.isArray(want)?!want.includes(video[key]):video[key]!==want)
    throw Error('5s Android MP4 '+key+' mismatch. Expected '+JSON.stringify(want)+', got '+JSON.stringify(video[key]));
}
if(+video.nb_read_frames!==150)
  throw Error('FFprobe decoded '+video.nb_read_frames+' frames, expected 150.');
const seconds=Number(media.format?.duration);
if(!Number.isFinite(seconds)||Math.abs(seconds-5)>.065)
  throw Error('Five-second streamed file duration incorrect: '+media.format?.duration);
if(!header.fastStart||header.profile!==66||header.level>31)
  throw Error('MP4 header is not baseline + faststart compatible.');
const report={status:'PASS',path,bytes:bytes.length,fastStart:header.fastStart,
  codec:header.codec,profile:video.profile,level:video.level,
  pixelFormat:video.pix_fmt,duration:seconds,frames:+video.nb_read_frames,
  dimensions:video.width+'x'+video.height,container:'non-fragmented mp4'};
await writeFile('artifacts/android-streaming-codec-report.json',
  JSON.stringify(report,null,2));
console.log('PASS: 5-second OPFS streamed H.264 Baseline 4:2:0 Fast Start MP4, 150 decoded frames, independent FFprobe check '+JSON.stringify(report));

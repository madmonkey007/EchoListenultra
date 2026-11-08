import { Output, Mp4OutputFormat, BufferTarget, CanvasSource, canEncodeVideo, canEncodeAudio, Quality } from 'mediabunny';
import { spectrumAt, mixMono, frameCount } from './spectrum.mjs';
import { render, type Mode } from './render';
import { prepareAudio } from './audio';
export async function capabilities(sampleRate=48000, numberOfChannels=2) {
 return {secureContext:isSecureContext, videoEncoder:typeof VideoEncoder!=='undefined',audioEncoder:typeof AudioEncoder!=='undefined',audioDecoder:typeof AudioDecoder!=='undefined',
  h264:await canEncodeVideo('avc',{width:720,height:1280,frameRate:30,bitrate:4_000_000}),
  aac:await canEncodeAudio('aac',{sampleRate,numberOfChannels,bitrate:192_000}),
  recorderMP4:typeof MediaRecorder!=='undefined'&&MediaRecorder.isTypeSupported('video/mp4;codecs=avc1.42E01E,mp4a.40.2')};
}
export async function exportMp4(buffer:AudioBuffer, mode:Mode, background:ImageBitmap|undefined, progress:(value:number)=>void) {
 const supported=await capabilities(buffer.sampleRate,buffer.numberOfChannels);
 if(!supported.h264||!supported.aac)throw new Error('此浏览器缺少 H.264 或 AAC 编码器，请使用支持 WebCodecs 的 Chrome。未回退为 WebM。');
 const canvas=document.createElement('canvas');canvas.width=720;canvas.height=1280;
 const frames=frameCount(buffer.duration), duration=Math.min(30,buffer.duration);
 const clipped=new AudioBuffer({length:Math.round(duration*buffer.sampleRate),sampleRate:buffer.sampleRate,numberOfChannels:buffer.numberOfChannels});
 for(let c=0;c<buffer.numberOfChannels;c++)clipped.copyToChannel(buffer.getChannelData(c).subarray(0,clipped.length),c);
 const start=performance.now();
 const prepared=await prepareAudio(clipped);
 const mono=mixMono(clipped), target=new BufferTarget();
 const output=new Output({format:new Mp4OutputFormat({fastStart:'in-memory'}),target});
 const video=new CanvasSource(canvas,{codec:'avc',quality:new Quality({bitrate:4_000_000}),keyFrameInterval:2});
 const audio=prepared.source;
 output.addVideoTrack(video,{frameRate:30});output.addAudioTrack(audio);
 try {
  await output.start();
  // Same decoded PCM and timeline for both tracks, independent of playback/wall-clock.
  await prepared.add();
  for(let frame=0;frame<frames;frame++){
   const time=frame/30;
   render(canvas,spectrumAt(mono,buffer.sampleRate,time),buffer.sampleRate,mode,background,time);
   await video.add(time,Math.min(1/30,duration-time));
   if(frame%15===0){progress(frame/frames);await new Promise(resolve=>setTimeout(resolve,0));}
  }
  video.close();await output.finalize();progress(1);
  return {blob:new Blob([target.buffer!],{type:'video/mp4'}),stats:{seconds:(performance.now()-start)/1000,frames,duration,width:720,height:1280,fps:30,mode,aacDelayCorrection:prepared.delay,supported}};
 } catch(error){await output.cancel().catch(()=>{});throw error;}
}

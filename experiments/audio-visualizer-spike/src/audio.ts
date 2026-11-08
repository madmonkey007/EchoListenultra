import {Output,Mp4OutputFormat,NullTarget,AudioBufferSource,EncodedAudioPacketSource,EncodedPacket,Quality} from 'mediabunny';
import {estimateDelay} from './delay.mjs';
type Packet={packet:EncodedPacket;meta:EncodedAudioChunkMetadata|undefined};
async function encode(buffer:AudioBuffer):Promise<Packet[]> {
 const packets:Packet[]=[];
 const output=new Output({format:new Mp4OutputFormat(),target:new NullTarget()});
 const audio=new AudioBufferSource({codec:'aac',quality:new Quality({bitrate:192_000}),onEncodedPacket:(packet,meta)=>packets.push({packet,meta})});
 output.addAudioTrack(audio);
 try{await output.start();await audio.add(buffer);audio.close();await output.finalize();return packets;}
 catch(e){await output.cancel().catch(()=>{});throw e;}
}
const calibration=new Map<string,Promise<{samples:number;correlation:number}>>();
async function measureDelay(sampleRate:number,numberOfChannels:number){
 const key=sampleRate+':'+numberOfChannels;
 if(!calibration.has(key))calibration.set(key,(async()=>{
  const start=2048,pulse=new Float32Array(1024);let seed=12345;
  for(let i=0;i<pulse.length;i++){seed=(Math.imul(seed,1664525)+1013904223)|0;pulse[i]=(seed/2147483648)*.5;}
  const pilot=new AudioBuffer({length:16384,sampleRate,numberOfChannels});
  for(let c=0;c<numberOfChannels;c++)pilot.getChannelData(c).set(pulse,start);
  const packets=await encode(pilot),chunks:{data:Float32Array;start:number}[]=[];let error:DOMException|undefined;
  const config=packets.find(p=>p.meta?.decoderConfig)?.meta?.decoderConfig;
  if(!config||typeof AudioDecoder==='undefined')throw new Error('AAC delay calibration requires AudioDecoder');
  const decoder=new AudioDecoder({output:data=>{
   const samples=new Float32Array(data.numberOfFrames);data.copyTo(samples,{planeIndex:0,format:'f32-planar'});
   chunks.push({data:samples,start:Math.round(data.timestamp*sampleRate/1e6)});data.close();
  },error:e=>{error=e;}});
  try{decoder.configure(config);for(const {packet} of packets)decoder.decode(packet.toEncodedAudioChunk());await decoder.flush();if(error)throw error;}finally{decoder.close();}
  const min=Math.min(0,...chunks.map(c=>c.start)),max=Math.max(...chunks.map(c=>c.start+c.data.length));
  const decoded=new Float32Array(max-min);for(const chunk of chunks)decoded.set(chunk.data,chunk.start-min);
  const delay=estimateDelay(pulse,decoded,start-min);
  return delay;
 })().catch(e=>{calibration.delete(key);throw e;}));
 return calibration.get(key)!;
}
export async function prepareAudio(buffer:AudioBuffer){
 const delay=await measureDelay(buffer.sampleRate,buffer.numberOfChannels);
 const packets=await encode(buffer),source=new EncodedAudioPacketSource('aac');
 return {source,delay,async add(){
  for(const {packet,meta} of packets){
   const timestamp=packet.timestamp-delay.samples/buffer.sampleRate;
   if(timestamp>=buffer.duration)break;
   // Preserve negative priming packets for decoding; MP4 edit list skips them in presentation.
   await source.add(packet.clone({timestamp,duration:Math.min(packet.duration,buffer.duration-timestamp)}),meta);
  }
  source.close();
 }};
}

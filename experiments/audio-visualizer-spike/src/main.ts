import { spectrumAt, mixMono } from './spectrum.mjs';
import { render, templates, type Mode } from './render';
import { capabilities, exportMp4 } from './export';
const el=<T extends HTMLElement>(id:string)=>document.getElementById(id) as T;
const canvas=el<HTMLCanvasElement>('preview'), status=el('status'), diagnostics=el('diagnostics');
const play=el<HTMLButtonElement>('play'), exp=el<HTMLButtonElement>('export'), demo=el<HTMLButtonElement>('demo');
const file=el<HTMLInputElement>('audio'), image=el<HTMLInputElement>('image'), mode=el<HTMLSelectElement>('mode'), download=el<HTMLAnchorElement>('download');
let context:AudioContext, buffer:AudioBuffer|undefined, mono:Float32Array|undefined, source:AudioBufferSourceNode|undefined, background:ImageBitmap|undefined;
let playing=false,started=0,offset=0,busy=false,url:string|undefined,raf=0,loadVersion=0;
for(const template of templates){const option=document.createElement('option');option.value=template.id;option.textContent=template.name;mode.append(option);}
const description=el('template-description');
function describe(){description.textContent=templates.find(t=>t.id===mode.value)!.description;}
describe();
const currentMode=()=>mode.value as Mode;
function report(error:unknown){status.textContent=String(error);console.error(error);}
function stop(){source?.stop();source?.disconnect();source=undefined;playing=false;cancelAnimationFrame(raf);}
function time(){return playing?Math.min(buffer!.duration,context.currentTime-started+offset):offset;}
function draw(){cancelAnimationFrame(raf);if(buffer&&mono)render(canvas,spectrumAt(mono,buffer.sampleRate,time()),buffer.sampleRate,currentMode(),background,time());if(playing)raf=requestAnimationFrame(draw);}
async function load(data:ArrayBuffer){
 stop();offset=0;buffer=undefined;mono=undefined;play.disabled=exp.disabled=true;
 context??=new AudioContext();
 const decoded=await context.decodeAudioData(data);if(decoded.numberOfChannels>2)throw new Error('Spike 仅支持单声道或双声道音频');
 buffer=decoded;mono=mixMono(decoded);loadVersion++;status.textContent=`已加载 ${buffer.duration.toFixed(2)} 秒 · ${buffer.sampleRate} Hz · ${buffer.numberOfChannels} 声道`;
 play.disabled=exp.disabled=false;draw();diagnostics.textContent=JSON.stringify(await capabilities(buffer.sampleRate,buffer.numberOfChannels),null,2);
}
file.onchange=async()=>{try{if(file.files?.[0])await load(await file.files[0].arrayBuffer());}catch(e){report(e);}};
demo.onclick=async()=>{try{await load(await (await fetch('/test-music.wav')).arrayBuffer());}catch(e){report(e);}};
image.onchange=async()=>{try{if(image.files?.[0]){const objectUrl=URL.createObjectURL(image.files[0]);
 try{const img=new Image();img.src=objectUrl;await img.decode();const next=await createImageBitmap(img);background?.close();background=next;draw();status.textContent='背景图片已加载';}
 finally{URL.revokeObjectURL(objectUrl);}}}catch(e){report(e);}};
mode.onchange=()=>{describe();draw();};
play.onclick=async()=>{
 if(!buffer)return;
 if(playing){offset=time();stop();draw();return;}
 await context.resume();if(offset>=buffer.duration)offset=0;
 source=context.createBufferSource();source.buffer=buffer;source.connect(context.destination);started=context.currentTime;playing=true;
 source.onended=()=>{if(playing&&time()>=buffer!.duration-.05){playing=false;offset=0;draw();}};
 source.start(0,offset);draw();
};
async function runExport(){
 if(!buffer||busy)throw new Error('Load audio and wait for the current export');
 busy=true;stop();const controls=[file,image,mode,demo,play,exp];controls.forEach(x=>x.disabled=true);
 if(url){URL.revokeObjectURL(url);url=undefined;}download.hidden=true;
 try{
  const result=await exportMp4(buffer,currentMode(),background,p=>status.textContent=`导出中 ${Math.round(p*100)}%`);
  url=URL.createObjectURL(result.blob);download.href=url;download.download=`visualizer-${currentMode()}.mp4`;download.hidden=false;
  status.textContent=`导出完成 · ${result.stats.seconds.toFixed(2)} 秒 · ${(result.blob.size/1e6).toFixed(2)} MB`;
  diagnostics.textContent=JSON.stringify(result.stats,null,2);return {...result.stats,bytes:result.blob.size,url};
 }finally{busy=false;controls.forEach(x=>x.disabled=false);draw();}
}
exp.onclick=()=>runExport().catch(report);
// Small diagnostic surface for repeatable spike verification; exports still use the real UI pipeline.
Object.assign(window,{spike:{export:runExport,capabilities,get loadVersion(){return loadVersion;},get playing(){return playing;},get duration(){return buffer?.duration;},get spectrum(){return buffer&&mono?Array.from(spectrumAt(mono,buffer.sampleRate,time())):[];}}});
render(canvas,new Float32Array(1024),48000,'bars');

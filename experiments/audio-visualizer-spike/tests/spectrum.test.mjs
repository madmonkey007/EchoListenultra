import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spectrumAt, frameCount } from '../src/spectrum.mjs';
test('silence produces zero energy',()=>assert.ok(spectrumAt(new Float32Array(4096),48000,0).every(x=>x===0)));
test('FFT resolves actual input pitch and time',()=>{
 const sr=48000, pcm=Float32Array.from({length:sr*2},(_,i)=> i<sr ? Math.sin(2*Math.PI*440*i/sr):Math.sin(2*Math.PI*2000*i/sr));
 const peak=t=>{const a=spectrumAt(pcm,sr,t);return a.indexOf(Math.max(...a))*sr/2048};
 assert.ok(Math.abs(peak(.5)-440)<30);assert.ok(Math.abs(peak(1.5)-2000)<30);
});
test('export is bounded and covers exactly 900 frames at 30fps',()=>{assert.equal(frameCount(32),900);assert.equal(frameCount(30),900);assert.equal(frameCount(1),30);assert.throws(()=>frameCount(0));});

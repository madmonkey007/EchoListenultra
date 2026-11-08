import {test} from 'node:test';import assert from 'node:assert/strict';import {estimateDelay} from '../src/delay.mjs';
const signal=Float32Array.from({length:1024},(_,i)=>Math.sin(i*i*.123)*.5);
test('measure AAC delay without hardcoded OS constants',()=>{for(const lag of [0,1024,2112]){const decoded=new Float32Array(8192);decoded.set(signal,2048+lag);assert.equal(estimateDelay(signal,decoded,2048).samples,lag);}});
test('reject calibration without a matching pulse',()=>assert.throws(()=>estimateDelay(signal,new Float32Array(8192),2048),/calibration/i));

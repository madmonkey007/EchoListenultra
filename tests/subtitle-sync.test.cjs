const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,filename);
const timing = () => require('../lib/subtitle-timing.ts');
const segment = {id:'timed',startTime:10,endTime:15,text:'I understand.', words:[{word:'I',start:10.2,end:10.4},{word:'understand.',start:12,end:14}]};

test('highlight uses actual speech timing rather than word lengths', () => {
 const { getActiveWordIndex } = timing();
 assert.equal(getActiveWordIndex(segment.words,10.3),0);
 assert.equal(getActiveWordIndex(segment.words,12.1),1);
});
test('no word is highlighted during silence or after the last spoken word', () => {
 const { getActiveWordIndex } = timing();
 for(const time of [9,10,10.6,11.9,14,14.8,16]) assert.equal(getActiveWordIndex(segment.words,time),-1,`time ${time}`);
});
test('switching playback speed cannot change the word at the same audio time', () => {
 const { getActiveWordIndex } = timing();
 for(const speed of [.5,1,1.25,2]) {
  const audioTime=12.3; // Media currentTime already advances at the selected playbackRate.
  assert.equal(getActiveWordIndex(segment.words,audioTime),1,`${speed}x`);
 }
});
test('seek backwards and exact word boundaries immediately choose correct word', () => {
 const { getActiveWordIndex } = timing();
 assert.equal(getActiveWordIndex(segment.words,13),1);
 assert.equal(getActiveWordIndex(segment.words,10.2),0);
 assert.equal(getActiveWordIndex([{word:'a',start:0,end:1},{word:'b',start:1,end:2}],1),1);
});
test('legacy transcript without word timestamps never invents karaoke timing', () => {
 const { getSynchronizedWords,getActiveWordIndex } = timing();
 assert.equal(getSynchronizedWords({...segment,words:undefined}),null);
 assert.equal(getActiveWordIndex([],12),-1);
});
test('invalid, incomplete, mismatched and overlapping timings fall back safely', () => {
 const { getSynchronizedWords } = timing();
 const invalid = [[],[segment.words[0]], [{word:'wrong',start:10.2,end:10.4},segment.words[1]], [{word:'I',start:NaN,end:10.4},segment.words[1]], [{word:'I',start:9,end:10.4},segment.words[1]], [{word:'I',start:10.2,end:13},segment.words[1]], [{word:'I',start:10.4,end:10.2},segment.words[1]], [segment.words[0],{word:'understand.',start:12,end:16}]];
 for(const words of invalid) assert.equal(getSynchronizedWords({...segment,words}),null);
 assert.deepEqual(getSynchronizedWords(segment),segment.words);
});
test('captions use recorded segment timing, including silence and source gaps', () => {
 const { getActiveSegmentIndex } = timing();
 const segments=[{startTime:0,endTime:1},{startTime:2,endTime:3}];
 assert.equal(getActiveSegmentIndex(segments,.5),0);
 assert.equal(getActiveSegmentIndex(segments,1.5),-1);
 assert.equal(getActiveSegmentIndex(segments,2),1);
 assert.equal(getActiveSegmentIndex(segments,3),-1);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
const { groupDeepgramWords, sanitizeSegments, transcribeAudio } = require('../services/transcription.ts');
const words = [
  { word: 'hello', punctuated_word: 'Hello,', start: 2, end: 2.2, speaker: 0 },
  { word: 'there', punctuated_word: 'there.', start: 3, end: 3.4, speaker: 0 },
  { word: 'yes', punctuated_word: 'Yes!', start: 8, end: 8.7, speaker: 1 },
];
test('speaker splitting preserves absolute word times, punctuation and final word', () => {
  const result = groupDeepgramWords(words, 'TURNS', 1, 10);
  assert.deepEqual(result.map(s => s.text), ['Hello, there.', 'Yes!']);
  assert.deepEqual(result[0].words, [{ word: 'Hello,', start: 2, end: 2.2 }, { word: 'there.', start: 3, end: 3.4 }]);
  assert.equal(result[1].words[0].start, 8);
  assert.equal(result[1].speaker, 2);
});
test('duration boundary starts a new segment before adding boundary word', () => {
  const result = groupDeepgramWords([...words.slice(0, 2), { word: 'last', start: 62, end: 63 }], 'DURATION', 1, 70);
  assert.deepEqual(result.map(s => s.text), ['Hello, there.', 'last']);
  assert.equal(result[1].words[0].end, 63);
});
test('invalid, partial or mismatched timing never becomes fabricated word timing', () => {
  for (const timing of [[{ word: 'wrong', start: 1, end: 2 }], [{ word: 'hi', start: NaN, end: 2 }], [{ word: 'hi', start: 2, end: 1 }]]) {
    assert.equal(sanitizeSegments([{ text: 'hi', startTime: 0, endTime: 3, words: timing }], 5)[0].words, undefined);
  }
  assert.equal(sanitizeSegments([{ text: 'hi', startTime: 0, endTime: 3 }], 5)[0].words, undefined);
});
test('segments are bounded and sorted; overlapping segments and word times are rejected', () => {
  const result = sanitizeSegments([{ text: 'later', startTime: 4, endTime: 9 }, { text: 'first', startTime: -1, endTime: 2 }, { text: 'overlap', startTime: 1, endTime: 3 }], 6);
  assert.deepEqual(result.map(s => [s.startTime, s.endTime]), [[0, 2], [4, 6]]);
  const [segment] = sanitizeSegments([{ text: 'one two', startTime: 0, endTime: 5, words: [{ word: 'one', start: 1, end: 3 }, { word: 'two', start: 2, end: 4 }] }], 5);
  assert.equal(segment.words, undefined);
});
test('missing key rejects before making any request', async () => {
  await assert.rejects(transcribeAudio(new Blob(['audio']), { provider: 'deepgram', deepgramApiKey: '' }, 'TURNS', 1, 10), /API key/);
});
test('Deepgram service persists provider timing through the actual response mapping', async () => {
  const original = global.fetch;
  let request;
  global.fetch = async (url, options) => {
    request = { url: String(url), options };
    return { ok: true, json: async () => ({ results: { channels: [{ alternatives: [{ words }] }] } }) };
  };
  try {
    const result = await transcribeAudio(new Blob(['test']), { provider: 'deepgram', deepgramApiKey: 'test-key', deepgramLanguage: 'en' }, 'TURNS', 1, 10);
    assert.equal(result[1].words[0].start, 8);
    assert.match(request.url, /model=nova-3/);
    assert.equal(request.options.headers.Authorization, 'Token test-key');
    assert.ok(request.options.signal instanceof AbortSignal);
  } finally { global.fetch = original; }
});
test('provider HTTP errors do not silently replace an existing transcript', async () => {
  const original = global.fetch;
  global.fetch = async () => ({ ok: false, status: 401 });
  try {
    await assert.rejects(transcribeAudio(new Blob(['test']), { provider: 'deepgram', deepgramApiKey: 'test-key' }, 'TURNS', 1, 10), /HTTP 401/);
  } finally { global.fetch = original; }
});

test('sentence splitting uses punctuation and preserves exact word timestamps', () => {
 const input=[{word:'Hello.',start:0,end:.5,speaker:0},{word:'Are',start:1,end:1.3,speaker:0},{word:'you',start:1.3,end:1.5,speaker:0},{word:'ready?',start:1.5,end:2,speaker:0},{word:'Yes!',start:3,end:3.4,speaker:0},{word:'Last',start:4,end:4.4,speaker:0},{word:'phrase',start:4.5,end:5,speaker:0}];
 const result=groupDeepgramWords(input,'SENTENCE',1,6);
 assert.deepEqual(result.map(s=>s.text),['Hello.','Are you ready?','Yes!','Last phrase']);
 assert.equal(result[1].words[0].start,1);
 assert.equal(result.at(-1).words.at(-1).end,5);
});
test('sentence groups support two or three sentences with a final incomplete group', () => {
 const input=['One.','Two!','Three?','Four.','Five.'].map((word,i)=>({word,start:i,end:i+.8,speaker:0}));
 assert.deepEqual(groupDeepgramWords(input,'SENTENCE',2,6).map(s=>s.text),['One. Two!','Three? Four.','Five.']);
 assert.deepEqual(groupDeepgramWords(input,'SENTENCE',3,6).map(s=>s.text),['One. Two! Three?','Four. Five.']);
});
test('abbreviations, decimals and closing quotes do not damage sentence boundaries', () => {
 const tokens=['Dr.','Smith','paid','3.14','dollars.','He','said,','“Great!”','Then','left.'];
 const input=tokens.map((word,i)=>({word,start:i,end:i+.8,speaker:0}));
 assert.deepEqual(groupDeepgramWords(input,'SENTENCE',1,11).map(s=>s.text),['Dr. Smith paid 3.14 dollars.','He said, “Great!”','Then left.']);
});
test('Chinese sentence punctuation can end a sentence', () => {
 const input=['你好。','真的？','好！'].map((word,i)=>({word,start:i,end:i+.7,speaker:0}));
 assert.equal(groupDeepgramWords(input,'SENTENCE',1,4).length,3);
});

test('Gemini sentence-level segments group without inventing missing word times', () => {
 const { groupSentenceSegments }=require('../services/transcription.ts');
 const input=[{startTime:0,endTime:1,text:'Hello.'},{startTime:2,endTime:3,text:'Ready?'},{startTime:4,endTime:5,text:'Yes.'}];
 const result=groupSentenceSegments(input,2,6);
 assert.deepEqual(result.map(s=>[s.text,s.startTime,s.endTime]),[['Hello. Ready?',0,3],['Yes.',4,5]]);
 assert.equal(result[0].words,undefined);
 assert.throws(()=>groupSentenceSegments([{startTime:0,endTime:3,text:'Hello. Ready?'}],1,4),/sentence-level timestamps/);
});
test('invalid sentence counts reject before a paid request', async () => {
 for(const count of [0,4,1.5]) await assert.rejects(transcribeAudio(new Blob(['test']),{provider:'deepgram',deepgramApiKey:'test-key'},'SENTENCE',count,10));
});

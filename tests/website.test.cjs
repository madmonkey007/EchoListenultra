const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for (const extension of ['.tsx', '.ts']) require.extensions[extension] = (module, filename) => {
  const source = ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText;
  module._compile(source, filename);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
function render(Component, props = {}) { return renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(Component, props))); }

test('public homepage offers import, real demo and explanatory help without sign-in', () => {
  const Landing = require('../views/LandingView.tsx').default;
  const html = render(Landing);
  assert.match(html, /href="\/add"/);
  assert.match(html, /href="\/player\/sample-1"/);
  assert.match(html, /No sign-up/);
  assert.match(html, /<h1/);
  assert.match(html, /\/demo\/sample.wav/);
});
test('help states local data limits and provider upload before using AI', () => {
  const html = render(require('../views/HelpView.tsx').default);
  assert.match(html, /clearing.*browser/i);
  assert.match(html, /sent.*provider/i);
  assert.match(html, /without.*key/i);
});
test('library reflects real sessions and provides an import empty state', () => {
  const html = render(require('../views/HomeView.tsx').default, { sessions: [], savedWordCount: 0 });
  assert.match(html, /href="\/add"/);
  assert.doesNotMatch(html, /6\.8|245/);
  assert.match(html, /No audio yet/i);
});
test('sample migration preserves uploaded data and upgrades only known built-in example', () => {
  const { restoreSessions, SAMPLE_SESSION } = require('../data/sample.ts');
  const imported = { id: 'my-audio', title: 'Private lesson', segments: [], duration: 15 };
  const result = restoreSessions(JSON.stringify([imported, { id: 'sample-1', title: 'Old example' }]));
  assert.deepEqual(result[0], imported);
  assert.deepEqual(result[1], SAMPLE_SESSION);
  assert.deepEqual(restoreSessions('[]'), [SAMPLE_SESSION]);
  assert.deepEqual(restoreSessions('{bad'), [SAMPLE_SESSION]);
});
test('bundled example is a real WAV covering every ordered transcript segment', () => {
  const { SAMPLE_SESSION } = require('../data/sample.ts');
  const wav = fs.readFileSync('public' + SAMPLE_SESSION.audioUrl);
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
  assert.ok(wav.length > 100000);
  let previousEnd = 0;
  for (const segment of SAMPLE_SESSION.segments) {
    assert.ok(segment.startTime >= previousEnd);
    assert.ok(segment.endTime > segment.startTime);
    previousEnd = segment.endTime;
  }
  assert.ok(SAMPLE_SESSION.duration >= previousEnd);
});

test('import defaults to sentence mode with transcription and offers only 1, 2, 3 sentences', () => {
 const Add=require('../views/AddSessionView.tsx').default;
 const html=render(Add,{onAdd:()=>{},apiConfig:{provider:'deepgram',deepgramApiKey:'test-only'},isOnline:true});
 assert.match(html,/aria-pressed="true"[^>]*>By sentence/);
 for(const n of [1,2,3])assert.match(html,new RegExp(`>${n} ${n===1?'sentence':'sentences'}<`));
 assert.doesNotMatch(html,/>4 sentences</);
});
test('without a transcription key, import defaults to time and sentence mode explains its requirement', () => {
 const Add=require('../views/AddSessionView.tsx').default;
 const html=render(Add,{onAdd:()=>{},apiConfig:{provider:'deepgram',deepgramApiKey:''},isOnline:true});
 assert.match(html,/disabled=""[^>]*aria-pressed="false"[^>]*>By sentence/);
 assert.match(html,/Sentence splitting requires transcription/);
 assert.match(html,/aria-pressed="true"[^>]*>By Time/);
});

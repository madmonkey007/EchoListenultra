const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { needsFallbackConsent, transcriptionFailureMessage, fallbackSeconds } = require('../lib/import-outcome.ts');
test('only local time mode or explicit consent may save without transcript', () => {
  assert.equal(needsFallbackConsent(false, 'DURATION', false), false);
  assert.equal(needsFallbackConsent(false, 'TURNS', false), true);
  assert.equal(needsFallbackConsent(true, 'DURATION', false), true);
  assert.equal(needsFallbackConsent(true, 'SENTENCE', true), false);
});
test('fallback lengths match the choice shown to the user', () => {
  assert.equal(fallbackSeconds('DURATION', 4), 240);
  assert.equal(fallbackSeconds('TURNS', 4), 30);
  assert.equal(fallbackSeconds('SENTENCE', 3), 30);
});
test('provider failures map to actionable copy without exposing raw secrets', () => {
  for (const [raw, expected] of [['HTTP 401 secret', /key/], ['HTTP 403 secret', /key/], ['HTTP 429 secret', /quota/], ['timed out secret', /shorter/], ['No usable speech secret', /speech/], ['Failed to fetch https://secret', /connection/], ['Deepgram transcription failed (HTTP 500) secret', /could not/], ['arbitrary secret', /could not/]]) {
    const message = transcriptionFailureMessage(new Error(raw));
    assert.match(message, expected);
    assert.ok(!message.includes('secret'));
  }
});

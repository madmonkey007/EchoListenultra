const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const handler = require('../api/events.ts').default;
const { trackEvent } = require('../lib/analytics.ts');
const valid = { event: 'sample_play', version: '0.1.0' };
async function request(raw, overrides = {}) {
  const req = Readable.from([raw]);
  req.method = overrides.method || 'POST';
  req.socket = {};
  req.headers = { host: 'example.test', 'content-type': 'application/json', ...overrides.headers };
  if ('body' in overrides) req.body = overrides.body;
  const res = { statusCode: 0, headers: {}, setHeader(key, value) { this.headers[key] = value; }, end() {} };
  const logs = [];
  const original = console.info;
  console.info = value => logs.push(value);
  try { await handler(req, res); } finally { console.info = original; }
  return { ...res, logs };
}
test('actual endpoint accepts only bounded valid events and logs only validated payload', async () => {
  for (const event of ['sample_play', 'audio_selected', 'import_complete', 'playback_started', 'transcription_failed', 'feedback_opened']) {
    const payload = { ...valid, event };
    const result = await request(JSON.stringify(payload));
    assert.equal(result.statusCode, 204);
    assert.deepEqual(result.logs, [JSON.stringify(payload)]);
    assert.equal(result.headers['Cache-Control'], 'no-store');
  }
  const invalid = [null, [], {}, { ...valid, email: 'secret@example.test' }, { ...valid, event: 'unknown' }, { ...valid, version: 'wrong' }, { event: { secret: 'API_KEY' }, version: '0.1.0' }];
  for (const payload of invalid) {
    const result = await request(JSON.stringify(payload));
    assert.equal(result.statusCode, 400);
    assert.deepEqual(result.logs, []);
  }
  for (const raw of ['invalid JSON secret', ' '.repeat(513)]) {
    const result = await request(raw);
    assert.ok([400, 413].includes(result.statusCode));
    assert.deepEqual(result.logs, []);
  }
});
test('method, media type, declared size and browser origin are enforced before logging', async () => {
  for (const [overrides, expected] of [
    [{ method: 'GET' }, 405],
    [{ headers: { 'content-type': 'text/plain' } }, 415],
    [{ headers: { 'content-length': '513' } }, 413],
    [{ headers: { origin: 'https://elsewhere.test' } }, 403],
    [{ headers: { origin: 'https://example.test' } }, 403],
    [{ headers: { origin: 'null' } }, 403],
  ]) {
    const result = await request(JSON.stringify(valid), overrides);
    assert.equal(result.statusCode, expected);
    assert.deepEqual(result.logs, []);
  }
  assert.equal((await request(JSON.stringify(valid), { headers: { origin: 'http://example.test' } })).statusCode, 204);
  assert.equal((await request(JSON.stringify(valid), { headers: { origin: 'https://example.test', 'x-forwarded-proto': 'https' } })).statusCode, 204);
  assert.equal((await request('', { body: valid })).statusCode, 204);
  assert.equal((await request('', { body: { ...valid, secret: 'hidden' } })).statusCode, 400);
});
test('client sends minimal same-origin payload and tolerates failures without network', async () => {
  const previousWindow = global.window;
  const previousFetch = global.fetch;
  const calls = [];
  global.window = {};
  global.fetch = (url, options) => { calls.push({ url, options }); return Promise.reject(new Error('offline')); };
  try {
    assert.doesNotThrow(() => trackEvent('sample_play'));
    trackEvent('private_file_name');
    await Promise.resolve();
    assert.equal(calls.length, 1);
    assert.equal(calls[0].url, '/api/events');
    assert.deepEqual(JSON.parse(calls[0].options.body), valid);
    assert.equal(calls[0].options.credentials, 'omit');
    global.fetch = () => { throw new Error('disabled'); };
    assert.doesNotThrow(() => trackEvent('sample_play'));
  } finally { global.window = previousWindow; global.fetch = previousFetch; }
});

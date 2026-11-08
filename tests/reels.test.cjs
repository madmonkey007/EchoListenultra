const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
require.extensions['.ts'] = (m, f) => m._compile(ts.transpileModule(fs.readFileSync(f, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText, f);
const { normalizeReelUrl, createReelExtractor, extractReel, LocalYtDlp, RemoteFetcher, PROBE_ERROR_MAP, ReelError } = require('../lib/reels/index.ts');
const audio = { audioPath: '/tmp/audio.wav', audioSeconds: 180, title: 'Title', author: 'Author' };
test('accepts only Instagram media routes and removes all tracking and fragments', () => {
  for (const host of ['instagram.com', 'www.instagram.com', 'm.instagram.com']) {
    for (const route of ['reel', 'reels', 'p']) {
      assert.equal(normalizeReelUrl(`https://${host}/${route}/Ab_12-/?igsh=secret&utm_source=x#fragment`), `https://www.instagram.com/${route}/Ab_12-/`);
    }
  }
  for (const url of ['', null, 42, 'https://instagram.com/reel/', 'https://instagram.com/p', 'https://instagram.com/stories/abc/', 'https://instagram.com/reel/abc/extra', 'https://evil.com/reel/abc', 'https://instagram.com.evil.com/reel/abc', 'https://evil.instagram.com/reel/abc', 'http://instagram.com/reel/abc', 'https://user:pass@instagram.com/reel/abc', 'https://instagram.com:8080/reel/abc', 'https://instagram.com/reel/a%20b', 'https://instagram.com/reel/a\\b', 'https://instagram.com/reel/../p/abc']) {
    assert.equal(normalizeReelUrl(url), null, String(url));
  }
});
test('rejects bad URLs before calling fetcher; passes normalized URL', async () => {
  const seen = [];
  const extract = createReelExtractor({ fetch: async url => { seen.push(url); return audio; } }, {});
  assert.equal((await extract('https://evil.com/reel/a')).code, 'private_or_unavailable');
  assert.deepEqual(seen, []);
  assert.deepEqual(await extract('https://instagram.com/p/abc?igsh=x'), { ok: true, ...audio });
  assert.deepEqual(seen, ['https://www.instagram.com/p/abc/']);
});
test('duration limit defaults to 180, reads environment and allows exact boundary', async () => {
  const env = {};
  let seconds = 180;
  const extract = createReelExtractor({ fetch: async () => ({ ...audio, audioSeconds: seconds }) }, env);
  assert.equal((await extract('https://instagram.com/reel/a')).ok, true);
  seconds = 180.01;
  assert.equal((await extract('https://instagram.com/reel/a')).code, 'too_long');
  env.MAX_AUDIO_SECONDS = '200';
  assert.equal((await extract('https://instagram.com/reel/a')).ok, true);
  for (const value of ['0', '-1', 'NaN', 'Infinity', '', 'bad']) {
    env.MAX_AUDIO_SECONDS = value;
    assert.equal((await extract('https://instagram.com/reel/a')).code, 'internal_error');
  }
});
test('missing audio and invalid durations cannot produce success', async () => {
  for (const value of [{ ...audio, audioPath: '' }, ...[0, -1, NaN, Infinity].map(audioSeconds => ({ ...audio, audioSeconds }))]) {
    const extract = createReelExtractor({ fetch: async () => value }, {});
    assert.equal((await extract('https://instagram.com/reel/a')).code, 'no_audio');
  }
});
test('probe categories map to exactly the public taxonomy', async () => {
  assert.deepEqual(PROBE_ERROR_MAP, { private_or_unavailable: 'private_or_unavailable', login_required_or_ratelimit: 'fetch_blocked', geo_blocked: 'fetch_blocked', no_audio: 'no_audio', timeout: 'fetch_blocked', ffmpeg_error: 'internal_error', other: 'internal_error' });
  for (const [category, code] of Object.entries(PROBE_ERROR_MAP)) {
    const extract = createReelExtractor({ fetch: async () => { throw { category }; } }, {});
    const result = await extract('https://instagram.com/reel/a');
    assert.equal(result.ok, false);
    assert.equal(result.code, code);
    assert.equal(typeof result.detail, 'string');
  }
  for (const error of [new Error('unexpected'), { code: 'not_implemented' }, null]) {
    assert.equal((await createReelExtractor({ fetch: async () => { throw error; } }, {})('https://instagram.com/reel/a')).code, 'internal_error');
  }
});
test('both configured fetchers are stubs and no implementation error escapes', async () => {
  for (const Fetcher of [LocalYtDlp, RemoteFetcher]) await assert.rejects(new Fetcher().fetch('https://www.instagram.com/reel/a/'), /not_implemented/);
  const previous = process.env.REELS_FETCHER;
  try {
    for (const name of ['local', 'remote', 'unknown']) {
      process.env.REELS_FETCHER = name;
      assert.equal((await extractReel('https://instagram.com/reel/a')).code, 'internal_error');
      assert.equal((await extractReel('bad')).code, 'private_or_unavailable');
    }
  } finally {
    if (previous === undefined) delete process.env.REELS_FETCHER;
    else process.env.REELS_FETCHER = previous;
  }
});

test('typed adapter failures preserve all six public codes', async () => {
  for (const code of ['private_or_unavailable', 'fetch_blocked', 'no_audio', 'too_long', 'quota_exceeded', 'internal_error']) {
    const extract = createReelExtractor({ fetch: async () => { throw new ReelError(code, 'Known failure'); } }, {});
    assert.deepEqual(await extract('https://instagram.com/reel/a'), { ok: false, code, detail: 'Known failure' });
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { importVideoAudio } from '../lib/video-client.ts';

test('video import polls then returns a bounded MP3 file', async () => {
  const original = globalThis.fetch; const calls: string[] = [];
  globalThis.fetch = async (input) => {
    calls.push(String(input));
    if (calls.length === 1) return Response.json({ id: 'a'.repeat(32), status: 'queued' });
    if (calls.length === 2) return Response.json({ id: 'a'.repeat(32), status: 'ready', title: 'Lesson / one' });
    return new Response(new Uint8Array([73,68,51]), { headers: { 'Content-Type': 'audio/mpeg' } });
  };
  try {
    const file = await importVideoAudio('https://youtu.be/abcdefghijk', new AbortController().signal, () => {}, 0);
    assert.equal(file.type, 'audio/mpeg'); assert.equal(file.name, 'Lesson _ one.mp3');
    assert.equal(calls.length, 3); assert.match(calls[2], /audio=1/);
  } finally { globalThis.fetch = original; }
});

test('unavailable worker reports the server recovery message', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ error: 'Video imports are not configured yet.' }, { status: 503 });
  try { await assert.rejects(importVideoAudio('https://youtu.be/abcdefghijk', new AbortController().signal, () => {}, 0), /not configured/); }
  finally { globalThis.fetch = original; }
});

test('malformed or changed job IDs never get polled', async () => {
  const original = globalThis.fetch;
  globalThis.fetch = async () => Response.json({ id: '../private', status: 'ready' });
  try { await assert.rejects(importVideoAudio('https://youtu.be/abcdefghijk', new AbortController().signal, () => {}, 0), /invalid response/i); }
  finally { globalThis.fetch = original; }
});

test('cancelled imports stop before submitting', async () => {
  const controller = new AbortController(); controller.abort();
  await assert.rejects(importVideoAudio('https://youtu.be/abcdefghijk', controller.signal, () => {}, 0), { name: 'AbortError' });
});

test('audio larger than cap is rejected without selecting a file', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => ++calls === 1 ? Response.json({id:'a'.repeat(32),status:'ready'}) : new Response(new Uint8Array(4 * 1024 * 1024 + 1), {headers:{'Content-Type':'audio/mpeg'}});
  try { await assert.rejects(importVideoAudio('https://youtu.be/abcdefghijk', new AbortController().signal, () => {}, 0), /exceeds/); }
  finally { globalThis.fetch = original; }
});

test('worker failure is shown without downloading audio', async () => {
  const original = globalThis.fetch; let calls = 0;
  globalThis.fetch = async () => { calls++; return Response.json({id:'a'.repeat(32),status:'failed',error:'Video is unavailable.'}); };
  try { await assert.rejects(importVideoAudio('https://youtu.be/abcdefghijk', new AbortController().signal, () => {}, 0), /unavailable/); assert.equal(calls, 1); }
  finally { globalThis.fetch = original; }
});

import type { IncomingMessage, ServerResponse } from 'node:http';
import { normalizeVideoUrl } from '../lib/video-url';
import { networkIdentity } from '../lib/server/quota';

const MAX_AUDIO = 4 * 1024 * 1024;
function workerConfig(): { url: string; secret: string } | null {
  try {
    const url = new URL(process.env.VIDEO_IMPORT_WORKER_URL || '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const secret = process.env.VIDEO_IMPORT_WORKER_SECRET || '';
    if ((url.protocol !== 'https:' && !(local && url.protocol === 'http:')) || url.username || url.password || url.search || url.hash || secret.length < 32) return null;
    return { url: url.href.replace(/\/$/, ''), secret };
  } catch { return null; }
}
export default async function videoImport(req: IncomingMessage & { body?: unknown }, res: ServerResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  const send = (status: number, body: object) => { res.statusCode = status; res.setHeader('Content-Type', 'application/json'); res.end(JSON.stringify(body)); };
  if (req.method !== 'POST' && req.method !== 'GET') { res.setHeader('Allow', 'GET, POST'); send(405, { error: 'method_not_allowed' }); return; }
  const protocol = process.env.VERCEL === '1' || ('encrypted' in req.socket && req.socket.encrypted) ? 'https' : 'http';
  if (req.headers.origin && req.headers.origin !== `${protocol}://${req.headers.host}`) { send(403, { error: 'origin_not_allowed' }); return; }
  if (req.headers['sec-fetch-site'] === 'cross-site') { send(403, { error: 'origin_not_allowed' }); return; }
  const config = workerConfig();
  if (!config) { send(503, { error: 'video_import_not_configured', message: 'Video link import is not connected yet. You can still upload an audio file.' }); return; }
  const client = networkIdentity(req, config.secret);
  if (!client) { send(503, { error: 'network_identity_unavailable' }); return; }
  const query = new URL(req.url || '/', 'http://localhost').searchParams;
  const id = query.get('id');
  const audio = req.method === 'GET' && query.get('audio') === '1';
  let body: string | undefined;
  if (req.method === 'POST') {
    if (!/^application\/json(?:;|$)/i.test(String(req.headers['content-type'] || ''))) { send(415, { error: 'json_required' }); return; }
    try {
      const length = req.headers['content-length'];
      if (length && (!/^\d+$/.test(String(length)) || Number(length) > 4096)) { send(413, { error: 'request_too_large' }); return; }
      let size = 0; const chunks: Buffer[] = [];
      if (req.body !== undefined) {
        const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
        if (Buffer.byteLength(raw) > 4096) { send(413, { error: 'request_too_large' }); return; }
        chunks.push(Buffer.from(raw));
      } else {
      for await (const chunk of req) { const bytes = Buffer.from(chunk); size += bytes.length; if (size > 4096) { send(413, { error: 'request_too_large' }); return; } chunks.push(bytes); }
      }
      const input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      const url = normalizeVideoUrl(input?.url);
      if (!url) { send(400, { error: 'unsupported_video_url', message: 'Use a public HTTPS YouTube or TikTok video link.' }); return; }
      body = JSON.stringify({ url });
    } catch { send(400, { error: 'invalid_json' }); return; }
  } else if (!id || !/^[a-f0-9]{32}$/.test(id)) { send(400, { error: 'invalid_job_id' }); return; }
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), audio ? 20000 : 10000);
  try {
    const response = await fetch(`${config.url}/imports${req.method === 'GET' ? `/${id}${audio ? '/audio' : ''}` : ''}`, {
      method: req.method, headers: { Authorization: `Bearer ${config.secret}`, 'X-Echo-Client': client, ...(body ? { 'Content-Type': 'application/json' } : {}) }, body, signal: controller.signal, redirect: 'error',
    });
    if (audio && response.ok) {
      if (!response.body || Number(response.headers.get('content-length')) > MAX_AUDIO || !/^audio\/mpeg(?:;|$)/i.test(response.headers.get('content-type') || '')) { await response.body?.cancel().catch(() => {}); send(502, { error: 'invalid_worker_audio' }); return; }
      // Buffer only the bounded MP3 so a bad upstream cannot send a partial oversized success.
      const reader = response.body.getReader(); const chunks: Uint8Array[] = []; let size = 0;
      while (true) { const { done, value } = await reader.read(); if (done) break; size += value.byteLength; if (size > MAX_AUDIO) { await reader.cancel(); send(502, { error: 'audio_too_large' }); return; } chunks.push(value); }
      if (!size) { send(502, { error: 'invalid_worker_audio' }); return; }
      res.statusCode = 200; res.setHeader('Content-Type', 'audio/mpeg'); res.setHeader('Content-Length', size); res.setHeader('Content-Disposition', 'attachment; filename="video-audio.mp3"'); res.end(Buffer.concat(chunks)); return;
    }
    if (!response.body) throw new Error('invalid_worker_response');
    const jsonReader = response.body.getReader(); const jsonChunks: Uint8Array[] = []; let jsonSize = 0;
    while (true) { const { done, value } = await jsonReader.read(); if (done) break; jsonSize += value.byteLength; if (jsonSize > 16384) { await jsonReader.cancel(); throw new Error('invalid_worker_response'); } jsonChunks.push(value); }
    const data = JSON.parse(Buffer.concat(jsonChunks).toString('utf8'));
    if (!response.ok) { const status = [400, 404, 409, 413, 422, 429, 503].includes(response.status) ? response.status : 502; send(status, { error: typeof data.error === 'string' ? data.error.slice(0, 80) : 'video_import_failed', message: 'Video import could not finish. Try another public video or upload a file.' }); return; }
    if (!/^[a-f0-9]{32}$/.test(data.id) || (req.method === 'GET' && data.id !== id) || !['queued', 'processing', 'ready', 'failed'].includes(data.status)) throw new Error('invalid_worker_response');
    send(200, { id: data.id, status: data.status, title: typeof data.title === 'string' ? data.title.slice(0, 300) : '', ...(data.status === 'failed' ? { error: typeof data.error === 'string' ? data.error.slice(0, 80) : 'video_import_failed' } : {}) });
  } catch { send(502, { error: 'video_worker_unavailable', message: 'Video import is temporarily unavailable. Please try again.' }); }
  finally { clearTimeout(timer); }
}

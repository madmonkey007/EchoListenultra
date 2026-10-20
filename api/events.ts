import type { IncomingMessage, ServerResponse } from 'node:http';
import { MAX_EVENT_BYTES, validateEvent } from '../lib/event-validation';

type EventRequest = IncomingMessage & { body?: unknown };
function sameOrigin(req: IncomingMessage): boolean {
  const origin = req.headers.origin;
  if (origin === undefined) return true;
  if (typeof origin !== 'string' || !req.headers.host) return false;
  try {
    const parsed = new URL(origin);
    const forwardedProtocol = req.headers['x-forwarded-proto'];
    const protocol = typeof forwardedProtocol === 'string' ? forwardedProtocol : ('encrypted' in req.socket && req.socket.encrypted ? 'https' : 'http');
    return parsed.origin === origin && origin === `${protocol}://${req.headers.host}`;
  } catch { return false; }
}

export default async function events(req: EventRequest, res: ServerResponse): Promise<void> {
  res.setHeader('Cache-Control', 'no-store');
  const finish = (status: number) => { res.statusCode = status; res.end(); };
  if (req.method !== 'POST') { res.setHeader('Allow', 'POST'); finish(405); return; }
  if (!sameOrigin(req)) { finish(403); return; }
  if (!/^application\/json(?:\s*;\s*charset=utf-8)?$/i.test(req.headers['content-type'] || '')) { finish(415); return; }
  const length = req.headers['content-length'];
  if (length && (!/^\d+$/.test(length) || Number(length) > MAX_EVENT_BYTES)) { finish(413); return; }
  try {
    let payload: unknown;
    if (req.body !== undefined) {
      const raw = typeof req.body === 'string' ? req.body : JSON.stringify(req.body);
      if (Buffer.byteLength(raw) > MAX_EVENT_BYTES) { finish(413); return; }
      payload = JSON.parse(raw);
    } else {
      const chunks: Buffer[] = [];
      let size = 0;
      for await (const chunk of req) {
        const bytes = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        size += bytes.length;
        if (size > MAX_EVENT_BYTES) { finish(413); return; }
        chunks.push(bytes);
      }
      payload = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    }
    if (!validateEvent(payload)) { finish(400); return; }
    console.info(JSON.stringify({ event: payload.event, version: payload.version }));
    finish(204);
  } catch { finish(400); }
}

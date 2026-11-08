import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { resolve } from 'node:path';
import { PaymentLedger } from './ledger.mjs';
import { StripeProvider } from './stripe.mjs';

const bearer = (req) => /^Bearer ([A-Za-z0-9_-]+)$/.exec(req.headers.authorization ?? '')?.[1] ?? '';
const equal = (a, b) => {
  const left = Buffer.from(a); const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
};
class HttpError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function rawBody(req) {
  const chunks = []; let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > 256 * 1024) throw new HttpError(413, 'request too large');
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}
async function jsonBody(req) {
  if (req.headers['content-type']?.split(';')[0] !== 'application/json') throw new HttpError(415, 'JSON required');
  const raw = await rawBody(req);
  try { const data = JSON.parse(raw.toString('utf8')); if (!data || typeof data !== 'object' || Array.isArray(data)) throw Error(); return data; }
  catch { throw new HttpError(400, 'invalid JSON'); }
}
function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'no-referrer', 'Content-Security-Policy': "default-src 'none'; frame-ancestors 'none'" });
  res.end(JSON.stringify(body));
}

export function createPaymentServer({ ledger, adminKey }) {
  if (typeof adminKey !== 'string' || adminKey.length < 32 || !/^[A-Za-z0-9_-]+$/.test(adminKey)) throw new Error('high entropy admin key of at least 32 characters required');
  if (process.env.VERCEL) throw new Error('local SQLite payment server cannot run on Vercel');
  const server = createServer(async (req, res) => {
    let webhook = false;
    try {
      const expectedHost = `127.0.0.1:${server.address().port}`;
      if (req.headers.host !== expectedHost) throw new HttpError(403, 'host forbidden');
      const url = new URL(req.url, 'http://127.0.0.1:5180');
      const path = url.pathname;
      webhook = path === '/api/webhooks/stripe';
      const origin = req.headers.origin;
      if (!webhook && origin && origin !== `http://${expectedHost}`) throw new HttpError(403, 'origin forbidden');
      if (req.method === 'GET' && path === '/health') return send(res, 200, { mode: 'sandbox-only', providerValidated: false });
      if (req.method === 'GET' && path === '/return') return send(res, 200, { message: 'Checkout return is not payment proof. Query the authenticated order entitlement.', mode: 'sandbox-only' });
      if (req.method === 'POST' && path === '/api/orders') {
        const body = await jsonBody(req);
        if (Object.keys(body).length) throw new HttpError(400, 'order price and SKU are fixed on server');
        return send(res, 201, ledger.createOrder());
      }
      if (req.method === 'POST' && webhook) {
        const raw = await rawBody(req);
        return send(res, 200, await ledger.webhook(raw, req.headers['stripe-signature']));
      }
      const orderMatch = /^\/api\/orders\/([a-f0-9-]{36})\/(checkout|entitlement)$/.exec(path);
      if (orderMatch) {
        const [, id, action] = orderMatch; const capability = bearer(req);
        ledger.authenticate(id, capability);
        if (req.method === 'POST' && action === 'checkout') {
          const body = await jsonBody(req);
          if (Object.keys(body).length) throw new HttpError(400, 'checkout takes no client price or payment status');
          return send(res, 200, await ledger.checkout(id, capability));
        }
        if (req.method === 'GET' && action === 'entitlement') {
          // Refresh on access as well as on webhooks; an unreachable provider never grants stale access.
          if (ledger.getOrder(id).session_id) await ledger.reconcile(id);
          return send(res, 200, ledger.entitlement(id, capability));
        }
      }
      const adminMatch = /^\/api\/admin\/orders\/([a-f0-9-]{36})\/refund$/.exec(path);
      if (req.method === 'POST' && adminMatch) {
        if (!equal(bearer(req), adminKey)) throw new HttpError(401, 'unauthorized');
        const body = await jsonBody(req);
        if (Object.keys(body).some((key) => !['requestId', 'amount'].includes(key))) throw new HttpError(400, 'invalid refund parameters');
        return send(res, 200, await ledger.refund(adminMatch[1], body));
      }
      throw new HttpError(404, 'not found');
    } catch (error) {
      // Never log headers, request bodies, bearer capabilities, Stripe objects or provider errors.
      const message = String(error.message ?? '');
      const status = error.status ?? (/unauthorized/.test(message) ? 401
        : /signature|timestamp|raw body|test event|live object|metadata mismatch|event .*mismatch|amount.*mismatch|invalid refund|paid order required|refund retry/.test(message) ? 400 : 503);
      send(res, status, { error: status === 503 ? 'payment state unavailable; retry safely' : error.status ? message : status === 401 ? 'unauthorized' : webhook ? 'invalid webhook' : 'invalid payment request' });
    }
  });
  server.requestTimeout = 30000; server.headersTimeout = 10000;
  return server;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    if (Number(process.versions.node.split('.')[0]) < 24) throw new Error('Node 24 or later required');
    if (process.env.VERCEL) throw new Error('local-only harness; Vercel is forbidden');
    process.umask(0o077);
    const provider = new StripeProvider({ apiKey: process.env.STRIPE_TEST_SECRET_KEY });
    const dbPath = process.env.PAYMENT_DB_PATH ?? fileURLToPath(new URL('./private/ledger.sqlite', import.meta.url));
    const ledger = new PaymentLedger({ dbPath, provider, webhookSecret: process.env.STRIPE_WEBHOOK_SECRET });
    const server = createPaymentServer({ ledger, adminKey: process.env.PAYMENT_ADMIN_SECRET });
    server.listen(5180, '127.0.0.1', () => console.log('Sandbox-only payment harness: http://127.0.0.1:5180 (local SQLite; no live payments)'));
    const close = () => { server.closeAllConnections(); server.close(() => { ledger.close(); process.exit(0); }); };
    process.once('SIGINT', close); process.once('SIGTERM', close);
    server.on('error', () => { console.error('Payment server could not bind local port; details withheld'); ledger.close(); process.exitCode = 1; });
  } catch {
    console.error('Payment harness did not start: verify Node 24, sandbox-only keys, webhook/admin secrets and local database permissions. No credentials are printed.');
    process.exitCode = 1;
  }
}

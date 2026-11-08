import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { once } from 'node:events';
import { request } from 'node:http';
import { createPaymentServer } from '../payment/server.mjs';
import { PaymentLedger } from '../payment/ledger.mjs';

test('HTTP capabilities/admin protection/body checks; return page cannot grant access', async (t) => {
  const dir = mkdtempSync(join(tmpdir(), 'payment-http-'));
  const ledger = new PaymentLedger({ dbPath: join(dir, 'db.sqlite'), provider: {}, webhookSecret: 'whsec_fake' });
  const adminKey = 'local-contract-admin-key-32-characters';
  const server = createPaymentServer({ ledger, adminKey }); server.listen(0, '127.0.0.1'); await once(server, 'listening');
  const base = `http://127.0.0.1:${server.address().port}`;
  t.after(async () => { server.closeAllConnections(); await new Promise((resolve) => server.close(resolve)); ledger.close(); rmSync(dir, { recursive: true, force: true }); });
  const create = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' });
  assert.equal(create.status, 201); const order = await create.json();
  assert.equal(order.amount, 100); assert.equal(order.currency, 'usd');
  assert.equal((await fetch(`${base}/api/orders/${order.id}/entitlement`)).status, 401);
  const authenticated = await fetch(`${base}/api/orders/${order.id}/entitlement`, { headers: { Authorization: `Bearer ${order.capability}` } });
  assert.equal(authenticated.status, 200); assert.equal((await authenticated.json()).active, false);
  const tamper = await fetch(`${base}/api/orders`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"amount":1,"paid":true}' });
  assert.equal(tamper.status, 400);
  assert.equal((await fetch(`${base}/api/admin/orders/${order.id}/refund`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${order.capability}` }, body: '{"requestId":"a","amount":100}' })).status, 401);
  assert.equal((await fetch(`${base}/api/admin/orders/${order.id}/refund`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${adminKey}` }, body: '{"requestId":"a","amount":100}' })).status, 400);
  assert.equal((await fetch(`${base}/api/webhooks/stripe`, { method: 'POST', body: '{}' })).status, 400);
  assert.equal((await fetch(`${base}/return?paid=true&session_id=pretend`)).status, 200);
  assert.equal(ledger.entitlement(order.id, order.capability).active, false);
  assert.equal((await fetch(`${base}/api/orders`, { method: 'POST', headers: { Origin: 'https://evil.example', 'Content-Type': 'application/json' }, body: '{}' })).status, 403);
  const rebound = await new Promise((resolve, reject) => {
    const req = request(`${base}/api/orders`, { method: 'POST', headers: { Host: 'evil.example', Origin: 'http://evil.example', 'Content-Type': 'application/json' } }, (res) => {
      res.resume(); res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject); req.end('{}');
  });
  assert.equal(rebound, 403);
});

test('server refuses short/missing administrator secret', () => {
  assert.throws(() => createPaymentServer({ ledger: {}, adminKey: 'short' }), /admin/);
});

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { PaymentLedger, verifySignature } from '../payment/ledger.mjs';
import { StripeProvider } from '../payment/stripe.mjs';

const secret = 'whsec_contract_test_only';
const now = 1793000000;
function signed(body, timestamp = now) {
  return `t=${timestamp},v1=${createHmac('sha256', secret).update(`${timestamp}.`).update(body).digest('hex')}`;
}
function providerFake() {
  let count = 0;
  const sessions = new Map(); const refunds = new Map(); const creations = new Map();
  return {
    sessions, refunds, creations, calls: [], unavailable: false,
    async createCheckout(order, key) {
      this.calls.push(key);
      if (creations.has(key)) return structuredClone(creations.get(key));
      const session = { id: `cs_test_${++count}`, object: 'checkout.session', livemode: false,
        mode: 'payment', payment_status: 'unpaid', status: 'open', amount_total: 100, currency: 'usd',
        client_reference_id: order.id, metadata: { order_id: order.id, sku: 'circular-lifetime' },
        payment_intent: null, url: 'https://checkout.stripe.com/c/pay/test',
        line_items: { data: [{ quantity: 1, amount_total: 100, price: { unit_amount: 100, currency: 'usd', product: { metadata: { sku: 'circular-lifetime' } } } }] } };
      sessions.set(session.id, session); creations.set(key, session); return structuredClone(session);
    },
    async retrieveSession(id) { if (this.unavailable) throw Error('unavailable'); return structuredClone(sessions.get(id)); },
    async listRefunds(pi) { if (this.unavailable) throw Error('unavailable'); return structuredClone(refunds.get(pi) ?? []); },
    async createRefund(order, amount, key) {
      if (creations.has(key)) return structuredClone(creations.get(key));
      const refund = { id: `re_${++count}`, object: 'refund', livemode: false, payment_intent: order.payment_intent, amount, currency: 'usd', status: 'pending' };
      refunds.set(order.payment_intent, [...(refunds.get(order.payment_intent) ?? []), refund]);
      creations.set(key, refund); return structuredClone(refund);
    },
  };
}
function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'av-payment-'));
  const dbPath = join(directory, 'ledger.sqlite'); const provider = providerFake();
  const ledger = new PaymentLedger({ dbPath, provider, webhookSecret: secret, now: () => now });
  t.after(() => { ledger.close(); rmSync(directory, { recursive: true, force: true }); });
  return { ledger, provider, dbPath };
}
async function purchased(f) {
  const order = f.ledger.createOrder(); await f.ledger.checkout(order.id, order.capability);
  const session = f.provider.sessions.values().next().value;
  session.payment_status = 'paid'; session.status = 'complete'; session.payment_intent = `pi_${order.id}`;
  return { order, session };
}
async function deliver(ledger, type, object, id = crypto.randomUUID()) {
  const body = Buffer.from(JSON.stringify({ id, object: 'event', type, livemode: false, data: { object } }));
  return ledger.webhook(body, signed(body));
}

test('signature validates raw bytes, multiple v1 signatures, age and future bounds', () => {
  const body = Buffer.from('{"x":1}');
  assert.doesNotThrow(() => verifySignature(body, signed(body), secret, now));
  assert.doesNotThrow(() => verifySignature(body, `${signed(body)},v1=${'0'.repeat(64)}`, secret, now));
  assert.throws(() => verifySignature(Buffer.from('{"x":2}'), signed(body), secret, now), /signature/);
  assert.throws(() => verifySignature(body, signed(body, now - 301), secret, now), /timestamp/);
  assert.throws(() => verifySignature(body, signed(body, now + 301), secret, now), /timestamp/);
  assert.throws(() => verifySignature(body, 't=oops,v1=bad', secret, now));
});

test('capability is hashed, cross-order denied; checkout price immutable and retry idempotent', async (t) => {
  const f = fixture(t); const a = f.ledger.createOrder(); const b = f.ledger.createOrder();
  assert.match(a.id, /^[a-f0-9-]{36}$/); assert.ok(a.capability.length >= 40);
  assert.throws(() => f.ledger.entitlement(a.id, b.capability), /unauthorized/);
  const checkouts = await Promise.all([f.ledger.checkout(a.id, a.capability), f.ledger.checkout(a.id, a.capability)]);
  assert.equal(checkouts[0].sessionId, checkouts[1].sessionId);
  assert.ok(f.provider.calls.every((key) => key === a.id));
  assert.equal(f.ledger.entitlement(a.id, a.capability).active, false);
  assert.equal(readFileSync(f.dbPath).includes(Buffer.from(a.capability)), false);
});

test('paid webhook grants once; durable reopen and independent connection duplicate are safe', async (t) => {
  const f = fixture(t); const { order, session } = await purchased(f);
  const other = new PaymentLedger({ dbPath: f.dbPath, provider: f.provider, webhookSecret: secret, now: () => now });
  t.after(() => other.close());
  await Promise.all([deliver(f.ledger, 'checkout.session.completed', session, 'evt_same'), deliver(other, 'checkout.session.completed', session, 'evt_same')]);
  await deliver(other, 'checkout.session.async_payment_succeeded', session, 'evt_distinct');
  assert.deepEqual(other.entitlement(order.id, order.capability), { orderId: order.id, sku: 'circular-lifetime', active: true, status: 'active', grantCount: 1 });
  other.close();
  const reopened = new PaymentLedger({ dbPath: f.dbPath, provider: f.provider, webhookSecret: secret, now: () => now });
  assert.equal(reopened.entitlement(order.id, order.capability).active, true); reopened.close();
});

test('unpaid/async failure never grants; later async success grants', async (t) => {
  const f = fixture(t); const order = f.ledger.createOrder(); await f.ledger.checkout(order.id, order.capability);
  const session = f.provider.sessions.values().next().value;
  await deliver(f.ledger, 'checkout.session.completed', session);
  await deliver(f.ledger, 'checkout.session.async_payment_failed', session);
  assert.equal(f.ledger.entitlement(order.id, order.capability).active, false);
  session.payment_status = 'paid'; session.payment_intent = 'pi_later';
  await deliver(f.ledger, 'checkout.session.async_payment_succeeded', session);
  assert.equal(f.ledger.entitlement(order.id, order.capability).active, true);
});

test('rejects live mode, cross-order metadata, incorrect amounts and unknown payment intent', async (t) => {
  const f = fixture(t); const { order, session } = await purchased(f);
  await assert.rejects(deliver(f.ledger, 'checkout.session.completed', { ...session, livemode: true }));
  await assert.rejects(deliver(f.ledger, 'checkout.session.completed', { ...session, metadata: { order_id: 'wrong', sku: 'circular-lifetime' } }));
  session.amount_total = 1;
  await assert.rejects(deliver(f.ledger, 'checkout.session.completed', session));
  assert.equal(f.ledger.entitlement(order.id, order.capability).active, false);
  session.amount_total = 100;
  const refund = { id: 're_wrong', object: 'refund', payment_intent: 'pi_unknown', livemode: false, currency: 'usd', amount: 100, status: 'succeeded' };
  await assert.rejects(deliver(f.ledger, 'refund.created', refund));
});

test('provider uncertainty fails closed and failed event can retry', async (t) => {
  const f = fixture(t); const { order, session } = await purchased(f);
  await deliver(f.ledger, 'checkout.session.completed', session);
  f.provider.unavailable = true;
  await assert.rejects(deliver(f.ledger, 'checkout.session.completed', session, 'evt_retry'));
  assert.equal(f.ledger.entitlement(order.id, order.capability).active, false);
  f.provider.unavailable = false;
  await deliver(f.ledger, 'checkout.session.completed', session, 'evt_retry');
  assert.equal(f.ledger.entitlement(order.id, order.capability).active, true);
});

test('partial/full/pending/failed refunds and old completed events reconcile current state', async (t) => {
  const f = fixture(t); const { order, session } = await purchased(f);
  await deliver(f.ledger, 'checkout.session.completed', session);
  const refund = { id: 're_one', object: 'refund', payment_intent: session.payment_intent, livemode: false, currency: 'usd', amount: 50, status: 'pending' };
  f.provider.refunds.set(session.payment_intent, [refund]);
  await deliver(f.ledger, 'refund.created', refund);
  assert.equal(f.ledger.entitlement(order.id, order.capability).status, 'suspended');
  refund.status = 'succeeded'; await deliver(f.ledger, 'refund.updated', refund);
  assert.equal(f.ledger.entitlement(order.id, order.capability).active, true);
  const second = { ...refund, id: 're_two', amount: 50 }; f.provider.refunds.set(session.payment_intent, [refund, second]);
  await deliver(f.ledger, 'refund.created', second);
  assert.equal(f.ledger.entitlement(order.id, order.capability).status, 'revoked');
  await deliver(f.ledger, 'checkout.session.completed', session);
  assert.equal(f.ledger.entitlement(order.id, order.capability).active, false);
  const failed = { ...refund, id: 're_failed', status: 'failed' }; f.provider.refunds.set(session.payment_intent, [refund, second, failed]);
  await deliver(f.ledger, 'refund.failed', failed);
  assert.equal(f.ledger.entitlement(order.id, order.capability).active, false);
  second.status = 'failed'; await deliver(f.ledger, 'refund.failed', second);
  assert.equal(f.ledger.entitlement(order.id, order.capability).active, true);
  assert.equal(f.ledger.entitlement(order.id, order.capability).grantCount, 1);
});

test('admin refund is persisted pending before provider call and retries use same key', async (t) => {
  const f = fixture(t); const { order, session } = await purchased(f);
  await deliver(f.ledger, 'checkout.session.completed', session);
  const original = f.provider.createRefund.bind(f.provider); let attempts = 0;
  f.provider.createRefund = async (...args) => {
    assert.equal(f.ledger.entitlement(order.id, order.capability).active, false);
    if (++attempts === 1) throw Error('network uncertainty');
    return original(...args);
  };
  await assert.rejects(f.ledger.refund(order.id, { requestId: 'refund_1', amount: 100 }));
  assert.equal(f.ledger.entitlement(order.id, order.capability).status, 'suspended');
  const a = await f.ledger.refund(order.id, { requestId: 'refund_1', amount: 100 });
  const b = await f.ledger.refund(order.id, { requestId: 'refund_1', amount: 100 });
  assert.equal(a.refundId, b.refundId);
  await assert.rejects(f.ledger.refund(order.id, { requestId: 'refund_1', amount: 50 }));
});

test('Stripe REST adapter rejects live keys and pins test version and expected checkout body', async () => {
  assert.throws(() => new StripeProvider({ apiKey: 'sk_live_forbidden' }), /test/);
  assert.throws(() => new StripeProvider({ apiKey: 'rk_live_forbidden' }), /test/);
  let observed;
  const stripe = new StripeProvider({ apiKey: 'sk_test_contract', baseUrl: 'http://127.0.0.1:5180', fetchImpl: async (url, options) => {
    observed = { url, options }; return { ok: true, json: async () => ({ id: 'cs_test_rest', livemode: false }) };
  } });
  await stripe.createCheckout({ id: 'order1' }, 'order1');
  assert.equal(observed.options.headers['Idempotency-Key'], 'order1');
  assert.equal(observed.options.headers['Stripe-Version'], '2026-09-30.endive');
  const form = new URLSearchParams(observed.options.body);
  assert.equal(form.get('mode'), 'payment'); assert.equal(form.get('line_items[0][price_data][unit_amount]'), '100');
  assert.equal(form.get('line_items[0][price_data][currency]'), 'usd');
});

test('missing expanded state never grants; atomic rollback does not mark event as processed', async (t) => {
  const f = fixture(t); const { order, session } = await purchased(f);
  const items = session.line_items; delete session.line_items;
  await assert.rejects(deliver(f.ledger, 'checkout.session.completed', session, 'evt_atomic'));
  assert.equal(f.ledger.entitlement(order.id, order.capability).active, false);
  session.line_items = items;
  f.ledger.db.exec("CREATE TRIGGER simulate_failure BEFORE INSERT ON events BEGIN SELECT RAISE(ABORT, 'simulated write failure'); END;");
  await assert.rejects(deliver(f.ledger, 'checkout.session.completed', session, 'evt_atomic'));
  assert.equal(f.ledger.entitlement(order.id, order.capability).grantCount, 0);
  assert.equal(f.ledger.db.prepare('SELECT COUNT(*) AS count FROM events').get().count, 0);
  f.ledger.db.exec('DROP TRIGGER simulate_failure');
  await deliver(f.ledger, 'checkout.session.completed', session, 'evt_atomic');
  assert.equal(f.ledger.entitlement(order.id, order.capability).grantCount, 1);
});

test('cannot blindly retry unknown checkout outcome after provider idempotency retention window', async (t) => {
  const f = fixture(t); let clock = now; f.ledger.now = () => clock;
  const order = f.ledger.createOrder(); let calls = 0;
  const original = f.provider.createCheckout.bind(f.provider);
  f.provider.createCheckout = async (...args) => { calls++; await original(...args); throw Error('response lost'); };
  await assert.rejects(f.ledger.checkout(order.id, order.capability));
  clock += 25 * 60 * 60;
  await assert.rejects(f.ledger.checkout(order.id, order.capability), /idempotency.*expired/);
  assert.equal(calls, 1);
});

test('definitively rejected refund unfreezes only after checking provider state', async (t) => {
  const f = fixture(t); const { order, session } = await purchased(f);
  await deliver(f.ledger, 'checkout.session.completed', session);
  f.provider.createRefund = async () => { const error = Error('definitive rejected request'); error.definitive = true; throw error; };
  await assert.rejects(f.ledger.refund(order.id, { requestId: 'declined_request', amount: 100 }));
  assert.equal(f.ledger.entitlement(order.id, order.capability).active, true);
});

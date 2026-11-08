import { DatabaseSync } from 'node:sqlite';
import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { chmodSync, mkdirSync } from 'node:fs';
import { dirname } from 'node:path';

export const SKU = 'circular-lifetime';
export const AMOUNT = 100;
export const CURRENCY = 'usd';
const hash = (value) => createHash('sha256').update(value).digest('hex');
const requireThat = (condition, message) => { if (!condition) throw new Error(message); };
const idOf = (value) => typeof value === 'string' ? value : value?.id;

export function verifySignature(raw, header, secret, now = Math.floor(Date.now() / 1000)) {
  requireThat(Buffer.isBuffer(raw), 'raw body required');
  requireThat(typeof secret === 'string' && secret.startsWith('whsec_'), 'webhook secret required');
  const parts = String(header ?? '').split(',').map((part) => part.split('='));
  const times = parts.filter(([key]) => key === 't');
  requireThat(times.length === 1 && /^\d+$/.test(times[0][1]), 'invalid timestamp');
  const timestamp = Number(times[0][1]);
  requireThat(Number.isSafeInteger(timestamp) && Math.abs(now - timestamp) <= 300, 'timestamp outside tolerance');
  const expected = createHmac('sha256', secret).update(`${timestamp}.`).update(raw).digest();
  const valid = parts.filter(([key, value]) => key === 'v1' && /^[a-f0-9]{64}$/i.test(value ?? ''))
    .some(([, value]) => timingSafeEqual(expected, Buffer.from(value, 'hex')));
  requireThat(valid, 'invalid signature');
}

/** Local-only transactional ledger. Network requests use revision retries, never await inside a SQL transaction. */
export class PaymentLedger {
  constructor({ dbPath, provider, webhookSecret, now = () => Math.floor(Date.now() / 1000) }) {
    requireThat(!process.env.VERCEL, 'SQLite payment harness cannot run on Vercel');
    requireThat(provider && webhookSecret?.startsWith('whsec_'), 'provider and webhook secret required');
    this.provider = provider; this.webhookSecret = webhookSecret; this.now = now;
    mkdirSync(dirname(dbPath), { recursive: true, mode: 0o700 });
    this.db = new DatabaseSync(dbPath); this.closed = false; chmodSync(dbPath, 0o600);
    this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS orders (
        id TEXT PRIMARY KEY, capability_hash TEXT NOT NULL, sku TEXT NOT NULL,
        amount INTEGER NOT NULL, currency TEXT NOT NULL, session_id TEXT UNIQUE,
        payment_intent TEXT UNIQUE, status TEXT NOT NULL DEFAULT 'unpaid', revision INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL, checkout_started_at INTEGER);
      CREATE TABLE IF NOT EXISTS events (id TEXT PRIMARY KEY, type TEXT NOT NULL, order_id TEXT, handled_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS grants (order_id TEXT PRIMARY KEY REFERENCES orders(id), granted_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS refund_operations (
        operation_id TEXT PRIMARY KEY, order_id TEXT NOT NULL REFERENCES orders(id), amount INTEGER NOT NULL,
        refund_id TEXT UNIQUE, state TEXT NOT NULL DEFAULT 'requested', started_at INTEGER NOT NULL DEFAULT 0);`);
    if (!this.db.prepare('PRAGMA table_info(orders)').all().some((column) => column.name === 'checkout_started_at')) this.db.exec('ALTER TABLE orders ADD COLUMN checkout_started_at INTEGER');
    if (!this.db.prepare('PRAGMA table_info(refund_operations)').all().some((column) => column.name === 'started_at')) this.db.exec('ALTER TABLE refund_operations ADD COLUMN started_at INTEGER NOT NULL DEFAULT 0');
  }
  close() { if (!this.closed) { this.db.close(); this.closed = true; } }
  transaction(fn) {
    this.db.exec('BEGIN IMMEDIATE');
    try { const result = fn(); this.db.exec('COMMIT'); return result; }
    catch (error) { this.db.exec('ROLLBACK'); throw error; }
  }
  getOrder(id) { return this.db.prepare('SELECT * FROM orders WHERE id=?').get(id); }
  authenticate(id, capability) {
    const order = this.getOrder(id);
    const provided = hash(typeof capability === 'string' ? capability : '');
    requireThat(order && timingSafeEqual(Buffer.from(order.capability_hash, 'hex'), Buffer.from(provided, 'hex')), 'unauthorized');
    return order;
  }
  createOrder() {
    const id = randomUUID(); const capability = randomBytes(32).toString('base64url');
    this.db.prepare('INSERT INTO orders(id,capability_hash,sku,amount,currency,created_at) VALUES(?,?,?,?,?,?)')
      .run(id, hash(capability), SKU, AMOUNT, CURRENCY, this.now());
    return { id, capability, sku: SKU, amount: AMOUNT, currency: CURRENCY };
  }
  async checkout(id, capability) {
    this.authenticate(id, capability);
    const order = this.transaction(() => {
      const current = this.getOrder(id);
      if (!current.session_id) {
        requireThat(current.checkout_started_at === null || this.now() - current.checkout_started_at < 23 * 3600, 'checkout idempotency window expired; operator reconciliation required');
        this.db.prepare('UPDATE orders SET checkout_started_at=?,revision=revision+1 WHERE id=? AND checkout_started_at IS NULL').run(this.now(), id);
      }
      return this.getOrder(id);
    });
    const session = order.session_id
      ? await this.provider.retrieveSession(order.session_id)
      : await this.provider.createCheckout(order, order.id);
    this.validateSession(order, session);
    requireThat(typeof session.url === 'string' && new URL(session.url).origin === 'https://checkout.stripe.com', 'invalid checkout URL');
    this.transaction(() => {
      const current = this.getOrder(id);
      requireThat(!current.session_id || current.session_id === session.id, 'session conflict');
      this.db.prepare('UPDATE orders SET session_id=?,revision=revision+1 WHERE id=? AND session_id IS NULL').run(session.id, id);
    });
    return { orderId: id, sessionId: session.id, checkoutUrl: session.url };
  }
  validateSession(order, session) {
    requireThat(session?.object === 'checkout.session' && session.livemode === false && session.mode === 'payment', 'test payment session required');
    requireThat(typeof session.id === 'string' && (!order.session_id || session.id === order.session_id), 'session mismatch');
    requireThat(session.client_reference_id === order.id && session.metadata?.order_id === order.id && session.metadata?.sku === SKU, 'order metadata mismatch');
    requireThat(session.amount_total === order.amount && session.currency === order.currency, 'amount or currency mismatch');
    const pi = idOf(session.payment_intent);
    requireThat(!order.payment_intent || pi === order.payment_intent, 'payment intent mismatch');
    if (session.line_items) {
      const items = session.line_items.data;
      requireThat(!session.line_items.has_more && items?.length === 1 && items[0].quantity === 1 && items[0].amount_total === AMOUNT,
        'line items mismatch');
      const price = items[0].price;
      requireThat(price?.currency === CURRENCY && price.unit_amount === AMOUNT && price.product?.metadata?.sku === SKU, 'SKU mismatch');
    }
    requireThat(['paid', 'unpaid'].includes(session.payment_status), 'unsupported payment status');
    requireThat(session.payment_status !== 'paid' || typeof pi === 'string', 'paid payment intent missing');
  }
  entitlement(id, capability) {
    const order = this.authenticate(id, capability);
    const count = Number(this.db.prepare('SELECT COUNT(*) AS count FROM grants WHERE order_id=?').get(id).count);
    return { orderId: id, sku: SKU, active: order.status === 'active' && count === 1, status: order.status, grantCount: count };
  }
  suspend(id) {
    this.db.prepare("UPDATE orders SET status='suspended',revision=revision+1 WHERE id=? AND status!='revoked'").run(id);
  }
  async snapshot(order) {
    requireThat(order.session_id, 'session not yet saved; retry');
    const session = await this.provider.retrieveSession(order.session_id);
    this.validateSession(order, session);
    // A paid session must be expanded by the REST provider. Fakes must implement the same contract.
    requireThat(session.line_items?.data?.length === 1, 'expanded line items required');
    const pi = idOf(session.payment_intent);
    const refunds = pi ? await this.provider.listRefunds(pi) : [];
    requireThat(Array.isArray(refunds), 'refund state uncertain');
    const seen = new Set(); let refunded = 0; let pending = false;
    for (const refund of refunds) {
      requireThat(refund && !seen.has(refund.id) && typeof refund.id === 'string', 'invalid or duplicate refund'); seen.add(refund.id);
      requireThat(refund.livemode !== true && idOf(refund.payment_intent) === pi && refund.currency === CURRENCY &&
        Number.isSafeInteger(refund.amount) && refund.amount > 0 && refund.amount <= AMOUNT, 'refund mismatch');
      requireThat(['pending', 'requires_action', 'succeeded', 'failed', 'canceled'].includes(refund.status), 'refund state uncertain');
      if (refund.status === 'succeeded') refunded += refund.amount;
      if (['pending', 'requires_action'].includes(refund.status)) pending = true;
    }
    requireThat(refunded <= AMOUNT, 'refund amount exceeds order');
    const operations = this.db.prepare('SELECT * FROM refund_operations WHERE order_id=?').all(order.id);
    const missingOperation = operations.some((op) => op.state !== 'rejected' && (!op.refund_id || !seen.has(op.refund_id)));
    const status = refunded === AMOUNT ? 'revoked' : pending || missingOperation ? 'suspended'
      : session.payment_status === 'paid' ? 'active' : 'unpaid';
    return { session, refunds, pi, status };
  }
  async reconcile(id, event = null) {
    for (let attempt = 0; attempt < 5; attempt++) {
      const order = this.getOrder(id); requireThat(order, 'unknown order');
      if (event && this.db.prepare('SELECT 1 FROM events WHERE id=?').get(event.id)) return { duplicate: true };
      let snapshot;
      try { snapshot = await this.snapshot(order); }
      catch (error) { this.suspend(id); throw error; }
      if (event) this.validateEventObject(order, event, snapshot);
      const result = this.transaction(() => {
        if (event && this.db.prepare('SELECT 1 FROM events WHERE id=?').get(event.id)) return { duplicate: true };
        if (this.getOrder(id).revision !== order.revision) return null;
        this.db.prepare('UPDATE orders SET status=?,payment_intent=?,revision=revision+1 WHERE id=?').run(snapshot.status, snapshot.pi ?? null, id);
        if (snapshot.session.payment_status === 'paid') this.db.prepare('INSERT OR IGNORE INTO grants(order_id,granted_at) VALUES(?,?)').run(id, this.now());
        if (event) this.db.prepare('INSERT INTO events(id,type,order_id,handled_at) VALUES(?,?,?,?)').run(event.id, event.type, id, this.now());
        return { duplicate: false, status: snapshot.status };
      });
      if (result) return result;
    }
    this.suspend(id); throw new Error('concurrent update; retry');
  }
  validateEventObject(order, event, snapshot) {
    const object = event.data.object;
    requireThat(object.livemode !== true, 'live object forbidden');
    if (event.type.startsWith('checkout.session.')) {
      requireThat(object.id === order.session_id && object.object === 'checkout.session', 'event session mismatch');
      requireThat(object.client_reference_id === order.id && object.metadata?.order_id === order.id && object.metadata?.sku === SKU, 'event metadata mismatch');
      requireThat(object.amount_total === AMOUNT && object.currency === CURRENCY, 'event amount mismatch');
      const pi = idOf(object.payment_intent);
      requireThat(!pi || pi === snapshot.pi, 'event payment intent mismatch');
    } else if (event.type.startsWith('refund.')) {
      requireThat(object.object === 'refund' && idOf(object.payment_intent) === snapshot.pi, 'event refund intent mismatch');
      const current = snapshot.refunds.find((refund) => refund.id === object.id);
      requireThat(current && object.amount === current.amount && object.currency === current.currency, 'event refund mismatch');
    } else {
      requireThat(object.object === 'payment_intent' && object.id === snapshot.pi && object.amount === AMOUNT && object.currency === CURRENCY, 'event intent mismatch');
    }
  }
  async webhook(raw, signature) {
    verifySignature(raw, signature, this.webhookSecret, this.now());
    const event = JSON.parse(raw.toString('utf8'));
    requireThat(event.object === 'event' && event.livemode === false && typeof event.id === 'string' && event.data?.object, 'test event required');
    const supported = ['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed',
      'checkout.session.expired', 'refund.created', 'refund.updated', 'refund.failed', 'payment_intent.succeeded', 'payment_intent.payment_failed'];
    if (!supported.includes(event.type)) return { ignored: true };
    if (this.db.prepare('SELECT 1 FROM events WHERE id=?').get(event.id)) return { duplicate: true };
    const object = event.data.object; requireThat(object.livemode !== true, 'live object forbidden');
    const order = event.type.startsWith('checkout.session.')
      ? this.db.prepare('SELECT * FROM orders WHERE session_id=?').get(object.id)
      : this.db.prepare('SELECT * FROM orders WHERE payment_intent=?').get(event.type.startsWith('refund.') ? idOf(object.payment_intent) : object.id);
    requireThat(order, 'unknown order or unsaved payment intent; retry');
    return this.reconcile(order.id, event);
  }
  async refund(id, { requestId, amount }) {
    requireThat(typeof requestId === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(requestId), 'invalid refund request ID');
    requireThat(Number.isSafeInteger(amount) && amount > 0 && amount <= AMOUNT, 'invalid refund amount');
    const operationId = `${id}:${requestId}`;
    const order = this.transaction(() => {
      const current = this.getOrder(id); requireThat(current?.payment_intent, 'paid order required');
      const old = this.db.prepare('SELECT * FROM refund_operations WHERE operation_id=?').get(operationId);
      requireThat(!old || old.amount === amount, 'refund retry parameters mismatch');
      requireThat(old?.state !== 'rejected', 'refund request was rejected; operator action required');
      requireThat(!old || old.refund_id || this.now() - old.started_at < 23 * 3600, 'refund idempotency window expired; operator reconciliation required');
      this.db.prepare('INSERT OR IGNORE INTO refund_operations(operation_id,order_id,amount,started_at) VALUES(?,?,?,?)').run(operationId, id, amount, this.now());
      this.db.prepare("UPDATE orders SET status='suspended',revision=revision+1 WHERE id=?").run(id);
      return current;
    });
    const operation = this.db.prepare('SELECT * FROM refund_operations WHERE operation_id=?').get(operationId);
    if (!operation.refund_id) {
      let refund;
      try { refund = await this.provider.createRefund(order, amount, `refund:${operationId}`); }
      catch (error) {
        if (error.definitive === true) {
          this.db.prepare("UPDATE refund_operations SET state='rejected' WHERE operation_id=?").run(operationId);
          await this.reconcile(id);
        }
        throw error;
      }
      requireThat(refund?.id && refund.livemode !== true && idOf(refund.payment_intent) === order.payment_intent && refund.amount === amount && refund.currency === CURRENCY, 'refund response mismatch');
      this.db.prepare("UPDATE refund_operations SET refund_id=?,state='submitted' WHERE operation_id=?").run(refund.id, operationId);
    }
    const result = await this.reconcile(id);
    return { orderId: id, refundId: this.db.prepare('SELECT refund_id FROM refund_operations WHERE operation_id=?').get(operationId).refund_id, status: result.status };
  }
}

import { AMOUNT, CURRENCY, SKU } from './ledger.mjs';

// Stable version confirmed in https://docs.stripe.com/upgrades on 2026-10-26.
// Real-provider verification is recorded separately from contract tests.
export const STRIPE_VERSION = '2026-09-30.endive';
export class StripeProvider {
  constructor({ apiKey, baseUrl = 'http://127.0.0.1:5180', fetchImpl = fetch }) {
    if (!/^(sk|rk)_test_[A-Za-z0-9_]+$/.test(apiKey ?? '')) throw new Error('Stripe test key required; live keys forbidden');
    const url = new URL(baseUrl);
    if (url.origin !== 'http://127.0.0.1:5180') throw new Error('local sandbox base URL required');
    this.apiKey = apiKey; this.baseUrl = url.origin; this.fetch = fetchImpl;
  }
  async request(path, { body, key } = {}) {
    const response = await this.fetch(`https://api.stripe.com/v1/${path}`, {
      method: body ? 'POST' : 'GET', signal: AbortSignal.timeout(20000),
      headers: { Authorization: `Bearer ${this.apiKey}`, 'Stripe-Version': STRIPE_VERSION,
        ...(body ? { 'Content-Type': 'application/x-www-form-urlencoded' } : {}), ...(key ? { 'Idempotency-Key': key } : {}) },
      ...(body ? { body: new URLSearchParams(body).toString() } : {}),
    });
    if (!response.ok) {
      const error = new Error(`Stripe request failed (HTTP ${response.status}); details withheld`);
      error.definitive = [400, 401, 403, 404, 422].includes(response.status);
      throw error;
    }
    const data = await response.json();
    if (data.livemode === true) throw new Error('live Stripe resource forbidden');
    return data;
  }
  createCheckout(order, key) {
    return this.request('checkout/sessions', { key, body: {
      mode: 'payment', 'payment_method_types[0]': 'card',
      client_reference_id: order.id, 'metadata[order_id]': order.id, 'metadata[sku]': SKU,
      'payment_intent_data[metadata][order_id]': order.id, 'payment_intent_data[metadata][sku]': SKU,
      'line_items[0][quantity]': '1', 'line_items[0][price_data][currency]': CURRENCY,
      'line_items[0][price_data][unit_amount]': String(AMOUNT),
      'line_items[0][price_data][product_data][name]': 'Circular template — sandbox only',
      'line_items[0][price_data][product_data][metadata][sku]': SKU,
      success_url: `${this.baseUrl}/return?session_id={CHECKOUT_SESSION_ID}`, cancel_url: `${this.baseUrl}/return?canceled=1`,
    } });
  }
  retrieveSession(id) {
    return this.request(`checkout/sessions/${encodeURIComponent(id)}?expand[]=line_items.data.price.product`);
  }
  async listRefunds(paymentIntent) {
    const all = []; let after = null;
    for (let page = 0; page < 20; page++) {
      const query = new URLSearchParams({ payment_intent: paymentIntent, limit: '100' });
      if (after) query.set('starting_after', after);
      const result = await this.request(`refunds?${query}`);
      if (!Array.isArray(result.data)) throw new Error('Stripe refunds incomplete');
      all.push(...result.data);
      if (!result.has_more) return all;
      after = result.data.at(-1)?.id;
      if (!after) throw new Error('Stripe refunds pagination incomplete');
    }
    throw new Error('Stripe refunds pagination exceeded; fail closed');
  }
  createRefund(order, amount, key) {
    return this.request('refunds', { key, body: { payment_intent: order.payment_intent, amount: String(amount), reason: 'requested_by_customer' } });
  }
}

const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const fs = require('node:fs'); const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const q = require('../lib/server/quota.ts');
const handler = require('../api/quota.ts').default;
const secret = 'x'.repeat(40), id = '12345678-1234-1234-1234-123456789012';
test('signed anonymous identity rejects tampering and expiration', () => {
  const token = q.encodeAnonymous(id, 1800000000000, secret);
  assert.equal(q.decodeAnonymous(token, secret, 1700000000000), id);
  assert.equal(q.decodeAnonymous(token + 'x', secret, 1700000000000), null);
  assert.equal(q.decodeAnonymous(token, 'wrong', 1700000000000), null);
  assert.equal(q.decodeAnonymous(token, secret, 1900000000000), null);
});
test('network bucket ignores spoofable proxy headers and trusts only Vercel deployment header', () => {
  const req = { headers: { 'x-forwarded-for': '1.2.3.4', 'x-vercel-forwarded-for': '5.6.7.8' }, socket: { remoteAddress: '127.0.0.1' } };
  const local = q.networkIdentity(req, secret, false);
  req.headers['x-forwarded-for'] = '9.9.9.9'; assert.equal(q.networkIdentity(req, secret, false), local);
  assert.notEqual(q.networkIdentity(req, secret, true), local);
  req.headers['x-vercel-forwarded-for'] = '5.6.7.8, 1.2.3.4'; assert.equal(q.networkIdentity(req, secret, true), null);
  req.headers['x-vercel-forwarded-for'] = '2001:db8:1:2::1'; const v6 = q.networkIdentity(req, secret, true);
  req.headers['x-vercel-forwarded-for'] = '2001:0db8:0001:0002::a'; assert.equal(q.networkIdentity(req, secret, true), v6);
});
test('public API never accepts client settlement/reservation and unavailable config fails closed', async () => {
  const previous = process.env.QUOTA_COOKIE_SECRET; delete process.env.QUOTA_COOKIE_SECRET;
  try {
    for (const [method, expected] of [['GET', 503], ['POST', 503], ['DELETE', 405]]) {
      const req = Readable.from([]); req.method = method; req.headers = {}; req.socket = {};
      const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
      await handler(req, res); assert.equal(res.statusCode, expected);
      assert.equal(res.body.platformEnabled, false);
      if (method === 'GET') assert.equal(res.body.configured, false);
    }
  } finally { if (previous !== undefined) process.env.QUOTA_COOKIE_SECRET = previous; }
});
test('identity is obtained from Supabase user verification and never client user fields', async () => {
  const original = global.fetch;
  try {
    global.fetch = async (url, options) => { assert.equal(url, 'https://test.supabase.co/auth/v1/user'); assert.equal(options.headers.Authorization, 'Bearer token'); return { ok: true, json: async () => ({ id, email_confirmed_at: '2026-10-20', app_metadata: { provider: 'google' } }) }; };
    assert.deepEqual(await q.verifiedSubject({ headers: { authorization: 'Bearer token' } }, {}, { url: 'https://test.supabase.co', serviceKey: 'server', secret }), { subject: `user:${id}`, authenticated: true });
    global.fetch = async () => ({ ok: false });
    await assert.rejects(q.verifiedSubject({ headers: { authorization: 'Bearer token' } }, {}, { url: 'https://test.supabase.co', serviceKey: 'server', secret }), /unauthorized/);
  } finally { global.fetch = original; }
});
test('trusted processing defaults disabled before any database request', async () => {
  const previous = process.env.PLATFORM_PROCESSING_DISABLED; delete process.env.PLATFORM_PROCESSING_DISABLED;
  try { await assert.rejects(q.reserveTrusted({}, {}), /platform_disabled/); }
  finally { if (previous !== undefined) process.env.PLATFORM_PROCESSING_DISABLED = previous; }
});
test('configured status verifies token, returns public usage contract, and exposes no backend identifiers', async () => {
  const names = ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','QUOTA_COOKIE_SECRET'];
  const old = Object.fromEntries(names.map(key => [key, process.env[key]])); const original = global.fetch;
  Object.assign(process.env, { SUPABASE_URL: 'https://test.supabase.co', SUPABASE_SERVICE_ROLE_KEY: 'server', QUOTA_COOKIE_SECRET: secret });
  try {
    const calls = [];
    global.fetch = async (url, options) => { calls.push({ url, options }); return { ok: true, json: async () => url.endsWith('/user') ? { id, email_confirmed_at: '2026-10-20', app_metadata: { providers: ['google'] } } : { remainingRequests: 2, remainingSeconds: 900, resetAt: '2026-10-21T00:00:00Z' } }; };
    const req = Readable.from([]); req.method = 'GET'; req.headers = { authorization: 'Bearer token', 'x-vercel-forwarded-for': '127.0.0.1' }; req.socket = { remoteAddress: '127.0.0.1' };
    const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
    await handler(req, res);
    assert.equal(res.statusCode, 200); assert.equal(res.body.configured, true); assert.equal(res.body.platformEnabled, false); assert.equal(res.body.identity, 'authenticated'); assert.equal(res.body.maxSeconds, 600); assert.equal(res.body.remainingRequests, 2);
    assert.equal(calls.length, 2); assert.equal(JSON.parse(calls[1].options.body).p_subject, `user:${id}`);
    assert.equal(JSON.stringify(res.body).includes(id), false); assert.equal(JSON.stringify(res.body).includes('server'), false);
  } finally { global.fetch = original; for (const name of names) { if (old[name] === undefined) delete process.env[name]; else process.env[name] = old[name]; } }
});
test('verified non-Google or unconfirmed user is rejected', async () => {
 const original = global.fetch;
 try {
  for (const user of [{ id, email_confirmed_at: '2026-10-20', app_metadata: { provider: 'email' } }, { id, app_metadata: { provider: 'google' } }]) {
   global.fetch = async () => ({ ok: true, json: async () => user });
   await assert.rejects(q.verifiedSubject({ headers: { authorization: 'Bearer token' } }, {}, { url: 'https://test.supabase.co', serviceKey: 'server', secret }), /unauthorized/);
  }
 } finally { global.fetch = original; }
});
test('status denies browser cross-origin access before auth lookup', async () => {
 const req = Readable.from([]); req.method = 'GET'; req.headers = { origin: 'https://evil.test', host: 'example.test' }; req.socket = {};
 const res = { setHeader() {}, end(value) { this.body = JSON.parse(value); } };
 await handler(req, res); assert.equal(res.statusCode, 403); assert.equal(res.body.error, 'origin_not_allowed');
});

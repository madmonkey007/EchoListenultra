const { test } = require('node:test');
const assert = require('node:assert/strict');
const { Readable } = require('node:stream');
const fs = require('node:fs'); const ts = require('typescript');
require.extensions['.ts'] = (module, filename) => module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS } }).outputText, filename);
const { normalizeVideoUrl } = require('../lib/video-url.ts');
const handler = require('../api/video-import.ts').default;
function request(method, body = '', url = '/api/video-import') {
 const req = Readable.from(body ? [body] : []); req.method = method; req.url = url; req.headers = { host: 'localhost:3000', origin: 'http://localhost:3000', 'content-type': 'application/json' }; req.socket = { remoteAddress: '127.0.0.1' }; return req;
}
function response() { return { headers: {}, setHeader(k,v) { this.headers[k] = v; }, end(v) { this.raw = v; if (this.headers['Content-Type'] === 'application/json') this.body = JSON.parse(v); } }; }
async function configured(fn) {
 const oldUrl = process.env.VIDEO_IMPORT_WORKER_URL, oldSecret = process.env.VIDEO_IMPORT_WORKER_SECRET, oldFetch = global.fetch;
 Object.assign(process.env, { VIDEO_IMPORT_WORKER_URL: 'http://127.0.0.1:8787', VIDEO_IMPORT_WORKER_SECRET: 's'.repeat(40) });
 try { await fn(); } finally { global.fetch = oldFetch; for (const [key, value] of [['VIDEO_IMPORT_WORKER_URL', oldUrl], ['VIDEO_IMPORT_WORKER_SECRET', oldSecret]]) { if (value === undefined) delete process.env[key]; else process.env[key] = value; } }
}
test('video URLs accept exact HTTPS public hosts and reject credential, port, suffix, local, malformed inputs', () => {
 for (const url of ['https://youtu.be/abcdefghijk', 'https://www.youtube.com/watch?v=abcdefghijk', 'https://vm.tiktok.com/abc/', 'https://www.tiktok.com/@x/video/123']) assert.ok(normalizeVideoUrl(url));
 for (const url of ['https://youtube.com.evil.test/watch?v=x','http://youtu.be/abcdefghijk','https://u:p@youtu.be/x','https://youtu.be:8080/x','https://127.0.0.1/x','https://youtu.be/','https://youtu.be/\\evil',' https://youtu.be/a']) assert.equal(normalizeVideoUrl(url), null);
});
test('video API rejects cross-origin and missing configuration without contacting worker', async () => {
 const previous = process.env.VIDEO_IMPORT_WORKER_URL; delete process.env.VIDEO_IMPORT_WORKER_URL;
 try { let res = response(); await handler(request('GET', '', '/api/video-import?id=' + 'a'.repeat(32)), res); assert.equal(res.statusCode, 503); assert.equal(res.body.error, 'video_import_not_configured');
 const req = request('POST', '{}'); req.headers.origin = 'https://evil.test'; res = response(); await handler(req,res); assert.equal(res.statusCode,403);
 } finally { if (previous !== undefined) process.env.VIDEO_IMPORT_WORKER_URL = previous; }
});
test('video API validates body size, URL, id and content type before fetch', async () => configured(async () => {
 global.fetch = async () => { throw new Error('must not fetch'); };
 for (const [req,status] of [[request('POST','x'.repeat(4097)),413],[request('POST','{}'),400],[request('POST','{'),400],[request('GET','','/api/video-import?id=../../x'),400]]) { const res = response(); await handler(req,res); assert.equal(res.statusCode,status); }
 const req = request('POST','{}'); req.headers['content-type']='text/plain'; const res=response(); await handler(req,res); assert.equal(res.statusCode,415);
}));
test('video API sends only worker secret and hashed network; strips extra browser fields and worker metadata', async () => configured(async () => {
 global.fetch = async (url, options) => { assert.equal(url,'http://127.0.0.1:8787/imports'); assert.equal(options.headers.Authorization,'Bearer '+'s'.repeat(40)); assert.match(options.headers['X-Echo-Client'], /^[A-Za-z0-9_-]{43}$/); assert.deepEqual(JSON.parse(options.body), {url:'https://youtu.be/abcdefghijk'}); assert.equal(options.redirect,'error'); return new Response(JSON.stringify({id:'a'.repeat(32),status:'queued',title:'Demo',secret:'private'})); };
 const res=response(); await handler(request('POST',JSON.stringify({url:'https://youtu.be/abcdefghijk',authenticated:true})),res); assert.equal(res.statusCode,200); assert.deepEqual(res.body,{id:'a'.repeat(32),status:'queued',title:'Demo'});
}));
test('video audio is proxied within cap; oversize is rejected before success', async () => configured(async () => {
 global.fetch = async () => new Response(new Uint8Array([1,2,3]), {headers:{'content-type':'audio/mpeg'}});
 let res=response(); await handler(request('GET','','/api/video-import?id='+'b'.repeat(32)+'&audio=1'),res); assert.equal(res.statusCode,200); assert.equal(res.raw.length,3);
 global.fetch = async () => new Response(new Uint8Array([1]),{headers:{'content-type':'audio/mpeg','content-length':String(4*1024*1024+1)}});
 res=response(); await handler(request('GET','','/api/video-import?id='+'b'.repeat(32)+'&audio=1'),res); assert.equal(res.statusCode,502);
}));

test('video API supports Vercel parsed request bodies and rejects mismatched status IDs', async () => configured(async () => {
 global.fetch = async () => new Response(JSON.stringify({id:'a'.repeat(32),status:'queued'}));
 const req=request('POST'); req.body={url:'https://youtu.be/abcdefghijk'}; let res=response(); await handler(req,res); assert.equal(res.statusCode,200);
 res=response(); await handler(request('GET','','/api/video-import?id='+'b'.repeat(32)),res); assert.equal(res.statusCode,502);
}));

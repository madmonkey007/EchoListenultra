import {test} from 'node:test';import assert from 'node:assert/strict';import {readFileSync} from 'node:fs';
const config=JSON.parse(readFileSync(new URL('../../vercel.json',import.meta.url)));
test('independent static deployment has restricted headers and permits local blob media',()=>{
 const rules=Object.fromEntries(config.headers?.find(x=>x.source==='/(.*)')?.headers.map(x=>[x.key.toLowerCase(),x.value])??[]);
 assert.equal(rules['x-content-type-options'],'nosniff');assert.equal(rules['x-frame-options'],'DENY');
 const csp=rules['content-security-policy'];assert.ok(csp);assert.match(csp,/default-src 'self'/);assert.match(csp,/media-src 'self' blob:/);assert.match(csp,/img-src 'self' blob: data:/);assert.match(csp,/worker-src 'self' blob:/);assert.match(csp,/frame-ancestors 'none'/);assert.doesNotMatch(csp,/script-src[^;]*unsafe-eval/);
 assert.equal(rules['cross-origin-embedder-policy'],undefined);assert.equal(rules['cross-origin-opener-policy'],undefined);
});
test('deployment excludes evidence, payment server and machine secrets',()=>{const ignore=readFileSync(new URL('../../.vercelignore',import.meta.url),'utf8');for(const path of ['evidence','phase2','.env','.vercel'])assert.ok(ignore.includes(path));});

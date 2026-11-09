const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');
const config=JSON.parse(fs.readFileSync('vercel.json','utf8'));
const sitemap=fs.readFileSync('public/sitemap.xml','utf8');
const paths=[...sitemap.matchAll(/<loc>%SITE_ORIGIN%(\/[^<]*)<\/loc>/g)].map(m=>m[1]).filter(p=>p!=='/');
const redirects=config.redirects;

test('every sitemap page permanently redirects its trailing-slash variant to the sitemap form',()=>{
 assert.ok(paths.length>=8,'sitemap parsed: '+paths.length+' pages');
 for(const p of paths){
  const hit=redirects.find(r=>r.source===p+'/'&&r.destination===p);
  assert.ok(hit,p+' redirect present');
  // Literal 301 via statusCode: Vercel's permanent:true emits 308, not 301.
  assert.equal(hit.statusCode,301,p+' is a permanent 301');
  assert.equal(hit.permanent,undefined,p+' must not rely on the 308-emitting permanent flag');
 }
});

test('no reverse redirects, no self-redirects, root stays untouched',()=>{
 for(const r of redirects){
  assert.ok(r.destination==='/'||!r.destination.endsWith('/'),r.source+' must not point at a trailing-slash URL');
 }
 for(const p of paths){
  assert.ok(!redirects.some(r=>r.source===p&&r.destination===p),p+' must never redirect to itself');
  assert.ok(!redirects.some(r=>r.destination===p+'/'),p+' must never be the redirect target');
 }
 assert.ok(!redirects.some(r=>r.source==='/'||r.source==='//'),'root never redirects');
});

test('each redirect target is still served by the existing rewrite (redirect runs first, then serve)',()=>{
 const rewriteSources=new Set(config.rewrites.map(r=>r.source));
 for(const p of paths){
  assert.ok(rewriteSources.has(p),p+' rewrite still present');
 }
 // The noindex utility page is redirected too even though it stays out of the sitemap.
 assert.ok(redirects.some(r=>r.source==='/settings/'&&r.destination==='/settings'&&r.statusCode===301),'/settings/ covered');
});

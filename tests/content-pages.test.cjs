const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const {renderPublicHtml}=require('../lib/render-public-pages.tsx');
const {renderSeoTemplate}=require('../lib/static-seo.ts');
const {SITE_ORIGIN}=require('../lib/site-meta.ts');
const home=renderSeoTemplate(fs.readFileSync('index.html','utf8'));
const NEW=['/instagram-reel-transcript','/reels-transcript','/instagram-reel-transcript-generator','/instagram-video-transcript'];
const rendered=Object.fromEntries(NEW.map(p=>[p,renderPublicHtml(home,p)]));
const main=p=>rendered[p].match(/<main id="main-content"[^>]*>([\s\S]*)<\/main>/)[1];
const words=p=>main(p).replace(/<[^>]+>/g,' ').split(/\s+/).filter(Boolean).length;
const h1s=p=>[...rendered[p].matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/g)].map(m=>m[1].replace(/<[^>]+>/g,'').trim());

test('four content pages render with self canonical, index robots and exactly one H1',()=>{
 for(const p of NEW){
  assert.ok(rendered[p],p+' renders');
  assert.ok(rendered[p].includes(`rel="canonical" href="${SITE_ORIGIN}${p}"`),p+' canonical');
  assert.ok(!rendered[p].includes(`rel="canonical" href="${SITE_ORIGIN}${p}/"`),p+' canonical has no trailing slash');
  assert.match(rendered[p],/name="robots" content="index, follow"/);
  assert.equal(h1s(p).length,1,p+' single H1');
 }
});
test('titles are 50-60 chars and unique; descriptions 140-160 and unique; H1s unique',()=>{
 const titles=NEW.map(p=>rendered[p].match(/<title>(.*?)<\/title>/)[1]);
 const descs=NEW.map(p=>rendered[p].match(/name="description" content="([^"]+)"/)[1]);
 for(const t of titles)assert.ok(t.length>=50&&t.length<=60,`title ${t.length} chars: ${t}`);
 for(const d of descs)assert.ok(d.length>=140&&d.length<=160,`description ${d.length} chars: ${d}`);
 assert.equal(new Set(titles).size,4,'titles unique');assert.equal(new Set(descs).size,4,'descriptions unique');
 // No collision with the established public pages either.
 const oldTitles=['/about','/help','/privacy','/contact','/tiktok-transcript','/settings'].map(p=>renderPublicHtml(home,p).match(/<title>(.*?)<\/title>/)[1]);
 for(const t of titles)assert.ok(!oldTitles.includes(t));
 const allH1=h1s(NEW[0]).concat(...NEW.map(p=>h1s(p)));
 assert.equal(new Set(NEW.map(p=>h1s(p)[0])).size,4,'H1s unique among the four');
});
test('each page has at least three H2 sections and a plain 5-8 question FAQ',()=>{
 for(const p of NEW){
  const m=main(p);
  assert.ok([...m.matchAll(/<h2\b/g)].length>=3,p+' >=3 H2');
  const faq=m.match(/<section class="faq-plain"[\s\S]*?(?=<section class="related-pages")/);
  assert.ok(faq,p+' has FAQ section');
  const q=[...faq[0].matchAll(/<h3\b/g)].length;
  assert.ok(q>=5&&q<=8,p+` FAQ questions ${q}`);
  assert.ok(!m.includes('<details'),p+' FAQ is not collapsed');
  assert.ok(!m.includes('accordion'),p+' FAQ is not an accordion');
 }
});
test('each page body renders 400-900 English words without JavaScript',()=>{
 for(const p of NEW)assert.ok(words(p)>=400&&words(p)<=900,p+' words='+words(p));
});
test('each page embeds the working transcription form',()=>{
 for(const p of NEW){
  const m=main(p);
  assert.match(m,/class="reel-form"/);assert.match(m,/id="reel-url"/);assert.match(m,/Get transcript/);
 }
});
test('pages cross-link each other and the home page with target-phrased anchors',()=>{
 for(const p of NEW){
  const m=main(p);
  for(const other of NEW.filter(x=>x!==p))assert.ok(m.includes(`href="${other}"`),p+' links '+other);
  assert.ok(m.includes('href="/"'),p+' links home');
 }
});
test('homepage source gains only the footer link group and keeps its frozen head',()=>{
 const before=rendered; // silence lint
 const html=home;
 assert.match(html,/Instagram Transcript &amp; SRT — ReelTranscript<\/title>/);
 for(const p of NEW)assert.ok(html.includes(`href="${p}"`),'homepage footer links to '+p);
 const foot=html.match(/<footer class="site-footer site-container"><nav class="footer-content-links"[\s\S]*?<\/footer>/);
 assert.ok(foot,'footer link group present');
 assert.ok(!foot[0].includes('Instagram Transcript<br'), 'footer block adds no headings');
});
test('routing and sitemap cover exactly the nine public URLs',()=>{
 const {rewrites}=JSON.parse(fs.readFileSync('vercel.json','utf8'));
 for(const p of NEW)assert.ok(rewrites.some(x=>x.source===p&&x.destination===p+'.html'),p+' rewrite');
 const sitemap=renderSeoTemplate(fs.readFileSync('public/sitemap.xml','utf8'));
 const urls=[...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(m=>m[1]);
 assert.equal(urls.length,9,'sitemap has 9 URLs');
 for(const p of NEW)assert.ok(urls.includes(SITE_ORIGIN+p),'sitemap includes '+p);
});

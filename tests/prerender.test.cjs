const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const paths=['/','/about','/help','/privacy','/contact'];
test('public paths have independent raw HTML metadata and exactly one topic H1',()=>{
 const {renderPublicHtml}=require('../lib/render-public-pages.tsx');const {renderSeoTemplate}=require('../lib/static-seo.ts');const {SITE_ORIGIN}=require('../lib/site-meta.ts');const home=renderSeoTemplate(fs.readFileSync('index.html','utf8'));const titles=new Set(),descs=new Set();
 for(const path of paths){const h=renderPublicHtml(home,path);assert.ok(h);const title=h.match(/<title>(.*?)<\/title>/)[1];const desc=h.match(/name="description" content="([^"]+)"/)[1];titles.add(title);descs.add(desc);assert.ok(h.includes(`rel="canonical" href="${SITE_ORIGIN}${path}"`));assert.equal([...h.matchAll(/<h1\b/g)].length,1);if(path!=='/')assert.ok(!h.includes('id="static-example-title"'));}
 assert.equal(titles.size,5);assert.equal(descs.size,5);assert.equal(renderPublicHtml(home,'/'),home);assert.equal(renderPublicHtml(home,'/nonexistent-x9'),null);
});
test('only public pages and noindex appearance settings resolve',()=>{
 const {rewrites}=JSON.parse(fs.readFileSync('vercel.json','utf8'));assert.ok(!rewrites.some(x=>x.source.includes('((?!')));for(const p of paths.slice(1))assert.ok(rewrites.some(x=>x.source===p&&x.destination===p+'.html'));assert.ok(rewrites.some(x=>x.source==='/settings'&&x.destination==='/settings.html'));for(const p of ['/library','/add','/vocabulary','/account','/login','/auth/callback','/player/:id'])assert.ok(!rewrites.some(x=>x.source===p));
});
test('settings raw HTML has only appearance controls, a self canonical and noindex',()=>{
 const {renderPublicHtml}=require('../lib/render-public-pages.tsx');const {renderSeoTemplate}=require('../lib/static-seo.ts');
 const html=renderPublicHtml(renderSeoTemplate(fs.readFileSync('index.html','utf8')),'/settings');
 assert.match(html,/reelstranscript.com\/settings/);assert.match(html,/name="robots" content="noindex, follow"/);assert.equal([...html.matchAll(/<h1\b/g)].length,1);
 assert.match(html,/Theme mode/);assert.match(html,/>Light</);assert.match(html,/>Dark</);assert.doesNotMatch(html,/Gemini|Deepgram|Model Provider|API key|Target Language/i);
});
test('share cards on five routes carry one large-image card each; other pages keep the plain summary card',()=>{
 const {renderPublicHtml}=require('../lib/render-public-pages.tsx');const {renderSeoTemplate}=require('../lib/static-seo.ts');const {shareImages,SITE_ORIGIN}=require('../lib/site-meta.ts');
 const home=renderSeoTemplate(fs.readFileSync('index.html','utf8'));
 const carded=['/','/instagram-reel-transcript','/reels-transcript','/instagram-reel-transcript-generator','/instagram-video-transcript'];
 for(const path of carded){
  const html=path==='/'?home:renderPublicHtml(home,path);assert.ok(html);
  const image=SITE_ORIGIN+shareImages[path].image,alt=shareImages[path].alt;
  assert.match(html,new RegExp(`<meta property="og:image" content="${image}" />`));
  assert.match(html,/property="og:image:width" content="1200"/);assert.match(html,/property="og:image:height" content="630"/);
  assert.match(html,/property="og:image:type" content="image\/png"/);
  assert.match(html,new RegExp(`<meta property="og:image:alt" content="${alt}" />`));
  assert.match(html,/name="twitter:card" content="summary_large_image"/);
  assert.match(html,new RegExp(`<meta name="twitter:image" content="${image}" />`));
  assert.match(html,new RegExp(`<meta name="twitter:image:alt" content="${alt}" />`));
  assert.equal([...html.matchAll(/name="twitter:card"/g)].length,1);
  assert.equal([...html.matchAll(/property="og:image/g)].length,5);
  const h1=html.match(/<h1[^>]*>([^<]+)<\/h1>/)[1];
  assert.equal(alt,h1);
 }
 for(const path of ['/about','/help','/contact','/privacy','/settings']){
  const html=renderPublicHtml(home,path);assert.ok(html);
  assert.doesNotMatch(html,/og:image|twitter:image/);
  assert.match(html,/name="twitter:card" content="summary" \/>/);
 }
 assert.match(home,/rel="apple-touch-icon" href="\/logo-512.png"/);
});
test('public navigation includes only product pages and settings stays in the footer',()=>{
 const {renderPublicHtml}=require('../lib/render-public-pages.tsx');const {renderSeoTemplate}=require('../lib/static-seo.ts');
 const html=renderPublicHtml(renderSeoTemplate(fs.readFileSync('index.html','utf8')),'/about');
 const nav=html.match(/<nav[^>]*id="site-navigation"[\s\S]*?<\/nav>/)[0];
 assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),['/','/help','/about','/contact']);
 assert.doesNotMatch(html,/href="\/(?:library|vocabulary|account|add|login|player)/);
 assert.match(html,/<footer[\s\S]*href="\/settings"/);
});

const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const paths=['/','/about','/help','/privacy','/contact','/tiktok-transcript'];
test('six public paths have independent raw HTML metadata and exactly one topic H1',()=>{
 const {renderPublicHtml}=require('../lib/render-public-pages.tsx');const {renderSeoTemplate}=require('../lib/static-seo.ts');const {SITE_ORIGIN}=require('../lib/site-meta.ts');const home=renderSeoTemplate(fs.readFileSync('index.html','utf8'));const titles=new Set(),descs=new Set();
 for(const path of paths){const h=renderPublicHtml(home,path);assert.ok(h);const title=h.match(/<title>(.*?)<\/title>/)[1];const desc=h.match(/name="description" content="([^"]+)"/)[1];titles.add(title);descs.add(desc);assert.ok(h.includes(`rel="canonical" href="${SITE_ORIGIN}${path}"`));assert.equal([...h.matchAll(/<h1\b/g)].length,1);if(path!=='/')assert.ok(!h.includes('id="static-example-title"'));}
 assert.equal(titles.size,6);assert.equal(descs.size,6);assert.equal(renderPublicHtml(home,'/'),home);assert.equal(renderPublicHtml(home,'/nonexistent-x9'),null);
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
test('public navigation includes only product pages and settings stays in the footer',()=>{
 const {renderPublicHtml}=require('../lib/render-public-pages.tsx');const {renderSeoTemplate}=require('../lib/static-seo.ts');
 const html=renderPublicHtml(renderSeoTemplate(fs.readFileSync('index.html','utf8')),'/about');
 const nav=html.match(/<nav[^>]*id="site-navigation"[\s\S]*?<\/nav>/)[0];
 assert.deepEqual([...nav.matchAll(/href="([^"]+)"/g)].map(m=>m[1]),['/','/help','/about','/contact']);
 assert.doesNotMatch(html,/href="\/(?:library|vocabulary|account|add|login|player)/);
 assert.match(html,/<footer[\s\S]*href="\/settings"/);
});

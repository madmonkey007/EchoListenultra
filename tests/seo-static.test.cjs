const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('static landing copy has one keyword H1 and truthful metadata',()=>{
 const html=fs.readFileSync('index.html','utf8');
 const heads=[...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)];
 assert.equal(heads.length,1);assert.match(heads[0][1],/instagram transcript/i);
 const title=html.match(/<title>(.*?)<\/title>/)[1];assert.ok(title.length<=60);assert.match(title,/instagram transcript/i);assert.match(title,/ReelTranscript$/);
 const desc=html.match(/name="description" content="([^"]*)"/)[1];assert.match(desc,/instagram transcript/i);assert.ok(desc.length>=140 && desc.length<=160);
 const noScript=html.match(/<noscript>([\s\S]*?)<\/noscript>/)[1];assert.doesNotMatch(noScript,/<h1|listening|vocabulary|stored|practice/i);assert.match(noScript,/JavaScript/);
});
test('one production origin renders every static URL independently of deployment host',()=>{
 const ts=require('typescript');
 require.extensions['.ts']=(module,filename)=>module._compile(ts.transpileModule(fs.readFileSync(filename,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,filename);
 const {renderSeoTemplate}=require('../lib/static-seo.ts');
 const {origin}=require('../lib/site-config.json');
 assert.equal(origin,'https://'+'reelstranscript.com');
 const html=renderSeoTemplate(fs.readFileSync('index.html','utf8'));
 assert.ok(html.includes(`rel="canonical" href="${origin}/"`));
 assert.ok(html.includes(`property="og:url" content="${origin}/"`));
 for(const name of ['robots.txt','sitemap.xml']) {
  const rendered=renderSeoTemplate(fs.readFileSync(`public/${name}`,'utf8'));
  assert.doesNotMatch(rendered,/%SITE_ORIGIN%/);
  assert.ok(rendered.includes(origin));
 }
 const manifest=JSON.parse(fs.readFileSync('public/manifest.json','utf8'));
 assert.equal(manifest.start_url,'/library');assert.equal(manifest.scope,'/');
});

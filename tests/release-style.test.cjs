const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
test('compiled reset retains the original production cascade and theme tokens',async()=>{
 const html=fs.readFileSync('index.html','utf8');
 assert.ok(html.indexOf('/website.css')<html.indexOf('/tailwind.css'));
 assert.doesNotMatch(html,/<script[^>]+src="https:\/\/cdn\./);
 const config=(await import('../tailwind.config.js')).default;
 assert.equal(config.darkMode,'class');
 assert.deepEqual(config.theme.extend.colors,{primary:'#367f71',accent:'#9ce6c4','background-dark':'#10171e','surface-dark':'#19242d','background-light':'#f6f8f7','surface-light':'#ffffff'});
 assert.deepEqual(config.theme.extend.fontFamily,{display:['Space Grotesk','sans-serif'],body:['Plus Jakarta Sans','sans-serif']});
});
test('public rebrand preserves existing local database identifiers',()=>{
 for(const file of ['views/AddSessionView.tsx','views/PlayerView.tsx']) {
  const source=fs.readFileSync(file,'utf8');
  const literal=source.match(/const DB_NAME = ([^;]+);/)[1];
  assert.equal(Function('return '+literal)(),'Echo'+'ListenStorage');
 }
 const draft=fs.readFileSync('lib/import-draft.ts','utf8').match(/const DATABASE = ([^;]+);/)[1];
 assert.equal(Function('return '+draft)(),'Echo'+'ListenImportDraft');
});

test('production minification does not restore retired brand literals',()=>{
 const {transformSync}=require('esbuild');
 for(const file of ['views/AddSessionView.tsx','views/PlayerView.tsx','lib/import-draft.ts']) {
  const source=fs.readFileSync(file,'utf8');
  const expression=source.match(/const (?:DB_NAME|DATABASE) = ([^;]+);/)[1];
  const built=transformSync('console.log('+expression+');',{minify:true}).code;
  assert.equal(built.includes('Echo'+'Listen'),false,file);
 }
});

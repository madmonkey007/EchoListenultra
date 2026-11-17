const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const path=require('path');
const root=process.cwd();
const read=p=>fs.readFileSync(path.join(root,p),'utf8');

const SOURCE_DIRS=['views','components'];
const sourceFiles=SOURCE_DIRS.flatMap(d=>fs.readdirSync(path.join(root,d)).filter(f=>f.endsWith('.tsx')).map(f=>path.join(d,f))).concat(['App.tsx']);

function glyphsUsed(){
 const names=new Set();
 for(const rel of sourceFiles){
  const src=read(rel);
  for(const line of src.split('\n')){
   const onIconLine=/material-symbols-outlined/.test(line);
   if(!onIconLine&&!/icon:\s*'/.test(line))continue;
   // Quoted strings on icon lines that are NOT glyph names: comparison
   // operands, analytics event names, and DOM attribute names.
   const cleaned=line
    .replace(/[=!]==?\s*'[^']*'/g,'')
    .replace(/\(\s*\[[^\]]*\]\s*as\s+const\s*\)/g,'')
    .replace(/trackEvent\('[^']*'\)/g,'')
    .replace(/removeAttribute\('[^']*'\)/g,'')
    .replace(/setAttribute\('[^']*'\s*,/g,'');
   for(const m of cleaned.matchAll(/material-symbols-outlined[^>]*>([a-z_]+)</g))names.add(m[1]);
   for(const m of cleaned.matchAll(/'([a-z_]{2,})'/g))names.add(m[1]);
  }
 }
 return [...names].filter(n=>/^[a-z_]+$/.test(n)&&n.length>=2);
}

test('every glyph name used in source resolves in the inline icon layer',()=>{
 const icons=read('lib/icons.ts');
 const iconBlock=icons.slice(icons.indexOf('ICONS: Record'),icons.indexOf('ALIAS: Record'));
 const aliasBlock=icons.slice(icons.indexOf('ALIAS: Record'),icons.indexOf('const SVG_NS'));
 const known=new Set([...iconBlock.matchAll(/"([a-z_]+)":/g)].map(m=>m[1]));
 for(const m of aliasBlock.matchAll(/"([a-z_]+)":"([a-z_]+)"/g)){known.add(m[1]);known.add(m[2]);}
 const used=glyphsUsed();
 assert.ok(used.length>=15,'glyph inventory is non-trivial: '+used.length);
 const missing=used.filter(n=>!known.has(n));
 assert.deepEqual(missing,[],'unmapped glyphs (would render as raw text or blank): '+missing.join(', '));
});

test('the Material Symbols font is fully retired from the document',()=>{
 const html=read('index.html');
 assert.ok(!html.includes('fonts.googleapis.com'),'no Google Fonts CDN');
 assert.ok(!html.includes('Material'),'no Material Symbols font reference');
 assert.ok(html.includes('class="light"'),'light is the shipped default');
 assert.ok(html.includes('data-icons="inline"'),'icon-layer body hook present');
});

test('redesign layer loads after the legacy stylesheets and only from local assets',()=>{
 const html=read('index.html');
 const tail=html.indexOf('/tailwind.css'),redesign=html.indexOf('/assets/redesign.css');
 assert.ok(tail>0&&redesign>tail,'redesign.css link exists after tailwind.css');
 assert.ok(!/href="\/redesign\.css"/.test(html),'redesign.css lives under /assets/ so the service worker can precache it');
});

test('theme hexes agree between the boot script and the redesign tokens',()=>{
 const html=read('index.html');
 const css=read('public/assets/redesign.css');
 const lightBg=css.match(/--bg:\s*(#[0-9a-f]{6})\s*;/);
 const darkBlock=css.slice(css.indexOf('html.dark'));
 const darkBg=darkBlock.match(/--bg:\s*(#[0-9a-f]{6})\s*;/);
 assert.equal(lightBg[1],'#f6f1e6','light plane');
 assert.equal(darkBg[1],'#12100d','dark plane');
 assert.ok(html.includes(`dark ? '${darkBg[1]}' : '${lightBg[1]}'`),'boot script paints both planes');
 assert.ok(html.includes(`content="${lightBg[1]}"`),'static theme-color meta is the default plane');
});

test('shell specimen times match the client-side example exactly',()=>{
 const html=read('index.html');
 const comp=read('components/ReelTranscriber.tsx');
 const shellTimes=[...html.matchAll(/<time>([\d: –]+)<\/time>/g)].map(m=>m[1]);
 const exampleBlock=comp.slice(comp.indexOf('const EXAMPLE'),comp.indexOf('];',comp.indexOf('const EXAMPLE')));
 const compTimes=[...exampleBlock.matchAll(/'([\d: –]+)'/g)].map(m=>m[1]);
 assert.deepEqual(shellTimes,compTimes,'prerendered shell and React example print identical strings');
 for(const t of shellTimes)assert.ok(!t.includes('.'),'whole seconds only, got '+t);
});

test('self-hosted fonts referenced by the redesign layer all exist',()=>{
 const css=read('public/assets/redesign.css');
 const refs=[...css.matchAll(/url\("?(\/assets\/fonts\/[^")]+)"?\)/g)].map(m=>m[1]);
 assert.ok(refs.length>=4,'font refs found: '+refs.length);
 for(const ref of new Set(refs)){
  assert.ok(fs.existsSync(path.join(root,'public',ref)),'missing font file: '+ref);
 }
});

test('FAQ single source feeds shell, React section, and JSON-LD',()=>{
 const faq=read('lib/home-faq.ts');
 const landing=read('views/LandingView.tsx');
 const seo=read('lib/static-seo.ts');
 assert.ok(landing.includes('HOME_FAQ')&&landing.includes('FAQ_TITLE'),'LandingView renders the shared array');
 assert.ok(/buildFaqSectionHtml\(\)[\s\S]*?for\s*\(const pathname of prerenderPaths\)[\s\S]*?buildFaqJsonLd\(\)/.test(seo),'shell FAQ is injected before inner pages derive; JSON-LD after, so it stays home-only');
 assert.ok(!read('index.html').includes('faq-section'),'source shell stays clean — FAQ is injected at build time');
 const questions=[...faq.matchAll(/question: '([^']+)'/g)].map(m=>m[1]);
 assert.equal(questions.length,6,'six FAQ pairs');
 const minutes=faq.match(/Up to \$\{limitMinutes\(\)\} minutes/);
 assert.ok(minutes,'the duration answer derives from transcription-limit, not a hardcoded number');
});

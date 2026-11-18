const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const React=require('react');const {renderToStaticMarkup:render}=require('react-dom/server');const {MemoryRouter,Link}=require('react-router-dom');
const {default:SiteHeader,Brand}=require('../components/SiteHeader.tsx');
const {buildFaqSectionHtml,buildFaqJsonLd,HOME_FAQ}=require('../lib/home-faq.ts');
const {limitMinutes}=require('../lib/transcription-limit.ts');
const home=fs.readFileSync('index.html','utf8');
const headerOf=()=>home.match(/<header class="site-header">[\s\S]*?<\/header>/)[0];
const footerOf=()=>home.match(/<footer class="site-footer site-container">[\s\S]*?<\/footer>/)[0];

test('home static header is byte-identical to the SSR header rendered at /',()=>{
 const header=render(React.createElement(MemoryRouter,{initialEntries:['/']},React.createElement(SiteHeader,null)));
 assert.match(header,/^<header class="site-header">/);
 assert.equal(headerOf(),header);
 for(const label of ['Home','How it works','About','Contact'])assert.ok(headerOf().includes(`>${label}</a>`),label);
 assert.ok(headerOf().includes('aria-label="Contact and feedback"'));
 assert.ok(headerOf().includes('aria-label="Theme settings"'));
});

test('home static footer carries the brand, tagline, five page links and the four unchanged guide links',()=>{
 const links=[['/about','About'],['/contact','Contact'],['/privacy','Data &amp; privacy'],['/help','How it works'],['/settings','Settings']];
 const guides=[['/instagram-reel-transcript','Instagram reel transcript'],['/reels-transcript','Reels transcript'],['/instagram-reel-transcript-generator','Instagram reel transcript generator'],['/instagram-video-transcript','Instagram video transcript']];
 const footer=render(React.createElement(MemoryRouter,{initialEntries:['/']},React.createElement(React.Fragment,null,React.createElement(Brand,null),React.createElement('p',null,'Public Reels. Readable transcripts. Timed subtitles.'),links.map(([to,label])=>React.createElement(Link,{to,key:to},label.replace('&amp;','&'))),React.createElement('nav',{className:'footer-content-links','aria-label':'Transcript guides'},guides.map(([to,label])=>React.createElement(Link,{to,key:to},label))))));
 assert.equal(footerOf(),`<footer class="site-footer site-container">${footer}</footer>`);
 for(const [path,label] of [...links,...guides])assert.ok(footerOf().includes(`href="${path}" data-discover="true">${label}</a>`),path);
});

test('FAQ first answer names reel and feed-video links; the other five answers are untouched',()=>{
 assert.equal(HOME_FAQ.length,6);
 assert.equal(HOME_FAQ[0].answer,'A public Instagram Reel or feed-video link: instagram.com/reel/…/, instagram.com/reels/…/, or a instagram.com/p/…/ post that actually contains video. Private accounts, Stories, profile links and photo-only posts cannot be processed.');
 const others=[
  'No. There is no sign-up and no Instagram login. A public Reel link is the only thing the tool needs.',
  'A transcript with timestamps you can copy as text, plus subtitle files you can download as SRT, Markdown or plain text.',
  `Up to ${limitMinutes()} minutes. A longer Reel is rejected with an error instead of returning a partial transcript.`,
  'It is generated automatically, so names, accents and background noise can come out wrong. Check anything important against the audio.',
  'No. The link and the result stay on this page and are cleared when you refresh, so copy or download what you want to keep.'];
 for(const [i,answer] of others.entries())assert.equal(HOME_FAQ[i+1].answer,answer);
 const section=buildFaqSectionHtml();
 assert.ok(section.includes('feed-video link'));
 assert.ok(!section.includes('other video platforms are not supported'));
 assert.ok(buildFaqJsonLd().includes('feed-video link'));
});

test('landing copy, H1 and the static example are untouched',()=>{
 assert.ok(home.includes('<h1>Instagram Transcript from Any Reel</h1>'));
 for(const stamp of ['00:00 – 00:05','00:05 – 00:10','00:10 – 00:14'])assert.ok(home.includes(`<time>${stamp}</time>`),stamp);
 assert.ok(home.includes('<title>Instagram Transcript &amp; SRT — ReelTranscript</title>'));
 assert.ok(home.includes('<link rel="canonical" href="%SITE_ORIGIN%/" />'));
});

test('public-page markup ships no icon-font glyph text',()=>{
 const glyphText=/material-symbols-outlined"[^>]*>\s*[a-z_]/;
 for(const file of ['index.html','components/SiteHeader.tsx','components/ReelTranscriber.tsx','components/ReelResult.tsx','views/LandingView.tsx','views/ContactView.tsx','App.tsx'])
  assert.doesNotMatch(fs.readFileSync(file,'utf8'),glyphText,file);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for (const ext of ['.ts','.tsx']) require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);

test('feedback drafts go to the actual published inbox and preserve typed Unicode safely',()=>{
 const {buildSupportDraft,SUPPORT_EMAIL}=require('../lib/support.ts');
 const draft=buildSupportDraft({category:'bug',message:'字幕在停顿后不同步 & speed 1.25x',replyEmail:'reader@example.com'});
 const url=new URL(draft.mailto);
 assert.equal(url.protocol,'mailto:');assert.equal(url.pathname,'dihou008@gmail.com');assert.equal(SUPPORT_EMAIL,'dihou008@gmail.com');
 assert.match(url.searchParams.get('body'),/字幕在停顿后不同步 & speed 1.25x/);
 assert.match(url.searchParams.get('body'),/reader@example.com/);
});
test('diagnostics never copy full user-agent, file, transcript or key fields',()=>{
 const {buildSupportDraft}=require('../lib/support.ts');
 const input={category:'transcription',message:'The transcription failed.',includeDiagnostics:true,userAgent:'Mozilla/5.0 secret-device Chrome/130.0 Safari/537.36',apiKey:'secret-key',fileName:'private-recording.wav',transcript:'private transcript',url:'https://example.com/?token=secret'};
 const body=new URL(buildSupportDraft(input).mailto).searchParams.get('body');
 assert.match(body,/Browser: Chrome/);assert.doesNotMatch(body,/secret|private|Mozilla|token|example.com/);
 assert.doesNotMatch(new URL(buildSupportDraft({...input,includeDiagnostics:false}).mailto).searchParams.get('body'),/Browser:/);
});
test('unknown categories cannot alter mail headers',()=>{
 const {buildSupportDraft}=require('../lib/support.ts');
 const draft=buildSupportDraft({category:'bug\r\nBcc:attacker@example.com',message:'Test issue'});
 assert.equal(new URL(draft.mailto).searchParams.get('subject'),'EchoListen feedback — Question');
 assert.equal(new URL(draft.mailto).searchParams.has('bcc'),false);
});
test('contact page provides email fallback and explains draft handoff without a fake sent state',()=>{
 const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {MemoryRouter}=require('react-router-dom');
 const Contact=require('../views/ContactView.tsx').default;
 const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(Contact)));
 assert.match(html,/dihou008@gmail.com/);assert.match(html,/type="email"/);assert.match(html,/optional/i);assert.match(html,/Prepare email/);assert.match(html,/not sent/i);assert.doesNotMatch(html,/Message sent|We received your message/);
});

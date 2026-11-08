const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');const {spawnSync}=require('node:child_process');
for(const ext of ['.ts','.tsx'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const React=require('react');const {renderToStaticMarkup:render}=require('react-dom/server');
const fail=(body,status=422)=>require('../lib/reel-client.ts').requestReelTranscript('url',undefined,async()=>({ok:false,status,json:async()=>body}));
test('ASR original duration accepts 179/180 and rejects 181 with no VAD substitution',()=>{
 const r=spawnSync('python3',['-c',`import sys;sys.path.insert(0,'server/transcription');from turbo import validate_response_duration,MAX_AUDIO_SECONDS
assert MAX_AUDIO_SECONDS==180
for d in (179,180): assert validate_response_duration({'result':{'transcription_info':{'duration':d,'duration_after_vad':1}}})==d
try: validate_response_duration({'result':{'transcription_info':{'duration':181,'duration_after_vad':1}}})
except ValueError as e: assert str(e).startswith('too_long:')
else: raise AssertionError('181 must fail')`],{encoding:'utf8'});assert.equal(r.status,0,r.stderr);
});
for(const status of [422,502])test(`too_long ${status} includes duration in its own two-line message`,async()=>{
 await assert.rejects(fail({error:'too_long',limit_seconds:180,duration_seconds:194.2},status),e=>e.message==='This Reel is 3:14 long — longer than the 3-minute limit.\nTry a shorter Reel.');
});
test('too_long without duration uses the interface limit and remains actionable',async()=>{
 await assert.rejects(fail({error:'too_long',limit_seconds:240}),e=>e.message==='This Reel is longer than our 4-minute limit.\nTry a shorter Reel.');
});
test('invalid and inaccessible links have a link-specific message',async()=>{
 for(const error of ['invalid_url','private_or_unavailable','no_audio'])await assert.rejects(fail({error}),/public Instagram Reel link/);
});
test('upstream failures explicitly identify our service rather than blaming the link',async()=>{
 for(const error of ['fetch_failed','timeout','unexpected'])await assert.rejects(fail({error},502),/problem on our side, not with your link/);
});
test('three error categories render separate lines and distinct copy',()=>{
 const {ReelErrorMessage}=require('../components/ReelTranscriber.tsx');
 for(const message of ['This Reel is longer than our 3-minute limit.\nTry a shorter Reel.','Use a public Instagram Reel link.','There is a problem on our side, not with your link.']){
 const html=render(React.createElement(ReelErrorMessage,{message}));assert.match(html,/role="alert"/);assert.ok(html.includes(message.split('\n')[0]));if(message.includes('\n'))assert.match(html,/<br\/>/);
 }
});
test('waiting text has elapsed time and an advisory after 90 seconds',()=>{
 const {TranscriptionWait}=require('../components/ReelTranscriber.tsx');
 const a=render(React.createElement(TranscriptionWait,{elapsed:45}));assert.match(a,/Transcribing… usually 10–30s/);assert.match(a,/45s elapsed/);assert.doesNotMatch(a,/still working/);
 const b=render(React.createElement(TranscriptionWait,{elapsed:91}));assert.match(b,/This one is taking longer than usual, still working…/);
});
test('transport exceptions use our service message',async()=>{
 await assert.rejects(require('../lib/reel-client.ts').requestReelTranscript('url',undefined,async()=>{throw new TypeError('Failed to fetch')}),/problem on our side, not with your link/);
});
test('unreadable and incomplete upstream responses use our service message',async()=>{
 for(const response of [{ok:true,json:async()=>{throw new Error('bad json')}},{ok:true,json:async()=>({})},{ok:true,json:async()=>null}])
 await assert.rejects(require('../lib/reel-client.ts').requestReelTranscript('url',undefined,async()=>response),/problem on our side, not with your link/);
});

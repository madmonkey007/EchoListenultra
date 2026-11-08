const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
require.extensions['.ts']=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText,f);
test('Reel client sends URL only and preserves returned SRT and cue timestamps',async()=>{
 const {requestReelTranscript}=require('../lib/reel-client.ts');const calls=[];
 const data={status:'transcribed',text:'Hello.',srt:'1\n00:00:00,123 --> 00:00:01,456\nHello.\n\n',cues:[{start:.123,end:1.456,text:'Hello.'}]};
 const result=await requestReelTranscript('https://www.instagram.com/reel/DeejOF4AfBe/',undefined,async(url,options)=>{calls.push([url,options]);return {ok:true,json:async()=>data};});
 assert.equal(calls[0][0],'/api/reel-transcribe');assert.deepEqual(JSON.parse(calls[0][1].body),{url:'https://www.instagram.com/reel/DeejOF4AfBe/'});assert.equal(result.srt,data.srt);assert.deepEqual(result.cues,data.cues);
});
test('empty audio is a distinct result and oversized errors are actionable',async()=>{
 const {requestReelTranscript}=require('../lib/reel-client.ts');
 const result=await requestReelTranscript('url',undefined,async()=>({ok:true,json:async()=>({status:'no_speech_detected',text:'',srt:'',cues:[]})}));assert.equal(result.status,'no_speech_detected');
 await assert.rejects(requestReelTranscript('url',undefined,async()=>({ok:false,status:413,json:async()=>({error:'payload_too_large'})})),/problem on our side, not with your link/i);
});
test('missing output fails without creating replacement SRT or timestamps',async()=>{
 const {requestReelTranscript}=require('../lib/reel-client.ts');
 await assert.rejects(requestReelTranscript('url',undefined,async()=>({ok:true,json:async()=>({status:'transcribed',text:'hello',cues:[]})})),/problem on our side/i);
});
test('initial HTML contains the real timestamped example without JavaScript',()=>{
 const html=fs.readFileSync('index.html','utf8');assert.match(html,/00:00\.000/);assert.match(html,/Thomas Skipper/);assert.match(html,/DbQzbzrAJ-V/);
});

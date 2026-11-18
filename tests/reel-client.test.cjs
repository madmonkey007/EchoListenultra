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
 await assert.rejects(requestReelTranscript('url',undefined,async()=>({ok:false,status:413,json:async()=>({error:'payload_too_large'})})),/didn't go through this time/i);
});
test('missing output fails without creating replacement SRT or timestamps',async()=>{
 const {requestReelTranscript}=require('../lib/reel-client.ts');
 await assert.rejects(requestReelTranscript('url',undefined,async()=>({ok:true,json:async()=>({status:'transcribed',text:'hello',cues:[]})})),/didn't go through this time/i);
});
test('initial HTML contains the real timestamped example without JavaScript',()=>{
 const html=fs.readFileSync('index.html','utf8');assert.match(html,/00:00 – 00:05/);assert.match(html,/Thomas Skipper/);assert.match(html,/DbQzbzrAJ-V/);
});
test('quota exhaustion is named honestly; unknown failures keep a retryable generic',()=>{
 const {reelErrorMessage}=require('../lib/reel-client.ts');
 assert.equal(reelErrorMessage({error:'quota_exhausted',limit_seconds:180}),"Today's free transcription quota is used up.\nPlease try again tomorrow.");
 assert.equal(reelErrorMessage({error:'fetch_failed',limit_seconds:180}),"Transcription didn't go through this time.\nPlease try again in a moment — a retry usually succeeds.");
 assert.match(reelErrorMessage({error:'invalid_url',limit_seconds:180}),/doesn't look like an Instagram post link/);
});
test('five failure classes each get one distinct sentence, and none blames the server or offers a blind retry',()=>{
 const {reelErrorMessage}=require('../lib/reel-client.ts');
 const messages={
  no_video:reelErrorMessage({error:'no_video',limit_seconds:180}),
  no_speech:reelErrorMessage({error:'no_speech',limit_seconds:180}),
  private_or_unavailable:reelErrorMessage({error:'private_or_unavailable',limit_seconds:180}),
  invalid_url:reelErrorMessage({error:'invalid_url',limit_seconds:180}),
  too_long:reelErrorMessage({error:'too_long',limit_seconds:180,duration_seconds:214}),
  quota_exhausted:reelErrorMessage({error:'quota_exhausted',limit_seconds:180}),
 };
 assert.equal(messages.no_video,"This post doesn't contain a video — it's photos only.\nTry a Reel or another post that contains video.");
 assert.equal(messages.no_speech,"This video has no speech — it's music or ambient sound only.\nTry a Reel where someone is speaking.");
 assert.equal(messages.private_or_unavailable,'This post is private, deleted, or otherwise not publicly accessible.\nCheck that the link opens without logging in.');
 assert.match(messages.too_long,/longer than the 3-minute limit/);
 assert.equal(new Set(Object.values(messages)).size,6);
 for(const message of Object.values(messages))assert.ok(!message.includes('our side'),message);
 const retrying=[messages.quota_exhausted,reelErrorMessage({error:'fetch_failed',limit_seconds:180})];
 const retry=new RegExp('try again','i');
 for(const [code,message] of Object.entries(messages))if(!retrying.includes(message))assert.doesNotMatch(message,retry,code);
 for(const message of retrying)assert.match(message,retry);
});

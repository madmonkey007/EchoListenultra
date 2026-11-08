const {test}=require('node:test');const assert=require('node:assert/strict');const fs=require('node:fs');const ts=require('typescript');
for(const ext of ['.tsx','.ts'])require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true}}).outputText,f);
const React=require('react');const {renderToStaticMarkup:render}=require('react-dom/server');const {MemoryRouter}=require('react-router-dom');
const data={status:'transcribed',text:'Hello world.\n\nKeep every word.',srt:'1\n00:00:00,100 --> 00:00:01,200\nHello world.\n\n',cues:[{start:.1,end:1.2,text:'Hello world.'},{start:2,end:3,text:'Keep every word.'}],audio:{base64:'UklGRg==',mime_type:'audio/mp4'}};
test('SRT export preserves the provider cue engine output and existing filename',()=>{
 const {transcriptExport}=require('../lib/reel-result.ts');assert.deepEqual(transcriptExport(data,'srt'),{filename:'reel-transcript.srt',mime:'application/x-subrip;charset=utf-8',content:data.srt});
});
test('Markdown and plain text exports have no generated timestamps and preserve transcript text',()=>{
 const {transcriptExport}=require('../lib/reel-result.ts');for(const format of ['md','txt']){const x=transcriptExport(data,format);assert.ok(x.content.includes(data.text));assert.doesNotMatch(x.content,/00:00:00,100|-->/);assert.equal(x.filename,'reel-transcript.'+format);}
});
test('highlight uses existing cue times with gaps and boundaries unchanged',()=>{
 const {activeCueIndex}=require('../lib/reel-result.ts');for(const [time,index] of [[0,-1],[.1,0],[1.19,0],[1.2,-1],[1.8,-1],[2,1],[3,-1]])assert.equal(activeCueIndex(data.cues,time),index);
});
test('audio blob decodes original bytes without synthesizing or converting media',async()=>{
 const {resultAudioBlob}=require('../lib/reel-result.ts');const blob=resultAudioBlob(data.audio);assert.equal(blob.type,'audio/mp4');assert.equal(Buffer.from(await blob.arrayBuffer()).toString(),'RIFF');
});
test('result provides success notice, native audio player, clickable cues and three export formats',()=>{
 const Result=require('../components/ReelResult.tsx').default;const html=render(React.createElement(Result,{result:data,notice:'',onCopy:()=>{}}));
 assert.match(html,/Transcription complete/);assert.match(html,/<audio[^>]*controls/);assert.match(html,/Play segment/);for(const f of ['srt','md','txt'])assert.match(html,new RegExp('value="'+f+'"'));assert.match(html,/Copy text/);assert.match(html,/Download SRT/);
});
test('no-speech result never announces transcript success',()=>{
 const Result=require('../components/ReelResult.tsx').default;const html=render(React.createElement(Result,{result:{...data,status:'no_speech_detected',text:'',cues:[]},notice:'',onCopy:()=>{}}));assert.match(html,/No speech detected/);assert.doesNotMatch(html,/Transcription complete/);
});
test('header removes Start transcribing and exposes theme controls',()=>{
 const Header=require('../components/SiteHeader.tsx').default;const html=render(React.createElement(MemoryRouter,null,React.createElement(Header,{theme:'dark',onThemeChange:()=>{}})));assert.doesNotMatch(html,/Start transcribing/);assert.match(html,/Theme settings/);assert.match(html,/Light/);assert.match(html,/Dark/);
});
test('result adapts real provider words to the existing subtitle timing validator',()=>{
 const {resultSegments}=require('../lib/reel-result.ts');const {getSynchronizedWords,getActiveWordIndex}=require('../lib/subtitle-timing.ts');
 const result={...data,words:[{text:'Hello',start:.1,end:.5},{text:'world.',start:.5,end:1.2},{text:'Keep',start:2,end:2.2},{text:'every',start:2.2,end:2.5},{text:'word.',start:2.5,end:3}]};
 const segments=resultSegments(result);const words=getSynchronizedWords(segments[0]);assert.equal(words[0].start,.1);assert.equal(getActiveWordIndex(words,.6),1);assert.equal(getActiveWordIndex(words,1.5),-1);
});
test('missing or fragmented word timing remains sentence-only instead of inventing times',()=>{
 const {resultSegments}=require('../lib/reel-result.ts');const {getSynchronizedWords}=require('../lib/subtitle-timing.ts');
 assert.equal(getSynchronizedWords(resultSegments(data)[0]),null);
 const fragmented={...data,words:[{text:'Hel',start:.1,end:.2},{text:'lo',start:.2,end:.5},{text:'world.',start:.5,end:1.2}]};assert.equal(getSynchronizedWords(resultSegments(fragmented)[0]),null);
});

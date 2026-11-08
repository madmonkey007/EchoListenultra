const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const html = fs.readFileSync(__dirname + '/page.html', 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(script); // Check the entire browser program's syntax.
const pure = script.slice(0, script.indexOf('const DATA='));
const context = vm.createContext({});
vm.runInContext(pure, context);
function score(ref,hyp) { return JSON.parse(JSON.stringify(context.wordError(ref,hyp))); }
assert.deepEqual(score('Hello, WORLD!', 'hello world'), {substitutions:0,deletions:0,insertions:0,reference_words:2,hypothesis_words:2,wer:0});
assert.equal(score('one two three','one four three').substitutions,1);
assert.equal(score('one two three','one three').deletions,1);
assert.equal(score('one three','one two three').insertions,1);
assert.equal(score('one','one two three').wer,2);
assert.deepEqual(score('','thank you'), {substitutions:0,deletions:0,insertions:2,reference_words:0,hypothesis_words:2,wer:null});
assert.equal(score('12 kg','12 KG').wer,0);
assert.equal(score('we do not go','we go').deletions,2);
assert.equal(context.hasTruth({truth:'',truth_provided:false}),false);
assert.equal(context.hasTruth({truth:'  ',truth_provided:false}),false);
assert.equal(context.hasTruth({truth:'',truth_provided:true}),true);
assert.equal(context.hasTruth({truth:'actual',truth_provided:true}),true);
assert.equal(context.csvCell('a,"b"'), '"a,""b"""');
assert.equal((html.match(/__QC_DATA__/g)||[]).length,1);
assert.ok(!script.includes('innerHTML'));
assert.ok(!html.includes('https://'));
console.log('page helper assertions passed; browser script syntax valid');
// Spreadsheet programs may execute leading formulas even in quoted cells.
assert.equal(context.csvCell('  @SUM(1)'), '"\'  @SUM(1)"');
assert.equal(context.csvCell('=1+1'), '"\'=1+1"');
class Element {
  constructor(tag='div'){this.tagName=tag;this.children=[];this.listeners={};this.style={};this.dataset={};this.value='';this.checked=false;this.textContent='';this.duration=10;this.currentTime=0;}
  append(...nodes){this.children.push(...nodes);if(this.tagName==='select'&&!this.value&&nodes[0])this.value=nodes[0].value;}
  replaceChildren(...nodes){this.children=[...nodes];}
  setAttribute(k,v){this[k]=v;}
  addEventListener(type,cb){this.listeners[type]=cb;}
  pause(){this.paused=true;} removeAttribute(k){delete this[k];} load(){} play(){this.played=true;return Promise.resolve();} click(){this.clicked=true;} remove(){}
}
const fixture={version:1,dataset_id:'synthetic-test-only',sample_id:'fixture',models:['small','medium'],source:{audio_path:'/synthetic.wav'},flags:[],rows:[{segment_index:0,start:2,end:5,conflict:true,suspicion_score:3,reasons:['number'],texts:{small:'one cat',medium:'two cats'},tokens:{small:[{text:'one ',diff:true},{text:'cat',diff:false}],medium:[{text:'two ',diff:true},{text:'cats',diff:true}]},audio:{src:'data:audio/wav;base64,AA==',start:.5,end:6.5},flags:[]}]};
function app(denyStorage=false,payload=fixture){
  const elements={};for(const id of ['context','playback-note','target-range','playhead','seek-full','play-position','play-start','seek-target','loop-note','sample-select','qc-data','dataset','sources','model','rows','metrics','storage-warning','save-state','conflicts-only','sort','audio','a','b','loop','audio-error','current-title','current-detail','export-json','export-csv','import-json','flags'])elements[id]=new Element(['model','sample-select'].includes(id)?'select':'div');
  elements['qc-data'].textContent=JSON.stringify(payload);elements['conflicts-only'].checked=true;elements.sort.value='suspicion';
  const storage=new Map(),blobs=[],body=new Element('body');
  const sandbox={document:{getElementById:id=>elements[id],createElement:tag=>new Element(tag),createTextNode:text=>({textContent:text}),body},localStorage:{getItem:k=>{if(denyStorage)throw Error('denied');return storage.get(k)||null;},setItem:(k,v)=>{if(denyStorage)throw Error('denied');storage.set(k,v);}},Blob,URL:{createObjectURL:b=>{blobs.push(b);return 'blob:synthetic';},revokeObjectURL(){}},setTimeout:()=>{},alert:message=>{throw Error(message);},console};
  vm.runInNewContext(script,sandbox);return {elements,storage,blobs,sandbox};
}
function descendants(root,predicate){return root.children.flatMap(c=>c.children?[...(predicate(c)?[c]:[]),...descendants(c,predicate)]:[]);}
async function integration(){
 const {elements:e,storage,blobs,sandbox}=app();
 assert.equal(e.rows.children.length,1);
 assert.equal(descendants(e.rows,n=>n.tagName==='mark').length,3);
 assert.equal(descendants(e.rows,n=>n.tagName==='mark')[0].textContent,'one ');
 let buttons=descendants(e.rows,n=>n.tagName==='button');buttons.find(b=>b.textContent==='错').onclick();
 let saved=JSON.parse([...storage.values()][0]);assert.equal(saved.reviews['0'].models.small.status,'错');
 e.model.value='medium';e.model.onchange();buttons=descendants(e.rows,n=>n.tagName==='button');buttons.find(b=>b.textContent==='对').onclick();saved=JSON.parse([...storage.values()][0]);assert.equal(saved.reviews['0'].models.medium.status,'对');assert.equal(saved.reviews['0'].models.small.status,'错');
 const input=descendants(e.rows,n=>n.tagName==='textarea')[0];input.value='one cat';input.oninput();assert.equal(vm.runInNewContext('scoredRows().find(s=>s.model==="small").wer',sandbox),0);assert.equal(vm.runInNewContext('scoredRows().find(s=>s.model==="medium").substitutions',sandbox),2);
 e['export-json'].onclick();const exported=JSON.parse(await blobs.at(-1).text());assert.equal(exported.dataset_id,fixture.dataset_id);assert.equal(exported.reviews['0'].truth_provided,true);assert.equal(exported.reviews['0'].truth,'one cat');
 e['export-csv'].onclick();const csv=await blobs.at(-1).text();assert.ok(csv.includes('"substitutions"'));assert.ok(csv.includes('"medium","对","one cat"'));
 buttons=descendants(e.rows,n=>n.tagName==='button');buttons.find(b=>b.textContent==='播放片段').onclick();assert.equal(e.audio.src,fixture.rows[0].audio.src);assert.equal(e.a.value,'1.500');assert.equal(e.b.value,'4.500');e.loop.checked=true;e.loop.onchange();assert.equal(e.audio.currentTime,1.5);e.audio.currentTime=4.6;e.audio.listeners.timeupdate();assert.equal(e.audio.currentTime,1.5);e.b.value='99';e.b.onchange();assert.equal(e.loop.checked,false);assert.equal(e['audio-error'].style.display,'block');
 e['import-json'].files=[{text:async()=>JSON.stringify(exported)}];await e['import-json'].onchange();assert.equal(JSON.parse([...storage.values()][0]).reviews['0'].truth,'one cat');
 const blocked=app(true);assert.equal(blocked.elements['storage-warning'].style.display,'block');assert.ok(blocked.elements['storage-warning'].textContent.includes('未持久')||blocked.elements['storage-warning'].textContent.includes('导出'));
 const second={...fixture,dataset_id:'second-synthetic-only',sample_id:'second',rows:fixture.rows.map(r=>({...r,texts:{small:'other words',medium:'different words'}}))};
 const multi=app(true,{datasets:[fixture,second]});
 assert.equal(multi.elements['sample-select'].children.length,2);
 let truth=descendants(multi.elements.rows,n=>n.tagName==='textarea')[0];truth.value='first synthetic truth';truth.oninput();
 multi.elements['sample-select'].value=second.dataset_id;multi.elements['sample-select'].onchange();
 assert.ok(multi.elements.dataset.textContent.includes('second'));
 assert.equal(descendants(multi.elements.rows,n=>n.tagName==='textarea')[0].value,'');
 assert.equal(multi.elements.audio.paused,true);
 truth=descendants(multi.elements.rows,n=>n.tagName==='textarea')[0];truth.value='second synthetic truth';truth.oninput();
 multi.elements['sample-select'].value=fixture.dataset_id;multi.elements['sample-select'].onchange();
 assert.equal(descendants(multi.elements.rows,n=>n.tagName==='textarea')[0].value,'first synthetic truth');
 multi.elements['export-json'].onclick();const chosen=JSON.parse(await multi.blobs.at(-1).text());assert.equal(chosen.dataset_id,fixture.dataset_id);
 assert.equal(chosen.reviews['0'].truth,'first synthetic truth');
 const agreeing={...second,dataset_id:'agreeing',rows:second.rows.map(r=>({...r,conflict:false}))};const allSame=app(false,{datasets:[fixture,agreeing]});allSame.elements['sample-select'].value='agreeing';allSame.elements['sample-select'].onchange();assert.equal(allSame.elements['conflicts-only'].checked,false);assert.equal(allSame.elements.rows.children.length,1);
 const full={...fixture,dataset_id:'full-context-test',full_audio:{src:'data:audio/wav;base64,FULL',duration:10},full_transcripts:{small:[{segment_index:0,start:2,end:5,text:'one cat',tokens:fixture.rows[0].tokens.small},{segment_index:1,start:6,end:9,text:'complete later context',tokens:[]}],medium:[{segment_index:0,start:2,end:5,text:'two cats',tokens:fixture.rows[0].tokens.medium}]},rows:[...fixture.rows,{...fixture.rows[0],segment_index:1,start:6,end:9,conflict:false,texts:{small:'complete later context',medium:'later context'},tokens:{small:[],medium:[]}}]};
 const fullApp=app(false,full),f=fullApp.elements;assert.equal(f.audio.src,full.full_audio.src);
 assert.ok(descendants(f.context,n=>n.textContent==='complete later context').length);
 descendants(f.rows,n=>n.tagName==='button').find(b=>b.textContent==='定位并播放').onclick();
 assert.equal(f.audio.src,full.full_audio.src);assert.equal(f.audio.currentTime,.5);assert.equal(f.a.value,'2.000');assert.equal(f.b.value,'5.000');
 assert.equal(descendants(f.context,n=>String(n.className).includes('target-chunk')).length,2);
 assert.equal(f['target-range'].style.left,'20%');assert.equal(f['target-range'].style.width,'30%');
 f['seek-full'].value='7';f['seek-full'].oninput();assert.equal(f.audio.currentTime,7);
 f.audio.currentTime=8;f.audio.listeners.timeupdate();assert.equal(f.audio.currentTime,8);
 f['play-start'].onclick();assert.equal(f.audio.currentTime,0);
 console.log('full audio, complete transcript, target highlighting, absolute timeline seek and continuous context playback passed');
 console.log('multi-sample selection, isolated reviews, memory retention with storage blocked and current-sample export passed');
 console.log('mock DOM: rendering, highlights, per-model judgments, truth/WER, JSON/CSV exports and JSON restore, storage denial, A–B loop passed');
}
integration().catch(error=>{console.error(error);process.exitCode=1;});

import {chromium} from 'playwright';
import {writeFile,readFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import ffprobe from 'ffprobe-static';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const report={date:new Date().toISOString(),mode:'installed Google Chrome headless (not Android)',runs:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1100,height:1450}});
 const cdp=await page.context().newCDPSession(page);await cdp.send('Performance.enable');
 page.on('pageerror',e=>report.errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))report.errors.push(m.text());});
 await page.goto(process.env.SPIKE_URL??'http://127.0.0.1:5178');
 report.ua=await page.evaluate(()=>navigator.userAgent);
 report.capabilities=await page.evaluate(()=>window.spike.capabilities());
 await page.locator('#audio').setInputFiles('public/test-music.wav');
 await page.waitForFunction(()=>window.spike?.duration===30);
 await page.locator('#play').click();
 await page.waitForTimeout(260);const first=await page.evaluate(()=>window.spike.spectrum);
 await page.waitForTimeout(480);const second=await page.evaluate(()=>window.spike.spectrum);
 report.realtime={playing:await page.evaluate(()=>window.spike.playing),sum:first.reduce((s,n)=>s+n,0),difference:first.reduce((s,n,i)=>s+Math.abs(n-second[i]),0)};
 assert.ok(report.realtime.playing&&report.realtime.sum>0&&report.realtime.difference>.01);
 await page.locator('#play').click();
 // Real user file upload; SVG is original, converted below if createImageBitmap rejects SVG on this Chrome.
 const backgroundBefore=await page.locator('#preview').evaluate(c=>Array.from(c.getContext('2d').getImageData(10,10,1,1).data));
 await page.locator('#image').setInputFiles('public/test-background.svg');
 await page.waitForTimeout(300);
 assert.equal(report.errors.length,0,'background upload must decode');
 assert.doesNotMatch(await page.locator('#status').innerText(),/Error/);
 report.backgroundPixel=await page.locator('#preview').evaluate(c=>Array.from(c.getContext('2d').getImageData(10,10,1,1).data));assert.notDeepEqual(report.backgroundPixel,backgroundBefore);
 for(let i=0;i<5;i++){
  await page.locator('#mode').selectOption(i%2===0?'bars':'circular');
  if(i===0||i===1)await page.screenshot({path:`evidence/preview-${i===0?'bars':'circular'}.png`});
  const before=(await cdp.send('Performance.getMetrics')).metrics;
  const samples=[];const timer=setInterval(async()=>{try{const m=await cdp.send('Performance.getMetrics');samples.push(Object.fromEntries(m.metrics.filter(x=>['JSHeapUsedSize','JSHeapTotalSize'].includes(x.name)).map(x=>[x.name,x.value])));}catch{}},500);
  const start=Date.now();let stats;
  try{stats=await page.evaluate(()=>window.spike.export());}finally{clearInterval(timer);}
  const d=page.waitForEvent('download');await page.locator('#download').click();
  const path=`evidence/export-${i+1}.mp4`;await(await d).saveAs(path);
  const result=spawnSync(ffprobe.path,['-v','error','-show_streams','-show_format','-of','json',path],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);const probe=JSON.parse(result.stdout);
  await writeFile(`evidence/export-${i+1}.ffprobe.json`,JSON.stringify(probe,null,2));
  const v=probe.streams.find(s=>s.codec_type==='video'),a=probe.streams.find(s=>s.codec_type==='audio');
  assert.equal(v.codec_name,'h264');assert.equal(a.codec_name,'aac');assert.equal(v.width,720);assert.equal(v.height,1280);assert.equal(v.avg_frame_rate,'30/1');assert.equal(Number(v.nb_frames),900);assert.ok(Math.abs(Number(probe.format.duration)-30)<.002);assert.ok(Math.abs(Number(v.duration)-Number(a.duration))<.002);
  const signature=(await readFile(path)).subarray(4,8).toString();assert.equal(signature,'ftyp');
  report.runs.push({index:i+1,...stats,wallSeconds:(Date.now()-start)/1000,signature,heapSamples:samples,beforeHeap:before.filter(x=>x.name.includes('Heap')),probe:{video:v.codec_name,audio:a.codec_name,videoDuration:v.duration,audioDuration:a.duration,format:probe.format.format_name,frames:v.nb_frames}});
  await writeFile('evidence/browser-results.json',JSON.stringify(report,null,2));console.log(`Export ${i+1}: ${stats.seconds.toFixed(2)}s ${stats.bytes} bytes H264/AAC 900 frames`);
 }
 // Upload and decode an actual MP3 if prepared; fail rather than silently skip.
 const previousLoad=await page.evaluate(()=>window.spike.loadVersion);
 await page.locator('#audio').setInputFiles('public/test-music.mp3');
 await page.waitForFunction(v=>window.spike.loadVersion>v,previousLoad);
 await page.waitForFunction(()=>window.spike.duration>29.9&&window.spike.duration<30.2);
 report.mp3DecodeDuration=await page.evaluate(()=>window.spike.duration);
 await page.locator('#play').click();await page.waitForTimeout(400);assert.ok(await page.evaluate(()=>window.spike.playing));await page.locator('#play').click();
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.failure=e.stack;console.error(e);process.exitCode=1;}
finally{await writeFile('evidence/browser-results.json',JSON.stringify(report,null,2));await browser.close();}

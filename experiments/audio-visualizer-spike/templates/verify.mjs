import {chromium} from 'playwright';
import {mkdir,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';
import ffprobe from 'ffprobe-static';
const output=process.env.TEMPLATE_EVIDENCE??'templates/evidence';await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
const report={url:process.env.SPIKE_URL??'http://127.0.0.1:5183',date:new Date().toISOString(),runs:[],errors:[]};
try{
 const page=await browser.newPage({viewport:{width:1100,height:1400}});page.on('pageerror',e=>report.errors.push(e.message));
 await page.goto(report.url);await page.waitForFunction(()=>Boolean(window.spike));report.ua=await page.evaluate(()=>navigator.userAgent);
 await page.locator('#audio').setInputFiles('public/test-music.mp3');await page.waitForFunction(()=>window.spike?.duration>29.9);
 await page.locator('#image').setInputFiles('public/test-background.png');await page.waitForFunction(()=>document.querySelector('#status').textContent==='背景图片已加载');
 const ids=await page.locator('#mode option').evaluateAll(xs=>xs.map(x=>x.value));assert.equal(ids.length,8);
 for(const id of ids.filter(id=>!process.env.TEMPLATE_MODES||process.env.TEMPLATE_MODES.split(',').includes(id))){
  await page.locator('#mode').selectOption(id);await page.locator('#play').click();await page.waitForTimeout(300);
  const a=await page.locator('#preview').evaluate(c=>c.toDataURL());await page.waitForTimeout(400);const b=await page.locator('#preview').evaluate(c=>c.toDataURL());assert.notEqual(a,b,`${id}: music must animate`);
  await page.locator('#play').click();await page.locator('#preview').screenshot({path:`${output}/${id}.png`});
  const stats=await page.evaluate(()=>window.spike.export());
  const pending=page.waitForEvent('download');await page.locator('#download').click();const file=`${output}/${id}.mp4`;await(await pending).saveAs(file);
  const result=spawnSync(ffprobe.path,['-v','error','-show_streams','-show_format','-of','json',file],{encoding:'utf8'});assert.equal(result.status,0,result.stderr);const probe=JSON.parse(result.stdout);await writeFile(`${output}/${id}.ffprobe.json`,result.stdout);
  const v=probe.streams.find(s=>s.codec_type==='video'),aStream=probe.streams.find(s=>s.codec_type==='audio');assert.equal(v.codec_name,'h264');assert.equal(aStream.codec_name,'aac');assert.equal(v.width,720);assert.equal(v.height,1280);assert.equal(v.avg_frame_rate,'30/1');assert.equal(+v.nb_frames,900);assert.ok(Math.abs(+probe.format.duration-30)<.002);assert.ok(Math.abs(+v.duration-+aStream.duration)<.002);
  report.runs.push({id,...stats,video:v.codec_name,audio:aStream.codec_name});console.log(`${id}: ${stats.seconds.toFixed(2)}s H264/AAC 900 frames`);
 }
 assert.equal(report.errors.length,0);report.passed=true;
}catch(e){report.passed=false;report.failure=e.stack;process.exitCode=1;console.error(e);}finally{await writeFile(`${output}/results.json`,JSON.stringify(report,null,2));await browser.close();}

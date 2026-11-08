import {chromium} from 'playwright';import {writeFile} from 'node:fs/promises';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';import ffprobe from 'ffprobe-static';
const browser=await chromium.launch({channel:'chrome',headless:true});const errors=[];
try{
 const page=await browser.newPage({viewport:{width:1100,height:900}});page.on('pageerror',e=>errors.push(e.message));page.on('console',m=>{if(m.type()==='error'&&!m.text().includes('404'))errors.push(m.text());});
 await page.goto(process.env.SPIKE_PRODUCTION_URL??'http://127.0.0.1:5179');
 await page.locator('#audio').setInputFiles('public/test-music.mp3');await page.waitForFunction(()=>window.spike.duration===30);
 // Create an original raster fixture from the provided original SVG through the browser.
 const png=await page.evaluate(async()=>{const img=new Image();img.src='/test-background.svg';await img.decode();const c=document.createElement('canvas');c.width=720;c.height=1280;c.getContext('2d').drawImage(img,0,0);return c.toDataURL('image/png').split(',')[1];});await writeFile('public/test-background.png',Buffer.from(png,'base64'));
 await page.locator('#image').setInputFiles('public/test-background.png');await page.waitForFunction(()=>document.querySelector('#status').textContent==='背景图片已加载');
 await page.locator('#mode').selectOption('circular');await page.locator('#export').click();
 await page.locator('#download').waitFor({state:'visible',timeout:120000});
 const event=page.waitForEvent('download');await page.locator('#download').click();await(await event).saveAs('evidence/mp3-input.mp4');
 const probe=spawnSync(ffprobe.path,['-v','error','-show_streams','-show_format','-of','json','evidence/mp3-input.mp4'],{encoding:'utf8'});assert.equal(probe.status,0);const data=JSON.parse(probe.stdout);assert.ok(data.streams.some(s=>s.codec_name==='aac'));assert.ok(data.streams.some(s=>s.codec_name==='h264'&&s.width===720&&s.height===1280&&Number(s.nb_frames)===900));
 await writeFile('evidence/mp3-input.ffprobe.json',probe.stdout);
 const playback=await page.evaluate(async()=>{const v=document.createElement('video');v.src=document.querySelector('#download').href;v.muted=true;document.body.append(v);await new Promise((resolve,reject)=>{v.onloadeddata=resolve;v.onerror=reject;});await v.play();await new Promise(r=>setTimeout(r,500));const result={duration:v.duration,time:v.currentTime,width:v.videoWidth,height:v.videoHeight,decodedAudioBytes:v.webkitAudioDecodedByteCount,decodedVideoFrames:v.getVideoPlaybackQuality().totalVideoFrames};v.pause();v.remove();return result;});assert.ok(playback.time>0&&playback.decodedVideoFrames>0&&playback.decodedAudioBytes>0);assert.equal(errors.length,0);
 await writeFile('evidence/production-smoke.json',JSON.stringify({passed:true,errors,playback,diagnostics:await page.locator('#diagnostics').innerText()},null,2));await page.screenshot({path:'evidence/production-ui.png'});console.log({passed:true,playback});
}catch(error){await writeFile('evidence/production-smoke.json',JSON.stringify({passed:false,errors,failure:error.stack},null,2));throw error;}finally{await browser.close();}

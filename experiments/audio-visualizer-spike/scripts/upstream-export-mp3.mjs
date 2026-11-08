import { chromium } from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true,args:['--autoplay-policy=no-user-gesture-required']});
try{
 const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>console.log('PAGEERROR',e.message));page.on('dialog',async d=>{console.log('DIALOG',d.message());await d.dismiss();});
 await page.goto('http://127.0.0.1:3001',{timeout:120000});
 await page.locator('input[type=file]').first().setInputFiles('public/test-music.mp3');
 await page.waitForTimeout(2000);console.log('AFTER_UPLOAD',await page.locator('body').innerText());
 const start=Date.now();await page.getByRole('button',{name:'Render Full',exact:true}).click();
 await page.waitForFunction(()=>{const b=[...document.querySelectorAll('button')].find(b=>b.textContent.includes('Download MP4'));return b&&!b.disabled;},null,{timeout:60000});
 const event=page.waitForEvent('download');await page.getByRole('button',{name:'Download MP4',exact:true}).click();
 await (await event).saveAs('evidence/upstream-original.mp4');
 console.log(JSON.stringify({seconds:(Date.now()-start)/1000,body:await page.locator('body').innerText()}));
}catch(e){console.error(e);process.exitCode=1;}finally{await browser.close();}

import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage({viewport:{width:1280,height:900}});page.on('pageerror',e=>console.log('PAGEERROR',e.message));
await page.goto('http://127.0.0.1:3001',{timeout:120000});
console.log('TITLE',await page.title());console.log('BODY',await page.locator('body').innerText());
console.log('INPUTS',await page.locator('input').evaluateAll(es=>es.map(e=>({type:e.type,accept:e.accept}))));
await page.screenshot({path:'evidence/upstream-initial.png'});
await browser.close();

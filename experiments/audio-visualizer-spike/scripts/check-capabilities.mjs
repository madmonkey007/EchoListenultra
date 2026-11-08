import {chromium} from 'playwright';
const browser=await chromium.launch({channel:'chrome',headless:true});
const page=await browser.newPage();page.on('console',m=>console.log(m.type(),m.text()));page.on('pageerror',e=>console.error(e));
await page.goto('http://127.0.0.1:5178');
console.log(JSON.stringify({ua:await page.evaluate(()=>navigator.userAgent),capabilities:await page.evaluate(()=>window.spike.capabilities())},null,2));
await browser.close();

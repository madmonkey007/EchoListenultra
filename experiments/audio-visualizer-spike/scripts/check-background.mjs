import {chromium} from 'playwright';import assert from 'node:assert/strict';
const browser=await chromium.launch({channel:'chrome',headless:true});
try{const page=await browser.newPage();await page.goto('http://127.0.0.1:5178');await page.locator('#demo').click();await page.waitForFunction(()=>window.spike.duration===30);
const before=await page.locator('#preview').evaluate(c=>Array.from(c.getContext('2d').getImageData(10,10,1,1).data));
await page.locator('#image').setInputFiles('public/test-background.svg');await page.waitForTimeout(400);
const after=await page.locator('#preview').evaluate(c=>Array.from(c.getContext('2d').getImageData(10,10,1,1).data));
assert.doesNotMatch(await page.locator('#status').innerText(),/Error/);assert.notDeepEqual(after,before);console.log({before,after,passed:true});
}finally{await browser.close();}

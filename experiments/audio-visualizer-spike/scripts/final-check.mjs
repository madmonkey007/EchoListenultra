import {readFile,writeFile,readdir} from 'node:fs/promises';import {createHash} from 'node:crypto';import assert from 'node:assert/strict';import {spawnSync} from 'node:child_process';
const read=async p=>JSON.parse(await readFile(p,'utf8'));
const browser=await read('evidence/browser-results.json'),media=await read('evidence/media-validation.json'),production=await read('evidence/production-smoke.json');
assert.equal(browser.passed,true);assert.equal(browser.runs.length,5);assert.equal(browser.mp3DecodeDuration,30);assert.equal(media.pass,true);assert.equal(production.passed,true);
for(const file of [...media.files,media.extraMp3Input]){const hash=createHash('sha256').update(await readFile('evidence/'+file.file)).digest('hex');assert.equal(hash,file.sha256,'independent analysis must match current media artifact');}
let report=await readFile('REPORT.md','utf8');const table=['| 次序 | 效果 | 编码+封装耗时（秒） | 文件MB | 采样JS heap峰值MiB |','|---|---|---:|---:|---:|',...browser.runs.map(r=>`| ${r.index} | ${r.mode} | ${r.seconds.toFixed(3)} | ${(r.bytes/1e6).toFixed(3)} | ${(Math.max(...r.heapSamples.map(s=>s.JSHeapUsedSize))/1048576).toFixed(2)} |`)].join('\n');
const section='<!-- FINAL_RUN_TABLE_START -->\n'+table+'\n<!-- FINAL_RUN_TABLE_END -->';
report=report.includes('<!-- FINAL_RUN_TABLE_START -->')?report.replace(/<!-- FINAL_RUN_TABLE_START -->[\s\S]*?<!-- FINAL_RUN_TABLE_END -->/,section):report.replace('<!-- FINAL_RUN_TABLE -->',section);
if(!report.includes('硬件：Intel'))report=report.replace('浏览器为本机安装的Google Chrome155', '硬件：Intel Core i5-8257U 1.40GHz、8GiB RAM、macOS15.4.1 x86_64。浏览器为本机安装的Google Chrome155');
await writeFile('REPORT.md',report);
const checks=[];for(const path of [...(await readdir('scripts')).filter(x=>x.endsWith('.mjs')).map(x=>'scripts/'+x),...(await readdir('src')).filter(x=>x.endsWith('.mjs')).map(x=>'src/'+x)]){const p=spawnSync(process.execPath,['--check',path],{encoding:'utf8'});assert.equal(p.status,0,p.stderr);checks.push(path);}
const summary={passed:true,browserRuns:browser.runs.length,allMediaHashesMatch:true,independentMediaPass:media.pass,productionPass:production.passed,syntaxChecks:checks};await writeFile('evidence/final-check.json',JSON.stringify(summary,null,2));console.log(summary);

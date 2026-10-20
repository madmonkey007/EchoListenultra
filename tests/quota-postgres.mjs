// Destructive to the test database's echo_private tables. Use a disposable cluster only.
import assert from 'node:assert/strict';
import { execFile, execFileSync } from 'node:child_process';
import { promisify } from 'node:util';
import { randomUUID } from 'node:crypto';
const target = process.env.QUOTA_TEST_DB_URL;
if (!target || process.env.QUOTA_TEST_DISPOSABLE !== 'yes') throw Error('Set QUOTA_TEST_DB_URL and QUOTA_TEST_DISPOSABLE=yes for a disposable migrated database.');
const args = ['-X', target, '-At', '-v', 'ON_ERROR_STOP=1', '-c'];
const query = sql => execFileSync('psql', [...args, sql], { encoding:'utf8' }).trim();
const asyncQuery = async sql => (await promisify(execFile)('psql', [...args, sql])).stdout.trim();
const reset = () => query("truncate echo_private.quota_jobs,echo_private.quota_requests; update echo_private.quota_control set enabled=true;");
const subject = (kind='user') => `${kind}:${randomUUID()}`;
const network = () => randomUUID().replaceAll('-','').padEnd(43,'x');
const reserveSQL = (who, net, id=randomUUID(), seconds=100, limit=3600) => `select public.echo_quota_reserve('${who}',${who.startsWith('user:')},'${net}','${id}',${seconds},${limit});`;
const reserve = (...values) => JSON.parse(query(reserveSQL(...values)));
const settle = (who,id,success) => JSON.parse(query(`select public.echo_quota_settle('${who}','${id}',${success});`));
const status = (who,net) => JSON.parse(query(`select public.echo_quota_status('${who}',${who.startsWith('user:')},'${net}');`));
const checks=[];const check=(name,fn)=>{fn();checks.push(name);};
check('browser roles cannot invoke quota RPCs',()=>{
 assert.equal(query("select has_function_privilege('anon','public.echo_quota_reserve(text,boolean,text,uuid,integer,integer)','execute');"),'f');
 assert.equal(query("select has_function_privilege('authenticated','public.echo_quota_settle(text,uuid,boolean)','execute');"),'f');
 assert.equal(query("select has_function_privilege('service_role','public.echo_quota_status(text,boolean,text)','execute');"),'t');
});
check('disabled and missing control row fail closed',()=>{
 reset();query('update echo_private.quota_control set enabled=false');assert.equal(reserve(subject(),network()).reason,'platform_disabled');
 query('delete from echo_private.quota_control');assert.equal(reserve(subject(),network()).reason,'platform_disabled');query('insert into echo_private.quota_control values(true,true)');
});
check('null duration cannot create an unaccounted job',()=>{
 assert.equal(JSON.parse(query(`select public.echo_quota_reserve('${subject()}',true,'${network()}','${randomUUID()}',null,3600);`)).reason,'invalid_request');
});
check('idempotency and failed user refund retain operator cost',()=>{
 reset();const who=subject(),net=network(),id=randomUUID();assert.equal(reserve(who,net,id,600,900).ok,true);
 assert.equal(reserve(who,net,id,600,900).idempotent,true);assert.equal(status(who,net).remainingRequests,2);
 assert.equal(settle(who,id,false).state,'failed');assert.equal(status(who,net).remainingRequests,3);
 assert.equal(reserve(who,net,randomUUID(),600,900).reason,'daily_budget_exhausted');
});
check('request count and minutes both constrain authenticated accounts',()=>{
 reset();const who=subject(),net=network();for(let i=0;i<3;i++){const id=randomUUID();assert.equal(reserve(who,net,id,100).ok,true);assert.equal(settle(who,id,true).ok,true);assert.equal(settle(who,id,false).state,'succeeded');}
 assert.equal(status(who,net).remainingRequests,0);assert.equal(reserve(who,net).reason,'quota_exhausted');
 reset();for(let i=0;i<2;i++){const id=randomUUID();assert.equal(reserve(who,net,id,600).ok,true);settle(who,id,true);}assert.equal(status(who,net).remainingSeconds,0);assert.equal(reserve(who,net).reason,'quota_exhausted');
});
check('anonymous cookie reset cannot bypass network daily trial ceiling',()=>{
 reset();const net=network(),who=subject('anon');for(let i=0;i<2;i++){const id=randomUUID();assert.equal(reserve(who,net,id,300).ok,true);settle(who,id,true);}
 assert.equal(reserve(subject('anon'),net).reason,'quota_exhausted');assert.equal(reserve(who,network()).reason,'quota_exhausted');
});
check('expired lease refunds user but not operator budget',()=>{
 reset();const who=subject(),net=network(),id=randomUUID();reserve(who,net,id,600,600);query("update echo_private.quota_jobs set expires_at=now()-interval '1 second'");
 assert.equal(status(who,net).remainingRequests,3);assert.equal(settle(who,id,true).state,'expired');assert.equal(reserve(who,net,randomUUID(),600,600).reason,'daily_budget_exhausted');
});
check('failed attempts still hit the request rate limit',()=>{
 reset();const who=subject(),net=network();for(let i=0;i<10;i++){const id=randomUUID();assert.equal(reserve(who,net,id,1).ok,true);settle(who,id,false);}assert.equal(reserve(who,net,randomUUID(),1).reason,'rate_limited');
});
check('UTC daily allowance resets while anonymous lifetime use remains',()=>{
 reset();const user=subject(),anon=subject('anon'),net=network();
 for(const who of [user,anon]) {const id=randomUUID();assert.equal(reserve(who,net,id,100).ok,true);settle(who,id,true);}
 query("update echo_private.quota_jobs set created_at=now()-interval '2 days'");
 assert.equal(status(user,net).remainingRequests,3);assert.equal(status(anon,net).remainingRequests,1);
});
reset();{
 const who=subject();const results=await Promise.all([asyncQuery(reserveSQL(who,network())),asyncQuery(reserveSQL(who,network()))]);
 assert.equal(results.map(JSON.parse).filter(value=>value.ok).length,1);checks.push('concurrent requests cannot reserve two active jobs for one account');
}
reset();{
 const results=await Promise.all(Array.from({length:12},()=>asyncQuery(reserveSQL(subject(),network(),randomUUID(),100,500))));
 assert.equal(results.map(JSON.parse).filter(value=>value.ok).length,5);assert.equal(query('select sum(seconds) from echo_private.quota_jobs'),'500');checks.push('12 concurrent accounts cannot exceed the shared five-job budget');
}
console.log(JSON.stringify({passed:checks.length,checks},null,2));

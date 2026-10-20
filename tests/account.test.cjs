const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const ts=require('typescript');
for(const ext of ['.ts','.tsx']) require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);

test('quota status rejects malformed or untrusted allowance instead of showing free credits',async()=>{
 const {fetchQuotaStatus}=require('../lib/quota-client.ts');
 const invalid=await fetchQuotaStatus(null,async()=>({ok:true,json:async()=>({remainingRequests:999999})}));
 assert.equal(invalid.configured,false);
 assert.equal(invalid.platformEnabled,false);
 assert.equal(invalid.remainingRequests,0);
});
test('quota status sends bearer only to same-origin endpoint and omits it for anonymous use',async()=>{
 const {fetchQuotaStatus}=require('../lib/quota-client.ts');
 const calls=[];const request=async(...args)=>{calls.push(args);return {ok:true,json:async()=>({configured:true,platformEnabled:false,identity:'authenticated',remainingRequests:2,remainingSeconds:900,maxSeconds:600,resetAt:'2026-10-21T00:00:00Z'})};};
 const result=await fetchQuotaStatus('test-token',request);
 assert.equal(calls[0][0],'/api/quota');assert.equal(calls[0][1].headers.Authorization,'Bearer test-token');assert.equal(result.remainingRequests,2);
 await fetchQuotaStatus(null,request);assert.equal(calls[1][1].headers.Authorization,undefined);
});
test('quota failures give an unavailable state, never invented trial balance',async()=>{
 const {fetchQuotaStatus}=require('../lib/quota-client.ts');
 const result=await fetchQuotaStatus(null,async()=>{throw Error('offline');});
 assert.equal(result.configured,false);assert.equal(result.remainingRequests,0);assert.match(result.reason,/unavailable/i);
});

const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'); const ts = require('typescript');
for (const ext of ['.ts','.tsx']) require.extensions[ext]=(m,f)=>m._compile(ts.transpileModule(fs.readFileSync(f,'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,jsx:ts.JsxEmit.ReactJSX,esModuleInterop:true,target:ts.ScriptTarget.ES2022}}).outputText,f);
const path = require.resolve('../lib/auth.ts');
function load(config) { global.__ECHO_AUTH_CONFIG__=config; delete require.cache[path]; return require(path); }
function storage() { const values=new Map(); return { getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,v),removeItem:k=>values.delete(k) }; }
function browser() { global.localStorage=storage(); global.sessionStorage=storage(); global.location={origin:'https://listen.example',href:'https://listen.example/login',assign:url=>{global.redirect=url;}};global.history={state:null,replaceState:()=>{}}; }
const config={url:'https://project.supabase.co',key:'public-key'};
test('auth return paths block external URLs, protocol-relative URLs and unknown routes',()=>{
 const auth=load(); for(const unsafe of ['https://evil.example','//evil.example','/\\evil.example','/login','/auth/callback','/foo','/add\n']) assert.equal(auth.safeReturnPath(unsafe),'/account');
 assert.equal(auth.safeReturnPath('/add?resume=1'),'/add?resume=1'); assert.equal(auth.safeReturnPath('/player/sample-1'),'/player/sample-1');
});
test('unconfigured sign-in is explicit and never creates a fake user',async()=>{
 browser(); const auth=load(); assert.equal(auth.authConfig(),null); assert.equal(auth.getAuthSession(),null); await assert.rejects(auth.startGoogleSignIn(),/not configured/);
});
test('PKCE sends a challenge and validates state before exchanging code; stores only app session',async()=>{
 browser(); const auth=load(config); await auth.startGoogleSignIn('/add'); const redirect=new URL(global.redirect); const callback=new URL(redirect.searchParams.get('redirect_to')); const flow=JSON.parse(sessionStorage.getItem('echo_auth_pkce'));
 assert.equal(redirect.searchParams.get('provider'),'google'); assert.equal(redirect.searchParams.get('scopes'),'openid email profile'); assert.equal(redirect.searchParams.get('code_challenge_method'),'s256'); assert.equal(redirect.searchParams.get('code_challenge').length,43); assert.equal(redirect.href.includes(flow.verifier),false);
 let request; global.fetch=async(url,options)=>{request={url,options}; return {ok:true,json:async()=>({access_token:'access',refresh_token:'refresh',expires_in:3600,user:{id:'user1',email:'a@example.com',user_metadata:{secret:'omit'}},provider_token:'google-secret'})};};
 assert.equal(await auth.completeGoogleSignIn(callback.href+'&code=auth-code'),'/add'); assert.equal(request.url,config.url+'/auth/v1/token?grant_type=pkce'); assert.deepEqual(JSON.parse(request.options.body),{auth_code:'auth-code',code_verifier:flow.verifier}); assert.equal(localStorage.getItem('echo_auth_session').includes('google-secret'),false); assert.equal(sessionStorage.getItem('echo_auth_pkce'),null);
});
test('callback state mismatch rejects without a token request',async()=>{
 browser();const auth=load(config);await auth.startGoogleSignIn();let calls=0;global.fetch=async()=>{calls++;};await assert.rejects(auth.completeGoogleSignIn('https://listen.example/auth/callback?code=x&state=wrong'),/expired/);assert.equal(calls,0);
});
test('expired access token refreshes once across concurrent calls and logout clears only auth data',async()=>{
 browser();const auth=load(config);localStorage.setItem('echo_sessions','my-lessons');localStorage.setItem('echo_auth_session',JSON.stringify({access_token:'old',refresh_token:'refresh',expires_at:1,user:{id:'u'}})); let calls=0;
 global.fetch=async()=>{calls++;return {ok:true,json:async()=>({access_token:'new',refresh_token:'rotated',expires_in:3600,user:{id:'u'}})};}; assert.deepEqual(await Promise.all([auth.getAccessToken(),auth.getAccessToken()]),['new','new']);assert.equal(calls,1); await auth.signOut();assert.equal(auth.getAuthSession(),null);assert.equal(localStorage.getItem('echo_sessions'),'my-lessons');
});
test('temporary refresh failures keep the session for retry; invalid refresh token clears it',async()=>{
 browser();const auth=load(config);const saved={access_token:'old',refresh_token:'refresh',expires_at:1,user:{id:'u'}};localStorage.setItem('echo_auth_session',JSON.stringify(saved));
 global.fetch=async()=>({ok:false,status:503});await assert.rejects(auth.getAccessToken(),/temporarily/);assert.equal(auth.getAuthSession().refresh_token,'refresh');
 global.fetch=async()=>({ok:false,status:400});await assert.rejects(auth.getAccessToken(),/expired/);assert.equal(auth.getAuthSession(),null);
});
test('login page disables Google sign-in when this deployment is unconfigured',()=>{
 browser();load();const React=require('react');const {renderToStaticMarkup}=require('react-dom/server');const {MemoryRouter}=require('react-router-dom');const AuthView=require('../views/AuthView.tsx').default;
 const html=renderToStaticMarkup(React.createElement(MemoryRouter,null,React.createElement(AuthView)));assert.match(html,/not available on this deployment/);assert.match(html,/disabled=""/);assert.match(html,/does not request access to your Gmail/);
});
test('callback rejects malformed or expired flow creation time',async()=>{
 for(const createdAt of [undefined,'today',Date.now()-11*60_000,Date.now()+60_000]) {
  browser();const auth=load(config);sessionStorage.setItem('echo_auth_pkce',JSON.stringify({verifier:'v',state:'s',createdAt}));let calls=0;global.fetch=async()=>{calls++;};
  await assert.rejects(auth.completeGoogleSignIn('https://listen.example/auth/callback?code=x&state=s'),/expired/);assert.equal(calls,0);
 }
});
test('cancelled callback scrubs URL and never exchanges tokens',async()=>{
 browser();const auth=load(config);await auth.startGoogleSignIn();const flow=JSON.parse(sessionStorage.getItem('echo_auth_pkce'));let scrubbed;history.replaceState=(state,title,url)=>{scrubbed=url;};let calls=0;global.fetch=async()=>{calls++;};
 await assert.rejects(auth.completeGoogleSignIn('https://listen.example/auth/callback?error=access_denied&state='+flow.state),/cancelled/);assert.equal(scrubbed,'/auth/callback');assert.equal(calls,0);assert.equal(sessionStorage.getItem('echo_auth_pkce'),null);
});
test('unconfigured callback still removes auth code from history',async()=>{
 browser();const auth=load();let scrubbed;history.replaceState=(state,title,url)=>{scrubbed=url;};await assert.rejects(auth.completeGoogleSignIn('https://listen.example/auth/callback?code=private'),/not configured/);assert.equal(scrubbed,'/auth/callback');
});
test('logout during pending refresh cannot restore the signed-out session',async()=>{
 browser();const auth=load(config);localStorage.setItem('echo_auth_session',JSON.stringify({access_token:'old',refresh_token:'refresh',expires_at:1,user:{id:'u'}}));let resolveRefresh;
 global.fetch=async(url)=>url.includes('logout')?{ok:true}:new Promise(resolve=>{resolveRefresh=resolve;});const refreshing=auth.getAccessToken();await auth.signOut();resolveRefresh({ok:true,json:async()=>({access_token:'new',refresh_token:'rotated',expires_in:3600,user:{id:'u'}})});assert.equal(await refreshing,null);assert.equal(auth.getAuthSession(),null);
});
test('rate limit and network failures preserve refresh session',async()=>{
 browser();const auth=load(config);localStorage.setItem('echo_auth_session',JSON.stringify({access_token:'old',refresh_token:'refresh',expires_at:1,user:{id:'u'}}));
 global.fetch=async()=>({ok:false,status:429});await assert.rejects(auth.getAccessToken(),/temporarily/);assert.ok(auth.getAuthSession());
 global.fetch=async()=>{throw new TypeError('Failed to fetch');};await assert.rejects(auth.getAccessToken(),/Failed to fetch/);assert.ok(auth.getAuthSession());
});

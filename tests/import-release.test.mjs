import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, existsSync } from 'node:fs';
const read = p => readFileSync(new URL('../' + p, import.meta.url), 'utf8');
test('release assets are copied by Vite', () => {
  assert.ok(existsSync(new URL('../public/sw.js', import.meta.url)));
  assert.equal(JSON.parse(read('public/manifest.json')).start_url, '/library');
});
test('provider keys are supplied by users, never injected by the build', () => {
  assert.doesNotMatch(read('vite.config.ts'), /GEMINI_API_KEY|define:\s*\{\s*['"]process\.env/);
  const publicDefine = read('vite.config.ts').match(/define:\s*\{([^\n]+)\}/)?.[1] || '';
  assert.match(publicDefine, /VITE_SUPABASE_ANON_KEY/);
  assert.doesNotMatch(publicDefine, /SERVICE_ROLE|COOKIE_SECRET|GEMINI/);
  assert.doesNotMatch(read('views/AddSessionView.tsx'), /process\.env/);
  assert.match(read('views/AddSessionView.tsx'), /apiConfig\.geminiApiKey/);
});
test('service worker ignores external requests and registers only in production', () => {
  assert.match(read('public/sw.js'), /url\.origin !== self\.location\.origin/);
  assert.match(read('public/sw.js'), /request\.method !== 'GET'/);
  assert.match(read('index.tsx'), /import\.meta\.env\.PROD/);
});
test('SPA routes do not swallow missing static assets', () => {
  const config = JSON.parse(read('vercel.json'));
  const route = new RegExp('^' + config.rewrites[0].source + '$');
  assert.ok(route.test('/library'));
  for (const path of ['/api/events', '/api/unknown', '/assets/missing.js', '/sw.js', '/manifest.json', '/missing.png']) assert.equal(route.test(path), false);
});

test('worker never intercepts provider uploads or external GET requests', async () => {
  const { runInNewContext } = await import('node:vm');
  const handlers = {};
  runInNewContext(read('public/sw.js'), {
    self: { location: { origin: 'https://echo.example' }, addEventListener: (name, fn) => { handlers[name] = fn; } }, URL
  });
  for (const request of [
    { method: 'POST', url: 'https://echo.example/upload' },
    { method: 'GET', url: 'https://api.deepgram.com/v1/listen' },
    { method: 'GET', url: 'https://echo.example/private-data' }
  ]) {
    let intercepted = false;
    handlers.fetch({ request, respondWith() { intercepted = true; } });
    assert.equal(intercepted, false);
  }
});

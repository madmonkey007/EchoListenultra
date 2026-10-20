const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const ts = require('typescript');
for (const extension of ['.tsx', '.ts']) require.extensions[extension] = (module, filename) => {
  module._compile(ts.transpileModule(fs.readFileSync(filename, 'utf8'), { compilerOptions: { module: ts.ModuleKind.CommonJS, jsx: ts.JsxEmit.ReactJSX, esModuleInterop: true, target: ts.ScriptTarget.ES2022 } }).outputText, filename);
};
const React = require('react');
const { renderToStaticMarkup } = require('react-dom/server');
const { MemoryRouter } = require('react-router-dom');
const { routeMetadata, SITE_ORIGIN } = require('../lib/site-meta.ts');
const publicPaths = ['/', '/about', '/help', '/privacy', '/contact'];
const render = component => renderToStaticMarkup(React.createElement(MemoryRouter, null, React.createElement(component)));

test('only public information pages are indexable and in the sitemap', () => {
  const sitemap = fs.readFileSync('public/sitemap.xml', 'utf8');
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls, publicPaths.map(path => SITE_ORIGIN + path));
  for (const path of publicPaths) {
    assert.equal(routeMetadata(path).robots, 'index, follow');
    assert.ok(routeMetadata(path).description.length > 30);
  }
  assert.match(fs.readFileSync('public/robots.txt', 'utf8'), new RegExp(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));
});
test('personal workspace and unknown routes are not indexable', () => {
  for (const path of ['/library', '/add', '/player/private-lesson', '/player/sample-1', '/vocabulary', '/settings', '/account', '/login', '/auth/callback', '/unknown']) assert.equal(routeMetadata(path).robots, 'noindex, follow');
});
test('privacy describes local loss, external processing and limited event payloads', () => {
  const html = render(require('../views/PrivacyView.tsx').default);
  for (const text of [/IndexedDB/, /localStorage/, /no cloud backup or cross-device sync/, /Google/, /Supabase/, /HttpOnly/, /one hour/, /Gmail messages/, /Gemini or Deepgram/, /only action names and the app version/, /ordinary request logs/, /not attached automatically/, /clear storage/, /mailto:dihou008@gmail.com/]) assert.match(html, text);
  for (const id of ['local-data', 'transcription', 'external-services', 'usage', 'feedback', 'data-controls']) assert.match(html, new RegExp(`id="${id}"`));
});
test('about offers truthful product context and practical next steps', () => {
  const html = render(require('../views/AboutView.tsx').default);
  assert.match(html, /individually maintained/);
  for (const path of ['/add', '/help', '/contact', '/privacy']) assert.match(html, new RegExp(`href="${path}"`));
});

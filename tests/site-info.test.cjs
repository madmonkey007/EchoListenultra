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
  const renderSeo = source => source.replaceAll('%SITE_ORIGIN%', SITE_ORIGIN);
  const sitemap = renderSeo(fs.readFileSync('public/sitemap.xml', 'utf8'));
  const urls = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map(match => match[1]);
  assert.deepEqual(urls, publicPaths.map(path => SITE_ORIGIN + path));
  for (const path of publicPaths) {
    assert.equal(routeMetadata(path).robots, 'index, follow');
    assert.ok(routeMetadata(path).description.length > 30);
  }
  assert.match(renderSeo(fs.readFileSync('public/robots.txt', 'utf8')), new RegExp(`Sitemap: ${SITE_ORIGIN}/sitemap.xml`));
});
test('personal workspace and unknown routes are not indexable', () => {
  for (const path of ['/library', '/add', '/player/private-lesson', '/player/sample-1', '/vocabulary', '/settings', '/account', '/login', '/auth/callback', '/unknown']) assert.equal(routeMetadata(path).robots, 'noindex, follow');
});
test('privacy describes current online processing and transient results', () => {
  const html = render(require('../views/PrivacyView.tsx').default);
  for (const text of [/Cloudflare Workers AI/, /after a refresh/, /Copy text/, /Download SRT/, /theme preference/, /action names and the app version/, /not attached automatically/]) assert.match(html, text);
  assert.doesNotMatch(html, /Gemini|Deepgram|Vocabulary|listening|Supabase|IndexedDB/i);
});
test('about describes the Reel product with relevant next steps', () => {
  const html = render(require('../views/AboutView.tsx').default);
  assert.match(html, /independently maintained/);
  for (const path of ['/', '/help', '/contact', '/privacy']) assert.match(html, new RegExp(`href="${path}"`));
  assert.doesNotMatch(html, /listening|Gemini|Deepgram|Vocabulary|provider key/i);
});

import fs from 'node:fs';
import path from 'node:path';
import type { Plugin } from 'vite';
import siteConfig from './site-config.json';

export function renderSeoTemplate(source: string): string {
  return source.replaceAll('%SITE_ORIGIN%', siteConfig.origin);
}

// Public assets are copied by Vite; resolve their templates for both dev and production.
export function staticSeo(): Plugin {
  const assets = ['robots.txt', 'sitemap.xml'];
  let root = process.cwd();
  let output = 'dist';
  return {
    name: 'production-domain-seo',
    configResolved(config) { root = config.root; output = config.build.outDir; },
    transformIndexHtml: { order: 'pre', handler: renderSeoTemplate },
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const name = req.url?.split('?')[0].slice(1);
        if (!name || !assets.includes(name)) { next(); return; }
        res.setHeader('Content-Type', name.endsWith('.xml') ? 'application/xml' : 'text/plain');
        res.end(renderSeoTemplate(fs.readFileSync(path.join(root, 'public', name), 'utf8')));
      });
    },
    closeBundle() {
      for (const name of assets) {
        fs.writeFileSync(path.resolve(root, output, name), renderSeoTemplate(fs.readFileSync(path.join(root, 'public', name), 'utf8')));
      }
    },
  };
}

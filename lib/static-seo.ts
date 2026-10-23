import fs from 'node:fs';
import path from 'node:path';
import { createServer, type Plugin } from 'vite';
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
    async closeBundle() {
      for (const name of assets) {
        fs.writeFileSync(path.resolve(root, output, name), renderSeoTemplate(fs.readFileSync(path.join(root, 'public', name), 'utf8')));
      }
      // Load existing React pages only at build time; no server runtime or model call.
      const renderer = await createServer({
        configFile: false, root, appType: 'custom',
        ssr: { resolve: { externalConditions: ['node', 'module-sync'] } },
        optimizeDeps: { noDiscovery: true, include: [], entries: [] },
        server: { middlewareMode: true }, esbuild: { jsx: 'automatic' },
      });
      try {
        const { renderPublicHtml, prerenderPaths } = await renderer.ssrLoadModule('/lib/render-public-pages.tsx');
        const home = fs.readFileSync(path.resolve(root, output, 'index.html'), 'utf8');
        for (const pathname of prerenderPaths) {
          fs.writeFileSync(path.resolve(root, output, pathname.slice(1) + '.html'), renderPublicHtml(home, pathname));
        }
      } finally { await renderer.close(); }
    },
  };
}

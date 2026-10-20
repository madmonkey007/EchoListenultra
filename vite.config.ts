import path from 'path';
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import events from './api/events';
import quota from './api/quota';
import videoImport from './api/video-import';

export default defineConfig(({ mode }) => {
 const env = loadEnv(mode, process.cwd(), '');
 // Only public Auth configuration enters the browser bundle.
 for (const key of ['SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY', 'QUOTA_COOKIE_SECRET', 'QUOTA_DAILY_SECONDS', 'PLATFORM_PROCESSING_DISABLED', 'VIDEO_IMPORT_WORKER_URL', 'VIDEO_IMPORT_WORKER_SECRET']) {
   if (env[key] && !process.env[key]) process.env[key] = env[key];
 }
 return {
  define: { __ECHO_AUTH_CONFIG__: JSON.stringify({ url: env.VITE_SUPABASE_URL || '', key: env.VITE_SUPABASE_ANON_KEY || '' }) },
  server: { port: 3000, host: '0.0.0.0' },
  plugins: [react(), {
    name: 'local-events',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const pathname = req.url?.split('?')[0];
        if (pathname === '/api/events') { void events(req, res); return; }
        if (pathname === '/api/video-import') { void videoImport(req, res); return; }
        if (pathname === '/api/quota') { void quota(req, res); return; }
        next();
      });
    },
  }],
  resolve: { alias: { '@': path.resolve(__dirname, '.') } }
 };
});

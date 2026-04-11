import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

function withDemoTrailingSlash(rawUrl?: string | null): string | null {
  if (!rawUrl) return null;
  const [pathname, search = ''] = rawUrl.split('?', 2);
  if (pathname === '/library-demo' || pathname === '/ui-demo') {
    return `${pathname}/${search ? `?${search}` : ''}`;
  }
  return null;
}

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),
    {
      name: 'demo-route-trailing-slash-redirect',
      configureServer(server) {
        server.middlewares.use((req, res, next) => {
          const redirectTo = withDemoTrailingSlash(req.url);
          if (!redirectTo) {
            next();
            return;
          }

          res.statusCode = 302;
          res.setHeader('Location', redirectTo);
          res.end();
        });
      },
      configurePreviewServer(server) {
        server.middlewares.use((req, res, next) => {
          const redirectTo = withDemoTrailingSlash(req.url);
          if (!redirectTo) {
            next();
            return;
          }

          res.statusCode = 302;
          res.setHeader('Location', redirectTo);
          res.end();
        });
      },
    },
  ],
  // Vite options tailored for Tauri development and only applied in `tauri dev` or `tauri build`
  // prevent vite from obscuring rust errors
  clearScreen: false,
  // tauri expects a fixed port, fail if that port is not available
  server: {
    port: 1420,
    strictPort: true,
  },
  // to make use of `TAURI_DEBUG` and other env variables
  // https://tauri.studio/v1/api/config#buildconfig.beforedevcommand
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    // Tauri supports es2021
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    // don't minify for debug builds
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    // produce sourcemaps for debug builds
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      input: {
        app: path.resolve(process.cwd(), 'index.html'),
        libraryDemo: path.resolve(process.cwd(), 'library-demo/index.html'),
        uiDemo: path.resolve(process.cwd(), 'ui-demo/index.html'),
      },
    },
  },
});

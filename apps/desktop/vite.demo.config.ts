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
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src'),
    },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
  },
  envPrefix: ['VITE_', 'TAURI_'],
  build: {
    target: process.env.TAURI_PLATFORM == 'windows' ? 'chrome105' : 'safari13',
    minify: !process.env.TAURI_DEBUG ? 'esbuild' : false,
    sourcemap: !!process.env.TAURI_DEBUG,
    rollupOptions: {
      input: {
        libraryDemo: path.resolve(process.cwd(), 'library-demo/index.html'),
        uiDemo: path.resolve(process.cwd(), 'ui-demo/index.html'),
      },
    },
  },
});

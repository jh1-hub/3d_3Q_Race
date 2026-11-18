import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import type {IncomingMessage, ServerResponse} from 'http';
import {defineConfig} from 'vite';
import {VitePWA} from 'vite-plugin-pwa';

const BGM_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mid': 'audio/midi',
  '.midi': 'audio/midi',
};

function serveBgmMiddleware(bgmDir: string) {
  return (req: IncomingMessage, res: ServerResponse, next: () => void) => {
    const rawUrl = req.url?.split('?')[0] ?? '';
    if (!rawUrl.startsWith('/bgm/')) {
      next();
      return;
    }

    let relPath = '';
    try {
      relPath = decodeURIComponent(rawUrl.slice('/bgm/'.length));
    } catch {
      res.statusCode = 400;
      res.end('Bad Request');
      return;
    }

    const resolved = path.resolve(bgmDir, relPath);
    if (!resolved.startsWith(bgmDir + path.sep) || !fs.existsSync(resolved)) {
      next();
      return;
    }

    const stat = fs.statSync(resolved);
    if (!stat.isFile()) {
      next();
      return;
    }

    const ext = path.extname(resolved).toLowerCase();
    const mime = BGM_MIME[ext] ?? 'application/octet-stream';
    res.setHeader('Content-Type', mime);
    res.setHeader('Accept-Ranges', 'bytes');
    res.setHeader('Cache-Control', 'public, max-age=3600');

    const range = req.headers.range;
    if (range) {
      const match = /^bytes=(\d*)-(\d*)$/.exec(range);
      if (match) {
        const start = match[1] ? parseInt(match[1], 10) : 0;
        const end = match[2] ? Math.min(parseInt(match[2], 10), stat.size - 1) : stat.size - 1;
        if (start <= end && start < stat.size) {
          res.statusCode = 206;
          res.setHeader('Content-Range', `bytes ${start}-${end}/${stat.size}`);
          res.setHeader('Content-Length', end - start + 1);
          fs.createReadStream(resolved, {start, end}).pipe(res);
          return;
        }
      }
    }

    res.statusCode = 200;
    res.setHeader('Content-Length', stat.size);
    fs.createReadStream(resolved).pipe(res);
  };
}

export default defineConfig(() => {
  const bgmDir = path.resolve(__dirname, 'bgm');

  return {
    plugins: [
      react(),
      tailwindcss(),
      VitePWA({
        registerType: 'autoUpdate',
        includeAssets: [
          'icon.svg',
          'apple-touch-icon.png',
          'pwa-192x192.png',
          'pwa-512x512.png',
          'pwa-maskable-512x512.png',
        ],
        manifest: {
          id: '/',
          name: 'HYPERION GP',
          short_name: 'HYPERION GP',
          description: '近未来の軌道サーキットを舞台にした、反重力ハイパーカーによる高速3Dレーシング学習ゲーム。',
          theme_color: '#05070e',
          background_color: '#05070e',
          display: 'standalone',
          start_url: '/',
          scope: '/',
          icons: [
            {
              src: '/pwa-192x192.png',
              sizes: '192x192',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'any',
            },
            {
              src: '/pwa-maskable-512x512.png',
              sizes: '512x512',
              type: 'image/png',
              purpose: 'maskable',
            },
          ],
        },
        workbox: {
          maximumFileSizeToCacheInBytes: 10 * 1024 * 1024,
          globPatterns: ['**/*.{js,css,html,ico,png,svg,woff,woff2}'],
          runtimeCaching: [
            {
              urlPattern: /\/bgm\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'bgm-assets-cache',
                expiration: {
                  maxEntries: 20,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.googleapis\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'google-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
            {
              urlPattern: /^https:\/\/fonts\.gstatic\.com\/.*/i,
              handler: 'CacheFirst',
              options: {
                cacheName: 'gstatic-fonts-cache',
                expiration: {
                  maxEntries: 10,
                  maxAgeSeconds: 60 * 60 * 24 * 365,
                },
                cacheableResponse: {
                  statuses: [0, 200],
                },
              },
            },
          ],
        },
        devOptions: {
          enabled: true,
          type: 'module',
        },
      }),
      // Serve root /bgm/* during dev and preview, and copy into dist/bgm for production builds.
      {
        name: 'serve-and-copy-bgm',
        configureServer(server) {
          server.middlewares.use(serveBgmMiddleware(bgmDir));
        },
        configurePreviewServer(server) {
          server.middlewares.use(serveBgmMiddleware(bgmDir));
        },
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const distBgm = path.resolve(distDir, 'bgm');
          if (fs.existsSync(distDir) && fs.existsSync(bgmDir)) {
            fs.cpSync(bgmDir, distBgm, {recursive: true, force: true});
          }
        },
      },
      // Copies src/assets into dist/ so root-relative URLs like
      // "/src/assets/images/..." (e.g. generate_image output) still resolve
      // in production builds. Do not remove.
      {
        name: 'copy-unbundled-src-assets',
        apply: 'build',
        closeBundle(error?: Error): void {
          if (error) {
            return;
          }
          const distDir = path.resolve(__dirname, 'dist');
          const srcAssets = path.resolve(__dirname, 'src/assets');
          const distAssets = path.resolve(distDir, 'src/assets');
          if (fs.existsSync(distDir) && fs.existsSync(srcAssets)) {
            fs.cpSync(srcAssets, distAssets, {recursive: true, force: true});
          }
        },
      },
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      // HMR is disabled in AI Studio via DISABLE_HMR env var.
      // Do not modify—file watching is disabled to prevent flickering during agent edits.
      hmr: process.env.DISABLE_HMR !== 'true',
      // Disable file watching when DISABLE_HMR is true to save CPU during agent edits.
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import fs from 'fs';
import path from 'path';
import type {IncomingMessage, ServerResponse} from 'http';
import {defineConfig} from 'vite';

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

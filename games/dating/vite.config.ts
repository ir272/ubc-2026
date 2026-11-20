// Dev harness for the dating stage: root is this folder, port 5203 strict, assets/ served at
// /assets/, and the show running in node behind /feed (harness/plugin.ts).
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { Plugin } from 'vite';
import type { UserConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));
const assetsDir = path.join(root, 'assets');

const MIME: Record<string, string> = {
  '.json': 'application/json',
  '.vrm': 'application/octet-stream',
  '.glb': 'model/gltf-binary',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.mp3': 'audio/mpeg',
  '.ogg': 'audio/ogg',
  '.wav': 'audio/wav',
  '.txt': 'text/plain; charset=utf-8',
};

/** GET /assets/** straight from games/dating/assets (publicDir is off) */
function serveAssets(): Plugin {
  return {
    name: 'dating-assets',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const url = decodeURIComponent((req.url ?? '').split('?')[0] ?? '');
        if (!url.startsWith('/assets/')) return next();
        const file = path.normalize(path.join(assetsDir, url.slice('/assets/'.length)));
        if (!file.startsWith(assetsDir + path.sep)) {
          res.statusCode = 403;
          return res.end();
        }
        fs.stat(file, (err, st) => {
          if (err || !st.isFile()) {
            res.statusCode = 404;
            return res.end('not found');
          }
          res.setHeader('Content-Type', MIME[path.extname(file).toLowerCase()] ?? 'application/octet-stream');
          res.setHeader('Content-Length', String(st.size));
          res.setHeader('Cache-Control', 'no-cache');
          fs.createReadStream(file).pipe(res);
        });
      });
    },
  };
}

export default async (): Promise<UserConfig> => {
  const plugins: Plugin[] = [serveAssets()];
  try {
    const m = await import('./harness/plugin.ts');
    plugins.push(m.datingHarness());
  } catch (e) {
    console.warn(`[dating] harness/plugin.ts not available (${(e as Error).message}); /feed is off, use ?demo=1`);
  }
  return {
    root,
    publicDir: false,
    plugins,
    server: { port: 5203, strictPort: true },
    preview: { port: 5203, strictPort: true },
  };
};

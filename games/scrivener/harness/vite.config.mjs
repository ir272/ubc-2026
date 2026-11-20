// The standalone harness: `npm run dev` serves a page that mounts the game exactly as the
// platform would (index.ts mount + onFeed) and feeds it from a local fake runner that plays
// channel.ts in a loop. Recorded feeds can be replayed from any point (see harness/main.ts).
//
// Env: PORT (default 5200), SCRIVENER_MOCK=1 (default here; set 0 with a key in .env for real
// models), FAST=call,choosing (dev: skip-speed those phases), ONCE=1 (one match then stop).

import { defineConfig } from 'vite';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createFakeRunner } from './fake_runner.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '..');
const FEEDS = path.join(ROOT, '.cache', 'feeds');

function fakeRunnerPlugin() {
  let fake = null;
  const ensure = async () => {
    if (fake) return fake;
    const mod = await import(path.join(ROOT, 'channel.ts'));
    const def = mod.default({ mock: process.env.SCRIVENER_MOCK !== '0', recordsFile: path.join(ROOT, '.cache', 'records.dev.json') });
    fake = createFakeRunner(def, { recordDir: FEEDS, once: process.env.ONCE === '1', log: (m) => console.log(`[fake-runner] ${m}`) });
    fake.start();
    return fake;
  };
  return {
    name: 'scrivener-fake-runner',
    configureServer(server) {
      server.httpServer?.on('close', () => fake && fake.stop());
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url, 'http://x');
        if (url.pathname === '/feed') {
          let f;
          try { f = await ensure(); } catch (e) { res.statusCode = 500; res.end(String(e && e.stack ? e.stack : e)); console.error(e); return; }
          res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive' });
          const send = (msg) => res.write(`data: ${JSON.stringify(msg)}\n\n`);
          send(f.snapshot());
          const off = f.subscribe(send);
          req.on('close', off);
          return;
        }
        if (url.pathname === '/feeds') {
          const list = fs.existsSync(FEEDS) ? fs.readdirSync(FEEDS).filter((x) => x.endsWith('.jsonl')).map((x) => ({ name: x, size: fs.statSync(path.join(FEEDS, x)).size, mtime: fs.statSync(path.join(FEEDS, x)).mtimeMs })).sort((a, b) => b.mtime - a.mtime) : [];
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify(list));
          return;
        }
        if (url.pathname.startsWith('/feeds/')) {
          const name = path.basename(url.pathname);
          const file = path.join(FEEDS, name);
          if (!name.endsWith('.jsonl') || !fs.existsSync(file)) { res.statusCode = 404; res.end('no such feed'); return; }
          res.setHeader('content-type', 'text/plain');
          fs.createReadStream(file).pipe(res);
          return;
        }
        next();
      });
    },
  };
}

export default defineConfig({
  root: HERE,
  plugins: [fakeRunnerPlugin()],
  // no hot reload unless asked (HMR=1): a reload in the middle of a capture or a live match restarts the stage
  server: { port: Number(process.env.PORT || 5200), strictPort: true, host: '127.0.0.1', fs: { allow: [ROOT] }, hmr: process.env.HMR === '1' },
  build: { target: 'es2022' },
  clearScreen: false,
});

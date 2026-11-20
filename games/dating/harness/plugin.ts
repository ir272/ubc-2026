// Vite plugin for the dev harness: runs the dating channel in a loop inside the dev server, on the
// local fake Show, and serves the feed:
//   GET  /feed           Server-Sent Events: first the snapshot, then every feed message (JSON)
//   GET  /feed/snapshot  the current snapshot (JSON)
//   POST /feed/skip      plays the current episode out fast (testing)
// DATING_SPEED (env or .env) scales time. The channel and the show code are imported natively at
// runtime (not bundled into the vite config), so their file paths resolve normally.

import path from 'node:path';
import { pathToFileURL } from 'node:url';
import type { IncomingMessage, ServerResponse } from 'node:http';
import type { Plugin, ViteDevServer } from 'vite';

type Hub = {
  snapshot(): { [k: string]: unknown };
  subscribe(l: (msg: unknown, json: string) => void): () => void;
  skip(f?: number): void;
};

export function datingHarness(): Plugin {
  let stop: (() => void) | null = null;
  let hubP: Promise<Hub> | null = null;

  async function start(root: string): Promise<Hub> {
    const imp = (rel: string) => import(/* @vite-ignore */ pathToFileURL(path.join(root, rel)).href);
    const ch = await imp('channel.ts');
    const fk = await imp('harness/fakeShow.ts');
    ch.loadEnv?.();
    const speed = Number(process.env.DATING_SPEED) > 0 ? Number(process.env.DATING_SPEED) : 1;
    const hub = new fk.FakeHub({ speed });
    // the fake hub scales time itself, so the channel runs at speed 1
    const def = ch.default({ speed: 1 });
    const ac = new AbortController();
    stop = () => ac.abort();
    void fk.runLoop(def, hub, { signal: ac.signal });
    console.log(`[dating] harness: channel loop running at speed ${speed}, feed at /feed`);
    return hub as Hub;
  }

  return {
    name: 'dating-harness',
    apply: 'serve',
    configureServer(server: ViteDevServer) {
      const root = server.config.root;
      hubP ??= start(root);
      server.httpServer?.once('close', () => stop?.());

      server.middlewares.use(async (req: IncomingMessage, res: ServerResponse, next: () => void) => {
        const url = (req.url ?? '').split('?')[0];
        if (url !== '/feed' && url !== '/feed/snapshot' && url !== '/feed/skip') return next();
        let hub: Hub;
        try {
          hub = await hubP!;
        } catch (e) {
          res.statusCode = 500;
          res.end(`harness failed to start: ${(e as Error).message}`);
          return;
        }
        if (url === '/feed/snapshot') {
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Cache-Control', 'no-store');
          res.end(JSON.stringify(hub.snapshot()));
          return;
        }
        if (url === '/feed/skip') {
          if (req.method !== 'POST') {
            res.statusCode = 405;
            res.end('POST only');
            return;
          }
          hub.skip(400);
          res.setHeader('Content-Type', 'application/json');
          res.end('{"ok":true}');
          return;
        }
        // SSE
        res.writeHead(200, {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache, no-transform',
          Connection: 'keep-alive',
          'X-Accel-Buffering': 'no',
        });
        res.write(`data: ${JSON.stringify(hub.snapshot())}\n\n`);
        const off = hub.subscribe((_msg, json) => res.write(`data: ${json}\n\n`));
        const beat = setInterval(() => res.write(': keep-alive\n\n'), 15000);
        req.on('close', () => {
          clearInterval(beat);
          off();
        });
      });
    },
  };
}

export default datingHarness;

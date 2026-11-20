// Shared helpers for capture/perf tools: a private Vite dev server on a free port and a
// GPU-enabled Chromium (Playwright), with the WebGL renderer string verified.
import { createServer as createNetServer } from 'node:net';
import { existsSync, readdirSync } from 'node:fs';
import { homedir, tmpdir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..');

export function parseArgs(argv, { multi = [] } = {}) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const [k, inline] = a.slice(2).split('=');
    if (multi.includes(k)) {
      const vals = inline != null ? [inline] : [];
      while (inline == null && i + 1 < argv.length && !argv[i + 1].startsWith('--')) vals.push(argv[++i]);
      out[k] = (out[k] || []).concat(vals);
      continue;
    }
    if (inline != null) out[k] = inline;
    else if (i + 1 < argv.length && !argv[i + 1].startsWith('--')) out[k] = argv[++i];
    else out[k] = true;
  }
  return out;
}

export function freePort() {
  return new Promise((res, rej) => {
    const s = createNetServer();
    s.unref();
    s.on('error', rej);
    s.listen(0, '127.0.0.1', () => { const { port } = s.address(); s.close(() => res(port)); });
  });
}

export async function startVite() {
  // TT_URL=https://... points every tool (crosscheck, perf, capture) at a deployed build instead.
  if (process.env.TT_URL) return { server: null, url: process.env.TT_URL.replace(/\/?$/, '/'), close: async () => {} };
  const { createServer } = await import('vite');
  const port = await freePort();
  const server = await createServer({
    configFile: join(ROOT, 'vite.config.js'),
    logLevel: 'error',
    cacheDir: join(tmpdir(), `tumbletop-vite-${process.pid}-${port}`),
    optimizeDeps: { noDiscovery: true, include: [] }, // no shared pre-bundle cache: safe to run many at once
    server: { port, strictPort: true, host: '127.0.0.1', hmr: false, watch: null },
  });
  await server.listen();
  return { server, url: `http://127.0.0.1:${port}/`, close: () => server.close() };
}

/**
 * The dev page to drive: an existing Tumbletop dev server on `port` (default 5201), or, if nothing
 * listens there, one started here on that port (closed by `close()`). If the port is held by some
 * other app, a private server on a free port is started instead (and a note is printed).
 * TT_URL overrides everything. Returns { url, started, close }.
 */
export async function resolveServer({ port = 5201, quiet = false } = {}) {
  if (process.env.TT_URL) return { url: process.env.TT_URL.replace(/\/?$/, '/'), started: false, close: async () => {} };
  const url = `http://localhost:${port}/`;
  let body = null;
  try {
    const ctl = new AbortController();
    const to = setTimeout(() => ctl.abort(), 3000);
    const res = await fetch(url, { signal: ctl.signal });
    clearTimeout(to);
    body = await res.text();
  } catch { body = null; }
  if (body != null && /Tumbletop/.test(body)) return { url, started: false, close: async () => {} };
  const { createServer } = await import('vite');
  let usePort = port;
  if (body != null) {
    usePort = await freePort();
    if (!quiet) console.log(`note: port ${port} is serving something else; starting Tumbletop on ${usePort}`);
  }
  const server = await createServer({
    configFile: join(ROOT, 'vite.config.js'),
    logLevel: 'error',
    server: { port: usePort, strictPort: true, host: 'localhost', hmr: false },
  });
  await server.listen();
  if (!quiet) console.log(`started a dev server on ${usePort} (stopped when done)`);
  return { url: `http://localhost:${usePort}/`, started: true, close: () => server.close() };
}

/** Load the dev page with these query parameters and wait for window.__tt.ready. */
export async function openStage(page, baseUrl, params, timeout = 90000) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null && v !== false).map(([k, v]) => [k, String(v)]));
  await page.goto(`${baseUrl}?${qs}`, { waitUntil: 'load', timeout });
  await page.waitForFunction(() => window.__tt && window.__tt.ready === true, null, { timeout });
  const gl = await page.evaluate(() => window.__tt.handle().debug.perf().glRenderer);
  if (/swiftshader|llvmpipe|software/i.test(gl || '')) console.warn(`warning: software GL renderer: ${gl}`);
  return gl;
}

export function chromiumPath(chromium) {
  if (process.env.TT_CHROME && existsSync(process.env.TT_CHROME)) return process.env.TT_CHROME;
  try { const p = chromium.executablePath(); if (p && existsSync(p)) return p; } catch { /* fall through */ }
  const cache = join(homedir(), 'Library', 'Caches', 'ms-playwright');
  if (existsSync(cache)) {
    const dirs = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split('-')[1]) - Number(a.split('-')[1]));
    for (const d of dirs) {
      for (const app of ['chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing',
        'chrome-mac/Chromium.app/Contents/MacOS/Chromium', 'chrome-linux/chrome']) {
        const p = join(cache, d, app);
        if (existsSync(p)) return p;
      }
    }
  }
  return undefined;
}

export const GPU_ARGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-gpu-rasterization',
  '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows', '--disable-renderer-backgrounding'];

export async function launchBrowser({ headless = true, width = 1280, height = 720, scale = 1 } = {}) {
  const { chromium } = await import('playwright');
  const executablePath = chromiumPath(chromium);
  const args = [...GPU_ARGS, '--mute-audio']; // capture browsers never make a sound (sound is judged from the offline render)
  if (!headless) args.push(`--window-size=${width},${height + 100}`);
  const browser = await chromium.launch({ headless, executablePath, args });
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: scale });
  const page = await context.newPage();
  const logs = [];
  page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') logs.push(`[${m.type()}] ${m.text()}`); });
  page.on('pageerror', (e) => logs.push(`[pageerror] ${e.stack || e.message}`));
  return { browser, context, page, logs, executablePath };
}

export async function openGame(page, baseUrl, params, timeout = 60000) {
  const qs = new URLSearchParams(Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)]));
  await page.goto(`${baseUrl}?${qs}`, { waitUntil: 'load', timeout });
  await page.waitForFunction(() => window.__tt && window.__tt.ready === true, null, { timeout });
  const gl = await page.evaluate(() => window.__tt.perf().glRenderer);
  if (!gl) throw new Error('WebGL not available in this browser');
  if (/swiftshader|llvmpipe|software/i.test(gl)) console.warn(`warning: software GL renderer: ${gl}`);
  return gl;
}

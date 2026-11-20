// One headless browser for games/brawl, always under the lock in lock.mjs.
// Starts a Vite dev server on 5202 when none is listening (and stops it after),
// launches chromium headless with hardware WebGL (ANGLE on Metal), collects every
// console error, page error and failed module request, and retries page loads
// while other agents' edits leave the build broken for a moment.
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { acquireLock, releaseLock, onCleanup, touchLock } from './lock.mjs';

export const GAME_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
export const PORT = 5202;
export const ORIGIN = `http://localhost:${PORT}`;
export const GPU_FLAGS = ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--enable-webgl'];
const EXTRA_FLAGS = ['--disable-background-timer-throttling', '--disable-renderer-backgrounding',
  '--disable-backgrounding-occluded-windows', '--mute-audio', '--hide-scrollbars'];

const log = (s) => process.stderr.write(s + '\n');
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- dev server ----------
async function portAnswers(ms = 1500) {
  for (const host of ['localhost', '127.0.0.1']) {
    try {
      const r = await fetch(`http://${host}:${PORT}/`, { signal: AbortSignal.timeout(ms) });
      await r.arrayBuffer().catch(() => {});
      return true;
    } catch { /* try next */ }
  }
  return false;
}

/** Make sure Vite is serving games/brawl on 5202. Returns { startedByUs, stop }. */
export async function ensureDevServer() {
  if (await portAnswers()) return { startedByUs: false, stop: async () => {} };
  log(`starting vite on ${PORT}`);
  const child = spawn('npx', ['vite', '--port', String(PORT), '--strictPort'], {
    cwd: GAME_DIR, detached: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, BROWSER: 'none', FORCE_COLOR: '0' },
  });
  let out = '';
  child.stdout.on('data', (d) => { out += d; if (out.length > 20000) out = out.slice(-10000); });
  child.stderr.on('data', (d) => { out += d; if (out.length > 20000) out = out.slice(-10000); });
  let exited = null;
  child.on('exit', (code) => { exited = code; });
  const killSync = () => { try { process.kill(-child.pid, 'SIGTERM'); } catch { /* gone */ } };
  const unregister = onCleanup(killSync);
  const t0 = Date.now();
  while (!(await portAnswers(1000))) {
    if (exited !== null) throw new Error(`vite exited (${exited}) before listening:\n${out.trim()}`);
    if (Date.now() - t0 > 45000) { killSync(); throw new Error(`vite did not answer on ${PORT} within 45 s:\n${out.trim()}`); }
    await sleep(300);
  }
  log(`vite up in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  return {
    startedByUs: true,
    output: () => out,
    stop: async () => {
      unregister();
      if (exited !== null) return;
      try { process.kill(-child.pid, 'SIGTERM'); } catch { return; }
      for (let i = 0; i < 30 && exited === null; i++) await sleep(100);
      if (exited === null) { try { process.kill(-child.pid, 'SIGKILL'); } catch { /* gone */ } }
    },
  };
}

/** Where the harness page is served. Vite root is games/brawl unless vite.config says otherwise. */
export async function harnessUrl() {
  const candidates = ['/harness/index.html', '/harness/', '/index.html'];
  try {
    const cfg = ['vite.config.ts', 'vite.config.js', 'vite.config.mjs']
      .map((f) => path.join(GAME_DIR, f)).find((f) => fs.existsSync(f));
    if (cfg && /root\s*:\s*['"`][^'"`]*harness/.test(fs.readFileSync(cfg, 'utf8'))) candidates.unshift('/index.html');
  } catch { /* ignore */ }
  for (const p of candidates) {
    try {
      const r = await fetch(ORIGIN + p, { signal: AbortSignal.timeout(5000) });
      const t = await r.text();
      if (r.ok && /<script/i.test(t) && !/Cannot GET|404/.test(t.slice(0, 200))) return ORIGIN + p;
    } catch { /* next */ }
  }
  throw new Error(`no harness page found on ${ORIGIN} (tried ${candidates.join(', ')}); is harness/index.html there yet?`);
}

// ---------- chromium ----------
function newestCached(prefix, rel) {
  const base = path.join(os.homedir(), 'Library/Caches/ms-playwright');
  try {
    const dirs = fs.readdirSync(base).filter((d) => d.startsWith(prefix + '-'))
      .sort((a, b) => Number(b.split('-').pop()) - Number(a.split('-').pop()));
    for (const d of dirs) {
      const p = path.join(base, d, rel);
      if (fs.existsSync(p)) return p;
    }
  } catch { /* none */ }
  return null;
}

async function launchChromium(args) {
  const { chromium } = await import('playwright');
  try {
    return await chromium.launch({ headless: true, args });
  } catch (e) {
    if (!/Executable doesn't exist/.test(e.message)) throw e;
    // Playwright wants a newer build than the one installed; the installed one works.
    const exe = newestCached('chromium_headless_shell', 'chrome-headless-shell-mac-arm64/chrome-headless-shell')
      || newestCached('chromium', 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (!exe) throw e;
    return await chromium.launch({ headless: true, args, executablePath: exe });
  }
}

export async function webglRenderer(page) {
  return page.evaluate(() => {
    const c = document.createElement('canvas');
    const gl = c.getContext('webgl2') || c.getContext('webgl');
    if (!gl) return { renderer: 'no WebGL', hardware: false };
    const e = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = String(e ? gl.getParameter(e.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    return { renderer, hardware: !/swiftshader|llvmpipe|software|basic render/i.test(renderer) };
  });
}

/**
 * Open the one browser page. Returns { browser, page, cdp, errors, takeErrors(), gpu, close() }.
 * errors collects console errors, page errors, failed requests and HTTP >= 400 bodies.
 */
export async function openBrowser({ width = 1280, height = 720, flags = GPU_FLAGS } = {}) {
  const browser = await launchChromium([...flags, ...EXTRA_FLAGS]);
  const killSync = () => { try { browser.process?.()?.kill('SIGKILL'); } catch { /* gone */ } };
  const unregister = onCleanup(killSync);
  const context = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
  const page = await context.newPage();
  const errors = [];
  const ignore = (u) => /favicon\.ico/.test(u || '');
  page.on('console', (m) => {
    if (m.type() !== 'error') return;
    const loc = m.location();
    if (ignore(loc?.url) && /Failed to load resource/.test(m.text())) return;
    errors.push(`console error: ${m.text()}${loc?.url ? ` (${loc.url.replace(ORIGIN, '')}:${loc.lineNumber})` : ''}`);
  });
  page.on('pageerror', (e) => errors.push(`page error: ${e.stack || e.message}`));
  page.on('requestfailed', (r) => { if (!ignore(r.url())) errors.push(`request failed: ${r.url()} ${r.failure()?.errorText ?? ''}`); });
  page.on('response', async (r) => {
    if (r.status() < 400 || ignore(r.url())) return;
    let body = '';
    try { body = (await r.text()).slice(0, 2000); } catch { /* no body */ }
    errors.push(`HTTP ${r.status()} ${r.url().replace(ORIGIN, '')}${body ? ` ${body.replace(/\s+/g, ' ').slice(0, 600)}` : ''}`);
  });
  // No HMR in captures: other agents edit files mid-capture and a Vite reload would
  // wipe the scene. Mock every WebSocket so the Vite client sits idle.
  await page.routeWebSocket(/.*/, () => {});
  const cdp = await context.newCDPSession(page);
  await page.goto('about:blank');
  const gpu = await webglRenderer(page);
  return {
    browser, page, cdp, errors, gpu, flags,
    takeErrors() { return errors.splice(0, errors.length); },
    async setSize(w, h) { await page.setViewportSize({ width: w, height: h }); },
    async close() { unregister(); await browser.close().catch(killSync); },
  };
}

/** Fast screenshot through CDP. format 'png' | 'jpeg'. crop {x,y,w,h} in CSS px. */
export async function shot(b, { format = 'png', quality = 90, crop } = {}) {
  touchLock();
  const params = { format, captureBeyondViewport: false, optimizeForSpeed: true, fromSurface: true };
  if (format === 'jpeg') params.quality = quality;
  if (crop) params.clip = { x: crop.x, y: crop.y, width: crop.w, height: crop.h, scale: 1 };
  const { data } = await b.cdp.send('Page.captureScreenshot', params);
  return Buffer.from(data, 'base64');
}

/**
 * Run fn(attempt) and retry on failure: wait 20 s, up to 3 retries (Vite compile
 * errors while other agents are mid-edit usually clear within that).
 */
export async function withRetry(fn, { retries = 3, waitMs = 20000, firstWaitMs, what = 'page load' } = {}) {
  let last;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn(attempt);
    } catch (e) {
      last = e;
      if (e.noRetry) throw e;
      if (attempt < retries) {
        // A Vite we just started often fails the first load while it pre-bundles deps.
        const wait = attempt === 0 && firstWaitMs ? firstWaitMs : waitMs;
        log(`${what} failed (attempt ${attempt + 1} of ${retries + 1}), retrying in ${wait / 1000} s:\n  ${String(e.message).split('\n').slice(0, 6).join('\n  ')}`);
        const t = Date.now();
        while (Date.now() - t < wait) { touchLock(); await sleep(500); }
      }
    }
  }
  throw last;
}

/**
 * The whole browser session: lock, dev server if needed, one browser, always torn down.
 * opts: { width, height, needServer = true }. fn receives { b, server, baseUrl }.
 */
export async function session(opts, fn) {
  await acquireLock();
  const t0 = Date.now();
  let server = null;
  let b = null;
  try {
    let baseUrl = opts.url || null;
    if (opts.needServer !== false) {
      server = await ensureDevServer();
      baseUrl = opts.url || await withRetry(() => harnessUrl(), { what: 'finding the harness page' });
    }
    b = await openBrowser({ width: opts.width, height: opts.height, flags: opts.flags });
    b.server = server;
    log(`browser up in ${((Date.now() - t0) / 1000).toFixed(1)} s, WebGL: ${b.gpu.renderer}${b.gpu.hardware ? '' : '  (SOFTWARE: captures will be slow and may differ)'}`);
    return await fn({ b, server, baseUrl });
  } finally {
    if (b) await b.close();
    if (server?.startedByUs) await server.stop();
    releaseLock();
  }
}

/**
 * Vite answers a broken module with a bare 500 and sends the real message over the HMR
 * socket (mocked out here). Fetch the module from node to get the text, else fall back
 * to the tail of our own Vite log.
 */
async function explain(b, errs) {
  const out = [];
  const seen = new Set();
  for (const e of errs) {
    if (/^console error: Failed to load resource: the server responded with a status of 5/.test(e)) continue;
    if (/^request failed: .* net::ERR_ABORTED/.test(e)) continue;
    const m = /^HTTP (5\d\d) (\S+)$/.exec(e);
    if (m) {
      const url = m[2].replace(/[?&]t=\d+/, '');
      if (seen.has(url)) continue;
      seen.add(url);
      let body = '';
      try {
        const r = await fetch(ORIGIN + url, { signal: AbortSignal.timeout(10000), headers: { accept: '*/*' } });
        if (!r.ok) {
          const t = await r.text();
          const j = /const error = (\{.*?\});?\s*\n/s.exec(t);
          let msg = null;
          if (j) { try { const e = JSON.parse(j[1]); msg = [e.message, e.frame].filter(Boolean).join('\n'); } catch { /* raw */ } }
          body = (msg || t).slice(0, 1500);
        }
      } catch { /* server gone */ }
      if (!body && b.server?.output) {
        const tail = b.server.output().split('\n').filter((l) => /error|failed|cannot|does not|expected/i.test(l)).slice(-6).join('\n');
        body = tail;
      }
      out.push(`HTTP ${m[1]} ${url}${body ? `\n    ${body.trim().split('\n').join('\n    ')}` : ' (no detail from Vite: likely a TypeScript syntax error or a missing import in that file or one it imports)'}`);
      continue;
    }
    out.push(e);
  }
  return out;
}

/** Throw if the page has collected errors since the last check. */
export async function assertNoErrors(b, context, { allowConsole = false } = {}) {
  if (b.errors.length) await new Promise((r) => setTimeout(r, 150)); // let related errors land
  const errs = b.takeErrors();
  const fatal = allowConsole ? errs.filter((e) => !e.startsWith('console error')) : errs;
  if (allowConsole) for (const e of errs) if (e.startsWith('console error')) log(`warning: ${e}`);
  if (fatal.length) {
    const lines = await explain(b, fatal);
    const err = new Error(`${context}:\n${lines.join('\n')}`);
    err.pageErrors = fatal;
    throw err;
  }
  return errs;
}

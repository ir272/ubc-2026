// Shared helpers for the Playwright tools. Owner: core.
import { spawn } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createRequire } from 'node:module';

export const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const PORT = parseInt(process.env.PORT || '5177', 10);
export const BASE = `http://127.0.0.1:${PORT}`;

export function parseArgs(argv = process.argv.slice(2)) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) {
      const k = a.slice(2);
      const next = argv[i + 1];
      if (next == null || next.startsWith('--')) out[k] = true;
      else { (out[k] !== undefined ? (Array.isArray(out[k]) ? out[k] : (out[k] = [out[k]])).push(next) : (out[k] = next)); i++; }
    } else out._.push(a);
  }
  return out;
}

export async function loadPlaywright() {
  const candidates = [
    'playwright',
    '/opt/homebrew/lib/node_modules/playwright/index.mjs',
    '/usr/local/lib/node_modules/playwright/index.mjs',
  ];
  for (const c of candidates) {
    try { return await import(c); } catch { /* next */ }
  }
  try {
    const req = createRequire(import.meta.url);
    return req('playwright');
  } catch { /* fallthrough */ }
  throw new Error('Playwright not found. Install it globally (npm i -g playwright) or set NODE_PATH.');
}

// Launch chromium; if Playwright's expected browser build is not in the cache,
// fall back to the newest cached build (never downloads anything).
// One headless browser at a time for this whole folder (several builders share the machine):
// a directory lock under .cache/, taken before launch and released when the browser closes.
const LOCK_DIR = path.join(ROOT, '.cache', 'browser.lock');
async function takeBrowserLock() {
  fs.mkdirSync(path.dirname(LOCK_DIR), { recursive: true });
  for (let i = 0; i < 1200; i++) {
    try { fs.mkdirSync(LOCK_DIR); fs.writeFileSync(path.join(LOCK_DIR, 'pid'), String(process.pid)); break; } catch {
      let stale = false;
      try {
        const pid = parseInt(fs.readFileSync(path.join(LOCK_DIR, 'pid'), 'utf8'), 10);
        try { process.kill(pid, 0); } catch { stale = true; }
        if (Date.now() - fs.statSync(LOCK_DIR).mtimeMs > 6 * 60 * 1000) stale = true;
      } catch { stale = true; }
      if (stale) { fs.rmSync(LOCK_DIR, { recursive: true, force: true }); continue; }
      await new Promise((r) => setTimeout(r, 500));
    }
  }
  const release = () => { try { fs.rmSync(LOCK_DIR, { recursive: true, force: true }); } catch { /* gone */ } };
  process.once('exit', release);
  return release;
}

export async function launchChromium(chromium, opts = {}) {
  const release = await takeBrowserLock();
  const browser = await launchChromiumRaw(chromium, opts);
  const close = browser.close.bind(browser);
  browser.close = async (...a) => { try { return await close(...a); } finally { release(); } };
  return browser;
}

async function launchChromiumRaw(chromium, opts = {}) {
  try {
    return await chromium.launch(opts);
  } catch (err) {
    if (!/Executable doesn't exist/.test(String(err))) throw err;
    const cacheDir = process.env.PLAYWRIGHT_BROWSERS_PATH || path.join(os.homedir(), 'Library/Caches/ms-playwright');
    const dirs = fs.existsSync(cacheDir) ? fs.readdirSync(cacheDir) : [];
    const pickNewest = (prefix) => dirs.filter((d) => d.startsWith(prefix)).sort((a, b) => +b.split('-').pop() - +a.split('-').pop());
    const candidates = [];
    for (const d of pickNewest('chromium_headless_shell-')) candidates.push(path.join(cacheDir, d, 'chrome-headless-shell-mac-arm64', 'chrome-headless-shell'), path.join(cacheDir, d, 'chrome-headless-shell-linux64', 'chrome-headless-shell'));
    for (const d of pickNewest('chromium-')) candidates.push(path.join(cacheDir, d, 'chrome-mac-arm64', 'Google Chrome for Testing.app', 'Contents', 'MacOS', 'Google Chrome for Testing'), path.join(cacheDir, d, 'chrome-linux', 'chrome'));
    const exe = candidates.find((c) => fs.existsSync(c));
    if (!exe) throw err;
    return await chromium.launch({ ...opts, executablePath: exe });
  }
}

async function up() {
  try {
    const r = await fetch(`${BASE}/api/spend`, { signal: AbortSignal.timeout(800) });
    return r.ok;
  } catch {
    return false;
  }
}

// Ensures the server is running. Returns a stop() that only kills a server we started.
export async function ensureServer() {
  if (await up()) return { started: false, stop: async () => {} };
  const child = spawn(process.execPath, [path.join(ROOT, 'server.mjs')], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
  for (let i = 0; i < 50; i++) {
    await new Promise((r) => setTimeout(r, 100));
    if (await up()) break;
  }
  if (!(await up())) { child.kill(); throw new Error('server did not start'); }
  return {
    started: true,
    stop: async () => { child.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 100)); },
  };
}

export async function openGame(browser, query, { viewport = { width: 1280, height: 720 }, dpr = 1 } = {}) {
  const page = await browser.newPage({ viewport, deviceScaleFactor: dpr });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/?${query}`);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 20000 });
  return { page, errors };
}

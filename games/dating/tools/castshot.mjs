// Cast lab stills. Takes the shared browser lock, opens one headless Chromium, captures every job,
// closes the browser and releases the lock.
//   node tools/castshot.mjs "only=brock&t=2|1280x720|brock-idle" "gesture=shrug&t=peak|960x540|shrug"
//   node tools/castshot.mjs --perf "five=1&live=1|1280x720|five"   (prints frame timing)
// Output: captures/cast/<name>.png. Server: http://localhost:5203 (vite from this folder).
import { chromium } from 'playwright';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const lock = path.join(root, '.cache/browser.lock');
const outDir = path.join(root, 'captures/cast');
const base = process.env.CAST_URL ?? 'http://localhost:5203/castlab.html';
const args = process.argv.slice(2);
const perf = args.includes('--perf');
const evalArg = args.find((a) => a.startsWith('--eval='));
const evalSrc = evalArg ? fs.readFileSync(evalArg.slice(7), 'utf8') : null;
const jobs = args.filter((a) => !a.startsWith('--')).map((a) => {
  const [query, size = '1280x720', name] = a.split('|');
  const [w, h] = size.split('x').map(Number);
  return { query, w, h, name: name ?? query.replace(/[^a-z0-9]+/gi, '-') };
});

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function takeLock() {
  const start = Date.now();
  for (;;) {
    try {
      fs.mkdirSync(lock);
      return;
    } catch {
      try {
        const age = Date.now() - fs.statSync(lock).mtimeMs;
        if (age > 15 * 60 * 1000) {
          fs.rmdirSync(lock);
          continue;
        }
      } catch {
        continue;
      }
      if (Date.now() - start > 10 * 60 * 1000) throw new Error('browser lock busy for 10 minutes');
      console.log('lock busy, waiting 20 s');
      await sleep(20000);
    }
  }
}

fs.mkdirSync(outDir, { recursive: true });
await takeLock();
let browser;
try {
  // use the bundled headless shell if this Playwright's own build is not downloaded
  const cache = path.join(process.env.HOME ?? '', 'Library/Caches/ms-playwright');
  let executablePath;
  if (!fs.existsSync(chromium.executablePath()) && fs.existsSync(cache)) {
    const shells = fs.readdirSync(cache).filter((d) => d.startsWith('chromium_headless_shell-')).sort();
    for (const d of shells.reverse()) {
      const p = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
      if (fs.existsSync(p)) { executablePath = p; break; }
    }
  }
  browser = await chromium.launch({ executablePath, args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  for (const j of jobs) {
    const page = await browser.newPage({ viewport: { width: j.w, height: j.h } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    const t0 = Date.now();
    await page.goto(`${base}?${j.query}`);
    await page.waitForFunction(() => window.__castReady || window.__castError, null, { timeout: 120000 });
    const err = await page.evaluate(() => window.__castError);
    if (perf) {
      await page.waitForFunction(() => window.__perf, null, { timeout: 60000 });
      await sleep(4000);
      console.log('perf', j.name, JSON.stringify(await page.evaluate(() => window.__perf)));
    } else {
      await page.evaluate(() => document.fonts?.ready);
    }
    if (evalSrc) console.log('eval', j.name, JSON.stringify(await page.evaluate(evalSrc), null, 0));
    const file = path.join(outDir, `${j.name}.png`);
    await page.screenshot({ path: file });
    console.log(`${file} ${Date.now() - t0} ms${err ? ' ERROR ' + err : ''}${errors.length ? ' console: ' + errors.slice(0, 3).join(' | ') : ''}`);
    await page.close();
  }
} finally {
  await browser?.close();
  try {
    fs.rmdirSync(lock);
  } catch {
    /* already gone */
  }
}

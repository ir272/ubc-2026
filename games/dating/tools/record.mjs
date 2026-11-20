// Records a video of the stage in one headless Chromium, then closes it.
//   node tools/record.mjs --seconds 75 --name preview [--url "http://localhost:5203/?size=1280"] [--hide ".cm-round,.cm-hand"] [--fps 20]
// Writes captures/video/<name>.mp4 (1280x720, cropped to the stage). No sound is recorded.
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = Object.fromEntries(process.argv.slice(2).reduce((acc, a, i, all) => {
  if (a.startsWith('--')) acc.push([a.slice(2), all[i + 1] && !all[i + 1].startsWith('--') ? all[i + 1] : 'true']);
  return acc;
}, []));
const url = args.url ?? 'http://localhost:5203/?size=1280';
const seconds = Number(args.seconds ?? 60);
const name = args.name ?? 'preview';
const outDir = path.join(root, 'captures', 'video');
fs.mkdirSync(outDir, { recursive: true });

function findChromium() {
  if (process.env.CHROMIUM) return process.env.CHROMIUM;
  try { if (fs.existsSync(chromium.executablePath())) return undefined; } catch { /* fall through */ }
  const cache = path.join(process.env.HOME ?? '', 'Library/Caches/ms-playwright');
  const dirs = fs.existsSync(cache) ? fs.readdirSync(cache).sort().reverse() : [];
  for (const d of dirs.filter((x) => x.startsWith('chromium-'))) {
    const exe = path.join(cache, d, 'chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing');
    if (fs.existsSync(exe)) return exe;
  }
  for (const d of dirs.filter((x) => x.startsWith('chromium_headless_shell-'))) {
    const exe = path.join(cache, d, 'chrome-headless-shell-mac-arm64/chrome-headless-shell');
    if (fs.existsSync(exe)) return exe;
  }
  return undefined;
}

const lock = path.join(root, '.cache', 'browser.lock');
const until = Date.now() + 10 * 60_000;
for (;;) {
  try { fs.mkdirSync(lock); break; } catch {
    if (Date.now() > until) throw new Error('browser lock busy');
    await new Promise((r) => setTimeout(r, 5000));
  }
}
let browser;
try {
  browser = await chromium.launch({ headless: true, executablePath: findChromium(), args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist'] });
  const W = 1320, H = 800;
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  await page.goto(url, { waitUntil: "domcontentloaded" });
  if (args.hide) await page.addStyleTag({ content: args.hide + "{display:none !important}" });
  await page.waitForSelector("canvas", { timeout: 30000 });
  await page.waitForTimeout(2500);
  const box = await page.evaluate(() => { const c = document.querySelector("canvas").getBoundingClientRect(); return { x: Math.round(c.x), y: Math.round(c.y), w: Math.round(c.width), h: Math.round(c.height) }; });
  const even = (n) => n - (n % 2);
  const clip = { x: box.x, y: box.y, width: even(box.w), height: even(box.h) };
  const frames = path.join(outDir, name + "-frames");
  fs.rmSync(frames, { recursive: true, force: true });
  fs.mkdirSync(frames, { recursive: true });
  // frames at a fixed rate (20 a second unless --fps): each slot shows the latest screenshot, so timing stays true
  const FPS = Number(args.fps ?? 20), total = Math.round(seconds * FPS);
  const t0 = Date.now();
  let shot = null, n = 0, taken = 0;
  while (n < total) {
    shot = await page.screenshot({ clip, type: "jpeg", quality: 82 });
    taken++;
    const due = Math.min(total, Math.floor(((Date.now() - t0) / 1000) * FPS) + 1);
    while (n < due) fs.writeFileSync(path.join(frames, String(n++).padStart(5, "0") + ".jpg"), shot);
  }
  const mp4 = path.join(outDir, name + ".mp4");
  execFileSync("ffmpeg", ["-loglevel", "error", "-y", "-framerate", String(FPS), "-i", path.join(frames, "%05d.jpg"), "-c:v", "libx264", "-preset", "medium", "-crf", "22", "-pix_fmt", "yuv420p", "-r", "24", "-an", mp4]);
  fs.rmSync(frames, { recursive: true, force: true });
  console.log("wrote " + mp4 + " (" + (fs.statSync(mp4).size / 1e6).toFixed(1) + " MB, " + seconds + " s, " + taken + " screenshots = " + (taken / seconds).toFixed(1) + " a second at " + FPS + " fps, stage " + clip.width + "x" + clip.height + ")");
} finally {
  if (browser) await browser.close().catch(() => {});
  try { fs.rmdirSync(lock); } catch { /* not ours */ }
}

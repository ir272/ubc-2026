#!/usr/bin/env node
// Frame-rate check: plays a whole show in REAL time in the dev page (bets shortened) and samples
// the frame interval (requestAnimationFrame) and the stage's own work per frame.
//   node tools/perf.mjs [--seed 7] [--seconds 110] [--size 1280x720]
// Headless Chromium on the machine's GPU. Passes if the median interval is 60 fps and fewer than
// 1% of frames are longer than 25 ms (a missed vsync).
import { parseArgs, resolveServer, launchBrowser, openStage } from './lib/browser.mjs';

const args = parseArgs(process.argv.slice(2));
const seconds = Number(args.seconds ?? 110);
const [width, height] = String(args.size ?? '1280x720').split('x').map(Number);
const server = await resolveServer({ port: Number(args.port ?? 5201) });
let browser = null, ok = false;
try {
  const b = await launchBrowser({ headless: !args.headed, width, height });
  browser = b.browser;
  const gl = await openStage(b.page, server.url, { seed: Number(args.seed ?? 7), bets: 3, call: 3 });
  await b.page.evaluate(() => {
    const w = window; w.__iv = []; let last = 0;
    const tick = (ts) => { if (last) w.__iv.push(ts - last); last = ts; requestAnimationFrame(tick); };
    requestAnimationFrame(tick);
    w.__tt.handle().debug.perfReset();
  });
  const phases = new Set();
  for (let t = 0; t < seconds; t += 2) {
    await b.page.waitForTimeout(2000);
    phases.add(await b.page.evaluate(() => window.__tt.state().phase));
  }
  const r = await b.page.evaluate(() => {
    const iv = window.__iv.slice().sort((a, b) => a - b);
    const q = (p) => iv[Math.min(iv.length - 1, Math.floor((iv.length - 1) * p))];
    return { frames: iv.length, p50: q(0.5), p95: q(0.95), p99: q(0.99), max: q(1), long: iv.filter((x) => x > 25).length, perf: window.__tt.handle().debug.perf() };
  });
  const longPct = (100 * r.long) / Math.max(1, r.frames);
  console.log(`GL: ${gl}`);
  console.log(`phases seen: ${[...phases].join(', ')}`);
  console.log(`frames ${r.frames}  interval ms: median ${r.p50.toFixed(1)}  p95 ${r.p95.toFixed(1)}  p99 ${r.p99.toFixed(1)}  max ${r.max.toFixed(0)}  over 25 ms: ${r.long} (${longPct.toFixed(2)}%)`);
  console.log(`stage work per frame ms: mean ${r.perf.meanMs.toFixed(2)}  p95 ${r.perf.p95.toFixed(2)}  p99 ${r.perf.p99.toFixed(2)}  max ${r.perf.max.toFixed(1)}  | draw calls ${r.perf.drawCalls}  triangles ${r.perf.triangles}`);
  console.log(`cast rebuilds ms: ${r.perf.castBuildMs.map((x) => x.toFixed(0)).join(', ')}`);
  ok = r.p50 < 17.5 && longPct < 1;
  console.log(ok ? 'PASS' : 'FAIL');
} finally {
  await browser?.close();
  await server.close?.();
}
process.exit(ok ? 0 : 1);

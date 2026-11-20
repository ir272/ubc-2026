#!/usr/bin/env node
// The dead-air check: replays a recorded match in real time and samples the stage four times a
// second on a 96x54 grid. Reports the longest stretch in which less than a set share of the
// picture changed, per phase. The bar: no stretch over 2.5 s with nothing moving.
//   node tools/deadair.mjs [--feed <file.jsonl>] [--from phase:call] [--seconds 120]
// A stretch is "still" when under 0.12% of the grid changes between samples (a candle flame or a
// single digit ticking is enough to break it) and "quiet" when under 1% does.

import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT, parseArgs, loadPlaywright, launchChromium } from './_lib.mjs';

const args = parseArgs();
const PORT = 5200, BASE = `http://127.0.0.1:${PORT}`;
const up = async () => { try { return (await fetch(`${BASE}/feeds`, { signal: AbortSignal.timeout(800) })).ok; } catch { return false; } };
let child = null;
if (!(await up())) {
  child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', path.join(ROOT, 'harness', 'vite.config.mjs')], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 80 && !(await up()); i++) await new Promise((r) => setTimeout(r, 150));
}
const { chromium } = await loadPlaywright();
const browser = await launchChromium(chromium);
let result;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  const qs = new URLSearchParams({ bare: '1', mute: '1', replay: args.feed || 'latest', at: args.from || 'phase:call' });
  await page.goto(`${BASE}/?${qs}`);
  await page.waitForFunction(() => window.__harness && window.__harness.ready);
  result = await page.evaluate(async (maxMs) => {
    const GW = 96, GH = 54, STEP = 250;
    const c = document.createElement('canvas'); c.width = GW; c.height = GH;
    const g = c.getContext('2d', { willReadFrequently: true });
    let prev = null;
    const runs = {}; // phase -> { still: {cur, max, at}, quiet: {...}, samples }
    const t0 = performance.now();
    while (performance.now() - t0 < maxMs && !window.__harness.ended) {
      const st = window.__stage.state();
      const key = st.phase === 'fight' ? `fight:${st.fight.mode}` : st.phase;
      g.drawImage(window.__stage.canvas, 0, 0, GW, GH);
      const d = g.getImageData(0, 0, GW, GH).data;
      if (prev) {
        let changed = 0;
        for (let i = 0; i < d.length; i += 4) if (Math.abs(d[i] - prev[i]) + Math.abs(d[i + 1] - prev[i + 1]) + Math.abs(d[i + 2] - prev[i + 2]) > 36) changed++;
        const frac = changed / (GW * GH);
        const r = (runs[key] ||= { still: { cur: 0, max: 0, at: 0 }, quiet: { cur: 0, max: 0, at: 0 }, samples: 0 });
        r.samples++;
        for (const [name, limit] of [['still', 0.0012], ['quiet', 0.01]]) {
          const x = r[name];
          if (frac < limit) { x.cur += STEP; if (x.cur > x.max) { x.max = x.cur; x.at = Math.round(st.ms / 1000); } } else x.cur = 0;
        }
      }
      prev = d.slice();
      await new Promise((r) => setTimeout(r, STEP));
    }
    return { seconds: Math.round((performance.now() - t0) / 1000), runs };
  }, parseInt(args.seconds || '600', 10) * 1000);
} finally { await browser.close(); if (child) child.kill('SIGTERM'); }
const rows = Object.entries(result.runs).map(([k, r]) => ({ where: k, seconds: Math.round(r.samples / 4), longestStillMs: r.still.max, stillAtMatchSec: r.still.at, longestQuietMs: r.quiet.max, quietAtMatchSec: r.quiet.at }));
const worst = Math.max(0, ...rows.map((r) => r.longestStillMs));
console.log(JSON.stringify({ watchedSeconds: result.seconds, worstStillMs: worst, pass: worst <= 2500, rows }, null, 1));

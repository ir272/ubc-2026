#!/usr/bin/env node
// Performance probe: loads the full game with ?mock=1 and runs it at real time.
//   node tools/perf.mjs [--seconds 30] [--speed 1] [--query "extra=params"] [--headed] [--novsync]
// Reports: avgFps, low1Fps (mean fps of the slowest 1% of frames), p95FrameMs,
// and mainThreadMs (update+render per frame from performance.measure('frame')),
// which is the reliable metric: headless frame pacing depends on the host.
// vsync stays ON by default; --novsync adds --disable-gpu-vsync to see the uncapped rate.

import { parseArgs, loadPlaywright, launchChromium, ensureServer, openGame } from './_lib.mjs';
import { percentile } from '../src/core/math.js';

const args = parseArgs();
const SECONDS = parseFloat(args.seconds || '30');
const speed = args.speed || '1';
const extra = typeof args.query === 'string' ? `&${args.query}` : '';

const server = await ensureServer();
const { chromium } = await loadPlaywright();
const browser = await launchChromium(chromium, {
  headless: !args.headed,
  args: args.novsync ? ['--disable-gpu-vsync', '--disable-frame-rate-limit'] : [],
});
try {
  const { page, errors } = await openGame(browser, `mock=1&seed=11&speed=${speed}${extra}`);
  await page.evaluate(() => {
    performance.clearMeasures('frame');
    window.__perfStart = performance.now();
    window.__game.perf.frames.length = 0;
    window.__game.perf.work.length = 0;
  });
  await page.waitForTimeout(SECONDS * 1000);
  const r = await page.evaluate(() => {
    const p = window.__game.perf;
    const measures = performance.getEntriesByName('frame').map((m) => m.duration);
    return { frames: p.frames.slice(), work: p.work.slice(), measures, state: window.__game.state() };
  });
  const dts = [];
  for (let i = 1; i < r.frames.length; i++) dts.push(r.frames[i] - r.frames[i - 1]);
  const sorted = [...dts].sort((a, b) => b - a);
  const worst = sorted.slice(0, Math.max(1, Math.floor(sorted.length / 100)));
  const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
  const main = r.measures.length ? r.measures : r.work;
  const out = {
    seconds: SECONDS,
    frames: r.frames.length,
    avgFps: +(1000 / mean(dts)).toFixed(1),
    low1Fps: +(1000 / mean(worst)).toFixed(1),
    p95FrameMs: +percentile(dts, 95).toFixed(2),
    mainThreadMs: { avg: +mean(main).toFixed(2), p95: +percentile(main, 95).toFixed(2), max: +Math.max(...main).toFixed(2) },
    vsync: !args.novsync,
    headless: !args.headed,
    consoleErrors: errors.length,
    simAt: { attempt: r.state.attempt, phase: r.state.phase, worldT: r.state.world.t },
  };
  console.log(JSON.stringify(out, null, 2));
} finally {
  await browser.close();
  await server.stop();
}

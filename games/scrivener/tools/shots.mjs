#!/usr/bin/env node
// Stills and frame strips of the show, taken from a recorded feed replayed in the harness.
//   node tools/shots.mjs --at phase:tape+6000 --out shots/tape.png [--feed latest] [--size 1280x720] [--wait 1500]
//   node tools/shots.mjs --at phase:fight+30000 --strip 8 --every 1000 --out shots/fight_strip.png
//   node tools/shots.mjs --set phases --outdir shots/r1          one still of each phase
//   node tools/shots.mjs --live --wait 20000 --out shots/live.png  the live fake runner instead of a replay
// A strip is one image: frames left to right, top to bottom, each stamped with nothing (the
// critic sees what a viewer sees). Starts the harness server itself if port 5200 is free.

import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { ROOT, parseArgs, loadPlaywright, launchChromium } from './_lib.mjs';

const args = parseArgs();
const PORT = parseInt(process.env.PORT || '5200', 10);
const BASE = `http://127.0.0.1:${PORT}`;

async function up() {
  try { const r = await fetch(`${BASE}/feeds`, { signal: AbortSignal.timeout(800) }); return r.ok; } catch { return false; }
}
async function ensureDev() {
  if (await up()) return async () => {};
  const child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', path.join(ROOT, 'harness', 'vite.config.mjs')], { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'], env: { ...process.env, PORT: String(PORT) } });
  for (let i = 0; i < 80; i++) { await new Promise((r) => setTimeout(r, 150)); if (await up()) break; }
  if (!(await up())) { child.kill(); throw new Error('harness did not start'); }
  return async () => { child.kill('SIGTERM'); await new Promise((r) => setTimeout(r, 150)); };
}

const SETS = {
  phases: [
    { name: 'call', at: 'phase:call+6500' },
    { name: 'choosing_temper', at: 'phase:choosing+3500' },
    { name: 'choosing_offer', at: 'event:offer:2+2600' },
    { name: 'choosing_pick', at: 'event:pick:5+1200' },
    { name: 'tape_open', at: 'phase:tape+9000' },
    { name: 'tape_closed', at: 'phase:tape+33200' },
    { name: 'fight_ready', at: 'event:attempt.ready:0+5000' },
    { name: 'fight_menu', at: 'event:decide.open:1+1500' },
    { name: 'fight_answer', at: 'event:decide.made:1+500' },
    { name: 'fight_action', at: 'event:decide.made:2+2600' },
    { name: 'fight_end', at: 'event:attempt.end:0+2600' },
    { name: 'verdict', at: 'phase:verdict+9000' },
    { name: 'verdict_lines', at: 'phase:verdict+16500' },
  ],
};

const stop = await ensureDev();
const { chromium } = await loadPlaywright();
const browser = await launchChromium(chromium, { args: ['--autoplay-policy=no-user-gesture-required'] });
const out = [];
try {
  // --jobs file.json: [{ name, at, out, strip?, every?, wait?, feed?, size?, pick? }] in one browser session
  const jobs = args.jobs ? JSON.parse(fs.readFileSync(path.resolve(ROOT, args.jobs), 'utf8'))
    : args.set ? SETS[args.set].map((j) => ({ ...j, out: path.join(args.outdir || 'shots', `${j.name}.png`) })) : [{ name: 'shot', at: args.at, out: args.out || 'shots/shot.png' }];
  for (const job of jobs) {
    const [VW, VH] = String(job.size || args.size || '1280x720').split('x').map(Number);
    const strip = job.strip ?? args.strip, everyMs = job.every ?? args.every, waitMs = job.wait ?? args.wait;
    const page = await browser.newPage({ viewport: { width: VW, height: VH }, deviceScaleFactor: 1 });
    const errors = [];
    page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
    page.on('pageerror', (e) => errors.push(String(e)));
    const qs = new URLSearchParams({ bare: '1', mute: '1' });
    if (!args.live) { qs.set('replay', job.feed || args.feed || 'latest'); if (job.at) qs.set('at', job.at); }
    if (job.pick || args.pick) qs.set('pick', job.pick || args.pick);
    if (job.q) for (const [k, v] of Object.entries(job.q)) qs.set(k, v); // extra query values for one job
    await page.goto(`${BASE}/?${qs}`);
    await page.waitForFunction(() => window.__harness && window.__harness.ready, null, { timeout: 30000 });
    await page.waitForTimeout(parseInt(waitMs ?? '1400', 10));
    fs.mkdirSync(path.dirname(path.resolve(ROOT, job.out)), { recursive: true });
    const file = path.resolve(ROOT, job.out);
    if (strip) {
      const n = parseInt(strip, 10), every = parseInt(everyMs || '1000', 10);
      const cols = parseInt(job.cols || args.cols || (n > 4 ? 4 : n), 10), fw = parseInt(job.fw || args.fw || '640', 10), fh = Math.round(fw * 9 / 16);
      await page.evaluate(({ n, cols, fw, fh }) => {
        const c = document.createElement('canvas');
        c.width = cols * fw; c.height = Math.ceil(n / cols) * fh;
        window.__sheet = c;
      }, { n, cols, fw, fh });
      for (let i = 0; i < n; i++) {
        await page.evaluate(({ i, cols, fw, fh }) => {
          const src = window.__stage.canvas;
          window.__sheet.getContext('2d').drawImage(src, (i % cols) * fw, Math.floor(i / cols) * fh, fw, fh);
        }, { i, cols, fw, fh });
        if (i < n - 1) await page.waitForTimeout(every);
      }
      const data = await page.evaluate((jpg) => window.__sheet.toDataURL(jpg ? 'image/jpeg' : 'image/png', 0.86), /\.jpe?g$/.test(file));
      fs.writeFileSync(file, Buffer.from(data.split(',')[1], 'base64'));
    } else {
      await page.screenshot({ path: file });
    }
    const state = await page.evaluate(() => window.__stage.state());
    out.push({ name: job.name, at: job.at, out: job.out, state, errors: errors.slice(0, 5) });
    await page.close();
  }
} finally {
  await browser.close();
  await stop();
}
console.log(JSON.stringify(out, null, 1));

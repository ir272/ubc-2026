#!/usr/bin/env node
// Plays stretches of a recorded match with sound on in a headless browser and reports what the
// audio engine did: how many cues played, how many named a missing file, the music state
// (round 10: how many music streams are decoding, and the fight score's level and act).
//   node tools/sound_check.mjs [--feed <file.jsonl>]   (default: the latest recorded match)
import { spawn } from 'node:child_process';
import path from 'node:path';
import { ROOT, loadPlaywright, launchChromium, parseArgs } from './_lib.mjs';
const feed = parseArgs().feed || 'latest';
const PORT = 5200, BASE = `http://127.0.0.1:${PORT}`;
const up = async () => { try { return (await fetch(`${BASE}/feeds`, { signal: AbortSignal.timeout(800) })).ok; } catch { return false; } };
let child = null;
if (!(await up())) {
  child = spawn(process.execPath, [path.join(ROOT, 'node_modules', 'vite', 'bin', 'vite.js'), '--config', path.join(ROOT, 'harness', 'vite.config.mjs')], { cwd: ROOT, stdio: 'ignore' });
  for (let i = 0; i < 80 && !(await up()); i++) await new Promise((r) => setTimeout(r, 150));
}
const { chromium } = await loadPlaywright();
const browser = await launchChromium(chromium, { args: ['--autoplay-policy=no-user-gesture-required'] });
const out = [];
try {
  for (const at of ['phase:call+0', 'phase:choosing+0', 'phase:tape+0', 'event:attempt.ready:0+9000', 'event:attempt.start:4+15000', 'phase:verdict-3000']) {
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    await page.goto(`${BASE}/?replay=${encodeURIComponent(feed)}&bare=1&at=${encodeURIComponent(at)}`);
    await page.waitForFunction(() => window.__harness && window.__harness.ready);
    await page.mouse.click(400, 300);
    await page.waitForTimeout(11000);
    out.push({ at, ...(await page.evaluate(() => ({ stats: window.__stage.audio.stats, phase: window.__stage.state().phase, k: window.__stage.state().fight.k }))), errors });
    await page.close();
  }
} finally { await browser.close(); if (child) child.kill('SIGTERM'); }
console.log(JSON.stringify(out, null, 1));

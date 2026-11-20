#!/usr/bin/env node
// Deterministic captures of named moments.
//   node tools/capture.mjs --scenario <name> --out <png>            1280x720 still
//   node tools/capture.mjs --scenario <name> --strip --out <png>    8 frames @12fps, 4x2 grid of 320x180 (1280x360)
//   node tools/capture.mjs --all --outdir captures [--strip]         every scenario
//   options: --seed N (unused by scenarios; they are fixed), --hud 0, --offset ms
//            (strip default offset -333ms so the moment lands on frame 5), --list
//            --dpr 2: render on a 2x display and save the native backing store (2560x1440),
//            i.e. what a retina / 1440p player actually sees (stills only)
// Starts server.mjs on :5177 if it is not already running (and stops it after).

import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadPlaywright, launchChromium, ensureServer, openGame } from './_lib.mjs';

const args = parseArgs();
const STRIP = !!args.strip;
const FRAMES = 8, FPS = 12;

async function captureOne(browser, name, out) {
  const hud = args.hud === '0' ? '&hud=0' : '';
  const dpr = args.dpr ? Math.min(2, +args.dpr) : 1;
  const { page, errors } = await openGame(browser, `mock=1&seed=7${hud}`, { dpr });
  const result = await page.evaluate(async ({ name, strip, offset, frames, fps, native }) => {
    const g = window.__game;
    if (!g.scenarios.includes(name)) return { error: `unknown scenario ${name}`, known: g.scenarios };
    const canvas = document.getElementById('game');
    const raf = () => new Promise((r) => requestAnimationFrame(() => r()));
    // A freshly launched headless GPU canvas occasionally reads back blank on the
    // first frames; wait for real frames and verify pixels before trusting it.
    const opaque = (c) => {
      const t = document.createElement('canvas');
      t.width = 8; t.height = 8;
      const tc = t.getContext('2d');
      tc.drawImage(c, 0, 0, 8, 8);
      return tc.getImageData(0, 0, 8, 8).data.some((v, i) => i % 4 === 3 && v > 0);
    };
    let info, retries = 0;
    for (;;) {
      info = g.scenario(name, { offsetMs: offset });
      await raf(); await raf();
      g.render();
      if (opaque(canvas) || retries >= 5) break;
      retries++;
      await new Promise((r) => setTimeout(r, 200));
    }
    info.retries = retries;
    if (!strip) return { info, url: g.snapshot(native) };
    const sheet = document.createElement('canvas');
    sheet.width = 1280; sheet.height = 360;
    const s = sheet.getContext('2d');
    for (let i = 0; i < frames; i++) {
      if (i > 0) g.step(1000 / fps);
      s.drawImage(canvas, 0, 0, canvas.width, canvas.height, (i % 4) * 320, Math.floor(i / 4) * 180, 320, 180);
    }
    if (!opaque(sheet)) return { error: 'blank strip after retries', known: [] };
    return { info, url: sheet.toDataURL('image/png') };
  }, { name, strip: STRIP, offset: args.offset != null ? +args.offset : (STRIP ? -333 : 0), frames: FRAMES, fps: FPS, native: dpr > 1 });
  await page.close();
  if (result.error) throw new Error(`${result.error}\nknown: ${result.known.join(', ')}`);
  fs.mkdirSync(path.dirname(path.resolve(out)), { recursive: true });
  fs.writeFileSync(out, Buffer.from(result.url.split(',')[1], 'base64'));
  if (errors.length) console.error(`[${name}] console errors:\n  ${errors.join('\n  ')}`);
  return { name, out, momentMs: result.info.momentMs, errors: errors.length, retries: result.info.retries };
}

const server = await ensureServer();
const { chromium } = await loadPlaywright();
const browser = await launchChromium(chromium);
try {
  if (args.list) {
    const { page } = await openGame(browser, 'mock=1');
    console.log((await page.evaluate(() => window.__game.scenarios)).join('\n'));
  } else if (args.all) {
    const { page } = await openGame(browser, 'mock=1');
    const names = await page.evaluate(() => window.__game.scenarios);
    await page.close();
    const dir = args.outdir || 'captures';
    const results = [];
    for (const n of names) results.push(await captureOne(browser, n, path.join(dir, `${n}${STRIP ? '_strip' : ''}.png`)));
    console.log(JSON.stringify(results, null, 2));
  } else {
    if (!args.scenario || !args.out) {
      console.error('usage: node tools/capture.mjs --scenario <name> [--strip] --out <png>   (--list, --all --outdir dir)');
      process.exitCode = 2;
    } else {
      console.log(JSON.stringify(await captureOne(browser, args.scenario, args.out)));
    }
  }
} finally {
  await browser.close();
  await server.stop();
}

#!/usr/bin/env node
// Regression test for the audio unlock race: the first click lands before manifest.json has loaded.
// Delays manifest.json (default 1.5 s) with route(), clicks as soon as the game is ready, lets a
// fast mock match run, and asserts that sound effects actually play (and the music bed starts).
// Before the fix, every warmed cue cached a null buffer: played 0, missing ~89, for the whole session.
//   node tools/audio_race.mjs [--delay 1500] [--seconds 8] [--speed 8]

import { parseArgs, loadPlaywright, launchChromium, ensureServer, openGame } from './_lib.mjs';

const args = parseArgs();
const delayMs = parseInt(args.delay || '1500', 10);
const seconds = parseFloat(args.seconds || '8');
const speed = args.speed || '8';

const server = await ensureServer();
const { chromium } = await loadPlaywright();
const browser = await launchChromium(chromium, { args: ['--autoplay-policy=no-user-gesture-required'] });
let code = 1;
try {
  // openGame() creates its own page; patch newPage so the route is in place before navigation
  const newPage = browser.newPage.bind(browser);
  browser.newPage = async (opts) => {
    const p = await newPage(opts);
    await p.route('**/assets/audio/manifest.json', async (route) => {
      await new Promise((r) => setTimeout(r, delayMs));
      await route.continue();
    });
    return p;
  };
  const { page, errors } = await openGame(browser, `mock=1&seed=3&speed=${speed}`);
  const before = await page.evaluate(() => ({ hasManifest: window.__game.audio.hasManifest, ...window.__game.audio.stats }));
  await page.mouse.click(640, 360); // unlock while the manifest is still in flight
  await page.waitForTimeout(seconds * 1000);
  const after = await page.evaluate(() => ({ hasManifest: window.__game.audio.hasManifest, ...window.__game.audio.stats }));
  const raced = before.hasManifest === false;
  const ok = raced && after.hasManifest && after.played > 0 && after.missing === 0 && after.music && errors.length === 0;
  console.log(JSON.stringify({ ok, raced, delayMs, before, after, consoleErrors: errors }, null, 2));
  code = ok ? 0 : 1;
} finally {
  await browser.close();
  await server.stop();
}
process.exit(code);

#!/usr/bin/env node
// End-to-end smoke test in a real browser: loads the game with mock brains,
// fast-forwards with ?speed=, and waits until both challengers have died at
// least once AND the boss has been killed. Fails on any console error.
//   node tools/smoke.mjs [--speed 40] [--timeout 240] [--seed 3]

import { parseArgs, loadPlaywright, launchChromium, ensureServer, openGame } from './_lib.mjs';

const args = parseArgs();
const speed = args.speed || '40';
const timeoutS = parseFloat(args.timeout || '240');
const seed = args.seed || '3';

const server = await ensureServer();
const { chromium } = await loadPlaywright();
const browser = await launchChromium(chromium);
let code = 1;
try {
  const { page, errors } = await openGame(browser, `mock=1&seed=${seed}&speed=${speed}`);
  const t0 = Date.now();
  let s, sawVictory = false, sawReset = false, sawFreeze = false, sawDeathScreen = false;
  const done = (L) => L.some((x) => x.agent === 'claude' && x.result === 'death')
    && L.some((x) => x.agent === 'gpt' && x.result === 'death') && L.some((x) => x.result === 'kill');
  for (;;) {
    await page.waitForTimeout(250);
    s = await page.evaluate(() => window.__game.state());
    if (s.world.thinking) sawFreeze = true;
    if (s.phase === 'victory') sawVictory = true;
    if (s.phase === 'death') sawDeathScreen = true;
    if (s.matchNo > 1) sawReset = true;
    if ((done(s.lifetime) && sawReset) || Date.now() - t0 > timeoutS * 1000) break;
  }
  const ok = done(s.lifetime) && sawReset && errors.length === 0;
  console.log(JSON.stringify({
    ok, wallSeconds: Math.round((Date.now() - t0) / 1000), speed: +speed,
    matchNo: s.matchNo, attempt: s.attempt, phase: s.phase, matchesWon: s.matchesWon,
    sawFreeze, sawDeathScreen, sawVictory, sawReset, brains: s.brains, consoleErrors: errors,
    lifetime: s.lifetime,
  }, null, 2));
  code = ok ? 0 : 1;
} finally {
  await browser.close();
  await server.stop();
}
process.exit(code);

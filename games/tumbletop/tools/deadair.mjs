#!/usr/bin/env node
// Dead air: plays a whole show on the virtual clock at the real window lengths and finds, per
// phase, the longest stretch in which nothing moves on the stage. "Moving" = the lens moved or
// turned, or any Gumble moved, or the words on screen changed (digits ignored, so a ticking clock
// alone does not count). Sound is not measured here: the music box plays in every phase.
//   node tools/deadair.mjs [--seed 21] [--step 0.1]
// Bar: no stretch longer than 2.5 s.
import { parseArgs, resolveServer, launchBrowser, openStage } from './lib/browser.mjs';

const a = parseArgs(process.argv.slice(2));
const step = Number(a.step ?? 0.1);
const server = await resolveServer({ port: Number(a.port ?? 5201) });
let browser = null, worst = 0;
try {
  const b = await launchBrowser({ width: 640, height: 360 });
  browser = b.browser;
  await openStage(b.page, server.url, { capture: 1, seed: Number(a.seed ?? 21), bets: 0, idle: 6 });
  const rows = await b.page.evaluate(async (stepMs) => {
    const out = [];
    let prev = null, still = 0, shows = 0, lastNo = window.__tt.state().showNo;
    const longest = {};
    for (let i = 0; i < 6000; i++) {
      await window.__tt.advance(stepMs, { render: false });
      const s = window.__tt.state();
      if (s.showNo !== lastNo) { lastNo = s.showNo; shows++; }
      if (shows >= 2 && s.phase === 'lineup') break; // one whole show and the call of the next
      const cam = s.cam || [];
      let moved = !prev;
      if (prev) {
        let d = 0;
        for (let k = 0; k < cam.length; k++) d = Math.max(d, Math.abs(cam[k] - prev.cam[k]));
        moved = d > 0.004 || Math.abs(s.motion - prev.motion) > 0.02 || s.text !== prev.text || s.phase !== prev.phase;
      }
      still = moved ? 0 : still + stepMs / 1000;
      const key = `${s.phase}${s.phase === 'idle' || s.phase === 'call' || s.phase === 'result' ? '' : ' r' + (s.round + 1)}`;
      if (!longest[key] || still > longest[key]) longest[key] = still;
      prev = { cam, motion: s.motion, text: s.text, phase: s.phase };
      if (i % 50 === 0) out.push(null);
    }
    return longest;
  }, step * 1000);
  console.log('longest stretch with nothing moving, per phase (s):');
  for (const [k, v] of Object.entries(rows)) { console.log(`  ${k.padEnd(12)} ${v.toFixed(1)}`); worst = Math.max(worst, v); }
  console.log(`worst ${worst.toFixed(1)} s  (bar 2.5 s)  ${worst <= 2.5 ? 'PASS' : 'FAIL'}`);
} finally {
  await browser?.close();
  await server.close?.();
}
process.exit(worst <= 2.5 ? 0 : 1);

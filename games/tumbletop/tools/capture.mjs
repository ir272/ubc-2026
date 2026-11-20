#!/usr/bin/env node
// Deterministic screenshots of the Tumbletop stage, driven by the dev page's fake show on a virtual
// clock (exactly the feed the platform sends).
//
//   node tools/capture.mjs --seed 7 --at 60 --frames 10 --every 3 --cam Director --pick juniper --out captures/x
//   node tools/capture.mjs --seed 7 --at 40 --rejoin --bets 6 --frames 4 --every 2 --out captures/rejoin
//
// Flags: --seed N (fixes the show), --at S (show second of the first frame), --frames N, --every S
//        (show seconds between frames), --cam Director|Leader|"Cut line"|"My pick"|Overview,
//        --pick <roster id>, --bets S (seconds each betting window stays open; default 12),
//        --size 1280x720 (or 960x540), --rejoin (remount from a snapshot before the first frame,
//        as a viewer joining mid-show), --port 5201, --out DIR, --headed, --no-sheet (frames only,
//        for clips: see tools/clip.mjs).
// Uses the dev server on --port (5201) if it is serving Tumbletop; otherwise starts one for the run
// and stops it afterwards. One browser, always closed.
// Output: DIR/frame-NN.png, DIR/contact.png (grid of the frames, downscaled), DIR/manifest.json.
import { mkdirSync, writeFileSync, readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { ROOT, parseArgs, resolveServer, launchBrowser, openStage } from './lib/browser.mjs';

const args = parseArgs(process.argv.slice(2));
const seed = Number(args.seed ?? 7);
const at = Number(args.at ?? 0);
const frames = Math.max(1, Number(args.frames ?? 10));
const every = Number(args.every ?? 3);
const cam = args.cam ? String(args.cam) : 'Director';
const pick = args.pick ? String(args.pick) : null;
const bets = args.bets != null ? Number(args.bets) : null;
const [width, height] = String(args.size ?? '1280x720').split('x').map(Number);
const rejoin = !!args.rejoin;
const port = Number(args.port ?? 5201);
const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
const outDir = resolve(ROOT, args.out ?? join('captures', `s${seed}-at${at}-${stamp}`));
mkdirSync(outDir, { recursive: true });

const server = await resolveServer({ port });
let browser = null, pageLogs = [];
const manifest = { args: { seed, at, frames, every, cam, pick, bets, size: `${width}x${height}`, rejoin, url: server.url }, frames: [] };
try {
  const b = await launchBrowser({ headless: !args.headed, width, height });
  browser = b.browser;
  const { page, logs } = b;
  pageLogs = logs;
  const gl = await openStage(page, server.url, { capture: 1, seed, bets, pick, cam, at, idle: args.idle != null ? Number(args.idle) : null, finalside: args.finalside != null ? String(args.finalside) : null });
  manifest.glRenderer = gl;
  // --round R [--into S] [--pickplace K]: run the show forward to S seconds into round R's race,
  // and (optionally) make the Gumble then in place K the viewer's pick. Used by the comprehension test.
  if (args.round != null) {
    const R = Number(args.round), into = Number(args.into ?? 1);
    for (let i = 0; i < 1600; i++) {
      const st = await page.evaluate(() => { const s = window.__tt.state(); return { round: s.round, phase: s.phase, sim: s.simPhase, tick: s.tick }; });
      if (st.round === R && st.phase === 'race' && st.sim === 'race' && st.tick >= (3 + into) * 60) break;
      await page.evaluate(() => window.__tt.advance(250, { render: false }));
    }
    if (args.pickplace != null) {
      const id = await page.evaluate((k) => { const s = window.__tt.state(); const id = s.places[Math.min(s.places.length - 1, k - 1)]; window.__tt.highlight(id); return id; }, Number(args.pickplace));
      manifest.args.pick = id;
    }
    await page.evaluate(() => window.__tt.advance(50));
  }
  if (rejoin) {
    await page.evaluate(() => { window.__tt.rejoin(); window.__tt.handle().debug.frame(0, true); });
  }
  for (let i = 0; i < frames; i++) {
    if (i > 0) await page.evaluate((ms) => window.__tt.advance(ms), every * 1000);
    const s = await page.evaluate(() => {
      const st = window.__tt.state();
      return { showTime: st.showTime, showNo: st.showNo, phase: st.phase, mode: st.mode, round: st.round, tick: st.tick, simPhase: st.simPhase,
        shot: st.shot, camera: st.camera, pick: st.pick, pickSlot: st.pickSlot, field: st.field.length, spotlight: st.spotlight, places: st.places, through: st.through, qualify: st.qualify };
    });
    const file = `frame-${String(i).padStart(frames > 100 ? 4 : 2, '0')}.png`;
    await page.screenshot({ path: join(outDir, file) });
    manifest.frames.push({ file, ...s, showTime: Math.round(s.showTime * 100) / 100 });
    console.log(`${file}  t ${s.showTime.toFixed(1).padStart(6)} s  ${s.phase.padEnd(7)} round ${s.round ?? '-'}  tick ${s.tick}  ${s.simPhase}  shot ${s.shot}`);
  }
  manifest.errors = logs.filter((l) => /error/i.test(l));
  if (manifest.errors.length) console.log(`console errors:\n  ${manifest.errors.join('\n  ')}`);

  if (!args['no-sheet']) {
  // contact sheet: the frames downscaled into a grid, drawn by the same browser
  const cols = frames <= 4 ? frames : frames <= 9 ? 3 : frames <= 16 ? 4 : 6;
  const tw = 320, th = Math.round((tw * height) / width);
  const cells = manifest.frames.map((f) => {
    const src = `data:image/png;base64,${readFileSync(join(outDir, f.file)).toString('base64')}`;
    return `<figure><img src="${src}"><figcaption>${f.file.slice(6, 8)} &middot; ${f.showTime.toFixed(0)} s &middot; ${f.phase}${f.round != null ? ' r' + f.round : ''}</figcaption></figure>`;
  }).join('');
  const rows = Math.ceil(frames / cols);
  const sheetW = cols * (tw + 6) + 6, sheetH = rows * (th + 24) + 6;
  await page.setViewportSize({ width: sheetW, height: sheetH });
  await page.setContent(`<html><body style="margin:0;background:#111;color:#ddd;font:12px system-ui">
    <div style="display:grid;grid-template-columns:repeat(${cols},${tw}px);gap:6px;padding:6px">${cells}</div>
    <style>figure{margin:0}img{width:${tw}px;height:${th}px;display:block}figcaption{height:18px;line-height:18px}</style></body></html>`);
  await page.waitForFunction(() => [...document.images].every((i) => i.complete));
  await page.screenshot({ path: join(outDir, 'contact.png'), fullPage: true });
  }
} catch (e) {
  if (pageLogs.length) console.log(`page console:\n  ${pageLogs.slice(-20).join('\n  ')}`);
  throw e;
} finally {
  writeFileSync(join(outDir, 'manifest.json'), JSON.stringify(manifest, null, 2));
  if (browser) await browser.close();
  await server.close();
}
console.log(`wrote ${manifest.frames.length} frames + contact.png + manifest.json to ${outDir}`);

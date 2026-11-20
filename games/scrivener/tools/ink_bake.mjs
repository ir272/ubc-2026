// Offline ink-painting bake for the Scrivener cut-out puppet. Owner: art.
//   node tools/ink_bake.mjs [--only name,name] [--scale 3] [--sheet out.jpg]
// Opens src/render/art/paint/bake.html in headless Chromium, where the brush model
// (paint/brush.js) paints every body part (paint/parts.js) at --scale px per art unit,
// and writes assets/sprites/scrivener/<part>.png plus parts.json (box + pivot per part).
// --sheet also writes a contact sheet of the parts on paper (JPEG, for review).
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { ROOT, BASE, parseArgs, loadPlaywright, launchChromium, ensureServer } from './_lib.mjs';

const args = parseArgs();
const S = parseFloat(args.scale || '3');
const only = args.only ? String(args.only).split(',') : null;
const OUT = path.join(ROOT, 'assets', 'sprites', 'scrivener');

const srv = await ensureServer();
const { chromium } = await loadPlaywright();
const browser = await launchChromium(chromium);
try {
  const page = await browser.newPage({ viewport: { width: 400, height: 300 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/src/render/art/paint/bake.html`);
  await page.waitForFunction(() => window.bakeReady, null, { timeout: 20000 });
  const parts = await page.evaluate(([names, s]) => window.bake(names, s), [only, S]);
  if (errors.length) { console.error(errors.join('\n')); process.exitCode = 1; }
  fs.mkdirSync(OUT, { recursive: true });
  const manPath = path.join(OUT, 'parts.json');
  const man = fs.existsSync(manPath) ? JSON.parse(fs.readFileSync(manPath, 'utf8')) : { scale: S, parts: {} };
  man.scale = S;
  for (const p of parts) {
    const buf = Buffer.from(p.png.split(',')[1], 'base64');
    fs.writeFileSync(path.join(OUT, `${p.name}.png`), buf);
    man.parts[p.name] = { box: p.box, w: p.w, h: p.h };
  }
  fs.writeFileSync(manPath, JSON.stringify(man, null, 1));
  let total = 0;
  for (const f of fs.readdirSync(OUT)) total += fs.statSync(path.join(OUT, f)).size;
  console.log(JSON.stringify({ baked: parts.map((p) => p.name), totalKB: Math.round(total / 1024) }));
  if (args.sheet) {
    const png = await page.evaluate(([names, s]) => window.bakeSheet(names, s), [only, S]);
    const tmp = String(args.sheet).replace(/\.jpe?g$/i, '') + '.tmp.png';
    fs.writeFileSync(tmp, Buffer.from(png.split(',')[1], 'base64'));
    execFileSync('magick', [tmp, '-quality', '82', String(args.sheet)]);
    fs.rmSync(tmp);
  }
} finally {
  await browser.close();
  await srv.stop?.();
}

#!/usr/bin/env node
// Capture a sheet of the figures lab at 1280x720. Owner: art.
//   PORT=5201 node tools/figures.mjs --sheet classes|portraits|weapons|icons|fight [--pose p]
//        [--query 'cls=warden&state=guard'] --out shots/art/x.png
import fs from 'node:fs';
import path from 'node:path';
import { parseArgs, loadPlaywright, launchChromium, ensureServer, BASE, ROOT } from './_lib.mjs';

const args = parseArgs();
const sheet = args.sheet || 'classes';
const out = path.resolve(ROOT, args.out || `shots/art/${sheet}.png`);
const qs = new URLSearchParams({ sheet });
if (args.pose) qs.set('pose', args.pose);
if (args.query) for (const [k, v] of new URLSearchParams(args.query)) qs.set(k, v);

const server = await ensureServer();
const { chromium } = await loadPlaywright();
const browser = await launchChromium(chromium);
let code = 0;
try {
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 });
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(`${BASE}/lab/figures.html?${qs}`);
  await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 }).catch(() => errors.push('timeout waiting for __ready'));
  const perf = await page.evaluate(() => window.__perf || null);
  if (perf) console.log('ms per drawAgent:', JSON.stringify(perf));
  fs.mkdirSync(path.dirname(out), { recursive: true });
  await page.locator('canvas').screenshot({ path: out });
  // a capture taken while a module was being rewritten can come back blank: retry once
  for (let k = 0; k < 2 && fs.statSync(out).size < 10000; k++) {
    await page.reload();
    await page.waitForFunction(() => window.__ready === true, null, { timeout: 15000 }).catch(() => {});
    await page.locator('canvas').screenshot({ path: out });
  }
  if (errors.length) { console.error(errors.join('\n')); code = 1; }
  console.log(out);
} finally {
  await browser.close();
  await server.stop();
}
process.exit(code);

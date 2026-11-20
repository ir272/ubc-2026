#!/usr/bin/env node
// Screenshot a lab page to a named PNG, one browser at a time (uses the capture lock).
//   node tools/castshot.mjs <page under lab/, with query> <out.png> [WxH]
//   node tools/castshot.mjs "cast.html?group=heavy&mode=line" captures/lead/cast/heavy-line.png 1920x1380
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { session, GAME_DIR } from './lib/browser.mjs';

const [page, out, size = '1920x1380'] = process.argv.slice(2);
if (!page || !out) { console.error('usage: castshot.mjs <page?query> <out.png> [WxH]'); process.exit(2); }
const [file, query = ''] = page.split('?');
const url = pathToFileURL(path.resolve(GAME_DIR, 'lab', file)).toString() + (query ? '?' + query : '');
const [w, h] = size.split('x').map(Number);
const dest = path.resolve(GAME_DIR, out);
fs.mkdirSync(path.dirname(dest), { recursive: true });
await session({ width: w, height: h, needServer: false }, async ({ b }) => {
  const errs = [];
  b.page.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  b.page.on('pageerror', (e) => errs.push(String(e)));
  await b.setSize(w, h);
  await b.page.goto(url, { waitUntil: 'load', timeout: 60000 });
  await b.page.waitForTimeout(300);
  await b.page.screenshot({ path: dest, fullPage: true });
  for (const e of errs) if (!/ERR_FILE_NOT_FOUND|Failed to load resource/.test(e)) console.error('page error: ' + e);
});
console.log(path.relative(process.cwd(), dest));

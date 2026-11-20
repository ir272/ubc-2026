#!/usr/bin/env node
// Blind A/B pair for critics: no filenames, no metadata, only big neutral "A" / "B".
//   node tools/blind.mjs --ours <png> --ref <png> --ours-side A|B --out <png>
// Stills  -> 2560x800, side by side (each image fit into 1280x720 under an 80px label band).
// Strips  -> stacked (auto when either input is wider than 2.5:1): 1280x860, a 70px label band above each strip.
// Uses ImageMagick (`magick`). Output is stripped of all metadata.

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { parseArgs } from './_lib.mjs';

const args = parseArgs();
const side = String(args['ours-side'] || '').toUpperCase();
if (!args.ours || !args.ref || !args.out || !['A', 'B'].includes(side)) {
  console.error('usage: node tools/blind.mjs --ours <png> --ref <png> --ours-side A|B --out <png>');
  process.exit(2);
}
for (const f of [args.ours, args.ref]) if (!fs.existsSync(f)) { console.error(`missing ${f}`); process.exit(2); }

const A = side === 'A' ? args.ours : args.ref;
const B = side === 'A' ? args.ref : args.ours;
const BG = '#808080';
const run = (a) => execFileSync('magick', a, { stdio: ['ignore', 'pipe', 'pipe'] }).toString().trim();
const dims = (f) => run([f, '-format', '%w %h', 'info:']).split(' ').map(Number);
const isStrip = [A, B].some((f) => { const [w, h] = dims(f); return w / h > 2.5; });

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'blind-'));
const fit = (src, w, h, dst) => run([src, '-strip', '-resize', `${w}x${h}`, '-background', BG, '-gravity', 'center', '-extent', `${w}x${h}`, dst]);
// Letters drawn as vector rectangles-free text via the default font; if no font is available fall back to block letters.
function label(letter, w, h, dst) {
  try {
    run(['-size', `${w}x${h}`, `xc:${BG}`, '-fill', 'white', '-gravity', 'center', '-pointsize', String(Math.round(Math.min(h * 0.75, w * 0.9))), '-annotate', '+0+0', letter, dst]);
  } catch {
    // no usable font: draw the letter with primitives
    const cx = w / 2, s = h * 0.32, cy = h / 2;
    const draw = letter === 'A'
      ? `stroke white stroke-width ${Math.max(4, s * 0.25)} fill none polyline ${cx - s},${cy + s} ${cx},${cy - s} ${cx + s},${cy + s} line ${cx - s / 2},${cy + s * 0.2} ${cx + s / 2},${cy + s * 0.2}`
      : `stroke white stroke-width ${Math.max(4, s * 0.25)} fill none path 'M ${cx - s * 0.6},${cy - s} L ${cx + s * 0.2},${cy - s} Q ${cx + s * 0.8},${cy - s} ${cx + s * 0.8},${cy - s / 2} Q ${cx + s * 0.8},${cy} ${cx},${cy} L ${cx - s * 0.6},${cy} M ${cx},${cy} Q ${cx + s},${cy} ${cx + s},${cy + s / 2} Q ${cx + s},${cy + s} ${cx + s * 0.2},${cy + s} L ${cx - s * 0.6},${cy + s} L ${cx - s * 0.6},${cy - s}'`;
    run(['-size', `${w}x${h}`, `xc:${BG}`, '-draw', draw, dst]);
  }
}

try {
  const fa = path.join(tmp, 'a.png'), fb = path.join(tmp, 'b.png'), la = path.join(tmp, 'la.png'), lb = path.join(tmp, 'lb.png');
  if (!isStrip) {
    fit(A, 1280, 720, fa); fit(B, 1280, 720, fb);
    label('A', 1280, 80, la); label('B', 1280, 80, lb);
    run([
      '-size', '2560x800', `xc:${BG}`,
      la, '-geometry', '+0+0', '-composite', lb, '-geometry', '+1280+0', '-composite',
      fa, '-geometry', '+0+80', '-composite', fb, '-geometry', '+1280+80', '-composite',
      '-fill', 'black', '-draw', 'rectangle 1278,0 1281,800',
      '-strip', `PNG24:${args.out}`,
    ]);
  } else {
    fit(A, 1280, 360, fa); fit(B, 1280, 360, fb);
    label('A', 1280, 70, la); label('B', 1280, 70, lb);
    run([
      '-size', '1280x860', `xc:${BG}`,
      la, '-geometry', '+0+0', '-composite', fa, '-geometry', '+0+70', '-composite',
      lb, '-geometry', '+0+430', '-composite', fb, '-geometry', '+0+500', '-composite',
      '-fill', 'black', '-draw', 'rectangle 0,428 1280,431',
      '-strip', `PNG24:${args.out}`,
    ]);
  }
  console.log(JSON.stringify({ out: args.out, layout: isStrip ? 'stacked' : 'side-by-side', size: dims(args.out).join('x') }));
} finally {
  fs.rmSync(tmp, { recursive: true, force: true });
}

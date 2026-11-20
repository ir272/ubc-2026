#!/usr/bin/env node
// Contact sheets and blind pairs. No browser needed.
//
//   node tools/sheet.mjs <dir or files...> [--cols 6] [--width 1920] [--out sheet.png] [--labels [names]]
//   node tools/sheet.mjs --pair <oursDirOrFile> <refDirOrFile> [--out pair.png] [--shuffle] [--seed 7]
//                         [--width 2000] [--cols C]
//
// A sheet: cells scaled so the sheet is at most --width wide (default 2000); --labels draws
// the frame number in each cell's corner, --labels names draws the file name.
// A pair: the two sides side by side, labelled only "A" and "B". With --shuffle the order
// comes from --seed (random if omitted). pair.json next to the png says which side is ours;
// give the critic only the png. A directory becomes a sheet of its frames (f-0001.png ...).
import fs from 'node:fs';
import path from 'node:path';
import { contactSheet, writePng, canvas, blit, fit, loadImage, scaleCanvas,
  framesInDir, textSize, drawText, SHEET_BG } from './lib/img.mjs';

function parse(argv) {
  const o = { inputs: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--pair') { o.pair = [argv[++i], argv[++i]]; continue; }
    if (a === '--shuffle') { o.shuffle = true; continue; }
    if (a === '--labels') {
      o.labels = (argv[i + 1] === 'names') ? (i++, 'names') : 'index';
      continue;
    }
    if (a.startsWith('--')) { o[a.slice(2)] = argv[++i]; continue; }
    o.inputs.push(a);
  }
  return o;
}

function expand(inputs) {
  const files = [];
  for (const p of inputs) {
    if (!fs.existsSync(p)) throw new Error(`not found: ${p}`);
    if (fs.statSync(p).isDirectory()) files.push(...framesInDir(p));
    else files.push(p);
  }
  if (!files.length) throw new Error(`no images in ${inputs.join(', ')}`);
  return files;
}

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One side of a pair: an image (file) or a sheet (dir) as a canvas. */
function side(p, cols, cellW) {
  if (fs.statSync(p).isDirectory()) {
    const files = framesInDir(p);
    if (!files.length) throw new Error(`no frames in ${p}`);
    return { canvas: contactSheet(files.map((f, i) => ({ file: f, label: String(i + 1) })), { cols, cellW, maxWidth: 100000 }), count: files.length };
  }
  return { canvas: loadImage(p), count: 1 };
}

function makePair(o) {
  const [ours, ref] = o.pair;
  for (const p of [ours, ref]) if (!p || !fs.existsSync(p)) throw new Error(`--pair needs two existing paths, got: ${ours} ${ref}`);
  const width = Number(o.width || 2000);
  const gap = 16;
  const boxW = Math.floor((width - gap * 3) / 2);
  // Equal grids for two directories so neither side looks denser.
  const countOf = (p) => (fs.statSync(p).isDirectory() ? framesInDir(p).length : 1);
  const n = Math.max(countOf(ours), countOf(ref));
  const cols = Number(o.cols || (n <= 2 ? n : n <= 4 ? 2 : n <= 9 ? 3 : 4));
  const cellW = Math.max(64, Math.floor((boxW - 6 * (cols + 1)) / cols));
  const sides = [side(ours, cols, cellW), side(ref, cols, cellW)];
  if (sides[0].count !== sides[1].count) process.stderr.write(`warning: ours has ${sides[0].count} frames, the reference ${sides[1].count}\n`);
  const boxH = Math.max(...sides.map((s) => Math.round(boxW * s.canvas.h / s.canvas.w)));
  const seed = o.seed !== undefined ? Number(o.seed) : Math.floor(Math.random() * 1e9);
  const oursFirst = o.shuffle ? mulberry32(seed)() < 0.5 : true;
  const order = oursFirst ? [0, 1] : [1, 0];
  const scale = Math.max(4, Math.round(width / 300));
  const head = textSize('A', scale).h + scale * 6;
  const W = gap * 3 + boxW * 2, H = gap * 2 + head + boxH;
  const out = canvas(W, H, SHEET_BG);
  ['A', 'B'].forEach((letter, k) => {
    const s = sides[order[k]].canvas;
    const x = gap + k * (boxW + gap);
    const f = fit(s.w, s.h, boxW, boxH);
    const img = scaleCanvas(s, f.w, f.h);
    drawText(out, letter, x, gap, scale, [244, 248, 255]);
    blit(out, img, x + ((boxW - img.w) >> 1), gap + head);
  });
  const file = path.resolve(o.out || 'pair.png');
  writePng(out, file);
  const key = {
    A: path.resolve(oursFirst ? ours : ref),
    B: path.resolve(oursFirst ? ref : ours),
    ours: oursFirst ? 'A' : 'B',
    ref: oursFirst ? 'B' : 'A',
    shuffled: !!o.shuffle,
    seed: o.shuffle ? seed : null,
    png: file,
    madeAt: new Date().toISOString(),
  };
  const keyFile = file.replace(/\.png$/i, '') + '.json';
  fs.writeFileSync(keyFile, JSON.stringify(key, null, 2));
  return [file, keyFile];
}

function makeSheet(o) {
  const files = expand(o.inputs);
  const sheet = contactSheet(
    files.map((f, i) => ({ file: f, label: o.labels === 'names' ? path.basename(f).replace(/\.[a-z]+$/i, '') : String(i + 1) })),
    { cols: o.cols ? Number(o.cols) : undefined, maxWidth: Number(o.width || 2000), labels: !!o.labels },
  );
  const file = path.resolve(o.out || 'sheet.png');
  writePng(sheet, file);
  return [file];
}

try {
  const o = parse(process.argv.slice(2));
  if (!o.pair && !o.inputs.length) {
    process.stderr.write('usage: node tools/sheet.mjs <dir or files...> [--cols 6] [--width 1920] [--out sheet.png] [--labels [names]]\n'
      + '       node tools/sheet.mjs --pair <ours> <ref> [--out pair.png] [--shuffle] [--seed 7]\n');
    process.exit(2);
  }
  const files = o.pair ? makePair(o) : makeSheet(o);
  process.stdout.write(files.map((f) => path.relative(process.cwd(), f)).join('\n') + '\n');
} catch (e) {
  process.stderr.write(`sheet failed: ${e.message}\n`);
  process.exit(1);
}

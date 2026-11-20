#!/usr/bin/env node
// Dense frame strips for judging the camera as video: 4 frames a second, so one-second events
// are visible. Captures on the virtual clock and tiles the frames 3 x 3 (each 640 x 360, in order,
// left to right then down) into sheets of 2.25 s each.
//   node tools/strip.mjs --seed 7 --round 1 --into 8 --seconds 27 --pickplace 4 --out captures/strip-r1
//   node tools/strip.mjs --seed 7 --at 60 --seconds 20 --pick boop --out captures/strip-x
// Output: OUT/sheet-NN.png and OUT/manifest.json (per-frame state). Needs ffmpeg.
import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync, readdirSync, renameSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { ROOT, parseArgs } from './lib/browser.mjs';

const a = parseArgs(process.argv.slice(2));
const fps = Number(a.fps ?? 4), seconds = Number(a.seconds ?? 24);
const out = resolve(ROOT, a.out ?? 'captures/strip');
const tmp = join(out, '.frames');
rmSync(out, { recursive: true, force: true });
mkdirSync(tmp, { recursive: true });
const cap = ['tools/capture.mjs', '--seed', String(a.seed ?? 7), '--bets', String(a.bets ?? 3), '--frames', String(Math.round(seconds * fps)),
  '--every', String(1 / fps), '--size', '1280x720', '--out', tmp, '--no-sheet'];
for (const k of ['at', 'round', 'into', 'pickplace', 'pick', 'cam', 'finalside']) if (a[k] != null) cap.push(`--${k}`, String(a[k]));
execFileSync(process.execPath, cap, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
const pat = Math.round(seconds * fps) > 100 ? 'frame-%04d.png' : 'frame-%02d.png';
execFileSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-framerate', '9', '-i', join(tmp, pat),
  '-vf', 'scale=640:360,tile=3x3:padding=4:color=black', join(out, 'sheet-%02d.png')], { stdio: 'inherit' });
renameSync(join(tmp, 'manifest.json'), join(out, 'manifest.json'));
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${readdirSync(out).filter((f) => f.startsWith('sheet')).length} sheets to ${out}`);

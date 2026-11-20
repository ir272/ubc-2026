#!/usr/bin/env node
// A video clip of the show: frames on the virtual clock (so it is exactly what airs), encoded with ffmpeg.
//   node tools/clip.mjs --seed 7 --at 85 --seconds 34 --pick boop --out docs/round-two.mp4
// Flags: --seed, --at (show second to start), --seconds, --fps (default 15), --bets (window seconds,
//        default 14), --pick, --cam, --size (default 960x540). Needs ffmpeg on the PATH (or FFMPEG=...).
import { execFileSync } from 'node:child_process';
import { rmSync, mkdirSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { ROOT, parseArgs } from './lib/browser.mjs';

const a = parseArgs(process.argv.slice(2));
const fps = Number(a.fps ?? 15), seconds = Number(a.seconds ?? 30);
const out = resolve(ROOT, a.out ?? 'docs/clip.mp4');
const tmp = resolve(ROOT, 'captures/.clip');
rmSync(tmp, { recursive: true, force: true });
mkdirSync(dirname(out), { recursive: true });
const cap = ['tools/capture.mjs', '--seed', String(a.seed ?? 7), '--bets', String(a.bets ?? 14), '--at', String(a.at ?? 0),
  '--frames', String(Math.round(seconds * fps)), '--every', String(1 / fps), '--size', String(a.size ?? '960x540'), '--out', tmp, '--no-sheet'];
if (a.pick) cap.push('--pick', String(a.pick));
if (a.cam) cap.push('--cam', String(a.cam));
execFileSync(process.execPath, cap, { cwd: ROOT, stdio: ['ignore', 'ignore', 'inherit'] });
execFileSync(process.env.FFMPEG || 'ffmpeg', ['-y', '-loglevel', 'error', '-framerate', String(fps), '-i', `${tmp}/frame-%04d.png`,
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '20', '-movflags', '+faststart', out], { stdio: 'inherit' });
rmSync(tmp, { recursive: true, force: true });
console.log(`wrote ${out} (${seconds} s at ${fps} fps)`);

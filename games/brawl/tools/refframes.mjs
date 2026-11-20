#!/usr/bin/env node
// Reference frames from local footage (refs/raw/*.mp4). Local only: never commit or publish.
//
//   node tools/refframes.mjs --video <file> --from 83.5 [--frames 12] [--every 2] --out refs/<piece>/<name>
//       stills at exact source frames: frame round(from * fps) and then every --every source
//       frames; writes f-0001.png ..., sheet.png (timestamps in the cells), manifest.json.
//   node tools/refframes.mjs --scan --video <file> [--step 2] [--rows 8] --out refs/scan/<id>
//       overview sheets: one frame every --step seconds, 6 columns, mm:ss in each cell,
//       several sheets when long (scan-01.png ...), manifest.json with each sheet's span.
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { FFMPEG, FFPROBE, contactSheet, writePng, streamFrames } from './lib/img.mjs';

function parse(argv) {
  const o = {};
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--scan') { o.scan = true; continue; }
    if (!a.startsWith('--')) throw new Error(`unexpected argument ${a}`);
    o[a.slice(2)] = argv[++i];
  }
  return o;
}

function probe(file) {
  const r = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries',
    'stream=width,height,r_frame_rate,nb_frames,start_time:format=duration', '-of', 'json', file], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffprobe failed on ${file}: ${r.stderr}`);
  const j = JSON.parse(r.stdout);
  const s = j.streams[0];
  const [num, den] = s.r_frame_rate.split('/').map(Number);
  return { w: s.width, h: s.height, fpsNum: num, fpsDen: den || 1, fps: num / (den || 1),
    duration: Number(j.format.duration), frames: Number(s.nb_frames) || null, start: Number(s.start_time) || 0 };
}

const mmss = (t, decimals = 0) => {
  const m = Math.floor(t / 60);
  const s = t - m * 60;
  const ss = decimals ? s.toFixed(decimals).padStart(3 + decimals, '0') : String(Math.floor(s)).padStart(2, '0');
  return `${m}:${ss}`;
};

function cut(o) {
  const video = o.video;
  const v = probe(video);
  const from = Number(o.from);
  const n = Number(o.frames || 12);
  const every = Number(o.every || 1);
  if (!Number.isFinite(from) || from < 0) throw new Error('--from <seconds> is required');
  if (!o.out) throw new Error('--out refs/<piece>/<name> is required');
  const start = Math.round(from * v.fpsNum / v.fpsDen);
  const last = start + (n - 1) * every;
  if (v.frames && last >= v.frames) throw new Error(`asks for source frame ${last}, the video has ${v.frames}`);
  const out = path.resolve(o.out);
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^f-\d+\.png$/.test(f)) fs.rmSync(path.join(out, f));
  // Seek a quarter frame early so rounding never skips the first wanted frame; then
  // keep every `every`-th decoded frame. Frame k of the source sits at k / fps.
  const seekT = Math.max(0, (start - 0.25) * v.fpsDen / v.fpsNum);
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-ss', seekT.toFixed(6), '-i', video,
    '-vf', `select='not(mod(n\\,${every}))'`, '-fps_mode', 'passthrough', '-frames:v', String(n),
    path.join(out, 'f-%04d.png')], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`ffmpeg failed: ${r.stderr}`);
  const stills = [];
  for (let i = 0; i < n; i++) {
    const frame = start + i * every;
    const time = frame * v.fpsDen / v.fpsNum;
    stills.push({ file: `f-${String(i + 1).padStart(4, '0')}.png`, index: i + 1, frame, time: Number(time.toFixed(4)) });
  }
  const missing = stills.filter((s) => !fs.existsSync(path.join(out, s.file)));
  if (missing.length) throw new Error(`ffmpeg wrote ${n - missing.length} of ${n} frames (past the end?)`);
  const sheet = contactSheet(stills.map((s) => ({ file: path.join(out, s.file), label: `${s.index} ${mmss(s.time, 2)}` })), {});
  writePng(sheet, path.join(out, 'sheet.png'));
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
    source: path.relative(process.cwd(), path.resolve(video)), fps: Number(v.fps.toFixed(4)), from, every, frames: n,
    sourceFrames: [start, last], size: `${v.w}x${v.h}`, local: 'reference footage: local only, never publish', stills,
  }, null, 2));
  return [out + '/', path.join(out, 'sheet.png'), path.join(out, 'manifest.json')];
}

async function scan(o) {
  const video = o.video;
  const v = probe(video);
  const step = Number(o.step || 2);
  const rows = Number(o.rows || 8);
  const cols = 6;
  if (!o.out) throw new Error('--out refs/scan/<id> is required');
  const out = path.resolve(o.out);
  fs.mkdirSync(out, { recursive: true });
  for (const f of fs.readdirSync(out)) if (/^scan-\d+\.png$/.test(f)) fs.rmSync(path.join(out, f));
  const cw = 320, ch = Math.round(cw * v.h / v.w / 2) * 2;
  const perSheet = cols * rows;
  const decimals = step < 1 || !Number.isInteger(step) ? 1 : 0;
  let batch = [];
  const sheets = [];
  const flush = () => {
    if (!batch.length) return;
    const k = sheets.length + 1;
    const file = path.join(out, `scan-${String(k).padStart(2, '0')}.png`);
    writePng(contactSheet(batch, { cols, cellW: cw, maxWidth: 100000, gap: 4 }), file);
    sheets.push({ file: path.basename(file), from: batch[0].t, to: batch.at(-1).t, cells: batch.length });
    process.stderr.write(`  ${path.basename(file)}  ${mmss(batch[0].t)} to ${mmss(batch.at(-1).t)}\n`);
    batch = [];
  };
  const t0 = Date.now();
  await streamFrames(['-v', 'error', '-threads', '4', '-i', video, '-vf', `fps=1/${step}:round=down,scale=${cw}:${ch}:flags=area`,
    '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'], cw, ch, (c, i) => {
    const t = i * step;
    batch.push({ canvas: c, label: mmss(t, decimals), t });
    if (batch.length === perSheet) flush();
  });
  flush();
  fs.writeFileSync(path.join(out, 'manifest.json'), JSON.stringify({
    source: path.relative(process.cwd(), path.resolve(video)), duration: v.duration, step, cols, rows,
    local: 'reference footage: local only, never publish', sheets,
  }, null, 2));
  process.stderr.write(`scanned ${mmss(v.duration)} in ${((Date.now() - t0) / 1000).toFixed(1)} s\n`);
  return [...sheets.map((s) => path.join(out, s.file)), path.join(out, 'manifest.json')];
}

try {
  const o = parse(process.argv.slice(2));
  if (!o.video || !fs.existsSync(o.video)) {
    process.stderr.write('usage: node tools/refframes.mjs --video refs/raw/<id>.mp4 --from <s> [--frames 12] [--every 2] --out refs/<piece>/<name>\n'
      + '       node tools/refframes.mjs --scan --video refs/raw/<id>.mp4 [--step 2] --out refs/scan/<id>\n');
    process.exit(2);
  }
  const files = o.scan ? await scan(o) : cut(o);
  process.stdout.write(files.map((f) => path.relative(process.cwd(), f) + (f.endsWith('/') ? '/' : '')).join('\n') + '\n');
} catch (e) {
  process.stderr.write(`refframes failed: ${e.message}\n`);
  process.exit(1);
}

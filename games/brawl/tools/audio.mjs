#!/usr/bin/env node
// Ringout sound: judge by measurement, since nobody here can listen.
//
//   node tools/audio.mjs render [--round r1] [--only name,name]
//        opens harness/audio.html in the one headless browser (tools/lib/browser.mjs, under its lock),
//        renders every named sound, the 20 s fight timeline (real sim events) and the 10 s
//        knockout-into-break mix through OfflineAudioContext, writes captures/sound/<round>/<name>.wav,
//        then makes a spectrogram png per wav, pairs.png sheets (ours beside the nearest reference cut,
//        same time and frequency scale) and table.md (peak, loudness, duration, attack, centroid).
//   node tools/audio.mjs sheets [--round r1]       redo the pngs and table from the wavs already there
//   node tools/audio.mjs measure <file...>          print the measurements for any audio files
//   node tools/audio.mjs refcut --video refs/raw/X.mp4 --start s --dur d [--event s] --name n
//        cut a reference moment to refs/sound/extra-<n>/<n>.wav + .png + stats.json (local only)
//   node tools/audio.mjs spectro <in> <out.png> [--dur s]
//   node tools/audio.mjs loops [--round r4]
//        the seam of every looping bed (music and crowd): the last and first 50 ms of the loop as
//        the browser plays it (level, spectral centre, the sample step across the join against the
//        median step), written to captures/sound/<round>/loops.md
//
// Measurements (same definitions for ours and theirs, mono mix):
//   peak      sample peak, dBFS
//   lufsI     integrated loudness (ffmpeg ebur128); short sounds read low, so also
//   lufsM     the loudest 400 ms momentary loudness
//   attack    10% -> 90% rise of the 2 ms RMS envelope into the event's peak, ms
//   dur       time from the event onset until the 10 ms RMS falls 40 dB under its max, ms
//   hold6/20  how long the 10 ms RMS stays within 6 / 20 dB of its max, ms
//   centroid  spectral centroid of the 80 ms around the peak, Hz
//   low       share of spectrum magnitude below 150 Hz around the peak
import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { GAME_DIR, session, assertNoErrors, withRetry, ORIGIN } from './lib/browser.mjs';
import { touchLock } from './lib/lock.mjs';
import { FFMPEG } from './lib/img.mjs';

const log = (s) => process.stderr.write(s + '\n');
const SR = 44100;

// ------------------------------------------------------------------------------------------------
// decoding and wav writing
// ------------------------------------------------------------------------------------------------

export function decodeMono(file, { start, dur } = {}) {
  const args = ['-v', 'error'];
  if (start != null) args.push('-ss', String(start));
  args.push('-i', file);
  if (dur != null) args.push('-t', String(dur));
  // a true average of the channels (ffmpeg's default -ac 1 downmix adds +3 dB)
  args.push('-af', 'pan=mono|c0=0.5*c0+0.5*c1', '-ar', String(SR), '-f', 'f32le', '-');
  const r = spawnSync(FFMPEG, args, { maxBuffer: 1 << 30 });
  if (r.status !== 0) throw new Error(`ffmpeg decode failed on ${file}: ${r.stderr}`);
  const b = r.stdout;
  return new Float32Array(b.buffer, b.byteOffset, Math.floor(b.length / 4));
}

/** channels: Float32Array[] (1 or 2), 16-bit PCM wav */
export function writeWav(file, channels, sr = SR) {
  const n = channels[0].length;
  const ch = channels.length;
  const buf = Buffer.alloc(44 + n * ch * 2);
  buf.write('RIFF', 0); buf.writeUInt32LE(36 + n * ch * 2, 4); buf.write('WAVE', 8);
  buf.write('fmt ', 12); buf.writeUInt32LE(16, 16); buf.writeUInt16LE(1, 20); buf.writeUInt16LE(ch, 22);
  buf.writeUInt32LE(sr, 24); buf.writeUInt32LE(sr * ch * 2, 28); buf.writeUInt16LE(ch * 2, 32); buf.writeUInt16LE(16, 34);
  buf.write('data', 36); buf.writeUInt32LE(n * ch * 2, 40);
  let o = 44;
  for (let i = 0; i < n; i++) {
    for (let c = 0; c < ch; c++) {
      let v = channels[c][i];
      v = v > 1 ? 1 : v < -1 ? -1 : v;
      buf.writeInt16LE(Math.round(v * 32767), o);
      o += 2;
    }
  }
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, buf);
}

// ------------------------------------------------------------------------------------------------
// measurement
// ------------------------------------------------------------------------------------------------

const db = (a) => 20 * Math.log10(Math.max(a, 1e-9));

function rmsEnv(x, win) {
  const n = Math.floor(x.length / win);
  const e = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    let s = 0;
    for (let k = 0; k < win; k++) { const v = x[i * win + k]; s += v * v; }
    e[i] = Math.sqrt(s / win);
  }
  return e;
}

/** biggest onset: the 10 ms bin with the largest rise over the median of the 300 ms before it */
function findEvent(x, from = 0, to = x.length) {
  const w = Math.round(0.01 * SR);
  const e = rmsEnv(x, w);
  const d = Array.from(e, db);
  let best = -1, bestScore = -Infinity;
  const i0 = Math.floor(from / w), i1 = Math.min(d.length, Math.floor(to / w));
  for (let i = Math.max(i0, 3); i < i1; i++) {
    const prev = d.slice(Math.max(0, i - 30), Math.max(1, i - 2)).sort((a, b) => a - b);
    const bed = prev.length ? prev[Math.floor(prev.length / 2)] : -90;
    const score = (d[i] - bed) + 0.25 * (d[i] + 60); // a rise, weighted toward loud
    if (score > bestScore) { bestScore = score; best = i; }
  }
  // walk back to where the rise began (within 60 ms)
  let i = best;
  while (i > 0 && best - i < 6 && d[i - 1] < d[i] - 1) i--;
  return i * w;
}

function fftMag(seg) {
  // plain radix-2 FFT on a Hann-windowed, zero-padded copy
  let n = 1;
  while (n < seg.length) n <<= 1;
  const re = new Float64Array(n), im = new Float64Array(n);
  for (let i = 0; i < seg.length; i++) re[i] = seg[i] * (0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (seg.length - 1)));
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const a = (-2 * Math.PI) / len;
    for (let i = 0; i < n; i += len) {
      for (let k = 0; k < len / 2; k++) {
        const c = Math.cos(a * k), s = Math.sin(a * k);
        const xr = re[i + k + len / 2] * c - im[i + k + len / 2] * s;
        const xi = re[i + k + len / 2] * s + im[i + k + len / 2] * c;
        re[i + k + len / 2] = re[i + k] - xr; im[i + k + len / 2] = im[i + k] - xi;
        re[i + k] += xr; im[i + k] += xi;
      }
    }
  }
  const mag = new Float64Array(n / 2);
  for (let i = 0; i < n / 2; i++) mag[i] = Math.hypot(re[i], im[i]);
  return { mag, binHz: SR / n };
}

export function ebur(file) {
  const r = spawnSync(FFMPEG, ['-hide_banner', '-nostats', '-v', 'verbose', '-i', file, '-af', 'ebur128=framelog=verbose', '-f', 'null', '-'], { encoding: 'utf8', maxBuffer: 1 << 28 });
  const t = r.stderr || '';
  const I = /I:\s+(-?[\d.]+|-inf)\s+LUFS/.exec(t.slice(t.lastIndexOf('Summary')));
  let mMax = -Infinity;
  for (const m of t.matchAll(/ M:\s*(-?[\d.]+)/g)) mMax = Math.max(mMax, Number(m[1]));
  return { lufsI: I ? Number(I[1]) : null, lufsM: Number.isFinite(mMax) ? Math.round(mMax * 10) / 10 : null };
}

/**
 * Measure one sound. event (s) is where the sound starts; when not given, the biggest onset in
 * [searchFrom, searchTo] (s) is used. Our own renders start at t = 0 + lead.
 */
export function measure(x, { event, searchFrom = 0, searchTo } = {}) {
  const e = event != null ? Math.round(event * SR) : findEvent(x, Math.round(searchFrom * SR), Math.round((searchTo ?? x.length / SR) * SR));
  const from = Math.max(0, e - Math.round(0.03 * SR));
  const post = x.subarray(from);
  const win = Math.min(post.length, Math.round(0.28 * SR));
  let pk = 0, ipk = 0;
  for (let i = 0; i < win; i++) { const a = Math.abs(post[i]); if (a > pk) { pk = a; ipk = i; } }
  let gpk = 0;
  for (let i = 0; i < x.length; i++) { const a = Math.abs(x[i]); if (a > gpk) gpk = a; }
  const w2 = Math.round(0.002 * SR);
  const env2 = rmsEnv(post, w2).subarray(0, Math.floor(win / w2));
  let m2 = 0, i90 = 0;
  for (let i = 0; i < env2.length; i++) if (env2[i] > m2) m2 = env2[i];
  for (let i = 0; i < env2.length; i++) if (env2[i] >= 0.9 * m2) { i90 = i; break; }
  let i10 = i90;
  while (i10 > 0 && env2[i10 - 1] >= 0.1 * m2) i10--;
  const w10 = Math.round(0.01 * SR);
  const env10 = rmsEnv(post, w10);
  let m10 = 0, im = 0;
  for (let i = 0; i < Math.min(env10.length, Math.floor(win / w10)); i++) if (env10[i] > m10) { m10 = env10[i]; im = i; }
  const hold = (th) => {
    const lim = m10 * Math.pow(10, -th / 20);
    let a = im, b = im;
    while (b + 1 < env10.length && env10[b + 1] >= lim) b++;
    while (a - 1 >= 0 && env10[a - 1] >= lim) a--;
    return (b - a + 1) * 10;
  };
  // duration: onset to the last 10 ms bin within 40 dB of max (gaps allowed)
  const lim40 = m10 * 0.01;
  let last = im;
  for (let i = env10.length - 1; i >= im; i--) if (env10[i] >= lim40) { last = i; break; }
  const segFrom = Math.max(0, Math.round((im * 0.01 - 0.02) * SR));
  const seg = post.subarray(segFrom, Math.min(post.length, segFrom + Math.round(0.08 * SR)));
  let cent = 0, low = 0;
  if (seg.length > 64) {
    const { mag, binHz } = fftMag(seg);
    let s = 0, sf = 0, sl = 0;
    for (let i = 1; i < mag.length; i++) { s += mag[i]; sf += mag[i] * i * binHz; if (i * binHz < 150) sl += mag[i]; }
    cent = s ? sf / s : 0;
    low = s ? sl / s : 0;
  }
  // bed: RMS of the 150 ms before the event
  const pre = x.subarray(Math.max(0, e - Math.round(0.15 * SR)), e);
  let ps = 0;
  for (let i = 0; i < pre.length; i++) ps += pre[i] * pre[i];
  // how fast it falls: first 10 ms bin after the max that is 12 dB under it
  let f12 = im;
  while (f12 < env10.length && env10[f12] >= m10 * Math.pow(10, -12 / 20)) f12++;
  // where the energy is, over everything from the onset on (power shares, whole sound)
  const bands = bandShares(post);
  return {
    hold12_ms: hold(12),
    fall12_ms: (f12 - im) * 10,
    ...bands,
    event_s: Math.round((e / SR) * 1000) / 1000,
    bed_db: pre.length ? Math.round(db(Math.sqrt(ps / pre.length)) * 10) / 10 : null,
    peak_db: Math.round(db(pk) * 10) / 10,
    peak_all_db: Math.round(db(gpk) * 10) / 10,
    attack_ms: (i90 - i10) * 2,
    dur_ms: (last + 1) * 10 - 30,
    hold6_ms: hold(6),
    hold20_ms: hold(20),
    centroid_hz: Math.round(cent),
    low150: Math.round(low * 100) / 100,
    max_rms10_db: Math.round(db(m10) * 10) / 10,
    length_s: Math.round((x.length / SR) * 100) / 100,
  };
}

/**
 * Power share per band over a whole signal (Hann frames of 4096, hop 2048): low < 150 Hz,
 * lowmid 150-500, mid 500-2k, high 2-5k, air > 5k, and the power-weighted centre.
 */
export function bandShares(x) {
  const n = 4096, hop = 2048;
  const edges = [150, 500, 2000, 5000];
  const acc = [0, 0, 0, 0, 0];
  let tot = 0, fsum = 0;
  if (x.length < n) {
    const y = new Float32Array(n);
    y.set(x);
    x = y;
  }
  for (let i = 0; i + n <= x.length; i += hop) {
    const { mag, binHz } = fftMag(x.subarray(i, i + n));
    for (let k = 1; k < mag.length; k++) {
      const p = mag[k] * mag[k];
      const f = k * binHz;
      let b = 0;
      while (b < 4 && f >= edges[b]) b++;
      acc[b] += p;
      tot += p;
      fsum += p * f;
    }
  }
  const r = (v) => (tot ? Math.round((v / tot) * 1000) / 1000 : 0);
  return { low: r(acc[0]), lowmid: r(acc[1]), mid: r(acc[2]), high: r(acc[3]), air: r(acc[4]), centre_hz: tot ? Math.round(fsum / tot) : 0 };
}

/**
 * Which band leads the first `win` s from the onset: power per band in dB (relative to the whole
 * window), the leading band and its margin over the next one.
 */
const LEAD_BANDS = [[0, 150, 'under 150 Hz'], [150, 500, '150 to 500 Hz'], [500, 2000, '0.5 to 2 kHz'], [2000, 6000, '2 to 6 kHz'], [6000, 22050, 'above 6 kHz']];
export function leadBand(x, eventS, win = 0.15) {
  const i0 = Math.max(0, Math.round(eventS * SR));
  const seg = x.subarray(i0, Math.min(x.length, i0 + Math.round(win * SR)));
  const { mag, binHz } = fftMag(seg);
  const acc = LEAD_BANDS.map(() => 0);
  let tot = 0;
  for (let k = 1; k < mag.length; k++) {
    const f = k * binHz, pw = mag[k] * mag[k];
    tot += pw;
    for (let b = 0; b < LEAD_BANDS.length; b++) if (f >= LEAD_BANDS[b][0] && f < LEAD_BANDS[b][1]) acc[b] += pw;
  }
  const dbs = acc.map((v) => Math.round(10 * Math.log10(Math.max(v, 1e-12) / Math.max(tot, 1e-12)) * 10) / 10);
  const order = dbs.map((v, i) => [v, i]).sort((a, b) => b[0] - a[0]);
  return { bands: dbs, lead: LEAD_BANDS[order[0][1]][2], margin: Math.round((order[0][0] - order[1][0]) * 10) / 10 };
}

/** level distribution of a long mix: 100 ms RMS percentiles, and the 500 ms RMS trajectory */
export function mixStats(x) {
  const r100 = Array.from(rmsEnv(x, Math.round(0.1 * SR)), db).sort((a, b) => a - b);
  const pct = (p) => r100[Math.min(r100.length - 1, Math.max(0, Math.round((p / 100) * (r100.length - 1))))];
  const r500 = Array.from(rmsEnv(x, Math.round(0.5 * SR)), (v) => Math.round(db(v) * 10) / 10);
  const round = (v) => Math.round(v * 10) / 10;
  return { p5: round(pct(5)), p50: round(pct(50)), p95: round(pct(95)), range: round(pct(95) - pct(5)), rms500: r500, ...bandShares(x) };
}

export function measureFile(file, opts = {}) {
  const x = decodeMono(file);
  return { ...measure(x, opts), ...ebur(file) };
}

// ------------------------------------------------------------------------------------------------
// spectrograms (same settings as refs/_tools/sound.py so ours and theirs read alike)
// ------------------------------------------------------------------------------------------------

export function spectro(inFile, outPng, { start, dur, size = '1200x400', legend = 1 } = {}) {
  const args = ['-v', 'error', '-y'];
  if (start != null) args.push('-ss', String(Math.max(0, start)));
  args.push('-i', inFile);
  if (dur != null) args.push('-t', String(dur));
  // pad so every picture covers exactly `dur` seconds
  const pad = dur != null ? `apad=whole_dur=${dur},` : '';
  args.push('-lavfi', `${pad}showspectrumpic=s=${size}:mode=combined:scale=log:fscale=log:legend=${legend}:color=intensity`, outPng);
  const r = spawnSync(FFMPEG, args, { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`spectrogram failed for ${inFile}: ${r.stderr}`);
}

// ------------------------------------------------------------------------------------------------
// reference cuts
// ------------------------------------------------------------------------------------------------

function refcut(o) {
  if (!o.video || o.start == null || !o.dur || !o.name) throw new Error('refcut needs --video --start --dur --name');
  const dir = path.join(GAME_DIR, 'refs/sound', `extra-${o.name}`);
  fs.mkdirSync(dir, { recursive: true });
  const wav = path.join(dir, `${o.name}.wav`);
  const r = spawnSync(FFMPEG, ['-v', 'error', '-y', '-ss', String(o.start), '-i', path.resolve(GAME_DIR, o.video), '-t', String(o.dur), '-vn',
    '-ac', '2', '-ar', String(SR), '-c:a', 'pcm_s16le', wav], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr);
  spectro(wav, path.join(dir, `${o.name}.png`));
  const ev = o.event != null ? Number(o.event) - Number(o.start) : undefined;
  const st = { name: o.name, src: path.basename(o.video), start: Number(o.start), dur: Number(o.dur), note: o.note || '',
    ...measureFile(wav, ev != null ? { event: ev } : { searchFrom: 0, searchTo: Math.min(Number(o.dur), Number(o.search || o.dur)) }) };
  fs.writeFileSync(path.join(dir, 'stats.json'), JSON.stringify(st, null, 1));
  console.log(JSON.stringify(st));
}

// ------------------------------------------------------------------------------------------------
// render through the browser
// ------------------------------------------------------------------------------------------------

function fromB64(s) {
  const b = Buffer.from(s, 'base64');
  return new Float32Array(b.buffer.slice(b.byteOffset, b.byteOffset + b.length));
}

async function render(o) {
  const round = o.round || 'r1';
  const out = path.join(GAME_DIR, 'captures/sound', round);
  fs.mkdirSync(out, { recursive: true });
  const only = o.only ? String(o.only).split(',') : null;
  await session({ width: 640, height: 360 }, async ({ b }) => {
    const url = `${ORIGIN}/harness/audio.html`;
    await withRetry(async () => {
      b.takeErrors();
      await b.page.goto(url, { waitUntil: 'load' });
      await b.page.waitForFunction(() => window.__audio && window.__audio.ready, null, { timeout: 60000 });
      await assertNoErrors(b, 'loading harness/audio.html', { allowConsole: true });
    }, { what: 'audio harness load', firstWaitMs: 5000 });
    const names = await b.page.evaluate(() => window.__audio.names());
    const missing = await b.page.evaluate(() => window.__audio.missing());
    if (missing.length) log(`samples that failed to load (rendered without them): ${missing.join(', ')}`);
    if (!only) {
      const smoke = await b.page.evaluate(() => window.__audio.liveSmoke());
      log(`live path (real AudioContext, unlocked, fed real frames): ${smoke.ok ? 'ok' : 'PROBLEMS'}${smoke.warnings.length ? '\n  ' + smoke.warnings.join('\n  ') : ''}`);
      fs.writeFileSync(path.join(out, 'live-smoke.json'), JSON.stringify(smoke, null, 1));
    }
    for (const name of names) {
      if (only && !only.includes(name)) continue;
      touchLock();
      const t0 = Date.now();
      const res = await b.page.evaluate((n) => window.__audio.render(n), name);
      const ch = res.channels.map(fromB64);
      writeWav(path.join(out, `${name}.wav`), ch, res.sampleRate);
      fs.writeFileSync(path.join(out, `${name}.json`), JSON.stringify(res.meta || {}, null, 1));
      log(`${name}: ${(ch[0].length / res.sampleRate).toFixed(2)} s in ${Date.now() - t0} ms`);
    }
    await assertNoErrors(b, 'rendering', { allowConsole: true });
  });
  sheets({ round });
}

// ------------------------------------------------------------------------------------------------
// sheets: per-sound spectrograms, pairs.png, table.md
// ------------------------------------------------------------------------------------------------

/**
 * ours -> nearest reference cuts. ref: the clean 1v1 game mix (refs/sound/extra-*), alt: the
 * trailer or tournament cut (refs/sound/NN-*). win: the time window every column of the row shows.
 */
const PAIRS = [
  { ours: 'hit-light', ref: 'extra-light-hit/light-hit.wav', alt: '01-light-hit-trade.wav', label: 'Light hit', win: 1.4 },
  { ours: 'hit-medium', ref: 'extra-medium-hit/medium-hit.wav', alt: '02-medium-hit.wav', label: 'Medium hit', win: 1.4 },
  { ours: 'hit-heavy', ref: 'extra-heavy-hit/heavy-hit.wav', alt: '03-heavy-lethal-hit.wav', label: 'Heavy hit', win: 1.4 },
  { ours: 'hit-lethal', ref: 'extra-lethal-hit/lethal-hit.wav', alt: '08-lethal-zoom.wav', label: 'Lethal hit', win: 1.4 },
  { ours: 'ko-blast', ref: 'extra-ko-blast/ko-blast.wav', alt: '04-ko-blast-trailer.wav', label: 'Knockout blast', win: 2.2 },
  { ours: 'shield-hit', ref: 'extra-shield-hit/shield-hit.wav', alt: '05-shield-hit.wav', label: 'Shield hit', win: 1.2 },
  { ours: 'jump', ref: 'extra-jump/jump.wav', alt: '06-jump.wav', label: 'Jump', win: 0.9 },
  { ours: 'land', ref: 'extra-land/land.wav', label: 'Landing', win: 0.8 },
  { ours: 'dash', ref: 'extra-dash/dash.wav', alt: '07-dash-after-go.wav', label: 'Dash', win: 0.8 },
  { ours: 'swing', ref: 'extra-swing/swing.wav', label: 'Swing whoosh', win: 0.9 },
  { ours: 'grab', ref: 'extra-grab/grab.wav', label: 'Grab', win: 0.9 },
  { ours: 'start-call', ref: 'extra-go/go.wav', alt: '10-announcer-go.wav', label: 'Start call', win: 1.3 },
  { ours: 'plan-tick', ref: 'extra-select-move/select-move.wav', label: 'Plan change tick', win: 1.1 },
  { ours: 'pick-reveal', ref: 'extra-ready/ready.wav', label: 'Pick reveal', win: 1.8 },
  { ours: 'versus-slam', ref: 'extra-versus/versus.wav', label: 'Versus slam', win: 2.2 },
  { ours: 'winner', ref: 'extra-ko-blast/ko-blast.wav', alt: '11-announcer-game.wav', label: 'Winner (no winner cut: theirs is the final blast and the game call)', win: 2.2 },
  { ours: 'timeline', ref: 'extra-fight-20s/fight-20s.wav', label: '20 s of fight', win: 20, long: true },
  { ours: 'ko-break', ref: 'extra-ko-10s/ko-10s.wav', alt: '12-side-ko-crowd.wav', label: 'Knockout into the break', win: 10, long: true },
];

function refStats(rel) {
  const dir = path.join(GAME_DIR, 'refs/sound', path.dirname(rel));
  const sj = path.join(dir, 'stats.json');
  if (path.dirname(rel) !== '.' && fs.existsSync(sj)) { const s = JSON.parse(fs.readFileSync(sj, 'utf8')); return s; }
  const jl = path.join(GAME_DIR, 'refs/sound/_stats.jsonl');
  if (fs.existsSync(jl)) {
    const name = path.basename(rel, '.wav');
    for (const line of fs.readFileSync(jl, 'utf8').split('\n')) {
      if (!line.trim()) continue;
      const j = JSON.parse(line);
      if (j.name === name) return { ...j, event_s: j.event - j.start };
    }
  }
  return null;
}

// the sheet composer: PIL with the show's own small-text face (Barlow Semi Condensed), sentence
// case, a frequency axis on every row and the same time scale across a row
const COMPOSE_PY = String.raw`
import json, sys, math
from PIL import Image, ImageDraw, ImageFont
spec = json.load(sys.stdin)
F = spec['font']; FB = spec['fontBold']
def font(sz, bold=False):
    try: return ImageFont.truetype(FB if bold else F, sz)
    except Exception: return ImageFont.load_default()
f_title, f_head, f_row, f_small = font(30, True), font(19, True), font(21, True), font(16)
BG=(11,21,34); INK=(244,248,255); DIM=(150,166,186); AMBER=(255,194,26); LINE=(42,54,68)
cw, ch = spec['cellW'], spec['cellH']
cols = spec['cols']; rows = spec['rows']
axis = 58; gap = 14; rowhead = 30; stat_h = spec.get('statH', 44); top = 124
W = axis + len(cols) * (cw + gap) + 10
H = top + len(rows) * (rowhead + ch + 24 + stat_h) + 12
im = Image.new('RGB', (W, H), BG); d = ImageDraw.Draw(im)
d.text((axis, 18), spec['title'], font=f_title, fill=INK)
d.text((axis, 58), spec['sub'], font=f_small, fill=DIM)
for i, c in enumerate(cols):
    d.text((axis + i * (cw + gap), top - 26), c, font=f_head, fill=AMBER if c.startswith('Ours') else DIM)
y = top
lo, hi = 20.0, 22050.0
for r in rows:
    d.text((axis, y + 4), r['label'], font=f_row, fill=INK)
    y0 = y + rowhead
    for hz, lab in [(100, '100 Hz'), (1000, '1 kHz'), (10000, '10 kHz')]:
        yy = y0 + ch * (1 - math.log(hz / lo) / math.log(hi / lo))
        d.line([(axis - 6, yy), (axis - 1, yy)], fill=DIM)
        tw = d.textlength(lab, font=f_small)
        d.text((axis - 8 - tw, yy - 9), lab, font=f_small, fill=DIM)
    for i, c in enumerate(r['cells']):
        x = axis + i * (cw + gap)
        if not c:
            d.rectangle([x, y0, x + cw - 1, y0 + ch - 1], outline=LINE)
            d.text((x + 12, y0 + ch / 2 - 10), 'No cut of this moment', font=f_small, fill=DIM)
            continue
        cell = Image.open(c['png']).convert('RGB').resize((cw, ch))
        im.paste(cell, (x, y0))
        for hz in (100, 1000, 10000):
            yy = y0 + ch * (1 - math.log(hz / lo) / math.log(hi / lo))
            d.line([(x, yy), (x + 5, yy)], fill=INK)
        win = r['win']; step = 0.25 if win <= 1.5 else 0.5 if win <= 4 else 2 if win <= 12 else 4
        k = 0
        while k * step <= win + 1e-6:
            xx = x + cw * (k * step) / win
            d.line([(xx, y0 + ch), (xx, y0 + ch + 5)], fill=DIM)
            if k % 2 == 0:
                lab = ('%g s' % (k * step))
                d.text((min(xx + 2, x + cw - 30), y0 + ch + 4), lab, font=f_small, fill=DIM)
            k += 1
        yy = y0 + ch + 24
        for j, line in enumerate(c.get('stats', [])):
            d.text((x, yy + j * 19), line, font=f_small, fill=INK if j == 0 else DIM)
    y = y0 + ch + 24 + stat_h
im.save(spec['out'])
`;

function compose(spec) {
  const font = path.join(GAME_DIR, 'node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-500-normal.woff');
  const fontBold = path.join(GAME_DIR, 'node_modules/@fontsource/barlow-semi-condensed/files/barlow-semi-condensed-latin-700-normal.woff');
  const r = spawnSync('python3', ['-I', '-c', COMPOSE_PY], { input: JSON.stringify({ font, fontBold, ...spec }), encoding: 'utf8' });
  if (r.status !== 0) throw new Error(`sheet compose failed: ${r.stderr}`);
}

const pc = (v) => (v == null ? '' : `${Math.round(v * 100)}%`);
function cellStats(m, long) {
  if (long) {
    return [`100 ms RMS ${m.p5} to ${m.p95} dB, range ${m.range} dB`, `low ${pc(m.low)}, 0.5 to 2 kHz ${pc(m.mid)}, above 2 kHz ${pc(m.high + m.air)}`];
  }
  return [
    `peak ${m.peak_db} dBFS, 12 dB down at ${m.fall12_ms} ms, 20 dB band ${m.hold20_ms} ms`,
    `low ${pc(m.low)}, 0.5 to 2 kHz ${pc(m.mid)}, above 2 kHz ${pc(m.high + m.air)}`,
  ];
}

function sheets(o) {
  const round = o.round || 'r1';
  const out = path.join(GAME_DIR, 'captures/sound', round);
  const tmp = path.join(out, '.tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const rows = [];
  const sheetRows = [];
  for (const p of PAIRS) {
    const wav = path.join(out, `${p.ours}.wav`);
    if (!fs.existsSync(wav)) continue;
    const meta = fs.existsSync(path.join(out, `${p.ours}.json`)) ? JSON.parse(fs.readFileSync(path.join(out, `${p.ours}.json`), 'utf8')) : {};
    const lead = meta.lead ?? 0.1;
    const evAt = meta.eventAt ?? lead;
    const ours = { ...measureFile(wav, { event: evAt }), ...(p.long ? mixStats(decodeMono(wav)) : {}) };
    spectro(wav, path.join(out, `${p.ours}.png`));
    const cells = [];
    const startOf = (ev) => (p.long ? 0 : Math.max(0, ev - 0.1));
    const cellPng = (src, start, name) => {
      const f = path.join(tmp, `${p.ours}-${name}.png`);
      spectro(src, f, { start, dur: p.win, size: '900x300', legend: 0 });
      return f;
    };
    cells.push({ png: cellPng(wav, startOf(ours.event_s), 'ours'), stats: cellStats(ours, p.long) });
    let mix = null;
    const mixWav = path.join(out, `${p.ours}-inmix.wav`);
    if (fs.existsSync(mixWav)) {
      const mm = JSON.parse(fs.readFileSync(mixWav.replace(/\.wav$/, '.json'), 'utf8'));
      mix = measureFile(mixWav, { event: mm.eventAt });
      spectro(mixWav, mixWav.replace(/\.wav$/, '.png'));
      cells.push({ png: cellPng(mixWav, startOf(mm.eventAt), 'mix'), stats: cellStats(mix, false) });
    } else cells.push(null);
    const theirs = [];
    for (const rel of [p.ref, p.alt]) {
      if (!rel || !fs.existsSync(path.join(GAME_DIR, 'refs/sound', rel))) { cells.push(null); theirs.push(null); continue; }
      const rwav = path.join(GAME_DIR, 'refs/sound', rel);
      const rs = refStats(rel);
      const rev = rs?.event_s ?? undefined;
      const m = { name: rel, ...measureFile(rwav, rev != null ? { event: rev } : {}), ...(p.long ? mixStats(decodeMono(rwav)) : {}) };
      theirs.push(m);
      cells.push({ png: cellPng(rwav, startOf(m.event_s), rel.startsWith('extra-') ? 'ref' : 'alt'), stats: cellStats(m, p.long) });
    }
    sheetRows.push({ label: p.label, win: p.win, cells, long: !!p.long });
    rows.push({ p, ours, mix, theirs });
  }
  const cols = ['Ours alone', 'Ours over our own music and crowd', 'Theirs: clean 1v1 game mix', 'Theirs: trailer or tournament mix'];
  const sub = 'Spectrograms on one scale: log frequency 20 Hz to 22 kHz, log magnitude, the same seconds in every column of a row. Low is the share of power under 150 Hz.';
  const short = sheetRows.filter((r) => !r.long);
  const per = 5;
  const names = [];
  for (let s = 0; s * per < short.length; s++) {
    const name = `pairs${s ? '-' + (s + 1) : ''}.png`;
    compose({ out: path.join(out, name), title: `Ringout sound, ${round}: ours beside the nearest reference (${s + 1} of ${Math.ceil(short.length / per) + 1})`, sub, cols, rows: short.slice(s * per, s * per + per), cellW: 540, cellH: 180 });
    names.push(name);
  }
  const long = sheetRows.filter((r) => r.long).map((r) => ({ ...r, cells: [r.cells[0], r.cells[2], r.cells[3]] }));
  if (long.length) {
    const name = `pairs-${names.length + 1}.png`;
    compose({ out: path.join(out, name), title: `Ringout sound, ${round}: whole mixes (${names.length + 1} of ${names.length + 1})`, sub, cols: ['Ours, rendered from real sim events', 'Theirs: clean 1v1 game mix', 'Theirs: tournament mix'], rows: long, cellW: 720, cellH: 220 });
    names.push(name);
  }
  // families.png: the same medium and heavy hit landed by each fighter, side by side
  const famNames = { kiln: 'Kiln: furnace-door slam, hot hiss', tick: 'Tick: ratchet snap', gantry: 'Gantry: pneumatic piston crack', vise: 'Vise: hydraulic clamp crunch' };
  const famStats = [];
  const famRows = Object.keys(famNames).filter((f) => fs.existsSync(path.join(out, `hit-medium-${f}.wav`))).map((f) => {
    const cells = ['medium', 'heavy'].map((k) => {
      const src = path.join(out, `hit-${k}-${f}.wav`);
      if (!fs.existsSync(src)) return null;
      const png = path.join(tmp, `fam-${k}-${f}.png`);
      spectro(src, png, { start: 0, dur: 1.4, size: '900x300', legend: 0 });
      const x = decodeMono(src);
      const m = bandShares(x.subarray(Math.round(0.1 * SR)));
      const lb = leadBand(x, 0.1);
      const mm = measure(x, { event: 0.1 });
      famStats.push({ f, k, ...m, lead: lb.lead, margin: lb.margin, rms10: mm.max_rms10_db, peak: mm.peak_db, hold20: mm.hold20_ms });
      return { png, stats: [`centre ${m.centre_hz} Hz, led by ${lb.lead} (+${lb.margin} dB), 20 dB band ${mm.hold20_ms} ms`, `low ${pc(m.low)}, 150 to 500 Hz ${pc(m.lowmid)}, 0.5 to 2 kHz ${pc(m.mid)}, 2 to 5 kHz ${pc(m.high)}, above 5 kHz ${pc(m.air)}`] };
    });
    return { label: famNames[f], win: 1.4, cells };
  });
  if (famRows.length) {
    compose({ out: path.join(out, 'families.png'), title: `Ringout sound, ${round}: the same hit from each fighter`, sub: 'Medium and heavy hits, same scale as the pairs sheets. The attacker colours the hit: the signature layer is a recording per fighter.', cols: ['Medium hit', 'Heavy hit'], rows: famRows, cellW: 720, cellH: 200 });
  }

  // ladder.png: light, medium, heavy, lethal, knockout side by side, the same scale
  const ladderNames = [['hit-light', 'Light'], ['hit-medium', 'Medium'], ['hit-heavy', 'Heavy'], ['hit-lethal', 'Lethal'], ['ko-blast', 'Knockout']];
  const ladder = [];
  const ladderCells = ladderNames.filter(([n]) => fs.existsSync(path.join(out, `${n}.wav`))).map(([n, label]) => {
    const src = path.join(out, `${n}.wav`);
    const meta = fs.existsSync(src.replace(/\.wav$/, '.json')) ? JSON.parse(fs.readFileSync(src.replace(/\.wav$/, '.json'), 'utf8')) : {};
    const ev = meta.eventAt ?? 0.1;
    const x = decodeMono(src);
    const m = measure(x, { event: ev });
    const lb = leadBand(x, ev);
    const png = path.join(tmp, `ladder-${n}.png`);
    spectro(src, png, { start: Math.max(0, ev - 0.1), dur: 2.2, size: '600x400', legend: 0 });
    ladder.push({ n, label, peak: m.peak_db, rms10: m.max_rms10_db, hold20: m.hold20_ms, fall12: m.fall12_ms, dur: m.dur_ms, lead: lb.lead, margin: lb.margin, bands: lb.bands });
    return { png, stats: [`${label}: peak ${m.peak_db} dBFS, 10 ms RMS ${m.max_rms10_db} dB`, `led by ${lb.lead} (+${lb.margin} dB over the next band)`, `12 dB down at ${m.fall12_ms} ms, 20 dB band ${m.hold20_ms} ms`] };
  });
  if (ladderCells.length) {
    compose({ out: path.join(out, 'ladder.png'), title: `Ringout sound, ${round}: the hit ladder`, sub: 'Each class rendered alone through the master, 2.2 s from 0.1 s before contact, same scale. Leading band measured on the first 150 ms.', cols: ladderNames.map(([, l]) => l), rows: [{ label: 'Light to knockout', win: 2.2, cells: ladderCells }], cellW: 420, cellH: 300, statH: 66 });
  }

  // table.md
  const f = (v, d = 1) => (v == null || !Number.isFinite(v) ? '' : Number(v).toFixed(d));
  const lines = [];
  lines.push(`# Sound ${round}: measured, ours beside the nearest reference cuts`);
  lines.push('');
  lines.push('Every number comes from `tools/audio.mjs` with the same code for ours and theirs (mono average of the channels).');
  lines.push('');
  lines.push('- **peak**: sample peak, dBFS. **LUFS-I**: integrated loudness (ffmpeg ebur128). **LUFS-M**: loudest 400 ms momentary loudness.');
  lines.push('- **attack**: 10 to 90% rise of the 2 ms RMS into the peak, ms. **6/12/20 dB band**: how long the 10 ms RMS stays within 6, 12 and 20 dB of its maximum, ms. **12 dB down**: time from the maximum to the first 10 ms bin 12 dB under it. **dur**: onset to 40 dB under the maximum.');
  lines.push('- **low / 0.5-2k / >2k**: share of power under 150 Hz, between 500 Hz and 2 kHz, and above 2 kHz, over the whole sound from its onset (not a window at the peak). **centre**: power-weighted spectral centre, Hz.');
  lines.push('- The clean 1v1 cuts have the game music under every sound (at about -30 LUFS), which fills their low band and lengthens their tails; the trailer cuts have orchestral music under them.');
  lines.push('');
  lines.push('| sound | who | file | peak | LUFS-I | LUFS-M | attack | 6/12/20 dB band | 12 dB down | dur | low | 0.5-2k | >2k | centre |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
  const row = (label, who, file, m) => `| ${label} | ${who} | ${file} | ${f(m.peak_db)} | ${f(m.lufsI)} | ${f(m.lufsM)} | ${m.attack_ms} | ${m.hold6_ms}/${m.hold12_ms}/${m.hold20_ms} | ${m.fall12_ms} | ${m.dur_ms} | ${pc(m.low)} | ${pc(m.mid)} | ${pc(m.high + m.air)} | ${m.centre_hz} |`;
  for (const r of rows) {
    if (r.p.long) continue;
    lines.push(row(r.p.label, 'ours', `${r.p.ours}.wav`, r.ours));
    if (r.mix) lines.push(row('', 'ours in our mix', `${r.p.ours}-inmix.wav`, r.mix));
    r.theirs.forEach((t, i) => { if (t) lines.push(row('', i === 0 ? 'theirs, clean game' : 'theirs, trailer/tournament', t.name, t)); });
  }
  lines.push('');
  lines.push('## Whole mixes');
  lines.push('');
  lines.push('The 20 s fight is rendered from real sim events through the live director at 60 fps; the second mix is a knockout, the hold, the half-speed replay and the corner talk. Their numbers describe the whole file, not one event.');
  lines.push('');
  lines.push('| mix | who | file | LUFS-I | 100 ms RMS p5 | median | p95 | range | low | 0.5-2k | >2k | centre |');
  lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|');
  for (const r of rows) {
    if (!r.p.long) continue;
    const mr = (who, file, m) => `| ${r.p.label} | ${who} | ${file} | ${f(m.lufsI)} | ${m.p5} | ${m.p50} | ${m.p95} | ${m.range} | ${pc(m.low)} | ${pc(m.mid)} | ${pc(m.high + m.air)} | ${m.centre_hz} |`;
    lines.push(mr('ours', `${r.p.ours}.wav`, r.ours));
    r.theirs.forEach((t, i) => { if (t) lines.push(mr(i === 0 ? 'theirs, clean game' : 'theirs, tournament', t.name, t)); });
  }
  const kb = rows.find((r) => r.p.ours === 'ko-break');
  if (kb) {
    lines.push('');
    lines.push('500 ms RMS through the knockout mix, dB (ours, then the clean game cut):');
    lines.push('');
    lines.push('`' + kb.ours.rms500.join(' ') + '`');
    lines.push('');
    if (kb.theirs[0]) lines.push('`' + kb.theirs[0].rms500.join(' ') + '`');
  }
  // the ladder: each sound's loudest 10 ms against the knockout blast of the same source
  const ko = rows.find((r) => r.p.ours === 'ko-blast');
  if (ko) {
    lines.push('');
    lines.push('## The ladder');
    lines.push('');
    lines.push('Loudest 10 ms RMS of each sound relative to the knockout blast of the same source, dB. Ours alone and ours over our own bed; theirs from the clean 1v1 cuts, which all carry the game music.');
    lines.push('');
    lines.push('| sound | ours | ours in our mix | theirs |');
    lines.push('|---|---|---|---|');
    for (const r of rows) {
      if (r.p.long) continue;
      const o2 = (r.ours.max_rms10_db - ko.ours.max_rms10_db).toFixed(1);
      const o3 = r.mix && ko.mix ? (r.mix.max_rms10_db - ko.mix.max_rms10_db).toFixed(1) : '';
      const t2 = r.theirs[0] && ko.theirs[0] ? (r.theirs[0].max_rms10_db - ko.theirs[0].max_rms10_db).toFixed(1) : '';
      lines.push(`| ${r.p.label} | ${o2} | ${o3} | ${t2} |`);
    }
  }
  if (ladder.length) {
    lines.push('');
    lines.push('## The hit ladder, alone through the master');
    lines.push('');
    lines.push('Leading band and per-band level from the first 150 ms after contact (dB relative to the whole window). Step is the rise in loudest 10 ms RMS over the class below.');
    lines.push('');
    lines.push('| class | peak | 10 ms RMS | step | 12 dB down | 20 dB band | dur | led by | margin | <150 | 150-500 | 0.5-2k | 2-6k | >6k |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    ladder.forEach((l, i) => lines.push(`| ${l.label} | ${f(l.peak)} | ${f(l.rms10)} | ${i ? '+' + f(l.rms10 - ladder[i - 1].rms10) : ''} | ${l.fall12} | ${l.hold20} | ${l.dur} | ${l.lead} | +${l.margin} | ${l.bands.join(' | ')} |`));
  }
  if (famStats.length) {
    lines.push('');
    lines.push('## The same hit from each fighter');
    lines.push('');
    lines.push('| hit | fighter | peak | 10 ms RMS | 20 dB band | led by | margin | low | 150-500 | 0.5-2k | 2-5k | >5k | centre |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|---|---|---|');
    for (const m of famStats) lines.push(`| ${m.k} | ${m.f} | ${f(m.peak)} | ${f(m.rms10)} | ${m.hold20} | ${m.lead} | +${m.margin} | ${pc(m.low)} | ${pc(m.lowmid)} | ${pc(m.mid)} | ${pc(m.high)} | ${pc(m.air)} | ${m.centre_hz} |`);
  }
  // the other named sounds, ours only
  const done = new Set(rows.map((r) => r.p.ours));
  const extra = fs.readdirSync(out).filter((n) => n.endsWith('.wav') && !done.has(n.slice(0, -4)) && !n.endsWith('-inmix.wav')).sort();
  if (extra.length) {
    lines.push('');
    lines.push('## The rest of the set (ours only)');
    lines.push('');
    lines.push('| sound | peak | LUFS-M | attack | 12 dB down | dur | low | 0.5-2k | >2k | centre |');
    lines.push('|---|---|---|---|---|---|---|---|---|---|');
    for (const n of extra) {
      const wav = path.join(out, n);
      const meta = fs.existsSync(wav.replace(/\.wav$/, '.json')) ? JSON.parse(fs.readFileSync(wav.replace(/\.wav$/, '.json'), 'utf8')) : {};
      const m = measureFile(wav, { event: meta.eventAt ?? meta.lead ?? 0.1 });
      spectro(wav, wav.replace(/\.wav$/, '.png'));
      lines.push(`| ${n.slice(0, -4)} | ${f(m.peak_db)} | ${f(m.lufsM)} | ${m.attack_ms} | ${m.fall12_ms} | ${m.dur_ms} | ${pc(m.low)} | ${pc(m.mid)} | ${pc(m.high + m.air)} | ${m.centre_hz} |`);
    }
  }
  for (const n of fs.readdirSync(out)) if (n.endsWith('-inmix.wav') && !fs.existsSync(path.join(out, n.replace(/\.wav$/, '.png')))) spectro(path.join(out, n), path.join(out, n.replace(/\.wav$/, '.png')));
  fs.writeFileSync(path.join(out, 'table.md'), lines.join('\n') + '\n');
  fs.rmSync(tmp, { recursive: true, force: true });
  log(`wrote ${path.relative(GAME_DIR, out)}/table.md, ${names.join(', ')}, families.png, ladder.png`);
  console.log(lines.join('\n'));
}

// ------------------------------------------------------------------------------------------------
// loop seams
// ------------------------------------------------------------------------------------------------

/** every looping bed and the loop length the code plays it at (s) */
const LOOPS = [
  ['music-danse-fight', 90.585], ['music-danse-opening', 20.75], ['night-bed', 20.0],
];

function loops(o) {
  const round = o.round || 'r4';
  const out = path.join(GAME_DIR, 'captures/sound', round);
  fs.mkdirSync(out, { recursive: true });
  const lines = ['# Loop seams', '', 'Each bed decoded with ffmpeg (mono average) and cut at the loop length the code uses. The seam is the join from the last sample back to the first.', '',
    '| bed | length s | last 50 ms dB | first 50 ms dB | difference dB | centre last / first Hz | step across the seam | median step | 99th pct step | seam / median |', '|---|---|---|---|---|---|---|---|---|---|'];
  for (const [name, len] of LOOPS) {
    const f = path.join(GAME_DIR, 'assets/vendor/sound', `${name}.mp3`);
    if (!fs.existsSync(f)) continue;
    let x = decodeMono(f);
    const L = Math.min(x.length, Math.round(len * SR));
    x = x.subarray(0, L);
    const n50 = Math.round(0.05 * SR);
    const lv = (a) => { let s2 = 0; for (const v of a) s2 += v * v; return db(Math.sqrt(s2 / a.length)); };
    const cen = (a) => { const { mag, binHz } = fftMag(a); let s1 = 0, sf = 0; for (let i = 1; i < mag.length; i++) { s1 += mag[i]; sf += mag[i] * i * binHz; } return s1 ? Math.round(sf / s1) : 0; };
    const last = x.subarray(L - n50), first = x.subarray(0, n50);
    const steps = new Float32Array(L - 1);
    for (let i = 1; i < L; i++) steps[i - 1] = Math.abs(x[i] - x[i - 1]);
    const srt = Array.from(steps.subarray(0, Math.min(steps.length, SR * 10))).sort((a, b) => a - b);
    const med = srt[Math.floor(srt.length / 2)];
    const p99 = srt[Math.floor(srt.length * 0.99)];
    const seam = Math.abs(x[0] - x[L - 1]);
    const r = (v, d = 1) => Number(v).toFixed(d);
    lines.push(`| ${name} | ${r(len, 3)} | ${r(lv(last))} | ${r(lv(first))} | ${r(lv(first) - lv(last))} | ${cen(last)} / ${cen(first)} | ${r(seam, 4)} | ${r(med, 4)} | ${r(p99, 4)} | ${r(seam / Math.max(med, 1e-9), 2)} |`);
    // a picture of the seam: the last and first 0.5 s side by side
    const tmp = path.join(out, `.seam-${name}.wav`);
    const half = Math.round(0.5 * SR);
    const join = new Float32Array(2 * half);
    join.set(x.subarray(L - half), 0);
    join.set(x.subarray(0, half), half);
    writeWav(tmp, [join]);
    spectro(tmp, path.join(out, `seam-${name}.png`), { size: '800x300' });
    fs.rmSync(tmp);
  }
  lines.push('', 'The seam pictures (seam-*.png) show the last 0.5 s of the loop then its first 0.5 s: the join is at the middle.');
  fs.writeFileSync(path.join(out, 'loops.md'), lines.join('\n') + '\n');
  console.log(lines.join('\n'));
}

// ------------------------------------------------------------------------------------------------

function parse(argv) {
  const o = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a.startsWith('--')) o[a.slice(2)] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
    else o._.push(a);
  }
  return o;
}

const isMain = process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname);
if (isMain) {
  const [cmd, ...rest] = process.argv.slice(2);
  const o = parse(rest);
  try {
    if (cmd === 'render') await render(o);
    else if (cmd === 'sheets') sheets(o);
    else if (cmd === 'refcut') refcut(o);
    else if (cmd === 'loops') loops(o);
    else if (cmd === 'spectro') spectro(o._[0], o._[1], { dur: o.dur ? Number(o.dur) : undefined });
    else if (cmd === 'measure') {
      for (const f of o._) {
        const m = measureFile(f, o.event != null ? { event: Number(o.event) } : {});
        console.log(`${path.basename(f).padEnd(34)} len ${m.length_s}s  peak ${m.peak_all_db}  M ${m.lufsM}  ev ${m.event_s}s  atk ${m.attack_ms}ms  dur ${m.dur_ms}ms  h20 ${m.hold20_ms}  cent ${m.centroid_hz}Hz  low ${m.low150}`);
      }
    } else {
      console.log('usage: node tools/audio.mjs render|sheets|measure|refcut|spectro|loops (see the header)');
      process.exit(cmd ? 1 : 0);
    }
  } catch (e) {
    console.error(String(e.stack || e));
    process.exit(1);
  }
}

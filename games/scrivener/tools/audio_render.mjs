#!/usr/bin/env node
// Offline render of the game's audio for a deterministic scripted moment. Owner: sound.
// Runs the sim headless, collects bus events with timestamps, and mixes the mapped recordings
// with the SAME cue table and mix numbers audio.js uses (src/audio/cues.js): playback-rate pitch,
// WebAudio-spec biquad HP/LP, envelopes, delays, the convolution hall reverb (the same recorded
// church impulse response, unit-energy scaled), music-bed ducking and the
// thinking-freeze filter, the master compressor (WebAudio curve incl. its automatic makeup gain).
// ffmpeg decodes the recordings and measures loudness. Stereo panning is not rendered (mono).
//
//   node tools/audio_render.mjs --list
//   node tools/audio_render.mjs --moment attack|roar|death|<scenario> --out clip.wav [--dur 5] [--pre 400] [--events]
//   node tools/audio_render.mjs --moment death --out ours.wav --ref ref.wav --pairA A.wav --pairB B.wav
//       (pair mode: both clips as mono 16 kHz, loudness-matched to each other, peaks kept under -1 dBTP)

import { execFileSync, spawnSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TICK_MS } from '../src/core/constants.js';
import { createMatch, tickMatch } from '../src/sim/match.js';
import { createBrainDriver, createMockBrains, agentController } from '../src/ai/brain.js';
import { SCENARIOS } from '../src/scenarios.js';
import { CUES, MIX, CANCEL_PENDING, findCue, resolveLayer, simDelayMs, dbToGain, irScale } from '../src/audio/cues.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const AUDIO = path.join(ROOT, 'assets/audio');
export const SR = +(process.env.AUDIO_SR || 48000); // tools/audio_match.mjs renders whole matches at a lower rate

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  const v = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
  args[k] = v;
}

// ---------------------------------------------------------------- moments (headless sim)
const place = (m, bossX, agentX) => {
  const w = m.world;
  w.boss.x = bossX; w.agent.x = agentX;
  w.agent.facing = bossX >= agentX ? 1 : -1;
  w.boss.facing = -w.agent.facing;
};

const MOMENTS = {
  // the ledger slam lands on a challenger who stood still: tell, whoosh, impact, rubble, hurt
  attack: {
    decisions: false, still: true,   // the challenger stands and takes it (no counter-attacks in the clip)
    setup(m) { const w = m.world; place(m, 840, 840 - 250); w.boss.aiLock = true; w.boss.forceAttack = 'ledger_slam'; w.agent.hp = 999; },
    anchor: (e) => e.type === 'boss.tell', pre: 350, dur: 4,
  },
  // the start of an attempt: the Scrivener's challenge roar over the bed
  roar: {
    decisions: true,
    setup(m) { m.world.boss.aiLock = true; },
    anchor: (e) => e.type === 'match.attempt', pre: 250, dur: 4.5, keepStart: true,
  },
  // the killing blow and the collapse
  death: {
    decisions: false,
    setup: (m, ctx) => SCENARIOS.boss_death.setup(m, ctx),
    anchor: (e) => e.type === 'boss.death', pre: 480, dur: 6,
  },
};

function recordEvents(name, totalMs) {
  const mo = MOMENTS[name] || (SCENARIOS[name] && { decisions: !!SCENARIOS[name].decisions, setup: SCENARIOS[name].setup, anchor: SCENARIOS[name].untilEvent || (() => false), pre: 500, dur: 5 });
  if (!mo) throw new Error(`unknown moment ${name}`);
  let simT = 0;
  const m = createMatch({ seed: 7, decisions: !!mo.decisions });
  const driver = createBrainDriver({ brains: createMockBrains(7), instant: false, now: () => simT, seed: 7 });
  mo.setup(m, { setBrain: (id, b) => { driver.brains[id] = b; } });
  const events = [];
  const take = (list) => { for (const e of list) events.push({ ...e, at: simT }); list.length = 0; };
  // the match-start events happen before the scripted setup; a moment that is not about the
  // start of an attempt drops them (in the game the attempt began long before this moment)
  if (mo.keepStart) { take(m.events); take(m.world.events); } else { m.events.length = 0; m.world.events.length = 0; }
  const limit = totalMs + 25000;
  while (simT < limit) {
    tickMatch(m, TICK_MS, mo.still ? null : agentController);
    driver.service(m);
    simT += TICK_MS;
    take(m.world.events);
    take(m.events);
    const a = events.find((e) => mo.anchor(e));
    if (a && simT > a.at + totalMs + 500) break;
  }
  const anchor = events.find((e) => mo.anchor(e));
  if (!anchor) throw new Error(`moment ${name}: anchor event never happened`);
  return { events, anchorAt: anchor.at, pre: mo.pre, dur: mo.dur };
}

// ---------------------------------------------------------------- decoding
const manifest = JSON.parse(fs.readFileSync(path.join(AUDIO, 'manifest.json'), 'utf8'));
const library = manifest.library || manifest;
const pcmCache = new Map();
export function decode(id) {
  if (pcmCache.has(id)) return pcmCache.get(id);
  const s = library[id];
  if (!s) throw new Error(`no sound "${id}" in manifest`);
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(AUDIO, s.file), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  const a = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  pcmCache.set(id, a);
  return a;
}
export function decodeSegment(id, offS, durS) {
  const s = library[id];
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-ss', String(offS), '-t', String(durS), '-i', path.join(AUDIO, s.file), '-ac', '1', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 30 });
  return new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
}

// ---------------------------------------------------------------- DSP (WebAudio-equivalent)
// BiquadFilterNode per the Web Audio spec (RBJ cookbook; Q for LP/HP is in dB).
export function biquad(type, f0, Qdb = 1) {
  const w0 = 2 * Math.PI * Math.min(f0, SR / 2 - 1) / SR;
  const cos = Math.cos(w0);
  const alpha = Math.sin(w0) / (2 * Math.pow(10, Qdb / 20));
  let b0, b1, b2;
  if (type === 'lowpass') { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; } else { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
  const a0 = 1 + alpha;
  const c = { b0: b0 / a0, b1: b1 / a0, b2: b2 / a0, a1: -2 * cos / a0, a2: (1 - alpha) / a0, x1: 0, x2: 0, y1: 0, y2: 0 };
  c.tick = (x) => {
    const y = c.b0 * x + c.b1 * c.x1 + c.b2 * c.x2 - c.a1 * c.y1 - c.a2 * c.y2;
    c.x2 = c.x1; c.x1 = x; c.y2 = c.y1; c.y1 = y;
    return y;
  };
  return c;
}

export function renderVoice(l, startS, sfx, send) {
  const src = decode(l.s);
  const srcDur = src.length / SR;
  const off = Math.min(l.off, Math.max(0, srcDur - 0.05));
  const left = srcDur - off;
  const play = l.len ? Math.min(l.len, left) : left;       // source seconds
  const dur = play / ((l.rate + l.rateEnd) / 2);         // output seconds (glide: mean rate)
  const dr = (l.rateEnd - l.rate) / (dur * SR);           // rate change per output sample
  const fi = Math.min(l.fi, dur * 0.5);
  const fo = l.len && l.len < left ? Math.min(l.fo, dur * 0.5) : 0;
  const hp = l.hp ? biquad('highpass', l.hp) : null;
  const lp = l.lp ? biquad('lowpass', l.lp) : null;
  const i0 = Math.round(startS * SR);
  const n = Math.ceil(dur * SR);
  for (let k = 0; k < n; k++) {
    const i = i0 + k;
    const pos = off * SR + k * l.rate + 0.5 * dr * k * k;  // integral of the (linearly gliding) rate
    const p0 = Math.floor(pos), fr = pos - p0;
    let x = p0 + 1 < src.length ? src[p0] * (1 - fr) + src[p0 + 1] * fr : 0;
    if (hp) x = hp.tick(x);
    if (lp) x = lp.tick(x);
    const t = k / SR;
    let env = l.gain;
    if (t < fi) env *= t / fi;
    if (l.dk) { if (t > fi) env *= Math.exp(-(t - fi) / l.dk); } // exponential ring-down (setTargetAtTime)
    else if (fo && t > dur - fo) env *= Math.max(0, (dur - t) / fo);
    x *= env;
    if (i < 0 || i >= sfx.length) continue;
    sfx[i] += x;
    if (l.send) send[i] += x * l.send;
  }
}

// In-place radix-2 complex FFT (re, im: Float64Array of length 2^k). inv: inverse (scaled 1/n).
function fft(re, im, inv = false) {
  const n = re.length;
  for (let i = 1, j = 0; i < n; i++) {
    let bit = n >> 1;
    for (; j & bit; bit >>= 1) j ^= bit;
    j ^= bit;
    if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
  }
  for (let len = 2; len <= n; len <<= 1) {
    const ang = (2 * Math.PI / len) * (inv ? 1 : -1);
    const wr = Math.cos(ang), wi = Math.sin(ang);
    for (let i = 0; i < n; i += len) {
      let cr = 1, ci = 0;
      for (let k = 0; k < len / 2; k++) {
        const a = i + k, b = a + len / 2;
        const tr = re[b] * cr - im[b] * ci, ti = re[b] * ci + im[b] * cr;
        re[b] = re[a] - tr; im[b] = im[a] - ti; re[a] += tr; im[a] += ti;
        const t = cr * wr - ci * wi; ci = cr * wi + ci * wr; cr = t;
      }
    }
  }
  if (inv) for (let i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
}

// The recorded impulse response, exactly as audio.js uses it: unit energy per channel (irScale),
// then the stereo convolver output is folded to mono ((L+R)/2), i.e. one IR = (irL+irR)/2.
let irCache = null;
function impulse() {
  if (irCache) return irCache;
  const s = library[MIX.reverb.ir];
  if (!s) throw new Error(`reverb IR "${MIX.reverb.ir}" missing from manifest`);
  const buf = execFileSync('ffmpeg', ['-v', 'error', '-i', path.join(AUDIO, s.file), '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 1 << 28 });
  const all = new Float32Array(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.length));
  const n = all.length / 2;
  const L = new Float32Array(n), R = new Float32Array(n);
  for (let i = 0; i < n; i++) { L[i] = all[2 * i]; R[i] = all[2 * i + 1]; }
  const k = irScale([L, R]);
  irCache = new Float32Array(n);
  for (let i = 0; i < n; i++) irCache[i] = 0.5 * (L[i] + R[i]) * k;
  return irCache;
}

export function reverb(send) {
  const R = MIX.reverb;
  const ir = impulse();
  const hp = biquad('highpass', R.hpHz);
  const lp = biquad('lowpass', R.lpHz);
  const pre = Math.round(R.preDelayMs / 1000 * SR);
  if (send.length > (1 << 21)) return reverbBlocks(send, ir, hp, lp, pre);
  let N = 1;
  while (N < send.length + ir.length + pre) N <<= 1;
  const xr = new Float64Array(N), xi = new Float64Array(N);
  for (let i = 0; i < send.length; i++) xr[i + pre] = lp.tick(hp.tick(send[i]));
  const hr = new Float64Array(N), hi = new Float64Array(N);
  hr.set(ir);
  fft(xr, xi); fft(hr, hi);
  for (let i = 0; i < N; i++) {
    const r = xr[i] * hr[i] - xi[i] * hi[i];
    xi[i] = xr[i] * hi[i] + xi[i] * hr[i];
    xr[i] = r;
  }
  fft(xr, xi, true);
  const wet = dbToGain(R.wetDb);
  const out = new Float32Array(send.length);
  for (let i = 0; i < send.length; i++) out[i] = xr[i] * wet;
  return out;
}

// The same convolution for a whole match (minutes long): overlap-add in blocks, so memory stays
// a few MB instead of one FFT the size of the match.
function reverbBlocks(send, ir, hp, lp, pre) {
  const B = 1 << 18;
  let N = 1;
  while (N < B + ir.length) N <<= 1;
  const hr = new Float64Array(N), hi = new Float64Array(N);
  hr.set(ir);
  fft(hr, hi);
  const n = send.length;
  const out = new Float32Array(n);
  const wet = dbToGain(MIX.reverb.wetDb);
  const xr = new Float64Array(N), xi = new Float64Array(N);
  const x = new Float32Array(n);
  for (let i = 0; i < n; i++) { const j = i + pre; if (j < n) x[j] = lp.tick(hp.tick(send[i])); }
  for (let b0 = 0; b0 < n; b0 += B) {
    xr.fill(0); xi.fill(0);
    let any = false;
    for (let i = 0; i < B && b0 + i < n; i++) { xr[i] = x[b0 + i]; if (xr[i] !== 0) any = true; }
    if (!any) continue;
    fft(xr, xi);
    for (let i = 0; i < N; i++) {
      const r = xr[i] * hr[i] - xi[i] * hi[i];
      xi[i] = xr[i] * hi[i] + xi[i] * hr[i];
      xr[i] = r;
    }
    fft(xr, xi, true);
    for (let i = 0; i < N && b0 + i < n; i++) out[b0 + i] += xr[i] * wet;
  }
  return out;
}

// DynamicsCompressorNode-style: soft knee curve, attack/release envelope, automatic makeup gain.
export function compressor(x, C = MIX.comp) {
  const thr = C.threshold, knee = C.knee, ratio = C.ratio;
  const curve = (db) => {
    if (db < thr) return db;
    if (db < thr + knee) { const d = db - thr; return db + (1 / ratio - 1) * d * d / (2 * knee); }
    return thr + knee / 2 * (1 + 1 / ratio) + (db - thr - knee) / ratio;
  };
  const makeup = Math.pow(1 / dbToGain(curve(0)), 0.6);
  const aA = Math.exp(-1 / (C.attack * SR)), aR = Math.exp(-1 / (C.release * SR));
  // peak detector over the 6 ms lookahead window (WebAudio's compressor pre-delays the signal
  // by 6 ms and detects on the undelayed input), then attack/release smoothing in dB
  const LA = Math.round(0.006 * SR);
  const n = x.length;
  const det = new Float32Array(n);
  const dq = new Int32Array(n);
  let h = 0, t = 0;
  for (let i = n - 1; i >= 0; i--) {             // sliding max of |x[i .. i+LA]|
    const v = Math.abs(x[i]);
    while (t > h && Math.abs(x[dq[t - 1]]) <= v) t--;
    dq[t++] = i;
    while (dq[h] > i + LA) h++;
    det[i] = Math.abs(x[dq[h]]);
  }
  let envDb = 0;
  const out = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    const inDb = 20 * Math.log10(det[i] + 1e-9);
    const red = curve(inDb) - inDb;                 // <= 0
    envDb = red < envDb ? aA * envDb + (1 - aA) * red : aR * envDb + (1 - aR) * red;
    if (envDb > 0) envDb = 0;
    out[i] = x[i] * dbToGain(envDb) * makeup;
  }
  return out;
}

function renderBed(startS, n, events) {
  const bed = new Float32Array(n);
  const durS = n / SR + 0.1;
  for (const b of MIX.bed) {
    const seg = decodeSegment(b.id, (b.off || 0) + startS, durS);
    const phaseAt = events.find((e) => e.type === 'boss.phase');
    for (let i = 0; i < n && i < seg.length; i++) {
      let g = dbToGain(b.db);
      if (b.phase2Db != null && phaseAt) {
        const t = i / SR - phaseAt.clipS;
        if (t > 0) g = dbToGain(b.db + (b.phase2Db - b.db) * Math.min(1, t / 4));
      }
      bed[i] += seg[i] * g;
    }
  }
  // ducking (same automation as audio.js duck())
  const duckG = new Float32Array(n).fill(1);
  let until = -1, level = 1;
  const ducks = events.filter((e) => e.cue && e.cue.duck).sort((a, b) => a.clipS - b.clipS);
  const segs = [];
  for (const e of ducks) {
    const tgt = dbToGain(e.cue.duck[0]);
    level = e.clipS < until ? Math.min(level, tgt) : tgt;
    until = Math.max(until, e.clipS + e.cue.duck[1] / 1000);
    segs.push({ at: e.clipS, level, until });
  }
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    let g = 1;
    let s = null;
    for (const q of segs) if (q.at <= t) s = q;
    if (s) {
      if (t < s.at + 0.04) g = 1 + (s.level - 1) * ((t - s.at) / 0.04);
      else if (t < s.until) g = s.level;
      else g = Math.min(1, s.level + (1 - s.level) * ((t - s.until) / 0.6));
    }
    duckG[i] = g;
  }
  // thinking freeze: LP + gain on the bed between think.start and think.end
  const F = MIX.freeze;
  const spans = [];
  let open = null;
  for (const e of events) {
    if (e.type === 'think.start' && open == null) open = e.clipS;
    if ((e.type === 'think.end' || e.type === 'match.attempt') && open != null) { spans.push([open, e.clipS]); open = null; }
  }
  if (open != null) spans.push([open, 1e9]);
  const amt = (t) => {
    let a = 0;
    for (const [s0, s1] of spans) {
      if (t >= s0 && t < s1) a = Math.max(a, Math.min(1, (t - s0) / F.attack));
      else if (t >= s1) a = Math.max(a, Math.max(0, 1 - (t - s1) / F.release));
    }
    return a;
  };
  const rest = MIX.bedLpHz || 20000;
  let lp = biquad('lowpass', rest);
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    const a = amt(t);
    if (i % 64 === 0) {
      const f = Math.exp(Math.log(rest) + (Math.log(F.lpHz) - Math.log(rest)) * a);
      const nl = biquad('lowpass', f);
      Object.assign(nl, { x1: lp.x1, x2: lp.x2, y1: lp.y1, y2: lp.y2 });
      lp = nl;
    }
    bed[i] = lp.tick(bed[i] * duckG[i]) * (1 + (dbToGain(F.db) - 1) * a);
  }
  return bed;
}

function mixMoment(name, opts = {}) {
  const pre0 = MOMENTS[name]?.pre ?? 500;
  const pre = opts.pre != null ? +opts.pre : pre0;
  const dur = opts.dur != null ? +opts.dur : (MOMENTS[name]?.dur ?? 5);
  const rec = recordEvents(name, dur * 1000);
  const clipStartMs = rec.anchorAt - pre;
  const n = Math.round(dur * SR);
  const sfx = new Float32Array(n), send = new Float32Array(n);
  const fired = new Map();
  const lastPlay = new Map();
  const used = [];
  // freeze spans (the world is held; sim-timed layers wait) and interrupts
  const spans = [];
  let open = null;
  for (const e of rec.events) {
    if (e.type === 'think.start' && open == null) open = e.at;
    if (e.type === 'think.end' && open != null) { spans.push([open, e.at]); open = null; }
  }
  if (open != null) spans.push([open, 1e12]);
  const fireAt = (T, D) => {
    let t = T, rem = D;
    for (const [s0, s1] of spans) {
      if (s1 <= t) continue;
      if (s0 >= t + rem) break;
      rem -= Math.max(0, s0 - t);
      t = s1;
    }
    return t + rem;
  };
  const cancels = rec.events.filter((e) => CANCEL_PENDING.has(e.type)).map((e) => e.at);
  let bossPhase = 1;
  // replay every event from the start of the run so variant cycling and cooldowns match the game
  for (const e of rec.events) {
    e.clipS = (e.at - clipStartMs) / 1000;
    if (e.type === 'boss.phase') bossPhase = 2;
    if (e.type === 'boss.tell' && e.phase) bossPhase = e.phase;
    if (e.type === 'match.attempt') bossPhase = 1;
    const f = findCue(e, CUES);
    if (!f) continue;
    if (f.cue.cd && e.at - (lastPlay.get(f.key) ?? -1e9) < f.cue.cd) continue;
    lastPlay.set(f.key, e.at);
    const k = fired.get(f.key) || 0;
    fired.set(f.key, k + 1);
    e.cue = f.cue;
    const startS = e.clipS + 0.005;
    if (startS + 12 < 0 || startS > dur) continue;
    used.push({ t: +e.clipS.toFixed(3), cue: f.key });
    for (const raw of f.cue.L) {
      const l = resolveLayer(raw, k);
      if (opts.only && !new RegExp(opts.only).test(l.s)) continue; // diagnostics: --only <regex>
      const sd = simDelayMs(raw, e, bossPhase);
      if (sd == null) { renderVoice(l, startS + l.delay, sfx, send); continue; }
      if (sd < 0) continue;
      const at = fireAt(e.at, sd);
      if (cancels.some((c) => c > e.at && c <= at)) continue;
      renderVoice(l, (at - clipStartMs) / 1000, sfx, send);
    }
  }
  const wet = reverb(send);
  const bed = renderBed(Math.max(0, clipStartMs / 1000), n, rec.events.filter((e) => e.clipS > -12));
  const sum = new Float32Array(n);
  const sg = dbToGain(MIX.sfxDb);
  const sfxOn = opts.noSfx ? 0 : 1, bedOn = opts.noBed ? 0 : 1; // diagnostics: --noSfx / --noBed
  for (let i = 0; i < n; i++) sum[i] = (sfx[i] + wet[i]) * sg * sfxOn + bed[i] * bedOn;
  const out = compressor(sum, MIX.comp);
  for (let i = 0; i < n; i++) out[i] *= MIX.masterGain;
  const lim = compressor(out, MIX.limit);
  out.set(lim);
  let peak = 0, clipped = 0;
  for (let i = 0; i < n; i++) {
    const a = Math.abs(out[i]);
    if (a > peak) peak = a;
    if (a > 1) { clipped++; out[i] = Math.sign(out[i]); }
  }
  return { out, used, events: rec.events.filter((e) => e.clipS >= 0 && e.clipS <= dur).map((e) => ({ t: +e.clipS.toFixed(3), type: e.type, attackId: e.attackId, target: e.target })), peakDb: 20 * Math.log10(peak + 1e-9), clipped };
}

// ---------------------------------------------------------------- I/O
export function writeWav(file, samples, sr = SR) {
  const n = samples.length;
  const b = Buffer.alloc(44 + n * 2);
  b.write('RIFF', 0); b.writeUInt32LE(36 + n * 2, 4); b.write('WAVE', 8);
  b.write('fmt ', 12); b.writeUInt32LE(16, 16); b.writeUInt16LE(1, 20); b.writeUInt16LE(1, 22);
  b.writeUInt32LE(sr, 24); b.writeUInt32LE(sr * 2, 28); b.writeUInt16LE(2, 32); b.writeUInt16LE(16, 34);
  b.write('data', 36); b.writeUInt32LE(n * 2, 40);
  for (let i = 0; i < n; i++) b.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round(samples[i] * 32767))), 44 + i * 2);
  fs.writeFileSync(file, b);
}

export function measure(file) {
  const txt = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr.toString();
  const sum = txt.slice(txt.lastIndexOf('Summary:'));
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(sum);
  const P = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(sum);
  return { lufs: I ? +I[1] : null, truePeak: P ? +P[1] : null };
}

// mono 16 kHz, gain so integrated loudness = target
function toPair(src, dst, gainDb, durS) {
  execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', src, ...(durS ? ['-t', String(durS)] : []), '-ac', '1', '-ar', '16000', '-af', `volume=${gainDb.toFixed(2)}dB`, '-c:a', 'pcm_s16le', dst]);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (args.list) {
    console.log(JSON.stringify({ moments: Object.keys(MOMENTS), scenarios: Object.keys(SCENARIOS) }));
    process.exit(0);
  }
  const name = args.moment || 'attack';
  const outFile = path.resolve(args.out || `${name}.wav`);
  const r = mixMoment(name, { pre: args.pre, dur: args.dur, noSfx: !!args.noSfx, noBed: !!args.noBed, only: args.only });
  writeWav(outFile, r.out);
  const m = measure(outFile);
  const res = { out: outFile, moment: name, lufs: m.lufs, truePeak: m.truePeak, samplePeakDb: +r.peakDb.toFixed(2), clippedSamples: r.clipped, cues: r.used.filter((u) => u.t >= -3) };
  if (args.events) res.events = r.events;
  if (args.ref && args.pairA && args.pairB) {
    const ref = measure(args.ref);
    const tmpA = path.join(path.dirname(path.resolve(args.pairA)), '.tmpA.wav');
    const tmpB = path.join(path.dirname(path.resolve(args.pairA)), '.tmpB.wav');
    toPair(outFile, tmpA, 0); toPair(args.ref, tmpB, 0);
    const a0 = measure(tmpA), b0 = measure(tmpB);
    // match both clips to the reference's loudness, then pull both down until neither true-peaks above
    // -1 dBTP: boosting a clip into 16-bit clipping would distort its loudest moment
    let target = ref.lufs;
    const over = Math.max(a0.truePeak + (target - a0.lufs), b0.truePeak + (target - b0.lufs)) + 1;
    if (over > 0) target -= over;
    toPair(outFile, path.resolve(args.pairA), target - a0.lufs);
    toPair(args.ref, path.resolve(args.pairB), target - b0.lufs);
    fs.rmSync(tmpA, { force: true }); fs.rmSync(tmpB, { force: true });
    res.pair = { target, A: measure(path.resolve(args.pairA)), B: measure(path.resolve(args.pairB)) };
  }
  console.log(JSON.stringify(res, null, 1));
}

#!/usr/bin/env node
// Offline render of a WHOLE recorded match, the way a viewer hears it. Owner: sound.
//
// Reads a feed (.cache/feeds/*.jsonl) and raises the bus events the stage would: the show.* cues
// from the feed (src/stage/stage.js onFeed), and the fight's own sim events by replaying each
// attempt with its seed and the decisions in the feed (src/stage/fight.js: bell, menu hold, stamp).
// Mixes them with the cue table, the music bed (scene gates, the fight-music director, ducking,
// the thinking freeze), the recorded hall reverb and the master chain, all from src/audio/cues.js,
// using the DSP of tools/audio_render.mjs. Mono, 32 kHz by default (AUDIO_SR).
//
//   node tools/audio_match.mjs --feed .cache/feeds/<id>.jsonl --out match.wav [--stems] [--json report.json]
//
// Prints integrated loudness and true peak per show phase, and music against effects per phase
// (the stems are measured after the master gain, before the bus compressor).
// Approximations: the stage's brief slow-down into each tell and its catch-up are not modelled
// (the channel's clock is used); the 40-voice cap is not modelled; the viewer is assumed to
// have clicked for sound at the start of the match (the music elements start then).

import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

process.env.AUDIO_SR ||= '32000';
const R = await import('./audio_render.mjs');
// --cues <file>: render with another cue table (e.g. a saved copy of an earlier round, its
// imports pointed at this repo) to compare before and after on the same match
const cuesArg = process.argv.indexOf('--cues');
const C = await import(cuesArg > 0 ? path.resolve(process.argv[cuesArg + 1]) : '../src/audio/cues.js');
const { createWorld, stepWorld, applyDecision } = await import('../src/sim/world.js');
const { agentController } = await import('../src/ai/reflex.js');
const { TICK_MS } = await import('../src/core/constants.js');
const { T } = await import('../src/show/timing.js');
const { MAX_ATTEMPTS_EACH } = await import('../src/show/rules.js');
const { ATTACKS } = await import('../src/sim/attacks.js');

const { SR } = R;
const { MIX, CUES, CANCEL_PENDING, findCue, resolveLayer, simDelayMs, dbToGain } = C;

const argv = process.argv.slice(2);
const args = {};
for (let i = 0; i < argv.length; i++) {
  if (!argv[i].startsWith('--')) continue;
  const k = argv[i].slice(2);
  args[k] = argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[++i] : true;
}

// ---------------------------------------------------------------- the stage, emulated
export function stageEvents(feedFile) {
  const lines = fs.readFileSync(feedFile, 'utf8').trim().split('\n').map((l) => JSON.parse(l));
  const match = lines.find((m) => m.type === 'match');
  const t0 = match.startedAt ?? match.t;
  const order = (match.meta && match.meta.order) || match.entrants.map((e) => e.id);
  const items = lines.map((m, i) => ({ i, m, at: m.type === 'event' ? m.event.at : m.t - t0 }))
    .filter((x) => x.at >= 0 && x.m.type !== 'match_end')
    .sort((a, b) => a.at - b.at || a.i - b.i);
  const made = {};
  for (const { m, at } of items) if (m.type === 'event' && m.event.type === 'decide.made') (made[m.event.data.index] ||= []).push({ ...m.event.data, at });
  const out = [];          // { at (ms from the match start), e }
  const scenes = [];       // { at, phase }
  const winKind = {};      // windowId -> 'who' | 'try'
  const push = (at, e) => out.push({ at, e });
  const cue = (at, name, data = {}) => push(at, { type: `show.${name}`, ...data });
  const readyAts = items.filter((x) => x.m.type === 'event' && x.m.event.type === 'attempt.ready').map((x) => x.at);
  let end = 0;
  for (const { m, at } of items) {
    end = Math.max(end, at);
    if (m.type.startsWith('window_')) {
      const what = m.type.slice(7);
      if (what === 'open') winKind[m.windowId] = m.outcomes && m.outcomes.length === 2 ? 'who' : 'try';
      cue(at, `window.${what}`, { kind: winKind[m.windowId] || 'try' });
      continue;
    }
    if (m.type !== 'event') continue;
    const ev = m.event, d = ev.data || {};
    switch (ev.type) {
      case 'phase': cue(at, 'phase', { kind: d.phase }); scenes.push({ at, phase: d.phase }); break;
      case 'temper': cue(at, 'temper'); break;
      case 'offer': cue(at, 'offer'); break;
      case 'pick': cue(at, 'pick'); break;
      case 'attempt.ready': cue(at, 'ready'); break;
      case 'attempt.start': {
        push(at, { type: 'match.attempt', agent: d.entrantId, attempt: d.index });
        cue(at, 'bell');
        const next = readyAts.find((r) => r > at) ?? Infinity;
        runAttempt(d, at, made[d.index] || [], next, push);
        break;
      }
      case 'attempt.end': cue(at, 'attempt.end', { kind: d.result }); break;
      case 'note': cue(at, 'note'); break;
      case 'verdict': cue(at, 'verdict'); break;
      case 'line': cue(at, 'line'); break;
    }
  }
  out.sort((a, b) => a.at - b.at);
  return { events: out, scenes, endMs: end + 4000, total: order.length * MAX_ATTEMPTS_EACH, strokes: (match.meta && match.meta.strokes) || 6 };
}

// One attempt, as src/stage/fight.js plays it: the bell, then the world at full speed; at each
// decision the menu is held at least 750 ms, the answer arrives with the feed, it is stamped for
// 1300 ms, then time resumes. The world runs on for a while after its outcome.
function runAttempt(d, at0, decisions, nextReady, push) {
  const w = createWorld({ seed: d.seed, agentId: d.entrantId, loadout: d.loadout, temper: d.temper, handicap: d.handicap || 0, decisions: true });
  let t = at0 + T.bell;
  let stopAt = nextReady;
  let guard = 0;
  while (t < stopAt && guard++ < 400000) {
    if (w.thinking) {
      const k = w.thinking.k;
      push(t, { type: 'show.think.start' });
      push(t, { type: 'think.start', attackId: w.thinking.attackId });
      const dm = decisions.find((x) => x.k === k);
      if (!dm) break;
      const madeAt = Math.max(t + 750, dm.at);
      push(madeAt, { type: 'show.think.made' });
      applyDecision(w, { slot: dm.slot, thought: dm.line }, agentController);
      t = madeAt + 1300;
      push(t, { type: 'think.end' });
      push(t, { type: 'show.think.end' });
      continue;
    }
    stepWorld(w, TICK_MS, agentController);
    t += TICK_MS;
    for (const e of w.events) push(t, { ...e });
    w.events.length = 0;
    if (w.outcome && stopAt === nextReady) {
      if (w.outcome === 'written') push(t, { type: 'show.written' });
      stopAt = Math.min(nextReady, t + 6000);
    }
  }
}

// ---------------------------------------------------------------- the music director (stage -> audio)
export function musicCalls(events, total, strokes) {
  if (!C.musicCall) return [];
  const st = C.musicState(total, strokes);
  const calls = [];
  for (const { at, e } of events) {
    const c = C.musicCall(e, st);
    if (c) calls.push({ at, c });
  }
  return calls;
}

// ---------------------------------------------------------------- the bed
// One-pole approach to a target (AudioParam.setTargetAtTime), evaluated per block.
function renderBed(n, scenes, calls, events, freezeSpans) {
  const BLK = 128, dtB = BLK / SR;
  const firstScene = scenes.length ? scenes[0].phase : 'call';
  const init = { level: 0, page: true };
  const layers = MIX.bed.map((b) => {
    const pcm = R.decode(b.id);
    const r0 = C.bedResponse ? C.bedResponse(b, init, init) : null;
    const inScene = (p) => (!b.in || b.in.includes(p) ? 1 : 0);
    return {
      b, pcm, pos: Math.round((b.off || 0) * SR) % pcm.length, base: dbToGain(b.db), act: b.act != null,
      sg: inScene(firstScene), sgT: inScene(firstScene), inScene, sceneOn: !!inScene(firstScene),
      ig: r0 ? r0.target : 1, igT: r0 ? r0.target : 1, igTau: 0.5, ramps: [],
      p2: 1,
    };
  });
  const phase2At = events.filter((x) => x.e.type === 'boss.phase').map((x) => x.at / 1000);
  const actBus = new Float32Array(n), rest = new Float32Array(n);
  let prev = init;
  let si = 0, ci = 0;
  let lpHz = C.MUSIC ? C.MUSIC.lpLo : 20000, lpT = lpHz, lpTau = 1;
  let lp = R.biquad('lowpass', lpHz);
  for (let b0 = 0; b0 < n; b0 += BLK) {
    const t = b0 / SR;
    while (si < scenes.length && scenes[si].at / 1000 <= t) {
      // audio.js setScene(): a layer that comes back into its phase restarts at its entry point
      for (const L of layers) {
        const on = !!L.inScene(scenes[si].phase);
        if (on && !L.sceneOn && L.b.entry != null) L.pos = Math.round(L.b.entry * SR) % L.pcm.length;
        L.sceneOn = on;
        L.sgT = on ? 1 : 0;
      }
      si++;
    }
    while (ci < calls.length && calls[ci].at / 1000 <= t) {
      const { at } = calls[ci];
      const c = { ...calls[ci++].c };
      if (c.act == null && !c.page && !c.cut) c.act = prev.act; // as audio.js setIntensity()
      for (const L of layers) {
        const r = C.bedResponse(L.b, c, prev);
        if (!r) continue;
        if (r.seek != null) L.pos = Math.round(r.seek * SR) % L.pcm.length;
        L.ramps = L.ramps.filter((q) => q.t < at / 1000 + (r.delay || 0)); // a newer call cancels later ramps
        L.ramps.push({ t: at / 1000 + (r.delay || 0), target: r.target, tau: r.tau });
      }
      if (!c.cut) { lpT = C.actLpHz(c); lpTau = C.MUSIC.tauRise; }
      prev = c;
    }
    for (const L of layers) {
      while (L.ramps.length && L.ramps[0].t <= t) { const q = L.ramps.shift(); L.igT = q.target; L.igTau = q.tau; }
      L.sg += (L.sgT - L.sg) * (1 - Math.exp(-dtB / 0.5));
      L.ig += (L.igT - L.ig) * (1 - Math.exp(-dtB / Math.max(0.005, L.igTau)));
      if (L.b.phase2Db != null && phase2At.length && t > phase2At[0]) L.p2 = dbToGain((L.b.phase2Db - L.b.db) * Math.min(1, (t - phase2At[0]) / 4));
      const g = L.base * L.sg * L.ig * L.p2;
      const dst = L.act ? actBus : rest;
      if (g < 1e-5) { L.pos = (L.pos + BLK) % L.pcm.length; continue; }
      const len = L.pcm.length;
      for (let i = b0; i < b0 + BLK && i < n; i++) { dst[i] += L.pcm[L.pos] * g; if (++L.pos >= len) L.pos = 0; }
    }
    // the acts' low-pass opens with the level
    lpHz += (lpT - lpHz) * (1 - Math.exp(-dtB / lpTau));
    if (C.MUSIC) {
      const nl = R.biquad('lowpass', lpHz);
      Object.assign(nl, { x1: lp.x1, x2: lp.x2, y1: lp.y1, y2: lp.y2 });
      lp = nl;
      for (let i = b0; i < b0 + BLK && i < n; i++) rest[i] += lp.tick(actBus[i]);
    }
  }
  const bed = rest;
  // ducking (audio.js duck(): dip to the deepest requested level, hold, recover over 600 ms)
  const ducks = events.filter((x) => x.cue && x.cue.duck);
  const segs = [];
  let until = -1, level = 1;
  for (const x of ducks) {
    const s = x.at / 1000;
    const tgt = dbToGain(x.cue.duck[0]);
    level = s < until ? Math.min(level, tgt) : tgt;
    until = Math.max(until, s + x.cue.duck[1] / 1000);
    segs.push({ at: s, level, until });
  }
  const F = MIX.freeze;
  const rest0 = MIX.bedLpHz || 20000;
  let flp = R.biquad('lowpass', rest0);
  let si2 = 0, fi = 0;
  for (let i = 0; i < n; i++) {
    const t = i / SR;
    while (si2 + 1 < segs.length && segs[si2 + 1].at <= t) si2++;
    let g = 1;
    const s = segs[si2];
    if (s && s.at <= t) {
      if (t < s.at + 0.04) g = 1 + (s.level - 1) * ((t - s.at) / 0.04);
      else if (t < s.until) g = s.level;
      else g = Math.min(1, s.level + (1 - s.level) * ((t - s.until) / 0.6));
    }
    // thinking freeze: the bed muffled and pulled back while time is held
    while (fi + 1 < freezeSpans.length && freezeSpans[fi + 1][0] <= t) fi++;
    let a = 0;
    const sp = freezeSpans[fi];
    if (sp && t >= sp[0]) a = t < sp[1] ? Math.min(1, (t - sp[0]) / F.attack) : Math.max(0, 1 - (t - sp[1]) / F.release);
    if (i % 64 === 0) {
      const f = Math.exp(Math.log(rest0) + (Math.log(F.lpHz) - Math.log(rest0)) * a);
      const nl = R.biquad('lowpass', f);
      Object.assign(nl, { x1: flp.x1, x2: flp.x2, y1: flp.y1, y2: flp.y2 });
      flp = nl;
    }
    bed[i] = flp.tick(bed[i] * g) * (1 + (dbToGain(F.db) - 1) * a);
  }
  return bed;
}

// ---------------------------------------------------------------- effects
function renderSfx(n, events) {
  const sfx = new Float32Array(n), send = new Float32Array(n);
  const spans = [];
  let open = null;
  for (const { at, e } of events) {
    if (e.type === 'think.start' && open == null) open = at;
    if ((e.type === 'think.end' || e.type === 'match.attempt') && open != null) { spans.push([open, at]); open = null; }
  }
  if (open != null) spans.push([open, 1e12]);
  const fireAt = (Tm, D) => {
    let t = Tm, rem = D;
    for (const [s0, s1] of spans) {
      if (s1 <= t) continue;
      if (s0 >= t + rem) break;
      rem -= Math.max(0, s0 - t);
      t = s1;
    }
    return t + rem;
  };
  const cancels = events.filter((x) => CANCEL_PENDING.has(x.e.type)).map((x) => x.at);
  const fired = new Map(), lastPlay = new Map(), used = new Map();
  let bossPhase = 1;
  for (const x of events) {
    const e = x.e;
    if (e.type === 'boss.phase') bossPhase = 2;
    if (e.type === 'boss.tell' && e.phase) bossPhase = e.phase;
    if (e.type === 'match.attempt') bossPhase = 1;
    const f = findCue(e, CUES);
    if (!f) { used.set(`(silent) ${e.type}`, (used.get(`(silent) ${e.type}`) || 0) + 1); continue; }
    if (f.cue.cd && x.at - (lastPlay.get(f.key) ?? -1e9) < f.cue.cd) continue;
    lastPlay.set(f.key, x.at);
    const k = fired.get(f.key) || 0;
    fired.set(f.key, k + 1);
    used.set(f.key, (used.get(f.key) || 0) + 1);
    x.cue = f.cue;
    for (const raw of f.cue.L) {
      const l = resolveLayer(raw, k, e);
      const sd = simDelayMs(raw, e, bossPhase);
      if (sd == null) { R.renderVoice(l, x.at / 1000 + 0.005 + l.delay, sfx, send); continue; }
      if (sd < 0) continue;
      const at = fireAt(x.at, sd);
      if (cancels.some((c) => c > x.at && c <= at)) continue;
      R.renderVoice(l, at / 1000, sfx, send);
    }
  }
  const wet = R.reverb(send);
  const sg = dbToGain(MIX.sfxDb);
  for (let i = 0; i < n; i++) sfx[i] = (sfx[i] + wet[i]) * sg;
  return { sfx, spans: spans.map(([a, b]) => [a / 1000, b / 1000]), used };
}

// ---------------------------------------------------------------- measuring
function measureSeg(file, fromS, toS) {
  const txt = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-ss', String(fromS), '-t', String(Math.max(0.5, toS - fromS)), '-i', file, '-af', 'ebur128=peak=true', '-f', 'null', '-']).stderr.toString();
  const sum = txt.slice(txt.lastIndexOf('Summary:'));
  const I = /I:\s+(-?[\d.]+) LUFS/.exec(sum);
  const P = /Peak:\s+(-?[\d.]+|-inf) dBFS/.exec(sum);
  const LRA = /LRA:\s+(-?[\d.]+) LU/.exec(sum);
  return { lufs: I ? +I[1] : null, truePeak: P ? +P[1] : null, lra: LRA ? +LRA[1] : null };
}

// 400 ms momentary windows: how far effects stand over music while an effect is sounding (dB, p10 / median / p90)
function overMusic(sfx, bed, spans) {
  const W = Math.round(0.4 * SR);
  const diffs = [];
  for (const [a, b] of spans) {
    for (let i = Math.round(a * SR); i + W <= Math.min(sfx.length, Math.round(b * SR)); i += W) {
      let es = 0, eb = 0;
      for (let j = i; j < i + W; j++) { es += sfx[j] * sfx[j]; eb += bed[j] * bed[j]; }
      const ls = 10 * Math.log10(es / W + 1e-12), lb = 10 * Math.log10(eb / W + 1e-12);
      if (ls > -45) diffs.push(ls - lb);
    }
  }
  diffs.sort((x, y) => x - y);
  const q = (p) => (diffs.length ? +diffs[Math.floor(p * (diffs.length - 1))].toFixed(1) : null);
  return { windows: diffs.length, p10: q(0.1), median: q(0.5), p90: q(0.9) };
}

// ---------------------------------------------------------------- main
export function renderMatch(feedFile) {
  const st = stageEvents(feedFile);
  const calls = musicCalls(st.events, st.total, st.strokes);
  const n = Math.round(st.endMs / 1000 * SR);
  const { sfx, spans, used } = renderSfx(n, st.events);
  const bed = renderBed(n, st.scenes, calls, st.events, spans);
  const sum = new Float32Array(n);
  for (let i = 0; i < n; i++) sum[i] = sfx[i] + bed[i];
  const out = R.compressor(sum, MIX.comp);
  for (let i = 0; i < n; i++) out[i] *= MIX.masterGain;
  const lim = R.compressor(out, MIX.limit);
  let peak = 0, clipped = 0;
  for (let i = 0; i < n; i++) { const a = Math.abs(lim[i]); if (a > peak) peak = a; if (a > 1) { clipped++; lim[i] = Math.sign(lim[i]); } }
  return { st, calls, sfx, bed, mix: lim, spans, used, samplePeakDb: 20 * Math.log10(peak + 1e-9), clipped };
}

// Every cue alone on silence (dry + hall, through the master gain, no music): its loudest 400 ms
// (momentary max, LUFS) and its sample peak, so thin and overloud cues show up side by side.
//   node tools/audio_match.mjs --cuelevels [--json levels.json]
function cueLevels() {
  const rows = [];
  const tmp = path.resolve('.cache', '.cue_level.wav');
  for (const key of Object.keys(CUES)) {
    const [type, ...qs] = key.split(':');
    const e = { type, damage: 25 };
    for (const q of qs) {
      if (ATTACKS && ATTACKS[q]) e.attackId = q;
      else if (q === 'agent' || q === 'boss') e.target = q;
      else if (q === 'heavy') e.heavy = true;
      else if (['sabre', 'maul', 'knives', 'pole', 'censer', 'quill'].includes(q)) e.weapon = q;
      else e.kind = q;
    }
    const n = Math.round(9 * SR);
    const sfx = new Float32Array(n), send = new Float32Array(n);
    for (const raw of CUES[key].L) {
      const l = resolveLayer(raw, 0, e);
      const sd = simDelayMs(raw, e, 1);
      const at = sd == null ? 0.2 + l.delay : sd >= 0 ? 0.2 + sd / 1000 : null;
      if (at != null) R.renderVoice(l, at, sfx, send);
    }
    const wet = R.reverb(send);
    let pk = 0;
    for (let i = 0; i < n; i++) { sfx[i] = (sfx[i] + wet[i]) * MIX.masterGain; pk = Math.max(pk, Math.abs(sfx[i])); }
    R.writeWav(tmp, sfx.map((v) => Math.max(-1, Math.min(1, v))));
    const txt = spawnSync('ffmpeg', ['-hide_banner', '-nostats', '-i', tmp, '-af', 'ebur128', '-f', 'null', '-']).stderr.toString();
    let mMax = -120;
    for (const m of txt.matchAll(/M:\s*(-?[\d.]+)/g)) mMax = Math.max(mMax, +m[1]);
    rows.push({ cue: key, layers: CUES[key].L.length, files: [...new Set(CUES[key].L.flatMap((l) => [].concat(l.s)))].join(' '), mMaxLufs: +mMax.toFixed(1), peakDb: +(20 * Math.log10(pk + 1e-9)).toFixed(1) });
  }
  fs.rmSync(tmp, { force: true });
  return rows;
}

if (import.meta.url === `file://${process.argv[1]}` && args.cuelevels) {
  const rows = cueLevels();
  if (args.json) fs.writeFileSync(path.resolve(args.json), JSON.stringify(rows, null, 1));
  for (const r of rows) console.log(`${r.cue.padEnd(34)} M ${String(r.mMaxLufs).padStart(6)}  pk ${String(r.peakDb).padStart(6)}  ${r.files}`);
} else if (import.meta.url === `file://${process.argv[1]}`) {
  const feed = path.resolve(args.feed || '.cache/feeds/scrivener-210-mwnofg5c.jsonl');
  const outFile = path.resolve(args.out || 'match.wav');
  const t0 = Date.now();
  const r = renderMatch(feed);
  R.writeWav(outFile, r.mix);
  const stem = (name, x) => {
    const f = outFile.replace(/\.wav$/, `.${name}.wav`);
    const y = new Float32Array(x.length);
    for (let i = 0; i < x.length; i++) y[i] = Math.max(-1, Math.min(1, x[i] * MIX.masterGain));
    R.writeWav(f, y);
    return f;
  };
  const sfxFile = stem('sfx', r.sfx), bedFile = stem('music', r.bed);
  const sc = r.st.scenes;
  const phases = sc.map((s, i) => ({ phase: s.phase, from: s.at / 1000, to: (i + 1 < sc.length ? sc[i + 1].at : r.st.endMs) / 1000 }));
  const report = { feed: path.basename(feed), out: outFile, seconds: +(r.mix.length / SR).toFixed(1), sr: SR, whole: measureSeg(outFile, 0, r.mix.length / SR), samplePeakDb: +r.samplePeakDb.toFixed(2), clippedSamples: r.clipped, phases: [] };
  for (const p of phases) {
    const m = measureSeg(outFile, p.from, p.to), s = measureSeg(sfxFile, p.from, p.to), b = measureSeg(bedFile, p.from, p.to);
    report.phases.push({ ...p, lufs: m.lufs, truePeak: m.truePeak, lra: m.lra, sfxLufs: s.lufs, musicLufs: b.lufs, sfxOverMusic: s.lufs != null && b.lufs != null ? +(s.lufs - b.lufs).toFixed(1) : null, momentary: overMusic(r.sfx, r.bed, [[p.from, p.to]]) });
  }
  const fightSpans = phases.filter((p) => p.phase === 'fight').map((p) => [p.from, p.to]);
  report.fightMomentary = overMusic(r.sfx, r.bed, fightSpans);
  report.thinkHeldSeconds = +r.spans.reduce((a, [x, y]) => a + Math.min(y, 1e6) - x, 0).toFixed(1);
  report.cues = Object.fromEntries([...r.used.entries()].sort((a, b) => b[1] - a[1]));
  report.musicCalls = r.calls.length;
  report.renderSeconds = Math.round((Date.now() - t0) / 1000);
  if (!args.stems) { fs.rmSync(sfxFile, { force: true }); fs.rmSync(bedFile, { force: true }); }
  if (args.json) fs.writeFileSync(path.resolve(args.json), JSON.stringify({ ...report, timeline: r.st.events.map((x) => ({ t: +(x.at / 1000).toFixed(3), type: x.e.type, q: x.e.attackId || x.e.kind || x.e.target || x.e.spell || undefined })) }, null, 1));
  console.log(JSON.stringify(report, null, 1));
}

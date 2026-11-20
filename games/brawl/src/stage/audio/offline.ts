// Offline renders of the Ringout sound for measurement (harness/audio.html, tools/audio.mjs).
// Every named sound, a 20 s fight timeline driven by real sim events through the real director,
// and a 10 s mix of a knockout into the break, all through OfflineAudioContext.

import type { Frame, FightView, PostState, ShowState } from '../api.ts';
import type { FightState, FighterId, Side, SimEvent } from '../../sim/types.ts';
import { FIGHTERS, makeHeader, runFight } from '../../sim/index.ts';
import { Engine, SAMPLE_NAMES, decodedBytes, loadSamples, missingSamples, sample } from './engine.ts';
import { createDirector, crowdGains, type MoveDefs } from './director.ts';
import { loopEndOf, music, musicTrim } from './music.ts';
import * as S from './sounds.ts';

const SR = 44100;
/** seconds rendered ahead of the 20 s fight and cut off, so its beds are already running */
const PREROLL = 1.5;

interface Job {
  len: number;
  lead?: number;
  /** seconds into the render where the measured event is (defaults to lead) */
  eventAt?: number;
  run(e: Engine, t: number): void;
}

const startup = (f: FighterId, m: string) => (FIGHTERS[f].moves as Record<string, { startup: number }>)[m]?.startup ?? 6;

/** the knockout exactly as the director plays it: the blast, the call on the word, the room */
function koMoment(e: Engine, t: number, final = false): void {
  S.koBlast(e, t, 0);
  S.koCall(e, t + (final ? 0.233 : 0.15), final);
  e.smp('crowd-roar', t + 0.04, { gain: 1.0, bus: 'crowd', fadeIn: 0.1, hold: 1.0, tc: 0.55, hp: 200, lp: 9000 });
  e.smp('crowd-cheer', t + 0.3, { gain: 0.45, bus: 'crowd', fadeIn: 0.25, hold: 1.0, tc: 0.6, hp: 300, lp: 5000 });
}

const JOBS: Record<string, Job> = {
  'hit-light': { len: 1.0, run: (e, t) => { S.hit(e, t, { strength: 'light', by: 'tick', to: 'gantry', damage: 3, kb: 30, pan: 0, combo: 0 }); } },
  'hit-medium': { len: 1.2, run: (e, t) => { S.hit(e, t, { strength: 'medium', by: 'vise', to: 'gantry', damage: 9, kb: 70, pan: 0, combo: 0 }); } },
  'hit-heavy': {
    len: 2.0, run: (e, t) => {
      S.hit(e, t, { strength: 'heavy', by: 'kiln', to: 'tick', damage: 17, kb: 120, pan: 0, combo: 0 });
      S.launch(e, t + 17 / 60, 120, false, 0.1);
    },
  },
  'hit-lethal': {
    len: 2.6, run: (e, t) => {
      S.hit(e, t, { strength: 'lethal', by: 'kiln', to: 'tick', damage: 22, kb: 190, pan: 0, combo: 0 });
      S.launch(e, t + 0.5, 190, true, 0.3);
    },
  },
  'shield-hit': { len: 1.0, run: (e, t) => S.shieldHit(e, t, false, 0.7, 0) },
  'shield-perfect': { len: 1.0, run: (e, t) => S.shieldHit(e, t, true, 0.7, 0) },
  'shield-break': { len: 1.8, run: (e, t) => S.shieldBreak(e, t, 0) },
  jump: { len: 0.8, run: (e, t) => S.jump(e, t, 'gantry', false, 0) },
  'jump-air': { len: 0.8, run: (e, t) => S.jump(e, t, 'gantry', true, 0) },
  land: { len: 0.8, run: (e, t) => S.land(e, t, 'vise', false, 0) },
  'land-kiln': { len: 0.8, run: (e, t) => S.land(e, t, 'kiln', false, 0) },
  'land-tick': { len: 0.8, run: (e, t) => S.land(e, t, 'tick', false, 0) },
  dash: { len: 0.8, run: (e, t) => S.dash(e, t, 'gantry', 0) },
  swing: { len: 1.0, eventAt: 0.1, run: (e, t) => S.swing(e, t, 'gantry', 'tilt', startup('gantry', 'tilt') / 60, 0) },
  'swing-smash': { len: 1.2, run: (e, t) => S.swing(e, t, 'kiln', 'smash', startup('kiln', 'smash') / 60, 0) },
  grab: { len: 1.0, run: (e, t) => S.grab(e, t, 'vise', 0) },
  throw: { len: 1.0, run: (e, t) => S.throwSound(e, t, 'vise', 0) },
  projectile: { len: 1.0, run: (e, t) => S.projectile(e, t, 'gantry', 0) },
  ledge: { len: 0.8, run: (e, t) => S.ledge(e, t, 'vise', 0) },
  clank: { len: 0.8, run: (e, t) => S.clank(e, t, 0) },
  'ko-blast': { len: 4.4, run: (e, t) => koMoment(e, t) },
  'ko-final': { len: 4.4, run: (e, t) => koMoment(e, t, true) },
  respawn: { len: 1.5, run: (e, t) => S.respawn(e, t, 0) },
  'start-call': { len: 1.6, run: (e, t) => S.startCall(e, t) },
  countdown: {
    len: 4.6, eventAt: 0.1 + 3.08, run: (e, t) => {
      S.lockSlam(e, t + 0.11);
      for (let n = 3; n >= 1; n--) S.countBeep(e, t + 0.5 + (3 - n) + 0.07, n);
      S.startCall(e, t + 3.5 + 0.08);
    },
  },
  'plan-tick': { len: 0.6, run: (e, t) => S.planTick(e, t, 0, false) },
  'plan-order': { len: 0.6, run: (e, t) => S.planTick(e, t, 1, true) },
  'pick-reveal': { len: 1.6, run: (e, t) => S.pickReveal(e, t) },
  'pick-riser': { len: 1.6, eventAt: 0.1 + 0.8, run: (e, t) => { S.riser(e, t, 0.8); S.pickReveal(e, t + 0.8); } },
  'versus-slam': { len: 2.4, eventAt: 0.1 + 0.15, run: (e, t) => { S.versusSlam(e, t, 0.15); S.cardHit(e, t + 0.82, 0.7); S.cardHit(e, t + 1.12, 0.5); } },
  'call-open': { len: 1.8, eventAt: 0.1 + 0.17, run: (e, t) => { S.callOpen(e, t, 0.17); S.cardHit(e, t + 0.61, 0.6); } },
  'call-roster': { len: 1.4, run: (e, t) => { S.cardHit(e, t, 0.5); for (let i = 0; i < 4; i++) S.rosterLand(e, t + 0.11 + 0.15 * i, i); } },
  'ko-call': { len: 1.6, run: (e, t) => S.koCall(e, t, false) },
  taunt: { len: 0.8, run: (e, t) => S.taunt(e, t, 0) },
  'corner-talk': { len: 0.8, run: (e, t) => S.cornerTalk(e, t, 1) },
  'window-open': { len: 1.2, run: (e, t) => S.windowOpen(e, t) },
  'clock-ticks': { len: 5.2, run: (e, t) => { for (let i = 0; i < 5; i++) S.clockTick(e, t + i, i === 4); } },
  lock: { len: 1.2, run: (e, t) => S.lock(e, t) },
  'sudden-death': { len: 2.2, run: (e, t) => S.suddenDeath(e, t) },
  winner: {
    len: 3.6, run: (e, t) => {
      S.winner(e, t, 0);
      e.smp('crowd-roar', t + 0.05, { gain: 0.9, bus: 'crowd', fadeIn: 0.2, hold: 1.2, tc: 0.8, hp: 220 });
      e.smp('crowd-cheer', t + 0.3, { gain: 0.45, bus: 'crowd', fadeIn: 0.4, hold: 1.2, tc: 0.9, hp: 260, lp: 3000 });
    },
  },
  payout: { len: 1.6, eventAt: 0.1 + 0.45, run: (e, t) => { S.payoutHold(e, t, 0.45); S.payoutHit(e, t + 0.45); } },
};

/** the two crowd beds alone at the level the director gives them (excitement `x`, live or show phase) */
function crowdAt(e: Engine, t: number, x: number, live: boolean, dur: number): void {
  const cg = crowdGains(x, live, live ? 1 : 0.75);
  for (const [name, g, off] of [['crowd-bed', cg.murmur, 3], ['crowd-cheer-bed', cg.cheer, 6]] as const) {
    const b = sample(name);
    if (!b) continue;
    const src = e.ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    const gn = e.ctx.createGain();
    gn.gain.value = g;
    src.connect(gn);
    gn.connect(e.bus.crowd);
    src.start(t, off);
    src.stop(t + dur);
  }
}
JOBS['crowd-fight'] = { len: 8, run: (e, t) => crowdAt(e, t, 0.25, true, 8) };
JOBS['crowd-lull'] = { len: 8, run: (e, t) => crowdAt(e, t, 0.12, true, 8) };
JOBS['crowd-show'] = { len: 8, run: (e, t) => crowdAt(e, t, 0.05, false, 8) };
JOBS['crowd-swell'] = { len: 8, run: (e, t) => crowdAt(e, t, 0.7, true, 8) };

// the same medium and heavy hit landed by each fighter: the attacker's family colours the hit
for (const f of ['kiln', 'tick', 'gantry', 'vise'] as FighterId[]) {
  JOBS[`hit-medium-${f}`] = { len: 1.3, run: (e, t) => { S.hit(e, t, { strength: 'medium', by: f, to: 'gantry', damage: 9, kb: 70, pan: 0, combo: 0 }); } };
  JOBS[`hit-heavy-${f}`] = { len: 1.6, run: (e, t) => { S.hit(e, t, { strength: 'heavy', by: f, to: 'gantry', damage: 17, kb: 120, pan: 0, combo: 0 }); } };
}

// eight hits of a class in a row, every fighter and every round-robin pick, 1.5 s apart (3 s for
// the lethal hit): shows the ladder holds whichever recording and whichever attacker comes up
for (const k of ['light', 'medium', 'heavy', 'lethal'] as const) {
  const gap = k === 'lethal' ? 3 : 1.5;
  JOBS[`set-${k}`] = {
    len: gap * 8,
    run: (e, t) => {
      const fs: FighterId[] = ['kiln', 'tick', 'gantry', 'vise'];
      for (let i = 0; i < 8; i++) S.hit(e, t + i * gap, { strength: k, by: fs[i % 4], to: fs[(i + 1) % 4], damage: 10, kb: 80, pan: 0, combo: 0 });
    },
  };
}

// one short phrase per fighter: steps, a jump, a landing, a swing that lands, a grab
for (const f of ['kiln', 'tick', 'gantry', 'vise'] as FighterId[]) {
  JOBS[`family-${f}`] = {
    len: 3.4,
    run: (e, t) => {
      const st = S.FAMS[f].stride / 60;
      for (let i = 0; i < 4; i++) S.step(e, t + i * st, f, 0);
      S.jump(e, t + 0.9, f, false, 0);
      S.land(e, t + 1.4, f, false, 0);
      const su = startup(f, 'tilt') / 60;
      S.swing(e, t + 1.8, f, 'tilt', su, 0);
      S.hit(e, t + 1.8 + su, { strength: 'medium', by: f, to: 'gantry', damage: 9, kb: 70, pan: 0, combo: 0 });
      S.grab(e, t + 2.6, f, 0);
    },
  };
}

// ------------------------------------------------------------------------------------------------

async function renderJob(name: string): Promise<{ buf: AudioBuffer; meta: Record<string, unknown> }> {
  const j = JOBS[name];
  const lead = j.lead ?? 0.1;
  // 0.6 s past the nominal length so every tail has died before the file ends
  const ctx = new OfflineAudioContext(2, Math.ceil((j.len + 0.6 + lead) * SR), SR);
  const e = new Engine(ctx);
  j.run(e, lead);
  const buf = await ctx.startRendering();
  return { buf, meta: { lead, eventAt: j.eventAt ?? lead } };
}

async function renderMusicJob(kind: 'fight' | 'bed'): Promise<{ buf: AudioBuffer; meta: Record<string, unknown> }> {
  const loop = await music(kind, SR);
  const ctx = new OfflineAudioContext(2, Math.ceil(20 * SR), SR);
  const e = new Engine(ctx);
  const src = ctx.createBufferSource();
  src.buffer = loop;
  src.loop = true;
  if (loopEndOf(loop) > 0) src.loopEnd = loopEndOf(loop);
  const g = ctx.createGain();
  g.gain.value = musicTrim(kind);
  src.connect(g);
  g.connect(e.bus.music);
  src.start(0, 6);
  return { buf: await ctx.startRendering(), meta: { lead: 0, eventAt: 0 } };
}

/** the sounds the critic sees in pairs, each also rendered over our own bed (music and crowd) */
const PAIRED = ['hit-light', 'hit-medium', 'hit-heavy', 'hit-lethal', 'shield-hit', 'jump', 'land', 'dash', 'swing', 'grab',
  'ko-blast', 'start-call', 'plan-tick', 'pick-reveal', 'versus-slam', 'winner'];
const SHOW_SOUNDS = ['start-call', 'plan-tick', 'pick-reveal', 'versus-slam', 'winner'];

async function renderInMix(name: string): Promise<{ buf: AudioBuffer; meta: Record<string, unknown> }> {
  const j = JOBS[name];
  const lead = 0.6;
  const ctx = new OfflineAudioContext(2, Math.ceil((Math.max(1.4, j.len) + 0.6 + lead) * SR), SR);
  const e = new Engine(ctx);
  const kind = SHOW_SOUNDS.includes(name) && name !== 'plan-tick' ? 'bed' : 'fight';
  const loop = await music(kind, SR);
  const m = ctx.createBufferSource();
  m.buffer = loop;
  m.loop = true;
  if (loopEndOf(loop) > 0) m.loopEnd = loopEndOf(loop);
  const mg = ctx.createGain();
  mg.gain.value = musicTrim(kind);
  m.connect(mg);
  mg.connect(e.bus.music);
  m.start(0, 9.0);
  // the crowd at a mid-fight level, as the director sets it (murmur and the cheering bed)
  const cg = crowdGains(0.25, kind === 'fight', kind === 'fight' ? 1 : 0.75);
  for (const [name, g, off] of [['crowd-bed', cg.murmur, 3], ['crowd-cheer-bed', cg.cheer, 6]] as const) {
    const cb = sample(name);
    if (!cb) continue;
    const c = ctx.createBufferSource();
    c.buffer = cb;
    c.loop = true;
    const gn = ctx.createGain();
    gn.gain.value = g;
    c.connect(gn);
    gn.connect(e.bus.crowd);
    c.start(0, off);
  }
  const t = lead;
  // the ducks exactly as the director sets them
  if (name === 'hit-lethal') {
    e.duckBus('music', t, 0.08, 0.012, 0.1, 0.9);
    e.duckBus('crowd', t, 0.15, 0.012, 0.1, 0.6);
  } else if (name === 'hit-heavy') e.duckBus('music', t, 0.55, 0.01, 0.1, 0.5);
  else if (name === 'hit-medium') e.duckBus('music', t, 0.78, 0.01, 0.05, 0.25);
  else if (name === 'ko-blast') e.duckBus('music', t, 0.35, 0.01, 0.45, 2.0);
  j.run(e, t);
  return { buf: await ctx.startRendering(), meta: { lead, eventAt: (j.eventAt ?? 0.1) - 0.1 + lead } };
}

// ---- fight timelines from the real sim ----

interface Tick { s: FightState; ev: SimEvent[] }

function blankShow(phase: ShowState['phase']): ShowState {
  return {
    phase, phaseMs: 60_000, phaseDurationMs: 0, ctx: null, picksRevealed: true, selectRevealMs: 0,
    taunts: [null, null], tauntAt: [-1, -1], window: null, plans: [null, null], planChangedAt: [-1, -1],
    lastKo: null, cornerTalk: [null, null], result: null, highlight: null,
  };
}

const POST: PostState = { dim: 0, dimColor: '#000', flash: 0, fighterFlash: [0, 0], fighterFlashColor: ['#fff', '#fff'], coverSet: false };

/** find a fight with a knockout and keep every tick from `before` seconds ahead of it to `after` past it */
function fightAroundKo(before: number, after: number): { ticks: Tick[]; koIndex: number; fighters: [FighterId, FighterId] } {
  const fighters: [FighterId, FighterId] = ['kiln', 'gantry'];
  for (let k = 2; k < 14; k++) {
    const header = makeHeader(`ringout-sound-${k}-4f1c9a2b7e3d5c6a8b9f0e1d2c3b4a59`, fighters, { lives: 2 });
    let ko = -1;
    runFight(header, { coaches: ['adaptive', 'rush'], onTick: (s, ev) => { if (ko < 0 && ev.some((x) => x.t === 'ko')) ko = s.tick; } });
    if (ko < before * 60) continue;
    const from = ko - Math.round(before * 60);
    const to = ko + Math.round(after * 60);
    const ticks: Tick[] = [];
    runFight(header, {
      coaches: ['adaptive', 'rush'],
      onTick: (s, ev) => {
        if (s.tick >= from && s.tick <= to) ticks.push({ s: structuredClone(s), ev: ev.slice() });
      },
    });
    return { ticks, koIndex: ko - from, fighters };
  }
  throw new Error('no knockout found in 12 seeded fights');
}

function frameOf(show: ShowState, cur: Tick, prev: Tick, ev: SimEvent[], mode: FightView['mode'], speed: number, nowMs: number): Frame {
  return {
    dt: 1 / 60, now: nowMs, show, post: POST, width: 1280, height: 720,
    fight: { state: cur.s, prev: prev.s, alpha: 1, events: ev, mode, speed, ticksLeft: 5000, countdownMs: 0 },
  };
}

/**
 * The frames the stage really draws around a knockout: the fight plays live (the stage draws about
 * 0.4 s behind the show), the lethal hit holds 500 ms, the show's phase turns to 'break' when the
 * life is lost (so while the knockout is still being drawn), the knockout holds until koHold (2.6 s
 * into the break), then the replay runs the same ticks again at half speed.
 */
function showFrames(ticks: Tick[], koIndex: number, total: number): { frames: Frame[]; koFrame: number } {
  const frames: Frame[] = [];
  const ko = ticks[koIndex];
  const breakAtTick = ko.s.tick - 24;
  let breakStart = -1;
  let koFrame = -1;
  const fightShow = blankShow('fight');
  const brk = (n: number, extra: Partial<ShowState> = {}): ShowState => ({
    ...blankShow('break'), phaseMs: ((n - breakStart) * 1000) / 60,
    lastKo: { side: 1 as Side, by: 0 as Side, damage: ko.s.fighters[1].damage, edge: 'right' as const, final: false }, ...extra,
  });
  const showAt = (n: number) => (breakStart >= 0 ? brk(n) : { ...fightShow, planChangedAt: [fightShow.planChangedAt[0], fightShow.planChangedAt[1]] as [number, number] });
  for (let i = 0; i <= koIndex && frames.length < total; i++) {
    const cur = ticks[i];
    const n = frames.length;
    if (breakStart < 0 && cur.s.tick >= breakAtTick) breakStart = n;
    for (const ev of cur.ev) if (ev.t === 'plan') fightShow.planChangedAt[ev.side as Side] = (n * 1000) / 60;
    if (i === koIndex) koFrame = n;
    frames.push(frameOf(showAt(n), cur, ticks[Math.max(0, i - 1)], cur.ev, 'live', 1, (n * 1000) / 60));
    if (cur.ev.some((ev) => ev.t === 'hit' && ev.strength === 'lethal')) {
      // the lethal hold: the picture stops on the hit for 500 ms
      for (let k = 0; k < 30 && frames.length < total; k++) {
        const m = frames.length;
        if (breakStart < 0 && cur.s.tick >= breakAtTick) breakStart = m;
        frames.push(frameOf(showAt(m), cur, cur, [], 'live', 1, (m * 1000) / 60));
      }
    }
  }
  if (breakStart < 0) breakStart = frames.length;
  // the knockout holds until the replay starts
  while (frames.length < total && ((frames.length - breakStart) * 1000) / 60 < 2600) {
    const n = frames.length;
    frames.push(frameOf(brk(n), ko, ko, [], 'frozen', 1, (n * 1000) / 60));
  }
  // the replay at half speed from about 150 ticks before the knockout
  const r0 = Math.max(0, koIndex - 150);
  for (let k = r0 * 2; k <= koIndex * 2 + 1 && frames.length < total; k++) {
    const i = Math.floor(k / 2);
    const n = frames.length;
    frames.push(frameOf(brk(n), ticks[i], ticks[Math.max(0, i - 1)], k % 2 === 0 ? ticks[i].ev : [], 'replay', 0.5, (n * 1000) / 60));
  }
  while (frames.length < total) {
    const n = frames.length;
    frames.push(frameOf(brk(n, { cornerTalk: [n > total - 40 ? 'Stay low and make him come to us' : null, null] }), ko, ko, [], 'frozen', 1, (n * 1000) / 60));
  }
  return { frames, koFrame };
}

async function renderTimeline(kind: 'timeline' | 'ko-break' | 'ko-replay'): Promise<{ buf: AudioBuffer; meta: Record<string, unknown> }> {
  // assemble the frames first, then play them through the director at 60 fps
  let frames: Frame[] = [];
  let eventAt = 0;
  if (kind === 'timeline') {
    // 1.5 s of pre-roll so the music and the crowd are already running when the 20 s begins
    const { ticks, koIndex } = fightAroundKo(16.5 + PREROLL, 3);
    const r = showFrames(ticks, koIndex, Math.round((20 + PREROLL) * 60));
    frames = r.frames;
    eventAt = r.koFrame / 60;
  } else if (kind === 'ko-replay') {
    // the knockout live, the hold and the whole half-speed replay: the replayed lethal hit and
    // knockout must come back quieter and lower, with no second blast or roar at full level
    const { ticks, koIndex } = fightAroundKo(2.6 + PREROLL, 0.1);
    const r = showFrames(ticks, koIndex, 900 + Math.round(PREROLL * 60));
    frames = r.frames;
    eventAt = r.koFrame / 60;
  } else {
    const { ticks, koIndex } = fightAroundKo(2.6 + PREROLL, 0.1);
    const r = showFrames(ticks, koIndex, 600 + Math.round(PREROLL * 60));
    frames = r.frames;
    eventAt = r.koFrame / 60;
  }
  const lead = 0;
  // where the live and the replayed lethal hit and knockout land (s, after the pre-roll cut)
  const marks: Record<string, number> = {};
  frames.forEach((f, i) => {
    const mode = f.fight?.mode;
    for (const ev of f.fight?.events ?? []) {
      const key = ev.t === 'ko' ? 'ko' : ev.t === 'hit' && ev.strength === 'lethal' ? 'lethal' : null;
      if (key && mode) marks[`${mode}-${key}`] ??= Math.round((i / 60 - PREROLL) * 1000) / 1000;
    }
  });
  const len = frames.length / 60 + 0.6;
  const ctx = new OfflineAudioContext(2, Math.ceil(len * SR), SR);
  const e = new Engine(ctx);
  const dir = createDirector(e, { live: false, defs: FIGHTERS as unknown as MoveDefs });
  // the loops must be ready before rendering starts
  await music('fight', SR);
  await music('bed', SR);
  frames.forEach((f, i) => {
    void ctx.suspend(i / 60 + 0.0005).then(() => {
      dir.update(f);
      void ctx.resume();
    });
  });
  const full = await ctx.startRendering();
  const cut = Math.round(PREROLL * SR);
  const buf = new AudioBuffer({ numberOfChannels: 2, length: full.length - cut, sampleRate: SR });
  for (let c = 0; c < 2; c++) buf.getChannelData(c).set(full.getChannelData(c).subarray(cut));
  return { buf, meta: { lead, eventAt: eventAt - PREROLL, frames: frames.length, prerollS: PREROLL, marks } };
}

/**
 * A show phase through the real director at 60 fps, so the cues (the call's slams and landings,
 * LOCKED and the countdown numerals and the start call, the verdict burst and the payout freeze)
 * are heard where the screens draw them.
 */
async function renderShow(kind: 'call' | 'countdown' | 'verdict'): Promise<{ buf: AudioBuffer; meta: Record<string, unknown> }> {
  const frames: Frame[] = [];
  const secs = kind === 'call' ? 7.2 : kind === 'countdown' ? 5.4 : 4.4;
  const n = Math.round(secs * 60);
  // a frame of the phase before, so the director sees the phase begin
  const before: ShowState['phase'] = kind === 'call' ? 'idle' : kind === 'countdown' ? 'predictions' : 'break';
  frames.push({ dt: 1 / 60, now: 0, show: { ...blankShow(before), phaseMs: 9000 }, fight: null, post: POST, width: 1280, height: 720 });
  const { ticks } = fightAroundKo(0.5, 0.1);
  const t0 = ticks[0];
  const cdTotal = 3500 + 400;
  for (let i = 1; i < n; i++) {
    const ms = ((i - 1) * 1000) / 60;
    if (kind === 'call') {
      frames.push({ dt: 1 / 60, now: i * 16.7, show: { ...blankShow('call'), phaseMs: ms, phaseDurationMs: 10_000 }, fight: null, post: POST, width: 1280, height: 720 });
    } else if (kind === 'verdict') {
      const show = { ...blankShow('verdict'), phaseMs: ms, result: { winner: 0 as Side, winnerId: 'a', lives: [1, 0] as [number, number], damage: [80, 140] as [number, number], nextInMs: 20000 } };
      frames.push({ dt: 1 / 60, now: i * 16.7, show, fight: null, post: POST, width: 1280, height: 720 });
    } else {
      const cd = Math.max(0, cdTotal - ms);
      const f = frameOf({ ...blankShow('fight'), phaseMs: ms }, t0, t0, [], cd > 0 ? 'frozen' : 'live', 1, i * 16.7);
      f.fight!.countdownMs = cd;
      frames.push(f);
    }
  }
  const ctx = new OfflineAudioContext(2, Math.ceil((n / 60 + 0.8) * SR), SR);
  const e = new Engine(ctx);
  const dir = createDirector(e, { live: false, defs: FIGHTERS as unknown as MoveDefs });
  await music('fight', SR);
  await music('bed', SR);
  frames.forEach((f, i) => {
    void ctx.suspend(i / 60 + 0.0005).then(() => {
      dir.update(f);
      void ctx.resume();
    });
  });
  const buf = await ctx.startRendering();
  return { buf, meta: { lead: 1 / 60, eventAt: kind === 'countdown' ? 1 / 60 + 0.11 : kind === 'call' ? 1 / 60 + 0.17 : 1 / 60 } };
}

// ------------------------------------------------------------------------------------------------

function b64(f: Float32Array): string {
  const u8 = new Uint8Array(f.buffer, f.byteOffset, f.byteLength);
  let s = '';
  const CH = 0x8000;
  for (let i = 0; i < u8.length; i += CH) s += String.fromCharCode(...u8.subarray(i, i + CH));
  return btoa(s);
}

/**
 * The live path, end to end: the real AudioRig on a real AudioContext, unlocked, fed two seconds
 * of real frames (phase changes, hits, the knockout). Returns what went wrong, if anything.
 */
async function liveSmoke(assetsBase: string): Promise<{ ok: boolean; state: string; warnings: string[]; decodedMB?: number; bedsReadyMs?: number }> {
  const { createAudio } = await import('../audio.ts');
  const warnings: string[] = [];
  const warn = console.warn;
  console.warn = (...a: unknown[]) => { warnings.push(a.map(String).join(' ')); warn(...a); };
  try {
    const rig = createAudio({ assetsBase, fighterDefs: FIGHTERS } as unknown as Parameters<typeof createAudio>[0]);
    // the site may set the volume before any gesture: it must be remembered, not lost
    rig.setVolume(0.6);
    const t0 = performance.now();
    rig.unlock();
    let bedsReadyMs = -1;
    const poll = setInterval(() => { if (bedsReadyMs < 0 && sample('crowd-bed') && sample('crowd-cheer-bed')) bedsReadyMs = Math.round(performance.now() - t0); }, 10);
    const { ticks } = fightAroundKo(1.5, 0.5);
    const show = blankShow('versus');
    show.phaseMs = 0;
    const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
    await sleep(1500); // samples and music
    for (let i = 0; i < 20; i++) { rig.update({ dt: 1 / 60, now: i * 16, show: { ...show, phaseMs: i * 16 }, fight: null, post: POST, width: 1280, height: 720 }); await sleep(16); }
    const fs = blankShow('fight');
    fs.phaseMs = 0;
    for (let i = 0; i < ticks.length; i++) {
      rig.update(frameOf({ ...fs, phaseMs: i * 16 }, ticks[i], ticks[Math.max(0, i - 1)], ticks[i].ev, 'live', 1, 400 + i * 16));
      await sleep(8);
    }
    clearInterval(poll);
    rig.setVolume(0);
    rig.setVolume(1);
    rig.setMuted(true);
    rig.setMuted(false);
    rig.dispose();
    // the same autoplay policy applies to the rig's own context: report whether it could run
    const probe = new AudioContext();
    await probe.resume().catch(() => undefined);
    const state = probe.state;
    await probe.close();
    // decoded audio held in memory after a versus and a fight (one music bed, every sample)
    const decodedMB = Math.round((decodedBytes() / 1048576) * 10) / 10;
    return { ok: warnings.length === 0 && state === 'running', state, warnings, decodedMB, bedsReadyMs };
  } finally {
    console.warn = warn;
  }
}

export function installAudioHarness(assetsBase = '/'): void {
  const w = window as unknown as { __audio: Record<string, unknown> };
  const api = {
    ready: false,
    names: () => [...Object.keys(JOBS), ...PAIRED.map((n) => `${n}-inmix`), 'music-fight', 'music-bed', 'timeline', 'ko-break', 'ko-replay', 'show-call', 'show-countdown', 'show-verdict'],
    missing: () => missingSamples(),
    liveSmoke: () => liveSmoke(assetsBase),
    async render(name: string) {
      let r: { buf: AudioBuffer; meta: Record<string, unknown> };
      if (name === 'timeline' || name === 'ko-break' || name === 'ko-replay') r = await renderTimeline(name);
      else if (name.startsWith('show-')) r = await renderShow(name.slice(5) as 'call' | 'countdown' | 'verdict');
      else if (name === 'music-fight') r = await renderMusicJob('fight');
      else if (name === 'music-bed') r = await renderMusicJob('bed');
      else if (name.endsWith('-inmix') && JOBS[name.slice(0, -6)]) r = await renderInMix(name.slice(0, -6));
      else if (JOBS[name]) r = await renderJob(name);
      else throw new Error(`no sound named ${name}`);
      const channels = [b64(r.buf.getChannelData(0)), b64(r.buf.getChannelData(r.buf.numberOfChannels > 1 ? 1 : 0))];
      return { sampleRate: r.buf.sampleRate, channels, meta: r.meta };
    },
  };
  w.__audio = api;
  const boot = new OfflineAudioContext(1, 128, SR);
  void loadSamples(boot, assetsBase, SAMPLE_NAMES).then(async () => {
    await music('fight', SR);
    await music('bed', SR);
    api.ready = true;
    const el = document.getElementById('status');
    if (el) el.textContent = `ready: ${api.names().length} renders, missing samples: ${missingSamples().join(', ') || 'none'}`;
  });
}

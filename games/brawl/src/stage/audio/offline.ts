// Offline renders of the Blood Moon sound for measurement (harness/audio.html, tools/audio.mjs).
// Every named sound, a 20 s fight timeline driven by real sim events through the real director,
// and a 10 s mix of a knockout into the break, all through OfflineAudioContext.

import type { Frame, FightView, PostState, ShowState } from '../api.ts';
import type { FightState, FighterId, Side, SimEvent } from '../../sim/types.ts';
import { FIGHTERS, makeHeader, runFight } from '../../sim/index.ts';
import { Engine, SAMPLE_NAMES, decodedBytes, loadSamples, missingSamples, sample } from './engine.ts';
import { createDirector, nightGain, type MoveDefs } from './director.ts';
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

/** the knockout exactly as the director plays it: the bell and the candle (the big hit first on the last life) */
function koMoment(e: Engine, t: number, final = false): void {
  if (final) {
    S.stingHit(e, t);
    S.koBlast(e, t + 0.9, 0);
  } else S.koBlast(e, t, 0);
  S.koCall(e, t + (final ? 0.233 : 0.15), final);
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
  projectile: { len: 1.0, run: (e, t) => S.projectile(e, t, 'tick', 'knife', 0) },
  'bat-swarm': { len: 1.8, run: (e, t) => S.projectile(e, t, 'gantry', 'bat', 0) },
  'mist-step': { len: 1.4, run: (e, t) => S.mist(e, t, 9 / 60, 0) },
  pounce: { len: 1.6, run: (e, t) => S.pounce(e, t, 'vise', true, 0) },
  'howl-full': { len: 3.0, run: (e, t) => S.howl(e, t, true, 0) },
  'howl-short': { len: 1.6, run: (e, t) => S.howl(e, t, false, 0) },
  'hit-claw': { len: 1.2, run: (e, t) => { S.hit(e, t, { strength: 'medium', by: 'vise', to: 'gantry', damage: 9, kb: 70, pan: 0, combo: 0, move: 'tilt' }); } },
  'hit-bite': { len: 1.2, run: (e, t) => { S.hit(e, t, { strength: 'medium', by: 'vise', to: 'gantry', damage: 9, kb: 70, pan: 0, combo: 0, move: 'jab' }); } },
  'n-flame': { len: 1.8, run: (e, t) => S.projectile(e, t, 'kiln', 'flame', 0) },
  'n-hex': { len: 1.2, run: (e, t) => S.projectile(e, t, 'hexer', 'hex', 0) },
  'n-knives': { len: 0.8, run: (e, t) => S.projectile(e, t, 'tick', 'knife', 0) },
  'n-tongue': { len: 0.8, run: (e, t) => S.projectile(e, t, 'mimic', 'tongue', 0) },
  'n-tongue-drag': { len: 0.8, run: (e, t) => S.tongueDrag(e, t, 0) },
  'n-fire-breath': { len: 1.0, run: (e, t) => S.fireBreath(e, t, 0) },
  'n-fall-apart': { len: 1.4, run: (e, t) => S.recover(e, t, 'kiln', 0) },
  'n-updraft': { len: 1.0, run: (e, t) => S.recover(e, t, 'tick', 0) },
  'n-crows': { len: 1.0, run: (e, t) => S.recover(e, t, 'hexer', 0) },
  'n-coin-burst': { len: 1.4, run: (e, t) => S.recover(e, t, 'mimic', 0) },
  'n-snatch': { len: 1.0, run: (e, t) => { S.feathers(e, t, false, 0); S.feathers(e, t + 0.15, true, 0); } },
  'n-ward-placed': { len: 0.6, run: (e, t) => S.wardPlaced(e, t, 0) },
  'n-ward-snap': { len: 0.8, run: (e, t) => S.wardSnap(e, t, 0) },
  'n-swallow-spit': { len: 1.4, run: (e, t) => { S.swallow(e, t, 0); S.spit(e, t + 0.5, 0); } },
  'n-swing-blade': { len: 0.8, run: (e, t) => S.swing(e, t, 'kiln', 'smash', 0.25, 0) },
  'n-swing-knife': { len: 0.6, run: (e, t) => S.swing(e, t, 'tick', 'tilt', 0.1, 0) },
  'n-swing-staff': { len: 0.6, run: (e, t) => S.swing(e, t, 'hexer', 'tilt', 0.12, 0) },
  'n-steps-kiln': { len: 1.4, run: (e, t) => { for (let i = 0; i < 4; i++) S.step(e, t + i * 0.3, 'kiln', 0); S.land(e, t + 1.2, 'kiln', false, 0); } },
  'n-steps-mimic': { len: 1.4, run: (e, t) => { for (let i = 0; i < 4; i++) S.step(e, t + i * 0.22, 'mimic', 0); S.land(e, t + 1.0, 'mimic', false, 0); } },
  'n-steps-tick': { len: 1.0, run: (e, t) => { for (let i = 0; i < 4; i++) S.step(e, t + i * 0.15, 'tick', 0); } },
  'n-hit-on-kiln': { len: 1.0, run: (e, t) => { S.hit(e, t, { strength: 'medium', by: 'tick', to: 'kiln', damage: 9, kb: 70, pan: 0, combo: 0, move: 'tilt' }); } },
  'n-hit-on-mimic': { len: 1.0, run: (e, t) => { S.hit(e, t, { strength: 'medium', by: 'hexer', to: 'mimic', damage: 9, kb: 70, pan: 0, combo: 0, move: 'tilt' }); } },
  'n-lid-bite': { len: 1.0, run: (e, t) => { S.hit(e, t, { strength: 'medium', by: 'mimic', to: 'hexer', damage: 9, kb: 70, pan: 0, combo: 0, move: 'jab' }); } },
  'win-voices': { len: 6.5, run: (e, t) => { S.winVoice(e, t, 'tick', 0); S.winVoice(e, t + 2.2, 'hexer', 0); S.winVoice(e, t + 3.8, 'mimic', 0); } },
  'sting-finale': { len: 10.8, run: (e, t) => { S.stingFinale(e, t); } },
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
    len: 10.8, run: (e, t) => {
      S.winner(e, t, 0);
      S.stingFinale(e, t + 0.05);
    },
  },
  payout: { len: 1.6, eventAt: 0.1 + 0.45, run: (e, t) => { S.payoutHold(e, t, 0.45); S.payoutHit(e, t + 0.45); } },
};

/** the night wind alone at the level the director gives it in the fight */
function nightAt(e: Engine, t: number, dur: number): void {
  const b = sample('night-bed');
  if (!b) return;
  const src = e.ctx.createBufferSource();
  src.buffer = b;
  src.loop = true;
  src.loopEnd = Math.min(20, b.duration);
  const gn = e.ctx.createGain();
  gn.gain.value = nightGain('fight');
  src.connect(gn);
  gn.connect(e.bus.crowd);
  src.start(t, 3);
  src.stop(t + dur);
}
JOBS['night'] = { len: 8, run: (e, t) => nightAt(e, t, 8) };

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

async function renderMusicJob(kind: 'fight' | 'bed' | 'theme'): Promise<{ buf: AudioBuffer; meta: Record<string, unknown> }> {
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
  'ko-blast', 'start-call', 'plan-tick', 'pick-reveal', 'versus-slam', 'winner', 'bat-swarm', 'mist-step', 'pounce', 'howl-full', 'hit-claw', 'hit-bite'];
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
  // the night under the fight, as the director sets it
  if (kind === 'fight') nightAt(e, 0, ctx.length / SR);
  const t = lead;
  // the ducks exactly as the director sets them
  if (name === 'hit-lethal') {
    e.duckBus('music', t, 0.1, 0.012, 0.1, 0.9);
    e.duckBus('crowd', t, 0.2, 0.012, 0.1, 0.6);
  } else if (name === 'hit-heavy') e.duckBus('music', t, 0.7, 0.01, 0.08, 0.45);
  else if (name === 'ko-blast') e.duckBus('music', t, 0.4, 0.01, 0.6, 2.0);
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
  const fighters: [FighterId, FighterId] = ['gantry', 'vise'];
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
// The preview for ears: a little of the select music, a real stretch of the Count against the Wolf
// with a bat swarm, a pounce and a howl, the knockout that ends it, then the verdict and its strings.
// ------------------------------------------------------------------------------------------------

type SimMod = { makeHeader: typeof makeHeader; runFight: typeof runFight; FIGHTERS: typeof FIGHTERS };

/** the newest sim that is there (src/sim2 while it is being finished, else src/sim) */
async function newestSim(): Promise<{ mod: SimMod; name: string }> {
  const path = '/src/sim2/index.ts';
  try {
    const mod = (await import(/* @vite-ignore */ path)) as SimMod;
    if (typeof (mod as { runFight?: unknown } | null)?.runFight === 'function') return { mod, name: 'src/sim2' };
  } catch {
    /* not there: the promoted sim has the abilities */
  }
  return { mod: { makeHeader, runFight, FIGHTERS }, name: 'src/sim' };
}

async function renderPreview(): Promise<{ buf: AudioBuffer; meta: Record<string, unknown> }> {
  const { mod, name } = await newestSim();
  const fighters: [FighterId, FighterId] = ['gantry', 'vise'];
  const WINDOW = 44; // seconds of fight before the knockout
  const has = (ev: SimEvent[], f: (x: SimEvent) => boolean) => ev.some(f);
  let pick: { ticks: Tick[]; ko: number; winner: Side; seed: string } | null = null;
  for (let k = 0; k < 60 && !pick; k++) {
    const seed = `blood-moon-preview-${k}-7d1e2a9c4b6f8e0d1c3a5b7e9f2d4c6a`;
    const header = mod.makeHeader(seed, fighters, { lives: 1 });
    let ko = -1;
    let koSide: Side = 0;
    const all: SimEvent[][] = [];
    mod.runFight(header, { coaches: ['adaptive', 'rush'], onTick: (st, ev) => { all[st.tick] = ev.slice(); if (ko < 0) { const e2 = ev.find((x) => x.t === 'ko'); if (e2 && e2.t === 'ko') { ko = st.tick; koSide = e2.side; } } } });
    if (ko < WINDOW * 60) continue;
    const from = ko - WINDOW * 60;
    const win = all.slice(from, ko + 1).flat();
    const bat = has(win, (x) => x.t === 'projectile' && x.kind === 'bat');
    const pounce = has(win, (x) => x.t === 'move' && x.side === 1 && x.move === 'special');
    const howl = has(win, (x) => x.t === 'move' && x.side === 1 && x.move === 'special2');
    if (!bat || !pounce || !howl) continue;
    const ticks: Tick[] = [];
    mod.runFight(header, { coaches: ['adaptive', 'rush'], onTick: (st, ev) => { if (st.tick >= from && st.tick <= ko + 1) ticks.push({ s: structuredClone(st), ev: ev.slice() }); } });
    pick = { ticks, ko: ko - from, winner: (1 - koSide) as Side, seed };
  }
  if (!pick) throw new Error(`no fight in ${name} with a bat swarm, a pounce and a howl before its knockout`);
  const ctxPicks = { picks: fighters } as unknown as ShowState['ctx'];
  const frames: Frame[] = [];
  const at = () => (frames.length * 1000) / 60;
  const marks: Record<string, number> = {};
  // a frame of idle, then 8 s of the select screen (the picks flip at 5 s)
  frames.push({ dt: 1 / 60, now: 0, show: { ...blankShow('idle'), phaseMs: 9000 }, fight: null, post: POST, width: 1280, height: 720 });
  marks.select = at() / 1000;
  for (let i = 0; i < 8 * 60; i++) {
    const ms = (i * 1000) / 60;
    frames.push({ dt: 1 / 60, now: at(), show: { ...blankShow('select'), ctx: ctxPicks, phaseMs: ms, phaseDurationMs: 8000, picksRevealed: ms >= 5000, selectRevealMs: 5000 }, fight: null, post: POST, width: 1280, height: 720 });
  }
  // the fight: LOCKED, 3, 2, 1, then the real ticks
  marks.fight = at() / 1000;
  const t0 = pick.ticks[0];
  const cdTotal = 3900;
  let ms = 0;
  for (; ms < cdTotal; ms += 1000 / 60) {
    const f = frameOf({ ...blankShow('fight'), ctx: ctxPicks, phaseMs: ms }, t0, t0, [], 'frozen', 1, at());
    f.fight!.countdownMs = Math.max(0, cdTotal - ms);
    frames.push(f);
  }
  for (let i = 0; i < pick.ticks.length; i++) {
    const cur = pick.ticks[i];
    for (const ev of cur.ev) {
      const key = ev.t === 'projectile' && ev.kind === 'bat' ? 'bats' : ev.t === 'move' && ev.side === 1 && ev.move === 'special' ? 'pounce'
        : ev.t === 'move' && ev.side === 1 && ev.move === 'special2' ? 'howl' : ev.t === 'ko' ? 'ko' : ev.t === 'hit' && ev.strength === 'lethal' ? 'lethal' : null;
      if (key) marks[key] ??= Math.round(at()) / 1000;
    }
    ms += 1000 / 60;
    frames.push(frameOf({ ...blankShow('fight'), ctx: ctxPicks, phaseMs: ms }, cur, pick.ticks[Math.max(0, i - 1)], cur.ev, 'live', 1, at()));
    if (cur.ev.some((ev) => ev.t === 'hit' && ev.strength === 'lethal')) {
      for (let k = 0; k < 30; k++) { ms += 1000 / 60; frames.push(frameOf({ ...blankShow('fight'), ctx: ctxPicks, phaseMs: ms }, cur, cur, [], 'live', 1, at())); }
    }
  }
  // the knockout holds 3 s, then the verdict
  const last = pick.ticks[pick.ticks.length - 1];
  for (let i = 0; i < 3 * 60; i++) frames.push(frameOf({ ...blankShow('break'), ctx: ctxPicks, phaseMs: (i * 1000) / 60 }, last, last, [], 'frozen', 1, at()));
  marks.verdict = at() / 1000;
  for (let i = 0; i < 13 * 60; i++) {
    const show = { ...blankShow('verdict'), ctx: ctxPicks, phaseMs: (i * 1000) / 60, result: { winner: pick.winner, winnerId: 'a', lives: [1, 0] as [number, number], damage: [80, 140] as [number, number], nextInMs: 20000 } };
    frames.push({ dt: 1 / 60, now: at(), show, fight: null, post: POST, width: 1280, height: 720 });
  }
  const ctx = new OfflineAudioContext(2, Math.ceil((frames.length / 60 + 0.5) * SR), SR);
  const e = new Engine(ctx);
  const dir = createDirector(e, { live: false, defs: mod.FIGHTERS as unknown as MoveDefs });
  await music('fight', SR);
  await music('bed', SR);
  frames.forEach((f, i) => {
    void ctx.suspend(i / 60 + 0.0005).then(() => {
      dir.update(f);
      void ctx.resume();
    });
  });
  const buf = await ctx.startRendering();
  return { buf, meta: { lead: 0, eventAt: 0, sim: name, seed: pick.seed, winner: pick.winner === 0 ? 'the Count' : 'the Wolf', marks } };
}

// ------------------------------------------------------------------------------------------------
// The second preview: the new four. Two real stretches, the Armour against the Magpie and the Hexer
// against the Mimic, each the window of its fight that holds the most of the new abilities.
// ------------------------------------------------------------------------------------------------

type Want = [string, (x: SimEvent) => boolean];
const ABILITIES: Record<string, Want[]> = {
  'kiln-tick': [
    ['Grave Cleave (flame)', (x) => x.t === 'projectile' && x.side === 0 && x.kind === 'flame'],
    ['Collar Fire', (x) => x.t === 'move' && x.side === 0 && x.move === 'special2'],
    ['Fall Apart', (x) => x.t === 'move' && x.side === 0 && x.move === 'recover'],
    ['Feather Knives', (x) => x.t === 'projectile' && x.side === 1 && x.kind === 'knife'],
    ['Snatch', (x) => x.t === 'blink' && x.side === 1],
    ['Updraft', (x) => x.t === 'move' && x.side === 1 && x.move === 'recover'],
  ],
  'hexer-mimic': [
    ['Hex Bolt', (x) => x.t === 'projectile' && x.side === 0 && x.kind === 'hex'],
    ['Ward placed', (x) => x.t === 'hazard' && x.side === 0 && x.state === 'placed'],
    ['Ward catches', (x) => (x.t === 'hazard' && x.side === 0 && x.state === 'sprung') || (x.t === 'snare' && x.by === 0)],
    ['Crow Flight', (x) => x.t === 'move' && x.side === 0 && x.move === 'recover'],
    ['Tongue Lash', (x) => x.t === 'projectile' && x.side === 1 && x.kind === 'tongue'],
    ['Tongue catch', (x) => x.t === 'pull' && x.by === 1],
    ['Swallow and Spit', (x) => x.t === 'throw' && x.by === 1 && x.move === 'special2'],
    ['Coin Burst', (x) => x.t === 'move' && x.side === 1 && x.move === 'recover'],
  ],
};

function bestWindow(mod: SimMod, fighters: [FighterId, FighterId], wants: Want[], secs: number): { ticks: Tick[]; seed: string; got: string[] } {
  const W = secs * 60;
  let best: { seed: string; from: number; got: string[] } | null = null;
  for (let k = 0; k < 40; k++) {
    const seed = `blood-moon-four-${fighters.join('-')}-${k}-3c5e7a9b1d2f4e6a8c0b`;
    const header = mod.makeHeader(seed, fighters, { lives: 2 });
    const evs: SimEvent[][] = [];
    mod.runFight(header, { coaches: ['adaptive', 'rush'], onTick: (st, ev) => { evs[st.tick] = ev.slice(); } });
    for (let from = 0; from + W < evs.length; from += 60) {
      const got: string[] = [];
      for (const [name, f] of wants) {
        for (let i = from; i < from + W && !got.includes(name); i++) if (evs[i]?.some(f)) got.push(name);
      }
      if (!best || got.length > best.got.length) best = { seed, from, got };
    }
    if (best && best.got.length === wants.length) break;
  }
  const b = best!;
  const ticks: Tick[] = [];
  mod.runFight(mod.makeHeader(b.seed, fighters, { lives: 2 }), { coaches: ['adaptive', 'rush'], onTick: (st, ev) => { if (st.tick >= b.from && st.tick < b.from + W) ticks.push({ s: structuredClone(st), ev: ev.slice() }); } });
  return { ticks, seed: b.seed, got: b.got };
}

async function renderPreviewFour(): Promise<{ buf: AudioBuffer; meta: Record<string, unknown> }> {
  const { mod, name } = await newestSim();
  const frames: Frame[] = [];
  const at = () => Math.round((frames.length * 1000) / 60) / 1000;
  const marks: Record<string, number[]> = {};
  const stretches: Record<string, unknown>[] = [];
  frames.push({ dt: 1 / 60, now: 0, show: { ...blankShow('predictions'), phaseMs: 9000 }, fight: null, post: POST, width: 1280, height: 720 });
  let ms = 0;
  for (const [key, fighters] of [['kiln-tick', ['kiln', 'tick']], ['hexer-mimic', ['hexer', 'mimic']]] as [string, [FighterId, FighterId]][]) {
    const wants = ABILITIES[key];
    const w = bestWindow(mod, fighters, wants, 27);
    stretches.push({ pair: key, seed: w.seed, from_s: at(), covered: w.got, missing: wants.map((x) => x[0]).filter((n) => !w.got.includes(n)) });
    const ctxPicks = { picks: fighters } as unknown as ShowState['ctx'];
    for (let i = 0; i < w.ticks.length; i++) {
      const cur = w.ticks[i];
      for (const ev of cur.ev) for (const [n, f] of wants) if (f(ev)) (marks[n] ??= []).push(at());
      ms += 1000 / 60;
      frames.push(frameOf({ ...blankShow('fight'), ctx: ctxPicks, phaseMs: ms }, cur, w.ticks[Math.max(0, i - 1)], cur.ev, 'live', 1, at() * 1000));
    }
    // a short held breath between the two stretches
    const last = w.ticks[w.ticks.length - 1];
    for (let i = 0; i < 60; i++) { ms += 1000 / 60; frames.push(frameOf({ ...blankShow('fight'), ctx: ctxPicks, phaseMs: ms }, last, last, [], 'frozen', 1, at() * 1000)); }
  }
  const ctx = new OfflineAudioContext(2, Math.ceil((frames.length / 60 + 0.8) * SR), SR);
  const e = new Engine(ctx);
  const dir = createDirector(e, { live: false, defs: mod.FIGHTERS as unknown as MoveDefs });
  await music('fight', SR);
  await music('bed', SR);
  frames.forEach((f, i) => {
    void ctx.suspend(i / 60 + 0.0005).then(() => {
      dir.update(f);
      void ctx.resume();
    });
  });
  const buf = await ctx.startRendering();
  return { buf, meta: { lead: 0, eventAt: 0, sim: name, stretches, marks } };
}

// ------------------------------------------------------------------------------------------------
// The third preview: the theme. The call, the select (shortened: the picks flip at 10 s, five
// stage strikes, 30 s in all), the versus (10 s), the last 5 s of predictions, the countdown and the
// first 12 s of the fight, so the theme and its hand-over to the fight loop are heard.
// ------------------------------------------------------------------------------------------------

async function renderPreviewTheme(): Promise<{ buf: AudioBuffer; meta: Record<string, unknown> }> {
  const { mod, name } = await newestSim();
  const fighters: [FighterId, FighterId] = ['gantry', 'vise'];
  const strikes = [{ by: 0, stage: 'belfry' }, { by: 1, stage: 'ship' }, { by: 0, stage: 'crypt' }, { by: 1, stage: 'bridge' }, { by: 0, stage: 'mill' }];
  const ctxAll = { picks: fighters, strikes, stage: 'hill' } as unknown as ShowState['ctx'];
  const frames: Frame[] = [];
  const at = () => Math.round((frames.length * 1000) / 60) / 1000;
  const marks: Record<string, number> = {};
  const phase = (ph: ShowState['phase'], secs: number, extra: (ms: number) => Partial<ShowState>, from = 0) => {
    marks[ph] = at();
    for (let i = 0; i < Math.round(secs * 60); i++) {
      const ms = from + (i * 1000) / 60;
      frames.push({ dt: 1 / 60, now: at() * 1000, show: { ...blankShow(ph), ctx: ctxAll, phaseMs: ms, ...extra(ms) }, fight: null, post: POST, width: 1280, height: 720 });
    }
  };
  frames.push({ dt: 1 / 60, now: 0, show: { ...blankShow('idle'), phaseMs: 9000 }, fight: null, post: POST, width: 1280, height: 720 });
  phase('call', 10, () => ({ phaseDurationMs: 10_000 }));
  phase('select', 30, (ms) => ({ phaseDurationMs: 30_000, selectRevealMs: 10_000, picksRevealed: ms >= 10_000 }));
  const R = 10_000, first = R + 3700, last = 30_000 - 3000;
  strikes.forEach((_, i) => { marks[`strike ${i + 1}`] = marks.select + (first + (i * (last - first)) / (strikes.length - 1)) / 1000; });
  marks['pick reveal'] = marks.select + R / 1000;
  phase('versus', 10, () => ({ phaseDurationMs: 16_000 }));
  phase('predictions', 5, () => ({ phaseDurationMs: 30_000 }), 25_000);
  // the countdown and the first 12 s of a real fight
  const ticks: Tick[] = [];
  mod.runFight(mod.makeHeader('blood-moon-theme-preview-5e2c8a1f', fighters, { lives: 2 }), { coaches: ['adaptive', 'rush'], onTick: (st, ev) => { if (st.tick < 12 * 60) ticks.push({ s: structuredClone(st), ev: ev.slice() }); } });
  marks.fight = at();
  const cdTotal = 3900;
  let ms = 0;
  for (; ms < cdTotal; ms += 1000 / 60) {
    const f = frameOf({ ...blankShow('fight'), ctx: ctxAll, phaseMs: ms }, ticks[0], ticks[0], [], 'frozen', 1, at() * 1000);
    f.fight!.countdownMs = Math.max(0, cdTotal - ms);
    frames.push(f);
  }
  marks['first tick'] = at();
  for (let i = 0; i < ticks.length; i++) {
    ms += 1000 / 60;
    frames.push(frameOf({ ...blankShow('fight'), ctx: ctxAll, phaseMs: ms }, ticks[i], ticks[Math.max(0, i - 1)], ticks[i].ev, 'live', 1, at() * 1000));
  }
  const ctx = new OfflineAudioContext(2, Math.ceil((frames.length / 60 + 0.8) * SR), SR);
  const e = new Engine(ctx);
  const dir = createDirector(e, { live: false, defs: mod.FIGHTERS as unknown as MoveDefs });
  await music('fight', SR);
  await music('theme', SR);
  frames.forEach((f, i) => {
    void ctx.suspend(i / 60 + 0.0005).then(() => {
      dir.update(f);
      void ctx.resume();
    });
  });
  const buf = await ctx.startRendering();
  return { buf, meta: { lead: 0, eventAt: 0, sim: name, marks } };
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
    const poll = setInterval(() => { if (bedsReadyMs < 0 && sample('night-bed')) bedsReadyMs = Math.round(performance.now() - t0); }, 10);
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
    names: () => [...Object.keys(JOBS), ...PAIRED.map((n) => `${n}-inmix`), 'music-fight', 'music-bed', 'timeline', 'ko-break', 'ko-replay', 'show-call', 'show-countdown', 'show-verdict', 'preview', 'preview-four', 'preview-theme', 'music-theme'],
    missing: () => missingSamples(),
    liveSmoke: () => liveSmoke(assetsBase),
    async render(name: string) {
      let r: { buf: AudioBuffer; meta: Record<string, unknown> };
      if (name === 'preview') r = await renderPreview();
      else if (name === 'preview-four') r = await renderPreviewFour();
      else if (name === 'preview-theme') r = await renderPreviewTheme();
      else if (name === 'music-theme') r = await renderMusicJob('theme');
      else if (name === 'timeline' || name === 'ko-break' || name === 'ko-replay') r = await renderTimeline(name);
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

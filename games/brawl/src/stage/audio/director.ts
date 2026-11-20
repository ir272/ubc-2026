// Ringout sound director: turns each Frame into sounds. Reads only frame.fight.events, the fight
// state (for footsteps and the launch after the hit pause) and frame.show changes. The same code
// runs live (audio.ts) and offline (offline.ts renders the measured captures through it).
//
// Show hooks: the screens pose themselves from phaseMs, so the director keeps the same clock. Each
// phase has a list of cues (ms into the phase, a sound) taken from the screens' own timings (call.ts,
// versus.ts, predictions.ts, verdict.ts, ko/call.ts); a cue plays once, scheduled a little ahead on
// the audio clock so it lands on the frame its slam lands. A viewer who joins mid-phase hears only
// the cues still to come.

import type { Frame, ShowState } from '../api.ts';
import type { FighterId, FighterState, Side, SimEvent } from '../../sim/types.ts';
import { sample, type Engine } from './engine.ts';
import { loopEndOf, music, musicTrim, releaseMusic } from './music.ts';
import * as S from './sounds.ts';

const TICK_S = 1 / 60;
/**
 * ms after life_lost when the break hands the fight music to the calmer bed: the end of the replay
 * (TIMING: replay at 2600 for 7 s, then the corner talk and the window). The knockout, the hold and
 * the replay keep the fight's energy; there is no drop into a quiet bed straight after the blast.
 */
const KO_HOLD_MS = 9600;
/** how far ahead of the frame a cue may be scheduled (ms) */
const CUE_LOOKAHEAD = 70;

/**
 * The two crowd beds' gains for an excitement x (0..1), in the fight (or the break) or between
 * phases (`live` false), or silent (`base` 0, idle). Measured (tools/audio.mjs, crowd-*.wav):
 * the room sits about 7 dB under the fight music in a normal exchange, swells to the music's level
 * when the excitement is up, and murmurs about 9 dB under the calmer bed between phases.
 */
export function crowdGains(x: number, live: boolean, base = 1): { murmur: number; cheer: number } {
  return {
    murmur: base * Math.pow(10, -2.6 / 20),
    cheer: (live ? 1 : 0.4) * base * Math.pow(10, (-30 + 18 * x) / 20) * 5.6,
  };
}

export interface Director {
  update(frame: Frame): void;
  /** stop music and loops */
  stop(): void;
}

interface Loop {
  src: AudioBufferSourceNode;
  gain: GainNode;
  kind: string;
}

interface Cue {
  at: number;
  play(t: number): void;
}

export type MoveDefs = Partial<Record<FighterId, { moves: Record<string, { startup: number }> }>>;

/** the music steps back under a show slam and comes straight back */
function dip(e: Engine, t: number, level = 0.55, hold = 0.12, release = 0.5): void {
  e.duckBus('music', t, level, 0.01, hold, release);
}

/** the cues of a phase, from the screens' timelines */
function phaseCues(e: Engine, s: ShowState): Cue[] {
  switch (s.phase) {
    case 'call': {
      // call.ts: the mark locks at 170, the number lands at 610, hard cut 2300, red band 2500,
      // blue band 2680, cut to the roster 6000, robots land at 6110 + 150 i, the stinger at the end
      const end = s.phaseDurationMs > 0 ? s.phaseDurationMs : 10_000;
      const cues: Cue[] = [
        { at: 0, play: (t) => { S.callOpen(e, t, 0.17); dip(e, t + 0.17, 0.4, 0.3, 0.8); } },
        { at: 610, play: (t) => { S.cardHit(e, t, 0.6); dip(e, t, 0.7); } },
        { at: 2300, play: (t) => { S.cardHit(e, t, 0.45); dip(e, t, 0.6, 0.05, 0.3); } },
        { at: 2500, play: (t) => { S.cardHit(e, t, 0.9, -0.6); dip(e, t, 0.55, 0.3, 0.5); } },
        { at: 2680, play: (t) => S.cardHit(e, t, 0.9, 0.6) },
        { at: 6000, play: (t) => { S.cardHit(e, t, 0.5); dip(e, t, 0.5, 0.6, 0.6); } },
        { at: end - 240, play: (t) => S.sting(e, t) },
      ];
      for (let i = 0; i < 4; i++) cues.push({ at: 6110 + 150 * i, play: (t) => S.rosterLand(e, t, i) });
      return cues;
    }
    case 'select':
      return [{ at: 0, play: (t) => S.windowOpen(e, t) }];
    case 'versus':
      // versus.ts: the halves slam at 150, the flash at 820, the mark at 1120
      return [
        { at: 0, play: (t) => { S.versusSlam(e, t, 0.15); dip(e, t + 0.15, 0.4, 0.3, 0.9); } },
        { at: 820, play: (t) => S.cardHit(e, t, 0.7) },
        { at: 1120, play: (t) => S.cardHit(e, t, 0.5) },
      ];
    case 'predictions':
      // predictions.ts: the title slams at 150
      return [
        { at: 150, play: (t) => { S.wordSlam(e, t, 0.9); dip(e, t, 0.5, 0.2, 0.6); } },
        { at: 170, play: (t) => S.windowOpen(e, t) },
      ];
    case 'verdict': {
      // verdict.ts: the burst at 0, WINS at 220, the payout freeze 1500 to 1950 and its hit,
      // the hard cut to the results at 3400
      const side = s.result?.winner ?? 0;
      return [
        { at: 0, play: (t) => { S.winner(e, t, side); dip(e, t, 0.45, 0.4, 0.8); } },
        { at: 220, play: (t) => S.cardHit(e, t, 0.6, side === 0 ? -0.3 : 0.3) },
        // the freeze: the music and the room drop away under a held tone, the hit brings them back
        {
          at: 1500, play: (t) => {
            S.payoutHold(e, t, 0.45);
            e.duckBus('music', t, 0.2, 0.06, 0.39, 0.25);
            e.duckBus('crowd', t, 0.35, 0.06, 0.39, 0.25);
          },
        },
        { at: 1950, play: (t) => S.payoutHit(e, t) },
        { at: 3400, play: (t) => S.cardHit(e, t, 0.6) },
      ];
    }
    default:
      return [];
  }
}

export function createDirector(e: Engine, opts: { live: boolean; defs?: MoveDefs } = { live: true }): Director {
  const defs = opts.defs ?? null;
  // ---- change tracking (kept up to date even when nothing can play) ----
  let phase: string = 'idle';
  let picksRevealed = false;
  let riserDone = false;
  let tauntAt: [number, number] = [-1, -1];
  let planAt: [number, number] = [-1, -1];
  let corner: [string | null, string | null] = [null, null];
  let winState: string | null = null;
  let winId: string | null = null;
  let lastClockSec = -1;
  let countStage = -1;
  let lastTick = -1;
  let cues: Cue[] = [];
  /** cues at or before this phaseMs have been played (or skipped by a late join) */
  let cueHorizon = 0;
  /** the break: true once the bed has taken over from the fight music */
  let breakBed = false;
  let lockSlamDone = false;
  let crowdVerdict = false;
  const lastStep: [number, number] = [-999, -999];
  const pendingLaunch: ({ kb: number; lethal: boolean; armedAt: number; tick: number } | null)[] = [null, null];
  /** 0..1 crowd excitement: hits push it up, quiet lets it fall */
  let excite = 0.15;
  let lastExciteT = 0;
  let crowd: Loop | null = null;
  let cheer: Loop | null = null;
  let mus: Loop | null = null;
  let wantMusic: 'fight' | 'bed' | null = null;
  let musicLoading: string | null = null;
  let stopped = false;
  /** true when the current phase began while we watched (not a late join) */
  let watched = false;
  let synced = false;

  const now = () => e.ctx.currentTime;
  const panOf = (x: number) => Math.max(-0.8, Math.min(0.8, x / 14));
  const fighterOf = (frame: Frame, side: Side): FighterId =>
    frame.fight?.state.fighters[side].fighter ?? frame.show.ctx?.picks?.[side] ?? 'kiln';

  // ---- loops ----
  // two recorded crowd beds: a murmur under everything and a cheering crowd whose level follows
  // the excitement (hits swell it, a knockout throws it up, quiet lets it fall back)
  const CROWD_LEN: Record<string, number> = { 'crowd-bed': 17.0, 'crowd-cheer-bed': 25.0 };
  function loopOf(name: string, t: number, offset: number): Loop | null {
    const b = sample(name);
    if (!b) return null;
    const src = e.ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    const le = CROWD_LEN[name];
    if (le && le < b.duration) src.loopEnd = le;
    const g = e.ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(g);
    g.connect(e.bus.crowd);
    src.start(t, offset % (le ?? b.duration));
    return { src, gain: g, kind: name };
  }

  function startCrowd(t: number): void {
    if (!crowd) crowd = loopOf('crowd-bed', t, opts.live ? t * 7.3 : 3);
    if (!cheer) cheer = loopOf('crowd-cheer-bed', t, opts.live ? t * 5.1 : 6);
  }

  function setCrowd(t: number, murmur: number, roar: number, tc: number): void {
    crowd?.gain.gain.setTargetAtTime(Math.max(0.0001, murmur), t, 0.5);
    cheer?.gain.gain.setTargetAtTime(Math.max(0.0001, roar), t, tc);
  }

  function startMusic(kind: 'fight' | 'bed', t: number, fade = 0.6): void {
    wantMusic = kind;
    if (mus && mus.kind === kind) return;
    if (musicLoading === kind) return;
    musicLoading = kind;
    music(kind, e.ctx.sampleRate).then((buf) => {
      musicLoading = null;
      if (stopped || wantMusic !== kind) return;
      const at = Math.max(now(), t);
      if (mus) {
        const old = mus;
        old.gain.gain.cancelScheduledValues(at);
        old.gain.gain.setValueAtTime(old.gain.gain.value, at);
        old.gain.gain.setTargetAtTime(0, at, fade / 3);
        old.src.stop(at + fade * 4 + 0.05);
        // only one bed is held in memory: let the outgoing one go once it is silent
        if (opts.live) {
          const k = old.kind as 'fight' | 'bed';
          old.src.onended = () => { if (wantMusic !== k) releaseMusic(k); };
        }
      }
      const src = e.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const le = loopEndOf(buf);
      if (le > 0) src.loopEnd = le;
      const g = e.ctx.createGain();
      // a smooth rise (no hole between the outgoing and incoming loop, no step when it starts)
      g.gain.setValueAtTime(0, at);
      g.gain.setTargetAtTime(musicTrim(kind), at, fade / 3);
      src.connect(g);
      g.connect(e.bus.music);
      // the fight loop starts on its downbeat; the bed picks up somewhere new each time
      src.start(at, kind === 'bed' && opts.live ? (at * 13.7) % 60 : 0);
      mus = { src, gain: g, kind };
    }).catch(() => { musicLoading = null; });
  }

  function stopMusic(t: number, fade: number): void {
    wantMusic = null;
    if (!mus) return;
    const m = mus;
    mus = null;
    m.gain.gain.cancelScheduledValues(t);
    m.gain.gain.setValueAtTime(m.gain.gain.value, t);
    m.gain.gain.linearRampToValueAtTime(0.0001, t + fade);
    m.src.stop(t + fade + 0.05);
  }

  function bump(amount: number): void {
    excite = Math.min(1, excite + amount);
  }

  // ---- fight events ----
  function onEvent(frame: Frame, ev: SimEvent, t: number): void {
    const st = frame.fight!.state;
    const side = (s: Side) => st.fighters[s];
    switch (ev.t) {
      case 'hit': {
        const a = { strength: ev.strength, by: fighterOf(frame, ev.by), to: fighterOf(frame, ev.to), damage: ev.damage, kb: ev.kb, pan: panOf(ev.x), combo: ev.combo };
        S.hit(e, t, a);
        if (ev.strength === 'lethal') {
          // a beat of near silence before the big one: the music and the room drop away for the
          // ~110 ms between the contact tick and the impact, then come back under its tail
          e.duckBus('music', t, 0.08, 0.012, 0.1, 0.9);
          e.duckBus('crowd', t, 0.15, 0.012, 0.1, 0.6);
          e.smp('crowd-ooh', t + 0.3, { gain: 0.45, bus: 'crowd', fadeIn: 0.06, dur: 2.2 });
          bump(0.55);
        } else if (ev.strength === 'heavy') {
          e.duckBus('music', t, 0.55, 0.01, 0.1, 0.5);
          bump(0.35);
          if (opts.live ? e.rng.next() < 0.5 : true) e.smp(e.rng.next() < 0.5 ? 'crowd-ooh' : 'crowd-ooh2', t + 0.12, { gain: 0.32, bus: 'crowd', fadeIn: 0.05, dur: 2.2 });
        } else if (ev.strength === 'medium') {
          e.duckBus('music', t, 0.78, 0.01, 0.05, 0.25);
          bump(0.14);
        } else bump(0.03);
        if (ev.strength !== 'light') pendingLaunch[ev.to] = { kb: ev.kb, lethal: ev.strength === 'lethal', armedAt: t, tick: ev.tick };
        break;
      }
      case 'shield_hit':
        S.shieldHit(e, t, ev.perfect, Math.max(0, 1 - ev.shield / 100) * 0.5 + 0.5, panOf(ev.x));
        bump(0.02);
        break;
      case 'shield_break':
        S.shieldBreak(e, t, panOf(side(ev.side).x));
        bump(0.35);
        break;
      case 'clank':
        S.clank(e, t, panOf(ev.x));
        break;
      case 'grab':
        S.grab(e, t, fighterOf(frame, ev.by), panOf(side(ev.by).x));
        break;
      case 'throw':
        S.throwSound(e, t, fighterOf(frame, ev.by), panOf(side(ev.by).x));
        break;
      case 'move': {
        if (ev.move === 'grab' || ev.move === 'throwf' || ev.move === 'throwb' || ev.move === 'throwu') break;
        const f = fighterOf(frame, ev.side);
        const def = defs?.[f]?.moves[ev.move];
        const startup = def ? def.startup : 6;
        const speed = Math.max(0.2, frame.fight!.speed);
        S.swing(e, t, f, ev.move, (startup * TICK_S) / speed, panOf(side(ev.side).x));
        break;
      }
      case 'projectile':
        S.projectile(e, t, fighterOf(frame, ev.side), panOf(ev.x));
        break;
      case 'jump':
        S.jump(e, t, fighterOf(frame, ev.side), ev.air, panOf(ev.x));
        break;
      case 'land':
        S.land(e, t, fighterOf(frame, ev.side), ev.hard, panOf(ev.x));
        lastStep[ev.side] = ev.tick;
        break;
      case 'dash':
        S.dash(e, t, fighterOf(frame, ev.side), panOf(ev.x));
        lastStep[ev.side] = ev.tick;
        break;
      case 'dodge':
        S.dodge(e, t, fighterOf(frame, ev.side), ev.kind, panOf(side(ev.side).x));
        break;
      case 'ledge':
        S.ledge(e, t, fighterOf(frame, ev.side), ev.ledge === 0 ? -0.6 : 0.6);
        break;
      case 'tech':
        S.tech(e, t, fighterOf(frame, ev.side), panOf(ev.x));
        break;
      case 'bounce':
        S.bounce(e, t, fighterOf(frame, ev.side), panOf(ev.x));
        break;
      case 'ko': {
        const pan = ev.edge === 'left' ? -0.8 : ev.edge === 'right' ? 0.8 : 0;
        S.koBlast(e, t, pan);
        // the call lands with the word (ko/call.ts: RINGOUT at frame 9, LIGHTS OUT at frame 14)
        const final = ev.livesLeft <= 0;
        S.koCall(e, t + (final ? 0.233 : 0.15), final);
        // the music dips under the blast and climbs back under the roar: no hole, no wall
        e.duckBus('music', t, 0.35, 0.01, 0.45, 2.0);
        // the room goes up with the blast and falls back within about three seconds
        if (!e.smp('crowd-roar', t + 0.04, { gain: 1.0, bus: 'crowd', fadeIn: 0.1, hold: 1.0, tc: 0.55, hp: 200, lp: 9000, pan: pan * 0.3 })) {
          e.smp('crowd-cheer', t + 0.08, { gain: 0.8, bus: 'crowd', fadeIn: 0.12, hold: 0.9, tc: 0.55, hp: 260, lp: 4000 });
        }
        e.smp('crowd-cheer', t + 0.3, { gain: 0.45, bus: 'crowd', fadeIn: 0.25, hold: 1.0, tc: 0.6, hp: 300, lp: 5000, pan: -pan * 0.3 });
        pendingLaunch[ev.side] = null;
        excite = 1;
        break;
      }
      case 'respawn':
        S.respawn(e, t, 0);
        break;
      case 'sudden_death':
        S.suddenDeath(e, t);
        bump(0.5);
        break;
      case 'order':
        S.planTick(e, t, ev.side, true);
        break;
      default:
        break;
    }
  }

  function footsteps(frame: Frame, t: number): void {
    const st = frame.fight!.state;
    for (const side of [0, 1] as Side[]) {
      const f: FighterState = st.fighters[side];
      if (!f.grounded || f.hitlag > 0) continue;
      const run = f.action === 'run';
      const walk = f.action === 'walk';
      if (!run && !walk) continue;
      const fam = S.FAMS[f.fighter];
      const stride = run ? fam.stride : Math.round(fam.stride * 1.7);
      if (st.tick - lastStep[side] >= stride || st.tick < lastStep[side]) {
        lastStep[side] = st.tick;
        S.step(e, t, f.fighter, panOf(f.x), run ? 1 : 0.7);
      }
    }
  }

  function launches(frame: Frame, t: number): void {
    const st = frame.fight!.state;
    for (const side of [0, 1] as Side[]) {
      const p = pendingLaunch[side];
      if (!p) continue;
      const f = st.fighters[side];
      if (f.hitlag === 0 && st.tick > p.tick) {
        S.launch(e, t, p.kb, p.lethal, panOf(f.x));
        pendingLaunch[side] = null;
      } else if (t - p.armedAt > 3) pendingLaunch[side] = null;
    }
  }

  /** play every cue of this phase whose time has come (a little ahead, so it lands on its frame) */
  function runCues(s: ShowState, t: number): void {
    const upTo = s.phaseMs + CUE_LOOKAHEAD;
    for (const c of cues) {
      if (c.at > cueHorizon && c.at <= upTo) c.play(t + Math.max(0, c.at - s.phaseMs) / 1000);
    }
    cueHorizon = Math.max(cueHorizon, upTo);
  }

  return {
    update(frame: Frame) {
      if (stopped) return;
      const t = now() + (opts.live ? 0.012 : 0);
      const s = frame.show;
      const fresh = s.phaseMs < 600; // the phase began while we watched (not a late join)
      if (!synced) {
        // first frame we see: take the show as it is, start the beds, make no event sounds
        synced = true;
        phase = s.phase;
        watched = fresh;
        picksRevealed = s.picksRevealed;
        tauntAt = [s.tauntAt[0], s.tauntAt[1]];
        planAt = [s.planChangedAt[0], s.planChangedAt[1]];
        corner = [s.cornerTalk[0], s.cornerTalk[1]];
        winId = s.window?.id ?? null;
        winState = s.window?.state ?? null;
        lastTick = frame.fight?.state.tick ?? -1;
        if (frame.fight?.state) for (const sd of [0, 1] as Side[]) lastStep[sd] = frame.fight.state.tick;
        cues = phaseCues(e, s);
        cueHorizon = s.phaseMs;
        lockSlamDone = true;
        breakBed = s.phase === 'break' && s.phaseMs >= KO_HOLD_MS;
        startCrowd(t);
        if (s.phase === 'fight' || (s.phase === 'break' && !breakBed)) startMusic('fight', t, 1);
        else if (s.phase !== 'idle') startMusic('bed', t, 1.5);
        return;
      }

      // ---- phase changes ----
      if (s.phase !== phase) {
        const prev = phase;
        phase = s.phase;
        watched = fresh;
        startCrowd(t);
        cues = phaseCues(e, s);
        // a fresh phase plays its cues from the start; a late join only the ones still to come
        cueHorizon = fresh ? -1 : s.phaseMs;
        breakBed = false;
        lockSlamDone = !fresh;
        if (s.phase === 'fight') startMusic('fight', t, 0.4);
        else if (s.phase === 'break') {
          // the knockout plays live first: the fight music holds through it (the bed takes over
          // when the replay starts)
          if (s.phaseMs >= KO_HOLD_MS) {
            breakBed = true;
            startMusic('bed', t, 1.5);
          }
        } else if (s.phase === 'idle') stopMusic(t, 1);
        else startMusic('bed', t, prev === 'idle' ? 1.2 : 0.8);
        riserDone = false;
        countStage = -1;
      }
      if (s.phase === 'break' && !breakBed && s.phaseMs >= KO_HOLD_MS) {
        breakBed = true;
        startMusic('bed', t, 1.8);
      }
      if (s.phase === 'verdict' && s.phaseMs < 400 && watched && s.result) {
        // the burst: the room goes up with it
        if (!crowdVerdict) {
          crowdVerdict = true;
          e.smp('crowd-roar', t + 0.05, { gain: 0.9, bus: 'crowd', fadeIn: 0.2, hold: 1.2, tc: 0.8, hp: 220 });
          e.smp('crowd-cheer', t + 0.3, { gain: 0.45, bus: 'crowd', fadeIn: 0.4, hold: 1.2, tc: 0.9, hp: 260, lp: 3000 });
          bump(0.6);
        }
      } else if (s.phase !== 'verdict') crowdVerdict = false;
      runCues(s, t);

      // ---- the select reveal, taunts, plans, corner talk ----
      // the build into the flip, timed to land on it
      if (s.phase === 'select' && watched && !s.picksRevealed && !riserDone && s.selectRevealMs > 0) {
        const left = s.selectRevealMs - s.phaseMs;
        if (left > 150 && left <= 900) {
          S.riser(e, t, left / 1000);
          riserDone = true;
        }
      }
      if (s.picksRevealed && !picksRevealed) {
        if (watched && (s.phase === 'select' || s.phase === 'versus')) S.pickReveal(e, t);
        bump(0.4);
      }
      picksRevealed = s.picksRevealed;
      for (const side of [0, 1] as Side[]) {
        if (s.tauntAt[side] !== tauntAt[side]) {
          if (s.tauntAt[side] >= 0 && frame.now - s.tauntAt[side] < 500) S.taunt(e, t, side);
          tauntAt[side] = s.tauntAt[side];
        }
        if (s.planChangedAt[side] !== planAt[side]) {
          if (planAt[side] >= 0 && frame.now - s.planChangedAt[side] < 500 && s.phase === 'fight') S.planTick(e, t + side * 0.05, side, false);
          planAt[side] = s.planChangedAt[side];
        }
        const ct = s.cornerTalk[side];
        if (ct !== corner[side]) {
          if (ct) S.cornerTalk(e, t, side);
          corner[side] = ct;
        }
      }

      // ---- windows: clock ticks in the last 5 s, the lock ----
      const w = s.window;
      if (w) {
        if (w.id !== winId) {
          winId = w.id;
          winState = w.state;
          lastClockSec = -1;
          if (s.phase === 'break' && w.state === 'open' && w.durationMs - w.msLeft < 600) S.windowOpen(e, t);
        }
        if (w.state === 'open') {
          const sec = Math.ceil(w.msLeft / 1000);
          if (sec <= 5 && sec >= 1 && sec !== lastClockSec) {
            if (lastClockSec !== -1 || sec * 1000 - w.msLeft < 150) S.clockTick(e, t, sec === 1);
            lastClockSec = sec;
          }
        }
        // the fight's own LOCKED slam covers the lock at the start of a match
        if (w.state === 'locked' && winState === 'open' && s.phase !== 'fight') S.lock(e, t);
        winState = w.state;
      }

      // ---- the fight ----
      const fv = frame.fight;
      if (fv) {
        const replay = fv.mode === 'replay';
        // a replay is heard slower and lower: samples and synth bands follow its speed
        e.rateMul = replay ? Math.max(0.5, Math.min(1, fv.speed)) : 1;
        // LOCKED slams across at the start of a match (predictions.ts: the word lands at 110 ms)
        if (s.phase === 'fight' && !lockSlamDone && fv.countdownMs > 0) {
          lockSlamDone = true;
          const lives = s.ctx?.lives;
          const full = s.ctx?.header?.lives ?? 2;
          if (!lives || (lives[0] >= full && lives[1] >= full)) S.lockSlam(e, t + Math.max(0, 110 - s.phaseMs) / 1000);
        }
        // countdown: each numeral slams 70 ms into its second, the start call 80 ms after tick 0
        if (fv.countdownMs > 0) {
          const n = Math.ceil(fv.countdownMs / 1000);
          if (n <= 3 && n !== countStage) {
            // (a viewer who joins mid-second hears the next numeral, not a late one)
            if (countStage !== -1 || n * 1000 - fv.countdownMs < 150) S.countBeep(e, t + Math.max(0, 0.07 - (n * 1000 - fv.countdownMs) / 1000), n);
            countStage = n;
          }
        } else if (countStage > 0 && countStage <= 3) {
          countStage = 0;
          S.startCall(e, t + 0.08);
          e.smp('crowd-roar', t + 0.12, { gain: 0.6, bus: 'crowd', fadeIn: 0.15, hold: 0.5, tc: 0.6, hp: 220 });
          bump(0.5);
        }
        const evs = fv.events;
        // a seek, a join or a snap to a checkpoint can deliver a burst: never play a pile-up
        const tickJump = lastTick >= 0 && Math.abs(fv.state.tick - lastTick) > 30;
        const prevLevel = e.level;
        // a replay plays the same events again, quieter, without the room reacting again
        if (replay) e.level = prevLevel * 0.4;
        try {
          if (fv.mode !== 'frozen' && evs.length && evs.length <= 40 && !tickJump) {
            for (const ev of evs) {
              if (replay && (ev.t === 'ko' || ev.t === 'respawn' || ev.t === 'order' || ev.t === 'sudden_death')) {
                if (ev.t === 'ko') S.koEcho(e, t, 0);
                continue;
              }
              if (replay && ev.t === 'hit') {
                S.hit(e, t, { strength: ev.strength, by: fighterOf(frame, ev.by), to: fighterOf(frame, ev.to), damage: ev.damage, kb: ev.kb, pan: panOf(ev.x), combo: ev.combo });
                if (ev.strength !== 'light') pendingLaunch[ev.to] = { kb: ev.kb, lethal: false, armedAt: t, tick: ev.tick };
                continue;
              }
              onEvent(frame, ev, t);
            }
          }
          if (fv.mode !== 'frozen' && !tickJump) {
            launches(frame, t);
            footsteps(frame, t);
          }
        } finally {
          e.level = prevLevel;
        }
        lastTick = fv.state.tick;
      } else lastTick = -1;

      // ---- the crowd bed follows the action ----
      // (live, the bed may decode a moment after unlock: start it on the first frame it exists)
      if (!crowd || !cheer) startCrowd(t);
      const dt = Math.max(0, Math.min(0.1, frame.dt));
      // after a knockout the room stays a little up through the hold and the replay
      const floor = s.phase === 'break' ? 0.22 : s.phase === 'fight' ? 0.12 : 0.05;
      excite = Math.max(floor, excite - dt * (excite > 0.45 ? 0.32 : 0.1));
      if (t - lastExciteT > 0.05 || !opts.live) {
        lastExciteT = t;
        const live = s.phase === 'fight' || s.phase === 'break';
        const base = live ? 1 : s.phase === 'idle' ? 0 : 0.75;
        // the murmur: steady, quieter between phases; the cheering crowd follows the excitement
        // (a swell on medium and heavy hits, the knockout on top)
        const g = crowdGains(excite, live, base);
        setCrowd(t, g.murmur, g.cheer, excite > 0.45 ? 0.08 : 0.35);
      }
    },
    stop() {
      stopped = true;
      const t = now();
      stopMusic(t, 0.2);
      for (const c of [crowd, cheer]) {
        if (!c) continue;
        c.gain.gain.setTargetAtTime(0.0001, t, 0.05);
        c.src.stop(t + 0.3);
      }
      crowd = null;
      cheer = null;
    },
  };
}


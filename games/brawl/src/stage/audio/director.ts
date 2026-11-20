// Blood Moon sound director: turns each Frame into sounds. Reads only frame.fight.events, the fight
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
import { loopEndOf, loopStartOf, music, musicTrim, releaseMusic, type MusicKind } from './music.ts';
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
 * The night under the fight: a soft low wind on the 'crowd' bus, at a level you can barely notice
 * (about 15 dB under the fight music), only in the fight and the break. Silent between phases.
 */
export function nightGain(phase: string): number {
  return phase === 'fight' || phase === 'break' ? Math.pow(10, -22 / 20) : 0.0001;
}
/** seconds the wolf's voice rests after a snarl or a full howl (repeats are shorter or silent) */
const SNARL_REST = 8;
const HOWL_REST = 18;
/** the finale sting's length (s): the opening comes back after it */
const FINALE_S = 10.5;

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

export type MoveDefs = Partial<Record<FighterId, { moves: Record<string, { startup: number; blink?: { frame: number } }> }>>;

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
        { at: 0, play: (t) => { S.callOpen(e, t, 0.17); dip(e, t + 0.17, 0.6, 0.3, 0.8); } },
        { at: 610, play: (t) => S.cardHit(e, t, 0.6) },
        { at: 2300, play: (t) => S.cardHit(e, t, 0.45) },
        { at: 2500, play: (t) => S.cardHit(e, t, 0.9, -0.6) },
        { at: 2680, play: (t) => S.cardHit(e, t, 0.9, 0.6) },
        { at: 6000, play: (t) => S.cardHit(e, t, 0.5) },
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
        { at: 0, play: (t) => { S.versusSlam(e, t, 0.15); dip(e, t + 0.15, 0.6, 0.3, 0.9); } },
        { at: 820, play: (t) => S.cardHit(e, t, 0.7) },
        { at: 1120, play: (t) => S.cardHit(e, t, 0.5) },
      ];
    case 'predictions':
      // predictions.ts: the title slams at 150
      return [
        { at: 150, play: (t) => { S.wordSlam(e, t, 0.9); dip(e, t, 0.7, 0.2, 0.6); } },
        { at: 170, play: (t) => S.windowOpen(e, t) },
      ];
    case 'verdict': {
      // verdict.ts: the burst at 0, WINS at 220, the payout freeze 1500 to 1950 and its hit,
      // the hard cut to the results at 3400. The strings sting and the Wolf's howl are started by
      // the director (they hold the opening loop off while they play).
      const side = s.result?.winner ?? 0;
      return [
        { at: 0, play: (t) => S.winner(e, t, side) },
        { at: 1500, play: (t) => S.payoutHold(e, t, 0.45) },
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
  let verdictDone = false;
  /** stage strikes already heard in this select */
  let strikesHeard = 0;
  /** context time when the opening may come back after the finale sting (0: not held) */
  let bedHeldUntil = 0;
  const lastStep: [number, number] = [-999, -999];
  const pendingLaunch: ({ kb: number; lethal: boolean; armedAt: number; tick: number } | null)[] = [null, null];
  /** the wolf's voice: when it last snarled and last howled in full (context time) */
  let lastSnarl = -999;
  let lastHowl = -999;
  /** the last bat or knife of each side's volley (tick): one sound per volley of three */
  const lastBat: [number, number] = [-999, -999];
  /** the last ward snap (tick): the hazard and the snare of one catch arrive together */
  let lastSnap = -999;
  let night: Loop | null = null;
  let mus: Loop | null = null;
  let wantMusic: MusicKind | null = null;
  let musicLoading: string | null = null;
  let stopped = false;
  /** true when the current phase began while we watched (not a late join) */
  let watched = false;
  let synced = false;

  const now = () => e.ctx.currentTime;
  const panOf = (x: number) => Math.max(-0.8, Math.min(0.8, x / 14));
  const fighterOf = (frame: Frame, side: Side): FighterId =>
    frame.fight?.state.fighters[side].fighter ?? frame.show.ctx?.picks?.[side] ?? 'gantry';

  // ---- the night: one soft wind loop (20 s, seamless) on the 'crowd' bus ----
  const NIGHT_LEN = 20.0;
  function startNight(t: number): void {
    if (night) return;
    const b = sample('night-bed');
    if (!b) return;
    const src = e.ctx.createBufferSource();
    src.buffer = b;
    src.loop = true;
    if (NIGHT_LEN < b.duration) src.loopEnd = NIGHT_LEN;
    const g = e.ctx.createGain();
    g.gain.value = 0.0001;
    src.connect(g);
    g.connect(e.bus.crowd);
    src.start(t, (opts.live ? t * 7.3 : 3) % Math.min(NIGHT_LEN, b.duration));
    night = { src, gain: g, kind: 'night-bed' };
  }

  /** the music of a show phase that is not the fight: the theme up to the fight, the opening after */
  const showMusic = (phase: string): MusicKind => (phase === 'call' || phase === 'select' || phase === 'versus' || phase === 'predictions' ? 'theme' : 'bed');

  function startMusic(kind: MusicKind, t: number, fade = 0.6, fromStart = true): void {
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
          const k = old.kind as MusicKind;
          old.src.onended = () => { if (wantMusic !== k) releaseMusic(k); };
        }
      }
      const src = e.ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      const le = loopEndOf(buf);
      const ls = loopStartOf(buf);
      if (le > 0) src.loopEnd = le;
      if (ls > 0) src.loopStart = ls;
      const g = e.ctx.createGain();
      // a smooth rise (no hole between the outgoing and incoming loop, no step when it starts)
      g.gain.setValueAtTime(0, at);
      g.gain.setTargetAtTime(musicTrim(kind), at, fade / 3);
      src.connect(g);
      g.connect(e.bus.music);
      // the fight loop starts on its first bar, the theme too on a fresh show (a late joiner picks it
      // up somewhere in its loop); the opening picks up somewhere new each time
      const span = Math.max(1, (le > 0 ? le : buf.duration) - ls);
      const off = kind === 'bed' && opts.live ? (at * 13.7) % span : kind === 'theme' && !fromStart ? ls + ((at * 13.7) % span) : 0;
      src.start(at, off);
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

  /** the strings sting at the verdict: the opening steps aside for it and comes back after */
  function verdictSting(frame: Frame, t: number): void {
    const side = frame.show.result!.winner;
    stopMusic(t, 0.5);
    S.stingFinale(e, t + 0.05);
    bedHeldUntil = t + FINALE_S - 1.0;
    // the Wolf's win: the one howl, in full, a moment after the strings begin
    const wf = fighterOf(frame, side);
    if (wf === 'vise') {
      S.howl(e, t + 1.1, true, side === 0 ? -0.3 : 0.3);
      lastHowl = t;
    } else S.winVoice(e, t + 1.1, wf, side === 0 ? -0.3 : 0.3);
  }

  // ---- fight events ----
  /** the move that landed a hit (a projectile's own move when the sim says which) */
  function hitMove(ev: Extract<SimEvent, { t: 'hit' }>): string | undefined {
    const via = (ev as { via?: string }).via;
    return ev.move === 'projectile' ? via : ev.move;
  }

  function onEvent(frame: Frame, ev: SimEvent, t: number, evs: readonly SimEvent[]): void {
    const st = frame.fight!.state;
    const side = (s: Side) => st.fighters[s];
    switch (ev.t) {
      case 'hit': {
        // the Howl's stagger lands as a hit with no knockback and a snare: the howl is its sound
        if (ev.kb === 0 && evs.some((x) => x.t === 'snare' && x.to === ev.to)) break;
        const a = { strength: ev.strength, by: fighterOf(frame, ev.by), to: fighterOf(frame, ev.to), damage: ev.damage, kb: ev.kb, pan: panOf(ev.x), combo: ev.combo, move: hitMove(ev) };
        S.hit(e, t, a);
        if (ev.strength === 'lethal') {
          // a beat of near silence before the big one: the music and the night drop away for the
          // ~110 ms between the contact tick and the impact, then come back under its tail
          e.duckBus('music', t, 0.1, 0.012, 0.1, 0.9);
          e.duckBus('crowd', t, 0.2, 0.012, 0.1, 0.6);
        } else if (ev.strength === 'heavy') {
          // a small step back, no pumping on the smaller hits
          e.duckBus('music', t, 0.7, 0.01, 0.08, 0.45);
        }
        if (ev.strength !== 'light') pendingLaunch[ev.to] = { kb: ev.kb, lethal: ev.strength === 'lethal', armedAt: t, tick: ev.tick };
        break;
      }
      case 'shield_hit':
        S.shieldHit(e, t, ev.perfect, Math.max(0, 1 - ev.shield / 100) * 0.5 + 0.5, panOf(ev.x));
        break;
      case 'shield_break':
        S.shieldBreak(e, t, panOf(side(ev.side).x));
        break;
      case 'clank':
        S.clank(e, t, panOf(ev.x));
        break;
      case 'grab': {
        const f = fighterOf(frame, ev.by);
        // the Mimic's Swallow is a close command grab: the lid slams shut on them
        if (f === 'mimic' && side(ev.by).move === 'special2') S.swallow(e, t, panOf(side(ev.by).x));
        else S.grab(e, t, f, panOf(side(ev.by).x));
        break;
      }
      case 'throw': {
        const f = fighterOf(frame, ev.by);
        // ...and the Spit, with a few coins
        if (f === 'mimic' && ev.move === 'special2') S.spit(e, t, panOf(side(ev.by).x));
        else S.throwSound(e, t, f, panOf(side(ev.by).x));
        break;
      }
      case 'pull':
        // the Mimic's tongue caught: the drag in
        if (fighterOf(frame, ev.by) === 'mimic') S.tongueDrag(e, t, panOf(ev.x));
        break;
      case 'blink':
        // the Magpie's Snatch lands: feathers settle (the Count's mist is played from his move)
        if (fighterOf(frame, ev.side) === 'tick') S.feathers(e, t, true, panOf(ev.toX));
        break;
      case 'hazard':
        if (ev.kind === 'ward' && ev.state === 'placed') S.wardPlaced(e, t, panOf(ev.x));
        else if (ev.kind === 'ward' && ev.state === 'sprung' && ev.tick - lastSnap > 10) { lastSnap = ev.tick; S.wardSnap(e, t, panOf(ev.x)); }
        break;
      case 'snare':
        // the Hexer's ward closing on someone (the Wolf's howl is heard from his move)
        if (fighterOf(frame, ev.by) === 'hexer' && ev.tick - lastSnap > 10) { lastSnap = ev.tick; S.wardSnap(e, t, panOf(ev.x)); }
        break;
      case 'move': {
        if (ev.move === 'grab' || ev.move === 'throwf' || ev.move === 'throwb' || ev.move === 'throwu') break;
        const f = fighterOf(frame, ev.side);
        const def = defs?.[f]?.moves[ev.move];
        const startup = def ? def.startup : 6;
        const speed = Math.max(0.2, frame.fight!.speed);
        const pan = panOf(side(ev.side).x);
        // the Count's Mist Step: a breath that swells to where he re-forms
        if (f === 'gantry' && ev.move === 'special2') {
          const reform = def?.blink ? def.blink.frame : startup;
          S.mist(e, t, (reform * TICK_S) / speed, pan);
          break;
        }
        // the Wolf's Pounce: a snarl (when the voice has rested) and the leap
        if (f === 'vise' && ev.move === 'special') {
          const voice = t - lastSnarl >= SNARL_REST;
          if (voice) lastSnarl = t;
          S.pounce(e, t, f, voice, pan);
          break;
        }
        // the Wolf's Howl: the one recording, in full when it has rested, short and further back if not
        if (f === 'vise' && ev.move === 'special2') {
          const full = t - lastHowl >= HOWL_REST;
          if (full) lastHowl = t;
          S.howl(e, t, full, pan);
          break;
        }
        // the Armour's Collar Fire: the roar starts as the fire leaves the collar
        if (f === 'kiln' && ev.move === 'special2') {
          S.fireBreath(e, t + Math.min(0.3, (Math.max(0, startup - 2) * TICK_S) / speed), pan);
          break;
        }
        // the Magpie's Snatch: feathers out (they settle again on the blink)
        if (f === 'tick' && ev.move === 'special2') {
          S.feathers(e, t, false, pan);
          break;
        }
        // the Mimic's Tongue Lash and Swallow are heard from the tongue and the grab
        if (f === 'mimic' && (ev.move === 'special' || ev.move === 'special2')) break;
        // the new four's recoveries: plates, a cloak flap, crows, coins
        if (ev.move === 'recover' && (f === 'kiln' || f === 'tick' || f === 'hexer' || f === 'mimic')) {
          S.recover(e, t, f, pan);
          break;
        }
        S.swing(e, t, f, ev.move, (startup * TICK_S) / speed, pan);
        break;
      }
      case 'projectile': {
        // the Count's swarm is three bats a few ticks apart: one flutter for the three
        if (ev.kind === 'bat' || ev.kind === 'knife') {
          if (ev.tick - lastBat[ev.side] < 20 && ev.tick >= lastBat[ev.side]) break;
          lastBat[ev.side] = ev.tick;
        }
        S.projectile(e, t, fighterOf(frame, ev.side), ev.kind, panOf(ev.x));
        break;
      }
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
        const final = ev.livesLeft <= 0;
        if (final) {
          // the last life: the orchestra's big hit, then the bell rings under its tail
          S.stingHit(e, t);
          S.koBlast(e, t + 0.9, pan);
          e.duckBus('music', t, 0.12, 0.01, 2.6, 2.0);
        } else {
          // a life lost: one bell toll and the candle; the music steps back and climbs back
          S.koBlast(e, t, pan);
          e.duckBus('music', t, 0.4, 0.01, 0.6, 2.0);
        }
        S.koCall(e, t + (final ? 0.233 : 0.15), final);
        pendingLaunch[ev.side] = null;
        break;
      }
      case 'respawn':
        S.respawn(e, t, 0);
        break;
      case 'sudden_death':
        S.suddenDeath(e, t);
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
        startNight(t);
        if (s.phase === 'fight' || (s.phase === 'break' && !breakBed)) startMusic('fight', t, 1);
        else if (s.phase !== 'idle') startMusic(showMusic(s.phase), t, 1.5, fresh);
        return;
      }

      // ---- phase changes ----
      if (s.phase !== phase) {
        const prev = phase;
        phase = s.phase;
        watched = fresh;
        startNight(t);
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
        else {
          // the theme from its first bar when a show starts in front of us (fast in, so the first
          // bar is heard); a phase joined late picks it up inside its loop
          const k = showMusic(s.phase);
          startMusic(k, t, k === 'theme' && fresh ? 0.25 : prev === 'idle' ? 1.2 : 0.8, fresh);
        }
        strikesHeard = 0;
        riserDone = false;
        countStage = -1;
      }
      if (s.phase === 'break' && !breakBed && s.phaseMs >= KO_HOLD_MS) {
        breakBed = true;
        startMusic('bed', t, 1.8);
      }
      if (s.phase === 'verdict' && s.phaseMs < 400 && watched && s.result) {
        // the winner: the low strings finale (and the Wolf's howl), the opening held off under it
        if (!verdictDone) {
          verdictDone = true;
          verdictSting(frame, t);
        }
      } else if (s.phase !== 'verdict') verdictDone = false;
      // the opening comes back once the finale has rung down (if nothing else has taken over)
      if (bedHeldUntil > 0 && t >= bedHeldUntil) {
        bedHeldUntil = 0;
        if (s.phase !== 'fight' && s.phase !== 'break' && s.phase !== 'idle' && !wantMusic) startMusic('bed', t, 2.5);
      }
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
        if (watched && (s.phase === 'select' || s.phase === 'versus')) {
          S.pickReveal(e, t);
          dip(e, t, 0.7, 0.25, 0.6);
        }
      }
      picksRevealed = s.picksRevealed;
      // the stage strikes (select.ts: each cross-out starts at reveal + 2.2 s + 1.5 s + i * step):
      // a quill stroke each, the theme stepping back a little under it
      const strikes = s.ctx?.strikes;
      if (s.phase === 'select' && watched && s.picksRevealed && strikes && strikes.length > strikesHeard) {
        const R = s.selectRevealMs > 0 ? s.selectRevealMs : 14_000;
        const dur = s.phaseDurationMs > 0 ? s.phaseDurationMs : 36_000;
        const k = strikes.length;
        const first = R + 2200 + 1500;
        const lastAt = Math.max(first, dur - 3000);
        const step = k > 1 ? (lastAt - first) / (k - 1) : 0;
        while (strikesHeard < k) {
          const at = first + strikesHeard * step;
          if (at > s.phaseMs + CUE_LOOKAHEAD) break;
          if (s.phaseMs - at < 400) {
            const tt = t + Math.max(0, at - s.phaseMs) / 1000;
            S.strike(e, tt, strikes[strikesHeard].by);
            dip(e, tt, 0.8, 0.3, 0.5);
          }
          strikesHeard++;
        }
      }
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
                if (ev.kb === 0 && evs.some((x) => x.t === 'snare' && x.to === ev.to)) continue;
                S.hit(e, t, { strength: ev.strength, by: fighterOf(frame, ev.by), to: fighterOf(frame, ev.to), damage: ev.damage, kb: ev.kb, pan: panOf(ev.x), combo: ev.combo, move: hitMove(ev) });
                if (ev.strength !== 'light') pendingLaunch[ev.to] = { kb: ev.kb, lethal: false, armedAt: t, tick: ev.tick };
                continue;
              }
              onEvent(frame, ev, t, evs);
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

      // ---- the night: barely there under the fight and the break, gone between phases ----
      // (live, the bed may decode a moment after unlock: start it on the first frame it exists)
      if (!night) startNight(t);
      night?.gain.gain.setTargetAtTime(nightGain(s.phase), t, 1.2);
    },
    stop() {
      stopped = true;
      const t = now();
      stopMusic(t, 0.2);
      if (night) {
        night.gain.gain.setTargetAtTime(0.0001, t, 0.05);
        night.src.stop(t + 0.3);
      }
      night = null;
    },
  };
}


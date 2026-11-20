/// <reference types="vite/client" />
// Ringout harness: mounts the stage full-window and drives it with a local fake Show running the
// real match script on mock brains, match after match.
//
// URL params: coaches=adaptive,rush (or ca=, cb=)   a=kiln&b=tick (forced picks)   seed=abc
//             fast=1 (short non-fight phases)   hl=0|1|none (the viewer's pick)
// Capture mode: ?capture=1&scene=<name>: a virtual clock, nothing moves unless window.__ringout.step/seek
// is called. Scenes and their params: README.md "Harness".

import { createStage, type Stage } from '../src/stage/stage.ts';
import { VirtualClock } from '../src/stage/clock.ts';
import { createFakeShow, realClock } from '../src/show/fakeShow.ts';
import { runMatch, type MatchDeps } from '../src/show/script.ts';
import { mockBrains, type BotConfig } from '../src/show/brains.ts';
import type { TIMING } from '../src/show/events.ts';
import type { FighterId } from '../src/sim/types.ts';
import { FIGHTER_IDS } from '../src/sim/types.ts';

type Timing = Partial<Record<keyof typeof TIMING, number>>;
type Params = Record<string, string | number | boolean | undefined>;

const botFiles = import.meta.glob('../bots.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const FALLBACK_BOTS: BotConfig[] = [
  { id: 'red', name: 'Red', model: 'local/mock-red', instructions: 'Play it straight.' },
  { id: 'blue', name: 'Blue', model: 'local/mock-blue', instructions: 'Play it straight.' },
];
function loadBots(): BotConfig[] {
  const raw = Object.values(botFiles)[0] as unknown;
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' && Array.isArray((raw as { bots?: unknown }).bots) ? (raw as { bots: unknown[] }).bots : [];
  const ok = (list as BotConfig[]).filter((b) => b && b.id && b.name && b.model);
  return ok.length >= 2 ? ok : FALLBACK_BOTS;
}
const BOTS = loadBots();

// ---- small deterministic randomness ----
function hashStr(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619) >>> 0;
  return h >>> 0;
}
function prng(seed: string): () => number {
  let a = hashStr(seed) || 1;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const FAST: Timing = {
  call: 3000,
  select: 3000,
  selectReveal: 1500,
  versus: 3000,
  predictions: 3000,
  countdown: 2000,
  replay: 3000,
  cornerTalk: 3000,
  breakWindow: 3000,
  resumeCountdown: 1500,
  verdict: 3000,
};

interface ShowOpts {
  clock: { now(): number; sleep(ms: number): Promise<void> };
  seed: string;
  coaches?: [string, string];
  picks?: [FighterId, FighterId];
  timing?: Timing;
  intermissionMs?: number;
  /** stop after this many matches (capture scenes run one) */
  matches?: number;
  onFeed: (msg: unknown) => void;
}

interface Running {
  show: ReturnType<typeof createFakeShow>;
  stop(): void;
  matchNo(): number;
  /** the two bots of the match running now (side 0, side 1) */
  bots(): [BotConfig, BotConfig];
  done: Promise<void>;
}

/** the bots of match `matchNo` (1-based): pairs rotate through bots.json */
function botsFor(matchNo: number): [BotConfig, BotConfig] {
  const i = ((matchNo - 1) * 2) % BOTS.length;
  return [BOTS[i % BOTS.length], BOTS[(i + 1) % BOTS.length]];
}

/** runs matches forever (or `matches` times) on a fake Show */
function runShow(o: ShowOpts): Running {
  let stopped = false;
  const show = createFakeShow({ clock: o.clock, onFeed: (m) => !stopped && o.onFeed(m), seedRandom: prng(o.seed + ':show') });
  const brains = mockBrains({ rand: prng(o.seed + ':brains'), sleep: o.clock.sleep, coaches: o.coaches });
  const random = prng(o.seed + ':script');
  const records: Record<string, { played: number; wins: number }> = {};
  const memories: Record<string, string[]> = {};
  let matchNo = 1;
  const intermissionMs = o.intermissionMs ?? 8000;
  const done = (async () => {
    for (let n = 0; !stopped && (o.matches == null || n < o.matches); n++) {
      const bots = botsFor(matchNo);
      try {
        await runMatch(show, {
          brains,
          bots,
          matchNo,
          records,
          memories,
          random,
          // TIMING is declared `as const`, so its Partial only admits the default numbers: cast
          options: { picks: o.picks, timing: o.timing as NonNullable<MatchDeps['options']>['timing'], intermissionMs },
        });
      } catch (e) {
        if (stopped) return;
        console.error('[harness] match failed', e);
      }
      if (stopped) return;
      show.intermission();
      matchNo++;
      if (o.matches != null && n + 1 >= o.matches) return;
      await o.clock.sleep(intermissionMs);
    }
  })();
  return {
    show,
    stop() {
      stopped = true;
      show.destroy();
    },
    matchNo: () => matchNo,
    bots: () => botsFor(matchNo),
    done,
  };
}

// ---- page ----
const q = new URLSearchParams(location.search);
const stageEl = document.getElementById('stage')!;
const devEl = document.getElementById('dev')!;
const ASSETS = '/';

function paramsFrom(qs: URLSearchParams): Params {
  const p: Params = {};
  qs.forEach((v, k) => (p[k] = v));
  return p;
}
function coachesOf(p: Params): [string, string] | undefined {
  if (p.ca || p.cb) return [String(p.ca ?? 'adaptive'), String(p.cb ?? 'adaptive')];
  if (!p.coaches) return undefined;
  const c = String(p.coaches).split(',');
  return [c[0] || 'adaptive', c[1] || c[0] || 'adaptive'];
}
function picksOf(p: Params): [FighterId, FighterId] | undefined {
  const a = p.a as FighterId | undefined;
  const b = p.b as FighterId | undefined;
  if (a && b && FIGHTER_IDS.includes(a) && FIGHTER_IDS.includes(b)) return [a, b];
  return undefined;
}
const wire = (m: unknown) => JSON.parse(JSON.stringify(m));
/** hl=0|1|none -> side or null; anything else -> undefined (leave the pick alone) */
function hlOf(p: Params): 0 | 1 | null | undefined {
  const v = p.hl;
  if (v === undefined || v === '') return undefined;
  if (v === 0 || v === '0') return 0;
  if (v === 1 || v === '1') return 1;
  return null;
}
const truthy = (v: unknown) => v === true || v === 1 || v === '1' || v === 'true';

if (q.get('capture') === '1') startCapture();
else startLive();

// =================================================================================================
// live mode
// =================================================================================================
function startLive(): void {
  const p = paramsFrom(q);
  let stage: Stage = createStage(stageEl, { assetsBase: ASSETS });
  const run = runShow({
    clock: realClock(),
    seed: String(p.seed ?? Math.floor(Math.random() * 1e9)),
    coaches: coachesOf(p),
    picks: picksOf(p),
    timing: p.fast === '1' ? FAST : undefined,
    intermissionMs: p.fast === '1' ? 2000 : 8000,
    onFeed: (m) => stage.onFeed(wire(m)),
  });

  // sound the way the site drives it: a volume at start, and the first click or key anywhere on
  // the page (not just the stage) unlocks it. The stage itself never asks for a click.
  const VOLUME = 0.8;
  stage.setVolume(VOLUME);
  let unlocked = false;
  const onFirstGesture = () => {
    unlocked = true;
    stage.unlock();
    document.removeEventListener('pointerdown', onFirstGesture, true);
    document.removeEventListener('keydown', onFirstGesture, true);
  };
  document.addEventListener('pointerdown', onFirstGesture, true);
  document.addEventListener('keydown', onFirstGesture, true);

  // dev strip
  const stats = document.createElement('span');
  stats.id = 'stats';
  devEl.appendChild(stats);
  const btn = (label: string, fn: () => void) => {
    const b = document.createElement('button');
    b.textContent = label;
    b.onclick = () => {
      stage.unlock();
      fn();
    };
    devEl.appendChild(b);
    return b;
  };
  const sep = () => devEl.appendChild(Object.assign(document.createElement('span'), { className: 'sep' }));
  sep();
  let camMode = 'auto';
  btn('Auto', () => stage.setCamera((camMode = 'auto')));
  btn('Wide', () => stage.setCamera((camMode = 'wide')));
  btn('Follow A', () => stage.setCamera((camMode = 'follow'), 0));
  btn('Follow B', () => stage.setCamera((camMode = 'follow'), 1));
  sep();
  let hl: 0 | 1 | null = hlOf(p) ?? null;
  const applyHl = () => stage.highlight(hl == null ? null : run.bots()[hl].id);
  applyHl();
  btn('Pick A', () => ((hl = 0), applyHl()));
  btn('Pick B', () => ((hl = 1), applyHl()));
  btn('No pick', () => ((hl = null), applyHl()));
  sep();
  let muted = false;
  const muteB = btn('Mute', () => {
    muted = !muted;
    stage.setMuted(muted);
    muteB.classList.toggle('on', muted);
  });
  btn('Rejoin', () => {
    stage.destroy();
    stage = createStage(stageEl, { assetsBase: ASSETS });
    stage.onFeed(wire(run.show.snapshot()));
    stage.setVolume(VOLUME);
    if (unlocked) stage.unlock();
    stage.setMuted(muted);
    stage.setCamera(camMode);
    applyHl();
  });

  setInterval(() => {
    const i = stage.info();
    const f = i.fighters;
    const fs = f.length ? `  ${f.map((x) => `${x.fighter} ${x.action} ${Math.floor(x.damage)}% x${x.lives}`).join('  |  ')}` : '';
    stats.textContent = `match ${run.matchNo()}  ${i.phase}  tick ${i.tick ?? '-'}  ${i.fps} fps${i.mismatches ? `  mismatches ${i.mismatches}` : ''}${fs}`;
  }, 250);

  (window as unknown as { __ringoutLive: unknown }).__ringoutLive = { get stage() { return stage; }, run };
}

// =================================================================================================
// capture mode
// =================================================================================================
function startCapture(): void {
  document.body.classList.add('capture');
  const SCENES = ['match', 'fight', 'moves', 'select', 'versus', 'predictions', 'ko', 'life', 'break', 'verdict', 'arena'];
  let vc = new VirtualClock();
  let stage: Stage | null = null;
  let run: Running | null = null;
  let scene = '';
  let sceneNote: Record<string, unknown> = {};
  let flags = { lethal: false, lifeLost: false };
  /** the viewer's pick for this scene (hl param): applied after load and after every rejoin */
  let hlSide: 0 | 1 | null | undefined;
  function applyHl(): void {
    if (!stage || hlSide === undefined) return;
    stage.highlight(hlSide === null || !run ? null : run.bots()[hlSide].id);
  }
  const FRAME = 1000 / 60;

  function teardown(): void {
    run?.stop();
    run = null;
    stage?.destroy();
    stage = null;
  }

  function feed(m: unknown): void {
    const msg = wire(m) as { type?: string; event?: { type: string; data?: { strength?: string } } };
    if (msg.type === 'event' && msg.event) {
      if (msg.event.type === 'hit' && msg.event.data?.strength === 'lethal') flags.lethal = true;
      if (msg.event.type === 'life_lost') flags.lifeLost = true;
    }
    stage?.onFeed(msg);
  }

  function fresh(): Stage {
    teardown();
    vc = new VirtualClock();
    flags = { lethal: false, lifeLost: false };
    stage = createStage(stageEl, { assetsBase: ASSETS, capture: { time: vc } });
    return stage;
  }

  function startMatch(p: Params, timing?: Timing): void {
    run = runShow({
      clock: vc,
      seed: String(p.seed ?? 'ringout'),
      coaches: coachesOf(p),
      picks: picksOf(p),
      timing,
      intermissionMs: 8000,
      matches: p.loop ? undefined : 1,
      onFeed: feed,
    });
  }

  async function step(frames = 1): Promise<void> {
    for (let i = 0; i < frames; i++) {
      await vc.advance(FRAME);
      stage?.frame(1 / 60, true);
    }
  }

  /** advance without rendering every frame; modules still update every 100 ms of show time */
  async function seek(ms: number): Promise<void> {
    let left = ms;
    while (left > 0) {
      const d = Math.min(100, left);
      await vc.advance(d);
      stage?.frame(d / 1000, false);
      left -= d;
    }
    if (rejoinAfterSeek) rejoin();
    stage?.frame(0, true);
  }

  /** late join: a new stage fed only the fake Show's snapshot, then the live feed */
  function rejoin(): void {
    if (!run) return;
    stage?.destroy();
    stage = createStage(stageEl, { assetsBase: ASSETS, capture: { time: vc } });
    stage.onFeed(wire(run.show.snapshot()));
    applyHl();
    stage.frame(0, false);
    rejoins++;
  }
  let rejoinAfterSeek = false;
  let rejoins = 0;

  /** advance a frame at a time (no render) until pred() or maxMs */
  async function seekUntil(pred: () => boolean, maxMs: number, chunk = FRAME): Promise<boolean> {
    for (let t = 0; t < maxMs; t += chunk) {
      if (pred()) return true;
      await vc.advance(chunk);
      stage?.frame(chunk / 1000, false);
    }
    return pred();
  }
  const phase = () => stage?.info().phase ?? 'idle';
  const num = (v: unknown, d: number) => (v === undefined || v === '' || isNaN(Number(v)) ? d : Number(v));

  /**
   * Run the same match headless first (same seed, picks, coaches and timing: the show is
   * deterministic) and list its knockouts, so a scene can stop at an exact tick before one.
   */
  async function knockouts(p: Params, timing?: Timing): Promise<{ tick: number; final: boolean; side: number }[]> {
    const pre = new VirtualClock();
    const kos: { tick: number; final: boolean; side: number }[] = [];
    const r = runShow({
      clock: pre,
      seed: String(p.seed ?? 'ringout'),
      coaches: coachesOf(p),
      picks: picksOf(p),
      timing,
      intermissionMs: 8000,
      matches: 1,
      onFeed: (m) => {
        const e = (m as { type?: string; event?: { type: string; data: { tick: number; final: boolean; side: number } } }).event;
        if ((m as { type?: string }).type === 'event' && e?.type === 'life_lost') kos.push({ tick: e.data.tick, final: !!e.data.final, side: e.data.side });
      },
    });
    let finished = false;
    void r.done.then(() => (finished = true));
    for (let i = 0; !finished && i < 3600; i++) await pre.advance(1000);
    r.stop();
    return kos;
  }

  /** shorten every phase before `keep`, keep that one at its real length */
  function shortBefore(keep: string): Timing {
    const t: Timing = { call: 1200, select: 2400, selectReveal: 1200, versus: 2400, predictions: 1500, countdown: 1000 };
    if (keep === 'select') {
      delete t.select;
      delete t.selectReveal;
    }
    if (keep === 'versus') delete t.versus;
    if (keep === 'predictions') delete t.predictions;
    if (keep === 'call') delete t.call;
    return t;
  }

  async function load(name: string, params: Params = {}): Promise<void> {
    const p = { ...paramsFrom(q), ...params };
    scene = name;
    sceneNote = {};
    rejoinAfterSeek = truthy(p.rejoin);
    rejoins = 0;
    hlSide = hlOf(p);
    const st = fresh();
    switch (name) {
      case 'match':
        startMatch(p, p.fast === '1' || p.fast === 1 ? FAST : undefined);
        await vc.advance(0);
        st.frame(0, true);
        break;
      case 'fight': {
        startMatch({ ...p, a: p.a ?? 'kiln', b: p.b ?? 'tick' }, shortBefore('fight'));
        const at = num(p.at, 0);
        await seekUntil(() => phase() === 'fight', 60_000, 50);
        const ok = await seekUntil(() => {
          const i = stage!.info();
          return (i.phase === 'fight' && (i.tick ?? 0) >= at && i.mode === 'live') || i.phase === 'verdict';
        }, 600_000, at > 600 ? 50 : FRAME);
        sceneNote = { reached: ok, at };
        st.frame(0, true);
        break;
      }
      case 'moves': {
        const f = (p.fighter as FighterId) ?? 'kiln';
        st.poseSheet(FIGHTER_IDS.includes(f) ? f : 'kiln', p.move ? String(p.move) : undefined, { part: num(p.part, 1), parts: num(p.parts, 1) });
        st.frame(0, true);
        break;
      }
      case 'select':
      case 'versus':
      case 'predictions': {
        startMatch(p, shortBefore(name));
        await seekUntil(() => phase() === name, 120_000, 50);
        const def = name === 'select' ? 18_000 : name === 'versus' ? 12_000 : 5_000;
        await seek(num(p.ms, def));
        break;
      }
      case 'ko':
      case 'life': {
        // stop `before` ticks (default 30) before a knockout is drawn live: the `n`th (default 1),
        // or with final=1 the one that ends the match. Found by running the same match headless first.
        const mp = { ...p, a: p.a ?? 'kiln', b: p.b ?? 'tick' };
        const timing = shortBefore('fight');
        const kos = await knockouts(mp, timing);
        const want = truthy(p.final) ? kos.find((k) => k.final) : kos[Math.max(1, num(p.n, 1)) - 1];
        const before = num(p.before, 30);
        startMatch(mp, timing);
        if (!want) {
          // no such knockout in this match (a timeout): fall back to the first lethal hit or lost life
          const ok = await seekUntil(() => flags.lethal || flags.lifeLost, 900_000, FRAME);
          sceneNote = { reached: false, knockouts: kos, note: ok ? 'no such knockout; stopped at the first lethal hit or lost life' : 'no knockout' };
          applyHl();
          st.frame(0, true);
          break;
        }
        const goal = want.tick - before;
        const at = (lead: number) => () => {
          const i = stage!.info();
          return (i.mode === 'live' && (i.tick ?? 0) >= goal - lead) || i.phase === 'verdict';
        };
        await seekUntil(() => phase() === 'fight', 60_000, 50);
        await seekUntil(at(90), 900_000, 100);
        const ok = await seekUntil(at(0), 60_000, FRAME);
        sceneNote = { reached: ok, koTick: want.tick, final: want.final, goalTick: goal, knockouts: kos };
        applyHl();
        st.frame(0, true);
        break;
      }
      case 'break':
      case 'verdict': {
        startMatch({ ...p, a: p.a ?? 'kiln', b: p.b ?? 'tick' }, shortBefore('fight'));
        await seekUntil(() => phase() === name, 1_200_000, 100);
        // break default: 1 s into the break window (koHold 2.6 + replay 7 + corner 6 s)
        await seek(num(p.ms, name === 'break' ? 16_600 : 1_500));
        break;
      }
      case 'arena':
        st.setCamera(p.cam === 'close' ? 'close' : 'wide');
        st.frame(1, true);
        st.frame(0, true);
        break;
      default:
        throw new Error(`unknown scene ${name}; scenes: ${SCENES.join(', ')}`);
    }
    if (hlSide !== undefined) {
      applyHl();
      stage?.frame(0, true);
    }
  }

  const fontsReady = (document as Document & { fonts?: { ready: Promise<unknown> } }).fonts?.ready ?? Promise.resolve();
  const ready: Promise<true> = (async () => {
    // load the faces the UI uses before the first still, so no capture shows a fallback font
    const fonts = (document as Document & { fonts?: { load(f: string): Promise<unknown> } }).fonts;
    if (fonts) {
      await Promise.all(
        ['700', '800', '900'].map((w) => fonts.load(`${w} 40px "Big Shoulders Display"`)).concat(
          ['500', '600', '700'].map((w) => fonts.load(`${w} 20px "Barlow Semi Condensed"`)),
        ),
      ).catch(() => undefined);
    }
    await fontsReady;
    // a person opening the URL gets the scene loaded; the capture tool calls load() itself
    const sc = q.get('scene');
    if (sc && SCENES.includes(sc) && !navigator.webdriver) await load(sc, {});
    return true as const;
  })();

  (window as unknown as { __ringout: unknown }).__ringout = {
    ready,
    scenes: SCENES,
    load,
    step,
    seek,
    rejoin: async () => rejoin(),
    /** draw the current frame again without advancing the clock */
    render: async () => stage?.render(),
    info() {
      const i = stage?.info();
      return { scene, ...sceneNote, rejoins, ...(i ?? {}), virtualMs: vc.now() };
    },
  };
}

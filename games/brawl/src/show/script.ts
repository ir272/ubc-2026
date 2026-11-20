// The match script: one Ringout show against the platform's Show interface.
//
// It uses only show.sleep, show.elapsed, show.signal and `deps`: no timers, no Date, no
// Math.random. So the same script runs in node (channel.ts), in the browser harness on a fake
// Show, and on a virtual clock for captures and tests. The order of phases and feed events is
// "The show" in ARCH.md; the event shapes are src/show/events.ts.
//
// A knockout: `life_lost` at once, then TIMING.koHold for the stage to play the knockout live
// (it draws about 0.4 s behind, plus a hold on the lethal hit), then `replay`, then the rest.
//
// The fight never waits for a model. The script steps the sim to keep pace with show.elapsed(),
// fires plan requests at each COACH_PERIOD boundary (one in flight per side at most), and when an
// answer lands it is cleaned, checked and scheduled at the first plan boundary at least 45 ticks
// ahead. A late or broken answer changes nothing.

import type { Entrant, Show, Win } from '../../../../runner/src/types.ts';
import type { FightHeader, FightState, FighterId, Plan, PlanAt, Side, SimEvent, Stance } from '../sim/types.ts';
import { COACH_PERIOD, FIGHTER_IDS, TICK_HZ } from '../sim/types.ts';
import { FIGHTERS, SIM_VERSION, coachView, createFight, hashFight, sanitizePlan, schedulePlan, stepFight } from '../sim/index.ts';
import { TIMING } from './events.ts';
import type { BotCard, Ctx, FeedEventType, FeedEvents, FighterCard } from './events.ts';
import type { BotConfig, Brains } from './brains.ts';
import { cleanStrikes, modelLabel, safeLine } from './brains.ts';
import { airLine, checkLine } from './content.ts';

export interface MatchDeps {
  brains: Brains;
  bots: [BotConfig, BotConfig];
  matchNo: number;
  records: Record<string, { played: number; wins: number }>;
  memories: Record<string, string[]>;
  /** for things that do not decide an outcome */
  random: () => number;
  options?: {
    handicap?: [number, number];
    lives?: number;
    timeLimitTicks?: number;
    timing?: Partial<typeof TIMING>;
    picks?: [FighterId, FighterId];
    /** the stages on offer and a forced stage (captures): the strikes then end on it. Default: STAGES, struck by the bots */
    stages?: string[];
    stage?: string;
    /** EXTRA: the channel's pause after the match, so match_end.nextInMs is right. Default 8000 */
    intermissionMs?: number;
  };
  /** EXTRA: recorded in the seeded window. Default: a name built from SIM_VERSION */
  simHash?: string;
}

export interface MatchResult {
  winnerId: string;
  loserId: string;
  winner: Side;
  lives: [number, number];
  damage: [number, number];
  ticks: number;
  fighters: [FighterId, FighterId];
  plansByStance: Record<string, number>;
  planChanges: number;
}

/** side 0 red, side 1 blue (fixed) */
export const SIDE_COLORS: [string, string] = ['#ff3b30', '#2f6bff'];
export const DEFAULT_LIVES = 2;
export const DEFAULT_TIME_LIMIT_TICKS = 10_800; // 3 minutes
export const DEFAULT_INTERMISSION_MS = 8000;

const TICK_MS = 1000 / TICK_HZ;
const LOOP_MS = 50; // how often the fight loop wakes
const PLAN_LEAD = 45; // ticks between an answer landing and the earliest tick it may take effect
const STATE_EVERY = 120; // ticks between `state` checkpoints in the feed
const RING_EVERY = 30; // ticks between private checkpoints for replays
const RING_SIZE = 24;
const REPLAY_BACK = 150; // replays start about this many ticks before the knockout
const REPLAY_SPEED = 0.5;
const SAFETY_TICKS = 3 * 60 * TICK_HZ; // past regulation + this, the script calls the fight itself

/** the fighters on offer. The owner is choosing the cast one at a time; ids not listed stay out of the select */
export const ROSTER: FighterId[] = ['gantry', 'vise', 'kiln', 'tick', 'hexer', 'mimic']; // the Count, the Wolf, the Empty Armour, the Magpie, the Hexer, the Mimic
/** the stages on offer in the stage select (ids of the drawn sets in src/ink/sets). One platform layout for all. */
export const STAGES: string[] = ['belfry', 'shelf', 'graveyard', 'ship', 'map', 'rooftops'];
/** the stages' names, for the bots' strike prompt */
export const STAGE_NAMES: Record<string, string> = {
  belfry: 'The Belfry',
  shelf: 'The Long Shelf',
  graveyard: 'Gallows Hill',
  ship: 'The Night Ship',
  map: 'The Map Table',
  rooftops: 'Lamp Street',
};

/**
 * The stage strike: sides take turns, `first` striking first; on its turn a side crosses out the
 * first stage in its own order that is still standing (any standing stage when its order has none
 * left). One is left and that one is played. A forced stage is never struck, so the strikes end on it.
 */
export function resolveStrikes(stages: string[], orders: [string[], string[]], first: Side, forced?: string): { strikes: { by: Side; stage: string }[]; stage: string | undefined } {
  const standing = [...new Set(stages)];
  const keep = forced && standing.includes(forced) ? forced : undefined;
  const strikes: { by: Side; stage: string }[] = [];
  let side: Side = first;
  while (standing.length > 1) {
    const pick = orders[side].find((id) => id !== keep && standing.includes(id)) ?? standing.find((id) => id !== keep)!;
    standing.splice(standing.indexOf(pick), 1);
    strikes.push({ by: side, stage: pick });
    side = side === 0 ? 1 : 0;
  }
  return { strikes, stage: standing[0] };
}

export function fighterCards(): FighterCard[] {
  return ROSTER.map((id) => {
    const f = FIGHTERS[id];
    return { id, name: f.name, role: f.role, blurb: f.blurb, stats: { ...f.stats } };
  });
}

function clone<T>(x: T): T {
  return JSON.parse(JSON.stringify(x)) as T;
}

function hexFrom(rand: () => number, chars: number): string {
  let s = '';
  for (let i = 0; i < chars; i++) s += Math.floor(rand() * 16).toString(16);
  return s;
}

/** the same plan apart from the words */
function sameDials(a: Plan, b: Plan): boolean {
  return (
    a.stance === b.stance &&
    a.aggression === b.aggression &&
    a.range === b.range &&
    a.grabMix === b.grabMix &&
    a.edge === b.edge &&
    a.recover === b.recover &&
    a.order === b.order
  );
}

interface KoRec {
  tick: number;
  side: Side;
  by: Side;
  kb: number;
  damage: number;
  from: { tick: number; s: FightState };
  plans: PlanAt[];
}

export async function runMatch(show: Show, deps: MatchDeps): Promise<MatchResult> {
  const opened: Win[] = [];
  try {
    return await run(show, deps, opened);
  } catch (e) {
    // the match aborted: void what is still open or locked (the runner does this too)
    for (const w of opened) {
      try {
        await show.voidWindow(w);
      } catch {
        /* settled already, or the show is gone */
      }
    }
    throw e;
  }
}

async function run(show: Show, deps: MatchDeps, opened: Win[]): Promise<MatchResult> {
  const T = { ...TIMING, ...(deps.options?.timing ?? {}) };
  const rand = deps.random;
  const brains = deps.brains;
  const bots = deps.bots;
  const lives = deps.options?.lives ?? DEFAULT_LIVES;
  const timeLimitTicks = deps.options?.timeLimitTicks ?? DEFAULT_TIME_LIMIT_TICKS;
  const intermissionMs = deps.options?.intermissionMs ?? DEFAULT_INTERMISSION_MS;
  const simHash = deps.simHash ?? `ringout-sim-${SIM_VERSION}`;
  const roster = fighterCards();
  const other = (side: Side): Side => (side === 0 ? 1 : 0);

  const recordOf = (id: string) => ({ ...(deps.records[id] ?? { played: 0, wins: 0 }) });
  const cards = bots.map(
    (b, i): BotCard => ({ id: b.id, name: b.name, model: b.model, modelLabel: b.label ?? modelLabel(b.model), color: SIDE_COLORS[i]!, record: recordOf(b.id) }),
  ) as [BotCard, BotCard];

  const ctx: Ctx = { matchNo: deps.matchNo, bots: cards, roster };
  // the stages on offer; the bots strike them down to one after the fighters flip (dressing only:
  // every stage plays on one layout)
  const stages = deps.options?.stages?.length ? deps.options.stages : STAGES;
  ctx.stages = [...stages];
  let s: FightState | null = null;
  const snap = (): Ctx => {
    const c: Ctx = { ...ctx };
    if (s) c.lives = [s.fighters[0].lives, s.fighters[1].lives];
    else if (ctx.header) c.lives = [lives, lives];
    return c;
  };
  const emit = <K extends FeedEventType>(type: K, data: FeedEvents[K]) => show.emit({ type, at: show.elapsed(), data });
  const sleepUntil = (at: number) => show.sleep(Math.max(0, at - show.elapsed()));
  /** the value if `p` settles before `at` (ms since announce), else undefined */
  const raceUntil = async <V>(p: Promise<V>, at: number): Promise<V | undefined> => {
    let done = false;
    let val: V | undefined;
    const watched = p.then(
      (v) => {
        done = true;
        val = v;
      },
      () => {
        done = true;
      },
    );
    if (at - show.elapsed() > 0) await Promise.race([watched, sleepUntil(at)]);
    else await Promise.race([watched, Promise.resolve()]);
    return done ? val : undefined;
  };

  brains.startMatch?.(bots);

  // ---- 1. the call --------------------------------------------------------------------------
  const matchId = `ringout-${deps.matchNo}-${hexFrom(rand, 6)}`;
  const entrants: Entrant[] = cards.map((c) => ({ id: c.id, name: c.name, color: c.color, record: c.record }));
  show.announce({
    matchId,
    title: `${bots[0].name} vs ${bots[1].name}`,
    entrants,
    meta: { game: 'ringout', matchNo: deps.matchNo, sideColors: SIDE_COLORS, simHash, models: [bots[0].model, bots[1].model] },
  });
  const callAt = show.elapsed();
  emit('call', { ctx: snap(), durationMs: T.call });
  await sleepUntil(callAt + T.call);

  // ---- 2a. the choosing (hidden picks, then both flip together) -----------------------------
  const selAt = show.elapsed();
  emit('select_open', { ctx: snap(), durationMs: T.select, revealInMs: T.selectReveal });
  let picks: [FighterId, FighterId];
  const forced = deps.options?.picks;
  // the stage strike orders are asked now too, in parallel with the pick, with the same deadline
  const stageInfo = stages.map((id) => ({ id, name: STAGE_NAMES[id] ?? id }));
  const forcedOk = !!(forced && FIGHTER_IDS.includes(forced[0]) && FIGHTER_IDS.includes(forced[1]));
  const askStrikes = (side: Side): Promise<string[] | undefined> => {
    if (!brains.strikeStages) return Promise.resolve(undefined);
    try {
      return brains.strikeStages(bots[side], {
        stages: stageInfo.map((x) => ({ ...x })),
        ...(forcedOk ? { mine: forced![side], theirs: forced![other(side)] } : {}),
        opponentName: bots[other(side)].name,
      });
    } catch {
      return Promise.resolve(undefined);
    }
  };
  const strikeP = [askStrikes(0), askStrikes(1)] as const;
  const strikeDeadline = selAt + T.selectReveal - 250;
  if (forced && FIGHTER_IDS.includes(forced[0]) && FIGHTER_IDS.includes(forced[1])) {
    picks = [forced[0], forced[1]];
  } else {
    const ask = (side: Side) =>
      brains.pickFighter(bots[side], {
        roster,
        opponent: { name: bots[other(side)].name, model: bots[other(side)].model },
        memory: (deps.memories[bots[side].id] ?? []).slice(-3),
      });
    const p0 = ask(0);
    const p1 = ask(1);
    const deadline = selAt + T.selectReveal - 250;
    const r0 = await raceUntil(p0, deadline);
    const r1 = await raceUntil(p1, deadline);
    const valid = (f: unknown): f is FighterId => ROSTER.includes(f as FighterId);
    const any = () => ROSTER[Math.floor(rand() * ROSTER.length)]!;
    picks = [valid(r0) ? r0 : any(), valid(r1) ? r1 : any()];
  }
  const orders = [] as unknown as [string[], string[]];
  for (const side of [0, 1] as Side[]) {
    const got = cleanStrikes(await raceUntil(strikeP[side], strikeDeadline), stageInfo);
    // a missing or partial answer is finished with a shuffle of the rest
    const rest = stages.filter((id) => !got.includes(id));
    for (let i = rest.length - 1; i > 0; i--) {
      const j = Math.floor(rand() * (i + 1));
      [rest[i], rest[j]] = [rest[j]!, rest[i]!];
    }
    orders[side] = [...got, ...rest];
  }
  const struck = resolveStrikes(stages, orders, (deps.matchNo % 2) as Side, deps.options?.stage);
  await sleepUntil(selAt + T.selectReveal);
  ctx.picks = picks;
  ctx.strikes = struck.strikes;
  if (struck.stage) ctx.stage = struck.stage;
  emit('picks', { ctx: snap() });

  // taunts are asked now so they are ready for the versus screen (they decide nothing)
  const tauntFor = (side: Side) => {
    const info = { mine: picks[side], theirs: picks[other(side)], opponentName: bots[other(side)].name };
    const gen = () => brains.taunt(bots[side], info);
    return gen()
      .catch(() => '')
      .then((first) => airLine('taunt', first, gen, () => safeLine('taunt', rand, { mine: info.mine, theirs: info.theirs, opp: info.opponentName })));
  };
  const tauntP = [tauntFor(0), tauntFor(1)] as const;
  await sleepUntil(selAt + T.select);

  // ---- 2b. versus and taunts ---------------------------------------------------------------
  const vsAt = show.elapsed();
  emit('versus', { ctx: snap(), durationMs: T.versus });
  const taunts: [string, string] = ['', ''];
  for (const side of [0, 1] as Side[]) {
    await sleepUntil(vsAt + T.versus * (side === 0 ? 0.25 : 0.5));
    const got = await raceUntil(tauntP[side], vsAt + T.versus * (side === 0 ? 0.45 : 0.7));
    taunts[side] = got?.text ?? safeLine('taunt', rand, { mine: picks[side], theirs: picks[other(side)], opp: bots[other(side)].name });
    emit('taunt', { side, text: taunts[side] });
  }
  ctx.taunts = [taunts[0], taunts[1]];
  await sleepUntil(vsAt + T.versus);

  // ---- 3. predictions: window A, seeded --------------------------------------------------------
  const outcomes = bots.map((b) => ({ id: b.id, label: b.name, entrantId: b.id }));
  const winA = await show.openWindow({ question: 'Who wins?', outcomes, durationMs: T.predictions, seeded: true, simHash });
  opened.push(winA);
  emit('predictions', { ctx: snap(), windowId: winA.windowId, durationMs: T.predictions });
  const locked = await show.lock(winA);
  // nobody could know the seed while betting was open; without one (a broken lock) derive one now
  const seed = locked.seed && /^[0-9a-f]{32,}$/i.test(locked.seed) ? locked.seed : hexFrom(rand, 64);

  // ---- 4. the fight ---------------------------------------------------------------------------
  const header: FightHeader = {
    seed,
    fighters: picks,
    handicap: deps.options?.handicap ?? [0, 0],
    lives,
    timeLimitTicks,
  };
  ctx.header = header;
  const st = createFight(header);
  s = st;

  let baseTick = 0;
  let startAt = show.elapsed() + T.countdown;
  const current: [Plan, Plan] = [clone(st.plans[0]), clone(st.plans[1])];
  const planLog: PlanAt[] = [];
  const inflight: [number, number] = [0, 0];
  let gen = 1; // bumped at every knockout: answers to older questions are dropped
  let over = false;
  const plansByStance: Record<string, number> = {};
  let planChanges = 0;
  const ring: { tick: number; s: FightState }[] = [];
  const kos: KoRec[] = [];
  const lastKb: [number, number] = [0, 0];

  const nowTick = () => baseTick + Math.floor((show.elapsed() - startAt) / TICK_MS);
  const tickAt = (tick: number) => Math.round(startAt + (tick - baseTick) * TICK_MS);

  const applyPlan = (side: Side, atTick: number, plan: Plan, thoughtMs: number, repeat = false) => {
    let tick = atTick;
    const prev = current[side];
    if (!repeat) {
      if (!sameDials(plan, prev)) planChanges++;
      plansByStance[plan.stance] = (plansByStance[plan.stance] ?? 0) + 1;
    }
    current[side] = plan;
    // the sim applies a plan on the step that reaches its tick, and never earlier than s.tick + 1
    tick = Math.max(st.tick + 1, tick);
    const pa: PlanAt = { side, tick, plan };
    schedulePlan(st, clone(pa));
    planLog.push(pa);
    emit('plan', { side, tick, plan, thoughtMs: Math.round(thoughtMs) });
  };

  /** clean and check a plan's read; one regeneration (a fresh plan), then a safe read */
  const checkedPlan = async (side: Side, p: Plan, again: (() => Promise<Plan>) | null, valid: () => boolean): Promise<Plan> => {
    const c = checkLine(p.read, 'read');
    if (c.ok) return { ...p, read: c.text };
    if (again && valid()) {
      try {
        const p2 = sanitizePlan(await again(), p);
        const c2 = checkLine(p2.read, 'read');
        if (c2.ok) return { ...p2, read: c2.text };
      } catch {
        /* fall through */
      }
    }
    return { ...p, read: safeLine('read', rand, { stance: p.stance }) };
  };

  const requestPlan = (side: Side) => {
    if (inflight[side] || over) return;
    const myGen = gen;
    inflight[side] = myGen;
    const view = coachView(st, header, side);
    const prev = current[side];
    const askedAt = show.elapsed();
    const valid = () => gen === myGen && !over;
    const ask = () => brains.plan(bots[side], view, prev);
    (async () => {
      let p: Plan;
      try {
        p = sanitizePlan(await ask(), prev);
      } catch {
        return; // broken answer: the old plan stays
      }
      if (!valid()) return;
      if (sameDials(p, prev) && (p.read === prev.read || !p.read)) return; // nothing new (a timeout returns prev)
      p = await checkedPlan(side, p, ask, valid);
      if (!valid()) return;
      // nowTick() is negative during the countdown, so an early answer takes effect at the start
      // (applyPlan moves tick 0 to tick 1, the first step)
      let tick = Math.max(0, Math.ceil((nowTick() + PLAN_LEAD) / COACH_PERIOD) * COACH_PERIOD);
      if (tick <= st.tick && st.tick > 0) tick = Math.ceil((st.tick + 1) / COACH_PERIOD) * COACH_PERIOD;
      applyPlan(side, tick, p, show.elapsed() - askedAt);
    })().finally(() => {
      if (inflight[side] === myGen) inflight[side] = 0;
    });
  };

  const pushRing = () => {
    if (ring.length && ring[ring.length - 1]!.tick === st.tick) return;
    ring.push({ tick: st.tick, s: clone(st) });
    if (ring.length > RING_SIZE) ring.shift();
  };
  const emitState = () => emit('state', { ctx: snap(), tick: st.tick, at: tickAt(st.tick), s: clone(st), hash: hashFight(st) });

  /** the replay start (about REPLAY_BACK ticks back) and the plans that take effect inside it */
  const replayFrom = (toTick: number) => {
    let from = ring[0]!;
    for (const c of ring) if (c.tick <= toTick - REPLAY_BACK) from = c;
    // a checkpoint at tick X has applied every plan up to X and carries the later ones in
    // s.pending; listing those again is harmless (one pending plan per side and tick)
    const plans = planLog.filter((p) => p.tick > from.tick && p.tick <= toTick);
    return { from: { tick: from.tick, s: clone(from.s) }, plans: clone(plans) };
  };

  // fight start
  emit('fight_start', { ctx: snap(), startAt });
  pushRing();
  emitState();
  requestPlan(0);
  requestPlan(1);

  let winner: Side | null = null;
  let forcedEnd = false;

  /** step the sim in pace with the clock until a knockout or the end */
  const fightUntilStop = async (): Promise<Extract<SimEvent, { t: 'ko' }>[]> => {
    for (;;) {
      const target = nowTick();
      while (st.tick < target) {
        const evs = stepFight(st, header);
        const kosNow: Extract<SimEvent, { t: 'ko' }>[] = [];
        for (const ev of evs) {
          if (ev.t === 'hit') {
            lastKb[ev.to] = ev.kb;
            if (ev.strength !== 'light') emit('hit', { tick: ev.tick, by: ev.by, to: ev.to, move: ev.move, damage: ev.damage, total: ev.total, strength: ev.strength });
          } else if (ev.t === 'sudden_death') emit('sudden_death', { tick: ev.tick });
          else if (ev.t === 'ko') kosNow.push(ev);
        }
        if (st.tick % RING_EVERY === 0) pushRing();
        if (kosNow.length || st.phase === 'over') return kosNow;
        if (st.tick % STATE_EVERY === 0) emitState();
        if (st.tick % COACH_PERIOD === 0) {
          requestPlan(0);
          requestPlan(1);
        }
        if (st.tick > timeLimitTicks + SAFETY_TICKS) {
          forcedEnd = true;
          return [];
        }
      }
      await show.sleep(LOOP_MS);
    }
  };

  for (;;) {
    const kosNow = await fightUntilStop();
    if (forcedEnd || (!kosNow.length && st.phase === 'over')) break;

    // ---- 5. a life is lost: replay, corner talk, the break window, resume ----------------------
    gen++; // answers to questions asked before the knockout no longer count
    inflight[0] = 0;
    inflight[1] = 0;
    const koTick = st.tick;
    const final = st.phase === 'over';
    const breakAt = show.elapsed();
    // the break: the live knockout plays out on the stage (koHold), then the replay, then (unless
    // that was the last life) corner talk, the window and the resume countdown
    const hold = final ? T.koHoldFinal : T.koHold;
    const replayAt = breakAt + hold;
    const durationMs = hold + T.replay + (final ? 0 : T.cornerTalk + T.breakWindow + T.resumeCountdown);
    pushRing();
    const rp = replayFrom(koTick);
    for (const ko of kosNow) {
      emit('life_lost', { ctx: snap(), tick: koTick, side: ko.side, by: ko.by, damage: ko.damage, move: ko.move, edge: ko.edge, final, durationMs });
      kos.push({ tick: koTick, side: ko.side, by: ko.by, kb: lastKb[ko.side], damage: ko.damage, ...rp });
    }
    if (final) {
      over = true;
      await sleepUntil(replayAt);
      emit('replay', { ctx: snap(), from: rp.from, plans: rp.plans, toTick: koTick, speed: REPLAY_SPEED, durationMs: T.replay });
      await sleepUntil(replayAt + T.replay);
      break;
    }

    // the longer think starts at the knockout, runs through the hold and the replay, and must be
    // done before the window opens
    const lostSide = kosNow[0]!.side;
    const cornerDeadline = replayAt + T.replay + T.cornerTalk - 600;
    const cornerFor = async (side: Side) => {
      const view = coachView(st, header, side);
      const prev = current[side];
      const askedAt = show.elapsed();
      const info = { view, lostLife: side === lostSide, prev };
      const res = await brains.corner(bots[side], info);
      const plan = await checkedPlan(side, sanitizePlan(res.plan, prev), null, () => true);
      const timeLeft = () => cornerDeadline - show.elapsed() > 4000;
      const talk = await airLine(
        'corner',
        res.talk,
        timeLeft() ? () => brains.corner(bots[side], info).then((r) => r.talk) : null,
        () => safeLine('corner', rand, { lost: side === lostSide, oppDmg: view.opp.damage }),
      );
      return { plan, talk: talk.text, thoughtMs: show.elapsed() - askedAt };
    };
    const cornerP = [cornerFor(0), cornerFor(1)] as const;
    await sleepUntil(replayAt);
    emit('replay', { ctx: snap(), from: rp.from, plans: rp.plans, toTick: koTick, speed: REPLAY_SPEED, durationMs: T.replay });
    await sleepUntil(replayAt + T.replay);
    for (const side of [0, 1] as Side[]) {
      if (side === 1) await sleepUntil(replayAt + T.replay + T.cornerTalk * 0.4);
      const got = await raceUntil(cornerP[side], cornerDeadline);
      const plan = got?.plan ?? current[side];
      const text = got?.talk ?? safeLine('corner', rand, { lost: side === lostSide });
      emit('corner_talk', { side, text, plan });
      // plans answered before the knockout may still be pending for later ticks: the corner plan
      // is scheduled again at each of those ticks (after them, so it wins) and at the resume tick
      const stale = [...new Set(st.pending.filter((p) => p.side === side && p.tick > koTick).map((p) => p.tick))];
      if (!sameDials(plan, current[side]) || plan.read !== current[side].read || stale.length) {
        applyPlan(side, koTick, plan, got?.thoughtMs ?? 0);
        for (const t of stale) applyPlan(side, t, plan, got?.thoughtMs ?? 0, true);
      }
    }
    await sleepUntil(replayAt + T.replay + T.cornerTalk);

    const win = await show.openWindow({ question: 'Who wins?', outcomes, durationMs: T.breakWindow, seeded: false });
    opened.push(win);
    emit('break_window', { windowId: win.windowId, durationMs: T.breakWindow });
    await show.lock(win);

    baseTick = st.tick;
    startAt = show.elapsed() + T.resumeCountdown;
    emit('fight_resume', { ctx: snap(), tick: st.tick, startAt });
    pushRing();
    emitState();
  }
  over = true;

  // ---- 6. the verdict -----------------------------------------------------------------------
  if (!forcedEnd && st.winner !== -1) winner = st.winner;
  else {
    forcedEnd = true;
    const [a, b] = st.fighters;
    winner = a.lives !== b.lives ? (a.lives > b.lives ? 0 : 1) : a.damage !== b.damage ? (a.damage < b.damage ? 0 : 1) : rand() < 0.5 ? 0 : 1;
  }
  const w = winner as Side;
  const l = other(w);
  const livesNow: [number, number] = [st.fighters[0].lives, st.fighters[1].lives];
  const damageNow: [number, number] = [Math.round(st.fighters[0].damage), Math.round(st.fighters[1].damage)];
  const best = kos.length
    ? kos.reduce((acc, k) => {
        const score = (x: KoRec) => (x.by === w ? 1000 : 0) + x.kb;
        return score(k) >= score(acc) ? k : acc;
      })
    : null;
  const verdictAt = show.elapsed();
  emit('match_end', {
    ctx: snap(),
    winner: w,
    winnerId: bots[w].id,
    tick: st.tick,
    lives: livesNow,
    damage: damageNow,
    stats: clone(st.stats),
    bestKo: best ? { from: best.from, plans: best.plans, toTick: best.tick, by: best.by } : null,
    durationMs: T.verdict,
    nextInMs: T.verdict + intermissionMs,
  });

  // settle every window with the winner
  for (const win of opened) {
    try {
      await show.lock(win); // no-op when already locked
    } catch {
      /* already settled */
    }
    await show.settle(win, bots[w].id);
  }

  const result: MatchResult = {
    winnerId: bots[w].id,
    loserId: bots[l].id,
    winner: w,
    lives: livesNow,
    damage: damageNow,
    ticks: st.tick,
    fighters: picks,
    plansByStance,
    planChanges,
  };
  show.end(forcedEnd ? { ...result, forcedEnd: true } : result);

  // records and memories (three lines each) while the verdict is up
  const topStance = (side: Side): Stance | 'mixed' => {
    const n: Record<string, number> = {};
    for (const p of planLog) if (p.side === side) n[p.plan.stance] = (n[p.plan.stance] ?? 0) + 1;
    const top = Object.entries(n).sort((a, b) => b[1] - a[1])[0];
    return top ? (top[0] as Stance) : 'mixed';
  };
  const name = (f: FighterId) => FIGHTERS[f].name;
  const memDeadline = verdictAt + T.verdict - 1000;
  const memP = ([0, 1] as Side[]).map(async (side) => {
    const won = side === w;
    const summary = `${won ? 'Beat' : 'Lost to'} ${bots[other(side)].name} as ${name(picks[side])} vs ${name(picks[other(side)])}, lives ${livesNow[side]} to ${livesNow[other(side)]}. They leaned ${topStance(other(side))}.`;
    const line = await raceUntil(
      brains.remember(bots[side], { won, summary }).catch(() => summary),
      memDeadline,
    );
    const aired = await airLine('memory', line ?? summary, null, () => summary);
    return { side, won, line: aired.text };
  });
  for (const side of [0, 1] as Side[]) {
    const id = bots[side].id;
    const r = deps.records[id] ?? { played: 0, wins: 0 };
    deps.records[id] = { played: r.played + 1, wins: r.wins + (side === w ? 1 : 0) };
  }
  for (const m of await Promise.all(memP)) {
    const id = bots[m.side].id;
    deps.memories[id] = [...(deps.memories[id] ?? []), m.line].slice(-3);
  }
  await sleepUntil(verdictAt + T.verdict);
  return result;
}

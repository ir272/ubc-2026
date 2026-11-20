// Ringout fight simulation: the public API (see ARCH.md).
import type {
  CoachFighterView, CoachView, FightHeader, FightState, FighterId, FighterState, Plan, PlanAt, Side, SimEvent, Stance,
} from './types.ts';
import { COACH_PERIOD, DEFAULT_PLAN, FIGHTER_IDS, STANCES, TICK_HZ } from './types.ts';
import { ARENA } from './arena.ts';
import { FIGHTERS } from './fighters.ts';
import { createFight, ctlOf, emptyHabits, schedulePlan, stepFight } from './engine.ts';
import type { Habits, Track } from './engine.ts';
import { COACHES } from './coach.ts';
import { fnv32, hash64, rnd, seedRng } from './math.ts';

export { ARENA, FIGHTERS, COACHES, createFight, stepFight, schedulePlan };
export * from './types.ts';

export const SIM_VERSION = 'ringout-sim-6';

/** short hex of the whole state: same in node and any browser */
export function hashFight(s: FightState): string {
  // the queue of not-yet-active plans is excluded: it depends on when plans arrived, not on the fight
  return hash64(JSON.stringify(s, (k, v) => (k === 'pending' ? undefined : v)));
}

// ------------------------------------------------------------------------------------------------
// What a coach sees
// ------------------------------------------------------------------------------------------------

function whereOf(f: FighterState): string {
  if (f.action === 'dead' || f.action === 'respawn') return 'respawning';
  if (f.action === 'ledgehang' || f.action === 'ledgeclimb') return 'ledge';
  if (!f.grounded && (f.x < ARENA.main.x0 - 0.2 || f.x > ARENA.main.x1 + 0.2 || f.y < -0.3)) return 'offstage';
  if (f.platform >= 0) return 'platform';
  const third = (ARENA.main.x1 - ARENA.main.x0) / 3;
  if (f.x < ARENA.main.x0 + third) return 'left';
  if (f.x > ARENA.main.x1 - third) return 'right';
  return 'centre';
}

function fighterView(f: FighterState): CoachFighterView {
  return { fighter: f.fighter, damage: Math.round(f.damage), lives: f.lives, where: whereOf(f), airborne: !f.grounded };
}

function addHabits(a: Habits, b: Habits): Habits {
  const o = emptyHabits();
  for (const k of Object.keys(o) as (keyof Habits)[]) o[k] = a[k] + b[k];
  return o;
}

/**
 * The stance the opponent's hands appear to be playing, from behaviour only (never its plan): over the last two coach windows
 * (3 to 6 s), its habit rates, the gap it keeps, its time in shield, how near the middle it stays, its speed toward me, and its
 * time attacking and in the air, scored against the behaviour each stance produces (a per-stance Gaussian fitted offline over
 * all fighters, dials and opponents; see NOTES). 'unclear' only when it was barely in play.
 */
export const STANCE_FEATURES = ['approaches', 'retreats', 'strikes', 'grabs', 'shields', 'dodges', 'shots', 'jumps', 'gap', 'shieldShare', 'centre', 'toward', 'attacking', 'airborne', 'turns', 'still', 'dashIn', 'dashOut', 'swingsFirst', 'punishShare', 'atTheEdge'];
/** the behaviour features of one fighter over the last two coach windows and the current one (what two views have shown) */
export function stanceFeatures(t: Track, windowTicks: number): number[] | null {
  const h = addHabits(addHabits(t.pprev, t.prev), t.cur);
  const F = { ...t.fcur } as Record<string, number>;
  for (const k of Object.keys(F)) F[k] = (t.fcur as any)[k] + (t.fprev as any)[k] + (t.fpprev as any)[k];
  const w = Math.max(1, (windowTicks + COACH_PERIOD) / COACH_PERIOD);
  const m = F.m, n = F.n;
  if (m < 60) return null;
  const x = [h.approaches / w, h.retreats / w, h.strikes / w, h.grabs / w, h.shields / w, h.dodges / w, h.shots / w, h.jumps / w];
  x.push(n > 30 ? F.gapSum / n : 2.5, n > 30 ? F.shieldTicks / n : 0.2);
  x.push(F.absX / m, (F.toward / m) * 100, F.atk / m, F.air / m, F.turns / w, F.still / m, F.dashIn / w, F.dashOut / w);
  x.push((F.starts - F.puns) / w, F.starts > 0 ? F.puns / F.starts : 0.3, n > 30 ? F.edge / n : 0.25);
  // square roots of the counts (they are skewed: a few windows are full of dash dancing, most have none)
  for (const j of SQRT_OF) x.push(Math.sqrt(Math.max(0, x[j])));
  return x;
}
const SQRT_OF = [0, 1, 2, 3, 4, 5, 6, 7, 14, 16, 17, 18];
/** a linear score per stance, fitted offline (multinomial logistic regression; refit after any controller change) */
export const STANCE_MODEL: Record<Stance, { w: number[]; b: number }> = {"rush":{"w":[-0.33605,-0.29063,-0.18309,0.52908,0.31495,-0.6479,-1.42276,0.43017,-0.46979,-2.92063,-0.28549,0.2116,1.85936,2.24321,0.1222,0.52883,0.34484,-0.66546,0.32343,0.01764,-0.59735,-0.14936,0.41827,0.00674,0.12784,-0.14799,0.28046,0.51676,-0.21158,-0.21653,0.869,0.47485,0.32446],"b":0.55761},"keepaway":{"w":[0.05668,0.25644,0.0388,-0.10694,-0.11415,0.45006,2.92873,0.08784,0.17415,-2.76732,0.19753,-0.16271,-0.03491,-1.568,-0.11599,-0.02871,-0.10972,0.64255,-0.0817,-0.10662,0.64891,-0.15243,-0.15738,0.05919,-0.18174,-1.22087,-0.11687,-1.44942,0.03863,-1.55509,-0.56935,1.3761,0.1684],"b":0.00145},"bait":{"w":[0.14151,0.0174,0.10393,-0.44635,-0.13177,0.88648,-1.01757,-0.17726,0.03706,4.1028,0.12663,-0.05503,-0.41784,-0.8347,-0.27988,-2.75757,-0.06395,-0.10469,-0.01485,0.05032,-0.34789,0.12149,-0.12697,0.13516,-0.38617,0.05077,0.14169,-0.06908,0.211,1.97772,0.29482,-0.41014,-0.53564],"b":0.27721},"wall":{"w":[0.13786,0.01678,0.04036,0.02421,-0.06902,-0.68863,-0.48841,-0.34075,0.25858,1.58514,-0.03867,0.00614,-1.4066,0.15949,0.27367,2.25745,-0.17117,0.1276,-0.22688,0.03866,0.29633,0.1803,-0.13392,-0.20108,0.44008,1.31808,-0.30528,1.00174,-0.03805,-0.2061,-0.59447,-1.44082,0.04277],"b":-0.18626}};
export function inferFromFeatures(x: number[] | null): Stance | 'unclear' {
  if (!x) return 'unclear';
  let best: Stance | 'unclear' = 'unclear', bs = -1e9;
  for (const st of STANCES) {
    const M = STANCE_MODEL[st];
    let sc = M.b;
    for (let i = 0; i < x.length; i++) sc += M.w[i] * x[i];
    if (sc > bs) { bs = sc; best = st; }
  }
  return best;
}

export function coachView(s: FightState, header: FightHeader, side: Side): CoachView {
  const ctl = ctlOf(s);
  const me = s.fighters[side], opp = s.fighters[1 - side];
  const otr = ctl.track[1 - side];
  const habits = addHabits(otr.prev, otr.cur);
  const windowTicks = COACH_PERIOD + (s.tick % COACH_PERIOD);
  const sn = ctl.track[side].since;
  const dm = Math.abs(me.x), dop = Math.abs(opp.x);
  return {
    tick: s.tick,
    secondsLeft: Math.max(0, Math.round((header.timeLimitTicks - s.tick) / TICK_HZ)),
    sudden: s.phase === 'sudden',
    me: fighterView(me),
    opp: fighterView(opp),
    gap: Math.round(Math.abs(me.x - opp.x) * 10) / 10,
    centre: dm + 0.5 < dop ? 'me' : dop + 0.5 < dm ? 'opp' : 'even',
    oppHabits: habits,
    oppLooksLike: inferFromFeatures(stanceFeatures(otr, s.tick < COACH_PERIOD ? Math.max(60, s.tick) : windowTicks)),
    since: {
      plan: { ...sn.plan }, ticks: s.tick - sn.tick, dealt: Math.round(sn.dealt), taken: Math.round(sn.taken), myHits: sn.myHits,
      oppHits: sn.oppHits, myGrabs: sn.myGrabs, oppGrabs: sn.oppGrabs, myWhiffs: sn.myWhiffs, shieldedByOpp: sn.shieldedByOpp,
    },
  };
}

// ------------------------------------------------------------------------------------------------
// Plan repair
// ------------------------------------------------------------------------------------------------

function lowerKeys(o: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const k of Object.keys(o)) out[k.toLowerCase().replace(/[^a-z0-9]/g, '')] = o[k];
  return out;
}

function word(v: unknown): string {
  return typeof v === 'string' ? v.toLowerCase().replace(/[^a-z]/g, '') : typeof v === 'number' ? String(v) : '';
}

function num01(v: unknown, prev: number): number {
  let n: number;
  if (typeof v === 'number') n = v;
  else if (typeof v === 'string') {
    const t = v.trim().toLowerCase();
    const m = t.match(/-?\d+(\.\d+)?/);
    if (m) {
      n = parseFloat(m[0]);
      if (t.indexOf('%') >= 0) n /= 100;
    } else if (/(very high|max|all)/.test(t)) n = 0.9;
    else if (/high/.test(t)) n = 0.75;
    else if (/(low|min|patient)/.test(t)) n = 0.25;
    else if (/(mid|medium|balanced|normal)/.test(t)) n = 0.5;
    else return prev;
  } else return prev;
  if (!isFinite(n)) return prev;
  if (n > 1 && n <= 10) n = n / 10;
  else if (n > 10) n = n / 100;
  n = Math.max(0, Math.min(1, n));
  return Math.round(n * 100) / 100;
}

function pickEnum<T extends string>(v: unknown, map: Record<string, T>, prev: T): T {
  const w = word(v);
  if (!w) return prev;
  if (map[w]) return map[w];
  for (const k of Object.keys(map)) if (w.indexOf(k) >= 0) return map[k];
  return prev;
}

const STANCE_MAP: Record<string, Stance> = {
  rush: 'rush', aggro: 'rush', aggressive: 'rush', pressure: 'rush', attack: 'rush', charge: 'rush', rushdown: 'rush',
  keepaway: 'keepaway', keepout: 'keepaway', zone: 'keepaway', zoning: 'keepaway', zoner: 'keepaway', range: 'keepaway', away: 'keepaway', kite: 'keepaway', camp: 'keepaway',
  bait: 'bait', baitandpunish: 'bait', punish: 'bait', counter: 'bait', whiff: 'bait', wait: 'bait',
  wall: 'wall', defend: 'wall', defensive: 'wall', defense: 'wall', block: 'wall', shield: 'wall', turtle: 'wall', hold: 'wall',
};
const RANGE_MAP: Record<string, Plan['range']> = { close: 'close', near: 'close', short: 'close', tight: 'close', mid: 'mid', medium: 'mid', middle: 'mid', far: 'far', long: 'far', max: 'far' };
const EDGE_MAP: Record<string, Plan['edge']> = { deep: 'deep', offstage: 'deep', chase: 'deep', dive: 'deep', ledge: 'ledge', edge: 'ledge', hog: 'ledge', stage: 'stage', onstage: 'stage', stay: 'stage', safe: 'stage' };
const REC_MAP: Record<string, Plan['recover']> = { high: 'high', up: 'high', over: 'high', low: 'low', under: 'low', down: 'low', mix: 'mix', mixed: 'mix', random: 'mix', vary: 'mix', both: 'mix' };
const ORDER_MAP: Record<string, Plan['order']> = { none: 'none', no: 'none', nothing: 'none', null: 'none', special: 'special', signature: 'special', kill: 'kill', finish: 'kill', ko: 'kill', killnow: 'kill', goforthekill: 'kill' };

/** Repair anything a language model returns into a legal Plan. Missing fields keep `prev`. */
export function sanitizePlan(raw: unknown, prev: Plan): Plan {
  const base: Plan = { ...DEFAULT_PLAN, ...(prev || {}) };
  base.order = 'none';
  let obj: unknown = raw;
  if (typeof raw === 'string') {
    const t = raw;
    const a = t.indexOf('{'), b = t.lastIndexOf('}');
    if (a >= 0 && b > a) {
      try { obj = JSON.parse(t.slice(a, b + 1)); } catch {
        try { obj = JSON.parse(t.slice(a, b + 1).replace(/'/g, '"').replace(/,\s*}/g, '}').replace(/([{,]\s*)([a-zA-Z_]+)\s*:/g, '$1"$2":')); } catch { obj = null; }
      }
    } else {
      // a bare stance word
      const st = pickEnum(t, STANCE_MAP, '' as Stance);
      obj = st ? { stance: st } : null;
    }
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return clean(base);
  let o = lowerKeys(obj as Record<string, unknown>);
  if (o.plan && typeof o.plan === 'object') o = { ...o, ...lowerKeys(o.plan as Record<string, unknown>) };
  const p: Plan = { ...base };
  if ('stance' in o) p.stance = pickEnum(o.stance, STANCE_MAP, base.stance);
  if ('aggression' in o) p.aggression = num01(o.aggression, base.aggression);
  if ('range' in o) p.range = pickEnum(o.range, RANGE_MAP, base.range);
  const gm = 'grabmix' in o ? o.grabmix : 'grab' in o ? o.grab : 'grabs' in o ? o.grabs : undefined;
  if (gm !== undefined) p.grabMix = num01(gm, base.grabMix);
  if ('edge' in o) p.edge = pickEnum(o.edge, EDGE_MAP, base.edge);
  const rc = 'recover' in o ? o.recover : 'recovery' in o ? o.recovery : undefined;
  if (rc !== undefined) p.recover = pickEnum(rc, REC_MAP, base.recover);
  if ('order' in o) p.order = pickEnum(o.order, ORDER_MAP, 'none');
  const rd = 'read' in o ? o.read : 'reading' in o ? o.reading : 'note' in o ? o.note : undefined;
  if (rd !== undefined) p.read = typeof rd === 'string' ? rd : '';
  return clean(p);
}

function clean(p: Plan): Plan {
  let read = String(p.read || '').replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/[—–]/g, ', ').replace(/[*_`#<>{}\[\]"]/g, '');
  const words = read.split(/\s+/).filter((w) => w.length > 0).slice(0, 8);
  read = words.join(' ');
  if (read.length > 60) read = read.slice(0, 60).replace(/\s+\S*$/, '');
  return {
    stance: STANCES.indexOf(p.stance) >= 0 ? p.stance : 'bait',
    aggression: typeof p.aggression === 'number' && isFinite(p.aggression) ? Math.max(0, Math.min(1, p.aggression)) : 0.5,
    range: p.range === 'close' || p.range === 'far' ? p.range : 'mid',
    grabMix: typeof p.grabMix === 'number' && isFinite(p.grabMix) ? Math.max(0, Math.min(1, p.grabMix)) : 0.25,
    edge: p.edge === 'deep' || p.edge === 'stage' ? p.edge : 'ledge',
    recover: p.recover === 'high' || p.recover === 'low' ? p.recover : 'mix',
    order: p.order === 'special' || p.order === 'kill' ? p.order : 'none',
    read,
  };
}

// ------------------------------------------------------------------------------------------------
// Running a whole fight on mock coaches (simulate, the batch tool, tests)
// ------------------------------------------------------------------------------------------------

export interface RunOptions {
  coaches: [string, string];
  /** coach think delay range in ticks (a model's answer time) */
  think?: [number, number];
  /** keep every SimEvent (memory heavy) */
  keepEvents?: boolean;
  /** called after every tick */
  onTick?: (s: FightState, ev: SimEvent[]) => void;
}

export interface RunResult {
  winner: Side;
  ticks: number;
  lives: [number, number];
  damage: [number, number];
  firstKo: number;
  maxGap: number;
  plans: PlanAt[];
  events: SimEvent[];
  state: FightState;
  stanceTicks: [Record<string, number>, Record<string, number>];
}

/** first plan boundary at least 45 ticks after the answer arrived */
export function effectTick(arrived: number): number {
  const t = arrived + 45;
  return Math.ceil(t / COACH_PERIOD) * COACH_PERIOD;
}

export function runFight(header: FightHeader, opt: RunOptions): RunResult {
  const s = createFight(header);
  const crng = seedRng(String(header.seed) + ':coach');
  const rand = () => rnd(crng);
  const coaches = [COACHES[opt.coaches[0]] || COACHES.bait, COACHES[opt.coaches[1]] || COACHES.bait];
  const mem: [Record<string, unknown>, Record<string, unknown>] = [{}, {}];
  const think = opt.think || [20, 110];
  const plans: PlanAt[] = [];
  const events: SimEvent[] = [];
  const stanceTicks: [Record<string, number>, Record<string, number>] = [{}, {}];
  // opening plans, thought before the fight starts
  for (let i = 0; i < 2; i++) {
    const p = sanitizePlan(coaches[i].decide(coachView(s, header, i as Side), mem[i], rand), s.plans[i]);
    const pa: PlanAt = { side: i as Side, tick: 1, plan: p };
    schedulePlan(s, pa); plans.push(pa);
  }
  const asked: { side: Side; at: number; arrive: number; plan: Plan }[] = [];
  const hardStop = header.timeLimitTicks + 3600 + 600;
  while (s.phase !== 'over' && s.tick < hardStop) {
    if (s.tick > 0 && s.tick % COACH_PERIOD === 0) {
      for (let i = 0; i < 2; i++) {
        const v = coachView(s, header, i as Side);
        const p = sanitizePlan(coaches[i].decide(v, mem[i], rand), s.plans[i]);
        const d = think[0] + Math.floor(rand() * (think[1] - think[0] + 1));
        asked.push({ side: i as Side, at: s.tick, arrive: s.tick + d, plan: p });
      }
    }
    for (let k = asked.length - 1; k >= 0; k--) {
      const q = asked[k];
      if (q.arrive <= s.tick) {
        const pa: PlanAt = { side: q.side, tick: effectTick(q.arrive), plan: q.plan };
        schedulePlan(s, pa); plans.push(pa);
        asked.splice(k, 1);
      }
    }
    const ev = stepFight(s, header);
    stanceTicks[0][s.plans[0].stance] = (stanceTicks[0][s.plans[0].stance] || 0) + 1;
    stanceTicks[1][s.plans[1].stance] = (stanceTicks[1][s.plans[1].stance] || 0) + 1;
    if (opt.keepEvents) for (const e of ev) events.push(e);
    if (opt.onTick) opt.onTick(s, ev);
  }
  const ctl = ctlOf(s);
  return {
    winner: s.winner === -1 ? 0 : s.winner,
    ticks: s.tick,
    lives: [s.fighters[0].lives, s.fighters[1].lives],
    damage: [s.fighters[0].damage, s.fighters[1].damage],
    firstKo: ctl.firstKo,
    maxGap: ctl.maxGap,
    plans,
    events,
    state: s,
    stanceTicks,
  };
}

// ------------------------------------------------------------------------------------------------
// simulate (CONTRACT.md form)
// ------------------------------------------------------------------------------------------------

interface EntrantLike { id: string; name?: string }
export interface SimulateOptions {
  fighters?: [FighterId, FighterId];
  coaches?: [string, string];
  lives?: number;
  timeLimitTicks?: number;
  handicap?: [number, number];
  think?: [number, number];
}

export function makeHeader(seed: string, fighters: [FighterId, FighterId], o: SimulateOptions = {}): FightHeader {
  return {
    seed: String(seed),
    fighters,
    handicap: o.handicap || [0, 0],
    lives: o.lives || 2,
    timeLimitTicks: o.timeLimitTicks || 10800,
  };
}

export function simulate(a: { seed: string; entrants: EntrantLike[]; options?: unknown }): { durationMs: number; events: { type: string; at: number; data?: unknown }[]; result: unknown } {
  const o = (a.options || {}) as SimulateOptions;
  const seed = String(a.seed);
  const h = fnv32(seed, 2166136261);
  const fighters: [FighterId, FighterId] = o.fighters || [FIGHTER_IDS[h % FIGHTER_IDS.length], FIGHTER_IDS[Math.floor(h / FIGHTER_IDS.length) % FIGHTER_IDS.length]];
  const coaches: [string, string] = o.coaches || ['adaptive', 'adaptive'];
  const header = makeHeader(seed, fighters, o);
  const r = runFight(header, { coaches, think: o.think, keepEvents: true });
  const ms = (t: number) => Math.round((t * 1000) / TICK_HZ);
  const events: { type: string; at: number; data?: unknown }[] = [];
  events.push({ type: 'fight_start', at: 0, data: { header } });
  for (const p of r.plans) events.push({ type: 'plan', at: ms(Math.max(0, p.tick - COACH_PERIOD)), data: p });
  for (const e of r.events) {
    if (e.t === 'hit' && e.strength !== 'light') events.push({ type: 'hit', at: ms(e.tick), data: e });
    else if (e.t === 'ko' || e.t === 'sudden_death' || e.t === 'end') events.push({ type: e.t, at: ms(e.tick), data: e });
  }
  events.sort((x, y) => x.at - y.at);
  const ents = a.entrants || [];
  const winnerId = ents[r.winner] ? ents[r.winner].id : String(r.winner);
  return {
    durationMs: ms(r.ticks),
    events,
    result: { winner: winnerId, winnerSide: r.winner, fighters, coaches, ticks: r.ticks, lives: r.lives, damage: r.damage, stats: r.state.stats, hash: hashFight(r.state) },
  };
}

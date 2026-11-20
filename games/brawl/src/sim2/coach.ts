// Mock coaches: the minds used when no model is wired in, and the yardsticks for "minds matter".
// A coach sees only a CoachView (never the opponent's plan) and its own small memory.
import type { Coach, CoachView, FighterId, Plan, Stance } from './types.ts';

function plan(stance: Stance, aggression: number, range: Plan['range'], grabMix: number, edge: Plan['edge'], recover: Plan['recover'], read: string, order: Plan['order'] = 'none'): Plan {
  return { stance, aggression, range, grabMix, edge, recover, order, read };
}

function fixed(id: string, base: Plan): Coach {
  return {
    id,
    decide(v: CoachView, mem: Record<string, unknown>, rand: () => number): Plan {
      void v; void mem; void rand;
      return { ...base, order: 'none' };
    },
  };
}

const READS: Record<Stance, string[]> = {
  rush: ['Get on him and stay on him', 'Crowd the shield, take the grab', 'No space, no rest'],
  keepaway: ['Keep the gap and chip away', 'Make it come through the shots', 'Hold range, poke the approach'],
  bait: ['Let it swing, then punish', 'Stay just outside, wait for the whiff', 'Make it commit first'],
  wall: ['Hold the middle and block', 'Shield, then punish out of it', 'Let it come to me'],
};

function pickRead(st: Stance, rand: () => number): string {
  const r = READS[st];
  return r[Math.floor(rand() * r.length)];
}

export const COACHES: Record<string, Coach> = {
  rush: fixed('rush', plan('rush', 0.8, 'close', 0.15, 'stage', 'high', 'Get on him and stay on him')),
  keepaway: fixed('keepaway', plan('keepaway', 0.45, 'far', 0.15, 'stage', 'high', 'Keep the gap and chip away')),
  bait: fixed('bait', plan('bait', 0.45, 'mid', 0.2, 'stage', 'mix', 'Let it swing, then punish')),
  wall: fixed('wall', plan('wall', 0.2, 'mid', 0.4, 'stage', 'mix', 'Hold the middle and block')),
  random: {
    id: 'random',
    decide(v: CoachView, mem: Record<string, unknown>, rand: () => number): Plan {
      void v; void mem;
      const stances: Stance[] = ['rush', 'keepaway', 'bait', 'wall'];
      const st = stances[Math.floor(rand() * 4)];
      const ranges: Plan['range'][] = ['close', 'mid', 'far'];
      const edges: Plan['edge'][] = ['deep', 'ledge', 'stage'];
      const recs: Plan['recover'][] = ['high', 'low', 'mix'];
      const orders: Plan['order'][] = ['none', 'none', 'none', 'special', 'kill'];
      return {
        stance: st, aggression: Math.round(rand() * 100) / 100, range: ranges[Math.floor(rand() * 3)], grabMix: Math.round(rand() * 100) / 100,
        edge: edges[Math.floor(rand() * 3)], recover: recs[Math.floor(rand() * 3)], order: orders[Math.floor(rand() * 5)], read: pickRead(st, rand),
      };
    },
  },
  adaptive: {
    id: 'adaptive',
    decide(v: CoachView, mem: Record<string, unknown>, rand: () => number): Plan {
      return adaptive(v, mem, rand);
    },
  },
};

// ------------------------------------------------------------------------------------------------
// Adaptive: reads what the opponent looks like and how grabby it is, counters it, and drops a counter that is not working.
// ------------------------------------------------------------------------------------------------

type Answer = { stance: Stance; aggression: number; range: Plan['range']; grabMix: number };

/** fighters that carry a shot (keep-away is a real plan for them, a weak one for the others) */
const SHOOTERS: Partial<Record<FighterId, boolean>> = { gantry: true, kiln: true, hexer: true };

/**
 * What beats each look (measured on the hands with tools/exploit.mjs; see NOTES): a strike-minded rush runs into a shield
 * and a bait's punishes; a grab-minded rush beats a shield but not a bait that reads the grabs; a fighter that runs out of deck
 * cannot keep away from a rush; a bait or a wall that waits gets chipped by shots or grabbed.
 */
function answers(look: Stance, grabby: boolean, me: FighterId): Answer[] {
  void me;
  switch (look) {
    case 'rush':
      // a strike-minded rush runs into a bait's punishes and a wall's shield; a grab-minded one gets its grabs read
      return grabby
        ? [{ stance: 'bait', aggression: 0.5, range: 'mid', grabMix: 0.1 }, { stance: 'rush', aggression: 0.8, range: 'mid', grabMix: 0.1 }]
        : [{ stance: 'bait', aggression: 0.5, range: 'mid', grabMix: 0.1 }, { stance: 'wall', aggression: 0.5, range: 'mid', grabMix: 0.3 }];
    case 'keepaway':
      // its shots and pokes come from range: a bait walks it down and punishes them; a strike rush runs it out of deck
      return [{ stance: 'bait', aggression: 0.5, range: 'mid', grabMix: 0.1 }, { stance: 'rush', aggression: 0.8, range: 'close', grabMix: 0.15 }];
    case 'bait':
      // it waits for a whiff: pressure that mixes grabs in gives it nothing clean to punish
      return [{ stance: 'rush', aggression: 0.85, range: 'close', grabMix: 0.4 }, { stance: 'wall', aggression: 0.3, range: 'mid', grabMix: 0.3 }];
    default: // wall
      // it sits in shield: grabs
      return [{ stance: 'rush', aggression: 0.8, range: 'close', grabMix: 0.8 }, { stance: 'keepaway', aggression: 0.55, range: 'mid', grabMix: 0.2 }];
  }
}

function adaptive(v: CoachView, mem: Record<string, any>, rand: () => number): Plan {
  // what the opponent has looked like lately (a decaying tally of the reads)
  const seen: Record<string, number> = mem.seen || { rush: 0, keepaway: 0, bait: 0, wall: 0 };
  for (const k of Object.keys(seen)) seen[k] *= 0.6;
  if (v.oppLooksLike !== 'unclear') seen[v.oppLooksLike] += 1;
  mem.seen = seen;
  let look: Stance | 'unclear' = 'unclear';
  let bestN = 0.8;
  for (const k of Object.keys(seen)) if (seen[k] > bestN) { bestN = seen[k]; look = k as Stance; }
  // how grabby it is (a decaying rate of its grabs per view)
  const h = v.oppHabits;
  mem.grabRate = (typeof mem.grabRate === 'number' ? mem.grabRate * 0.6 : 0.3) + h.grabs * 0.4;
  const grabby = mem.grabRate > 0.45;
  const prev: Plan | null = mem.last || null;
  const s = v.since;
  // a counter that keeps losing exchanges is swapped for the next one
  if (look !== mem.look) { mem.look = look; mem.alt = 0; }
  if (prev && s.ticks >= 360 && s.taken > s.dealt + 25) mem.alt = (mem.alt || 0) + 1;
  let base: Answer;
  if (look === 'unclear') base = prev ? { stance: prev.stance, aggression: prev.aggression, range: prev.range, grabMix: prev.grabMix } : { stance: 'bait', aggression: 0.5, range: 'mid', grabMix: 0.1 };
  else { const as = answers(look, grabby, v.me.fighter); base = as[(mem.alt || 0) % as.length]; }
  let aggression = base.aggression;
  // own damage high: calmer; opponent damage high: press; behind on lives or in sudden death: press
  if (v.me.damage > 110) aggression -= 0.2;
  if (v.opp.damage > 110) aggression += 0.1;
  if (v.me.lives < v.opp.lives) aggression += 0.1;
  if (v.sudden) aggression += 0.1;
  aggression = Math.max(0.05, Math.min(0.95, Math.round(aggression * 100) / 100));
  // edge: go deep on an opponent that comes back low, wait on stage for one that comes back high
  const edge: Plan['edge'] = h.recoveredLow > h.recoveredHigh ? 'deep' : 'stage';
  // recover high unless it keeps guarding from the stage
  // recover: mixed (safe against every way of guarding) unless it has kept coming back to hit me from the stage
  const recover: Plan['recover'] = 'mix';
  // go for the kill when it is cooked and I am not
  const order: Plan['order'] = v.opp.damage > 115 && v.me.damage < 130 && rand() < 0.7 ? 'kill' : 'none';
  // the fighter shifts the dials: a grappler keeps grabbing whatever the plan, a long-reach robot keeps its distance
  const grabMix = (v.me.fighter === 'vise' || v.me.fighter === 'mimic') ? Math.max(base.grabMix, 0.45) : base.grabMix;
  const range: Plan['range'] = (v.me.fighter === 'gantry' || v.me.fighter === 'hexer') && base.range === 'close' ? 'mid' : base.range;
  const p: Plan = { stance: base.stance, aggression, range, grabMix, edge, recover, order, read: readFor(base.stance, look, grabby, order, v) };
  mem.last = p;
  return p;
}

function readFor(stance: Stance, look: Stance | 'unclear', grabby: boolean, order: Plan['order'], v: CoachView): string {
  if (order === 'kill') return 'He is cooked, go finish it';
  if (look === 'rush' && stance === 'wall') return 'He keeps charging in, shield and punish';
  if (look === 'rush' && stance === 'bait') return grabby ? 'He wants the grab, make him whiff' : 'Let him swing, punish the whiff';
  if (look === 'keepaway' && stance === 'bait') return 'Walk him down, punish the pokes';
  if (look === 'bait' && stance === 'wall') return 'He waits, so do we, block it';
  if (look === 'rush' && stance === 'rush') return 'Beat his grabs to the punch';
  if (look === 'keepaway' && stance === 'rush') return 'He is running, cut off the deck';
  if (look === 'wall' && stance === 'rush') return 'He sits in shield, grab him';
  if (look === 'wall' && stance === 'keepaway') return 'He waits, so make him eat shots';
  if (look === 'bait' && stance === 'keepaway') return 'He waits for a whiff, shoot instead';
  if (look === 'bait' && stance === 'rush') return 'He waits for a whiff, grab instead';
  if (v.me.damage > 110) return 'Too hot, play it safe';
  return 'Feel him out first';
}

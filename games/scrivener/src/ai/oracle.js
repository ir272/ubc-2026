// Look-ahead oracle used ONLY by mock brains (src/sim/mock.js, the old MockBrain). Owner: sim. PURE.
//
// It clones the frozen world, plays each of the four moves out to the end of the exchange,
// and ranks them. The mock's "right answer" therefore always follows the actual physics.
// LLM brains never see this.
//
//   evaluateOptions(w, controller) -> [{ slot, score, taken, dealt, move }] best first,
//                                     unavailable moves excluded.

import { TICK_MS, ARENA } from '../core/constants.js';
import { stepWorld, applyDecision, moveState } from '../sim/world.js';

const cache = new Map();
const MAX_CACHE = 6000;

// Everything that changes the answer, bucketed so near-identical moments share a result.
export function oracleKey(w) {
  const a = w.agent, b = w.boss, L = a.loadout;
  const dir = b.x >= a.x ? 1 : -1;
  const wallBehind = dir > 0 ? a.x - ARENA.left : ARENA.right - a.x;
  const wallAhead = dir > 0 ? ARENA.right - b.x : b.x - ARENA.left; // room behind the boss (Slip Past, Margin Step)
  return [
    w.thinking ? w.thinking.attackId : b.attackId,
    b.phase, b.temper || '-',
    L.cls, L.weapon, L.spell, L.charm,
    a.charges,
    Math.round(Math.abs(b.x - a.x) / 40),
    Math.round(wallBehind / 60),
    Math.min(4, Math.round(wallAhead / 80)),
    Math.round(a.stamina / 20),
    Math.round(b.poise / 25),
    Math.round(a.hp / 15),
    Math.round(b.hp / 15),
    a.ward > 0 ? 1 : 0, a.echo, a.riposte ? 1 : 0, a.sealUsed ? 1 : 0,
    Math.round(b.hexMs / 1000), Math.round(b.burnMs / 1000),
    w.exch >= w.strokes ? 1 : 0,
  ].join('|');
}

export function clearOracleCache() { cache.clear(); }

const CHARGE_COST = 14;

export function evaluateOptions(w, controller) {
  const key = oracleKey(w);
  const hit = cache.get(key);
  if (hit) return hit;

  // measure the stand-still contact once and share it with every option
  if (w.thinking && w.thinking.holdContact === undefined) {
    const probe = structuredClone(w);
    const th = probe.thinking;
    applyDecision(probe, { slot: 0 }, controller);
    w.thinking.holdContact = th.holdContact;
  }
  const base = structuredClone(w);
  base.decisions = false;
  base.events = [];
  const results = [];
  for (const m of moveState(w)) {
    if (!m.available) continue;
    const c = structuredClone(base);
    const start = c.t;
    const a = c.agent, b = c.boss;
    const hp0 = a.hp, bhp0 = b.hp, ch0 = a.charges, seal0 = a.sealUsed;
    applyDecision(c, { slot: m.slot, thought: '' }, controller);
    const k0 = c.exch;
    for (let i = 0; i < 900 && !c.outcome; i++) {
      stepWorld(c, TICK_MS, controller);
      c.events.length = 0;
      if (c.boss.state === 'idle' && c.t > start + 300) break;
      if (c.exch > k0) break;
    }
    const taken = hp0 - c.agent.hp;     // negative when healed
    const dealt = bhp0 - c.boss.hp;
    // lingering value: fire still burning, a mark still on it, a ward still up, a doubled strike
    const lingering = (c.boss.burnMs / 1000) * c.boss.burnDps * c.boss.mods.fireMul
      + (c.boss.hexMs / 1000) * 3.5
      + (c.agent.ward > 0 ? 10 : 0)
      + c.agent.echo * 5;
    const score = dealt - taken * 2.0 - (c.agent.dead ? 400 : 0) + (c.outcome === 'boss_dead' ? 500 : 0)
      - (ch0 - c.agent.charges) * CHARGE_COST + (c.agent.sealUsed && !seal0 ? -30 : 0) + lingering;
    results.push({ slot: m.slot, score, taken, dealt, move: m.id, action: m.id === 'strike' ? 'attack' : m.id, timing: 'on_cue' });
  }
  results.sort((x, y) => y.score - x.score || x.slot - y.slot);
  if (cache.size > MAX_CACHE) cache.clear();
  cache.set(key, results);
  return results;
}


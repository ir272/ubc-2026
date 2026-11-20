// The platform's pure entry point: one round of a Tumbletop show from a seed and its entrants.
// Runs identically in node and the browser (no clock, no randomness outside the seed).
import { createSim, TICK_RATE, COUNTDOWN_TIME, ordinal, metres } from './sim.js';
import { ROUNDS } from './rounds.js';
import { mixSeed } from './rng.js';

/** Fold a hex seed (the platform gives 64 hex chars) or a number into a uint32. */
export function seedToUint32(seed) {
  if (typeof seed === 'number') return seed >>> 0;
  const hex = String(seed).replace(/^0x/i, '');
  if (!/^[0-9a-f]+$/i.test(hex)) throw new Error('seed must be a hex string or a number');
  let h = 0x9e3779b9;
  for (let i = 0; i < hex.length; i += 8) h = mixSeed(h, parseInt(hex.slice(i, i + 8), 16));
  return h >>> 0;
}

// Sim events that are forwarded to the feed. Everything else stays inside the stage, which replays
// the round itself from the seed.
const FEED_TYPES = new Set(['start', 'leadChange', 'fall', 'knockback', 'pileup', 'qualified', 'lastSpot', 'eliminated', 'photoFinish', 'comeback', 'overtake', 'roundEnd']);
const ALWAYS = new Set(['start', 'qualified', 'lastSpot', 'eliminated', 'photoFinish', 'roundEnd']);

/**
 * simulate({ seed, entrants, options: { round } })
 *   seed      hex string (or uint32)
 *   entrants  roster ids, or objects with an `id`, in start-grid order
 *   round     0, 1 or 2
 * returns { durationMs, events, result }
 *   events    [{ type, at (ms from the start of the countdown), data }]
 *   result    { round, order, qualified, eliminated, winnerId, times, hash, ticks, raceMs, timedOut, cutChanges, lateCutChanges }
 */
export function simulate({ seed, entrants, options = {} }) {
  const round = options?.round ?? 0;
  if (!ROUNDS[round]) throw new Error(`unknown round ${round}`);
  const ids = entrants.map((e) => (typeof e === 'string' ? e : e.id));
  const sim = createSim({ seed: seedToUint32(seed), round, entrants: ids });
  const events = [];
  const ms = (tick) => Math.round((tick * 1000) / TICK_RATE);
  const rid = (id) => (id == null ? undefined : sim.bots[id].rid);
  const maxTicks = TICK_RATE * (COUNTDOWN_TIME + (ROUNDS[round].timeLimit ?? 90) + 5);
  const incident = new Map(); // slot id -> the last thing that went wrong for it
  while (sim.state.phase !== 'finished' && sim.tick < maxTicks) {
    sim.step();
    for (const e of sim.drainEvents()) {
      if ((e.type === 'fall' || e.type === 'knockback') && e.botId != null) {
        const name = sim.bots[e.botId].name;
        incident.set(e.botId, { tick: e.tick, text: e.text.replace(/!$/, '').replace(/^Leader /, '').replace(name + ' ', '').replace(/^got /, '') });
      }
      if (!FEED_TYPES.has(e.type)) continue;
      if (!ALWAYS.has(e.type) && e.importance < 0.6) continue;
      const data = { text: e.text, importance: e.importance };
      if (e.botId != null) data.entrantId = rid(e.botId);
      if (e.otherId != null) data.otherId = rid(e.otherId);
      if (e.place != null) data.place = e.place;
      if (e.left != null) data.left = e.left;
      if (e.gap != null) data.gap = e.gap;
      events.push({ type: e.type, at: ms(e.tick), data });
    }
  }
  const st = sim.state;
  const order = sim.order.map((b) => ({ id: b.rid, place: b.place, status: b.status, finishTime: b.finishTime }));
  const qualified = sim.order.filter((b) => b.status === 'qualified').map((b) => b.rid);
  const eliminated = sim.order.filter((b) => b.status !== 'qualified').map((b) => b.rid);
  const times = {};
  for (const b of sim.bots) if (b.finishTime != null) times[b.rid] = b.finishTime;
  const endTick = sim.tick;
  const late = sim.cutLog.filter((t) => t >= endTick - 10 * TICK_RATE).length;
  // One short line per Gumble that went out: how.
  const final = st.qualifyCount === 1;
  const notes = [];
  let k = 0;
  for (const b of sim.order) {
    if (b.status === 'qualified') continue;
    const gap = Math.max(0, sim.course.finish.z - (b.m.rankZ ?? b.pos.z));
    const inc = incident.get(b.id);
    let text;
    if (final) text = `finished ${ordinal(b.place)}`;
    else if (k === 0 && gap < 12) text = `missed by ${metres(gap)}`;
    else if (inc && endTickOf(sim) - inc.tick < 14 * TICK_RATE) text = inc.text;
    else text = `${metres(gap)} short`.replace('a whisker short', 'just short');
    notes.push({ entrantId: b.rid, text });
    k++;
  }
  const result = {
    round, order, qualified, eliminated, notes, winnerId: qualified[0],
    times, hash: sim.hash(), ticks: endTick, raceMs: ms(endTick - sim.raceStartTick),
    timedOut: st.timedOut, cutChanges: st.cutChanges, lateCutChanges: late,
  };
  return { durationMs: ms(endTick), events, result };
}

const endTickOf = (sim) => sim.tick;

/** The three round seeds of a show from one base value (tools and tests; the platform gives a real seed per round). */
export function showSeeds(base) {
  const b = seedToUint32(base);
  return [0, 1, 2].map((r) => mixSeed(b, 0xa11ce + r * 7919));
}

/**
 * A whole show: round one with the 16 entrants, round two with its eight qualifiers in finishing
 * order, the final with the last four. Returns the rounds and the winner.
 */
export function simulateShow({ seeds, entrants }) {
  let field = entrants.map((e) => (typeof e === 'string' ? e : e.id));
  const rounds = [];
  for (let r = 0; r < ROUNDS.length; r++) {
    const out = simulate({ seed: seeds[r], entrants: field, options: { round: r } });
    rounds.push(out);
    field = out.result.qualified;
  }
  return { rounds, winnerId: field[0], durationMs: rounds.reduce((a, x) => a + x.durationMs, 0) };
}

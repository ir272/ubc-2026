// One attempt, run for real: the channel steps the sim on the wall clock, stops at each
// decision, asks the brain, publishes the answer and goes on. The stage runs the same sim
// from the same seed and the same answers, so the two ends see the same fight.
// Node and browser safe (no DOM, no fs). The only clock is the one passed in.

import { TICK_MS } from '../core/constants.js';
import { createWorld, stepWorld, applyDecision, moveState, defaultSlot } from '../sim/world.js';
import { agentController } from '../ai/reflex.js';
import { T } from './timing.js';


// The frozen world as it travels in `decide.open`: plain JSON, without the long pose texts.
export function packWorld(w) {
  const c = JSON.parse(JSON.stringify(w));
  c.events = [];
  for (const d of c.log.decisions) { delete d.pose; delete d.thought; delete d.obs; }
  if (c.current) { delete c.current.pose; delete c.current.thought; }
  return c;
}

// The other end: make the JSON a live world again (re-link the open decision record).
export function unpackWorld(json) {
  const w = JSON.parse(JSON.stringify(json));
  w.events = [];
  if (w.current) {
    const same = w.log.decisions.find((d) => d.n === w.current.n);
    if (same) w.current = same;
  }
  return w;
}

export function attemptRecord(w, turn, decisions) {
  const b = w.boss, a = w.agent;
  const result = w.outcome === 'boss_dead' ? 'kill' : w.outcome === 'written' ? 'written' : 'death';
  const score = result === 'kill' ? 1 : Math.max(0, Math.min(1, 1 - b.hp / b.maxHp));
  return {
    index: turn.index, entrantId: turn.entrantId, n: turn.n, result,
    score: Math.round(score * 1000) / 1000,
    hpLeft: Math.round(Math.max(0, a.hp / a.maxHp) * 1000) / 1000,
    strokes: w.exch ?? decisions.length, // exchanges the sim counted (one can pass with the fighter down and no choice to make)
    taken: Math.round(w.log.damageTaken),
    killedBy: w.log.killedBy ? w.log.killedBy.attackId : null,
    seconds: Math.round((w.outcomeT ?? w.t) / 100) / 10,
    slots: decisions.map((d) => d.slot),
  };
}

async function withLimit(promise, ms, fallback) {
  if (!(ms > 0)) return promise;
  let timer;
  const late = new Promise((r) => { timer = setTimeout(() => r({ ...fallback(), source: 'timeout' }), ms); });
  try { return await Promise.race([promise, late]); } finally { clearTimeout(timer); }
}

// opts: { turn, seed, loadout, temper, handicap, brain, notes, live, limits, clock: { now, sleep }, emit(type, data), signal }
export async function runAttemptLive(opts) {
  const { turn, seed, loadout, temper, handicap = 0, brain, notes = [], live = true, emit, signal } = opts;
  const clock = opts.clock || { now: () => Date.now(), sleep: (ms) => new Promise((r) => setTimeout(r, ms)) };
  const limits = opts.limits !== undefined ? opts.limits : live;
  const now = clock.now, sleepMs = clock.sleep;
  const w = createWorld({ seed, agentId: turn.entrantId, loadout, temper, handicap, decisions: true });
  const decisions = [];
  let last = now(), acc = 0, guard = 0;

  while (true) {
    if (signal && signal.aborted) throw new Error('aborted');
    if (w.thinking) {
      const th = w.thinking;
      const moves = moveState(w);
      const safe = defaultSlot(w);
      emit('decide.open', { index: turn.index, k: th.k, strokes: th.strokes, tick: w.tick, attackId: th.attackId, world: packWorld(w) });
      const t0 = now();
      let reply;
      try {
        reply = await withLimit(
          Promise.resolve(brain.decide({ world: w, moves, notes })),
          limits ? T.decideMax : 0,
          () => ({ slot: safe, line: 'Too slow. The hand moves on its own.' }),
        );
      } catch (err) {
        reply = { slot: safe, line: 'No answer came. Instinct takes over.', source: 'fallback' };
      }
      let slot = Number.isInteger(reply.slot) ? reply.slot : safe;
      if (!moves[slot] || moves[slot].available === false) slot = safe;
      if (live) {
        const shown = Math.max(T.decideMin, reply.thinkMs || 0);
        const spent = now() - t0;
        if (spent < shown) await sleepMs(shown - spent);
      }
      emit('decide.made', {
        index: turn.index, k: th.k, slot, move: moves[slot].id, name: moves[slot].name,
        line: String(reply.line || '').slice(0, 120), ms: Math.round(now() - t0), source: reply.source || brain.kind,
      });
      if (live) await sleepMs(T.decideStamp);
      applyDecision(w, { slot, thought: reply.line || '', source: reply.source || brain.kind }, agentController);
      decisions.push({ k: th.k, slot, attackId: th.attackId });
      last = now(); acc = 0;
      continue;
    }

    if (w.outcome) break;

    if (live) {
      const t = now();
      acc += Math.min(250, t - last);
      last = t;
      let steps = Math.floor(acc / TICK_MS);
      acc -= steps * TICK_MS;
      while (steps-- > 0 && !w.thinking && !w.outcome) { stepWorld(w, TICK_MS, agentController); w.events.length = 0; }
      if (!w.thinking && !w.outcome) await sleepMs(8);
    } else {
      while (!w.thinking && !w.outcome) {
        stepWorld(w, TICK_MS, agentController);
        w.events.length = 0;
        if (++guard > 60 * 60 * 10) throw new Error('attempt stalled');
      }
    }
  }
  return { record: attemptRecord(w, turn, decisions), world: w, decisions };
}

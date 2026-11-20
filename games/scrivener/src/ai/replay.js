// Replays of REAL recorded LLM play. Owner: agents. PURE (no DOM).
//
// A real match (browser, live LLM brains through the proxy) is recorded as, per attempt:
// the match seed, the attempt number, the notes in force and the exact decision sequence
// the model returned. The sim is deterministic (seeded world, frozen while thinking), so
// feeding the same decisions back in the same order re-plays that life tick for tick.
// The capture scenarios below jump straight into a LATE life, where the notes the model
// wrote after its deaths are in force, and stop on a chosen moment of it.
//
//   replayBrain(decisions)                -> brain that answers with the recorded decisions
//   setupReplay(m, ctx, replay, untilT)   -> rebuild that match/attempt and run it to untilT
//   replayScenario(replay, moment)        -> scenario for src/scenarios.js

import { TICK_MS, AGENT_IDS } from '../core/constants.js';
import { createMatch, startAttempt, tickMatch } from '../sim/match.js';
import { agentController } from './reflex.js';

export function replayBrain(decisions, label = 'replay') {
  const brain = {
    kind: 'mock', label, i: 0, mismatches: 0,
    decide(obs, { world }) {
      const d = decisions[brain.i++];
      const id = world.thinking ? world.thinking.attackId : world.boss.attackId;
      if (!d) return { action: 'hold', timing: 'on_cue', thought: '', source: 'replay-end', valid: true };
      if (d.attackId && d.attackId !== id) brain.mismatches += 1;
      return { action: d.action, timing: d.timing, thought: d.thought || '', read: d.read || '', note: d.note || 0, valid: true, source: 'replay' };
    },
    reflect: (info, { notes } = {}) => ({ notes: notes || [], source: 'replay' }),
    thinkMs: () => 0,
  };
  return brain;
}

const clone = (x) => JSON.parse(JSON.stringify(x));

// Rebuild the recorded match at the start of the recorded attempt and run it (with the
// recorded decisions) until world time untilT. Mutates m in place (the host holds m).
export function setupReplay(m, ctx, r, untilT = 0) {
  const fresh = createMatch({ seed: r.matchSeed, decisions: true, matchNo: r.matchNo, matchesWon: clone(r.matchesWon || {}) });
  fresh.attempt = r.attempt - 1;
  startAttempt(fresh);
  if (r.score) fresh.score = clone(r.score);
  if (r.notes) for (const id of AGENT_IDS) fresh.notes[id] = (r.notes[id] || []).slice();
  if (r.history) fresh.history = clone(r.history);
  fresh.events = [];
  Object.assign(m, fresh);
  // the HUD names the model whose recorded decisions these are
  const models = (r.source && r.source.models) || {};
  const brain = replayBrain(r.decisions, models[r.agent] || 'replay');
  if (ctx && ctx.setBrain) {
    ctx.setBrain(r.agent, brain);
    for (const id of AGENT_IDS) if (id !== r.agent && models[id]) ctx.setBrain(id, replayBrain([], models[id]));
  }
  let guard = 0;
  while ((m.world.t < untilT || m.world.thinking || m.pending) && guard++ < 60 * 60 * 10) {
    tickMatch(m, TICK_MS, agentController);
    const p = m.pending;
    if (p && !p.reply) p.reply = p.kind === 'decide' ? brain.decide(null, { world: m.world }) : brain.reflect(null, { notes: m.notes[m.current] });
    if (m.phase !== 'fight') break;
  }
  m.world.events.length = 0;
  m.events.length = 0;
  return brain;
}

// moment: { type, attackId?, target?, bossState?, t (world ms of the moment), plusMs? }
// The replay runs to ~2.4 s before the moment (so bars and fx settle), then the host steps
// to the first matching event.
export function replayScenario(r, moment) {
  const lead = moment.lead || 2400;
  let bossStateAtEvent = null;
  return {
    decisions: true,
    setup(m, ctx) { setupReplay(m, ctx, r, Math.max(0, moment.t - lead)); bossStateAtEvent = () => m.world.boss.state; },
    untilEvent: (e) => e.type === moment.type
      && (!moment.attackId || e.attackId === moment.attackId)
      && (!moment.target || e.target === moment.target)
      && (!moment.bossState || (bossStateAtEvent && bossStateAtEvent() === moment.bossState)),
    plusMs: moment.plusMs || 0,
  };
}

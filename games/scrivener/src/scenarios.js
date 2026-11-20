// Named capture moments for tools/capture.mjs (?scenario=<name>). Owner: core.
// PURE: each scenario sets up a fresh match/world and says when "the moment" is.
//
// Scenario shape:
//   { setup(m, ctx), afterMs?, untilEvent?(e) -> bool, plusMs?, decisions?, hud?, actors? }
//   ctx.setBrain(agentId, brain) swaps a brain (scripted decisions).
// The host (main.js) resets, runs setup, then steps the sim until the moment.

import { ATTACKS, ATTACK_IDS } from './sim/attacks.js';
import { BOSS } from './sim/boss.js';
import { AGENT } from './sim/agent.js';
import { REPLAY_SCENARIOS } from './ai/replays.js';

const edge = BOSS.halfW + AGENT.halfW;

function place(m, bossX, agentX) {
  const w = m.world;
  w.boss.x = bossX;
  w.agent.x = agentX;
  w.agent.facing = bossX >= agentX ? 1 : -1;
  w.boss.facing = -w.agent.facing;
}

function forceRecovery(w, attackId = 'quill_slash', ms = 5000) {
  const b = w.boss;
  b.aiLock = true;
  b.state = 'recovery';
  b.stateT = 0;
  b.recoveryMs = ms;
  b.attackId = attackId;
}

export function scriptedBrain(action, timing, thought, thinkMs = 0) {
  return {
    kind: 'mock', label: 'scripted',
    decide: () => ({ action, timing, thought, source: 'scripted' }),
    reflect: () => ({ notes: [] }),
    thinkMs: () => thinkMs,
  };
}

const DIST = { quill_slash: 260, ink_lunge: 610, ledger_slam: 250, wing_gust: 480, written_name: 420, page_storm: 420 };
const ACTIVE_AT = { quill_slash: 66, ink_lunge: 140, ledger_slam: 76, wing_gust: 450, written_name: 1400, page_storm: 1300 };

export const SCENARIOS = {
  arena: { hud: false, actors: false, setup(m) { m.world.boss.aiLock = true; }, afterMs: 0 },

  boss_idle: {
    setup(m) { m.world.boss.aiLock = true; place(m, 820, 440); },
    afterMs: 1200,
  },

  agent_hits_boss: {
    setup(m) { place(m, 760, 760 - edge - 50); forceRecovery(m.world, 'ledger_slam'); },
    untilEvent: (e) => e.type === 'hit' && e.target === 'boss',
    plusMs: 0,
  },

  agent_takes_hit: {
    setup(m) { const w = m.world; place(m, 820, 820 - 230); w.boss.aiLock = true; w.boss.forceAttack = 'quill_slash'; },
    untilEvent: (e) => e.type === 'hit' && e.target === 'agent',
    plusMs: 0,
  },

  dodge: {
    decisions: true,
    setup(m, ctx) {
      const w = m.world;
      place(m, 860, 860 - 480);
      w.boss.aiLock = true;
      w.boss.forceAttack = 'ink_lunge';
      ctx.setBrain(m.current, scriptedBrain('roll_through', 'on_cue', 'Through it, not away.', 0));
    },
    untilEvent: (e) => e.type === 'dodge',
    plusMs: 0,
  },

  boss_stagger: {
    setup(m) { const w = m.world; place(m, 760, 760 - edge - 50); forceRecovery(w, 'ledger_slam'); w.boss.poise = 5; },
    untilEvent: (e) => e.type === 'boss.stagger',
    plusMs: 400,
  },

  phase_change: {
    setup(m) { const w = m.world; place(m, 760, 760 - edge - 50); forceRecovery(w, 'ledger_slam'); w.boss.hp = Math.round(w.boss.maxHp * 0.5) + 4; },
    untilEvent: (e) => e.type === 'boss.phase',
    plusMs: 700,
  },

  boss_death: {
    setup(m) { const w = m.world; place(m, 760, 760 - edge - 50); forceRecovery(w, 'ledger_slam'); w.boss.hp = 6; },
    untilEvent: (e) => e.type === 'boss.death',
    plusMs: 1000,
  },

  agent_death: {
    setup(m) { const w = m.world; place(m, 820, 820 - 230); w.agent.hp = 8; w.boss.aiLock = true; w.boss.forceAttack = 'quill_slash'; },
    untilEvent: (e) => e.type === 'agent.death',
    plusMs: 900,
  },

  hud: {
    setup(m) {
      const w = m.world;
      m.attempt = 7;
      m.current = 'claude';
      w.agent.id = 'claude';
      m.score.claude = { attempts: 4, deaths: 3, kills: 0, bestBossPct: 0.31, firstKillAttempt: null, decisions: 41 };
      m.score.gpt = { attempts: 3, deaths: 3, kills: 0, bestBossPct: 0.42, firstKillAttempt: null, decisions: 29 };
      m.thoughts.claude = 'The last swing waits a breath. Roll through it.';
      w.agent.hp = 64; w.agent.stamina = 47; w.agent.flasks = 2;
      w.boss.hp = Math.round(w.boss.maxHp * 0.58);
      w.boss.aiLock = true;
      place(m, 820, 520);
    },
    afterMs: 600,
  },

  thinking_freeze: {
    decisions: true,
    setup(m, ctx) {
      const w = m.world;
      place(m, 820, 820 - 260);
      w.boss.aiLock = true;
      w.boss.forceAttack = 'quill_slash';
      ctx.setBrain(m.current, scriptedBrain('roll_through', 'on_cue', 'Blade cocked high. Slip past its side.', 2600));
    },
    untilEvent: (e) => e.type === 'think.start',
    plusMs: 1500,
  },
};

// Agents piece: the challenger's own play (real decision executor + reflexes, scripted choice).
function agentPlay(attackId, dist, action, timing, thought, bossX = 840) {
  return (m, ctx) => {
    const w = m.world;
    place(m, bossX, bossX - dist);
    w.boss.aiLock = true;
    w.boss.forceAttack = attackId;
    ctx.setBrain(m.current, scriptedBrain(action, timing, thought, 0));
  };
}
// Round 2: the blade-over-shoulder sweep is answered by rolling IN and stopping in front of it
// (its wings strike the floor behind it), then cutting the buried blade's owner.
SCENARIOS.agents_sweep_roll_in = {
  decisions: true,
  setup: agentPlay('quill_slash', 250, 'roll_toward', 'on_cue', 'Blade cocked behind it: roll in, stop under the arc.'),
  untilEvent: (e) => e.type === 'dodge',
  plusMs: 60,
};
SCENARIOS.agents_sweep_punish = {
  decisions: true,
  setup: agentPlay('quill_slash', 250, 'roll_toward', 'on_cue', 'Under the arc. Its blade is stuck: cut now.'),
  untilEvent: (e) => e.type === 'hit' && e.target === 'boss',
  plusMs: 200,
};
// the wrong answer, for comparison: rolling through ends at its back as the wings come down
SCENARIOS.agents_sweep_roll_through = {
  decisions: true,
  setup: agentPlay('quill_slash', 230, 'roll_through', 'on_cue', 'Blade cocked high: slip under it to its back.'),
  untilEvent: (e) => e.type === 'hit' && e.target === 'agent',
  plusMs: 0,
};
SCENARIOS.agents_slam_punish = {
  decisions: true,
  setup: agentPlay('ledger_slam', 250, 'roll_toward', 'on_cue', 'Book overhead: roll inside it, then cut.'),
  untilEvent: (e) => e.type === 'hit' && e.target === 'boss',
  plusMs: 120,
};
SCENARIOS.agents_lunge_roll_away = {
  decisions: true,
  setup: agentPlay('ink_lunge', 560, 'roll_away', 'on_cue', 'Reared up, blade drawn back like a spear. Roll back, then cut.', 1120),
  untilEvent: (e) => e.type === 'agent.roll',
  plusMs: 160,
};
SCENARIOS.agents_lunge_roll_through = {
  decisions: true,
  setup: agentPlay('ink_lunge', 600, 'roll_through', 'on_cue', 'Reared up, spear arm drawn back: roll through the thrust.', 1060),
  untilEvent: (e) => e.type === 'dodge',
  plusMs: 0,
};
// active_<id> may stand the challenger further out so the whole reach of the strike
// (book, geysers and the ripple racing along the floor) plays out in frame.
const ACTIVE_DIST = { ledger_slam: 520 };
// where the boss stands for its attack captures: the quill is cocked far up and back
// over the shoulder, so that capture stands it a little left to keep the blade in frame
const BOSS_X = { quill_slash: 640, ink_lunge: 540, ledger_slam: 790 };
// (tells r13) the lunge's rear-up trails the blade arm ~500 px BEHIND it: that capture stands
// the boss on the left facing right, so the whole drawn-back line stays in frame
const SIDE = { ink_lunge: -1 };
// active_<id> may show the challenger taking the right answer, so the strike's full reach
// AND the punish window that follows play out in frame (the matrix's correct counter)
// (tells r12) the slam's capture shows the right answer at range: the challenger hops the
// ripple as it races past, so the book's landing, the geysers, the wave's full run and the
// crouched punish pose all play out unobscured
const ACTIVE_DODGE = { ledger_slam: ['jump_back', 'on_cue'] };

for (const id of ATTACK_IDS) {
  const atk = ATTACKS[id];
  const setupAt = (dist) => (m) => {
    const w = m.world;
    const bx = BOSS_X[id] || 840;
    place(m, bx, bx - (SIDE[id] || 1) * dist);
    w.boss.aiLock = true;
    w.boss.forceAttack = id;
    w.agent.godMode = true;
    if (!atk.phases.includes(1)) { w.boss.phase = 2; w.boss.hp = Math.round(w.boss.maxHp * 0.45); }
  };
  const setup = setupAt(DIST[id]);
  SCENARIOS[`tell_${id}`] = { setup, untilEvent: (e) => e.type === 'boss.tell', plusMs: Math.round(atk.tell.ms * 0.5) };
  const dodge = ACTIVE_DODGE[id];
  const activeSetup = setupAt(ACTIVE_DIST[id] || DIST[id]);
  SCENARIOS[`active_${id}`] = dodge
    ? { decisions: true, setup(m, ctx) { activeSetup(m); ctx.setBrain(m.current, scriptedBrain(dodge[0], dodge[1], '', 0)); }, untilEvent: (e) => e.type === 'boss.active', plusMs: ACTIVE_AT[id] }
    : { setup: activeSetup, untilEvent: (e) => e.type === 'boss.active', plusMs: ACTIVE_AT[id] };
  SCENARIOS[`recovery_${id}`] = { setup, untilEvent: (e) => e.type === 'boss.recover' || e.type === 'boss.curse_broken', plusMs: 300 };
}

// agents: moments re-played tick for tick from a recorded REAL LLM match (src/ai/replays.js)
Object.assign(SCENARIOS, REPLAY_SCENARIOS);

export const SCENARIO_NAMES = Object.keys(SCENARIOS);

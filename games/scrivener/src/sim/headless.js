// Headless attempts and matches on mock brains. Owner: sim. PURE (seeded, no clock), fast.
//
//   runAttempt({ seed, entrantId, loadout, temper, handicap, mock: { rng, skill, fam }, index?, n? })
//     -> { index, entrantId, n, result: 'kill'|'death'|'written', score, hpLeft, strokes, taken,
//          seconds, exchanges, killedBy, decisions: [{ k, slot, attackId, move, slip, hurt }], seed, stalled }
//   replayAttempt({ seed, entrantId, loadout, temper, handicap, decisions: [slot...] }) -> the same record
//   playMatch({ seed, entrants?, loadouts?, temper?, handicap?, order?, skill? })
//     -> { winnerId, how, deciding, attempts, loadouts, temper, order, offers, picks }
//
// Attempt `index` of a match plays on world seed attemptSeed(matchSeed, index).

import { TICK_MS } from '../core/constants.js';
import { makeRng, hash2 } from '../core/rng.js';
import { createWorld, stepWorld, applyDecision, attemptScore, defaultSlot } from './world.js';
import { agentController } from '../ai/reflex.js';
import { mockDecide, mockLearn, MOCK_SKILL } from './mock.js';
import { drawOffers, mockPick, PICK_ORDER } from './loadout.js';
import { standing } from '../show/rules.js';

export const MAX_ATTEMPT_TICKS = 60 * 150; // 150 s of sim time: far beyond any real attempt

export const attemptSeed = (matchSeed, index) => hash2(matchSeed >>> 0, 1000 + index);

const RESULT = { boss_dead: 'kill', agent_dead: 'death', written: 'written' };

function record(w, { entrantId, seed, decisions, stalled, index, n }) {
  const a = w.agent;
  const result = RESULT[w.outcome] || 'written';
  return {
    index: index || null, entrantId, n: n || null,
    result,
    score: attemptScore(w),
    hpLeft: Math.max(0, a.hp) / a.maxHp,
    strokes: w.exch,
    taken: w.log.damageTaken,
    dealt: w.log.damageDealt,
    seconds: +(((w.outcomeT ?? w.t)) / 1000).toFixed(2),
    exchanges: w.exch,
    killedBy: result === 'death' && w.log.killedBy ? w.log.killedBy.attackId : null,
    decisions,
    seed,
    stalled: !!stalled,
  };
}

// Plays one attempt. `choose(w)` -> { slot, slip? } at each decision.
function play({ seed, entrantId, loadout, temper, handicap, choose, index, n }) {
  const w = createWorld({ seed, agentId: entrantId, loadout, temper, handicap, decisions: true });
  const decisions = [];
  let ticks = 0, stalled = false;
  while (!w.outcome) {
    stepWorld(w, TICK_MS, agentController);
    w.events.length = 0;
    if (w.thinking) {
      const th = w.thinking;
      const c = choose(w);
      const rec = applyDecision(w, { slot: c.slot }, agentController);
      decisions.push({ k: th.k, slot: rec.slot, attackId: th.attackId, move: rec.move, slip: !!c.slip, rec });
    }
    if (++ticks > MAX_ATTEMPT_TICKS) { stalled = true; break; }
  }
  const out = decisions.map((d) => ({ k: d.k, slot: d.slot, attackId: d.attackId, move: d.move, slip: d.slip, hurt: d.rec.damageTaken > 0 }));
  return record(w, { entrantId, seed, decisions: out, stalled, index, n });
}

export function runAttempt({ seed, entrantId = 'a', loadout = null, temper = null, handicap = 0, mock = {}, index, n }) {
  const rng = mock.rng || makeRng(hash2(seed, 0xd0c));
  const skill = mock.skill == null ? MOCK_SKILL : mock.skill;
  const fam = mock.fam || null;
  return play({ seed, entrantId, loadout, temper, handicap, index, n, choose: (w) => mockDecide(w, rng, { skill, fam }) });
}

export function replayAttempt({ seed, entrantId = 'a', loadout = null, temper = null, handicap = 0, decisions = [], index, n }) {
  let i = 0;
  const slots = decisions.map((d) => (typeof d === 'number' ? d : d.slot));
  return play({
    seed, entrantId, loadout, temper, handicap, index, n,
    choose: (w) => ({ slot: i < slots.length ? slots[i++] : defaultSlot(w) }),
  });
}

// Each fighter builds from its own offers, in order cls -> weapon -> spell -> charm.
export function mockLoadouts(seed, offers, temper, entrants) {
  const loadouts = {}, picks = [];
  entrants.forEach((id, i) => {
    const rng = makeRng(hash2(seed >>> 0, 0xb1d + i));
    const mine = {};
    for (const slot of PICK_ORDER) {
      mine[slot] = mockPick(slot, offers[i][slot], { temper, mine, rng });
      picks.push({ entrantId: id, slot, options: offers[i][slot], choice: mine[slot] });
    }
    loadouts[id] = mine;
  });
  return { loadouts, picks };
}

export function playMatch({ seed = 1, entrants = ['a', 'b'], loadouts = null, temper = null, handicap = {}, order = null, skill = MOCK_SKILL } = {}) {
  const offersAll = drawOffers(seed);
  const T = temper || offersAll.temper;
  let picks = [];
  if (!loadouts) ({ loadouts, picks } = mockLoadouts(seed, offersAll.offers, T, entrants));
  const ord = order || ((hash2(seed >>> 0, 0x0de) & 1) ? [entrants[1], entrants[0]] : [entrants[0], entrants[1]]);
  const hc = typeof handicap === 'number' ? Object.fromEntries(entrants.map((id) => [id, handicap])) : (handicap || {});
  const sk = typeof skill === 'number' ? Object.fromEntries(entrants.map((id) => [id, skill])) : skill;
  const mocks = Object.fromEntries(entrants.map((id, i) => [id, {
    rng: makeRng(hash2(seed >>> 0, 0x5c1 + i)), skill: sk[id] == null ? MOCK_SKILL : sk[id], fam: {},
  }]));
  const attempts = [];
  let st = standing(ord, attempts);
  let guard = 0;
  while (!st.decided && guard++ < 12) {
    const turn = st.next;
    const m = mocks[turn.entrantId];
    const rec = runAttempt({
      seed: attemptSeed(seed, turn.index), entrantId: turn.entrantId, loadout: loadouts[turn.entrantId], temper: T,
      handicap: hc[turn.entrantId] || 0, mock: m, index: turn.index, n: turn.n,
    });
    mockLearn(m.fam, rec);
    attempts.push(rec);
    st = standing(ord, attempts);
  }
  return {
    winnerId: st.winnerId, how: st.how, deciding: st.deciding, attempts, loadouts, temper: T, order: ord,
    offers: offersAll.offers, picks, stalled: attempts.some((a) => a.stalled) || !st.decided,
  };
}

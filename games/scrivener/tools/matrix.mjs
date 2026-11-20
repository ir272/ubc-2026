#!/usr/bin/env node
// Counterplay matrix: for a loadout, play each of the four moves against each boss attack at a
// few distances, from the decision moment to the end of the exchange; report taken/dealt.
// Usage:
//   node tools/matrix.mjs [--cls duelist] [--weapon sabre] [--spell candle] [--charm seal]
//                         [--temper slow] [--attack ink_lunge] [--phase 2] [--json]
//   node tools/matrix.mjs --classes [--phase 1]    one line per class: good answers / bad attacks
// A "good answer" to an attack at a distance: a move that takes no damage (or the least, under 8)
// and deals some. An attack a class "handles badly": its two class moves come through clean at
// two distances or fewer (of four), or its best move still takes 15+ on average.

import { TICK_MS } from '../src/core/constants.js';
import { ATTACK_IDS, ATTACKS } from '../src/sim/attacks.js';
import { createWorld, stepWorld, applyDecision } from '../src/sim/world.js';
import { agentController } from '../src/ai/reflex.js';
import { movesFor, CLASS_IDS } from '../src/sim/loadout.js';
import { attackAllowed } from '../src/sim/boss.js';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const only = opt('attack', null);
const phase = parseInt(opt('phase', '1'), 10);
const temper = opt('temper', null);
const asJson = args.includes('--json');
const DISTS = [150, 260, 420, 650];

function cell(loadout, id, dist, slot) {
  const w = createWorld({ seed: 5, decisions: true, bossX: 700, agentX: 700 - dist, loadout, temper });
  w.boss.phase = phase;
  if (phase === 2) w.boss.hp = Math.floor(w.boss.maxHp * 0.45);
  w.boss.forceAttack = id;
  w.boss.aiLock = true;
  for (let i = 0; i < 60 && !w.thinking; i++) stepWorld(w, TICK_MS, agentController);
  const hp0 = w.agent.hp, b0 = w.boss.hp, t0 = w.t;
  applyDecision(w, { slot }, agentController);
  for (let i = 0; i < 900 && !w.outcome; i++) {
    stepWorld(w, TICK_MS, agentController);
    w.events.length = 0;
    if (w.boss.state === 'idle' && w.t > t0 + 300) break;
  }
  return { taken: hp0 - w.agent.hp, dealt: b0 - w.boss.hp };
}

function matrix(loadout) {
  const moves = movesFor(loadout);
  const out = {};
  for (const id of ATTACK_IDS) {
    if (only && id !== only) continue;
    const allowed = attackAllowed({ phase, mods: { stormPhase1: temper === 'restless' } }, ATTACKS[id]);
    if (!allowed) continue;
    out[id] = {};
    for (const dist of DISTS) {
      out[id][dist] = moves.map((m) => ({ slot: m.slot, move: m.id, ...cell(loadout, id, dist, m.slot) }));
    }
  }
  return { moves, out };
}

function summary(out) {
  let good = 0, total = 0;
  const bad = [];
  for (const [id, byDist] of Object.entries(out)) {
    total += 1;
    let goodDists = 0, bestTakenSum = 0, classClean = 0;
    for (const d of DISTS) {
      const cells = byDist[d];
      const best = Math.min(...cells.map((c) => c.taken));
      bestTakenSum += best;
      if (cells.some((c) => c.taken <= Math.max(0, best) && c.taken < 8 && c.dealt > 0)) goodDists += 1;
      if (cells.slice(0, 2).some((c) => c.taken === 0)) classClean += 1; // the class's own two moves
    }
    if (goodDists >= 3) good += 1;
    if (bestTakenSum / DISTS.length >= 15 || goodDists <= 1 || classClean <= 2) bad.push(id);
  }
  return { good, total, bad };
}

const loadout = {
  cls: opt('cls', 'duelist'), weapon: opt('weapon', 'sabre'), spell: opt('spell', 'candle'), charm: opt('charm', 'bookmark'),
};

if (args.includes('--classes')) {
  const res = {};
  for (const cls of CLASS_IDS) {
    const { out } = matrix({ ...loadout, cls });
    res[cls] = summary(out);
    if (!asJson) console.log(`${cls.padEnd(10)} good answers to ${res[cls].good}/${res[cls].total} attacks; handles badly: ${res[cls].bad.join(', ') || 'none'}`);
  }
  if (asJson) console.log(JSON.stringify(res, null, 2));
} else {
  const { moves, out } = matrix(loadout);
  if (asJson) console.log(JSON.stringify({ loadout, temper, phase, moves, out, summary: summary(out) }, null, 2));
  else {
    console.log(`loadout ${JSON.stringify(loadout)} temper ${temper || '-'} phase ${phase}`);
    for (const [id, byDist] of Object.entries(out)) {
      console.log(`\n== ${id} ==   cell = taken/dealt`);
      console.log('move'.padEnd(24) + DISTS.map((d) => String(d).padStart(10)).join(''));
      moves.forEach((m, i) => {
        console.log(`${m.slot} ${m.id}`.padEnd(24) + DISTS.map((d) => `${byDist[d][i].taken}/${byDist[d][i].dealt}`.padStart(10)).join(''));
      });
    }
    const s = summary(out);
    console.log(`\ngood answers to ${s.good}/${s.total} attacks; handles badly: ${s.bad.join(', ') || 'none'}`);
  }
}

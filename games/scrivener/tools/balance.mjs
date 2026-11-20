#!/usr/bin/env node
// Balance batch on mock brains: loadouts, tempers, the name clock. Prints JSON.
// Usage:
//   node tools/balance.mjs --matches 400 [--seed 1] [--skill 0.5]   stats + checks against DESIGN.md
//   node tools/balance.mjs --completion 200 [--seed 1]               every match finishes (tick guard)
//   node tools/balance.mjs --selftest                                 JSON round trip + replay checks
// Single process, no workers.

import { TICK_MS } from '../src/core/constants.js';
import { hash2, makeRng } from '../src/core/rng.js';
import { createWorld, stepWorld, applyDecision } from '../src/sim/world.js';
import { agentController } from '../src/ai/reflex.js';
import { mockDecide } from '../src/sim/mock.js';
import { playMatch, runAttempt, replayAttempt, attemptSeed } from '../src/sim/headless.js';
import { CLASS_IDS, WEAPON_IDS, SPELL_IDS, CHARM_IDS, TEMPER_IDS, loadoutScore, drawOffers, movesFor } from '../src/sim/loadout.js';
import { quartile } from '../src/show/rules.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const SEED = parseInt(opt('seed', '1'), 10);
const SKILL = parseFloat(opt('skill', '0.5'));
// --field lo,hi: each entrant's mock skill (base error rate) per match is drawn from [lo, hi]
// (a field of bots of mixed strength). --field 0 = everyone at --skill.
const FIELD = (opt('field', '0.1,0.95') === '0') ? null : opt('field', '0.1,0.95').split(',').map(Number);
const r3 = (x) => +x.toFixed(3);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);

function runMatches(N) {
  const out = [];
  for (let i = 0; i < N; i++) {
    const seed = hash2(SEED, 7000 + i);
    const order = i % 2 ? ['b', 'a'] : ['a', 'b'];
    const skill = FIELD
      ? { a: FIELD[0] + (FIELD[1] - FIELD[0]) * (hash2(seed, 1) / 4294967296), b: FIELD[0] + (FIELD[1] - FIELD[0]) * (hash2(seed, 2) / 4294967296) }
      : SKILL;
    out.push(playMatch({ seed, entrants: ['a', 'b'], order, skill }));
  }
  return out;
}

function rate(map) {
  const o = {};
  for (const [k, v] of Object.entries(map)) o[k] = v.n ? { win: r3(v.w / v.n), n: v.n } : { win: null, n: 0 };
  return o;
}

function stats(matches, wallMs) {
  const add = (m, k, won) => { const s = (m[k] ||= { w: 0, n: 0 }); s.n += 1; if (won) s.w += 1; };
  const byClass = {}, byWeapon = {}, bySpell = {}, byCharm = {}, byClassTemper = {};
  const attempts = [];
  const how = { kill: 0, both_kill: 0, damage: 0 };
  let firstMoverWins = 0, stalls = 0, predOk = 0, predN = 0;
  const killedBy = {};
  const moveUse = {};
  const clsAtt = {};
  const byN = {};
  for (const m of matches) {
    if (m.stalled) stalls += 1;
    if (m.how) how[m.how] += 1;
    if (m.winnerId === m.order[0]) firstMoverWins += 1;
    for (const id of m.order) {
      const L = m.loadouts[id], won = m.winnerId === id;
      add(byClass, L.cls, won); add(byWeapon, L.weapon, won); add(bySpell, L.spell, won); add(byCharm, L.charm, won);
      add((byClassTemper[m.temper] ||= {}), L.cls, won);
    }
    const [a, b] = m.order;
    const sa = loadoutScore(m.loadouts[a], m.temper), sb = loadoutScore(m.loadouts[b], m.temper);
    if (Math.abs(sa - sb) > 1e-9) { predN += 1; if ((sa > sb ? a : b) === m.winnerId) predOk += 1; }
    for (const at of m.attempts) {
      attempts.push(at);
      const c = (clsAtt[m.loadouts[at.entrantId].cls] ||= { n: 0, kill: 0, death: 0, score: 0, ex: 0 });
      c.n += 1; c.kill += at.result === 'kill' ? 1 : 0; c.death += at.result === 'death' ? 1 : 0; c.score += at.score; c.ex += at.exchanges;
      const bn = (byN[at.n] ||= { n: 0, kill: 0, score: 0 });
      bn.n += 1; bn.kill += at.result === 'kill' ? 1 : 0; bn.score += at.score;
      if (at.killedBy) killedBy[at.killedBy] = (killedBy[at.killedBy] || 0) + 1;
      for (const d of at.decisions) moveUse[d.move] = (moveUse[d.move] || 0) + 1;
    }
  }
  const classRate = rate(byClass);
  const temperTable = {};
  const temperMoves = {};
  for (const t of TEMPER_IDS) {
    const row = rate(byClassTemper[t] || {});
    temperTable[t] = {};
    let best = 0;
    for (const c of CLASS_IDS) {
      const r = row[c] || { win: null, n: 0 };
      const delta = r.win == null || classRate[c].win == null ? null : r3(r.win - classRate[c].win);
      temperTable[t][c] = { win: r.win, n: r.n, delta };
      if (delta != null && r.n >= 15 && Math.abs(delta) > Math.abs(best)) best = delta;
    }
    temperMoves[t] = best;
  }
  const q = { q1: 0, q2: 0, q3: 0, q4: 0 };
  for (const at of attempts) q[quartile(at.score, at.result)] += 1;
  const qs = Object.fromEntries(Object.entries(q).map(([k, v]) => [k, r3(v / attempts.length)]));
  const kills = attempts.filter((a) => a.result === 'kill').length;
  const deaths = attempts.filter((a) => a.result === 'death').length;
  const meanEx = mean(attempts.map((a) => a.exchanges));
  const meanSec = mean(attempts.map((a) => a.seconds));
  const killRate = kills / attempts.length;
  const fm = firstMoverWins / matches.length;
  const pred = predN ? predOk / predN : null;
  const classWins = Object.values(classRate).map((c) => c.win).filter((x) => x != null);
  const checks = {
    exchanges_4_to_6: { value: r3(meanEx), pass: meanEx >= 4 && meanEx <= 6 },
    seconds_16_to_26: { value: r3(meanSec), pass: meanSec >= 16 && meanSec <= 26 },
    kill_rate_18_to_28: { value: r3(killRate), pass: killRate >= 0.18 && killRate <= 0.28 },
    class_win_40_to_60: { value: { min: Math.min(...classWins), max: Math.max(...classWins) }, pass: classWins.every((x) => x >= 0.4 && x <= 0.6) },
    temper_moves_a_class_10pt: { value: temperMoves, pass: Object.values(temperMoves).every((d) => Math.abs(d) >= 0.1) },
    no_stall: { value: stalls, pass: stalls === 0 },
    quartiles_each_10pct: { value: qs, pass: Object.values(qs).every((x) => x >= 0.1) },
    first_mover_45_to_55: { value: r3(fm), pass: fm >= 0.45 && fm <= 0.55 },
    tape_predictability_55_to_70: { value: pred == null ? null : r3(pred), pass: pred != null && pred >= 0.55 && pred <= 0.7 },
  };
  return {
    matches: matches.length, seed: SEED, skill: FIELD ? { field: FIELD } : SKILL, wallMs,
    classWin: classRate,
    classByTemper: temperTable,
    weaponWin: rate(byWeapon), spellWin: rate(bySpell), charmWin: rate(byCharm),
    attempts: attempts.length,
    attemptKillRate: r3(killRate), attemptDeathRate: r3(deaths / attempts.length),
    attemptWrittenRate: r3((attempts.length - kills - deaths) / attempts.length),
    meanExchanges: r3(meanEx), meanSeconds: r3(meanSec), meanScore: r3(mean(attempts.map((a) => a.score))),
    attemptsPerMatch: r3(attempts.length / matches.length),
    decidedBy: Object.fromEntries(Object.entries(how).map(([k, v]) => [k, r3(v / matches.length)])),
    quartiles: qs,
    firstMoverWin: r3(fm),
    tapePredictability: pred == null ? null : r3(pred),
    killedBy, moveUse,
    classAttempts: Object.fromEntries(Object.entries(clsAtt).map(([k, c]) => [k, { kill: r3(c.kill / c.n), death: r3(c.death / c.n), score: r3(c.score / c.n), exchanges: r3(c.ex / c.n) }])),
    byAttemptN: Object.fromEntries(Object.entries(byN).map(([k, c]) => [k, { n: c.n, kill: r3(c.kill / c.n), score: r3(c.score / c.n) }])),
    checks,
    allPass: Object.values(checks).every((c) => c.pass),
  };
}

// ---- selftest --------------------------------------------------------------------------------

function snap(w) {
  return [w.tick, w.t, w.boss.hp, w.agent.hp, Math.round(w.agent.x * 1000), Math.round(w.boss.x * 1000), w.boss.state, w.agent.state, w.exch, w.outcome].join(',');
}

function selftest() {
  const fails = [];
  const results = {};
  // 1. JSON round trip at a decision, then the same decisions on both copies, compared per tick
  const combos = [
    { loadout: { cls: 'warden', weapon: 'maul', spell: 'blot', charm: 'seal' }, temper: 'enraged' },
    { loadout: { cls: 'hexer', weapon: 'censer', spell: 'candle', charm: 'ember' }, temper: 'tinder' },
    { loadout: { cls: 'penitent', weapon: 'quill', spell: 'knot', charm: 'nib' }, temper: 'counting' },
    { loadout: { cls: 'thief', weapon: 'knives', spell: 'margin', charm: 'ribbon' }, temper: 'slow' },
    { loadout: { cls: 'duelist', weapon: 'pole', spell: 'echo', charm: 'sandglass' }, temper: 'restless' },
    { loadout: { cls: 'archivist', weapon: 'sabre', spell: 'mend', charm: 'lens' }, temper: 'ironbound' },
  ];
  let rtTicks = 0;
  combos.forEach((cfg, ci) => {
    const seed = 900 + ci;
    const A = createWorld({ seed, agentId: 'x', ...cfg, handicap: 0.1 });
    while (!A.thinking && !A.outcome) { stepWorld(A, TICK_MS, agentController); A.events.length = 0; }
    // step to the SECOND decision so plans, hazards and cooldowns are mid-flight
    const rng0 = makeRng(seed);
    applyDecision(A, { slot: 2 }, agentController);
    while (!A.thinking && !A.outcome) { stepWorld(A, TICK_MS, agentController); A.events.length = 0; }
    const B = JSON.parse(JSON.stringify(A));
    const C = structuredClone(A);
    const rng = makeRng(seed + 1);
    let n = 0, diverged = null;
    for (; n < 60 * 120 && !A.outcome; n++) {
      if (A.thinking) {
        if (!B.thinking || !C.thinking) { diverged = `tick ${n}: decision mismatch`; break; }
        const { slot } = mockDecide(A, rng, { skill: 0.4 });
        applyDecision(A, { slot }, agentController);
        applyDecision(B, { slot }, agentController);
        applyDecision(C, { slot }, agentController);
      }
      stepWorld(A, TICK_MS, agentController); stepWorld(B, TICK_MS, agentController); stepWorld(C, TICK_MS, agentController);
      A.events.length = 0; B.events.length = 0; C.events.length = 0;
      const sa = snap(A);
      if (sa !== snap(B)) { diverged = `tick ${n}: json copy diverged ${sa} vs ${snap(B)}`; break; }
      if (sa !== snap(C)) { diverged = `tick ${n}: structuredClone copy diverged`; break; }
    }
    rtTicks += n;
    void rng0;
    if (diverged) fails.push(`roundtrip ${cfg.loadout.cls}/${cfg.temper}: ${diverged}`);
    // the JSON of a world never carries non-finite numbers or undefined
    const bad = [];
    (function walk(o, p) {
      if (typeof o === 'number' && !Number.isFinite(o)) bad.push(p);
      else if (o && typeof o === 'object') for (const k of Object.keys(o)) { if (o[k] === undefined) bad.push(p + '.' + k + '=undefined'); walk(o[k], p + '.' + k); }
      else if (typeof o === 'function') bad.push(p + ' fn');
    })(A, 'w');
    if (bad.length) fails.push(`non-plain values in world: ${bad.slice(0, 5).join(', ')}`);
  });
  results.roundtrip = { worlds: combos.length, ticksCompared: rtTicks };

  // 2. replayAttempt reproduces runAttempt from the seed and the recorded slots
  let replays = 0;
  for (let i = 0; i < 24; i++) {
    const seed = hash2(4242, i);
    const offers = drawOffers(seed);
    const o = offers.offers[i % 2];
    const loadout = { cls: o.cls[i % 3], weapon: o.weapon[(i + 1) % 3], spell: o.spell[(i + 2) % 3], charm: o.charm[i % 3] };
    const run = runAttempt({ seed: attemptSeed(seed, 1), entrantId: 'r', loadout, temper: offers.temper, handicap: (i % 4) * 0.1, mock: { rng: makeRng(i), skill: 0.5, fam: {} } });
    const rep = replayAttempt({ seed: attemptSeed(seed, 1), entrantId: 'r', loadout, temper: offers.temper, handicap: (i % 4) * 0.1, decisions: run.decisions.map((d) => d.slot) });
    const strip = (r) => JSON.stringify({ ...r, decisions: r.decisions.map((d) => ({ k: d.k, slot: d.slot, attackId: d.attackId })) });
    if (strip(run) !== strip(rep)) fails.push(`replay ${i} differs: ${strip(run).slice(0, 200)} vs ${strip(rep).slice(0, 200)}`);
    replays += 1;
  }
  results.replays = replays;

  // 3. bad / unavailable slots fall back to the default move
  const w = createWorld({ seed: 3, loadout: { cls: 'thief', weapon: 'sabre', spell: 'knot', charm: 'seal' } });
  while (!w.thinking) stepWorld(w, TICK_MS, agentController);
  const r1 = applyDecision(w, { slot: 9 }, agentController);
  if (!r1.fallback || r1.slot !== 0) fails.push('bad slot did not fall back to slot 0');
  results.moves = movesFor(w.agent.loadout).map((m) => `${m.slot}:${m.id}`);

  // 4. every move of every class/spell plays without throwing
  let played = 0;
  for (const cls of CLASS_IDS) for (const spell of SPELL_IDS) {
    for (let slot = 0; slot < 4; slot++) {
      const ww = createWorld({ seed: 11 + slot, loadout: { cls, weapon: WEAPON_IDS[played % 6], spell, charm: CHARM_IDS[played % 7] }, temper: TEMPER_IDS[played % 6] });
      let guard = 0;
      while (!ww.outcome && guard++ < 60 * 40) {
        stepWorld(ww, TICK_MS, agentController);
        ww.events.length = 0;
        if (ww.thinking) applyDecision(ww, { slot }, agentController);
      }
      played += 1;
    }
  }
  results.movePlays = played;
  return { ok: fails.length === 0, fails, results };
}

// ---- main ------------------------------------------------------------------------------------

if (args.includes('--selftest')) {
  const r = selftest();
  console.log(JSON.stringify(r, null, 2));
  process.exit(r.ok ? 0 : 1);
} else if (opt('completion', null)) {
  const N = parseInt(opt('completion', '200'), 10);
  const t0 = Date.now();
  const ms = runMatches(N);
  const stalls = ms.filter((m) => m.stalled).length;
  const undecided = ms.filter((m) => !m.winnerId).length;
  const out = { matches: N, stalls, undecided, maxAttempts: Math.max(...ms.map((m) => m.attempts.length)), maxAttemptSeconds: Math.max(...ms.flatMap((m) => m.attempts.map((a) => a.seconds))), wallMs: Date.now() - t0, pass: stalls === 0 && undecided === 0 };
  console.log(JSON.stringify(out, null, 2));
  process.exit(out.pass ? 0 : 1);
} else {
  const N = parseInt(opt('matches', '400'), 10);
  const t0 = Date.now();
  const ms = runMatches(N);
  console.log(JSON.stringify(stats(ms, Date.now() - t0), null, 2));
}

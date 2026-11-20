#!/usr/bin/env node
// Headless mock matches under the show rules (src/show/rules.js), via src/sim/headless.js.
// Usage: node tools/sim.mjs [--matches 50] [--seed 1] [--verbose]
// For the balance checks use tools/balance.mjs.

import { hash2 } from '../src/core/rng.js';
import { playMatch } from '../src/sim/headless.js';

const args = process.argv.slice(2);
const opt = (name, def) => {
  const i = args.indexOf('--' + name);
  return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : def;
};
const N = parseInt(opt('matches', opt('fights', '50')), 10);
const SEED = parseInt(opt('seed', '1'), 10);
const VERBOSE = args.includes('--verbose');

const t0 = Date.now();
const attempts = [];
const how = {};
for (let i = 0; i < N; i++) {
  const m = playMatch({ seed: hash2(SEED, i), entrants: ['a', 'b'], order: i % 2 ? ['b', 'a'] : ['a', 'b'] });
  how[m.how] = (how[m.how] || 0) + 1;
  attempts.push(...m.attempts);
  if (VERBOSE) {
    console.error(`match ${i + 1} ${m.temper} ${m.order.map((id) => `${id}=${Object.values(m.loadouts[id]).join('/')}`).join(' vs ')} -> ${m.winnerId} (${m.how})`);
    for (const a of m.attempts) console.error(`  #${a.index} ${a.entrantId} ${a.result} score ${a.score.toFixed(2)} k=${a.exchanges} ${a.seconds}s [${a.decisions.map((d) => d.move).join(' ')}]`);
  }
}
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const deathsByAttack = {};
for (const a of attempts) if (a.killedBy) deathsByAttack[a.killedBy] = (deathsByAttack[a.killedBy] || 0) + 1;
console.log(JSON.stringify({
  matches: N, attempts: attempts.length,
  killRate: +(attempts.filter((a) => a.result === 'kill').length / attempts.length).toFixed(3),
  deathRate: +(attempts.filter((a) => a.result === 'death').length / attempts.length).toFixed(3),
  meanScore: +mean(attempts.map((a) => a.score)).toFixed(3),
  meanExchanges: +mean(attempts.map((a) => a.exchanges)).toFixed(2),
  meanSeconds: +mean(attempts.map((a) => a.seconds)).toFixed(1),
  decidedBy: how, deathsByAttack,
  wallMs: Date.now() - t0,
}, null, 2));

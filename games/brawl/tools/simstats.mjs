// Ringout ability stats: how often each fighter reaches for its specials, how much damage comes through them, and the
// health numbers (finish rate, length, win rates, quiet stretches). One thread, inside the shared machine lock.
//
//   node tools/simstats.mjs                 against src/sim2, 384 fights (every ordered pair, mixed coaches)
//   node tools/simstats.mjs --sim src/sim   another copy of the sim
//   node tools/simstats.mjs --n 768         more fights (a multiple of 16 keeps the pairs even)
//   node tools/simstats.mjs --coaches adaptive,adaptive   force the coaches on both sides
//   node tools/simstats.mjs --fighters gantry,vise        only these fighters (every ordered pair, mirrors included)
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { withLock } from './lib/lock.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d; };
const simDir = arg('--sim', 'src/sim2');
const N = +arg('--n', 384);
const forced = arg('--coaches', '');
const only = arg('--fighters', '');
const sim = await import(path.resolve(here, '..', simDir, 'index.ts'));
const F = only ? only.split(',') : sim.FIGHTER_IDS;
const CS = ['adaptive', 'rush', 'keepaway', 'bait', 'wall', 'random'];
const TOOLS = ['special', 'special2'];

function seedFor(k) {
  let h = 2166136261 >>> 0;
  const str = 'simstats-' + k;
  let out = '';
  for (let r = 0; r < 4; r++) {
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i) + r; h = Math.imul(h, 16777619) >>> 0; }
    out += h.toString(16).padStart(8, '0');
  }
  return out;
}

function runOne(k) {
  const fa = F[k % F.length], fb = F[Math.floor(k / F.length) % F.length];
  const coaches = forced ? forced.split(',') : k % 3 === 0 ? ['adaptive', 'adaptive'] : [CS[(k * 5) % 6], CS[(k * 7 + 3) % 6]];
  const h = sim.makeHeader(seedFor(k), [fa, fb], { lives: 2 });
  const dmg = [{}, {}];
  const uses = [0, 0];
  const ev = { blink: 0, snare: 0, pull: 0, hazard: 0, grabAfterPull: 0, tetherShielded: 0 };
  let lastPull = [-999, -999];
  let quiet = 0, lastEx = 0, longQuiet = 0;
  const r = sim.runFight(h, {
    coaches,
    onTick(s, evs) {
      for (const e of evs) {
        if (e.t === 'move' && TOOLS.includes(e.move)) uses[e.side]++;
        else if (e.t === 'hit') {
          const m = e.move === 'projectile' ? (e.via || 'special') : e.move;
          dmg[e.by][m] = (dmg[e.by][m] || 0) + e.damage;
        } else if (e.t === 'blink') ev.blink++;
        else if (e.t === 'snare') ev.snare++;
        else if (e.t === 'pull') { ev.pull++; lastPull[e.by] = e.tick; }
        else if (e.t === 'hazard' && e.state === 'placed') ev.hazard++;
        else if (e.t === 'grab' && e.tick - lastPull[e.by] < 60) ev.grabAfterPull++;
        else if (e.t === 'shield_hit' && e.via && s.fighters[e.by].fighter === 'vise' && e.via === 'special') ev.tetherShielded++;
      }
      const gap = s.tick - s.ctl.lastExchange;
      if (gap > quiet) quiet = gap;
      if (gap > 360 && lastEx !== s.ctl.lastExchange) { longQuiet++; lastEx = s.ctl.lastExchange; }
    },
  });
  return { fighters: [fa, fb], winner: r.winner, ticks: r.ticks, dmg, uses, ev, quiet, longQuiet, finished: r.ticks < h.timeLimitTicks + 3600 };
}

const t0 = Date.now();
const res = [];
await withLock(async () => { for (let k = 0; k < N; k++) res.push(runOne(k)); });
const pct = (x) => (100 * x).toFixed(1).padStart(5) + '%';

console.log(`sim: ${simDir}  ${res.length} fights in ${((Date.now() - t0) / 1000).toFixed(1)} s  SIM_VERSION ${sim.SIM_VERSION}\n`);
// health
const lens = res.map((r) => r.ticks / 60).sort((a, b) => a - b);
const med = lens[Math.floor(lens.length / 2)];
const fin = res.filter((r) => r.finished).length;
const over6 = res.filter((r) => r.quiet > 360).length;
console.log(`PACE  finished ${fin}/${res.length} (${pct(fin / res.length)})  length median ${med.toFixed(0)} s (p10 ${lens[Math.floor(lens.length * 0.1)].toFixed(0)}, p90 ${lens[Math.floor(lens.length * 0.9)].toFixed(0)})  fights with a quiet stretch over 6 s: ${over6} (worst ${(Math.max(...res.map((r) => r.quiet)) / 60).toFixed(1)} s)`);
// win rates (non-mirror) and mirrors
const w = {}, g = {};
let mirA = 0, mirN = 0;
for (const r of res) {
  if (r.fighters[0] === r.fighters[1]) { mirN++; if (r.winner === 0) mirA++; continue; }
  for (let i = 0; i < 2; i++) { g[r.fighters[i]] = (g[r.fighters[i]] || 0) + 1; if (r.winner === i) w[r.fighters[i]] = (w[r.fighters[i]] || 0) + 1; }
}
console.log(`WINS  ` + F.map((f) => `${f} ${pct((w[f] || 0) / g[f])}`).join('  ') + `   mirrors: side 0 wins ${pct(mirA / mirN)} of ${mirN}`);
const mu = {};
for (const r of res) if (r.fighters[0] !== r.fighters[1]) { const k = r.fighters.join('-'); mu[k] = mu[k] || [0, 0]; mu[k][1]++; if (r.winner === 0) mu[k][0]++; }
const pairs = [];
for (let i = 0; i < F.length; i++) for (let j = i + 1; j < F.length; j++) {
  const a = mu[F[i] + '-' + F[j]] || [0, 0], b = mu[F[j] + '-' + F[i]] || [0, 0];
  pairs.push(`${F[i]}>${F[j]} ${pct((a[0] + (b[1] - b[0])) / Math.max(1, a[1] + b[1]))}`);
}
console.log(`      ` + pairs.join('  '));
// usage
console.log(`\nUSE   seconds between specials (special or special2), per fighter, target <= 4 s`);
for (const f of F) {
  let u = 0, t = 0;
  for (const r of res) for (let i = 0; i < 2; i++) if (r.fighters[i] === f) { u += r.uses[i]; t += r.ticks / 60; }
  console.log(`      ${f.padEnd(7)} ${(t / Math.max(1, u)).toFixed(1).padStart(5)} s  (${(u / res.filter((r) => r.fighters.includes(f)).length).toFixed(1)} a fight)`);
}
// damage
console.log(`\nDAMAGE by move, per fighter (share of that fighter's damage); top move must be <= 35%`);
let all = 0, tool = 0;
for (const f of F) {
  const d = {};
  for (const r of res) for (let i = 0; i < 2; i++) if (r.fighters[i] === f) for (const [m, v] of Object.entries(r.dmg[i])) d[m] = (d[m] || 0) + v;
  const tot = Object.values(d).reduce((a, b) => a + b, 0);
  all += tot;
  const tl = TOOLS.reduce((a, m) => a + (d[m] || 0), 0);
  tool += tl;
  const top = Object.entries(d).sort((a, b) => b[1] - a[1]);
  console.log(`      ${f.padEnd(7)} tools ${pct(tl / tot)}  special ${pct((d.special || 0) / tot)}  special2 ${pct((d.special2 || 0) / tot)}  top: ` +
    top.slice(0, 4).map(([m, v]) => `${m} ${pct(v / tot)}`).join(' ') + (top[0][1] / tot > 0.35 ? '  OVER 35%' : ''));
}
console.log(`      all fighters: ${pct(tool / all)} of all damage through special and special2 (target >= 35%)`);
const E = res.reduce((a, r) => { for (const k of Object.keys(r.ev)) a[k] = (a[k] || 0) + r.ev[k]; return a; }, {});
console.log(`\nEVENTS per fight: ` + Object.entries(E).map(([k, v]) => `${k} ${(v / res.length).toFixed(2)}`).join('  '));

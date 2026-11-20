// Ringout batch: runs many mock-coach fights on at most 2 worker processes and prints the
// "minds matter", balance, pacing, readability, dial and determinism numbers.
//
//   npm run batch                     full report against src/sim
//   npm run batch -- --sim src/sim2   the same against another copy of the sim
//   npm run batch -- --quick          20 fights: who won and how long
//   npm run batch -- --n 8            scale (default 8)
//   npm run batch -- --only adaptive|stances|mirror|fighters|pace|views|dials|moves|det
//   npm run batch -- --story [k] [--fighters kiln,tick] [--coaches rush,bait]
//                                     a play-by-play of one fight (k picks the seed)
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { withLock, touchLock } from './lib/lock.mjs';

const here = path.dirname(fileURLToPath(import.meta.url));
const argv = process.argv.slice(2);
function simPath(args) {
  const i = args.indexOf('--sim');
  const dir = i >= 0 ? args[i + 1] : 'src/sim';
  return path.resolve(here, '..', dir, 'index.ts');
}
const SIM = isMainThread ? simPath(argv) : workerData.sim;

// ------------------------------------------------------------------------------------------------
// Worker: runs one fight per job and returns compact stats
// ------------------------------------------------------------------------------------------------

const OFF = 8.25;
function offstage(f) {
  if (f.grounded) return false;
  if (f.action === 'dead' || f.action === 'respawn' || f.action === 'ledgehang' || f.action === 'ledgeclimb' || f.action === 'entrance') return false;
  return f.x < -OFF || f.x > OFF || f.y < -0.5;
}

function registerCoach(sim, spec) {
  if (typeof spec === 'string') return spec;
  const key = 'p:' + JSON.stringify(spec);
  if (!sim.COACHES[key]) {
    const p = { ...sim.DEFAULT_PLAN, ...spec };
    sim.COACHES[key] = { id: key, decide: () => ({ ...p }) };
  }
  return key;
}

export function runOne(sim, j) {
  const h = sim.makeHeader(j.seed, j.fighters, { lives: j.lives || 2, handicap: j.handicap });
  const coaches = [registerCoach(sim, j.coaches[0]), registerCoach(sim, j.coaches[1])];
  const t0 = performance.now();
  let kos = 0, sd = 0;
  const lastHit = [-9999, -9999];
  const moves = [{}, {}];
  const trips = [];
  const trip = [null, null];
  const views = [];
  const stanceSince = [0, 0];
  const lastStance = ['', ''];
  const lifeStart = [0, 0];
  const firstLoss = [-1, -1];
  const dmgTaken = [0, 0];
  const dmgEarly = [0, 0];
  const koInfo = [];
  let longGaps = 0, gapOpen = false;
  const events = j.story ? [] : null;
  const r = sim.runFight(h, {
    coaches,
    onTick(s, ev) {
      const T = s.tick;
      for (let i = 0; i < 2; i++) {
        if (s.plans[i].stance !== lastStance[i]) { lastStance[i] = s.plans[i].stance; stanceSince[i] = T; }
      }
      for (const e of ev) {
        if (events) events.push(e);
        if (e.t === 'move') moves[e.side][e.move] = (moves[e.side][e.move] || 0) + 1;
        else if (e.t === 'throw' && e.move !== 'special') moves[e.by][e.move] = (moves[e.by][e.move] || 0) + 1;
        else if (e.t === 'hit') {
          lastHit[e.to] = e.tick;
          dmgTaken[e.to] += e.damage;
          if (e.tick <= 1200) dmgEarly[e.to] += e.damage;
          if (trip[e.to] && trip[e.to].control) trip[e.to].hit = true;
        } else if (e.t === 'ko') {
          kos++;
          if (e.tick - lastHit[e.side] > 240) sd++;
          if (firstLoss[e.side] < 0) firstLoss[e.side] = e.tick;
          koInfo.push({ side: e.side, life: e.tick - lifeStart[e.side], damage: e.damage, sd: e.tick - lastHit[e.side] > 240 });
          if (trip[e.side]) { trip[e.side].ok = false; trip[e.side].end = true; }
        } else if (e.t === 'respawn') lifeStart[e.side] = e.tick;
      }
      // offstage trips: a recovery situation once the fighter can act out there
      for (let i = 0; i < 2; i++) {
        const f = s.fighters[i], o = s.fighters[1 - i];
        const out = offstage(f);
        let t = trip[i];
        if (t && t.end) {
          if (t.control && t.far) trips.push(t);
          trip[i] = t = null;
        }
        if (!t && out) {
          trip[i] = t = { side: i, rec: s.plans[i].recover, edge: s.plans[1 - i].edge, start: T, control: false, hit: false, ok: false, chaserOut: false, chaserHurt: false };
        }
        if (t) {
          if (f.action !== 'hitstun' && f.action !== 'dead') t.control = true;
          if (Math.abs(f.x) > 10 || f.y < -2) t.far = true;
          if (t.far && t.control && !t.said) { t.said = true; if (events) events.push({ t: '_off', tick: T, side: i, x: f.x, y: f.y, edge: s.plans[1 - i].edge, rec: s.plans[i].recover }); }
          if (offstage(o) && !t.chaserOut) { t.chaserOut = true; if (events && t.said) events.push({ t: '_chase', tick: T, side: 1 - i }); }
          if (!out && (f.grounded || f.action === 'ledgehang' || f.action === 'ledgeclimb')) {
            t.ok = true; t.end = true;
            if (events && t.said) events.push({ t: '_back', tick: T, side: i, how: f.action === 'ledgehang' || f.action === 'ledgeclimb' ? 'ledge' : f.y > 0.5 ? 'platform' : 'deck', high: f.grounded });
          }
        }
      }
      // the chaser is punished when it gets hit while it is off stage chasing
      for (const e of ev) {
        if (e.t === 'hit' && offstage(s.fighters[e.to]) && trip[1 - e.to] && trip[1 - e.to].chaserOut) trip[1 - e.to].chaserHurt = true;
        if (e.t === 'ko' && trip[1 - e.side] && trip[1 - e.side].chaserOut) trip[1 - e.side].chaserHurt = true;
      }
      // what each coach view says about the opponent, once it has had two views of an unchanged stance
      if (T % 180 === 0 && T >= 360 && s.phase !== 'over') {
        for (let i = 0; i < 2; i++) {
          const o = 1 - i;
          if (T - stanceSince[o] < 360) continue;
          const fo = s.fighters[o], fm = s.fighters[i];
          if (fo.action === 'dead' || fo.action === 'respawn' || fm.action === 'dead' || fm.action === 'respawn') continue;
          const v = sim.coachView(s, h, i);
          views.push([s.plans[o].stance, v.oppLooksLike]);
        }
      }
      const gap = T - s.ctl.lastExchange;
      if (gap > 360 && !gapOpen) { longGaps++; gapOpen = true; } else if (gap <= 360) gapOpen = false;
    },
  });
  // adaptive plan behaviour
  const planSeq = [[], []];
  for (const p of r.plans) planSeq[p.side].push({ tick: p.tick, stance: p.plan.stance });
  for (const q of planSeq) q.sort((a, b) => a.tick - b.tick);
  const stanceSeq = planSeq.map((q) => q.map((x) => x.stance));
  return {
    id: j.id, winner: r.winner, ticks: r.ticks, firstKo: r.firstKo, maxGap: r.maxGap, longGaps, lives: r.lives, ms: performance.now() - t0, kos, sd,
    stanceTicks: r.stanceTicks, sudden: r.ticks > h.timeLimitTicks, moves, trips, views, stanceSeq, firstLoss, dmgTaken, dmgEarly, koInfo,
    events, plans: j.story ? r.plans : undefined,
  };
}

if (!isMainThread) {
  const sim = await import(SIM);
  parentPort.on('message', (jobs) => {
    const out = [];
    for (const j of jobs) out.push(runOne(sim, j));
    parentPort.postMessage(out);
  });
}

/**
 * Runs the jobs on 2 workers. The machine is shared with headless browser captures: every slice of work (about 15 s)
 * runs inside the shared lock (tools/lib/lock.mjs) and releases it in between, so a capture is never starved.
 */
const SLICE = 2400;
async function runJobs(jobs) {
  const W = 2;
  const workers = Array.from({ length: W }, () => new Worker(fileURLToPath(import.meta.url), { workerData: { sim: SIM } }));
  const byId = new Map();
  try {
    for (let a = 0; a < jobs.length; a += SLICE) {
      const part = jobs.slice(a, a + SLICE);
      await withLock(async () => {
        const chunks = Array.from({ length: W }, () => []);
        part.forEach((j, i) => chunks[i % W].push(j));
        const res = await Promise.all(workers.map((w, i) => new Promise((ok, bad) => {
          w.once('message', ok); w.once('error', bad); w.postMessage(chunks[i]);
        })));
        for (const r of res.flat()) byId.set(r.id, r);
        touchLock();
      });
    }
  } finally {
    await Promise.all(workers.map((w) => w.terminate()));
  }
  return jobs.map((j) => ({ ...j, ...byId.get(j.id) }));
}

// ------------------------------------------------------------------------------------------------
// Main: the report
// ------------------------------------------------------------------------------------------------

const FIGHTERS = ['kiln', 'tick', 'gantry', 'vise'];
const STANCES = ['rush', 'keepaway', 'bait', 'wall'];
let nextId = 0;
function seedFor(tag, k) {
  let s = '';
  const base = `${tag}:${k}`;
  for (let i = 0; i < 4; i++) {
    let h = 2166136261 ^ i;
    for (let c = 0; c < base.length; c++) h = Math.imul(h ^ base.charCodeAt(c), 16777619) >>> 0;
    s += h.toString(16).padStart(8, '0');
  }
  return s;
}
/** a small deterministic generator for the batch's own choices */
function lcg(seed) { let x = seed >>> 0; return () => { x = (Math.imul(x, 1664525) + 1013904223) >>> 0; return x / 4294967296; }; }

/** coach A vs coach B over all fighter pairs, both side orders. Returns jobs tagged with which side is A. */
function pairJobs(tag, a, b, n, extra = {}) {
  const jobs = [];
  for (let k = 0; k < n; k++) {
    const fa = FIGHTERS[k % 4], fb = FIGHTERS[(k + Math.floor(k / 4)) % 4];
    for (const swap of [false, true]) {
      const seed = seedFor(tag, k);
      const hc = extra.handicap;
      jobs.push({ id: nextId++, seed, fighters: swap ? [fb, fa] : [fa, fb], coaches: swap ? [b, a] : [a, b], aSide: swap ? 1 : 0, tag,
        handicap: hc ? (swap ? [hc[1], hc[0]] : hc) : undefined });
    }
  }
  return jobs;
}

function pct(x) { return (100 * x).toFixed(0).padStart(3) + '%'; }
function q(arr, p) { const s = [...arr].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; }
function secs(t) { return (t / 60).toFixed(0) + 's'; }
function mean(a) { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

const FIXED = {
  rush: { stance: 'rush', aggression: 0.8, range: 'close', grabMix: 0.15, edge: 'stage', recover: 'high' },
  keepaway: { stance: 'keepaway', aggression: 0.45, range: 'far', grabMix: 0.15, edge: 'stage', recover: 'high' },
  bait: { stance: 'bait', aggression: 0.45, range: 'mid', grabMix: 0.2, edge: 'stage', recover: 'mix' },
  wall: { stance: 'wall', aggression: 0.2, range: 'mid', grabMix: 0.4, edge: 'stage', recover: 'mix' },
};

async function main() {
  const args = argv;
  const quick = args.includes('--quick');
  const ni = args.indexOf('--n');
  const n = ni >= 0 ? +args[ni + 1] : 8;
  const oi = args.indexOf('--only');
  const only = oi >= 0 ? args[oi + 1].split(',') : [];
  const t0 = Date.now();
  console.log(`sim: ${path.relative(path.join(here, '..'), SIM)}`);

  if (args.includes('--story')) return withLock(() => story(args));

  if (quick) {
    const jobs = [];
    for (let k = 0; k < 20; k++) {
      const coaches = [['adaptive', 'adaptive'], ['rush', 'bait'], ['keepaway', 'wall'], ['adaptive', 'random'], ['wall', 'rush']][k % 5];
      jobs.push({ id: nextId++, seed: seedFor('quick', k), fighters: [FIGHTERS[k % 4], FIGHTERS[(k * 3 + 1) % 4]], coaches, tag: 'quick' });
    }
    const res = await runJobs(jobs);
    for (const r of res) {
      console.log(`${r.fighters[0].padEnd(6)} (${r.coaches[0].padEnd(8)}) vs ${r.fighters[1].padEnd(6)} (${r.coaches[1].padEnd(8)})  winner: side ${r.winner} ${r.fighters[r.winner].padEnd(6)}  ${(r.ticks / 60).toFixed(1).padStart(6)} s  first KO ${(r.firstKo / 60).toFixed(1).padStart(5)} s  longest quiet ${(r.maxGap / 60).toFixed(1)} s  lives ${r.lives.join('-')}  ${r.ms.toFixed(0)} ms`);
    }
    console.log(`20 fights in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
    return;
  }

  const all = [];
  const want = (k) => !only.length || only.includes(k);

  // 1. adaptive vs each fixed stance
  if (want('adaptive')) for (const st of STANCES) all.push(...pairJobs('ad-' + st, 'adaptive', st, n * 8));
  // 2. fixed stance table
  if (want('stances')) for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) all.push(...pairJobs(`st-${STANCES[i]}-${STANCES[j]}`, STANCES[i], STANCES[j], n * 4));
  // 3. identical coaches: at least 400 fights per coach type at the default scale
  if (want('mirror')) {
    for (const c of ['adaptive', 'rush', 'keepaway', 'bait', 'wall', 'random']) {
      for (let k = 0; k < n * 34; k++) {
        const mirror = k % 2 === 0;
        const fa = FIGHTERS[k % 4], fb = mirror ? fa : FIGHTERS[(k + 1 + (k >> 2)) % 4];
        all.push({ id: nextId++, seed: seedFor('mi-' + c, k), fighters: [fa, fb], coaches: [c, c], tag: 'mi-' + c, mirror });
        if (!mirror) all.push({ id: nextId++, seed: seedFor('mi-' + c, k), fighters: [fb, fa], coaches: [c, c], tag: 'mi-' + c, mirror });
      }
    }
  }
  // 4. fighters with adaptive on both sides
  if (want('fighters')) {
    for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) {
      if (i === j) continue;
      for (let k = 0; k < n * 4; k++) all.push({ id: nextId++, seed: seedFor(`fi-${i}-${j}`, k), fighters: [FIGHTERS[i], FIGHTERS[j]], coaches: ['adaptive', 'adaptive'], tag: 'fi' });
    }
  }
  // 5. pace: 400 matches of mixed coaches
  if (want('pace') || want('moves')) {
    const cs = ['adaptive', 'rush', 'keepaway', 'bait', 'wall', 'random'];
    for (let k = 0; k < n * 50; k++) all.push({ id: nextId++, seed: seedFor('pace', k), fighters: [FIGHTERS[k % 4], FIGHTERS[(k >> 2) % 4]], coaches: [cs[k % 6], cs[(k * 7 + 3) % 6]], tag: 'pace' });
  }
  // 6. readability: each stance with random dials, held for the whole fight, against random dials of any stance
  if (want('views')) {
    const R = lcg(77);
    const pick = (a) => a[Math.floor(R() * a.length)];
    const randPlan = (st) => ({ stance: st, aggression: pick([0.2, 0.35, 0.5, 0.65, 0.8]), range: pick(['close', 'mid', 'far']), grabMix: pick([0.1, 0.25, 0.4, 0.6, 0.8]), edge: pick(['deep', 'ledge', 'stage']), recover: pick(['high', 'low', 'mix']) });
    for (let k = 0; k < n * 24; k++) {
      const a = randPlan(STANCES[k % 4]), b = randPlan(pick(STANCES));
      all.push({ id: nextId++, seed: seedFor('vw', k), fighters: [pick(FIGHTERS), pick(FIGHTERS)], coaches: [a, b], tag: 'vw' });
    }
  }
  // 7. dials, measured
  if (want('dials')) {
    const nn = n * 6;
    for (const st of STANCES) {
      for (const edge of ['deep', 'ledge', 'stage']) for (const rec of ['high', 'low', 'mix']) {
        all.push(...pairJobs(`dl-edge-${st}-${edge}-${rec}`, { ...FIXED[st], edge }, { ...FIXED[STANCES[(STANCES.indexOf(st) + 1) % 4]], recover: rec }, Math.ceil(nn / 4)));
      }
      for (const ag of [0.2, 0.8]) all.push(...pairJobs(`dl-ag-${st}-${ag}`, { ...FIXED[st], aggression: ag }, FIXED[STANCES[(STANCES.indexOf(st) + 2) % 4]], Math.ceil(nn / 2), { handicap: [110, 0] }));
      for (const order of ['none', 'kill']) {
        all.push(...pairJobs(`dl-kh-${st}-${order}`, { ...FIXED[st], order }, FIXED[STANCES[(STANCES.indexOf(st) + 1) % 4]], Math.ceil(nn / 2), { handicap: [0, 110] }));
        all.push(...pairJobs(`dl-ke-${st}-${order}`, { ...FIXED[st], order }, FIXED[STANCES[(STANCES.indexOf(st) + 1) % 4]], Math.ceil(nn / 2)));
      }
    }
  }

  const res = all.length ? await runJobs(all) : [];
  const by = (tag) => res.filter((r) => r.tag === tag || (tag.endsWith('*') && r.tag.startsWith(tag.slice(0, -1))));
  console.log(`Ringout batch: ${res.length} fights, ${((Date.now() - t0) / 1000).toFixed(1)} s on 2 workers\n`);

  if (want('adaptive')) {
    console.log('ADAPTIVE vs each fixed stance (both sides, all fighters)  bar: >= 60%');
    const mix = {}; let changes = 0, plans = 0;
    for (const st of STANCES) {
      const rs = by('ad-' + st);
      const w = rs.filter((r) => r.winner === r.aSide).length;
      console.log(`  adaptive vs ${st.padEnd(9)} ${pct(w / rs.length)}  (${w}/${rs.length})  ${w / rs.length >= 0.6 ? 'met' : 'NOT MET'}`);
      const m = {};
      for (const r of rs) {
        const seq = r.stanceSeq[r.aSide];
        for (let i = 0; i < seq.length; i++) { m[seq[i]] = (m[seq[i]] || 0) + 1; mix[seq[i]] = (mix[seq[i]] || 0) + 1; plans++; if (i > 0 && seq[i] !== seq[i - 1]) changes++; }
      }
      const tot = Object.values(m).reduce((a, b) => a + b, 0);
      console.log(`      its stances vs ${st}: ` + STANCES.map((k) => `${k} ${pct((m[k] || 0) / tot)}`).join('  '));
    }
    const tot = Object.values(mix).reduce((a, b) => a + b, 0);
    const top = Math.max(...Object.values(mix)) / tot;
    console.log(`  adaptive stance mix over all its plans: ` + STANCES.map((k) => `${k} ${pct((mix[k] || 0) / tot)}`).join('  ') + `   ${top <= 0.5 ? 'met' : 'NOT MET'} (none over half)`);
    const fightsN = STANCES.reduce((a, st) => a + by('ad-' + st).length, 0);
    console.log(`  adaptive changes stance ${(changes / fightsN).toFixed(1)} times per fight (${pct(changes / Math.max(1, plans - fightsN))} of its plan updates)`);
    console.log();
  }
  if (want('stances')) {
    console.log('FIXED STANCES: row win rate against column  bar: no row beats all three others');
    const tab = {};
    for (let i = 0; i < 4; i++) for (let j = i + 1; j < 4; j++) {
      const rs = by(`st-${STANCES[i]}-${STANCES[j]}`);
      const w = rs.filter((r) => r.winner === r.aSide).length / rs.length;
      tab[STANCES[i] + STANCES[j]] = w; tab[STANCES[j] + STANCES[i]] = 1 - w;
    }
    console.log('            ' + STANCES.map((s) => s.padStart(9)).join(''));
    let dominant = '';
    for (const a of STANCES) {
      let beats = 0;
      const row = STANCES.map((b) => { if (a === b) return '      -  '; const v = tab[a + b]; if (v > 0.5) beats++; return ('   ' + pct(v)).padStart(9); }).join('');
      console.log(`  ${a.padEnd(9)} ${row}   beats ${beats}`);
      if (beats === 3) dominant = a;
    }
    console.log(dominant ? `  NOT MET: ${dominant} beats all three` : '  met: no stance beats all three others');
    console.log();
  }
  if (want('mirror')) {
    console.log('IDENTICAL COACHES: side 0 win rate  bar: 45% to 55% for each coach type');
    let tw = 0, tn = 0, bad = '';
    for (const c of ['adaptive', 'rush', 'keepaway', 'bait', 'wall', 'random']) {
      const rs = by('mi-' + c);
      const w = rs.filter((r) => r.winner === 0).length;
      tw += w; tn += rs.length;
      const mir = rs.filter((r) => r.mirror), mw = mir.filter((r) => r.winner === 0).length;
      const ok = w / rs.length >= 0.45 && w / rs.length <= 0.55;
      if (!ok) bad += c + ' ';
      console.log(`  ${c.padEnd(9)} side 0 wins ${pct(w / rs.length)} (${w}/${rs.length}), mirror fighters ${pct(mw / mir.length)} (${mir.length})  ${ok ? 'met' : 'NOT MET'}`);
    }
    console.log(`  all       side 0 wins ${pct(tw / tn)} (${tw}/${tn})  ${bad ? 'NOT MET: ' + bad : 'met'}`);
    console.log();
  }
  if (want('fighters')) {
    console.log('FIGHTERS with adaptive on both sides: row win rate against column  bar: 45 to 57 vs the field, no matchup outside 35 to 65');
    const rs = by('fi');
    const wins = {}, games = {};
    for (const r of rs) {
      const [a, b] = r.fighters;
      wins[a] = (wins[a] || 0) + (r.winner === 0 ? 1 : 0); games[a] = (games[a] || 0) + 1;
      wins[b] = (wins[b] || 0) + (r.winner === 1 ? 1 : 0); games[b] = (games[b] || 0) + 1;
      wins['m' + a + b] = (wins['m' + a + b] || 0) + (r.winner === 0 ? 1 : 0); games['m' + a + b] = (games['m' + a + b] || 0) + 1;
      wins['m' + b + a] = (wins['m' + b + a] || 0) + (r.winner === 1 ? 1 : 0); games['m' + b + a] = (games['m' + b + a] || 0) + 1;
    }
    console.log('            ' + FIGHTERS.map((s) => s.padStart(8)).join('') + '   field');
    let bad = '';
    for (const a of FIGHTERS) {
      const row = FIGHTERS.map((b) => {
        if (a === b) return '     -  ';
        const v = wins['m' + a + b] / games['m' + a + b];
        if (v < 0.35 || v > 0.65) bad += `${a}-${b} `;
        return ('  ' + pct(v)).padStart(8);
      }).join('');
      const f = wins[a] / games[a];
      if (f < 0.45 || f > 0.57) bad += a + ' ';
      console.log(`  ${a.padEnd(9)} ${row}   ${pct(f)}  (${games[a]})`);
    }
    console.log(bad ? `  NOT MET: ${bad}` : '  met');
    console.log();
  }
  if (want('views')) {
    console.log('READING THE FIGHT: what oppLooksLike says (columns) when the opponent plays the row stance, views after two looks  bar: >= 70% on the diagonal');
    const rs = [...by('vw'), ...by('st-*'), ...by('ad-*')];
    const cm = {};
    for (const r of rs) for (const [t, g] of r.views) { cm[t] = cm[t] || {}; cm[t][g] = (cm[t][g] || 0) + 1; }
    const cols = [...STANCES, 'unclear'];
    console.log('              ' + cols.map((c) => c.padStart(9)).join('') + '     views');
    let bad = '';
    for (const t of STANCES) {
      const row = cm[t] || {};
      const tot = Object.values(row).reduce((a, b) => a + b, 0);
      if ((row[t] || 0) / tot < 0.7) bad += t + ' ';
      console.log(`  ${t.padEnd(10)}  ` + cols.map((c) => ('  ' + pct((row[c] || 0) / tot)).padStart(9)).join('') + `   ${tot}`);
    }
    console.log(bad ? `  NOT MET: ${bad}` : '  met');
    console.log();
  }
  if (want('dials')) dialReport(by);
  if (want('pace') || want('moves')) {
    const rs = by('pace');
    if (want('pace')) {
      const fin = rs.filter((r) => r.ticks > 0).length;
      const len = rs.map((r) => r.ticks), fko = rs.map((r) => r.firstKo).filter((x) => x > 0), gap = rs.map((r) => r.maxGap);
      console.log(`PACE over ${rs.length} matches (mixed coaches), 2 lives each`);
      console.log(`  finished: ${fin}/${rs.length}`);
      console.log(`  fight length   p10 ${secs(q(len, 0.1))}  p25 ${secs(q(len, 0.25))}  median ${secs(q(len, 0.5))}  p75 ${secs(q(len, 0.75))}  p90 ${secs(q(len, 0.9))}   (bar: median 100 to 140, p10 > 60, p90 < 180)`);
      console.log(`  first KO       p10 ${secs(q(fko, 0.1))}  p25 ${secs(q(fko, 0.25))}  median ${secs(q(fko, 0.5))}  p75 ${secs(q(fko, 0.75))}  p90 ${secs(q(fko, 0.9))}   (bar: median 40 to 70)`);
      console.log(`  longest stretch without an exchange: median ${(q(gap, 0.5) / 60).toFixed(1)} s, p90 ${(q(gap, 0.9) / 60).toFixed(1)} s, worst ${(Math.max(...gap) / 60).toFixed(1)} s; fights with a stretch over 6 s: ${gap.filter((g) => g > 360).length}/${rs.length}  (bar: 0)`);
      const kos = rs.reduce((a, r) => a + r.kos, 0), sd = rs.reduce((a, r) => a + r.sd, 0);
      console.log(`  knockouts ${kos}, of them with no hit in the 4 s before (self-destructs) ${sd} = ${pct(sd / kos)}  (bar: under 2%); sudden death in ${rs.filter((r) => r.sudden).length}`);
      const kd = []; for (const r of rs) for (const k of r.koInfo) if (!k.sd) kd.push(k.damage);
      console.log(`  damage at knockout: p10 ${q(kd, 0.1).toFixed(0)}%  median ${q(kd, 0.5).toFixed(0)}%  p90 ${q(kd, 0.9).toFixed(0)}%;  knockouts under 60%: ${pct(kd.filter((d) => d < 60).length / kd.length)}`);
      const ms = res.map((r) => r.ms);
      console.log(`  sim time per fight: median ${q(ms, 0.5).toFixed(0)} ms, worst ${Math.max(...ms).toFixed(0)} ms  (bar: under 100)`);
      console.log();
    }
    if (want('moves')) moveReport(rs);
  }
  if (want('det')) await withLock(() => determinism());
}

function dialReport(by) {
  console.log('DIALS, measured (fixed coaches with one dial changed; both sides, all fighters)');
  // edge vs recover: recovery situations where the recoverer had that habit and the guard that edge mode
  const cell = {};
  for (const r of by('dl-edge-*')) {
    for (const t of r.trips) {
      const k = t.edge + '/' + t.rec;
      const c = cell[k] || (cell[k] = { n: 0, ko: 0, hit: 0, chaserOut: 0, chaserHurt: 0 });
      c.n++; if (!t.ok) c.ko++; if (t.hit) c.hit++; if (t.chaserOut) c.chaserOut++; if (t.chaserHurt) c.chaserHurt++;
    }
  }
  console.log('  recovery situations (knocked past 10 m out or 2 m below the deck): guard edge mode (rows) vs recoverer habit (columns): share that end in a lost life | share hit on the way back');
  console.log('              ' + ['high', 'low', 'mix'].map((c) => c.padStart(18)).join(''));
  for (const e of ['deep', 'ledge', 'stage']) {
    console.log(`  ${e.padEnd(10)}  ` + ['high', 'low', 'mix'].map((rc) => {
      const c = cell[e + '/' + rc] || { n: 0 };
      return `${pct(c.ko / c.n)} | ${pct(c.hit / c.n)} (${c.n})`.padStart(18);
    }).join(''));
  }
  const dd = cell['deep/high'] || { n: 1 };
  console.log(`  deep vs high: the chaser went out in ${pct(dd.chaserOut / dd.n)} of them and was hit or lost a life out there in ${pct(dd.chaserHurt / Math.max(1, dd.chaserOut))} of those`);
  const dl = cell['deep/low'] || { n: 1 }, sl = cell['stage/low'] || { n: 1 }, ll = cell['ledge/low'] || { n: 1 };
  console.log(`  deep vs low intercepts (hit or killed) ${pct(dl.hit / dl.n)} and kills ${pct(dl.ko / dl.n)}; ledge vs low kills ${pct(ll.ko / ll.n)}, stage vs low ${pct(sl.ko / sl.n)}`);
  // win rates for the edge dial against each recovery habit
  const wr = (tag) => { const rs = by(tag); return rs.filter((r) => r.winner === r.aSide).length / rs.length; };
  const line = [];
  for (const e of ['deep', 'ledge', 'stage']) for (const rc of ['high', 'low', 'mix']) {
    let w = 0, nn = 0;
    for (const st of STANCES) { const rs = by(`dl-edge-${st}-${e}-${rc}`); w += rs.filter((r) => r.winner === r.aSide).length; nn += rs.length; }
    line.push(`${e}/${rc} ${pct(w / nn)}`);
  }
  console.log('  guard win rate by edge/recover: ' + line.join('  '));
  void wr;
  // aggression at high own damage
  const lifeOf = (tag) => { const v = []; for (const r of by(tag)) { const t = r.firstLoss[r.aSide]; v.push(t < 0 ? r.ticks : t); } return v; };
  const agl = [];
  for (const ag of [0.2, 0.8]) { let v = []; for (const st of STANCES) v = v.concat(lifeOf(`dl-ag-${st}-${ag}`)); agl.push(v); }
  console.log(`  starting at 110%: aggression 0.2 keeps the first life ${(mean(agl[0]) / 60).toFixed(1)} s (median ${(q(agl[0], 0.5) / 60).toFixed(1)}), aggression 0.8 ${(mean(agl[1]) / 60).toFixed(1)} s (median ${(q(agl[1], 0.5) / 60).toFixed(1)})  ${mean(agl[1]) < mean(agl[0]) * 0.85 ? 'met' : 'NOT MET'}`);
  for (const st of STANCES) {
    const a = lifeOf(`dl-ag-${st}-0.2`), b = lifeOf(`dl-ag-${st}-0.8`);
    process.stdout.write(`      ${st}: ${(mean(a) / 60).toFixed(1)} -> ${(mean(b) / 60).toFixed(1)} s`);
  }
  console.log();
  // kill order
  const oppLife = (tag) => { const v = []; for (const r of by(tag)) { const t = r.firstLoss[1 - r.aSide]; v.push(t < 0 ? r.ticks : t); } return v; };
  const early = (tag) => { const v = []; for (const r of by(tag)) v.push(r.dmgEarly[r.aSide] - r.dmgEarly[1 - r.aSide]); return v; };
  let kn = [], kk = [], en = [], ek = [];
  for (const st of STANCES) {
    kn = kn.concat(oppLife(`dl-kh-${st}-none`)); kk = kk.concat(oppLife(`dl-kh-${st}-kill`));
    en = en.concat(early(`dl-ke-${st}-none`)); ek = ek.concat(early(`dl-ke-${st}-kill`));
  }
  console.log(`  opponent at 110%: it keeps its life ${(mean(kn) / 60).toFixed(1)} s without the kill order, ${(mean(kk) / 60).toFixed(1)} s with it  ${mean(kk) < mean(kn) * 0.85 ? 'met' : 'NOT MET'}`);
  console.log(`  both at 0%: damage taken minus dealt in the first 20 s: ${mean(en).toFixed(1)} without the kill order, ${mean(ek).toFixed(1)} with it  ${mean(ek) > mean(en) + 3 ? 'met' : 'NOT MET'}`);
  console.log();
}

function moveReport(rs) {
  console.log('MOVE USAGE per fighter, share of its attacks (moves started and throws), over the mixed matches  bar: each 1% to 30%, signature special several times a fight');
  const MOVES = ['jab', 'tilt', 'uptilt', 'dash', 'smash', 'upsmash', 'nair', 'fair', 'bair', 'uair', 'dair', 'grab', 'throwf', 'throwb', 'throwu', 'special', 'special2', 'recover'];
  let bad = '';
  console.log('          ' + MOVES.map((m) => m.slice(0, 6).padStart(7)).join(''));
  for (const fid of FIGHTERS) {
    const c = {}; let fights = 0;
    for (const r of rs) for (let i = 0; i < 2; i++) {
      if (r.fighters[i] !== fid) continue;
      fights++;
      for (const [m, k] of Object.entries(r.moves[i])) c[m] = (c[m] || 0) + k;
    }
    const tot = Object.values(c).reduce((a, b) => a + b, 0);
    console.log(`  ${fid.padEnd(7)} ` + MOVES.map((m) => {
      const v = (c[m] || 0) / tot;
      if (v < 0.01 || v > 0.3) bad += `${fid}.${m} `;
      return (v * 100).toFixed(1).padStart(7);
    }).join('') + `   ${(tot / fights).toFixed(0)} per fight, special ${((c.special || 0) / fights).toFixed(1)} and special2 ${((c.special2 || 0) / fights).toFixed(1)} per fight`);
  }
  console.log(bad ? `  NOT MET: ${bad}` : '  met');
  console.log();
}

async function determinism() {
  const sim = await import(SIM);
  console.log('DETERMINISM');
  const h = sim.makeHeader(seedFor('det', 1), ['gantry', 'vise']);
  const hashes = [];
  const r1 = sim.runFight(h, { coaches: ['adaptive', 'random'], onTick(s) { hashes.push(sim.hashFight(s)); } });
  const s = sim.createFight(h);
  for (const p of r1.plans) sim.schedulePlan(s, p);
  let same = 0, firstBad = -1, i = 0;
  let mid = null;
  while (s.phase !== 'over' && i < hashes.length) {
    sim.stepFight(s, h);
    if (sim.hashFight(s) === hashes[i]) same++; else if (firstBad < 0) firstBad = s.tick;
    if (s.tick === Math.floor(hashes.length / 2)) mid = JSON.stringify(s);
    i++;
  }
  console.log(`  same header and plans: ${same}/${hashes.length} ticks give the same hash${firstBad >= 0 ? ', first difference at tick ' + firstBad : ''}  ${same === hashes.length && s.phase === 'over' ? 'met' : 'NOT MET'}`);
  const s2 = JSON.parse(mid);
  let ok = true;
  while (s2.phase !== 'over') {
    sim.stepFight(s2, h);
    if (sim.hashFight(s2) !== hashes[s2.tick - 1]) { ok = false; console.log(`  JSON round trip diverges at tick ${s2.tick}`); break; }
  }
  console.log(`  JSON round trip of the state at tick ${Math.floor(hashes.length / 2)} continues identically: ${ok ? 'met' : 'NOT MET'}`);
  console.log(`  final hash ${hashes[hashes.length - 1]}`);
}

// ------------------------------------------------------------------------------------------------
// --story: a readable play-by-play of one fight
// ------------------------------------------------------------------------------------------------

async function story(args) {
  const sim = await import(SIM);
  const get = (k, d) => { const i = args.indexOf(k); return i >= 0 && args[i + 1] && !args[i + 1].startsWith('--') ? args[i + 1] : d; };
  const k = +get('--story', '1') || 1;
  const fighters = get('--fighters', `${FIGHTERS[k % 4]},${FIGHTERS[(k * 3 + 1) % 4]}`).split(',');
  // a coach is an id, or a fixed plan written stance/aggression/range/grabMix/edge/recover
  const coaches = get('--coaches', 'adaptive,adaptive').split(',');
  const spec = coaches.map((c) => {
    if (c.indexOf('/') < 0) return c;
    const [stance, ag, range, gm, edge, recover] = c.split('/');
    return { stance, aggression: +ag || 0.5, range: range || 'mid', grabMix: gm !== undefined ? +gm : 0.25, edge: edge || 'ledge', recover: recover || 'mix' };
  });
  const r = runOne(sim, { id: 0, seed: seedFor('story', k), fighters, coaches: spec, story: true });
  const F = sim.FIGHTERS;
  const name = (i) => `${F[fighters[i]].name}${fighters[0] === fighters[1] ? (i ? ' (blue)' : ' (red)') : ''}`;
  const mv = (i, m) => m === 'projectile' ? 'rivet' : F[fighters[i]].moves[m] ? F[fighters[i]].moves[m].name : m;
  const ts = (t) => { const s = t / 60; return `${Math.floor(s / 60)}:${(s % 60).toFixed(1).padStart(4, '0')}`; };
  console.log(`${name(0)} (${coaches[0]}) vs ${name(1)} (${coaches[1]}), seed ${k}\n`);
  const ev = r.events;
  const dmg = [0, 0];
  let str = null; // current hit string
  const lastShieldHit = [null, null]; // [side] = tick when side's attack was shielded
  const lastWhiff = [-999, -999];
  const off = [false, false];
  const out = [];
  const flush = () => {
    if (!str) return;
    const parts = str.moves.map((m) => mv(str.by, m));
    const tag = str.tag ? ` ${str.tag},` : '';
    if (str.moves.length >= 2) out.push(`${ts(str.t)}  ${name(str.by)}${tag} ${str.moves.length}-hit string: ${parts.join(', ')} (${str.dmg.toFixed(0)}%, ${name(1 - str.by)} at ${str.total.toFixed(0)}%)`);
    else out.push(`${ts(str.t)}  ${name(str.by)}${tag} lands ${parts[0]}${str.strength === 'heavy' ? ' hard' : ''} (${str.dmg.toFixed(0)}%, ${name(1 - str.by)} at ${str.total.toFixed(0)}%)`);
    str = null;
  };
  let lastPlan = [null, null];
  for (const e of ev) {
    if (str && e.tick - str.last > 45) flush();
    switch (e.t) {
      case 'plan': {
        const p = e.plan, lp = lastPlan[e.side];
        if (!lp || lp.stance !== p.stance || lp.edge !== p.edge || lp.recover !== p.recover || Math.abs(lp.aggression - p.aggression) > 0.2 || lp.grabMix !== p.grabMix || p.order !== 'none') {
          flush();
          out.push(`${ts(e.tick)}  -- ${name(e.side)} corner: ${p.stance}, aggression ${p.aggression}, ${p.range}, grabs ${p.grabMix}, edge ${p.edge}, recover ${p.recover}${p.order !== 'none' ? ', ORDER ' + p.order : ''}  "${p.read}"`);
        }
        lastPlan[e.side] = p;
        break;
      }
      case 'whiff': lastWhiff[e.side] = e.tick; break;
      case 'shield_hit': lastShieldHit[e.by] = e.tick; break;
      case 'shield_break': flush(); out.push(`${ts(e.tick)}  ${name(e.side)}'s shield BREAKS`); break;
      case 'grab': {
        if (str && str.by !== e.by) flush();
        let tag = '';
        if (lastShieldHit[e.to] !== null && e.tick - lastShieldHit[e.to] < 40) tag = 'out of shield';
        out.push(`${ts(e.tick)}  ${name(e.by)} grabs ${name(e.to)}${tag ? ' ' + tag : ''}`);
        break;
      }
      case 'hit': {
        dmg[e.to] = e.total;
        if (str && (str.by !== e.by || e.combo <= 1)) flush();
        if (!str) {
          let tag = '';
          if (lastShieldHit[e.to] !== null && e.tick - lastShieldHit[e.to] < 40) tag = 'shield punish:';
          else if (e.tick - lastWhiff[e.to] < 35) tag = 'whiff punish:';
          else if (off[e.to]) tag = 'edge-guard:';
          str = { by: e.by, t: e.tick, moves: [], dmg: 0, total: 0, last: e.tick, tag: tag.replace(':', ''), strength: e.strength };
        }
        str.moves.push(e.move); str.dmg += e.damage; str.total = e.total; str.last = e.tick;
        if (e.strength === 'heavy' || e.strength === 'lethal') str.strength = 'heavy';
        if (e.strength === 'lethal') { flush(); }
        break;
      }
      case 'ko': {
        flush();
        out.push(`${ts(e.tick)}  ** ${name(e.side)} is KNOCKED OUT at ${e.damage.toFixed(0)}% off the ${e.edge}${e.move ? ' by ' + mv(1 - e.side, e.move) : ' (no hit: self-destruct)'}, ${e.livesLeft} ${e.livesLeft === 1 ? 'life' : 'lives'} left`);
        off[e.side] = false;
        break;
      }
      case '_off': flush(); off[e.side] = true; out.push(`${ts(e.tick)}  ${name(e.side)} is knocked off the stage (${e.rec === 'high' ? 'will come back high' : e.rec === 'low' ? 'will come back low' : 'mixes its recovery'}, ${name(1 - e.side)} guards ${e.edge === 'deep' ? 'by going out after it' : e.edge === 'ledge' ? 'by holding the ledge' : 'from the stage'})`); break;
      case '_chase': out.push(`${ts(e.tick)}  ${name(e.side)} jumps out after it`); break;
      case '_back': flush(); off[e.side] = false; out.push(`${ts(e.tick)}  ${name(e.side)} recovers ${e.how === 'ledge' ? 'to the ledge' : 'onto the ' + e.how}`); break;
      case 'order': flush(); out.push(`${ts(e.tick)}  ${name(e.side)} carries out the order: ${e.order}`); break;
      case 'sudden_death': flush(); out.push(`${ts(e.tick)}  SUDDEN DEATH`); break;
      case 'end': flush(); out.push(`${ts(e.tick)}  ${name(e.winner)} WINS`); break;
    }
    // offstage tracking from the event stream: a launch near the edge
  }
  flush();
  console.log(out.join('\n'));
  console.log(`\n${(r.ticks / 60).toFixed(1)} s, lives ${r.lives.join('-')}. Moves used:`);
  for (let i = 0; i < 2; i++) console.log(`  ${name(i)}: ` + Object.entries(r.moves[i]).sort((a, b) => b[1] - a[1]).map(([m, c]) => `${m} ${c}`).join(', '));
}

if (isMainThread) await main();

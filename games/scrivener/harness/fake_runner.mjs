// A local stand-in for the Arena runner: a fake `Show` (announce, openWindow, lock, emit,
// settle with timers) and a hub that fans out feed messages in the runner's exact shapes
// (runner/src/hub.ts, show.ts). The stage cannot tell it from the real thing.
//
//   const fake = createFakeRunner(channelDef, { instant, recordDir, houseBets });
//   fake.subscribe((msg) => ...); fake.snapshot(); fake.start(); fake.stop();

import { createHash, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const hex = (b) => Buffer.from(b).toString('hex');
const sha256 = (...parts) => { const h = createHash('sha256'); for (const p of parts) h.update(p); return h.digest(); };
const MAX_EVENTS = 500;

// virtual: time is a number that jumps to the next timer, so a full, correctly timed match
// (and its recorded feed) is produced in milliseconds. Mock brains only.
export function createVirtualClock(start = Date.now()) {
  let vnow = start;
  const timers = [];
  let pumping = false;
  const pump = () => {
    if (pumping) return;
    pumping = true;
    setImmediate(function turn() {
      if (!timers.length) { pumping = false; return; }
      timers.sort((a, b) => a.at - b.at);
      const next = timers.shift();
      vnow = Math.max(vnow, next.at);
      next.resolve();
      setImmediate(turn);
    });
  };
  return {
    real: false,
    now: () => vnow,
    sleep: (ms) => new Promise((resolve) => { timers.push({ at: vnow + Math.max(0, ms || 0), resolve }); pump(); }),
  };
}

export function createFakeRunner(def, { instant = false, virtual = null, recordDir = null, houseBets = true, once = false, log = () => {} } = {}) {
  const rt = { phase: 'intermission', match: null, windows: [], recentEvents: [] };
  const listeners = new Set();
  const ac = new AbortController();
  let recordFile = null;
  let running = false;
  let lastResult = null;
  const NOW = virtual ? virtual.now : () => Date.now();

  const sleep = virtual ? virtual.sleep : (ms) => new Promise((resolve, reject) => {
    if (ac.signal.aborted) return reject(new Error('aborted'));
    if (!(ms > 0)) return resolve();
    const t = setTimeout(() => { ac.signal.removeEventListener('abort', onAbort); resolve(); }, ms);
    const onAbort = () => { clearTimeout(t); reject(new Error('aborted')); };
    ac.signal.addEventListener('abort', onAbort, { once: true });
  });

  function broadcast(type, body = {}) {
    const msg = { type, t: NOW(), ...body };
    if (recordFile) { try { fs.appendFileSync(recordFile, JSON.stringify(msg) + '\n'); } catch { /* disk full: keep playing */ } }
    for (const l of listeners) { try { l(msg); } catch { /* a bad listener never stops the show */ } }
  }
  function setPhase(phase) {
    if (rt.phase === phase) return;
    rt.phase = phase;
    broadcast('phase', { phase });
  }
  const publicWindow = (w) => {
    const v = { windowId: w.windowId, matchId: w.matchId, market: w.market, question: w.question, outcomes: w.outcomes, closesAt: w.closesAt, seeded: w.seeded, state: w.state, pools: w.pools, total: w.total };
    if (w.simHash) v.simHash = w.simHash;
    if (w.seed) v.seed = w.seed;
    if (w.entropy) v.entropy = w.entropy;
    if (w.winnerOutcomeId) v.winnerOutcomeId = w.winnerOutcomeId;
    if (w.state === 'settled' && w.secret) v.secret = w.secret;
    if (w.payouts) v.payouts = w.payouts;
    return v;
  };
  function snapshot() {
    return {
      type: 'snapshot', t: NOW(), channel: def.id, title: def.title, phase: rt.phase, match: rt.match,
      windows: rt.windows.map(publicWindow), recentEvents: rt.recentEvents.slice(), serverNow: NOW(), recentChat: [], bots: [],
    };
  }

  function makeShow() {
    let startedAt = 0, announced = false, ended = false, windowCount = 0;
    const timers = [];
    const show = {
      signal: ac.signal,
      elapsed: () => (startedAt ? NOW() - startedAt : 0),
      clock: virtual || null,
      announce(match) {
        if (announced) throw new Error('announce() may only be called once per match');
        announced = true;
        startedAt = NOW();
        rt.match = { matchId: String(match.matchId), title: String(match.title ?? ''), entrants: match.entrants, meta: match.meta, startedAt };
        rt.windows = [];
        rt.recentEvents = [];
        if (recordDir) {
          fs.mkdirSync(recordDir, { recursive: true });
          recordFile = path.join(recordDir, `${rt.match.matchId}.jsonl`);
        }
        setPhase('lobby');
        broadcast('match', { ...rt.match });
        log(`match ${rt.match.matchId}: ${rt.match.title}`);
      },
      async openWindow(w) {
        if (!announced) throw new Error('announce() before openWindow()');
        if (!Array.isArray(w.outcomes) || w.outcomes.length < 2 || w.outcomes.length > 16) throw new Error('a window needs 2..16 outcomes');
        const secret = w.seeded || w.sealed ? randomBytes(32) : null;
        const rec = {
          windowId: `${rt.match.matchId}:w${++windowCount}`, matchId: rt.match.matchId, market: 'fake' + hex(randomBytes(8)),
          question: String(w.question), outcomes: w.outcomes.map((o) => ({ ...o })), closesAt: NOW() + w.durationMs,
          seeded: !!w.seeded, state: 'open', pools: new Array(w.outcomes.length).fill(0), total: 0,
          simHash: w.simHash, secretBytes: secret,
        };
        rt.windows.push(rec);
        broadcast('window_open', { windowId: rec.windowId, market: rec.market, question: rec.question, outcomes: rec.outcomes, closesAt: rec.closesAt, seeded: rec.seeded, simHash: rec.simHash, commitment: secret ? hex(sha256(secret)) : undefined });
        if (houseBets && !instant && !virtual) {
          // a few pretend bettors so `pools` messages flow like on the platform
          const n = 3 + Math.floor(Math.random() * 5);
          for (let i = 0; i < n; i++) {
            timers.push(setTimeout(() => {
              if (rec.state !== 'open') return;
              const k = Math.floor(Math.random() * rec.pools.length);
              rec.pools[k] += (5 + Math.floor(Math.random() * 40)) * 1_000_000;
              rec.total = rec.pools.reduce((a, b) => a + b, 0);
              broadcast('pools', { windowId: rec.windowId, pools: rec.pools.slice(), total: rec.total });
            }, Math.random() * Math.max(200, w.durationMs - 400)));
          }
        }
        const win = { windowId: rec.windowId, market: rec.market, outcomes: rec.outcomes, seeded: rec.seeded, closesAt: rec.closesAt };
        if (w.sealed && secret) win.sealed = hex(sha256('arena-sealed', secret));
        return win;
      },
      async lock(win) {
        const w = rt.windows.find((x) => x.windowId === win.windowId);
        if (!w) throw new Error('unknown window');
        if (w.state === 'locked') return { seed: w.seed };
        if (w.state !== 'open') throw new Error(`cannot lock a ${w.state} window`);
        if (!instant) await sleep(w.closesAt - NOW() + 25);
        const entropy = randomBytes(32);
        w.state = 'locked';
        w.entropy = hex(entropy);
        if (w.seeded && w.secretBytes) w.seed = hex(sha256(w.secretBytes, entropy, w.market));
        broadcast('window_locked', { windowId: w.windowId, seed: w.seed, entropy: w.entropy, simHash: w.simHash, pools: w.pools, total: w.total });
        return w.seed ? { seed: w.seed } : {};
      },
      emit(event) {
        if (!announced) throw new Error('announce() before emit()');
        const ev = { type: event.type, at: typeof event.at === 'number' ? event.at : show.elapsed() };
        if (event.data !== undefined) ev.data = event.data;
        if (rt.phase === 'lobby') setPhase('live');
        rt.recentEvents.push(ev);
        if (rt.recentEvents.length > MAX_EVENTS) rt.recentEvents.splice(0, rt.recentEvents.length - MAX_EVENTS);
        broadcast('event', { event: ev });
      },
      async settle(win, winnerOutcomeId) {
        const w = rt.windows.find((x) => x.windowId === win.windowId);
        if (!w) throw new Error('unknown window');
        if (w.state !== 'locked') throw new Error(`cannot settle a ${w.state} window (lock it first)`);
        if (!w.outcomes.some((o) => o.id === winnerOutcomeId)) throw new Error(`unknown outcome id ${winnerOutcomeId}`);
        if (!instant) await sleep(virtual ? 200 : 120 + Math.random() * 250); // a chain round trip
        w.state = 'settled';
        w.winnerOutcomeId = winnerOutcomeId;
        if (w.secretBytes) w.secret = hex(w.secretBytes);
        w.payouts = [];
        broadcast('window_settled', { windowId: w.windowId, winnerOutcomeId, secret: w.secret, payouts: [] });
      },
      async voidWindow(win) {
        const w = rt.windows.find((x) => x.windowId === win.windowId);
        if (!w || w.state === 'void') return;
        w.state = 'void';
        broadcast('window_void', { windowId: w.windowId, refunds: [] });
      },
      sleep,
      end(result) {
        if (ended) return;
        ended = true;
        lastResult = result;
        if (rt.match) rt.match.result = result;
        setPhase('result');
        broadcast('match_end', { result });
      },
      _cleanup() { for (const t of timers) clearTimeout(t); },
    };
    return show;
  }

  async function loop() {
    running = true;
    while (!ac.signal.aborted) {
      const show = makeShow();
      try {
        await def.run(show);
      } catch (e) {
        if (!ac.signal.aborted) { log(`run() threw: ${e && e.stack ? e.stack : e}`); }
      }
      show._cleanup();
      for (const w of rt.windows) if (w.state === 'open' || w.state === 'locked') { w.state = 'void'; broadcast('window_void', { windowId: w.windowId, refunds: [] }); }
      recordFile = null;
      if (ac.signal.aborted || once) break;
      setPhase('intermission');
      try { await sleep(def.intermissionMs ?? 5000); } catch { break; }
    }
    running = false;
  }

  return {
    subscribe(fn) { listeners.add(fn); return () => listeners.delete(fn); },
    snapshot,
    start() { if (!running) return loop(); return null; },
    stop() { ac.abort(); },
    get running() { return running; },
    get lastResult() { return lastResult; },
  };
}

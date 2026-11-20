// A local stand-in for the platform's runner: implements the `Show` interface over a clock and
// turns every call into the feed message the real runner would broadcast (same names, same
// fields), so the stage is driven here exactly as it is on the site. No chain, no bets.
import { Rng } from '../sim/rng.js';

const hex64 = (rng) => { let s = ''; for (let i = 0; i < 8; i++) s += rng.nextU32().toString(16).padStart(8, '0'); return s; };

/**
 * createFakeShow({ clock, onFeed, seed, channel })
 *   clock    realClock() or virtualClock() from clock.js
 *   onFeed   called with every feed message, in order
 *   seed     number: fixes every window's seed, so a show can be replayed exactly
 * Returns { show, snapshot(), done } . `show` is one match; make a new fake show per match.
 */
export function createFakeShow({ clock, onFeed, seed = 1, channel = 'tumbletop', title = 'Goober Guys', lockDelayMs = 150 }) {
  const rng = new Rng((seed >>> 0) ^ 0x7a11);
  const ctl = new AbortController();
  let startedAt = 0, phase = 'intermission', match = null, windowCount = 0;
  const windows = [];
  const recentEvents = [];
  const send = (type, body = {}) => onFeed({ type, t: clock.now(), ...body });
  const setPhase = (p) => { if (p !== phase) { phase = p; send('phase', { phase }); } };

  const show = {
    announce(m) {
      startedAt = clock.now();
      match = { matchId: m.matchId, title: m.title, entrants: m.entrants, meta: m.meta, startedAt };
      windows.length = 0; recentEvents.length = 0;
      setPhase('lobby');
      send('match', { ...match });
    },
    async openWindow(w) {
      const windowId = `${match.matchId}:w${++windowCount}`;
      const rec = {
        windowId, matchId: match.matchId, market: `fake-${windowId}`, question: w.question, outcomes: w.outcomes.map((o) => ({ ...o })),
        closesAt: clock.now() + w.durationMs, seeded: !!w.seeded, state: 'open', pools: w.outcomes.map(() => 0), total: 0, simHash: w.simHash,
      };
      windows.push(rec);
      send('window_open', { windowId, market: rec.market, question: rec.question, outcomes: rec.outcomes, closesAt: rec.closesAt, seeded: rec.seeded, simHash: rec.simHash });
      return { windowId, market: rec.market, outcomes: rec.outcomes, seeded: rec.seeded, closesAt: rec.closesAt };
    },
    async lock(win) {
      const rec = windows.find((x) => x.windowId === win.windowId);
      await clock.sleep(rec.closesAt - clock.now() + lockDelayMs); // the real lock lands a little after the close
      rec.state = 'locked';
      rec.entropy = hex64(rng);
      if (rec.seeded) rec.seed = hex64(rng);
      send('window_locked', { windowId: rec.windowId, seed: rec.seed, entropy: rec.entropy, simHash: rec.simHash, pools: rec.pools, total: rec.total });
      return rec.seed ? { seed: rec.seed } : {};
    },
    emit(event) {
      const ev = { type: event.type, at: typeof event.at === 'number' ? event.at : show.elapsed() };
      if (event.data !== undefined) ev.data = event.data;
      setPhase('live');
      recentEvents.push(ev);
      if (recentEvents.length > 500) recentEvents.splice(0, recentEvents.length - 500);
      send('event', { event: ev });
    },
    async settle(win, winnerOutcomeId) {
      const rec = windows.find((x) => x.windowId === win.windowId);
      rec.state = 'settled'; rec.winnerOutcomeId = winnerOutcomeId; rec.secret = hex64(rng);
      send('window_settled', { windowId: rec.windowId, winnerOutcomeId, secret: rec.secret, payouts: [] });
    },
    async voidWindow(win) {
      const rec = windows.find((x) => x.windowId === win.windowId);
      rec.state = 'void';
      send('window_void', { windowId: rec.windowId, refunds: [] });
    },
    sleep: (ms) => clock.sleep(ms),
    end(result) { if (match) match.result = result; setPhase('result'); send('match_end', { result }); },
    elapsed: () => clock.now() - startedAt,
    signal: ctl.signal,
  };

  return {
    show,
    /** What a viewer who connects right now would get first. */
    snapshot() {
      return {
        type: 'snapshot', t: clock.now(), channel, title, phase, match: match ? { ...match } : null,
        windows: windows.map((w) => ({ ...w })), recentEvents: recentEvents.slice(), serverNow: clock.now(), recentChat: [], bots: [],
      };
    },
    intermission() { setPhase('intermission'); },
    abort() { ctl.abort(); },
  };
}

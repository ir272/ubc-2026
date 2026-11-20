// The stage's whole knowledge of the show, folded from feed messages. Owner: lead.
// PURE (no DOM): the same reducer runs in tools to check that a late joiner sees the right state.
//
//   const feed = createFeed();
//   const news = feed.apply(msg);     // -> [{ kind, ... }] what just happened (for sound and one-shots)
//   feed.s                            // the state scenes draw from
//
// Times: every event keeps its `at` (ms since the match began). Scenes draw as a function of
// `clock.matchMs() - at`, so a viewer who joins late sees each thing as far along as it is.

const blankShow = () => ({
  phase: null,          // 'call' | 'choosing' | 'tape' | 'fight' | 'verdict'
  phaseAt: 0, phaseMs: 0,
  matchNo: 0, order: [], strokes: 6,
  temper: null, temperAt: null,
  offers: null,
  offer: null,          // the offer on the table: { entrantId, slot, options, at }
  picks: [],            // { entrantId, slot, choice, reason, source, at }
  loadouts: {}, reasons: {},
  attempts: [],         // attempt.end data, in play order (each with `at`)
  current: null,        // { index, entrantId, n, readyAt, startAt?, seed?, loadout?, temper?, handicap?, endAt? }
  decisions: {},        // index -> [{ k, open: {...at}, made: {...at} | null }]
  notes: [],            // { entrantId, text, at }
  verdict: null,        // { winnerId, how, deciding, tally, at }
  lines: [],            // { entrantId, text, kind, at }
  next: null,           // { ms, at }
  handicap: null,
});

export function createFeed() {
  const s = {
    offset: null,       // server ms minus local ms (Date.now), best estimate
    runnerPhase: 'intermission',
    match: null,        // { matchId, title, entrants, meta, startedAt }
    bots: {},           // id -> { id, name, model, look, record, byClass, h2h }
    show: blankShow(),
    windows: new Map(), // windowId -> { ...view, openedAt (server ms), lockedAt, settledAt }
    winOrder: [],
    ended: false,
  };

  function setMatch(m) {
    s.match = m ? { matchId: m.matchId, title: m.title, entrants: m.entrants || [], meta: m.meta || {}, startedAt: m.startedAt } : null;
    s.show = blankShow();
    s.bots = {};
    s.ended = false;
    if (!m) return;
    const meta = s.match.meta;
    for (const b of meta.bots || []) s.bots[b.id] = b;
    for (const e of s.match.entrants) s.bots[e.id] ||= { id: e.id, name: e.name, model: '', look: { accent: e.color }, record: e.record || { played: 0, wins: 0 }, byClass: {}, h2h: { played: 0, wins: 0 } };
    s.show.matchNo = meta.matchNo || 0;
    s.show.order = meta.order || s.match.entrants.map((e) => e.id);
    s.show.strokes = meta.strokes || 6;
    s.show.handicap = meta.handicap || null;
  }

  function adoptState(st) {
    if (!st) return;
    const sh = s.show;
    sh.matchNo = st.matchNo ?? sh.matchNo;
    sh.order = st.order || sh.order;
    sh.strokes = st.strokes || sh.strokes;
    if (st.temper) sh.temper = st.temper;
    if (st.offers) sh.offers = st.offers;
    sh.loadouts = st.loadouts || sh.loadouts;
    sh.reasons = st.reasons || sh.reasons;
    // attempts in the state have no `at`; keep the ones already seen with their times
    if (Array.isArray(st.attempts) && st.attempts.length > sh.attempts.length) {
      sh.attempts = st.attempts.map((a) => sh.attempts.find((x) => x.index === a.index) || { ...a, at: null });
    }
    if (st.winnerId && !sh.verdict) sh.verdict = { winnerId: st.winnerId, how: st.how, deciding: null, tally: null, at: null };
    sh.handicap = st.handicap || sh.handicap;
  }

  function onEvent(ev, news, catchup) {
    const sh = s.show;
    const d = ev.data || {};
    const at = ev.at;
    switch (ev.type) {
      case 'phase':
        sh.phase = d.phase; sh.phaseAt = at; sh.phaseMs = d.ms || 0;
        adoptState(d.state);
        if (d.phase !== 'choosing') sh.offer = null;
        if (d.phase === 'fight' || d.phase === 'verdict') { /* keep attempts */ }
        break;
      case 'temper':
        sh.temper = d.temper; sh.temperAt = at;
        break;
      case 'offer':
        sh.offer = { ...d, at };
        break;
      case 'pick':
        sh.picks.push({ ...d, at });
        (sh.loadouts[d.entrantId] ||= {})[d.slot] = d.choice;
        (sh.reasons[d.entrantId] ||= {})[d.slot] = d.reason;
        break;
      case 'attempt.ready':
        sh.current = { index: d.index, entrantId: d.entrantId, n: d.n, readyAt: at };
        break;
      case 'attempt.start':
        sh.current = { ...(sh.current && sh.current.index === d.index ? sh.current : { readyAt: at }), ...d, startAt: at };
        sh.decisions[d.index] = [];
        break;
      case 'decide.open': {
        const list = (sh.decisions[d.index] ||= []);
        list.push({ k: d.k, open: { ...d, at }, made: null });
        break;
      }
      case 'decide.made': {
        const list = (sh.decisions[d.index] ||= []);
        const rec = list.find((x) => x.k === d.k);
        if (rec) rec.made = { ...d, at }; else list.push({ k: d.k, open: null, made: { ...d, at } });
        break;
      }
      case 'attempt.end': {
        const i = sh.attempts.findIndex((a) => a.index === d.index);
        if (i >= 0) sh.attempts[i] = { ...d, at }; else sh.attempts.push({ ...d, at });
        if (sh.current && sh.current.index === d.index) sh.current.endAt = at;
        break;
      }
      case 'note':
        sh.notes.push({ ...d, at });
        break;
      case 'verdict':
        sh.verdict = { ...d, at };
        break;
      case 'line':
        sh.lines.push({ ...d, at });
        break;
      case 'next':
        sh.next = { ...d, at };
        break;
      default:
        return;
    }
    news.push({ kind: 'event', type: ev.type, data: d, at, catchup });
  }

  function apply(msg) {
    const news = [];
    if (!msg || typeof msg !== 'object') return news;
    const localNow = Date.now();
    if (typeof msg.t === 'number') {
      const o = msg.t - localNow;
      // the least-delayed message gives the best estimate of the server clock
      if (s.offset == null || o > s.offset || msg.type === 'snapshot') s.offset = msg.type === 'snapshot' && typeof msg.serverNow === 'number' ? msg.serverNow - localNow : o;
    }
    switch (msg.type) {
      case 'snapshot': {
        s.runnerPhase = msg.phase;
        setMatch(msg.match);
        s.windows.clear();
        s.winOrder = [];
        for (const w of msg.windows || []) {
          // a snapshot does not say when a window locked or paid: treat both as long ago
          s.windows.set(w.windowId, { ...w, openedAt: null, lockedAt: w.state !== 'open' ? -1e13 : null, settledAt: w.state === 'settled' ? -1e13 : null });
          s.winOrder.push(w.windowId);
        }
        for (const ev of msg.recentEvents || []) onEvent(ev, news, true);
        s.ended = msg.phase === 'result' || msg.phase === 'intermission';
        news.push({ kind: 'snapshot' });
        break;
      }
      case 'match':
        setMatch(msg);
        s.windows.clear();
        s.winOrder = [];
        news.push({ kind: 'match' });
        break;
      case 'phase':
        s.runnerPhase = msg.phase;
        break;
      case 'event':
        onEvent(msg.event, news, false);
        break;
      case 'window_open':
        s.windows.set(msg.windowId, { windowId: msg.windowId, question: msg.question, outcomes: msg.outcomes, closesAt: msg.closesAt, seeded: msg.seeded, state: 'open', pools: [], total: 0, openedAt: msg.t, lockedAt: null, settledAt: null });
        s.winOrder.push(msg.windowId);
        news.push({ kind: 'window', what: 'open', windowId: msg.windowId });
        break;
      case 'pools': {
        const w = s.windows.get(msg.windowId);
        if (w) { w.pools = msg.pools; w.total = msg.total; }
        break;
      }
      case 'window_locked': {
        const w = s.windows.get(msg.windowId);
        if (w) { w.state = 'locked'; w.lockedAt = msg.t; }
        news.push({ kind: 'window', what: 'locked', windowId: msg.windowId });
        break;
      }
      case 'window_settled': {
        const w = s.windows.get(msg.windowId);
        if (w) { w.state = 'settled'; w.winnerOutcomeId = msg.winnerOutcomeId; w.settledAt = msg.t; w.paid = (msg.payouts || []).length; }
        news.push({ kind: 'window', what: 'settled', windowId: msg.windowId });
        break;
      }
      case 'window_void': {
        const w = s.windows.get(msg.windowId);
        if (w) w.state = 'void';
        break;
      }
      case 'match_end':
        s.ended = true;
        news.push({ kind: 'end' });
        break;
    }
    return news;
  }

  // The window a viewer can bet on right now (or that just closed), if any.
  function liveWindow(serverNow) {
    for (let i = s.winOrder.length - 1; i >= 0; i--) {
      const w = s.windows.get(s.winOrder[i]);
      if (!w) continue;
      if (w.state === 'open') return { ...w, msLeft: Math.max(0, w.closesAt - serverNow), msTotal: w.openedAt ? w.closesAt - w.openedAt : null };
    }
    return null;
  }
  const lastWindow = () => (s.winOrder.length ? s.windows.get(s.winOrder[s.winOrder.length - 1]) : null);

  return { s, apply, liveWindow, lastWindow };
}

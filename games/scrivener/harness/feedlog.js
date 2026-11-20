// Rebuilds what the runner's snapshot would have been at any point of a recorded feed
// (a .jsonl written by the fake runner), so the stage can be dropped into the middle of a
// match: exactly what a late viewer gets. Browser and node safe.

export function parseFeed(text) {
  return text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

// msgs[0..upTo) folded into a snapshot, with serverNow = `now`.
export function snapshotAt(msgs, upTo, now, channel = 'scrivener') {
  let phase = 'intermission', match = null;
  const windows = new Map();
  let events = [];
  for (let i = 0; i < upTo; i++) {
    const m = msgs[i];
    switch (m.type) {
      case 'phase': phase = m.phase; break;
      case 'match': match = { matchId: m.matchId, title: m.title, entrants: m.entrants, meta: m.meta, startedAt: m.startedAt }; windows.clear(); events = []; break;
      case 'window_open': windows.set(m.windowId, { windowId: m.windowId, matchId: match && match.matchId, market: m.market, question: m.question, outcomes: m.outcomes, closesAt: m.closesAt, seeded: m.seeded, state: 'open', pools: new Array(m.outcomes.length).fill(0), total: 0, simHash: m.simHash }); break;
      case 'pools': { const w = windows.get(m.windowId); if (w) { w.pools = m.pools; w.total = m.total; } break; }
      case 'window_locked': { const w = windows.get(m.windowId); if (w) { w.state = 'locked'; w.seed = m.seed; w.entropy = m.entropy; } break; }
      case 'window_settled': { const w = windows.get(m.windowId); if (w) { w.state = 'settled'; w.winnerOutcomeId = m.winnerOutcomeId; w.payouts = m.payouts; } break; }
      case 'window_void': { const w = windows.get(m.windowId); if (w) w.state = 'void'; break; }
      case 'event': events.push(m.event); if (events.length > 500) events.shift(); break;
      case 'match_end': if (match) match.result = m.result; break;
    }
  }
  return { type: 'snapshot', t: now, channel, title: 'The Scrivener', phase, match, windows: [...windows.values()], recentEvents: events, serverNow: now, recentChat: [], bots: [] };
}

// Index of the first message at or after a point: { phase: 'tape', plus: ms } or { ms } from the match start.
export function seekIndex(msgs, at) {
  const start = msgs.find((m) => m.type === 'match');
  const t0 = start ? start.t : msgs[0].t;
  let target = t0 + (at.ms || 0);
  if (at.phase) {
    const p = msgs.find((m) => m.type === 'event' && m.event.type === 'phase' && m.event.data.phase === at.phase);
    if (p) target = p.t + (at.plus || 0);
  }
  if (at.event) {
    const hits = msgs.filter((m) => m.type === 'event' && m.event.type === at.event);
    const p = hits[Math.min(hits.length - 1, at.nth || 0)];
    if (p) target = p.t + (at.plus || 0);
  }
  let i = msgs.findIndex((m) => m.t >= target);
  if (i < 0) i = msgs.length;
  return { index: i, t: target };
}

// Records and short memories that outlive a match. Node only (fs). Owner: lead.
// One JSON file: { matchNo, bots: { [id]: { played, wins, byClass, h2h, memory } } }.

import fs from 'node:fs';
import path from 'node:path';

const blank = () => ({ played: 0, wins: 0, tries: 0, kills: 0, scoreSum: 0, byClass: {}, h2h: {}, memory: [] });

export function createStore(file) {
  let data = { matchNo: 0, bots: {} };
  if (file) {
    try { data = JSON.parse(fs.readFileSync(file, 'utf8')); } catch { /* first run */ }
    data.bots ||= {};
    data.matchNo ||= 0;
  }
  const save = () => {
    if (!file) return;
    try {
      fs.mkdirSync(path.dirname(file), { recursive: true });
      fs.writeFileSync(file, JSON.stringify(data, null, 2));
    } catch { /* a read-only disk must not stop the show */ }
  };
  const of = (id) => (data.bots[id] ||= blank());

  return {
    nextMatchNo() { data.matchNo += 1; save(); return data.matchNo; },
    // What a bettor reads: overall record, record by class, head to head, and the bot's own memory.
    form(ids) {
      const out = {};
      for (const id of ids) {
        const b = of(id);
        const other = ids.find((x) => x !== id);
        out[id] = {
          record: { played: b.played, wins: b.wins },
          // against the boss itself: tries, kills, and the average share of its ink spilled
          vsBoss: { tries: b.tries || 0, kills: b.kills || 0, avg: b.tries ? Math.round(((b.scoreSum || 0) / b.tries) * 100) / 100 : 0 },
          byClass: JSON.parse(JSON.stringify(b.byClass)),
          h2h: { ...(b.h2h[other] || { played: 0, wins: 0 }) },
          memory: b.memory.slice(0, 3),
          last: b.last || null, // the build it last fought with: how the call draws it
        };
      }
      return out;
    },
    record(result, ids) {
      for (const id of ids) {
        const b = of(id);
        const other = ids.find((x) => x !== id);
        const won = result.winnerId === id;
        b.played += 1;
        if (won) b.wins += 1;
        if (result.loadouts[id] && result.loadouts[id].cls) b.last = { ...result.loadouts[id] };
        const cls = result.loadouts[id] && result.loadouts[id].cls;
        if (cls) {
          const c = (b.byClass[cls] ||= { played: 0, wins: 0 });
          c.played += 1;
          if (won) c.wins += 1;
        }
        const h = (b.h2h[other] ||= { played: 0, wins: 0 });
        h.played += 1;
        if (won) h.wins += 1;
        for (const a of result.attempts || []) {
          if (a.entrantId !== id) continue;
          b.tries = (b.tries || 0) + 1;
          if (a.result === 'kill') b.kills = (b.kills || 0) + 1;
          b.scoreSum = (b.scoreSum || 0) + a.score;
        }
        if (result.notes && result.notes[id]) b.memory = result.notes[id].slice(0, 3);
      }
      save();
    },
    data: () => data,
  };
}

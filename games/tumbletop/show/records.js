// Records across shows: played, wins, finals reached and recent form, per roster id.
// Pure functions over a plain object; the channel persists it (see channel.ts), the dev page keeps
// it in memory.
import { ROSTER } from '../sim/roster.js';

export function emptyRecords() {
  const r = {};
  for (const g of ROSTER) r[g.id] = { played: 0, wins: 0, finals: 0, form: [] };
  return r;
}

/** Fill in any Gumble missing from a loaded file. */
export function normaliseRecords(loaded) {
  const r = emptyRecords();
  if (loaded && typeof loaded === 'object') {
    for (const id of Object.keys(r)) {
      const x = loaded[id];
      if (!x) continue;
      r[id] = { played: x.played | 0, wins: x.wins | 0, finals: x.finals | 0, form: Array.isArray(x.form) ? x.form.slice(0, 5).map(String) : [] };
    }
  }
  return r;
}

/**
 * Apply one finished show. Form letters, latest first: W won, F reached the final, 2 went out in
 * round two, 1 went out in round one.
 */
export function applyShow(records, { entrants, rounds, winnerId }) {
  const r2 = new Set(rounds[0].qualified), fin = new Set(rounds[1].qualified);
  for (const id of entrants) {
    const x = records[id] || (records[id] = { played: 0, wins: 0, finals: 0, form: [] });
    x.played++;
    const letter = id === winnerId ? 'W' : fin.has(id) ? 'F' : r2.has(id) ? '2' : '1';
    if (letter === 'W') x.wins++;
    if (fin.has(id)) x.finals++;
    x.form = [letter, ...x.form].slice(0, 5);
  }
  return records;
}

/**
 * Which 16 of the 24 run next: the Gumbles that have run least go first, ties broken by `rand`,
 * so over time everyone gets the same number of shows. The order returned is the start-grid draw.
 */
export function pickEntrants(records, rand, count = 16) {
  const pool = ROSTER.map((g) => ({ id: g.id, played: records[g.id]?.played ?? 0, r: rand() }));
  pool.sort((a, b) => (a.played - b.played) || (a.r - b.r));
  const chosen = pool.slice(0, count);
  chosen.sort((a, b) => a.r - b.r);
  return chosen.map((x) => x.id);
}

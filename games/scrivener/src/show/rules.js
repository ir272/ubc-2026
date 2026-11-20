// Match rules. PURE: no DOM, no clock, no randomness. Shared by the channel, the harness,
// the batch tools and the stage.
//
// An attempt record: { index (1..6), entrantId, n (1..3), result: 'kill'|'death'|'written',
//                      score (0..1 share of the boss's health removed, 1 on a kill),
//                      hpLeft (0..1 of the petitioner's own health), strokes, taken }

export const MAX_ATTEMPTS_EACH = 1; // one go each (Ian, 2026-11-20); the rest of the rules still read for any number
export const STROKES = 6;

export const QUARTILES = [
  { id: 'q1', label: 'Under a quarter', min: 0, max: 0.25 },
  { id: 'q2', label: 'A quarter to half', min: 0.25, max: 0.5 },
  { id: 'q3', label: 'Half to three quarters', min: 0.5, max: 0.75 },
  { id: 'q4', label: 'Three quarters or a kill', min: 0.75, max: 1.01 },
];

export function quartile(score, result) {
  if (result === 'kill' || score >= 0.75) return 'q4';
  if (score >= 0.5) return 'q3';
  if (score >= 0.25) return 'q2';
  return 'q1';
}

// Who plays attempt `index` (1-based): order[0] opens, then they alternate.
export function turnFor(order, index) {
  return { entrantId: order[(index - 1) % 2], n: Math.ceil(index / 2), index };
}

function tallyOf(order, attempts) {
  const t = {};
  for (const id of order) t[id] = { attempts: 0, kills: 0, best: 0, bestIndex: null, taken: 0, scores: [] };
  for (const a of attempts) {
    const s = t[a.entrantId];
    if (!s) continue;
    s.attempts += 1;
    if (a.result === 'kill') s.kills += 1;
    s.taken += a.taken || 0;
    s.scores.push(a.score);
    if (s.bestIndex == null || a.score > s.best) { s.best = a.score; s.bestIndex = a.index; }
  }
  return t;
}

// The state of a match after `attempts` (in play order).
// -> { decided, winnerId, how: 'kill'|'both_kill'|'damage'|null, deciding: { index } | null,
//      next: { entrantId, n, index } | null, pairDone: boolean, tally }
export function standing(order, attempts) {
  const tally = tallyOf(order, attempts);
  const done = attempts.length;
  const out = { decided: false, winnerId: null, how: null, deciding: null, next: null, pairDone: done > 0 && done % 2 === 0, tally };

  if (out.pairDone) {
    const [x, y] = attempts.slice(-2); // x moved first in this pair
    const kx = x.result === 'kill', ky = y.result === 'kill';
    if (kx && ky) {
      let w = y; // a dead heat goes against the pair's first mover
      if (x.hpLeft !== y.hpLeft) w = x.hpLeft > y.hpLeft ? x : y;
      else if (x.strokes !== y.strokes) w = x.strokes < y.strokes ? x : y;
      return { ...out, decided: true, winnerId: w.entrantId, how: 'both_kill', deciding: { index: w.index } };
    }
    if (kx || ky) {
      const w = kx ? x : y;
      return { ...out, decided: true, winnerId: w.entrantId, how: 'kill', deciding: { index: w.index } };
    }
    if (done >= MAX_ATTEMPTS_EACH * 2) {
      const [a, b] = order;
      const sorted = (id) => tally[id].scores.slice().sort((p, q) => q - p);
      const sa = sorted(a), sb = sorted(b);
      let w = a;
      if (sa[0] !== sb[0]) w = sa[0] > sb[0] ? a : b;
      else if ((sa[1] || 0) !== (sb[1] || 0)) w = (sa[1] || 0) > (sb[1] || 0) ? a : b;
      else if (tally[a].taken !== tally[b].taken) w = tally[a].taken < tally[b].taken ? a : b;
      return { ...out, decided: true, winnerId: w, how: 'damage', deciding: { index: tally[w].bestIndex } };
    }
  }
  out.next = turnFor(order, done + 1);
  return out;
}

// One plain line for the stage: why the match ended the way it did.
export function verdictLine(how, winnerName) {
  if (how === 'kill') return `${winnerName} killed the Scrivener.`;
  if (how === 'both_kill') return `Both killed it. ${winnerName} had more health left.`;
  return `Nobody killed it. ${winnerName}'s best try cut deepest.`;
}

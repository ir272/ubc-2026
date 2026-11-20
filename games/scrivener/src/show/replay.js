// The verifiable replay (CONTRACT.md section 4). A "how far" window is seeded: its seed is
// the attempt's world seed, drawn only after the window locked. Given that seed, the build and
// the moves the model published in the feed (`decide.made.slot`), anyone can run the attempt
// again and get the same result. PURE: identical in node and the browser.
//
//   simulate({ seed, entrants: [{ id }], options: { entrantId, loadout, temper, handicap, slots, index, n } })
//   seed: the window's hex seed (its first 32 bits are used) or the integer itself.

import { replayAttempt } from '../sim/headless.js';
import { quartile } from './rules.js';

export function simulate({ seed, entrants = [], options = {} }) {
  const seedInt = typeof seed === 'string' ? parseInt(seed.slice(0, 8), 16) >>> 0 : seed >>> 0;
  const entrantId = options.entrantId || (entrants[0] && entrants[0].id) || 'a';
  const rec = replayAttempt({
    seed: seedInt, entrantId, loadout: options.loadout || null, temper: options.temper || null,
    handicap: options.handicap || 0, decisions: options.slots || [], index: options.index, n: options.n,
  });
  const durationMs = Math.round((rec.seconds || 0) * 1000);
  return {
    durationMs,
    events: (rec.decisions || []).map((d, i) => ({ type: 'decide', at: 0, data: { k: d.k ?? i + 1, slot: d.slot, attackId: d.attackId } })),
    // scores are published to three places (attempt.end.score)
    result: { ...rec, score: Math.round(rec.score * 1000) / 1000, outcomeId: quartile(rec.score, rec.result) },
  };
}

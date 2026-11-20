// One Tumbletop show as a script over the platform's `Show` interface. The channel (channel.ts)
// and the dev page's fake show both run exactly this, so what is judged in the harness is what
// the platform airs.
//
//   announce                      the call: the format and the sixteen
//   for each of three rounds:
//     openWindow (seeded)         the round's title call, then the line-up with one clock to the start
//     lock                        the seed for this round now exists; the stage marks the lock
//     emit 'round'                3 2 1, then the round replays from the seed on every client
//     emit the race events        for tickers and chat
//     emit 'recap'                who went out and how (rounds one and two)
//   emit 'result', settle the three windows on the show winner, end
import { ROUNDS } from '../sim/rounds.js';
import { gumble } from '../sim/roster.js';
import { simulate } from '../sim/simulate.js';

export const DEFAULT_TIMINGS = {
  callMs: 12000,                  // the opening call before the first window
  betMs: [40000, 30000, 30000],   // how long each window stays open
  titleMs: 2600,                  // the lock beat: from the lock to the round's 3 s countdown
  cutMs: 5000,                    // the beat on the cut after rounds one and two
  recapMs: 8000,                  // who went out and how
  finalCutMs: 3500,               // the line, before the winner's result
  resultMs: 14000,                // the winner
};

export const QUESTION = 'Who wins the show?';

/** Entrants for `announce`: roster ids -> platform Entrant objects with records. */
export function toEntrants(ids, records = {}) {
  return ids.map((id) => {
    const g = gumble(id);
    const rec = records[id] || { played: 0, wins: 0 };
    return { id, name: g.name, color: g.colors[0], stats: { ...g.stats }, record: { played: rec.played | 0, wins: rec.wins | 0 } };
  });
}

export function showMeta(ids, records = {}, simHash = '', T = DEFAULT_TIMINGS) {
  const gumbles = {};
  for (const id of ids) {
    const g = gumble(id);
    gumbles[id] = { colors: g.colors, pattern: g.pattern, stats: g.stats, trait: g.trait, form: (records[id]?.form || []).slice(0, 5) };
  }
  return {
    game: 'tumbletop', simHash,
    // what the stage needs to run one clock through the lock: ms from announce to the first
    // line-up, and from a window's close to that round's start gun (lock beat + 3 s countdown)
    callMs: T.callMs, closeToGoMs: T.titleMs + 3000,
    rounds: ROUNDS.map((r) => ({ name: r.name, place: r.place, starters: r.starters, qualify: r.qualify })),
    gumbles,
  };
}

/**
 * Run one show. `entrants` are the 16 roster ids in draw order (decided before the announce).
 * Returns { winnerId, order, rounds, entrants } once the result has aired.
 */
export async function runShow(show, { entrants, records = {}, simHash = '', matchId, title = 'Tumbletop', timings = {}, intermissionMs = 6000 }) {
  const T = { ...DEFAULT_TIMINGS, ...timings };
  const at = () => show.elapsed();
  const until = (ms) => show.sleep(ms - at());

  show.announce({ matchId, title, entrants: toEntrants(entrants, records), meta: showMeta(entrants, records, simHash, T) });
  await show.sleep(T.callMs);

  let field = entrants.slice();
  const wins = [];
  const rounds = [];
  let last = null;
  for (let r = 0; r < ROUNDS.length; r++) {
    const win = await show.openWindow({
      question: QUESTION,
      outcomes: field.map((id) => ({ id, label: gumble(id).name, entrantId: id })),
      durationMs: T.betMs[r] ?? T.betMs[T.betMs.length - 1],
      seeded: true,
      simHash: simHash || undefined,
    });
    wins.push(win);
    const { seed } = await show.lock(win);
    if (!seed) throw new Error('tumbletop needs a seeded window');

    // The round exists only now. Simulate it whole, then air it on the clock.
    const sim = simulate({ seed, entrants: field, options: { round: r } });
    const startAt = at() + T.titleMs;
    show.emit({ type: 'round', at: at(), data: { round: r, seed, entrants: field, startAt, raceMs: sim.result.raceMs, durationMs: sim.durationMs } });
    for (const ev of sim.events) {
      await until(startAt + ev.at);
      show.emit({ type: ev.type, at: startAt + ev.at, data: { ...ev.data, round: r } });
    }
    const final = r === ROUNDS.length - 1;
    await until(startAt + sim.durationMs + (final ? T.finalCutMs : T.cutMs));
    last = { round: r, seed, entrants: field, qualified: sim.result.qualified, eliminated: sim.result.eliminated, notes: sim.result.notes };
    rounds.push({ round: r, seed, qualified: last.qualified, eliminated: last.eliminated });
    if (!final) {
      show.emit({ type: 'recap', at: at(), data: { ...last, durationMs: T.recapMs } });
      await show.sleep(T.recapMs);
    }
    field = sim.result.qualified;
  }

  const winnerId = field[0];
  const order = [winnerId, ...last.eliminated];
  show.emit({ type: 'result', at: at(), data: { winnerId, order, seed: last.seed, entrants: last.entrants, notes: last.notes, rounds, nextShowMs: T.resultMs + intermissionMs } });
  for (const w of wins) await show.settle(w, winnerId);
  const result = { winnerId, order, rounds, entrants };
  show.end(result);
  await show.sleep(T.resultMs);
  return result;
}

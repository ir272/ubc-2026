// One match as a script, in five phases: the call, the choosing, the tape, the fight, the verdict.
// Runs against the platform's `Show` (runner/src/types.ts) or the harness's fake one.
// No fs and no DOM here: everything outside the script comes in through `ctx`.
//
// ctx = {
//   matchNo, bots: [botA, botB] in entrant order (each { id, name, model, look, brain }),
//   order: [openerId, otherId], form: { [id]: { record, byClass, h2h, memory } },
//   handicap: { entrantId, amount } | null, simHash, live: boolean,
//   seedInt(): fresh random 32-bit int (offers), onAttempt?(record), onDone?(result)
// }

import { drawOffers, movesFor, CLASSES, WEAPONS, SPELLS, CHARMS, TEMPERS } from '../sim/loadout.js';
import { standing, STROKES } from './rules.js';
import { runAttemptLive } from './attempt.js';
import { T } from './timing.js';

export const SLOTS = ['cls', 'weapon', 'spell', 'charm'];
const TABLES = { cls: CLASSES, weapon: WEAPONS, spell: SPELLS, charm: CHARMS };
export const WHO_WINS = 'Who wins the match?';

const clip = (s, words) => String(s || '').replace(/\s+/g, ' ').trim().split(' ').slice(0, words).join(' ');

async function withLimit(promise, ms, fallback) {
  if (!(ms > 0)) return promise;
  let timer;
  const late = new Promise((r) => { timer = setTimeout(() => r({ ...fallback(), source: 'timeout' }), ms); });
  try { return await Promise.race([promise, late]); } catch { return { ...fallback(), source: 'fallback' }; } finally { clearTimeout(timer); }
}

export async function runMatch(show, ctx) {
  const live = ctx.live !== false;
  // The clock: the runner's real one, or the harness's virtual one (a whole match in milliseconds).
  const clock = ctx.clock || { now: () => Date.now(), sleep: (ms) => show.sleep(ms), real: true };
  const limits = live && clock.real !== false; // model time limits only make sense on a real clock
  const nap = (ms) => (live && ms > 0 ? clock.sleep(ms) : Promise.resolve());
  const [A, B] = ctx.bots;
  const byId = { [A.id]: A, [B.id]: B };
  const order = ctx.order || [A.id, B.id];
  const emit = (type, data) => show.emit({ type, at: show.elapsed(), data });

  const state = {
    matchNo: ctx.matchNo, order, strokes: STROKES, temper: null, offers: null,
    loadouts: { [A.id]: {}, [B.id]: {} }, reasons: { [A.id]: {}, [B.id]: {} },
    attempts: [], current: null, winnerId: null, how: null,
    handicap: ctx.handicap || null,
  };
  const phase = (name, ms) => emit('phase', { phase: name, ms, state: JSON.parse(JSON.stringify(state)) });

  // ---- 1. the call --------------------------------------------------------------------
  const entrants = ctx.bots.map((b) => ({
    id: b.id, name: b.name, color: b.look && b.look.accent,
    record: ctx.form[b.id].record,
    stats: { wins: ctx.form[b.id].record.wins, played: ctx.form[b.id].record.played },
  }));
  show.announce({
    matchId: ctx.matchId,
    title: `${A.name} vs ${B.name}`,
    entrants,
    meta: {
      game: 'scrivener', matchNo: ctx.matchNo, strokes: STROKES, order, simHash: ctx.simHash,
      handicap: ctx.handicap || null,
      bots: ctx.bots.map((b) => ({
        id: b.id, name: b.name, model: b.model, look: b.look || {}, brain: b.brain.kind,
        record: ctx.form[b.id].record, vsBoss: ctx.form[b.id].vsBoss, byClass: ctx.form[b.id].byClass, h2h: ctx.form[b.id].h2h, last: ctx.form[b.id].last,
      })),
    },
  });
  phase('call', T.call);
  await nap(T.call);

  // ---- 2. the choosing ----------------------------------------------------------------
  // Offers and the temper are drawn here, long before any bet opens.
  const drawn = drawOffers(ctx.seedInt());
  state.temper = drawn.temper;
  state.offers = { [order[0]]: drawn.offers[0], [order[1]]: drawn.offers[1] };
  phase('choosing', T.temperReveal);
  emit('temper', { temper: drawn.temper });
  await nap(T.temperReveal);

  for (const slot of SLOTS) {
    for (const id of order) {
      const bot = byId[id];
      const other = byId[order.find((x) => x !== id)];
      const options = state.offers[id][slot];
      emit('offer', { entrantId: id, slot, options });
      const t0 = clock.now();
      await nap(T.pickDeal);
      const fallback = () => ({ choice: options[0], reason: 'No time to weigh it. This one.' });
      const reply = await withLimit(
        Promise.resolve().then(() => bot.brain.pick({
          slot, options: options.map((o) => ({ id: o, name: TABLES[slot][o].name, effect: TABLES[slot][o].effect })),
          temper: { id: drawn.temper, name: TEMPERS[drawn.temper].name, effect: TEMPERS[drawn.temper].effect },
          mine: { ...state.loadouts[id] }, theirs: { ...state.loadouts[other.id] }, form: ctx.form[id],
        })),
        limits ? T.pickThinkMax : 0, fallback,
      );
      const choice = options.includes(reply.choice) ? reply.choice : options[0];
      if (live) {
        const shown = T.pickDeal + Math.max(T.pickThinkMin, reply.thinkMs || 0);
        const spent = clock.now() - t0;
        if (spent < shown) await nap(shown - spent);
      }
      state.loadouts[id][slot] = choice;
      state.reasons[id][slot] = clip(reply.reason, 12);
      emit('pick', { entrantId: id, slot, choice, reason: state.reasons[id][slot], source: reply.source || bot.brain.kind });
      await nap(T.pickHold);
    }
  }
  await nap(T.choosingOut);

  // ---- 3. the tape and the bell -------------------------------------------------------
  // Betting opens only now: the picks are public, so the matchup can be read.
  phase('tape', T.tapeLead + T.tapeWindow + T.tapeAfterLock);
  await nap(T.tapeLead);
  const whoOutcomes = order.map((id) => ({ id, label: byId[id].name, entrantId: id }));
  // The one prediction of the match. It is seeded: the seed of every go comes out of this window's lock,
  // so no go's dice exist until betting has closed.
  const winA = await show.openWindow({ question: WHO_WINS, outcomes: whoOutcomes, durationMs: live ? T.tapeWindow : 5, seeded: true, simHash: ctx.simHash });
  const whoWins = [winA];
  const { seed: matchSeed } = await show.lock(winA);
  const seedFor = (index) => {
    const at = ((index - 1) % 8) * 8;
    const part = matchSeed ? matchSeed.slice(at, at + 8) : '';
    return part.length === 8 ? parseInt(part, 16) >>> 0 : ctx.seedInt();
  };
  await nap(T.tapeAfterLock);

  // ---- 4. the fight -------------------------------------------------------------------
  phase('fight', 0);
  const notes = { [A.id]: (ctx.form[A.id].memory || []).slice(0, 3), [B.id]: (ctx.form[B.id].memory || []).slice(0, 3) };
  let st = standing(order, state.attempts);
  while (!st.decided) {
    const turn = st.next;
    const bot = byId[turn.entrantId];
    state.current = turn;
    emit('attempt.ready', { ...turn });
    // the walk-on: no prediction of its own (the match has one, before the fight)
    await nap(T.walkOn);
    const seedInt = seedFor(turn.index);
    const handicap = ctx.handicap && ctx.handicap.entrantId === turn.entrantId ? ctx.handicap.amount : 0;
    emit('attempt.start', { ...turn, seed: seedInt, loadout: state.loadouts[turn.entrantId], temper: state.temper, handicap });
    await nap(T.bell);
    const { record, world } = await runAttemptLive({
      turn, seed: seedInt, loadout: state.loadouts[turn.entrantId], temper: state.temper, handicap,
      brain: bot.brain, notes: notes[turn.entrantId], live, limits, clock, emit, signal: show.signal,
    });
    record.seed = seedInt;
    record.handicap = handicap;
    state.attempts.push(record);
    st = standing(order, state.attempts);
    emit('attempt.end', { ...record, tally: st.tally });
    if (ctx.onAttempt) ctx.onAttempt(record, state);

    // The model's note to itself runs while the result is held and the window pays.
    const wantNote = record.result !== 'kill';
    const noteJob = wantNote
      ? withLimit(Promise.resolve().then(() => bot.brain.note({ world, record, notes: notes[turn.entrantId] })), limits ? T.noteMax : 0, () => ({ text: '' }))
      : Promise.resolve({ text: '' });
    await nap(T.endHold[record.result]);
    const note = await noteJob;
    if (note && note.text) {
      const text = clip(note.text, 18);
      notes[turn.entrantId] = [text, ...notes[turn.entrantId]].slice(0, 3);
      emit('note', { entrantId: turn.entrantId, text });
      await nap(T.noteHold);
    }
    state.current = null;

    if (!st.decided && st.pairDone) {
      const winP = await show.openWindow({ question: WHO_WINS, outcomes: whoOutcomes, durationMs: live ? T.pairWindow : 5, seeded: false });
      whoWins.push(winP);
      await show.lock(winP);
      await nap(T.pairAfterLock);
    }
  }

  // ---- 5. the verdict -----------------------------------------------------------------
  state.winnerId = st.winnerId;
  state.how = st.how;
  phase('verdict', T.verdict);
  const t0 = clock.now();
  emit('verdict', { winnerId: st.winnerId, how: st.how, deciding: st.deciding, tally: st.tally });
  const loserId = order.find((x) => x !== st.winnerId);
  const summary = { how: st.how, winner: byId[st.winnerId].name, loser: byId[loserId].name, temper: TEMPERS[state.temper].name, attempts: state.attempts };
  const lines = Promise.all([st.winnerId, loserId].map((id) => withLimit(
    Promise.resolve().then(() => byId[id].brain.say({ kind: id === st.winnerId ? 'win' : 'loss', summary, loadout: state.loadouts[id] })),
    limits ? T.sayMax : 0, () => ({ text: '' }),
  )));
  for (const w of whoWins) await show.settle(w, st.winnerId);
  const [winLine, lossLine] = await lines;
  const left = () => (live ? Math.max(0, T.verdictLinesAt - (clock.now() - t0)) : 0);
  await nap(left());
  if (winLine.text) emit('line', { entrantId: st.winnerId, text: clip(winLine.text, 16), kind: 'win' });
  await nap(2600);
  if (lossLine.text) emit('line', { entrantId: loserId, text: clip(lossLine.text, 16), kind: 'loss' });
  const result = {
    winnerId: st.winnerId, how: st.how, deciding: st.deciding, matchNo: ctx.matchNo,
    temper: state.temper, loadouts: state.loadouts, attempts: state.attempts, notes,
  };
  if (ctx.onDone) ctx.onDone(result);
  const rest = live ? Math.max(T.nextCountdown, T.verdict - (clock.now() - t0)) : 0;
  emit('next', { ms: rest });
  show.end(result);
  await nap(rest);
  return result;
}

export { movesFor };

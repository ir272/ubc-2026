// dice-duel: a tiny demo that opens TWO windows in one match.
//   Window 1 (seeded, before the start): "Who wins round 1?"  → decided by the seed.
//   Window 2 (live, mid-match, seeded: false): "Who wins round 2?" (incl. a tie) → decided by
//   randomness drawn after the window locks, standing in for a model decision that has not
//   happened yet.
import { randomBytes } from 'node:crypto';
import type { ChannelDef, Entrant, Show } from '../types.ts';
import { prng } from './coinflip.ts';

const PAIRS: [Entrant, Entrant][] = [
  [
    { id: 'lucky', name: 'Lucky Lou', color: '#f5a524' },
    { id: 'snake', name: 'Snake Eyes', color: '#30a46c' },
  ],
  [
    { id: 'boxcar', name: 'Boxcar Bea', color: '#e5484d' },
    { id: 'shooter', name: 'Hot Shooter', color: '#3e63dd' },
  ],
];

/** Pure: three dice each from one hex seed. */
export function rollRound(seed: string, entrants: Entrant[]) {
  const r = prng(seed);
  const rolls: Record<string, number[]> = {};
  for (const e of entrants) rolls[e.id] = [0, 0, 0].map(() => 1 + Math.floor(r() * 6));
  const sum = (id: string) => rolls[id]!.reduce((x, y) => x + y, 0);
  const [a, b] = entrants as [Entrant, Entrant];
  const winner = sum(a.id) > sum(b.id) ? a.id : sum(b.id) > sum(a.id) ? b.id : 'tie';
  return { rolls, totals: { [a.id]: sum(a.id), [b.id]: sum(b.id) }, winner };
}

export interface DiceDuelOpts {
  id?: string;
  window1Ms?: number;
  window2Ms?: number;
  rollMs?: number;
  resultMs?: number;
  intermissionMs?: number;
}

export function diceDuelChannel(o: DiceDuelOpts = {}): ChannelDef {
  return {
    id: o.id ?? 'dice-duel',
    title: 'Dice Duel (two windows)',
    intermissionMs: o.intermissionMs ?? 4000,
    async run(show: Show) {
      const entrants = PAIRS[Math.floor(Math.random() * PAIRS.length)]!;
      const [a, b] = entrants;
      show.announce({
        matchId: `dice-${Date.now().toString(36)}`,
        title: `${a.name} vs ${b.name}`,
        entrants,
        meta: { game: 'dice-duel', rounds: 2 },
      });
      const rollMs = o.rollMs ?? 4000;

      // Window 1: seeded, before the start.
      const w1 = await show.openWindow({
        question: 'Round 1: who rolls higher?',
        outcomes: [
          { id: a.id, label: a.name, entrantId: a.id },
          { id: b.id, label: b.name, entrantId: b.id },
          { id: 'tie', label: 'Tie' },
        ],
        durationMs: o.window1Ms ?? 20_000,
        seeded: true,
        simHash: 'dice-duel/v1',
      });
      const { seed } = await show.lock(w1);
      const r1 = rollRound(seed!, entrants);
      show.emit({ type: 'round_start', at: show.elapsed(), data: { round: 1 } });
      await show.sleep(rollMs);
      show.emit({ type: 'roll', at: show.elapsed(), data: { round: 1, ...r1 } });
      await show.settle(w1, r1.winner);

      // Window 2: live (no seed), opened mid-match.
      const w2 = await show.openWindow({
        question: 'Round 2: who rolls higher?',
        outcomes: [
          { id: a.id, label: a.name, entrantId: a.id },
          { id: b.id, label: b.name, entrantId: b.id },
          { id: 'tie', label: 'Tie' },
        ],
        durationMs: o.window2Ms ?? 15_000,
        seeded: false,
      });
      await show.lock(w2);
      // Drawn only now, after betting closed: the stand-in for a live model decision.
      const r2 = rollRound(randomBytes(32).toString('hex'), entrants);
      show.emit({ type: 'round_start', at: show.elapsed(), data: { round: 2 } });
      await show.sleep(rollMs);
      show.emit({ type: 'roll', at: show.elapsed(), data: { round: 2, ...r2 } });
      await show.settle(w2, r2.winner);

      show.end({ rounds: [r1.winner, r2.winner] });
      await show.sleep(o.resultMs ?? 5000);
    },
  };
}

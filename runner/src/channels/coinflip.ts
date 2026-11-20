// coinflip: the built-in demo channel and the reference example for plugging in a game.
//
// One match = two named entrants, a 30 s betting window, a 20 s seeded random-walk race,
// the result, and a short intermission. Copy this file to add a channel (see README.md).
//
// The shape every seeded channel follows:
//   1. show.announce(...)                 lobby: names, colours, records
//   2. win = await show.openWindow(...)   betting opens (seeded: true)
//   3. { seed } = await show.lock(win)    waits for the close, locks, derives the seed
//   4. simulate({ seed, entrants })       pure + deterministic: same seed → same race, anywhere
//   5. show.emit(event) on the timeline   viewers see the race play out in real time
//   6. await show.settle(win, winnerId)   reveals the secret, pays everyone
//   7. show.end(result); await show.sleep(...)

import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import type { ChannelDef, Entrant, GameEvent, Show } from '../types.ts';

// ---------------------------------------------------------------------------------------------
// Pure simulation. No imports, no Date, no Math.random: runs identically in node and the browser.
// ---------------------------------------------------------------------------------------------

export interface CoinflipOptions {
  ticks?: number; // position updates in the race (default 100)
  tickMs?: number; // ms between updates (default 200 → 20 s race, 5 updates/s)
}

export interface CoinflipResult {
  winnerId: string;
  positions: Record<string, number>;
  leadChanges: number;
}

/** sfc32 PRNG seeded from the first 128 bits of a hex seed. Returns floats in [0, 1). */
export function prng(seedHex: string): () => number {
  if (!/^[0-9a-f]{32,}$/i.test(seedHex)) throw new Error('seed must be hex (at least 32 chars)');
  let a = parseInt(seedHex.slice(0, 8), 16) >>> 0;
  let b = parseInt(seedHex.slice(8, 16), 16) >>> 0;
  let c = parseInt(seedHex.slice(16, 24), 16) >>> 0;
  let d = parseInt(seedHex.slice(24, 32), 16) >>> 0;
  const next = () => {
    a >>>= 0; b >>>= 0; c >>>= 0; d >>>= 0;
    const t = (a + b) | 0;
    a = b ^ (b >>> 9);
    b = (c + (c << 3)) | 0;
    c = (c << 21) | (c >>> 11);
    d = (d + 1) | 0;
    const r = (t + d) | 0;
    c = (c + r) | 0;
    return (r >>> 0) / 4294967296;
  };
  for (let i = 0; i < 12; i++) next(); // warm up
  return next;
}

export const TRACK_LENGTH = 110;

export function simulate(a: { seed: string; entrants: Entrant[]; options?: CoinflipOptions }): {
  durationMs: number;
  events: GameEvent[];
  result: CoinflipResult;
} {
  const ticks = a.options?.ticks ?? 100;
  const tickMs = a.options?.tickMs ?? 200;
  const rand = prng(a.seed);
  const ids = a.entrants.map((e) => e.id);
  const pos: Record<string, number> = {};
  for (const id of ids) pos[id] = 0;
  const round = (x: number) => Math.round(x * 100) / 100;
  const snapshot = () => {
    const o: Record<string, number> = {};
    for (const id of ids) o[id] = round(pos[id]!);
    return o;
  };
  const leaderOf = () => ids.reduce((best, id) => (pos[id]! > pos[best]! ? id : best), ids[0]!);

  const events: GameEvent[] = [{ type: 'start', at: 0, data: { length: TRACK_LENGTH, positions: snapshot() } }];
  let leader: string | null = null;
  let leadChanges = 0;
  for (let i = 1; i <= ticks; i++) {
    const at = i * tickMs;
    for (const id of ids) {
      let step = 0.6 + rand() * 1.0;
      const r = rand();
      if (r < 0.04) {
        step += 3;
        events.push({ type: 'burst', at, data: { entrantId: id } });
      } else if (r < 0.07) {
        step = -1;
        events.push({ type: 'stumble', at, data: { entrantId: id } });
      }
      pos[id] = Math.max(0, pos[id]! + step);
    }
    const l = leaderOf();
    if (l !== leader && i > 1) {
      if (leader !== null) leadChanges++;
      events.push({ type: 'lead', at, data: { entrantId: l } });
    }
    leader = l;
    events.push({ type: 'pos', at, data: { positions: snapshot() } });
  }
  // Tie at the line (rounded): a final photo-finish coin decides.
  const best = Math.max(...ids.map((id) => round(pos[id]!)));
  const tied = ids.filter((id) => round(pos[id]!) === best);
  const winnerId = tied.length === 1 ? tied[0]! : tied[Math.floor(rand() * tied.length)]!;
  const durationMs = ticks * tickMs;
  const result: CoinflipResult = { winnerId, positions: snapshot(), leadChanges };
  events.push({ type: 'finish', at: durationMs, data: result });
  return { durationMs, events, result };
}

// ---------------------------------------------------------------------------------------------
// Channel (node side): the script the runner calls in a loop.
// ---------------------------------------------------------------------------------------------

/** sha256 of this file: recorded in the market so a replay can name the exact simulation version. */
export const SIM_HASH = createHash('sha256').update(readFileSync(new URL(import.meta.url))).digest('hex');

const ROSTER: Entrant[] = [
  { id: 'ruby', name: 'Ruby Rocket', color: '#e5484d' },
  { id: 'cobalt', name: 'Cobalt Comet', color: '#3e63dd' },
  { id: 'jade', name: 'Jade Jumper', color: '#30a46c' },
  { id: 'amber', name: 'Amber Arrow', color: '#f5a524' },
  { id: 'violet', name: 'Violet Vortex', color: '#8e4ec6' },
  { id: 'slate', name: 'Slate Sprinter', color: '#6b7280' },
];

export interface CoinflipChannelOpts extends CoinflipOptions {
  id?: string;
  title?: string;
  bettingMs?: number; // default 30 s
  resultMs?: number; // how long the result stays up, default 6 s
  intermissionMs?: number; // default 4 s
  /** Pick the two entrants (tests); default: two at random from the roster. */
  pick?: () => [Entrant, Entrant];
}

export function coinflipChannel(o: CoinflipChannelOpts = {}): ChannelDef {
  const records = new Map<string, { played: number; wins: number }>();
  const pick =
    o.pick ??
    (() => {
      const i = Math.floor(Math.random() * ROSTER.length);
      let j = Math.floor(Math.random() * (ROSTER.length - 1));
      if (j >= i) j++;
      return [ROSTER[i]!, ROSTER[j]!] as [Entrant, Entrant];
    });

  return {
    id: o.id ?? 'coinflip',
    title: o.title ?? 'Coinflip Derby',
    intermissionMs: o.intermissionMs ?? 4000,
    async run(show: Show) {
      const entrants = pick().map((e) => ({ ...e, record: records.get(e.id) ?? { played: 0, wins: 0 } }));
      const [a, b] = entrants as [Entrant, Entrant];
      const matchId = `coinflip-${Date.now().toString(36)}`;

      // 1. Lobby.
      show.announce({
        matchId,
        title: `${a.name} vs ${b.name}`,
        entrants,
        meta: { game: 'coinflip', trackLength: TRACK_LENGTH, simHash: SIM_HASH },
      });

      // 2. Betting window. Seeded: the race comes from a seed nobody can know until it locks.
      const win = await show.openWindow({
        question: 'Who wins the race?',
        outcomes: entrants.map((e) => ({ id: e.id, label: e.name, entrantId: e.id })),
        durationMs: o.bettingMs ?? 30_000,
        seeded: true,
        simHash: SIM_HASH,
      });

      // 3. Close + lock. The seed is published to viewers at this point.
      const { seed } = await show.lock(win);

      // 4. Simulate the whole race up front (pure, deterministic).
      const sim = simulate({ seed: seed!, entrants, options: { ticks: o.ticks, tickMs: o.tickMs } });

      // 5. Play it out in real time. GameEvent.at is ms since announce(), so offset the sim's clock.
      const t0 = show.elapsed();
      for (const ev of sim.events) {
        await show.sleep(t0 + ev.at - show.elapsed());
        show.emit({ ...ev, at: t0 + ev.at });
      }

      // 6. Settle: reveals the secret and pays out.
      await show.settle(win, sim.result.winnerId);

      // 7. Result, then return (the runner shows the intermission and calls run() again).
      for (const e of entrants) {
        const r = records.get(e.id) ?? { played: 0, wins: 0 };
        records.set(e.id, { played: r.played + 1, wins: r.wins + (e.id === sim.result.winnerId ? 1 : 0) });
      }
      show.end(sim.result);
      await show.sleep(o.resultMs ?? 6000);
    },
  };
}

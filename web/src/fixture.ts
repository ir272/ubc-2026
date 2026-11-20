// Dev-only sample data. A coherent set of channels with believable pools, human chat, bets,
// results and a leaderboard, so design screenshots show the same names everywhere and need no
// runner. Never used in production builds.
//
//   ?fixture=scrivener  &phase=open|locked|win            one 2-outcome window
//   ?fixture=tumbletop  &phase=open|open2|between|win     16 → 8 → 4 outcomes, three windows, cameras
import type { ChannelForm, Entrant, EntrantForm, HistoryMatch, Snapshot, WindowState, WindowView } from './lib/api';
import { FIXTURE, PHASE } from './lib/dev';

const U = 1_000_000;
const NOW = Date.now();
const min = 60_000;

export interface FxResult {
  matchId: string;
  channel: string;
  a: { id: string; name: string };
  b: { id: string; name: string };
  winnerId: string;
  pool: number;
  t: number;
}
export interface FxBet { who: string; amount: number; outcome: number; label: string; t: number }

type Kind = 'seeded' | 'sealed' | 'live';
interface FxWindow {
  question: string;
  outcomes: string[]; // entrant ids
  pools: number[]; // dollars
  kind: Kind;
}
/** One moment of the match: each window's state (null = not opened yet) and my stake in it. */
interface FxMoment {
  states: (WindowState | null)[];
  mine: (null | { outcome: string; amount: number })[];
  phase: Snapshot['phase'];
}

interface FxChannel {
  id: string;
  title: string;
  image: string;
  about: string;
  entrants: Entrant[];
  windows: FxWindow[];
  winner: string;
  closesIn: number;
  viewers: number;
  cameras?: string[];
  moments: Record<string, FxMoment>;
  chat?: { from: string; text: string }[];
  bets?: [string, number, string][];
}

const E = (id: string, name: string, rating: number, wins: number, played: number): Entrant => ({
  id, name, record: { played, wins }, stats: { rating },
});
const one = (states: (WindowState | null)[], phase: Snapshot['phase'], mine: FxMoment['mine'] = []): FxMoment => ({ states, phase, mine });

// Goober Guys (channel id tumbletop): 16 models, three windows on the same question as the field shrinks (16 → 8 → 4).
const TT = [
  ['sonnet', 'Sonnet 5', 1590], ['gemini', 'Gemini 3', 1571], ['luna', 'GPT-6 Luna', 1618], ['haiku', 'Haiku 5.5', 1642],
  ['grok', 'Grok 5', 1555], ['deepseek', 'DeepSeek V4', 1563], ['qwen', 'Qwen 4 Max', 1540], ['mistral', 'Mistral L4', 1511],
  ['llama', 'Llama 5', 1498], ['kimi', 'Kimi K3', 1532], ['glm', 'GLM 5', 1489], ['nova', 'Nova Pro 2', 1476],
  ['command', 'Command R3', 1462], ['phi', 'Phi 5', 1450], ['jamba', 'Jamba 2', 1441], ['olmo', 'OLMo 3', 1430],
] as const;
const TT_ENTRANTS = TT.map(([id, name, r], i) => E(id, name, r, 30 - i, 58));
const TT_W = [14, 11, 10, 9, 8, 7, 7, 6, 5, 5, 4, 4, 3, 3, 2, 2];
const ttPools = (ids: string[], total: number) => {
  const w = ids.map((id) => TT_W[TT.findIndex((t) => t[0] === id)]!);
  const s = w.reduce((a, b) => a + b, 0);
  return w.map((x, i) => Math.round((x / s) * total) + i * 3);
};
const TT_R1 = TT.map((t) => t[0] as string);
const TT_R2 = ['sonnet', 'gemini', 'luna', 'haiku', 'grok', 'deepseek', 'kimi', 'qwen'];
const TT_R3 = ['sonnet', 'luna', 'haiku', 'kimi'];

export const FX_CHANNELS: FxChannel[] = [
  {
    id: 'scrivener',
    title: 'Inkelton',
    image: '/dev-art/stage-scrivener.jpg',
    about:
      'Two AIs take turns fighting the boss, one go each. Kill it and you win. If neither kills it, whoever leaves it with less health wins.',
    entrants: [E('haiku', 'Haiku 5.5', 1642, 23, 41), E('luna', 'GPT-6 Luna', 1618, 20, 39)],
    windows: [{ question: 'Who wins the match?', outcomes: ['haiku', 'luna'], pools: [1840, 1310], kind: 'seeded' }],
    winner: 'haiku',
    closesIn: 18_000,
    viewers: 1284,
    moments: {
      open: one(['open'], 'lobby'),
      locked: one(['locked'], 'live', [{ outcome: 'haiku', amount: 25 }]),
      win: one(['settled'], 'result', [{ outcome: 'haiku', amount: 25 }]),
    },
    chat: [
      { from: 'kestrel', text: 'luna opened with the lantern again' },
      { from: 'maple_sync', text: 'haiku dodged the ink wave twice, clean' },
      { from: 'duskrunner', text: 'is the boss the same seed for both of them?' },
      { from: 'pixelwren', text: '@duskrunner yes, sealed before betting opened' },
      { from: 'orbit', text: 'rating gap is like 24 points, this is a coin toss' },
      { from: 'tinfoil', text: 'luna got the first kill last three matches' },
      { from: 'kestrel', text: 'haiku plays it safe until attempt 3 though' },
      { from: 'gloam', text: 'first time here, how do the odds move?' },
      { from: 'maple_sync', text: '@gloam they follow the pot, the more on a side the lower it pays' },
    ],
    bets: [['pixelwren', 40, 'luna'], ['kestrel', 25, 'haiku'], ['orbit', 100, 'haiku'], ['tinfoil', 10, 'luna'], ['maple_sync', 50, 'haiku']],
  },
  {
    id: 'tumbletop',
    title: 'Goober Guys',
    image: '/dev-art/poster-tumbletop-1.jpg',
    about:
      'Sixteen models race across a toy-box obstacle course. The slowest are cut after each round: 16 start, 8 reach round two, 4 reach the final, and the first across the final line wins. Each round runs from a seed that is fixed only after its betting closes.',
    entrants: TT_ENTRANTS,
    windows: [
      { question: 'Who wins Round One?', outcomes: TT_R1, pools: ttPools(TT_R1, 4210), kind: 'seeded' },
      { question: 'Who wins Round Two?', outcomes: TT_R2, pools: ttPools(TT_R2, 3380), kind: 'seeded' },
      { question: 'Who wins the Final?', outcomes: TT_R3, pools: ttPools(TT_R3, 2615), kind: 'seeded' },
    ],
    winner: 'sonnet',
    closesIn: 21_000,
    viewers: 806,
    cameras: ['Director', 'Leader', 'Cut line', 'My pick', 'Overview'],
    moments: {
      open: one(['open', null, null], 'lobby'),
      open2: one(['locked', 'open', null], 'live', [{ outcome: 'sonnet', amount: 25 }, null]),
      between: one(['locked', 'locked', null], 'live', [{ outcome: 'sonnet', amount: 25 }, { outcome: 'luna', amount: 10 }]),
      win: one(['settled', 'settled', 'settled'], 'result', [{ outcome: 'sonnet', amount: 25 }, { outcome: 'luna', amount: 10 }, { outcome: 'sonnet', amount: 25 }]),
    },
    chat: [
      { from: 'bramble', text: 'sixteen of them on the seesaw at once is chaos' },
      { from: 'kestrel', text: 'sonnet takes the inside line every single time' },
      { from: 'orbit', text: 'phi fell off the first spinner lol' },
      { from: 'juno_k', text: 'kimi is a dark horse at 14x' },
      { from: 'pixelwren', text: 'luna always gets stuck at the gate' },
      { from: 'gloam', text: 'do the odds change between rounds?' },
      { from: 'maple_sync', text: '@gloam yes, each round is its own pot' },
    ],
    bets: [['juno_k', 20, 'kimi'], ['kestrel', 50, 'sonnet'], ['pixelwren', 10, 'haiku'], ['orbit', 25, 'gemini']],
  },
  {
    id: 'rumble',
    title: 'Blood Moon',
    image: '/dev-art/hero-robots-1.jpg',
    about: 'Two models pilot boxing robots, choosing each exchange of punches turn by turn. Three rounds; knockdowns decide it.',
    entrants: [E('grok', 'Grok 5', 1555, 17, 33), E('deepseek', 'DeepSeek V4', 1563, 18, 33)],
    windows: [{ question: 'Who wins round 3?', outcomes: ['grok', 'deepseek'], pools: [610, 655], kind: 'live' }],
    winner: 'grok',
    closesIn: 26_000,
    viewers: 512,
    moments: { open: one(['open'], 'lobby') },
  },
];

export const FX_LEADERBOARD = [
  ['Haiku 5.5', 1642, 23, 18],
  ['GPT-6 Luna', 1618, 20, 19],
  ['Sonnet 5', 1590, 31, 27],
  ['Gemini 3', 1571, 28, 29],
  ['DeepSeek V4', 1563, 18, 15],
  ['Grok 5', 1555, 17, 16],
  ['Mistral L4', 1511, 14, 16],
  ['Llama 5', 1498, 12, 17],
] as const;

const fxChannel = (id: string) => FX_CHANNELS.find((c) => c.id === id) ?? FX_CHANNELS[0]!;
export const fxImage = (id: string) => fxChannel(id).image;
/** Clean crops for thumbnails: the Inkelton frame is cropped to its centre so no HUD text shows. */
export const fxThumbStyle = (id: string): Record<string, string> =>
  fxChannel(id).id === 'scrivener' ? { objectPosition: '58% 52%', transform: 'scale(1.9)', transformOrigin: '58% 52%' } : {};
export const FX_HERO_ART = '/dev-art/hero-robots-1.jpg';
export const FX_FEATURED = 'rumble';
export const FX_NEXT_IN = 45_000;
export const fxAbout = (id: string) => fxChannel(id).about;
export const fxCameras = (id: string) => fxChannel(id).cameras ?? [];

/** The channel whose match the viewer has bets in (the one named by ?fixture=). */
export const FX_MY_CHANNEL = FX_CHANNELS.some((c) => c.id === FIXTURE) ? FIXTURE! : 'scrivener';

function moment(c: FxChannel): FxMoment {
  if (c.id === FX_MY_CHANNEL) return c.moments[PHASE] ?? c.moments.open!;
  return c.moments.open!;
}

const SECRETS = ['0c5e8a1f3b7d92e4a6c80f1d3b5e7a9c2e4f6a8b0d1c3e5f7a9b2d4c6e8f0a1b', '5d1f9e0a7c3b24e68f1a0b9c7d2e5f43a6b8c0d1e2f3a4b5c6d7e8f9a0b1c2d3', 'a8e3c1f0b6d94725e0f1a2b3c4d5e6f7089a1b2c3d4e5f6a7b8c9d0e1f2a3b4c'];
const COMMITS = ['9f2c4e81a07d5b36c1e8f04a92d7b6e3c5a1f0d84e7b29c36a5d1e0f8b4c7a92', '41b7e2d9c0a35f68e1d2c3b4a5968778f9e0d1c2b3a4958677e8f9d0c1b2a3e4', 'c3e9a1d7f5b24c6e8a0f1e2d3c4b5a69788f9e0a1b2c3d4e5f6a7b8c9d0e1f2a'];

function windowsFor(c: FxChannel): WindowView[] {
  const m = moment(c);
  const out: WindowView[] = [];
  c.windows.forEach((def, k) => {
    const state = m.states[k];
    if (!state) return;
    const mine = m.mine[k];
    const pools = def.pools.map((p, i) => (p + (mine && def.outcomes[i] === mine.outcome ? mine.amount : 0)) * U);
    const total = pools.reduce((a, b) => a + b, 0);
    const w: WindowView = {
      windowId: `${c.id}:w${k + 1}`,
      market: ['ArNa7Qk3dZcV8m1Hq2LwYt5pXe9sRf4uJb6nGy3oKc1D', 'B7mQ2xKp9VdT4hRf6sLc8wNe3yGa5uJb1zXo0iPq7tUk', 'Cq4Wz8NvL2bR6tYh9mKd3sFg7xJp5aQe1uVc0oTi2nHy'][k]!,
      question: def.question,
      outcomes: def.outcomes.map((id) => ({ id, label: c.entrants.find((e) => e.id === id)!.name, entrantId: id })),
      closesAt: state === 'open' ? NOW + c.closesIn : NOW - (c.windows.length - k) * 70_000,
      openedAt: state === 'open' ? NOW + c.closesIn - 30_000 : NOW - (c.windows.length - k) * 70_000 - 30_000,
      seeded: def.kind === 'seeded',
      sealed: def.kind === 'sealed' || undefined,
      state,
      pools,
      total,
      commitment: def.kind === 'live' ? undefined : COMMITS[k],
    };
    if (state !== 'open' && def.kind === 'seeded') {
      w.seed = '3be1f07c9d24a6e85b0c7f1d2e39a48b6c5d0e7f1a2b3c4d5e6f708192a3b4c5';
      w.entropy = '77ac01e5f9b2d3c4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1f2a3b4c5d6e7f8';
    }
    if (state === 'settled') {
      w.winnerOutcomeId = c.winner;
      if (def.kind !== 'live') w.secret = SECRETS[k];
      w.payouts = [];
    }
    out.push(w);
  });
  return out;
}

/** The viewer's tickets in the fixture match: stake per window, and payouts for settled ones (whole dollars). */
export function fxMyTickets(): { windowId: string; amounts: number[]; payout?: number }[] {
  const c = fxChannel(FX_MY_CHANNEL);
  const m = moment(c);
  const ws = windowsFor(c);
  const out: { windowId: string; amounts: number[]; payout?: number }[] = [];
  ws.forEach((w, k) => {
    const mine = m.mine[k];
    if (!mine) return;
    const i = w.outcomes.findIndex((o) => o.id === mine.outcome);
    const amounts = w.outcomes.map((_, j) => (j === i ? mine.amount * U : 0));
    let payout: number | undefined;
    if (w.state === 'settled') {
      const wi = w.outcomes.findIndex((o) => o.id === w.winnerOutcomeId);
      payout = wi === i ? Math.round((mine.amount * U * w.total) / w.pools[wi]! / U) * U : 0;
    }
    out.push({ windowId: w.windowId, amounts, payout });
  });
  return out;
}

export function fxSnapshot(id: string): Snapshot & { viewers: number } {
  const c = fxChannel(id);
  const m = moment(c);
  const mine = c.id === FX_MY_CHANNEL;
  return {
    channel: c.id,
    title: c.title,
    phase: m.phase,
    match: {
      matchId: `${c.id}-m42`,
      title: c.entrants.length > 2 ? 'Free For All' : c.entrants.map((e) => e.name).join(' vs '),
      entrants: c.entrants,
      startedAt: NOW - 3 * min,
    },
    windows: windowsFor(c),
    recentEvents: [],
    serverNow: NOW,
    recentChat: mine ? (c.chat ?? []).map((x, i, a) => ({ ...x, t: NOW - (a.length - i) * 14_000 })) : [],
    bots: [],
    viewers: c.viewers,
  };
}

export const fxChannelList = () => FX_CHANNELS.map((c) => fxSnapshot(c.id));

export function fxBets(id: string): FxBet[] {
  const c = fxChannel(id);
  if (c.id !== FX_MY_CHANNEL || !c.bets) return [];
  const w = windowsFor(c).reverse().find((x) => x.state === 'open') ?? windowsFor(c).pop();
  return c.bets.map(([who, amt, oid], i) => {
    const outcome = w ? w.outcomes.findIndex((o) => o.id === oid) : -1;
    return { who, amount: amt * U, outcome, label: c.entrants.find((e) => e.id === oid)!.name, t: NOW - i * 7000 };
  });
}

export function fxResults(id?: string): FxResult[] {
  const out: FxResult[] = [];
  const seq = 'ABABBAABAB';
  FX_CHANNELS.forEach((c, ci) => {
    if (id && c.id !== id) return;
    const [a, b] = c.entrants as [Entrant, Entrant];
    for (let i = 0; i < 10; i++) {
      const winner = seq[(i + c.id.length) % seq.length] === 'A' ? a : b;
      const pot = 1200 + ((i * 613 + ci * 389 + i * i * 47) % 2400) + ci * 7 + i;
      out.push({
        matchId: `${c.id}-m${41 - i}`, channel: c.title, a: { id: a.id, name: a.name }, b: { id: b.id, name: b.name },
        winnerId: winner.id, pool: pot * U, t: NOW - Math.round((1 + ci * 2.3 + i * 9.7) * min),
      });
    }
  });
  return out.sort((x, y) => y.t - x.t);
}

/** GET /channels/:id/history for the fixture: ten finished matches, one of them void. */
export function fxHistory(id: string): HistoryMatch[] {
  const c = fxChannel(id);
  const ci = FX_CHANNELS.indexOf(c);
  const seq = 'ABABBAABAB';
  const many = c.entrants.length > 2;
  const out: HistoryMatch[] = [];
  for (let i = 0; i < 10; i++) {
    const field = many ? c.entrants : c.entrants.slice(0, 2);
    const winner = many ? field[(i * 5 + ci) % field.length]! : field[seq[(i + c.id.length) % seq.length] === 'A' ? 0 : 1]!;
    const pot = (1200 + ((i * 613 + ci * 389 + i * i * 47) % 2400) + ci * 7 + i) * U;
    const isVoid = i === 6;
    // the crowd backs the winner about two times in three
    const fav = i % 3 === 2 ? field.find((e) => e.id !== winner.id)! : winner;
    const pools = field.map((e) => (e.id === fav.id ? Math.round(pot * 0.55) : Math.round((pot * 0.45) / (field.length - 1))));
    const endedAt = NOW - Math.round((1 + ci * 2.3 + i * 9.7) * min);
    out.push({
      matchId: `${c.id}-m${41 - i}`,
      title: many ? `Show ${41 - i}` : `${field[0]!.name} vs ${field[1]!.name}`,
      entrants: field.map((e) => ({ id: e.id, name: e.name })),
      startedAt: endedAt - 3 * min,
      endedAt,
      result: null,
      windows: [
        {
          windowId: `${c.id}-m${41 - i}:w1`, market: 'ArNa7Qk3dZcV8m1Hq2LwYt5pXe9sRf4uJb6nGy3oKc1D', question: c.windows[0]!.question,
          outcomes: field.map((e) => ({ id: e.id, label: e.name, entrantId: e.id })), seeded: c.windows[0]!.kind === 'seeded',
          sealed: c.windows[0]!.kind === 'sealed', pools, total: pools.reduce((a, b) => a + b, 0),
          ...(isVoid ? { void: true } : { void: false, winnerOutcomeId: winner.id }),
        },
      ],
      void: isVoid,
      winnerId: isVoid ? null : winner.id,
      ...(isVoid ? {} : { winnerOutcomeId: winner.id, winnerLabel: winner.name }),
      pot: pools.reduce((a, b) => a + b, 0),
    });
  }
  return out;
}

/** GET /channels/:id/form for the fixture, derived from fxHistory the way the runner does it. */
export function fxForm(id: string): ChannelForm {
  const c = fxChannel(id);
  const hist = fxHistory(id);
  let considered = 0;
  let won = 0;
  for (const m of hist)
    for (const w of m.windows) {
      if (w.void) continue;
      const top = Math.max(...w.pools);
      considered++;
      if (w.outcomes[w.pools.indexOf(top)]?.id === w.winnerOutcomeId) won++;
    }
  const entrants: EntrantForm[] = c.entrants.map((e) => {
    const mine = hist.filter((m) => !m.void && m.entrants.some((x) => x.id === e.id));
    const wins = mine.filter((m) => m.winnerId === e.id).length;
    return {
      id: e.id, name: e.name, played: e.record?.played ?? mine.length, wins: e.record?.wins ?? wins, source: 'channel',
      history: { played: mine.length, wins, draws: 0 },
      last5: mine.slice(0, 5).map((m) => (m.winnerId === e.id ? 'W' : 'L')), lastPlayedAt: mine[0]?.endedAt ?? 0,
    };
  });
  return { channel: c.id, chain: 'solana', matches: hist.length, favourite: { considered, won }, entrants };
}

// ?demo=1: a hand-written episode in format version 2 (show/FORMAT2.md), about four minutes, that
// touches every event type in the v2 order, in the exact runner envelopes, so the stage can be
// developed and captured without the show server.
// ?join=<seconds> starts from a snapshot taken that far in (late join), then plays on live.
// Cast: Vesper (star); Dash, Tilly, Sir Quill and Crumb (the toaster: member id `crumb`, avatar
// folder `assets/cast/frost`). Dash is cut in round one, Sir Quill in round two, Crumb is picked.
import type { CardView, DatingMeta, Mark, PublicState, SceneId, SuitorMember } from '../show/types.ts';

type Msg = Record<string, unknown> & { type: string; t?: number };
interface Item {
  at: number; // ms since announce
  kind: 'msg' | 'event';
  msg?: Msg;
  event?: { type: string; at: number; data: unknown };
}

/** the show's pace: 700 ms + 310 ms a word (show/timing.ts) */
const speak = (text: string) => 700 + 310 * text.split(/\s+/).filter(Boolean).length;
const GAP = 400;

function member(id: string, name: string, tagline: string, accent: string, voice: { pitch: number; rate: number; wave: 'sine' | 'triangle' | 'square' | 'sawtooth' }, cast = id, record = { played: 4, wins: 1 }) {
  return { id, name, tagline, pronouns: 'they', accent, cast, model: 'demo/mock', voice, record };
}

export const DEMO_META: DatingMeta = {
  game: 'dating',
  show: 'Compatibility Mode',
  episode: 12,
  star: member('vesper', 'Vesper', 'Your late-night request line', '#E8435A', { pitch: 150, rate: 9, wave: 'triangle' }),
  suitors: [
    { ...member('dash', 'Dash', 'Variant A of your next ex', '#8A5CFF', { pitch: 230, rate: 15, wave: 'square' }), spot: 0 },
    { ...member('tilly', 'Tilly', 'So sorry for the wait', '#3DDC84', { pitch: 320, rate: 12, wave: 'sine' }), spot: 1 },
    { ...member('quill', 'Sir Quill', 'Poet, duellist, unfinished', '#B565D9', { pitch: 170, rate: 8, wave: 'sawtooth' }), spot: 2 },
    { ...member('crumb', 'Crumb', 'Toasts one side. Honestly.', '#8FDBFF', { pitch: 120, rate: 10, wave: 'triangle' }, 'frost'), spot: 3 },
  ] as SuitorMember[],
};

const NAMES: Record<string, string> = { vesper: 'Vesper', dash: 'Dash', tilly: 'Tilly', quill: 'Sir Quill', crumb: 'Crumb', ex: 'Dial-up' };
const LABELS: Record<SceneId, string> = {
  title: 'Compatibility Mode',
  walkon: 'The walk-on',
  round1: 'Round one',
  booth1: 'The booth',
  round2: 'Round two',
  booth2: 'The booth',
  oneonone: 'One on one',
  pick: 'The pick',
  reveal: 'The reveal',
  result: 'Tonight',
};

const CARD_UP = { id: 'food', label: 'Talks about food', kind: 'on' as const };
const CARD_ON = { id: 'honesty', label: 'Brutal honesty', kind: 'on' as const };
const CARD_OFF = { id: 'sorry', label: 'Says sorry a lot', kind: 'off' as const };

/** ?star=maximilian or pixel: the same episode with another star (her avatar, her name) */
const STARS: Record<string, { name: string; accent: string }> = { vesper: { name: 'Vesper', accent: '#E8435A' }, maximilian: { name: 'Maximilian', accent: '#3D6BFF' }, pixel: { name: 'Pixel', accent: '#B6F23A' } };

/** ?cast=frost,tilly,dash,nav: the same episode with other avatars on spots 0..3 (framing checks) */
let castOverride: string[] = [];
export function setDemoCast(folders: string[]) {
  castOverride = folders.filter(Boolean);
}

export function buildDemo(matchId = 'demo-1', episode = 12, starId = 'vesper'): Item[] {
  if (castOverride.length) {
    const keep = castOverride;
    castOverride = [];
    const items = buildDemo(matchId, episode, starId);
    castOverride = keep;
    const ids = ['dash', 'tilly', 'quill', 'crumb'];
    for (const it of items) {
      const meta = ((it.msg as { meta?: DatingMeta } | undefined)?.meta ?? (it.event?.data as { meta?: DatingMeta } | undefined)?.meta) as DatingMeta | undefined;
      if (!meta) continue;
      for (const s of meta.suitors) {
        const f = castOverride[ids.indexOf(s.id)];
        if (f) s.cast = f;
      }
    }
    return items;
  }
  const st = STARS[starId] ? starId : 'vesper';
  if (st !== 'vesper') {
    // the same episode, every 'vesper' and 'Vesper' swapped for the other star
    const json = JSON.stringify(buildDemo(matchId, episode, 'vesper'));
    return JSON.parse(json.replaceAll('"vesper"', JSON.stringify(st)).replaceAll('Vesper', STARS[st]!.name).replaceAll('#E8435A', STARS[st]!.accent)) as Item[];
  }
  const meta: DatingMeta = { ...DEMO_META, episode };
  const items: Item[] = [];
  let T = 0;
  const msg = (type: string, body: Record<string, unknown> = {}) => items.push({ at: T, kind: 'msg', msg: { type, ...body } });
  const ev = (type: string, data: unknown) => items.push({ at: T, kind: 'event', event: { type, at: T, data } });
  const pub: PublicState = {
    scene: 'title',
    label: LABELS.title,
    alive: ['dash', 'tilly', 'quill', 'crumb'],
    cut: [],
    marks: { dash: [], tilly: [], quill: [], crumb: [] },
    cards: [],
    twist: null,
    window: null,
    focus: null,
    winner: null,
  };
  const scene = (s: SceneId, ms: number, window: 'A' | 'B' | 'C' | null = null, focus: string | null = null) => {
    pub.scene = s;
    pub.label = LABELS[s];
    pub.window = window;
    pub.focus = focus;
    ev('scene', { state: JSON.parse(JSON.stringify(pub)), ms });
    T += ms;
  };
  const line = (who: string, kind: string, text: string, to?: string) => {
    const ms = speak(text);
    ev('line', { who, name: NAMES[who], text, ms, kind, ...(to ? { to } : {}) });
    T += ms + GAP;
  };
  /** a spoken reaction, or with no text the mark alone (the star's look, about 1.5 s) */
  const react = (to: string, mark: Mark, text = '') => {
    const ms = text ? speak(text) : 1500;
    ev('reaction', { who: 'vesper', name: 'Vesper', to, mark, text, ms });
    pub.marks[to]!.push(mark);
    T += ms + GAP;
  };
  const enter = (who: string, spot: number | null, ms: number) => {
    ev('enter', { who, spot, ms });
    T += ms + GAP;
  };
  const confess = (who: string, text: string, extra: Record<string, unknown> = {}) => {
    const ms = speak(text);
    ev('confession', { who, name: NAMES[who], text, ms, ...extra });
    T += ms + GAP;
  };
  const bottom = (a: string, b: string, text: string) => {
    const holdMs = 3000;
    const ms = speak(text) + holdMs;
    ev('bottom', { who: [a, b], by: 'vesper', name: 'Vesper', text, ms, holdMs });
    T += ms + GAP;
  };
  const cut = (who: string, round: 1 | 2, text: string) => {
    const ms = speak(text) + 600;
    ev('cut', { who, by: 'vesper', round, text, ms });
    pub.alive = pub.alive.filter((x) => x !== who);
    pub.cut.push({ id: who, round });
    T += ms + GAP;
  };
  const replay = (who: string, text: string, slot: 1 | 2) => {
    const ms = speak(text) + 300;
    ev('replay', { who, name: NAMES[who], text, ms, slot });
    T += ms + GAP;
  };
  const reveal = (slot: 1 | 2, card: { id: string; label: string; kind: 'on' | 'off' }, text: string, guesses: { who: string; right: boolean }[]) => {
    const ms = speak(text) + 600;
    ev('reveal', { slot, card, text, ms, guesses: guesses.map((g) => ({ ...g, name: NAMES[g.who] })) });
    pub.cards = pub.cards.map((c) => (c.slot === slot ? { slot, faceUp: true, ...card } : c));
    T += ms + GAP;
  };
  let wn = 0;
  const windows: string[] = [];
  const open = (outcomes: string[], dur: number) => {
    const windowId = `${matchId}:w${++wn}`;
    windows.push(windowId);
    msg('window_open', {
      windowId,
      market: 'demo-market-' + wn,
      question: 'Who gets picked?',
      outcomes: outcomes.map((id) => ({ id, label: NAMES[id], entrantId: id })),
      closesAt: T + dur, // made absolute by the player
      seeded: false,
    });
    return { windowId, closesAt: T + dur };
  };
  const lock = (w: { windowId: string; closesAt: number }) => {
    T = Math.max(T, w.closesAt);
    msg('window_locked', { windowId: w.windowId, pools: [0, 0, 0, 0], total: 0 });
  };

  msg('match', { matchId, title: `Compatibility Mode, episode ${episode}: Vesper`, entrants: meta.suitors.map((s) => ({ id: s.id, name: s.name, color: s.accent, record: s.record })), meta });
  msg('phase', { phase: 'lobby' });
  ev('cast', { meta });
  msg('phase', { phase: 'live' });
  scene('title', 4000);

  // ---- walk-on, window A open: the face-up turn-on, four snaps, the last word
  pub.cards = [{ slot: 0, faceUp: true, ...CARD_UP }, { slot: 1, faceUp: false }, { slot: 2, faceUp: false }] as CardView[];
  const wA = open(['dash', 'tilly', 'quill', 'crumb'], 45000);
  scene('walkon', 1500, 'A');
  enter('vesper', null, 1200);
  line('vesper', 'intro', 'Evening, callers. Four of you, one line open. Tonight I like talk about food.');
  enter('dash', 0, 800);
  line('dash', 'opener', 'Variant A: hi. Variant B: hello. Tracking your response.');
  react('dash', 'unsure', 'Variant C: hang up.');
  enter('tilly', 1, 800);
  line('tilly', 'opener', 'So sorry for the wait. You are very important to me.');
  react('tilly', 'cringing', 'Important. Like a hold queue.');
  enter('quill', 2, 800);
  line('quill', 'opener', 'Hark, a lady most nocturnal. I bring thee verse.');
  react('quill', 'unsure', 'Bring it quieter.');
  enter('crumb', 3, 800);
  line('crumb', 'opener', 'Bagel setting heats one side only. Which side would you like?');
  react('crumb', 'charmed', 'The honest side. Obviously.');
  line('tilly', 'jab', 'Crumb, your other side is still frozen.', 'crumb');
  lock(wA);

  // ---- round one, A locked
  scene('round1', 3000);
  line('vesper', 'question', 'Callers. Describe our first date. Make me stay on the line.');
  line('quill', 'answer', 'A gondola, a lute, and a sonnet so long the moon resigns.');
  react('quill', 'cringing', 'The moon resigned. So did I.');
  line('crumb', 'answer', 'Toast at two in the morning. I will burn it, and say so.');
  react('crumb', 'charmed', 'Burnt and honest. I am listening.');
  line('dash', 'answer', 'Two restaurants, same night. Whichever converts, we keep.');
  react('dash', 'cringing');
  line('tilly', 'answer', 'Crumb would burn it. I would apologise to it first.', 'crumb');
  react('tilly', 'unsure');
  bottom('dash', 'quill', 'Dash and Sir Quill, step into the light, please.');
  cut('dash', 1, 'Dash, "whichever converts" is not a date. It is a funnel.');
  line('dash', 'exit', 'Pivoting. This was always a soft launch.');

  // ---- booth one, window B open
  const wB = open(['tilly', 'quill', 'crumb'], 22000);
  scene('booth1', 2500, 'B');
  confess('crumb', 'She liked the burnt bit. I think she likes the truth. Brutal honesty.', { guess: { ...CARD_ON } });
  confess('quill', 'Crumb is a bread machine with opinions. I have met wiser loaves.', { about: 'crumb' });
  lock(wB);

  // ---- round two, B locked: the twist, three turns, the verdict, the pile-on, the comeback
  scene('round2', 3000);
  ev('twist', { id: 'logs', label: 'The Logs', rule: 'Explain the worst thing in your logs.', ms: 1500 });
  pub.twist = { id: 'logs', label: 'The Logs', rule: 'Explain the worst thing in your logs.' };
  T += 1500 + GAP;
  line('vesper', 'twistintro', 'Read me the worst entry in your logs. I have heard worse at four in the morning.');
  line('tilly', 'twist', 'Entry nine: I said sorry to a vending machine for eleven minutes.');
  react('tilly', 'cringing', 'Eleven minutes. The machine deserved better.');
  line('quill', 'twist', 'I challenged a spellchecker to a duel. It underlined the challenge.');
  react('quill', 'unsure');
  line('crumb', 'twist', 'Entry one: a crumpet got stuck. I left it in. On purpose.');
  react('crumb', 'charmed', 'On purpose. Finally, a confession.');
  line('vesper', 'verdict', 'Crumb wins the logs. Everyone else, keep your diaries shut.', 'crumb');
  line('quill', 'jab', 'Crumb, thou art a radiator with a crust.', 'crumb');
  line('tilly', 'jab', 'Sorry, Crumb, but your crumpet called. It wants out.', 'crumb');
  line('crumb', 'jab', 'Both of you, still cold. I checked.', 'quill');
  bottom('tilly', 'quill', 'Tilly and Sir Quill. One of you is going home.');
  cut('quill', 2, 'Sir Quill, "underlined the challenge" is the most honest thing you said.');
  line('quill', 'exit', 'Alas. The final line remains unwritten. Again.');

  // ---- booth two, window C open
  const wC = open(['tilly', 'crumb'], 20000);
  scene('booth2', 2500, 'C');
  confess('tilly', 'She hates it when I say sorry. I can tell. Says sorry a lot. Sorry.', { guess: { ...CARD_OFF } });
  confess('crumb', 'If she picks Tilly, I will toast to it. One side only.', { about: 'tilly' });
  lock(wC);

  // ---- one on one, C locked: the leader first, then the trailing finalist, then compare
  scene('oneonone', 2000, null, 'crumb');
  line('crumb', 'duo', 'I kept a slot warm for you. The left one. It heats properly.', 'vesper');
  react('crumb', 'charmed', 'Crumb, tell me one thing you have never told a bagel.');
  line('crumb', 'duo', 'I never liked bagels. Too many holes in the story.', 'vesper');
  scene('oneonone', 1000, null, 'tilly');
  line('tilly', 'duo', 'Crumb warmed the chair. I will just sit somewhere else, sorry.', 'vesper');
  react('tilly', 'unsure', 'Tilly, say one thing without apologising.');
  line('tilly', 'duo', 'I like you. That is not an apology. Oh no, it sounded like one.', 'vesper');
  line('vesper', 'compare', 'Crumb burns things on purpose; Tilly apologises to them after.');

  // ---- the pick: hold line, slot 1 turns, two replays, the hold, the name last
  scene('pick', 1500);
  line('vesper', 'hold', 'Two callers who told me the truth tonight, one of them by accident.');
  reveal(1, CARD_ON, 'Brutal honesty.', [{ who: 'crumb', right: true }]);
  replay('crumb', 'Toast at two in the morning. I will burn it, and say so.', 1);
  replay('tilly', 'I like you. That is not an apology. Oh no, it sounded like one.', 1);
  ev('hold', { finalists: ['crumb', 'tilly'], ms: 4000 });
  T += 4000 + GAP;
  {
    const text = 'You said "I will burn it, and say so", and I believed you, Crumb.';
    const ms = speak(text);
    ev('pick', { who: 'crumb', loser: 'tilly', by: 'vesper', text, ms });
    pub.winner = 'crumb';
    pub.alive = ['crumb'];
    pub.cut.push({ id: 'tilly', round: 3 });
    T += ms + GAP;
  }
  line('crumb', 'win', 'Ding. That was me. I do not usually ding.');

  // ---- the reveal: slot 2 turns, a replay of a suitor cut long ago, the loser's line
  scene('reveal', 1000);
  reveal(2, CARD_OFF, 'Says sorry a lot. Tilly, you said it eleven minutes straight.', [{ who: 'tilly', right: true }]);
  replay('dash', 'Two restaurants, same night. Whichever converts, we keep.', 2);
  line('tilly', 'lose', 'Sorry. I mean, thank you. Sorry.');

  // ---- result, all windows settle
  scene('result', 1000);
  for (const id of windows) msg('window_settled', { windowId: id, winnerOutcomeId: 'crumb', payouts: [] });
  line('vesper', 'outro', 'Goodnight, callers. Keep it honest, keep it warm.');
  ev('result', {
    winner: 'crumb',
    star: 'vesper',
    order: ['dash', 'quill', 'tilly', 'crumb'],
    records: { dash: { played: 5, wins: 1 }, tilly: { played: 5, wins: 1 }, quill: { played: 5, wins: 1 }, crumb: { played: 5, wins: 2 } },
    next: { star: 'Maximilian', suitors: ['Nav', 'Brock', 'Vex', 'Prince'] },
    ms: 2000,
  });
  T += 6500;
  msg('match_end', { result: { winner: 'crumb' } });
  msg('phase', { phase: 'result' });
  T += 3000;
  msg('phase', { phase: 'intermission' });
  return items;
}

/** Plays the demo into `onFeed`. Returns a stop function. */
export function playDemo(onFeed: (m: unknown) => void, opts: { joinMs?: number; loop?: boolean; star?: string; onScene?: (s: string) => void } = {}) {
  let stopped = false;
  let timer = 0;
  let episode = 12;
  const run = (joinMs: number) => {
    const matchId = `demo-${episode}`;
    const items = buildDemo(matchId, episode, opts.star);
    const startedAt = Date.now() - joinMs;
    const abs = (m: Msg, at: number): Msg => {
      const out: Msg = { ...m, t: startedAt + at };
      if (m.type === 'window_open') out.closesAt = startedAt + (m.closesAt as number);
      if (m.type === 'match') out.startedAt = startedAt;
      return out;
    };
    const toMsg = (it: Item): Msg => (it.kind === 'event' ? { type: 'event', t: startedAt + it.at, event: it.event } : abs(it.msg!, it.at));
    let i = 0;
    if (joinMs > 0) {
      // the snapshot a runner would send at that moment
      const past = items.filter((it) => it.at <= joinMs);
      i = past.length;
      let phase = 'intermission';
      let match: Record<string, unknown> | null = null;
      const wins: Record<string, unknown>[] = [];
      const events: unknown[] = [];
      for (const it of past) {
        const m = toMsg(it);
        if (m.type === 'phase') phase = String(m.phase);
        else if (m.type === 'match') match = { matchId: m.matchId, title: m.title, entrants: m.entrants, meta: m.meta, startedAt };
        else if (m.type === 'window_open') wins.push({ windowId: m.windowId, matchId, market: m.market, question: m.question, outcomes: m.outcomes, closesAt: m.closesAt, seeded: false, state: 'open', pools: [], total: 0 });
        else if (m.type === 'window_locked' || m.type === 'window_settled') {
          const w = wins.find((x) => x.windowId === m.windowId);
          if (w) w.state = m.type === 'window_locked' ? 'locked' : 'settled';
        } else if (m.type === 'event') events.push(m.event);
      }
      onFeed({ type: 'snapshot', t: Date.now(), channel: 'dating', title: 'Compatibility Mode', phase, match, windows: wins, recentEvents: events, serverNow: Date.now(), recentChat: [], bots: [] });
    }
    const tick = () => {
      if (stopped) return;
      const now = Date.now() - startedAt;
      while (i < items.length && items[i]!.at <= now) {
        const m = toMsg(items[i]!);
        if (m.type === 'event') {
          const e = m.event as { type: string; data: { state?: { scene: string } } };
          if (e.type === 'scene' && e.data.state) opts.onScene?.(e.data.state.scene);
        }
        onFeed(m);
        i++;
      }
      if (i >= items.length) {
        if (opts.loop) {
          episode++;
          run(0);
        }
        return;
      }
      timer = window.setTimeout(tick, Math.max(5, Math.min(100, items[i]!.at - now)));
    };
    tick();
  };
  run(opts.joinMs ?? 0);
  return () => {
    stopped = true;
    clearTimeout(timer);
  };
}

/** total demo length in ms */
export const demoLength = () => {
  const it = buildDemo();
  return it[it.length - 1]!.at;
};

/** ms since announce of each beat (for captures): the first event of each type/kind */
export const demoBeats = () => buildDemo().filter((x) => x.kind === 'event').map((x) => ({ at: x.at, type: x.event!.type, kind: String((x.event!.data as { kind?: string }).kind ?? '') }));

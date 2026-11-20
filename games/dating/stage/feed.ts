// Raw feed messages in, typed calls out. Keeps the ShowState (cast, latest PublicState, windows,
// phase) and knows how to rebuild it from a snapshot. Pure bookkeeping: no three.js, no DOM.
//
// Envelopes (runner/src/hub.ts, runner/src/show.ts): snapshot, match, phase, window_open, pools,
// window_locked, window_settled, window_void, event ({ type: 'event', t, event: GameEvent }),
// match_end, chat. Every message carries `t` (server ms).
import type {
  CardView,
  EvBottom,
  EvReplay,
  DatingMeta,
  EvCast,
  EvConfession,
  EvCut,
  EvEnter,
  EvHold,
  EvLine,
  EvPick,
  EvReaction,
  EvResult,
  EvReveal,
  EvScene,
  EvTwist,
  PublicState,
} from '../show/types.ts';

export type DatingEvent =
  | { type: 'cast'; at: number; data: EvCast }
  | { type: 'scene'; at: number; data: EvScene }
  | { type: 'enter'; at: number; data: EvEnter }
  | { type: 'line'; at: number; data: EvLine }
  | { type: 'reaction'; at: number; data: EvReaction }
  | { type: 'confession'; at: number; data: EvConfession }
  | { type: 'twist'; at: number; data: EvTwist }
  | { type: 'bottom'; at: number; data: EvBottom }
  | { type: 'cut'; at: number; data: EvCut }
  | { type: 'replay'; at: number; data: EvReplay }
  | { type: 'hold'; at: number; data: EvHold }
  | { type: 'pick'; at: number; data: EvPick }
  | { type: 'reveal'; at: number; data: EvReveal }
  | { type: 'result'; at: number; data: EvResult };

const KNOWN = new Set(['cast', 'scene', 'enter', 'line', 'reaction', 'confession', 'twist', 'bottom', 'cut', 'hold', 'replay', 'pick', 'reveal', 'result']);

export type WindowPhase = 'open' | 'locked' | 'settled' | 'void';
export interface WindowInfo {
  id: string;
  letter: 'A' | 'B' | 'C' | null;
  state: WindowPhase;
  /** server ms */
  closesAt: number;
  /** server ms, best known */
  openedAt: number;
}

export interface ShowState {
  matchId: string | null;
  /** server ms of announce; event `at` is relative to it */
  startedAt: number;
  meta: DatingMeta | null;
  phase: string;
  pub: PublicState;
  /** cast ids that have walked on */
  entered: Set<string>;
  /** cut suitors that have walked off */
  gone: Set<string>;
  windows: WindowInfo[];
  /** server clock minus local clock, ms */
  serverOffset: number;
  ended: boolean;
}

export interface CatchUp {
  ev: DatingEvent;
  /** ms already elapsed of this event when we joined */
  elapsed: number;
}

export interface FeedSink {
  /** draw the whole picture from state, instantly (snapshot, new match, new cast) */
  rebuild(s: ShowState, inProgress: CatchUp[]): void;
  /** a live event, state already updated */
  event(ev: DatingEvent, s: ShowState): void;
  windowChange(s: ShowState, w: WindowInfo): void;
  phase(s: ShowState): void;
  matchEnd(s: ShowState): void;
}

export function emptyPublic(meta: DatingMeta | null): PublicState {
  return {
    scene: 'title',
    label: '',
    alive: meta ? [...meta.suitors].sort((a, b) => a.spot - b.spot).map((s) => s.id) : [],
    cut: [],
    marks: {},
    cards: [0, 1, 2].map((slot) => ({ slot: slot as 0 | 1 | 2, faceUp: false })),
    twist: null,
    window: null,
    focus: null,
    winner: null,
  };
}

function clonePub(p: PublicState): PublicState {
  return {
    ...p,
    alive: [...(p.alive ?? [])],
    cut: (p.cut ?? []).map((c) => ({ ...c })),
    marks: Object.fromEntries(Object.entries(p.marks ?? {}).map(([k, v]) => [k, [...v]])),
    cards: (p.cards ?? []).map((c) => ({ ...c })) as CardView[],
    twist: p.twist ? { ...p.twist } : null,
  };
}

export function freshState(): ShowState {
  return {
    matchId: null,
    startedAt: 0,
    meta: null,
    phase: 'intermission',
    pub: emptyPublic(null),
    entered: new Set(),
    gone: new Set(),
    windows: [],
    serverOffset: 0,
    ended: false,
  };
}

const isMeta = (m: unknown): m is DatingMeta =>
  !!m && typeof m === 'object' && Array.isArray((m as DatingMeta).suitors) && !!(m as DatingMeta).star;

const spokenMs = (ev: DatingEvent): number => {
  const d = ev.data as { ms?: number };
  return typeof d?.ms === 'number' ? d.ms : 0;
};

/**
 * Apply one event's lasting effect to the state. `nowAt` (ms since announce) lets a snapshot
 * replay decide whether a walk-off has finished; live play passes Infinity.
 */
export function reduce(s: ShowState, ev: DatingEvent, nowAt = Infinity) {
  const p = s.pub;
  switch (ev.type) {
    case 'cast':
      if (isMeta(ev.data?.meta)) s.meta = ev.data.meta;
      break;
    case 'scene': {
      if (!ev.data?.state) break;
      s.pub = clonePub(ev.data.state);
      if (s.pub.scene !== 'title' && s.pub.scene !== 'walkon' && s.meta) {
        s.entered.add(s.meta.star.id);
        for (const x of s.meta.suitors) s.entered.add(x.id);
      }
      for (const c of s.pub.cut) if (c.round < 3 || s.pub.scene === 'result') s.gone.add(c.id);
      break;
    }
    case 'enter':
      s.entered.add(ev.data.who);
      break;
    case 'reaction':
      (p.marks[ev.data.to] ??= []).push(ev.data.mark);
      break;
    case 'twist':
      p.twist = { id: ev.data.id, label: ev.data.label, rule: ev.data.rule };
      break;
    case 'cut':
      p.alive = p.alive.filter((x) => x !== ev.data.who);
      if (!p.cut.some((c) => c.id === ev.data.who)) p.cut.push({ id: ev.data.who, round: ev.data.round });
      break;
    case 'line':
      if ((ev.data.kind === 'exit' || ev.data.kind === 'lose') && ev.at + ev.data.ms <= nowAt) s.gone.add(ev.data.who);
      break;
    case 'pick':
      p.winner = ev.data.who;
      p.alive = p.alive.filter((x) => x !== ev.data.loser);
      if (!p.cut.some((c) => c.id === ev.data.loser)) p.cut.push({ id: ev.data.loser, round: 3 });
      break;
    case 'reveal': {
      const c = ev.data.card;
      p.cards = p.cards.map((x) => (x.slot === ev.data.slot ? { slot: x.slot, faceUp: true, kind: c.kind, id: c.id, label: c.label } : x));
      break;
    }
    case 'result':
      p.winner = ev.data.winner;
      break;
    default:
      break;
  }
}

type Msg = { type?: string; t?: number; [k: string]: unknown };

export class Feed {
  state: ShowState = freshState();
  private sink: FeedSink;

  constructor(sink: FeedSink) {
    this.sink = sink;
  }

  serverNow() {
    return Date.now() + this.state.serverOffset;
  }

  /** ms since announce, on the server clock */
  matchNow() {
    return this.state.startedAt ? this.serverNow() - this.state.startedAt : 0;
  }

  currentWindow(): WindowInfo | null {
    const ws = this.state.windows;
    return ws.length ? ws[ws.length - 1]! : null;
  }

  private letterFor(i: number): 'A' | 'B' | 'C' | null {
    return (['A', 'B', 'C'] as const)[i] ?? null;
  }

  private noteClock(m: Msg) {
    if (typeof m.t === 'number') {
      const off = m.t - Date.now();
      // latency only ever makes t look early, so keep the largest estimate seen since the snapshot
      if (off > this.state.serverOffset) this.state.serverOffset = off;
    }
  }

  onFeed(raw: unknown) {
    const m = raw as Msg;
    if (!m || typeof m !== 'object' || typeof m.type !== 'string') return;
    const s = this.state;
    switch (m.type) {
      case 'snapshot':
        this.fromSnapshot(m);
        return;
      case 'match': {
        const phase = s.phase;
        const offset = s.serverOffset;
        this.state = freshState();
        this.state.serverOffset = offset;
        this.state.phase = phase === 'intermission' ? 'lobby' : phase;
        this.state.matchId = String(m.matchId ?? '');
        this.state.startedAt = typeof m.startedAt === 'number' ? m.startedAt : (m.t ?? Date.now());
        this.state.meta = isMeta(m.meta) ? m.meta : null;
        this.state.pub = emptyPublic(this.state.meta);
        this.noteClock(m);
        this.sink.rebuild(this.state, []);
        return;
      }
      case 'phase':
        this.noteClock(m);
        s.phase = String(m.phase ?? s.phase);
        this.sink.phase(s);
        return;
      case 'window_open': {
        this.noteClock(m);
        const w: WindowInfo = {
          id: String(m.windowId),
          letter: this.letterFor(s.windows.length),
          state: 'open',
          closesAt: Number(m.closesAt) || this.serverNow(),
          openedAt: typeof m.t === 'number' ? m.t : this.serverNow(),
        };
        s.windows.push(w);
        this.sink.windowChange(s, w);
        return;
      }
      case 'window_locked':
      case 'window_settled':
      case 'window_void': {
        this.noteClock(m);
        const w = s.windows.find((x) => x.id === m.windowId);
        if (!w) return;
        w.state = m.type === 'window_locked' ? 'locked' : m.type === 'window_settled' ? 'settled' : 'void';
        this.sink.windowChange(s, w);
        return;
      }
      case 'event': {
        this.noteClock(m);
        const ev = m.event as DatingEvent | undefined;
        if (!ev || !KNOWN.has(ev.type)) return;
        if (ev.type === 'cast') {
          const meta = ev.data?.meta;
          const same = s.meta && isMeta(meta) && sameCast(s.meta, meta);
          reduce(s, ev);
          if (!same) {
            s.pub = emptyPublic(s.meta);
            this.sink.rebuild(s, []);
            return;
          }
        } else reduce(s, ev);
        this.sink.event(ev, s);
        return;
      }
      case 'match_end':
        this.noteClock(m);
        s.ended = true;
        this.sink.matchEnd(s);
        return;
      default:
        return; // pools, chat and anything else: not the stage's business
    }
  }

  private fromSnapshot(m: Msg) {
    const st = freshState();
    st.serverOffset = typeof m.serverNow === 'number' ? m.serverNow - Date.now() : 0;
    st.phase = String(m.phase ?? 'intermission');
    const match = m.match as { matchId?: string; startedAt?: number; meta?: unknown; result?: unknown } | null;
    const inProgress: CatchUp[] = [];
    if (match) {
      st.matchId = String(match.matchId ?? '');
      st.startedAt = typeof match.startedAt === 'number' ? match.startedAt : Date.now() + st.serverOffset;
      st.meta = isMeta(match.meta) ? match.meta : null;
      st.pub = emptyPublic(st.meta);
      st.ended = match.result !== undefined;
      const wins = Array.isArray(m.windows) ? (m.windows as { windowId: string; closesAt: number; state: WindowPhase }[]) : [];
      st.windows = wins.map((w, i) => ({
        id: w.windowId,
        letter: this.letterFor(i),
        state: w.state,
        closesAt: w.closesAt,
        openedAt: w.closesAt - [45000, 22000, 20000][i]!,
      }));
      const evs = (Array.isArray(m.recentEvents) ? m.recentEvents : []) as DatingEvent[];
      const nowAt = (typeof m.serverNow === 'number' ? m.serverNow : Date.now()) - st.startedAt;
      // If the event list was trimmed, the last scene still carries the whole public state.
      let lastScene: DatingEvent | null = null;
      let lastSpoken: DatingEvent | null = null;
      for (const ev of evs) {
        if (!ev || !KNOWN.has(ev.type)) continue;
        reduce(st, ev, nowAt);
        if (ev.type === 'scene') {
          lastScene = ev;
          lastSpoken = null;
        } else if (ev.type !== 'cast' && ev.type !== 'enter') lastSpoken = ev;
      }
      for (const ev of [lastScene, lastSpoken]) {
        if (!ev) continue;
        const elapsed = nowAt - ev.at;
        if (elapsed >= 0 && elapsed < spokenMs(ev)) inProgress.push({ ev, elapsed });
      }
    }
    this.state = st;
    this.sink.rebuild(st, inProgress);
  }
}

function sameCast(a: DatingMeta, b: DatingMeta) {
  return a.star.id === b.star.id && a.episode === b.episode && a.suitors.map((s) => s.id).join() === b.suitors.map((s) => s.id).join();
}

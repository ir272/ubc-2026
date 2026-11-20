// Feed -> ShowState. Pure: no DOM, no clock of its own.
//
// `reduce(r, msg)` folds one platform feed message into a Reduced record (mutating it in place and
// returning it). `showStateAt(r, now)` turns that record into the ShowState the stage modules read,
// for a given moment on the show clock (ms since announce). Phase times come from the game events'
// `at`, so a viewer who joins late from a `snapshot` lands mid-phase at the right moment.
//
// Late join: a snapshot's recentEvents may have lost the early events. Every phase event and every
// `state` checkpoint carries `ctx`, so any one of them is enough to know the bots, picks and taunts.

import type { Ctx, Phase } from './events.ts';
import type { ShowState } from '../stage/api.ts';
import type { Plan, Side } from '../sim/types.ts';

export type WindowStateName = 'open' | 'locked' | 'settled' | 'void';

export interface WinRec {
  id: string;
  /** server epoch ms */
  closesAt: number;
  /** server ms when window_open was seen (null when known only from a snapshot) */
  openedT: number | null;
  /** planned length from the game event that names it (predictions / break_window) */
  durationMs: number | null;
  state: WindowStateName;
  winnerOutcomeId?: string;
}

export interface Reduced {
  matchId: string | null;
  /** server epoch ms of announce(); show ms = server ms - startedAt */
  startedAt: number | null;
  /** the platform's own phase: lobby | live | result | intermission */
  platformPhase: string | null;
  phase: Phase | 'idle';
  /** show ms when the phase began */
  phaseAt: number;
  phaseDurationMs: number;
  ctx: Ctx | null;
  picksRevealed: boolean;
  /** select: ms into the phase at which the picks flip (select_open.revealInMs), 0 when unknown */
  selectRevealMs: number;
  taunts: [string | null, string | null];
  tauntAt: [number, number];
  windows: WinRec[];
  /** the window the current phase is about (predictions / break_window), if named */
  phaseWindowId: string | null;
  plans: [Plan | null, Plan | null];
  planChangedAt: [number, number];
  lastKo: ShowState['lastKo'];
  cornerTalk: [string | null, string | null];
  result: ShowState['result'];
  /** the viewer's pick as an entrant id; mapped to a side through ctx */
  highlightId: string | null;
  /** at of the last game event seen */
  lastEventAt: number;
  /** count of game events folded in */
  events: number;
}

export function initialReduced(): Reduced {
  return {
    matchId: null,
    startedAt: null,
    platformPhase: null,
    phase: 'idle',
    phaseAt: 0,
    phaseDurationMs: 0,
    ctx: null,
    picksRevealed: false,
    selectRevealMs: 0,
    taunts: [null, null],
    tauntAt: [-1, -1],
    windows: [],
    phaseWindowId: null,
    plans: [null, null],
    planChangedAt: [-1, -1],
    lastKo: null,
    cornerTalk: [null, null],
    result: null,
    highlightId: null,
    lastEventAt: 0,
    events: 0,
  };
}

type Msg = { type?: unknown; t?: unknown; [k: string]: unknown };
type GameEv = { type: string; at: number; data?: any };

function resetMatch(r: Reduced): void {
  const keep = r.highlightId;
  const plat = r.platformPhase;
  Object.assign(r, initialReduced());
  r.highlightId = keep;
  r.platformPhase = plat;
}

/** Fold one feed message into r. Unknown messages are ignored. */
export function reduce(r: Reduced, raw: unknown): Reduced {
  if (!raw || typeof raw !== 'object') return r;
  const msg = raw as Msg;
  switch (msg.type) {
    case 'snapshot': {
      resetMatch(r);
      r.platformPhase = typeof msg.phase === 'string' ? msg.phase : null;
      const m = msg.match as { matchId?: string; startedAt?: number } | null;
      if (m) {
        r.matchId = m.matchId ?? null;
        r.startedAt = typeof m.startedAt === 'number' ? m.startedAt : null;
      }
      const wins = Array.isArray(msg.windows) ? (msg.windows as any[]) : [];
      for (const w of wins) {
        if (!w || typeof w.windowId !== 'string') continue;
        if (r.matchId && w.matchId && w.matchId !== r.matchId) continue;
        r.windows.push({
          id: w.windowId,
          closesAt: w.closesAt,
          openedT: null,
          durationMs: null,
          state: w.state ?? 'open',
          winnerOutcomeId: w.winnerOutcomeId,
        });
      }
      const evs = Array.isArray(msg.recentEvents) ? (msg.recentEvents as GameEv[]) : [];
      for (const e of evs) reduceEvent(r, e);
      return r;
    }
    case 'match': {
      if (msg.matchId !== r.matchId) resetMatch(r);
      r.matchId = (msg.matchId as string) ?? null;
      if (typeof msg.startedAt === 'number') r.startedAt = msg.startedAt;
      else if (typeof msg.t === 'number') r.startedAt = msg.t;
      return r;
    }
    case 'phase':
      r.platformPhase = typeof msg.phase === 'string' ? msg.phase : r.platformPhase;
      return r;
    case 'window_open': {
      const id = msg.windowId as string;
      let w = r.windows.find((x) => x.id === id);
      if (!w) {
        w = { id, closesAt: msg.closesAt as number, openedT: null, durationMs: null, state: 'open' };
        r.windows.push(w);
      }
      w.closesAt = msg.closesAt as number;
      w.openedT = typeof msg.t === 'number' ? msg.t : null;
      w.state = 'open';
      return r;
    }
    case 'window_locked':
      setWin(r, msg.windowId as string, 'locked');
      return r;
    case 'window_settled': {
      const w = setWin(r, msg.windowId as string, 'settled');
      if (w) w.winnerOutcomeId = msg.winnerOutcomeId as string;
      return r;
    }
    case 'window_void':
      setWin(r, msg.windowId as string, 'void');
      return r;
    case 'event':
      if (msg.event && typeof msg.event === 'object') reduceEvent(r, msg.event as GameEv);
      return r;
    default:
      return r;
  }
}

function setWin(r: Reduced, id: string, state: WindowStateName): WinRec | undefined {
  const w = r.windows.find((x) => x.id === id);
  if (w) w.state = state;
  return w;
}

function takeCtx(r: Reduced, ctx: Ctx | undefined): void {
  if (!ctx || typeof ctx !== 'object') return;
  r.ctx = ctx;
  if (ctx.picks) r.picksRevealed = true;
  if (ctx.taunts) {
    for (const s of [0, 1] as const) {
      if (r.taunts[s] == null && ctx.taunts[s]) r.taunts[s] = ctx.taunts[s];
    }
  }
}

function enter(r: Reduced, phase: Phase, at: number, durationMs: number): void {
  r.phase = phase;
  r.phaseAt = at;
  r.phaseDurationMs = durationMs > 0 ? durationMs : 0;
}

/** Fold one game event (the nested `event` of a feed message) into r. */
export function reduceEvent(r: Reduced, e: GameEv): Reduced {
  if (!e || typeof e.type !== 'string') return r;
  const at = typeof e.at === 'number' ? e.at : r.lastEventAt;
  const d = (e.data ?? {}) as any;
  r.lastEventAt = Math.max(r.lastEventAt, at);
  r.events++;
  takeCtx(r, d.ctx);
  switch (e.type) {
    case 'call':
      enter(r, 'call', at, d.durationMs);
      r.picksRevealed = !!r.ctx?.picks;
      break;
    case 'select_open':
      enter(r, 'select', at, d.durationMs);
      r.selectRevealMs = typeof d.revealInMs === 'number' && d.revealInMs > 0 ? d.revealInMs : 0;
      break;
    case 'picks':
      r.picksRevealed = true;
      break;
    case 'versus':
      enter(r, 'versus', at, d.durationMs);
      break;
    case 'taunt':
      if (d.side === 0 || d.side === 1) {
        r.taunts[d.side as Side] = String(d.text ?? '');
        r.tauntAt[d.side as Side] = at;
      }
      break;
    case 'predictions':
      enter(r, 'predictions', at, d.durationMs);
      r.phaseWindowId = d.windowId ?? null;
      noteWindowDuration(r, d.windowId, d.durationMs);
      break;
    case 'fight_start':
      enter(r, 'fight', at, 0);
      r.phaseWindowId = null;
      r.cornerTalk = [null, null];
      break;
    case 'plan':
      if (d.side === 0 || d.side === 1) {
        r.plans[d.side as Side] = d.plan ?? null;
        r.planChangedAt[d.side as Side] = at;
      }
      break;
    case 'life_lost':
      enter(r, 'break', at, d.durationMs);
      r.phaseWindowId = null;
      r.cornerTalk = [null, null];
      r.lastKo = { side: d.side, by: d.by, damage: d.damage, edge: d.edge, final: !!d.final };
      break;
    case 'corner_talk':
      if (d.side === 0 || d.side === 1) {
        r.cornerTalk[d.side as Side] = String(d.text ?? '');
        if (d.plan) {
          r.plans[d.side as Side] = d.plan;
          r.planChangedAt[d.side as Side] = at;
        }
      }
      break;
    case 'break_window':
      r.phaseWindowId = d.windowId ?? null;
      noteWindowDuration(r, d.windowId, d.durationMs);
      break;
    case 'fight_resume':
      enter(r, 'fight', at, 0);
      r.phaseWindowId = null;
      break;
    case 'match_end':
      enter(r, 'verdict', at, d.durationMs);
      r.phaseWindowId = null;
      r.result = {
        winner: d.winner,
        winnerId: d.winnerId,
        lives: d.lives,
        damage: d.damage,
        nextInMs: d.nextInMs ?? 0,
      };
      break;
    default:
      break;
  }
  return r;
}

function noteWindowDuration(r: Reduced, id: unknown, durationMs: unknown): void {
  if (typeof id !== 'string' || typeof durationMs !== 'number') return;
  const w = r.windows.find((x) => x.id === id);
  if (w) w.durationMs = durationMs;
  else r.windows.push({ id, closesAt: NaN, openedT: null, durationMs, state: 'open' });
}

/** show ms (since announce) for a server epoch ms */
export function serverToShow(r: Reduced, serverMs: number): number {
  return r.startedAt == null ? 0 : serverMs - r.startedAt;
}

/** which side an entrant id is on, through ctx */
export function sideOf(r: Reduced, entrantId: string | null): Side | null {
  if (!entrantId || !r.ctx) return null;
  const i = r.ctx.bots.findIndex((b) => b.id === entrantId);
  return i === 0 || i === 1 ? (i as Side) : null;
}

function pickWindow(r: Reduced): WinRec | null {
  const live = r.windows.filter((w) => w.state !== 'void');
  if (r.phase === 'predictions' || r.phase === 'break') {
    if (r.phaseWindowId) return live.find((w) => w.id === r.phaseWindowId) ?? null;
    // predictions joined before the event that names the window: the newest open one
    if (r.phase === 'predictions') return [...live].reverse().find((w) => w.state === 'open') ?? null;
    return null;
  }
  if (r.phase === 'verdict') return live.length ? live[live.length - 1] : null;
  return [...live].reverse().find((w) => w.state === 'open') ?? null;
}

/** The ShowState at show time `now` (ms since announce). */
export function showStateAt(r: Reduced, now: number): ShowState {
  const w = pickWindow(r);
  let window: ShowState['window'] = null;
  if (w && isFinite(w.closesAt)) {
    const closeShow = serverToShow(r, w.closesAt);
    const msLeft = Math.max(0, closeShow - now);
    const dur =
      w.durationMs ?? (w.openedT != null ? w.closesAt - w.openedT : Math.max(msLeft, 1));
    window = {
      id: w.id,
      msLeft: w.state === 'open' ? msLeft : 0,
      durationMs: dur,
      state: w.state === 'void' ? 'locked' : w.state,
    };
  }
  return {
    phase: r.phase,
    phaseMs: r.phase === 'idle' ? 0 : Math.max(0, now - r.phaseAt),
    phaseDurationMs: r.phaseDurationMs,
    ctx: r.ctx,
    picksRevealed: r.picksRevealed,
    selectRevealMs: r.selectRevealMs,
    taunts: [r.taunts[0], r.taunts[1]],
    tauntAt: [r.tauntAt[0], r.tauntAt[1]],
    window,
    plans: [r.plans[0], r.plans[1]],
    planChangedAt: [r.planChangedAt[0], r.planChangedAt[1]],
    lastKo: r.lastKo,
    cornerTalk: [r.cornerTalk[0], r.cornerTalk[1]],
    result: r.result,
    highlight: sideOf(r, r.highlightId),
  };
}

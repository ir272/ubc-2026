// Ringout feed events: everything the channel emits with show.emit({ type, at, data }).
// `at` is ms since announce(). The stage draws only from these (plus the platform's own
// snapshot / match / window_* messages). Frozen at the 16:00 checkpoint.
//
// Rule for joining mid-match: the stage reduces snapshot.recentEvents in order. The runner keeps
// only the last 500 events, so the early ones may be gone. Therefore every event that begins a
// phase carries `ctx` (the whole match context so far), and `state` checkpoints carry it too.
// A reducer that has seen any one ctx-bearing event can draw the right thing.

import type { FightHeader, FightState, FighterId, MoveId, Plan, PlanAt, Side, HitStrength } from '../sim/types.ts';

export interface BotCard {
  /** entrant id */
  id: string;
  /** bot display name, e.g. "Marlow" */
  name: string;
  /** model id as given in bots.json, e.g. "anthropic/claude-haiku-5.5" */
  model: string;
  /** short model label for the HUD, e.g. "Haiku 5.5" */
  modelLabel: string;
  /** side colour: side 0 is red, side 1 is blue (fixed), set by the channel */
  color: string;
  record: { played: number; wins: number };
}

export interface FighterCard {
  id: FighterId;
  name: string;
  role: string;
  blurb: string;
  stats: { power: number; speed: number; reach: number; weight: number; grab: number };
}

/** The match context. Grows as the show goes on; fields are absent until they are known. */
export interface Ctx {
  matchNo: number;
  /** side 0 and side 1 */
  bots: [BotCard, BotCard];
  roster: FighterCard[];
  picks?: [FighterId, FighterId];
  taunts?: [string, string];
  header?: FightHeader;
  /** lives left per side, as of this event */
  lives?: [number, number];
}

export type Phase =
  | 'call' // 1. the call
  | 'select' // 2a. the choosing: select screen, picks hidden then flipped
  | 'versus' // 2b. versus screen and taunts
  | 'predictions' // 3. window A open, fighters waiting on the deck
  | 'fight' // 4. the fight (including sudden death)
  | 'break' // 5. after a lost life: replay, corner talk, 15 s window
  | 'verdict'; // 6. winner, best knockout, payout beat, countdown

export interface FeedEvents {
  /** phase 1. durationMs = how long this phase is planned to last (same on all phase events) */
  call: { ctx: Ctx; durationMs: number };

  /** phase 2a. Picks are being made, hidden. revealInMs: when `picks` is due */
  select_open: { ctx: Ctx; durationMs: number; revealInMs: number };
  /** both picks flip together. ctx.picks is now set */
  picks: { ctx: Ctx };
  /** phase 2b */
  versus: { ctx: Ctx; durationMs: number };
  /** one per side, 10 words at most */
  taunt: { side: Side; text: string; audio?: string };

  /** phase 3. Window A is open (the platform also sends window_open). The stage shows the clock */
  predictions: { ctx: Ctx; windowId: string; durationMs: number };

  /** phase 4. Tick 0 of the fight happens at `startAt` (ms since announce), after the countdown */
  fight_start: { ctx: Ctx; startAt: number };
  /** a mind's new plan, scheduled for `tick`. Always emitted before the fight reaches that tick */
  plan: { side: Side; tick: number; plan: Plan; thoughtMs: number };
  /** checkpoint, about every 2 s of fight time. Self-sufficient: a joiner starts from the latest one */
  state: { ctx: Ctx; tick: number; at: number; s: FightState; hash: string };
  /** medium and stronger hits only, for the platform (the stage gets hits from its own replay of the sim) */
  hit: { tick: number; by: Side; to: Side; move: MoveId | 'projectile'; damage: number; total: number; strength: HitStrength };
  /** regulation time ran out */
  sudden_death: { tick: number };

  /** phase 5 begins. The sim stops at `tick` until fight_resume. final = that was the last life */
  life_lost: { ctx: Ctx; tick: number; side: Side; by: Side; damage: number; move: MoveId | 'projectile' | null; edge: 'left' | 'right' | 'top' | 'bottom'; final: boolean; durationMs: number };
  /** replay of ticks [from.tick, toTick] at `speed`. Self-sufficient: carries the state to start from */
  replay: { ctx: Ctx; from: { tick: number; s: FightState }; plans: PlanAt[]; toTick: number; speed: number; durationMs: number };
  /** one per side: the adjustment after the longer think, 12 words at most */
  corner_talk: { side: Side; text: string; plan: Plan; audio?: string };
  /** the 15 s window between lives is open */
  break_window: { windowId: string; durationMs: number };
  /** the fight goes on from `tick` at `startAt` (ms since announce) */
  fight_resume: { ctx: Ctx; tick: number; startAt: number };

  /** phase 6 */
  match_end: {
    ctx: Ctx;
    winner: Side;
    winnerId: string;
    tick: number;
    lives: [number, number];
    damage: [number, number];
    stats: FightState['stats'];
    bestKo: { from: { tick: number; s: FightState }; plans: PlanAt[]; toTick: number; by: Side } | null;
    durationMs: number;
    /** ms from this event until the next call is expected */
    nextInMs: number;
  };
}

export type FeedEventType = keyof FeedEvents;

export interface FeedEvent<K extends FeedEventType = FeedEventType> {
  type: K;
  at: number;
  data: FeedEvents[K];
}

/** Planned phase lengths (ms). The script may run a little over when a model is slow. */
const TIMING_DEFAULTS = {
  call: 10_000,
  select: 24_000,
  selectReveal: 16_000,
  versus: 16_000,
  predictions: 30_000,
  countdown: 3_500, // "3, 2, 1, go" before tick 0
  koHold: 2_600, // after life_lost: the live knockout (blast and call) plays before the replay starts
  koHoldFinal: 3_800, // the same hold after the knockout that ends the match (the bigger call needs longer)
  replay: 7_000,
  cornerTalk: 1_200, // the corner calls still go out in the feed, but the stage no longer shows their text, so no hold
  breakWindow: 15_000,
  resumeCountdown: 2_000,
  verdict: 20_000,
} as const;

export type TimingKey = keyof typeof TIMING_DEFAULTS;
export const TIMING: Record<TimingKey, number> = TIMING_DEFAULTS;

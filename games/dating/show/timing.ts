// Speaking pace and fixed beat lengths. Everything in ms at speed 1.

/** Words as the show counts them: whitespace tokens containing a letter or digit. */
export function words(text: string): number {
  return String(text ?? '')
    .split(/\s+/)
    .filter((w) => /[\p{L}\p{N}]/u.test(w)).length;
}

/** Time the stage takes to speak a line (SPEC: 700 + 310 per word). */
export function speakMs(text: string): number {
  return 700 + 310 * words(text);
}

/** Replaying a quote at the reveal: read pace, faster than speech. */
export function quoteMs(text: string): number {
  return 400 + 160 * words(text);
}

/** Silence after every spoken item. */
export const GAP = 250;

export const BEAT = {
  title: 4000, // scene 0, covers generation of intro + openers
  walkonCall: 1500,
  roundCall: 3000, // round title calls cover generation after a lock
  boothCall: 2500,
  oneOnOneCall: 2000,
  focusSwitch: 1000, // second finalist steps up
  pickCall: 1500,
  revealCall: 1000,
  resultCall: 1000,
  enterStar: 1200,
  enterSuitor: 800,
  twistCard: 1500,
  cutLight: 700, // added to the cut line: the light goes out
  pickBeat: 1000, // added to the pick line
  revealFlip: 600, // added to a reveal: the card turns
  hold: 4000, // the silent held pause before the name (FORMAT2)
  markOnly: 1000, // a reaction with the mark alone: the lamp, no words
  bottomHold: 3000, // silence after the star names the bottom two, before the cut
  replayCut: 400, // added to a replayed line: the cut to that suitor's face
  result: 2000,
  windowTail: 3000, // held wide shot at the end of a window before it locks
  /** most silence added after a beat inside a window (on top of GAP) */
  windowStretch: 2000,
  /** most a window's title call may grow to fill the window */
  callStretch: 3000,
  /** shortest a window's title call may get when its beats run long */
  minCall: 1500,
  /** most silence the pacer may add after an item (on top of GAP) */
  maxStretch: 1200,
  /** wait cap for a line that is due but not ready (show time) */
  waitCap: 6000,
} as const;

/**
 * Scene duration targets (ms) the pacer stretches gaps toward. FORMAT2's table sums to 6:08, over the
 * six minutes, so the rounds, the one on one and the pick sit a little under it: an episode runs about
 * 5:40 to 5:50 with real lines and at most 6:00 with every line at its word limit (tools/match.ts --full).
 */
export const TARGET = {
  walkon: 45000, // window A, at least this long
  round1: 69000,
  booth1: 22000, // window B, at least this long
  round2: 79000,
  booth2: 20000, // window C, at least this long
  oneonone: 46000,
  pick: 34000,
  reveal: 16000,
  result: 8000,
} as const;

/**
 * Optional beats (FORMAT2: "If a beat must go to hold six minutes, drop the walk-on jab first, then
 * the third spoken reaction in each round").
 */
export const VOICES = {
  /** the walk-on's last word: the coldest snap jabs the warmest */
  walkonJab: false,
  /** a third spoken reaction in round one (the fourth suitor's reply to the leader) */
  third: false,
};

/**
 * A window ends on a held wide shot (BEAT.windowTail of silence before it locks; the stage's studio
 * clock runs out). Gap checks treat that as a beat, not dead air.
 */
export function isHeldTail(g: { to: string; ms: number }): boolean {
  return g.to === 'window_locked' && g.ms <= BEAT.windowTail + 1000;
}

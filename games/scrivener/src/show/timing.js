// Show timings in ms. One table so the channel, the harness and the stage agree.
// The stage only uses these for drawing; the channel is what actually waits.

export const T = {
  call: 10000,

  temperReveal: 6500,   // choosing opens on the boss's temper
  pickDeal: 1500,       // three plates are dealt
  pickThinkMin: 1800,   // shortest a pick is weighed on screen
  pickThinkMax: 7500,   // a model that takes longer gets a default pick
  pickHold: 2500,       // the chosen plate and its reason are held
  choosingOut: 1800,

  tapeLead: 2200,       // the tape is up before predictions open
  tapeWindow: 30000,
  tapeAfterLock: 2800,  // "predictions closed", then the bell

  walkOn: 3500,         // the fighter stands before the boss, then the bell
  attemptWindow: 12000, // old feeds only: the per-go prediction that no longer opens
  bell: 1700,           // lock -> first tick of the fight
  decideMin: 1600,      // shortest a decision is shown
  decideTarget: 6000,
  decideMax: 10000,     // then the default move
  decideStamp: 1350,    // the chosen move is struck in before time resumes
  endHold: { death: 5200, kill: 6400, written: 4200 }, // the end card: the boss's bar drains to where the go left it
  noteHold: 1500,       // after the note to itself comes back
  noteMax: 6000,        // longest wait for a model's note

  pairWindow: 15000,    // "Who wins the match?" after each undecided pair
  pairAfterLock: 1200,

  verdict: 21000,
  verdictReplayAt: 2600,
  verdictLinesAt: 11500,
  sayMax: 7000,
  nextCountdown: 6000,
};

// Rough length of a whole match, for the README and sanity checks.
export function expectedMatchMs(attempts = 2, avgAttemptMs = 38000) {
  const choosing = T.temperReveal + 8 * (T.pickDeal + 3200 + T.pickHold) + T.choosingOut;
  const tape = T.tapeLead + T.tapeWindow + T.tapeAfterLock;
  const fight = attempts * (T.walkOn + T.bell + avgAttemptMs + 5200 + T.noteHold) + Math.floor((attempts - 1) / 2) * (T.pairWindow + T.pairAfterLock);
  return T.call + choosing + tape + fight + T.verdict;
}

// Mock decisions: the oracle plus a human error rate. Owner: sim. PURE (seeded rng only).
//
//   mockDecide(w, rng, { skill, fam }) -> { slot, slip }
//     skill: base error rate (0..1, default 0.5). fam: { attackId: familiarity } (optional,
//     read only; mockLearn updates it). Error = skill * 0.7^fam, halved for the Archivist.
//   mockLearn(fam, record)  grows familiarity after an attempt (exposure, and more from hurts)
//   mockThought(move, rng)  -> a short in-character line (<= 10 words)

import { rand } from '../core/rng.js';
import { evaluateOptions } from '../ai/oracle.js';
import { agentController } from '../ai/reflex.js';

export const MOCK_SKILL = 0.5;
const SLIP_T = 90; // slip temperature (oracle score units: 2 per hp taken, 1 per hp dealt)

export function mockErrorRate(w, { skill = MOCK_SKILL, fam = null } = {}) {
  const attackId = w.thinking ? w.thinking.attackId : w.boss.attackId;
  const f = (fam && fam[attackId]) || 0;
  return Math.max(0.04, skill * Math.pow(0.7, f) * (w.agent.stats.errorMul || 1));
}

export function mockDecide(w, rng, { skill = MOCK_SKILL, fam = null } = {}) {
  const opts = evaluateOptions(w, agentController);
  if (!opts.length) return { slot: 0, slip: false };
  const top = opts.filter((o) => o.score >= opts[0].score - 1);
  let slot = top[Math.floor(rand(rng) * top.length)].slot;
  let slip = false;
  if (rand(rng) < mockErrorRate(w, { skill, fam })) {
    // a slip: another move, the plausible ones (close to the best) more likely than the absurd
    const others = opts.filter((o) => o.slot !== slot);
    if (others.length) {
      slip = true;
      const best = opts[0].score;
      let total = 0;
      const ws = others.map((o) => { const x = Math.exp(Math.max(-8, (o.score - best) / SLIP_T)); total += x; return x; });
      let r = rand(rng) * total;
      slot = others[others.length - 1].slot;
      for (let i = 0; i < others.length; i++) { r -= ws[i]; if (r <= 0) { slot = others[i].slot; break; } }
    }
  }
  return { slot, slip };
}

// After an attempt: every attack faced is a little more familiar, the ones that hurt more so.
export function mockLearn(fam, record) {
  for (const d of record.decisions || []) {
    fam[d.attackId] = (fam[d.attackId] || 0) + (d.hurt ? 0.5 : 0.15);
  }
  if (record.killedBy) fam[record.killedBy] = (fam[record.killedBy] || 0) + 0.6;
  return fam;
}

const LINES = {
  roll_through: ['Through it, not away from it.', 'Slip past its side.', 'Its back is the safe place.', 'Past it and out behind.'],
  roll_away: ['Too close. Out of its reach.', 'Give it room. Let it miss.', 'Back off and watch it.', 'Not this one. Away.'],
  roll_toward: ['Close the gap before it lands.', 'Inside its guard. Go now.', 'Forward, inside its reach.', 'In close, where it is weakest.'],
  jump_back: ['Off the floor. Let it pass under.', 'Feet up, away from the ink.', 'Up and back, clear of it.', 'Leap. The floor is not safe.'],
  guard: ['Shield up. Let it break on me.', 'Brace and hold the line.', 'Take it on the shield.', 'Plant my feet. Weather it.'],
  hex: ['Mark it. Make it bleed more.', 'A hex on the scribe.', 'Curse the hand that writes.', 'Let the mark do the work.'],
  trade: ['Take the hit. Give one back.', 'Blow for blow. I can bear it.', 'Let it cut me. Then I crush.', 'Pain first, then the hammer.'],
  strike: ['It is open. Cut now.', 'Strike while it winds up.', 'Pressure it. No pause.', 'Hit first, think later.'],
  candle: ['Burn it from here.', 'A flame for the old paper.', 'Light it up from range.', 'Fire, then watch it smoulder.'],
  blot: ['Ink ward up. Let it hit that.', 'A blot to swallow the blow.', 'Hide behind the ink.', 'Ward first. It cannot touch me.'],
  margin: ['Step into the margin, behind it.', 'Blink past. Strike its back.', 'Gone before it lands.', 'Out of the page, behind it.'],
  knot: ['Tie its hands. Now.', 'Bind it mid-swing.', 'The knot holds. Punish it.', 'Stop that pen cold.'],
  mend: ['Close the wounds while I can.', 'Mend now, fight after.', 'A breath to heal.', 'Patch up and press on.'],
  echo: ['Every cut twice over.', 'Let the strike echo.', 'Double the blow, double the ink.', 'Once for me, once for the echo.'],
};

// move: a move id ('roll_through', 'strike', 'candle', ...) or a move object from movesFor().
export function mockThought(move, rng) {
  const id = typeof move === 'string' ? move : move && move.id;
  const lines = LINES[id] || LINES.strike;
  return lines[Math.floor(rand(rng) * lines.length)];
}

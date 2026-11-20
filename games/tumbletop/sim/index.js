// Public entry point for the Tumbletop simulation (pure ES modules, no rendering dependencies).
//
//   const sim = createSim({ seed: 42, round: 0, entrants: ['juniper', ...] });   // one round of a show
//   simulate({ seed: '<hex>', entrants, options: { round } })                    // the platform's pure entry point
//   sim.step();            // advance exactly one 1/60 s tick (deterministic)
//   sim.state              // read-only: tick, time, phase, phaseTime, raceTime, countdown, bots[],
//                          // obstacles[], qualifiedCount, qualifyCount, eliminatedCount, leaderId,
//                          // bubble (ids at places Q-2..Q+3), order (ids by live place)
//   sim.drainEvents()      // events since the last drain: { tick, time, type, botId?, otherId?,
//                          // section?, pos?, importance 0..1, text, ...extra }
//   sim.eventLog()         // every event so far
//   sim.hash()             // 16-hex-char state hash
//   sim.finishOrder()      // [{ place, id, name, status, finishTime, finishPlace }]
//   sim.runToEnd(extra)    // headless convenience
//
// Bot: pos = feet (bottom centre), yaw = heading (0 faces +z, positive turns toward +x; use as
// rotation.y), anim in ANIMS, animTime = seconds in the current anim. Bots with status
// 'respawning' are below the course and should be hidden.
export {
  createSim, TICK_RATE, DT, INTRO_TIME, COUNTDOWN_TIME, TIME_LIMIT, RESPAWN_DELAY,
  ANIMS, STATUSES, PHASES, EVENT_TYPES, ordinal,
} from './sim.js';
export { COURSE, BOT_RADIUS, BOT_HEIGHT, sectionAt } from './course.js';
export { Rng, mixSeed } from './rng.js';
export { PALETTE, PATTERNS } from './names.js';
export { ROSTER, STAT_KEYS, TRAIT_WORD, gumble } from './roster.js';
export { ROUNDS, ROUND_COUNT } from './rounds.js';
export { simulate, simulateShow, seedToUint32, showSeeds } from './simulate.js';
export {
  seesawRoll, sliderX, pendulumTheta, spinnerAngle, marblePose, rampY, hazardHit,
} from './obstacles.js';

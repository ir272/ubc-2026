// Fixed-timestep accumulator. Owner: core. Pure.
import { TICK_MS } from './constants.js';

export function createFixedStep(stepFn, stepMs = TICK_MS) {
  let acc = 0;
  return {
    get stepMs() { return stepMs; },
    get alpha() { return acc / stepMs; },
    // Feed simulated milliseconds; runs whole ticks. Returns ticks run.
    advance(ms, maxSteps = Infinity) {
      acc += ms;
      let n = 0;
      while (acc >= stepMs - 1e-7 && n < maxSteps) {
        stepFn(stepMs);
        acc -= stepMs;
        n++;
      }
      if (n >= maxSteps && acc > stepMs) acc = 0; // spiral-of-death guard
      return n;
    },
    reset() { acc = 0; },
  };
}

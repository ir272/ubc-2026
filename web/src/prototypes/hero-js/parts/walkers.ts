// Three characters leave the television one after another, one from each of our games: a Goober Guys
// contestant, the Inkelton duellist and the Count from Blood Moon. Each appears game-sized on the terrace
// inside the glass, crouches, leaps out over the bezel (growing as it comes toward us), lands on the bluff and
// comes down the cut steps to the ridge. Each moves in its own way and does its own thing once on the way:
// the goober waddles and bounces and jumps for a firefly with both arms up, the duellist walks poised with
// the sword at the slope and stops for one clean thrust, the Count strides with his cloak trailing and stops
// to throw it open and bare his fangs. At the couch each takes its leave: the goober waves and hops, the
// duellist salutes with the blade and bows, the Count bows. Then it is gone the way a game character goes,
// with a pop: puffs, loose pages, a few bats. Nothing is ever see-through.
// All three share a 30 s loop, a third apart, so the ridge is never empty. Each walker moves along its own
// distance s; the walk phase is driven by s, so feet never slide, and the stride shortens on the steps.
import { GOLD, INK, WALK, wind } from '../engine/layout';
import type { Part } from '../engine/types';
import { cycleLength, drawBat, drawCast, heightOf, type Kind, type Pose } from './left/cast';
import { TAU, clamp01, disc, lerp, line, mod, overshoot, rnd, shape, smooth, tone, type Ctx } from './left/kit';
import { slopeAt, stepY, walkY } from './left/world';

interface Walker { kind: Kind; v: number; acts: readonly { at: number; dur: number }[] }
const CAST: readonly Walker[] = [
  { kind: 'goober', v: 92, acts: [{ at: 1250, dur: 1.7 }, { at: 1690, dur: 1.7 }] },
  { kind: 'duellist', v: 102, acts: [{ at: 1420, dur: 2.4 }] },
  { kind: 'count', v: 122, acts: [{ at: 1560, dur: 2.8 }] },
];

const LOOP = 30;
const X_IN = 468; // where it appears, game-sized, on the terrace inside the glass
const X_LAND = 610; // where the leap lands, on the bluff
const S_IN = 0.3;
const EMERGE = 1.5, LEAP0 = 0.45, LEAP1 = 1.12;
const RAMP = 0.36; // seconds to start or stop walking
const LEAVE = 3.2, POP = 1.5; // the leave-taking at the couch, then the pop
const STOP = WALK.to - 70; // short of the couch's side table

// stride factor along the trail (short on the steps), and x as a function of distance walked
const strideAt = (x: number) => 1 - 0.56 * smooth(0.12, 0.42, slopeAt(x));
const S2X: number[] = [];
for (let x = X_LAND; x < STOP + 4; ) {
  S2X.push(x);
  x += strideAt(x);
}
const xOfS = (s: number) => {
  const i = Math.max(0, Math.min(S2X.length - 2, Math.floor(s)));
  return S2X[i]! + (S2X[i + 1]! - S2X[i]!) * clamp01(s - i);
};
const sOfX = (x: number) => {
  let lo = 0, hi = S2X.length - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (S2X[m]! < x) lo = m;
    else hi = m;
  }
  return lo + (x - S2X[lo]!) / (S2X[hi]! - S2X[lo]! || 1);
};

interface Seg { t0: number; t1: number; s0: number; s1: number; act: boolean }
const PLANS: Seg[][] = CAST.map((w) => {
  const out: Seg[] = [];
  let t = EMERGE, s = 0;
  const stops = [...w.acts.map((a) => ({ s: sOfX(a.at), dur: a.dur })), { s: sOfX(STOP), dur: 0 }];
  for (const st of stops) {
    const T = (st.s - s) / w.v + RAMP; // a ramp up and a ramp down, half a ramp each
    out.push({ t0: t, t1: t + T, s0: s, s1: st.s, act: false });
    t += T;
    s = st.s;
    if (st.dur > 0) {
      out.push({ t0: t, t1: t + st.dur, s0: s, s1: s, act: true });
      t += st.dur;
    }
  }
  return out;
});

/** the firefly the goober jumps for: it hovers just out of reach and darts up as the hands come */
function firefly(ctx: Ctx, x: number, y: number, t: number, a: number, dodge: number) {
  const fx = x + 26 + Math.sin(t * 2.3) * 9 + Math.sin(t * 5.1) * 3, fy = y - 148 + Math.cos(t * 1.9) * 6 - dodge * 30;
  const p = 0.6 + 0.4 * Math.sin(t * 6.3);
  const gr = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, 15);
  gr.addColorStop(0, `rgba(231,200,115,${0.5 * a * p})`);
  gr.addColorStop(1, 'rgba(231,200,115,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(fx - 15, fy - 15, 30, 30);
  disc(ctx, fx, fy, 2.3 * Math.min(1, a * 2), GOLD);
  const fl = Math.sin(t * 38) * 2.4;
  ctx.globalAlpha = 0.7 * a;
  ctx.strokeStyle = GOLD;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(fx - 1, fy - 1);
  ctx.lineTo(fx - 5, fy - 4 - fl);
  ctx.moveTo(fx + 1, fy - 1);
  ctx.lineTo(fx + 5, fy - 4 + fl);
  ctx.stroke();
  ctx.globalAlpha = 1;
}

/**
 * What is left in the air after a character pops (u runs 0..1): each kind leaves its own game's bits, which
 * fly off and shrink to nothing. Solid shapes only.
 */
function popBits(ctx: Ctx, kind: Kind, x: number, y: number, u: number, t: number, seed: number) {
  const e = 1 - (1 - u) ** 2;
  if (u < 0.3) {
    // the ring of the pop itself: a few short ticks flying outward
    const k = u / 0.3;
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * TAU + seed, r0 = 14 + 34 * k, r1 = r0 + 12 * (1 - k);
      line(ctx, [[x + Math.cos(a) * r0, y + Math.sin(a) * r0 * 0.9], [x + Math.cos(a) * r1, y + Math.sin(a) * r1 * 0.9]], 1.8 * (1 - k * 0.6), kind === 'goober' ? '#5ad6b4' : INK);
    }
  }
  const size = 1 - smooth(0.45, 1, u);
  if (kind === 'count') {
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (rnd(seed + i * 3.1) - 0.5) * 2.3, d = (70 + 150 * rnd(seed + i * 7.7)) * e;
      const bx = x + Math.cos(a) * d + Math.sin(t * 5 + i * 2) * 5, by = y + Math.sin(a) * d - 40 * e;
      drawBat(ctx, bx, by, (9 + 5 * rnd(seed + i)) * size * smooth(0, 0.12, u), Math.sin(t * 19 + i * 1.7), Math.cos(a) * 0.5);
    }
  } else if (kind === 'duellist') {
    // loose pages, turning as they blow off
    for (let i = 0; i < 6; i++) {
      const a = -Math.PI / 2 + (rnd(seed + i * 3.1) - 0.5) * 2.6, d = (50 + 110 * rnd(seed + i * 7.7)) * e;
      const px = x + Math.cos(a) * d + 30 * e, py = y + Math.sin(a) * d - 20 * e + 26 * u * u;
      const r = t * (2 + i * 0.6) + i, w = 6.5 * size * smooth(0, 0.12, u) * (0.45 + 0.55 * Math.abs(Math.cos(r * 0.8))), h = 8.5 * size * smooth(0, 0.12, u);
      if (h < 0.5) continue;
      const c = Math.cos(r * 0.3), s = Math.sin(r * 0.3);
      const q = (ax: number, ay: number): [number, number] => [px + ax * c - ay * s, py + ax * s + ay * c];
      shape(ctx, [q(-w, -h), q(w, -h), q(w, h), q(-w, h)], tone(INK, 0.66), INK, Math.min(1.3, h * 0.2));
      line(ctx, [q(-w * 0.6, -h * 0.3), q(w * 0.6, -h * 0.3)], Math.min(1, h * 0.14), '#0b0e0b', 0.7);
      line(ctx, [q(-w * 0.6, h * 0.2), q(w * 0.3, h * 0.2)], Math.min(1, h * 0.14), '#0b0e0b', 0.7);
    }
  } else {
    // candy puffs
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * TAU + seed, d = (30 + 50 * rnd(seed + i * 7.7)) * e;
      const r = (5 + 5 * rnd(seed + i * 2.3)) * size * smooth(0, 0.15, u);
      if (r < 0.4) continue;
      const col = i % 2 ? '#f088c8' : '#5ad6b4';
      disc(ctx, x + Math.cos(a) * d, y + Math.sin(a) * d * 0.8 - 26 * e, r, tone(col, 0.5), col, Math.min(1.5, r * 0.3));
    }
  }
}

export const walkers: Part = {
  id: 'walkers',
  z: 30,
  intro: [3.0, 3.4],
  draw(pen, f) {
    const { t } = f;
    const ctx = pen.ctx;
    CAST.forEach((w, i) => {
      const tau = mod(t - (i * LOOP) / 3, LOOP);
      const plan = PLANS[i]!;
      const tEnd = plan[plan.length - 1]!.t1;
      const D = cycleLength(w.kind), tall = heightOf(w.kind);
      let x = X_LAND, s = 1, lift = 0, dist = 0;
      const pose: Pose = { phase: 0, amp: 0 };

      // the firefly waits at each place the goober will jump
      if (w.kind === 'goober') {
        for (const sg of plan) {
          if (!sg.act) continue;
          const q = tau - sg.t0, T = sg.t1 - sg.t0;
          const a = smooth(-2.4, -1.2, q) * (1 - smooth(T - 0.2, T + 1.2, q));
          if (a > 0.01) {
            const jx = xOfS(sg.s0);
            firefly(ctx, jx, walkY(jx), t, a, smooth(0.55, 0.85, q) * (1 - smooth(T, T + 1.2, q)));
          }
        }
      }

      if (tau < EMERGE) {
        // pop up on the terrace in the picture, crouch, leap out over the bezel, land on the bluff
        const u = clamp01((tau - LEAP0) / (LEAP1 - LEAP0));
        const e = u * u * (3 - 2 * u);
        x = lerp(X_IN, X_LAND, e);
        s = lerp(S_IN, 1, e ** 0.8) * overshoot(tau / 0.24);
        lift = 70 * Math.sin(Math.PI * u) * (0.5 + 0.5 * s);
        pose.tuck = Math.sin(Math.PI * u) ** 0.7;
        pose.crouch = 0.75 * smooth(0.08, LEAP0 - 0.04, tau) * (1 - smooth(LEAP0 - 0.04, LEAP0 + 0.1, tau)) + 0.8 * smooth(LEAP1 - 0.05, LEAP1 + 0.06, tau) * (1 - smooth(LEAP1 + 0.06, EMERGE, tau));
        pose.lw = lerp(0.5, 1, smooth(S_IN, 0.9, s));
      } else if (tau < tEnd) {
        const sg = plan.find((p) => tau < p.t1) ?? plan[plan.length - 1]!;
        const q = tau - sg.t0, T = sg.t1 - sg.t0;
        if (sg.act) {
          dist = sg.s0;
          if (w.kind === 'goober') {
            // anticipation, a leap with both arms thrown up, a soft landing
            const j = clamp01((q - 0.42) / 0.62);
            lift = 54 * Math.sin(Math.PI * j) ** 0.85;
            pose.tuck = 0.55 * Math.sin(Math.PI * j) ** 0.8;
            pose.act = smooth(0.3, 0.52, q) * (1 - smooth(1.02, 1.3, q));
            pose.crouch = 0.9 * smooth(0.08, 0.36, q) * (1 - smooth(0.36, 0.5, q)) + 0.7 * smooth(0.98, 1.08, q) * (1 - smooth(1.08, 1.5, q));
          } else if (w.kind === 'duellist') {
            // settle, one clean thrust, hold, back to the slope
            pose.crouch = 0.5 * smooth(0.15, 0.5, q) * (1 - smooth(T - 0.7, T - 0.2, q));
            pose.act = (q > 0.55 ? overshoot((q - 0.55) / 0.28) : 0) * (1 - smooth(T - 0.8, T - 0.25, q));
          } else {
            // draws himself up, throws the cloak open with a hiss, wraps it shut again
            pose.crouch = 0.25 * smooth(0, 0.3, q) * (1 - smooth(0.3, 0.6, q));
            pose.act = (q > 0.4 ? overshoot((q - 0.4) / 0.4) : 0) * (1 - smooth(T - 0.8, T - 0.2, q));
          }
        } else {
          const L = sg.s1 - sg.s0, v = w.v;
          let d: number, vel: number;
          if (q < RAMP) {
            d = (v * q * q) / (2 * RAMP);
            vel = q / RAMP;
          } else if (q < T - RAMP) {
            d = (v * RAMP) / 2 + v * (q - RAMP);
            vel = 1;
          } else {
            const k = T - q;
            d = L - (v * k * k) / (2 * RAMP);
            vel = k / RAMP;
          }
          dist = sg.s0 + d;
          pose.amp = smooth(0, 1, vel);
        }
        x = xOfS(dist);
      } else {
        // at the couch: take its leave, then pop
        const k = tau - tEnd;
        dist = sOfX(STOP);
        x = STOP;
        const p = (k - LEAVE) / POP;
        if (p >= 1) return;
        if (w.kind === 'goober') {
          // waves, and hops twice on the spot
          pose.greet = overshoot((k - 0.15) / 0.4) * (k > 0.15 ? 1 : 0);
          for (const h0 of [1.2, 2.1]) {
            const h = clamp01((k - h0) / 0.6);
            lift += 30 * Math.sin(Math.PI * h) ** 0.85;
            pose.tuck = Math.max(pose.tuck ?? 0, 0.4 * Math.sin(Math.PI * h));
            pose.crouch = (pose.crouch ?? 0) + 0.8 * smooth(h0 - 0.3, h0, k) * (1 - smooth(h0, h0 + 0.12, k)) + 0.6 * smooth(h0 + 0.55, h0 + 0.62, k) * (1 - smooth(h0 + 0.62, h0 + 0.9, k));
          }
        } else if (w.kind === 'duellist') {
          // the blade comes up before the face, then sweeps down into a bow
          pose.greet = overshoot((k - 0.2) / 0.45) * (k > 0.2 ? 1 : 0);
          pose.bow = smooth(1.5, 2.1, k) * (1 - 0.25 * smooth(2.7, LEAVE, k));
        } else {
          // one deep bow, cloak held shut
          pose.bow = smooth(0.4, 1.2, k) * (1 - 0.3 * smooth(2.5, LEAVE, k));
          pose.crouch = 0.2 * smooth(0.4, 1.2, k);
        }
        if (p > 0) {
          // the pop: the figure snaps shut to nothing in a fifth of a second and its bits fly off
          const sh = clamp01(p / 0.12);
          s = (1 - sh) * (1 + 0.25 * Math.sin(Math.PI * Math.min(1, sh * 1.4)));
          lift += tall * 0.45 * (1 - s);
          popBits(ctx, w.kind, x, walkY(x) - tall * 0.5, p, t, i * 5.3 + 1);
        }
      }
      pose.phase = (dist / D) * TAU + i * 2.1;
      pose.stride = tau < EMERGE ? 1 : strideAt(x);
      pose.wind = wind(t - 0.2, x);
      const gy = walkY(x);
      // in the air the feet leave the ground and the shadow stays on it
      drawCast(ctx, w.kind, x, gy - lift, s, pose, t, stepY);
    });
  },
};

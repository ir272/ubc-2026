// Three game characters leave the TV one after another. Each appears game-sized on the terrace inside the
// glass, crouches, leaps out over the bezel (growing as it comes toward us), lands on the bluff and comes
// down the cut steps to the ridge, one tread to a step. On the ridge each does its own thing: the cap one
// runs a few steps and jumps for a firefly with both feet off the ground, the stout one plants its staff and
// wipes its brow, the hooded one stops and lifts its lantern high toward the couch. Then each greets the
// couch, hops and fades. All three share a 30 s loop, a third apart, so the ridge is never empty.
// Each walker moves along its own distance s; the walk phase is driven by s, so feet never slide, and the
// stride shortens on the steps (x advances more slowly there for the same cadence).
import { GOLD, WALK, wind } from '../engine/layout';
import type { Part } from '../engine/types';
import { cycleLength, drawWalker, type Kind, type Pose } from './left/figure';
import { TAU, clamp01, disc, lerp, mod, overshoot, smooth, type Ctx } from './left/kit';
import { slopeAt, stepY, walkY } from './left/world';

type ActKind = 'jump' | 'wipe' | 'lift' | 'look';
interface Walker { kind: Kind; v: number; acts: readonly { at: number; dur: number; k: ActKind }[] }
const CAST: readonly Walker[] = [
  { kind: 'cap', v: 104, acts: [{ at: 1250, dur: 1.7, k: 'jump' }, { at: 1690, dur: 1.7, k: 'jump' }] },
  { kind: 'pack', v: 100, acts: [{ at: 1420, dur: 3.0, k: 'wipe' }] },
  { kind: 'scarf', v: 112, acts: [{ at: 1560, dur: 3.0, k: 'lift' }] },
];

const LOOP = 30;
const X_IN = 468; // where it appears, game-sized, on the terrace inside the glass
const X_LAND = 610; // where the leap lands, on the bluff
const S_IN = 0.3;
const EMERGE = 1.5, LEAP0 = 0.45, LEAP1 = 1.12;
const RAMP = 0.36; // seconds to start or stop walking
const WAVE = 2.6, HOP = 0.9;
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

interface Seg { t0: number; t1: number; s0: number; s1: number; act?: ActKind }
const PLANS: Seg[][] = CAST.map((w) => {
  const out: Seg[] = [];
  let t = EMERGE, s = 0;
  const stops = [...w.acts.map((a) => ({ s: sOfX(a.at), dur: a.dur, k: a.k as ActKind | undefined })), { s: sOfX(STOP), dur: 0, k: undefined as ActKind | undefined }];
  for (const st of stops) {
    const T = (st.s - s) / w.v + RAMP; // a ramp up and a ramp down, half a ramp each
    out.push({ t0: t, t1: t + T, s0: s, s1: st.s });
    t += T;
    s = st.s;
    if (st.k) {
      out.push({ t0: t, t1: t + st.dur, s0: s, s1: s, act: st.k });
      t += st.dur;
    }
  }
  return out;
});

let scratch: HTMLCanvasElement | null = null;
/** paints through an offscreen canvas when the whole figure has to fade as one */
function faded(ctx: Ctx, alpha: number, cx: number, cy: number, paint: (c: Ctx) => void) {
  if (alpha >= 0.995) return paint(ctx);
  if (alpha <= 0.005) return;
  const sc = ctx.getTransform().a, R = 230, px = Math.ceil(2 * R * sc);
  scratch ??= document.createElement('canvas');
  if (scratch.width !== px) {
    scratch.width = px;
    scratch.height = px;
  }
  const c = scratch.getContext('2d');
  if (!c) return;
  c.setTransform(1, 0, 0, 1, 0, 0);
  c.clearRect(0, 0, px, px);
  c.setTransform(sc, 0, 0, sc, -(cx - R) * sc, -(cy - R) * sc);
  paint(c);
  ctx.globalAlpha = alpha;
  ctx.drawImage(scratch, cx - R, cy - R, px / sc, px / sc);
  ctx.globalAlpha = 1;
}

/** the firefly the cap one jumps for: it hovers just out of reach and darts up as the hands come */
function firefly(ctx: Ctx, x: number, y: number, t: number, a: number, dodge: number) {
  const fx = x + 30 + Math.sin(t * 2.3) * 9 + Math.sin(t * 5.1) * 3, fy = y - 204 + Math.cos(t * 1.9) * 6 - dodge * 30;
  const p = 0.6 + 0.4 * Math.sin(t * 6.3);
  const gr = ctx.createRadialGradient(fx, fy, 0.5, fx, fy, 15);
  gr.addColorStop(0, `rgba(231,200,115,${0.5 * a * p})`);
  gr.addColorStop(1, 'rgba(231,200,115,0)');
  ctx.fillStyle = gr;
  ctx.fillRect(fx - 15, fy - 15, 30, 30);
  disc(ctx, fx, fy, 2.3, GOLD, null, 0, a);
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
      const D = cycleLength(w.kind);
      let x = X_LAND, s = 1, alpha = 1, lift = 0, dist = 0;
      const pose: Pose = { phase: 0, amp: 0 };

      // the firefly waits at each place the cap one will jump
      if (w.kind === 'cap') {
        for (const sg of plan) {
          if (sg.act !== 'jump') continue;
          const q = tau - sg.t0, T = sg.t1 - sg.t0;
          const a = smooth(-2.4, -1.2, q) * (1 - smooth(T - 0.2, T + 1.2, q));
          if (a > 0.01) {
            const jx = xOfS(sg.s0);
            firefly(ctx, jx, walkY(jx), t, a, smooth(0.55, 0.85, q) * (1 - smooth(T, T + 1.2, q)));
          }
        }
      }

      if (tau < EMERGE) {
        // appear on the terrace in the picture, crouch, leap out over the bezel, land on the bluff
        const u = clamp01((tau - LEAP0) / (LEAP1 - LEAP0));
        const e = u * u * (3 - 2 * u);
        x = lerp(X_IN, X_LAND, e);
        s = lerp(S_IN, 1, e ** 0.8);
        alpha = smooth(0, 0.22, tau);
        lift = 70 * Math.sin(Math.PI * u) * (0.5 + 0.5 * s);
        pose.tuck = Math.sin(Math.PI * u) ** 0.7;
        pose.crouch = 0.75 * smooth(0.08, LEAP0 - 0.04, tau) * (1 - smooth(LEAP0 - 0.04, LEAP0 + 0.1, tau)) + 0.8 * smooth(LEAP1 - 0.05, LEAP1 + 0.06, tau) * (1 - smooth(LEAP1 + 0.06, EMERGE, tau));
        pose.look = 0.3 * (1 - u);
        if (w.kind === 'cap') pose.reach = 0.7 * Math.sin(Math.PI * u);
      } else if (tau < tEnd) {
        const sg = plan.find((p) => tau < p.t1) ?? plan[plan.length - 1]!;
        const q = tau - sg.t0, T = sg.t1 - sg.t0;
        if (sg.act) {
          dist = sg.s0;
          const a = smooth(0, 0.4, q) * (1 - smooth(T - 0.4, T, q));
          if (sg.act === 'jump') {
            // anticipation, a leap with both arms thrown up, a soft landing, a look after the one that got away
            const j = clamp01((q - 0.42) / 0.62);
            lift = 62 * Math.sin(Math.PI * j) ** 0.85;
            pose.tuck = 0.55 * Math.sin(Math.PI * j) ** 0.8;
            pose.reach = smooth(0.3, 0.52, q) * (1 - smooth(1.02, 1.3, q));
            pose.crouch = 0.8 * smooth(0.08, 0.36, q) * (1 - smooth(0.36, 0.5, q)) + 0.6 * smooth(0.98, 1.08, q) * (1 - smooth(1.08, 1.5, q));
            pose.look = 0.9 * smooth(0, 0.3, q) * (1 - smooth(T - 0.35, T, q));
          } else if (sg.act === 'wipe') {
            pose.wipe = overshoot((q - 0.25) / 0.5) * (q > 0.25 ? 1 : 0) * (1 - smooth(T - 0.5, T, q));
            pose.crouch = 0.22 * a;
            pose.look = -0.15 * a;
          } else if (sg.act === 'lift') {
            pose.crouch = 0.3 * smooth(0, 0.25, q) * (1 - smooth(0.25, 0.5, q));
            pose.wave = overshoot((q - 0.3) / 0.55) * (q > 0.3 ? 1 : 0) * (1 - smooth(T - 0.5, T, q));
            pose.look = 0.5 * a;
          } else {
            pose.look = 0.85 * overshoot(q / 0.5) * (1 - smooth(T - 0.4, T, q));
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
          // glances while walking: up at the sky now and then, and toward the couch as it gets near
          pose.look = 0.22 * Math.max(0, Math.sin(tau * 0.9 + i * 2)) ** 2 * pose.amp;
        }
        x = xOfS(dist);
      } else {
        // at the couch: greet, then one hop forward while fading
        const k = tau - tEnd;
        dist = sOfX(STOP);
        x = STOP;
        pose.wave = overshoot((k - 0.15) / 0.45) * (k > 0.15 ? 1 : 0) * (1 - smooth(WAVE - 0.4, WAVE, k));
        pose.look = 0.3 * smooth(0.1, 0.5, k);
        pose.crouch = 0.5 * smooth(WAVE - 0.3, WAVE, k) * (1 - smooth(WAVE, WAVE + 0.15, k));
        const h = (k - WAVE) / HOP;
        if (h > 0) {
          if (h >= 1) return;
          x += 44 * h;
          lift = 52 * Math.sin(Math.PI * h);
          pose.tuck = Math.sin(Math.PI * h) ** 0.8;
          alpha = 1 - smooth(0.3, 1, h);
        }
      }
      pose.phase = (dist / D) * TAU + i * 2.1;
      pose.stride = tau < EMERGE ? 1 : strideAt(x);
      pose.wind = wind(t - 0.2, x);
      const gy = walkY(x);
      // in the air the feet leave the ground and the shadow stays on it
      faded(ctx, alpha, x, gy - 110, (c) => drawWalker(c, w.kind, x, gy - lift, s, pose, t, stepY));
    });
  },
};

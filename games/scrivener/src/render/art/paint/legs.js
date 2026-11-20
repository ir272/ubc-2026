// Round 18: the Scrivener's legs below the coat, painted the way the arms are (inkarm.js):
// one black mass per segment, its silhouette swelling on the shadow side and carved in
// white. The carving is deliberately UNEVEN (Obata ref 03, Rem's legs): one or two long
// heavy white lines riding the shadow (back) side of the calf, a medium bone ridge down
// the tibia, and on the lit front only hairline rims broken into short runs. Thorns
// grow off the knee and the back of the calf. Owner: art.
//
// Frames (art units, +x = front/lit, the light from the upper front):
//   shin: pivot = the knee (0,0), the bone runs down +y to the ankle at (0, SHIN_LEN).
//   foot: pivot = the ankle (0,0), the ground at y = FOOT_H, toes toward +x.

import { INK, PAPER, rng, add, mix, norm, stroke, carve, mass, contourLine, spike } from './brush.js';
import { inkLimb, inkFinger, sweep } from './inkarm.js';
import { litPlane } from './feather.js';
import { PALE } from './inkarm.js';
import { paleBody, paleKnob } from './palelimb.js';
import { within, fold, fringe, pocket } from './formhatch.js';

function paleShin(g, front, back, seed) {
  const S = (y) => (y + 9) / 78;
  paleBody(g, front, back, {
    seed,
    // the calf's belly high on the back is the big shadow; the tibia front stays lit
    coreFn: (s) => 0.22 + 0.22 * Math.exp(-Math.pow((s - 0.3) / 0.15, 2)),
    feather: 0.5,
    pockets: [[S(-6), S(4), 0.55], [S(48), S(58), 0.4]],
    lit: [{ s0: S(-6), s1: S(4), n: 3, len: 0.2 }, { s0: S(22), s1: S(40), n: 3, len: 0.16 }],
    extra: (h) => {
      spike(h, [4, -5], [17, -17], 7.5, { bend: -0.14, seed: seed + 3, pout: 2.2 });
      spike(h, [-11, 6], [-27, 14], 6.5, { bend: 0.18, seed: seed + 4, pout: 2.2 });
      spike(h, [-8.5, 30], [-20, 42], 4.2, { bend: 0.16, seed: seed + 5, pout: 2.2 });
    },
    grooves: [
      // the tibia ridge, broken at the middle of the shin
      { pts: [[4.4, 9], [3.2, 18], [2.2, 27]], w: 0.9 },
      { pts: [[1.8, 34], [1.0, 42], [1.2, 50]], w: 0.7 },
      // the kneecap's underside
      { pts: [[8.6, 3.0], [4.2, 5.6], [-0.6, 4.8]], w: 1.1, o: { tin: 0.15, tout: 0.6 } },
      // the Achilles tendon
      { pts: [[-4.6, 42], [-2.8, 52], [-2.6, 60]], w: 0.8 },
    ],
  });
  paleKnob(g, [1.0, 61.0], 2.6, 1.8, 0.4, seed + 61);
  paleKnob(g, [-3.6, 63.5], 1.5, 1.1, 0.2, seed + 62);
}

export const SHIN_LEN = 64;
export const FOOT_H = 24;
const L_LIMB = norm([0.8, -0.6]);
const LINE = { tin: 0.32, tout: 0.42, pin: 1.1, pout: 1.5, swell: 0.08, wob: 0.12, tooth: 0.04 };

export function inkShin(far) {
  return (g) => {
    const seed = far ? 731 : 711;
    // the kneecap juts forward as a knob, the tibia runs lean and nearly straight down
    // the front, the calf is a single gaunt belly high on the back that wastes to a
    // tendon thinner than the bone before it flares into the heel of the ankle
    const front = [[3.5, -9], [8.4, -6.5], [10.6, -1.5], [9.2, 4.5], [7.0, 9], [6.6, 18], [5.6, 30], [4.4, 42], [3.4, 52], [3.6, 58], [4.4, 63], [3.0, 68]];
    const back = [[-7.5, -9], [-10.6, -1], [-13.8, 8], [-15.0, 16], [-13.6, 25], [-9.8, 34], [-6.0, 42], [-3.6, 50], [-3.0, 56], [-4.0, 61], [-4.6, 66], [-2.4, 69]];
    // round 20: the near shin is DRAWN pale like the arms; the far one stays a black mass
    // round 25: the near shin is a black mass carved in white again (the pale drumstick
    // broke the one-silhouette read); the pale is kept for skull, ribs-in-light and hands
    if (false && PALE && !far) { paleShin(g, front, back, seed); return; }
    inkLimb(g, front, back, {
      seed, far, swell: 3.4, gap: far ? null : [2.2, 0.8],
      // thorns are part of the black mass: one hooked off the front of the knee, two
      // raking back off the calf (the longer one higher)
      extra: (h) => {
        spike(h, [4, -5], [17, -17], 7.5, { bend: -0.14, seed: seed + 3, pout: 2.2 });
        spike(h, [-11, 6], [-27, 14], 6.5, { bend: 0.18, seed: seed + 4, pout: 2.2 });
        spike(h, [-8.5, 30], [-20, 42], 4.2, { bend: 0.16, seed: seed + 5, pout: 2.2 });
      },
      feather: far ? null : {
        s0: 0.04, s1: 0.3, step: 3.0, w: 2.1, contour: 0.9, bow: 0.32, fade: 0.25,
        depthFn: (s) => 2 + 5 * Math.exp(-Math.pow((s - 0.12) / 0.08, 2)),
      },
      // lit side: hairlines only, broken into three uneven runs
      rims: far ? [] : [[0.3, 0.5, 1.1, 1.0], [0.62, 0.7, 1.0, 0.8]],
      lines: [
        // the long heavy one: the calf's shadow edge, swelling hard under the belly and
        // dying into the Achilles tendon
        { pts: [[-9.4, -2], [-12.2, 9], [-12.0, 20], [-8.6, 31], [-4.6, 42], [-2.4, 52]], w: 3.1, o: { tin: 0.18, tout: 0.6, pin: 0.9, pout: 1.6, swell: 0.35 } },
        // the tibia ridge: medium, broken at the shin's middle
        { pts: [[3.6, 9], [2.6, 18], [1.6, 27]], w: 1.8, o: { tin: 0.2, tout: 0.6 } },
        { pts: [[1.2, 33], [0.6, 41], [0.8, 49]], w: 1.2, o: { tin: 0.3, tout: 0.6 } },
        // the kneecap's underside: a short heavy crescent
        { pts: [[8.0, 2.6], [4.0, 5.2], [-1.0, 4.4]], w: 1.9, o: { tin: 0.15, tout: 0.5 } },
        // the head of the fibula on the shadow side, a nick
        { pts: [[-6.2, 5], [-7.8, 10]], w: 1.6, o: { tin: 0.1, tout: 0.8 } },
      ],
    });
    // round 31: hatch wraps the shin off its lit front (curving down round the bone),
    // and the hollow behind the knee, under the robe, is crosshatched
    within(g, 'ink', (h) => {
      fringe(h, far ? [[7.4, 6], [6.6, 16], [5.8, 26], [4.8, 38], [3.8, 50]] : [[4.6, 8], [3.6, 18], [2.6, 28], [1.6, 40], [0.8, 50]], { side: -1, len: (u) => [2.4, 5 + 4 * Math.sin(u * Math.PI)], pitch: 1.9, w: far ? 0.85 : 1.0, tilt: -0.5, bow: 0.45, group: [2, 5], gap: [1.4, 3], seed: seed + 3101, inset: far ? -0.5 : 0.8 });
      pocket(h, [-6.4, -1], { rx: 4.6, ry: 6, ang: 0.3, pitch: 1.7, w: 0.52, a1: 0.5, a2: -0.6, seed: seed + 3102 });
    });
    if (far) return;
    {
      // round 19: one long carve wrapping the shin from the lit knee round into the calf
      sweep(g, front, back, [[0.2, 0.85], [0.34, 0.3], [0.52, -0.35], [0.7, -0.7]], { w: 2.2, seed: seed + 400 });
      const r0 = rng(seed + 90);
      // cross-contours over the calf belly, starting at the shadow edge carve and wrapping
      // toward the front, longer and heavier at the belly, short nicks lower down
      // round 19: fewer and heavier, so they survive at 720p (the 0.5 hairlines vanished)
      for (let i = 0; i < 0; i++) {
        const y = 5 + i * 5.6 + (r0() - 0.5) * 1.6;
        const k = Math.exp(-Math.pow((y - 14) / 10, 2));
        const xb = -13.4 + Math.abs(y - 16) * 0.22 + (y > 30 ? (y - 30) * 0.2 : 0);
        const L = 2.5 + k * 7 + r0() * 2;
        carve(g, [[xb + 1.2, y], [xb + 1.2 + L * 0.5, y + 1.3 + k], [xb + 1.2 + L, y + 3 + k * 1.5]], { w: 0.95 + k * 0.9 + r0() * 0.3, tin: 0.05, tout: 0.85, pout: 1.4, swell: 0, wob: 0.05, seed: seed + 91 + i });
      }
      // the lit front of the shin breaks into feathered hatch along the tibia
      litPlane(g, [[7.0, 9], [6.6, 18], [5.6, 30], [4.4, 42], [3.4, 52]], { side: 0, inside: [-4, 30], step: 3.0, depth: 3.8, w: 1.4, contour: 0.5, seed: seed + 95, fade: 0.25, slits: 0 });
    }
    // the ankle: a pale knob of bone breaking the black, a crease ring above it
    const knob = (c, rx, ry, rot) => {
      g.save(); g.translate(c[0], c[1]); g.rotate(rot);
      g.fillStyle = INK; g.beginPath(); g.ellipse(0, 0, rx + 0.7, ry + 0.7, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = PAPER; g.beginPath(); g.ellipse(0, 0, rx, ry, 0, 0, Math.PI * 2); g.fill();
      g.fillStyle = INK; g.beginPath(); g.ellipse(rx * 0.12, ry * 0.25, rx * 0.85, ry * 0.7, 0, 0.1, Math.PI - 0.1); g.fill();
      g.restore();
    };
    knob([1.0, 61.0], 2.6, 1.8, 0.4);
    knob([-3.6, 63.5], 1.5, 1.1, 0.2);
    carve(g, [[5.2, 55.0], [1.4, 56.6], [-3.4, 56.0]], { ...LINE, w: 1.1, seed: seed + 60 });
    // short wrap hatch across the lit round of the knee (curved strokes, uneven)
    const r = rng(seed + 70);
    for (let i = 0; i < 3; i++) {
      const y = -4.5 + i * 3.6 + (r() - 0.5);
      const x0 = 9.6 - Math.abs(y - 0) * 0.15;
      carve(g, [[x0 - 0.6, y], [x0 - 3.4 - r() * 2, y + 1.2], [x0 - 6 - r() * 3, y + 2.6]], { w: 1.0 + r() * 0.6, tin: 0, tout: 0.85, pout: 1.4, swell: 0, wob: 0.05, seed: seed + 71 + i });
    }
  };
}

// a talon with a hooked needle point, ringed in paper; `down` hooks it toward the floor
function claw(g, base, ang, L, hook, w, seed, far) {
  const d = [Math.cos(ang), Math.sin(ang)], n = [-d[1], d[0]];
  const T = [add(base, d, -1.5), add(add(base, d, L * 0.5), n, hook * 0.5), add(add(base, d, L), n, hook * 1.6)];
  if (!far) stroke(g, T, { w: w + 2.2, tin: 0, tout: 0.98, pout: 1.2, swell: 0, wob: 0, color: PAPER, seed, tooth: 0 });
  stroke(g, T, { w, tin: 0, tout: 0.97, pout: 2.2, swell: 0, wob: 0.05, seed: seed + 1, tooth: 0.03 });
  if (far) return;
  const rp = [0.06, 0.3, 0.55].map((s) => {
    const p = s < 0.5 ? mix(T[0], T[1], s * 2) : mix(T[1], T[2], (s - 0.5) * 2);
    return add(p, n, -Math.sign(hook || 1) * w * Math.pow(1 - s, 0.9) * 0.27);
  });
  carve(g, rp, { w: Math.max(0.5, w * 0.2), tin: 0.12, tout: 0.7, pout: 1.6, swell: 0, wob: 0.05, seed: seed + 2 });
}

// The foot: a raised heel (the ankle stands a hand above the floor), a long black
// instep running down to the ball, three long toes splayed forward that arch up off the
// floor at the knuckle and drive their talons down into it, and a back spur on the floor
// behind the heel. The weight shows in the toes: knuckles up, talons sunk.
export function inkFoot(far) {
  return (g) => {
    const seed = far ? 771 : 751;
    const H = FOOT_H;
    // spur behind the heel, flat on the floor, pointing back
    claw(g, [-4, H - 7], Math.PI - 0.32, 14, 2.6, 4.2, seed + 1, far);
    // far toe first (behind), then the instep mass, then the two near toes on top
    const ball = [13, H - 7];
    const toes = [
      // knuckle rise, toe end, talon angle, talon length, width, hook
      { J: [add(ball, [-1, -2]), [23, H - 14.5], [31, H - 11]], ang: 1.15, L: 15, w: [2.6, 2.2, 1.9], hook: 3.6 },
      { J: [ball, [27, H - 13.5], [38, H - 10]], ang: 1.0, L: 17, w: [3.0, 2.6, 2.2], hook: 4.2 },
      { J: [add(ball, [-1.5, 1]), [21, H - 9], [29, H - 6]], ang: 0.9, L: 13, w: [2.9, 2.4, 2.1], hook: 3.2 },
    ];
    const toe = (i) => {
      const t = toes[i];
      inkFinger(g, t.J, t.w, [t.J[2], t.ang, t.L, t.hook], seed + 10 * i, far);
    };
    toe(0);
    const instep = [[-4.5, -3], [3, -3], [6.5, 2], [11, 9], [16, H - 10.5], [16.5, H - 5], [11, H - 3.8], [4, H - 6.5], [-2, H - 5.5], [-6.5, H - 8], [-7, 8], [-6, 2]];
    mass(g, instep, { color: INK, rough: 0.2, seed: seed + 50 });
    contourLine(g, instep, { closed: true, side: 1, light: L_LIMB, wMin: 0, wMax: 2.2, seed: seed + 51, breaks: 0.08 });
    // a thorn off the back of the heel, raking up
    spike(g, [-6, 9], [-17, 1], 5.5, { bend: -0.15, seed: seed + 52, pout: 2.2 });
    if (!far) {
      // the long heavy carve on the shadow underside of the instep, the hairline on top
      carve(g, [[-5.5, 6], [-4.0, 12], [1.5, 15.5], [9, 16.5]], { ...LINE, w: 2.6, swell: 0.3, seed: seed + 53 });
      carve(g, [[4.2, 1.0], [7.6, 5.4], [10.6, 10.2]], { ...LINE, w: 1.1, seed: seed + 54 });
      carve(g, [[12.0, 12.6], [13.6, 15.4]], { ...LINE, w: 0.9, seed: seed + 55 });
      litPlane(g, [[-6, -2], [3.5, -3], [7, 2], [11, 9]], { inside: [0, 10], step: 2.4, depth: 3.6, w: 1.4, contour: 0.45, seed: seed + 56, fade: 0.2, slits: 0 });
    }
    toe(1);
    toe(2);
  };
}

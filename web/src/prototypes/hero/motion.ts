// Every loop in the hero is described here, as data: which element, how long one round takes, where
// in the round it starts, and its keyframes (transform and opacity only). `Hero.tsx` turns each one
// into a Web Animation, so they run on the compositor and can be paused, stepped and frozen together.
//
// Rules these keep: periods between 4 and 14 s and no two layers alike; the first and last keyframe
// of every loop are the same (or the thing is invisible there), so nothing jumps when a round ends.

import { makeRng } from '../../ui/ink/rng';
import { HERO, type Pt, type WalkerKind } from './asset';

/** Where the drawing sits inside the hero, in px. `px`/`py` are the object-position it was placed with. */
export interface Stage { x: number; y: number; w: number; h: number; px: number; py: number }

export interface Loop {
  /** the element with `data-m` equal to this */
  key: string;
  /** ms for one round */
  period: number;
  /** 0..1: how far into its round the loop is at time zero */
  phase: number;
  frames: Keyframe[];
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
const smooth = (t: number) => {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
};
const n1 = (v: number) => Math.round(v * 10) / 10;
const n2 = (v: number) => Math.round(v * 100) / 100;

/** in and out like a pendulum: for things that sway, breathe and twinkle */
const SINE = 'cubic-bezier(0.37, 0, 0.63, 1)';
/** the entrance wipe: moving across the screen, so it eases in and out, landing softly */
export const EASE_WIPE = 'cubic-bezier(0.5, 0, 0.2, 1)';
/** things arriving */
export const EASE_OUT = 'cubic-bezier(0.23, 1, 0.32, 1)';
export const ENTER_MS = 900;

export const PERIOD = {
  stars: [5300, 7100, 4600, 8300, 6400, 9100, 5900, 10600, 7700, 9800],
  screen: 4400,
  halo: 11200,
  sign: 6800,
  tree: 9400,
  walk: 13000,
} as const;

/** steps in one walk round; even, so the left-right rock closes on itself */
const STEPS = 18;
export const WALKERS: { kind: WalkerKind; phase: number }[] = [
  { kind: 'blue', phase: 0 },
  { kind: 'orange', phase: 0.36 },
  { kind: 'white', phase: 0.69 },
];

/** The frame `?still=1` and reduced motion show: all three walkers out on the ridge. */
export const STILL_MS = 1950;

/** object-fit: cover, with the object-position rule from `HERO.frame`. */
export function fitStage(boxW: number, boxH: number): Stage {
  const k = Math.max(boxW / HERO.width, boxH / HERO.height);
  const w = HERO.width * k;
  const h = HERO.height * k;
  const f = HERO.frame;
  const slide = clamp((f.both - boxW / w) / (f.both - f.rightOnly), 0, 1);
  const px = f.x + (1 - f.x) * slide;
  return { w, h, px, py: f.y, x: (boxW - w) * px, y: (boxH - h) * f.y };
}

/** A smooth curve through the points (Catmull-Rom), `per` pieces to each span. */
function curve(pts: readonly Pt[], per: number): [number, number][] {
  const out: [number, number][] = [];
  const at = (i: number) => pts[clamp(i, 0, pts.length - 1)]!;
  for (let i = 0; i < pts.length - 1; i++) {
    const [p0, p1, p2, p3] = [at(i - 1), at(i), at(i + 1), at(i + 2)];
    for (let j = 0; j < per; j++) {
      const t = j / per;
      const c = (a: number, b: number, d: number, e: number) =>
        0.5 * (2 * b + (d - a) * t + (2 * a - 5 * b + 4 * d - e) * t * t + (3 * b - a - 3 * d + e) * t * t * t);
      out.push([c(p0[0], p1[0], p2[0], p3[0]), c(p0[1], p1[1], p2[1], p3[1])]);
    }
  }
  const last = pts[pts.length - 1]!;
  out.push([last[0], last[1]]);
  return out;
}

/**
 * Where a walker's feet go, as `count` points evenly spaced along the way (so the pace is even),
 * in px of the stage, each with how solid the walker is there.
 */
export function walkPath(stage: Stage, count = 64): { x: number; y: number; o: number }[] {
  const k = HERO.walk;
  const line = curve([...HERO.approach, ...HERO.ridge.map(([x, y]): Pt => [x, y + k.footDrop])], 6);
  // keep the stretch between `from` and `to`, cut exactly at both ends
  const cut: [number, number][] = [];
  const yAt = (a: [number, number], b: [number, number], x: number) => a[1] + ((b[1] - a[1]) * (x - a[0])) / (b[0] - a[0]);
  for (let i = 1; i < line.length; i++) {
    const a = line[i - 1]!;
    const b = line[i]!;
    if (b[0] <= k.from || a[0] >= k.to || b[0] <= a[0]) continue;
    if (!cut.length) cut.push(a[0] < k.from ? [k.from, yAt(a, b, k.from)] : a);
    cut.push(b[0] > k.to ? [k.to, yAt(a, b, k.to)] : b);
  }
  const px = cut.map(([x, y]) => [x * stage.w, y * stage.h] as const);
  const len = [0];
  for (let i = 1; i < px.length; i++) len.push(len[i - 1]! + Math.hypot(px[i]![0] - px[i - 1]![0], px[i]![1] - px[i - 1]![1]));
  const total = len[len.length - 1]!;
  const out: { x: number; y: number; o: number }[] = [];
  let seg = 1;
  for (let i = 0; i < count; i++) {
    const d = (total * i) / (count - 1);
    while (seg < len.length - 1 && len[seg]! < d) seg++;
    const t = (d - len[seg - 1]!) / (len[seg]! - len[seg - 1]! || 1);
    const x = px[seg - 1]![0] + (px[seg]![0] - px[seg - 1]![0]) * t;
    const y = px[seg - 1]![1] + (px[seg]![1] - px[seg - 1]![1]) * t;
    const fx = x / stage.w;
    const o = smooth((fx - k.from) / (k.solidFrom - k.from)) * smooth((k.to - fx) / (k.to - k.solidTo));
    out.push({ x, y, o });
  }
  return out;
}

function starLoop(i: number): Loop {
  const r = makeRng(`hero-star-${i}`);
  const low = 0.28 + 0.2 * r();
  const mid = 0.6 + 0.16 * r();
  const rest = { opacity: n2(low), transform: 'scale(0.8)' };
  return {
    key: `star-${i}`,
    period: PERIOD.stars[i % PERIOD.stars.length]!,
    phase: r(),
    // up to full, a half dip, up again, and back: a twinkle rather than a pulse
    frames: [
      { ...rest, easing: SINE },
      { opacity: 1, transform: 'scale(1.06)', easing: SINE, offset: 0.3 },
      { opacity: n2(mid), transform: 'scale(0.9)', easing: SINE, offset: 0.55 },
      { opacity: 0.94, transform: 'scale(1)', easing: SINE, offset: 0.74 },
      rest,
    ],
  };
}

/** The screen's flicker: opacity only, between about 0.6 and 1 of an already faint glow. */
const SCREEN: [number, number][] = [
  [0, 0.78], [0.11, 0.92], [0.2, 0.7], [0.33, 0.86], [0.47, 1], [0.56, 0.8], [0.68, 0.94], [0.8, 0.64], [0.91, 0.84], [1, 0.78],
];

export function heroLoops(stage: Stage): Loop[] {
  const loops: Loop[] = HERO.stars.map((_, i) => starLoop(i));

  loops.push({ key: 'screen', period: PERIOD.screen, phase: 0, frames: SCREEN.map(([offset, opacity]) => ({ offset, opacity, easing: SINE })) });
  loops.push({
    key: 'halo', period: PERIOD.halo, phase: 0.2,
    frames: [{ opacity: 0.6, easing: SINE }, { opacity: 1, easing: SINE, offset: 0.46 }, { opacity: 0.6 }],
  });

  // the sign rocks about the foot of its post, the tree about where its trunk meets the couch
  loops.push({
    key: 'sign', period: PERIOD.sign, phase: 0.3,
    frames: [{ transform: 'rotate(-1.1deg)', easing: SINE }, { transform: 'rotate(1.4deg)', easing: SINE, offset: 0.52 }, { transform: 'rotate(-1.1deg)' }],
  });
  loops.push({
    key: 'tree', period: PERIOD.tree, phase: 0.6,
    frames: [{ transform: 'rotate(-0.6deg)', easing: SINE }, { transform: 'rotate(0.9deg)', easing: SINE, offset: 0.45 }, { transform: 'rotate(-0.6deg)' }],
  });

  // walkers: one round along the path (invisible at both ends, so the return is never seen), with a
  // whole number of steps in it so the bob and the rock also close on themselves
  const path = walkPath(stage);
  const way = path.map((p, i) => ({ offset: i / (path.length - 1), transform: `translate(${n1(p.x)}px, ${n1(p.y)}px)`, opacity: Math.round(p.o * 1000) / 1000 }));
  const lift = n1(Math.max(1, stage.h * 0.006));
  const bob: Keyframe[] = [];
  const rock: Keyframe[] = [];
  for (let s = 0; s < STEPS; s++) {
    bob.push({ offset: s / STEPS, transform: 'translateY(0px)', easing: SINE });
    bob.push({ offset: (s + 0.5) / STEPS, transform: `translateY(${-lift}px)`, easing: SINE });
    rock.push({ offset: s / STEPS, transform: `rotate(${s % 2 ? 1.3 : -1.3}deg)`, easing: SINE });
  }
  bob.push({ offset: 1, transform: 'translateY(0px)' });
  rock.push({ offset: 1, transform: 'rotate(-1.3deg)' });
  for (const w of WALKERS) {
    loops.push({ key: `walk-${w.kind}`, period: PERIOD.walk, phase: w.phase, frames: way });
    loops.push({ key: `bob-${w.kind}`, period: PERIOD.walk, phase: w.phase, frames: bob });
    loops.push({ key: `rock-${w.kind}`, period: PERIOD.walk, phase: w.phase, frames: rock });
  }
  return loops;
}

/** Start every loop whose element is under `root`. They come back running; the caller sets the time and pauses. */
export function startLoops(root: HTMLElement, loops: Loop[]): Animation[] {
  const made: Animation[] = [];
  for (const l of loops) {
    const el = root.querySelector(`[data-m="${l.key}"]`);
    if (!el) continue;
    const a = el.animate(l.frames, { duration: l.period, iterations: Infinity, delay: -l.phase * l.period, easing: 'linear' });
    a.id = `hero:${l.key}`;
    made.push(a);
  }
  return made;
}

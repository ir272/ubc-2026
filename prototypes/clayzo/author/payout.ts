// "Payout arrives": the chart's medallion is drawn in one gesture, a gold star lands on it, small stars fly out.
// Art direction (written before any node, as the Clayzo authoring skill asks):
//   verb: strike. geometry: rings and four-point stars (the moon medallion on Ian's chart reference).
//   scale: the medallion spans 66% of the frame. words: none (the amount is real text on the page).
//   punch: the gold star's pop, plateau and snap at 0.45 s; everything else draws or flies.
import { makeRng } from '../../../web/src/ui/ink/rng';
import { inkLine, inkRing, inkStar } from './ink';
import { at, GOLD, GREEN, INK, keyed, OUT, POP, rot, Scene, SNAP, t, v3, write } from './lib';

const s = new Scene('payout', 'Payout arrives', 480, 480, 2.6, 'A medallion is drawn, a gold star lands on it and small stars fly out');

// The medallion takes the hit when the star snaps to rest: one small swell, then still.
const hit = (id: string) => keyed(`${id}.hit`, [[0, v3(1), 'hold'], [t(0.8), v3(1), POP], [t(0.92), v3(1.045), SNAP], [t(1.08), v3(1)]]);

s.drawn('ring-outer', [inkRing(158, 'payout:outer', { w: 3.2, wobble: 0.7 })], INK, 3.2, 0, 0.42, { scale: hit('ring-outer') });
s.drawn('ring-inner', [inkRing(136, 'payout:inner', { w: 2, wobble: 0.7 })], INK, 2, 0.12, 0.38, { scale: hit('ring-inner') });

// The rope band between the two ink rings: short pencil marks that all grow at once.
const rng = makeRng('payout:rope');
const marks = Array.from({ length: 64 }, (_, i) => {
  const a = ((i + (rng() - 0.5) * 0.5) / 64) * Math.PI * 2;
  const lean = a + 0.11;
  return inkLine([Math.cos(a) * 140, Math.sin(a) * 140], [Math.cos(lean) * 154, Math.sin(lean) * 154], `payout:rope:${i}`);
});
s.drawn('rope', marks, GREEN, 2.2, 0.34, 0.28, { scale: hit('rope'), ease: OUT });
s.drawn('ring-gold', [inkRing(118, 'payout:gold', { w: 2.6, wobble: 0.7 })], GOLD, 2.6, 0.5, 0.4, { scale: hit('ring-gold') });

// Small stars fly out from the centre to the rim, in an irregular order, then twinkle.
const SMALL = [
  { a: -64, r: 203, size: 19, gold: true, at: 0.62, tw: 1.5 },
  { a: 28, r: 207, size: 13, gold: false, at: 0.74, tw: 1.9 },
  { a: 152, r: 201, size: 16, gold: false, at: 0.68, tw: 1.3 },
  { a: -148, r: 208, size: 12, gold: true, at: 0.86, tw: 2.1 },
  { a: 96, r: 204, size: 21, gold: true, at: 0.8, tw: 1.7 },
  { a: -12, r: 209, size: 10, gold: false, at: 0.92, tw: 1.45 },
];
SMALL.forEach((k, i) => {
  const rad = (k.a * Math.PI) / 180;
  const id = `spark-${i}`;
  s.filled(id, [inkStar(k.size, `payout:${id}`)], k.gold ? GOLD : INK, {
    from: k.at,
    position: keyed(`${id}.pos`, [[t(k.at), at(s.cx, s.cy), OUT], [t(k.at + 0.3), at(s.cx + Math.cos(rad) * k.r, s.cy + Math.sin(rad) * k.r)]]),
    scale: keyed(`${id}.scale`, [
      [t(k.at), v3(0.2), POP], [t(k.at + 0.22), v3(1.12), SNAP], [t(k.at + 0.32), v3(1), 'hold'],
      [t(k.tw), v3(1), SNAP], [t(k.tw + 0.12), v3(0.62), POP], [t(k.tw + 0.3), v3(1.1), SNAP], [t(k.tw + 0.42), v3(1)],
    ]),
    rotation: keyed(`${id}.rot`, [[t(k.at), rot(-80), OUT], [t(k.at + 0.34), rot(0), 'hold'], [t(k.tw), rot(0), SNAP], [t(k.tw + 0.3), rot(22), SNAP], [t(k.tw + 0.42), rot(0)]]),
  });
});

// The hero: one gold star that pops past its size, holds a beat, and snaps to rest while it turns upright.
s.filled('star', [inkStar(74, 'payout:star')], GOLD, {
  from: 0.4,
  scale: keyed('star.scale', [[t(0.4), v3(0), POP], [t(0.68), v3(1.18), 'linear'], [t(0.8), v3(1.19), SNAP], [t(0.9), v3(1), 'hold'], [t(1.9), v3(1), SNAP], [t(2.04), v3(1.07), SNAP], [t(2.2), v3(1)]]),
  rotation: keyed('star.rot', [[t(0.4), rot(-60), OUT], [t(0.9), rot(0)]]),
});

s.mark('ring', 0); s.mark('land', 0.9); s.mark('sparks', 1.24); s.mark('rest', 2.3);
write(s);

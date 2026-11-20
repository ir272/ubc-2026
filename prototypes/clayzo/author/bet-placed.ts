// "Bet placed": a ring is drawn by hand, the tick is struck through it, the ring takes the hit, three stars land.
// verb: strike. geometry: one ring, one tick, the chart's stars. scale: the ring spans 70% of the frame.
// words: none. punch: the tick's stroke at 0.22 s and the ring's swell as it lands.
import { inkCheck, inkRing, inkStar } from './ink';
import { GOLD, INK, keyed, OUT, POP, rot, Scene, SNAP, t, v3, write } from './lib';

const s = new Scene('bet-placed', 'Bet placed', 240, 240, 1.5, 'A ring is drawn and a tick is struck through it');

const swell = keyed('ring.hit', [[0, v3(1), 'hold'], [t(0.4), v3(1), POP], [t(0.5), v3(1.08), SNAP], [t(0.66), v3(1)]]);
s.drawn('ring', [inkRing(84, 'placed:ring', { w: 5, wobble: 0.9 })], INK, 5, 0, 0.3, { scale: swell });

// The tick: a quick down-stroke, then the long flick up. Drawn at one pen speed, landing on the swell.
s.drawn('tick', [inkCheck(96, 'placed:tick')], GOLD, 10, 0.22, 0.24, {
  y: s.cy + 4,
  ease: OUT,
  scale: keyed('tick.hit', [[0, v3(1), 'hold'], [t(0.44), v3(1), POP], [t(0.52), v3(1.1), SNAP], [t(0.68), v3(1)]]),
});

const STARS = [
  { x: 204, y: 44, size: 15, gold: true, at: 0.5 },
  { x: 30, y: 62, size: 10, gold: false, at: 0.58 },
  { x: 200, y: 204, size: 9, gold: false, at: 0.66 },
];
STARS.forEach((k, i) => {
  const id = `star-${i}`;
  s.filled(id, [inkStar(k.size, `placed:${id}`)], k.gold ? GOLD : INK, {
    from: k.at, x: k.x, y: k.y,
    scale: keyed(`${id}.scale`, [[t(k.at), v3(0), POP], [t(k.at + 0.14), v3(1.2), SNAP], [t(k.at + 0.26), v3(1), 'hold'], [t(1.02 + i * 0.1), v3(1), SNAP], [t(1.12 + i * 0.1), v3(0.7), POP], [t(1.26 + i * 0.1), v3(1)]]),
    rotation: keyed(`${id}.rot`, [[t(k.at), rot(-70), OUT], [t(k.at + 0.26), rot(0)]]),
  });
});

s.mark('ring', 0); s.mark('tick', 0.46); s.mark('rest', 1.3);
write(s);

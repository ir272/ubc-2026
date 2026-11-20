// "Chat sent": the message leaves along the line it was written on. A gold stroke races down the rule with a
// star at its head; the stroke is used up behind it, and the star bursts into three sparks where it lands.
// verb: send. geometry: one ruled line, the chart's stars. Nothing is left on screen at the end.
import { inkLine, inkStar } from './ink';
import { at, GOLD, INK, keyed, OUT, POP, rot, Scene, SNAP, t, trim, v3, write } from './lib';
import { base, constant, stroke, type SceneNode } from '@clayzo/animation/authoring';

const s = new Scene('chat-sent', 'Chat sent', 360, 72, 0.9, 'A star races along the line and bursts');
const X0 = 16, X1 = 338, Y0 = 46, Y1 = 40;
const GO = 0.34; // the head's travel time

// The comet: `end` leads, `start` follows, so a dash runs the line and is gone when it arrives.
s.add({
  ...base('comet', { outTick: s.duration, x: 0, y: 0 }),
  type: 'path',
  path: constant({ contours: [inkLine([X0, Y0], [X1, Y1], 'sent:line', { w: 3, wobble: 0.5 })] }),
  style: { stroke: stroke(GOLD, 3.2, { cap: 'round' }) },
  operators: [trim('comet.trim', {
    end: keyed('comet.end', [[0, 0, OUT], [t(GO), 1]]),
    start: keyed('comet.start', [[0, 0, 'hold'], [t(0.1), 0, OUT], [t(GO + 0.14), 1]]),
  })],
} as SceneNode);

s.filled('head', [inkStar(13, 'sent:head')], GOLD, {
  position: keyed('head.pos', [[0, at(X0, Y0), OUT], [t(GO), at(X1, Y1)]]),
  rotation: keyed('head.rot', [[0, rot(0), OUT], [t(GO), rot(180), 'linear'], [t(GO + 0.22), rot(240)]]),
  scale: keyed('head.scale', [[0, v3(0.4), POP], [t(0.1), v3(1), 'hold'], [t(GO), v3(1), POP], [t(GO + 0.1), v3(1.7), SNAP], [t(GO + 0.24), v3(0)]]),
});

const SPARKS = [
  { dx: 14, dy: -22, size: 7, gold: false },
  { dx: -20, dy: -14, size: 6, gold: true },
  { dx: 10, dy: 20, size: 6, gold: false },
];
SPARKS.forEach((k, i) => {
  const id = `spark-${i}`;
  const from = GO + 0.04 + i * 0.03;
  s.filled(id, [inkStar(k.size, `sent:${id}`)], k.gold ? GOLD : INK, {
    from,
    position: keyed(`${id}.pos`, [[t(from), at(X1, Y1), OUT], [t(from + 0.26), at(X1 + k.dx, Y1 + k.dy)]]),
    scale: keyed(`${id}.scale`, [[t(from), v3(0.3), POP], [t(from + 0.12), v3(1), SNAP], [t(from + 0.4), v3(0)]]),
  });
});

s.mark('go', 0); s.mark('land', GO);
write(s, { transient: true });

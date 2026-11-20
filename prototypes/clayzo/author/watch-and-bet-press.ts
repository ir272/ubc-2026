// "Watch and bet", inside the button: the compass rose at button size. It is drawn bold and dark, because it
// plays on the primary button's light plate at about 40 px. 0.7 s: the ring is drawn, the rose swings and settles.
// verb: swing. geometry: one ring, eight spikes. scale: the rose fills the frame. words: none.
import { inkRing, spike } from './ink';
import { keyed, OUT, PAPER, POP, rot, Scene, SNAP, t, v3, write } from './lib';

const s = new Scene('watch-and-bet-press', 'Watch and bet (in the button)', 96, 96, 0.7, 'A compass rose swings and settles');

s.drawn('ring', [inkRing(41, 'press:ring', { w: 6, wobble: 1.2 })], PAPER, 6, 0, 0.16, { ease: OUT });

const swing = (id: string) => ({
  from: 0.04,
  scale: keyed(`${id}.scale`, [[t(0.04), v3(0), POP], [t(0.24), v3(1.1), SNAP], [t(0.34), v3(1)]]),
  rotation: keyed(`${id}.rot`, [[t(0.04), rot(-150), OUT], [t(0.3), rot(16), SNAP], [t(0.44), rot(-6), SNAP], [t(0.56), rot(0)]]),
});
s.filled('rose-inter', [45, 135, 225, 315].map((d) => spike(d, 22, 5.5)), PAPER, swing('rose-inter'));
s.filled('rose-card', [0, 90, 180, 270].map((d) => spike(d, d === 0 ? 36 : 31, 7)), PAPER, swing('rose-card'));

s.mark('swing', 0.3); s.mark('rest', 0.56);
write(s);

// "Watch and bet": a course is set. The compass rose from Ian's chart is drawn, swings round and settles
// on its heading, and rhumb lines run out from the rim.
// verb: swing. geometry: the compass rose (ring, spikes, rhumb lines). scale: the rose spans 62% of the frame.
// words: none. punch: the rose swinging past its heading and back at 0.5 s.
import { inkLine, inkRing, spike } from './ink';
import { GOLD, INK, keyed, OUT, POP, rot, Scene, SNAP, t, v3, write } from './lib';

const s = new Scene('watch-and-bet', 'Watch and bet', 480, 480, 1.8, 'A compass rose is drawn, swings and settles on its heading');

s.drawn('ring', [inkRing(150, 'course:ring', { w: 3, wobble: 0.7 })], INK, 3, 0, 0.36);
s.drawn('ring-gold', [inkRing(132, 'course:gold', { w: 2.2, wobble: 0.7 })], GOLD, 2.2, 0.1, 0.36);

// The rose: it grows from the pin and swings past north before it settles.
const swing = (id: string) => ({
  from: 0.18,
  scale: keyed(`${id}.scale`, [[t(0.18), v3(0), POP], [t(0.46), v3(1.08), SNAP], [t(0.6), v3(1)]]),
  rotation: keyed(`${id}.rot`, [[t(0.18), rot(-150), OUT], [t(0.56), rot(16), SNAP], [t(0.78), rot(-6), SNAP], [t(0.96), rot(0)]]),
});
const minor = Array.from({ length: 8 }, (_, i) => spike(22.5 + i * 45, 74, 5, 20));
const inter = [45, 135, 225, 315].map((d) => spike(d, 100, 11));
const card = [0, 90, 180, 270].map((d) => spike(d, d === 0 ? 142 : 124, 14));
s.filled('rose-minor', minor, INK, swing('rose-minor'));
s.filled('rose-inter', inter, GOLD, swing('rose-inter'));
s.filled('rose-card', card, INK, swing('rose-card'));

// Rhumb lines run out past the rim once the rose is nearly still.
const rhumbs = Array.from({ length: 16 }, (_, i) => {
  const a = ((i * 22.5 - 90) * Math.PI) / 180;
  const far = i % 4 === 0 ? 226 : i % 2 === 0 ? 206 : 190;
  return inkLine([Math.cos(a) * 164, Math.sin(a) * 164], [Math.cos(a) * far, Math.sin(a) * far], `course:rhumb:${i}`, { w: 1.6, wobble: 0.3 });
});
s.drawn('rhumbs', rhumbs, GOLD, 1.8, 0.62, 0.3, { ease: OUT });

s.mark('ring', 0); s.mark('swing', 0.56); s.mark('rest', 1.2);
write(s);

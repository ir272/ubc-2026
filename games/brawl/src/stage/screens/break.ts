// The break (phase 'break', after a lost life). The knockout module plays the blast and the replay
// first; this file dresses the break around it.
//
// 1. The 15 s window: the clock slams in at the top centre, one phase word under it. Last five
//    seconds: it runs hot and the word says LAST CALL.
// 2. The lock beat: when the window locks, LOCKED slams across before the resume's numbers.
// Clean-look pass (Nov 19): the lives line (the knockout call and the HUD already show lives) and
// the header plates with the bots' names (the HUD shows them) are gone.
// Owner's rule (Nov 19, 15:12): the corner-talk lines are gone; the stage ignores corner_talk text.
// A coach's new stance shows only as its mark on the HUD. Do not put the lines back.
// Everything is a function of the show clock.

import type { CreateScreen, Frame, StageCtx, StageModule } from '../api.ts';
import { TIMING } from '../../show/events.ts';
import { DELAY_MS } from '../../show/playback.ts';
import { FONTS, PALETTE, el } from '../style.ts';
import { LockBeat } from './predictions.ts';
import { CountdownTrack, WindowClock, fade, plate, put, shown, slamScale, slideIn, text } from './showkit.ts';

const CLOCK_W = 236;
const CLOCK_H = 178;

export const createScreen: CreateScreen = (ctx: StageCtx): StageModule => {
  const layer = el('div', ctx.ui, { position: 'absolute', inset: '0', display: 'none', pointerEvents: 'none', overflow: 'hidden', zIndex: '3' });

  // ---- the window clock and the phase word under it ----
  const clock = new WindowClock(layer, 640 - CLOCK_W / 2, 12, CLOCK_W, CLOCK_H);
  const stripBox = el('div', layer, { position: 'absolute', left: '0', top: '0', willChange: 'transform' });
  const stripPlate = plate(stripBox, { left: 640 - 170, top: 12 + CLOCK_H + 8, width: 340, height: 46 }, PALETTE.hazard, { left: true, right: true }, 5);
  const strip = el('div', stripPlate.face, {
    position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
    fontFamily: FONTS.display, fontWeight: '900', fontSize: '34px', color: PALETTE.navy, textTransform: 'uppercase', letterSpacing: '0.04em',
  });
  const stripTxt = el('div', strip, { transform: 'skewX(-12deg)' });
  let stripHot = false;

  const lock = new LockBeat(layer);
  const track = new CountdownTrack();

  return {
    update(frame: Frame) {
      const s = frame.show;
      const f = frame.fight;
      const t = s.phaseMs;

      // ---- the resume's lock beat (the fight phase has begun) ----
      if (s.phase === 'fight' && f && s.ctx) {
        const c = s.ctx;
        const ci = track.read(t, frame.now, f.countdownMs, c.lives, c.header?.lives ?? 2, (st) => (st ? TIMING.countdown : TIMING.resumeCountdown) + DELAY_MS);
        const on = !ci.isStart && t < ci.lockLen;
        shown(layer, on);
        if (on) {
          shown(clock.root, false);
          shown(stripBox, false);
          lock.update(t, ci.lockLen);
        } else lock.update(-1, 0);
        return;
      }
      lock.update(-1, 0);

      const on = s.phase === 'break' && !!s.ctx;
      shown(layer, on);
      if (!on) return;
      const replaying = !!f && f.mode === 'replay';

      // ---- the window ----
      const w = s.window && s.window.durationMs > 0 ? s.window : null;
      const we = w ? Math.max(0, w.durationMs - w.msLeft) : -1; // ms since the window opened
      shown(clock.root, !!w);
      shown(stripBox, !!w);
      if (w) {
        const left = w.state === 'open' ? w.msLeft : 0;
        clock.update(left, w.durationMs);
        if (left > 5000) put(clock.root, 0, 0, slamScale(we - 60, 80, 1.7));
        put(stripBox, 0, slideIn(we - 160, -60, 120), 1);
        fade(stripBox, we >= 160 ? 1 : 0);
        const urgent = left <= 5000;
        text(stripTxt, left <= 0 ? 'Locked' : urgent ? 'Last call' : 'Predictions');
        if (urgent !== stripHot) {
          stripHot = urgent;
          stripPlate.face.style.background = urgent ? PALETTE.white : PALETTE.hazard;
        }
      }

      // push the set back while the clock is up, never during the replay
      if (!replaying) frame.post.dim = Math.max(frame.post.dim, w ? 0.42 : 0.2);
    },
    dispose() {
      layer.remove();
    },
  };
};

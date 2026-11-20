// Predictions (phase 'predictions', about 30 s, over the arena with both fighters waiting), the
// countdown into the fight (and the shorter one at every resume), and the overdrive call when
// regulation runs out.
//
// Predictions: the phase call slams across the middle on a hazard band, then cuts away to the clock
// at the top: one big numeral of seconds left with the phase word under it. Last five seconds: the
// clock plate flips to hazard, each second kicks, the word says LAST CALL.
// At lock (the fight phase begins with the countdown): LOCKED slams across, then 3, 2, 1 and the
// start word, plain and big, one layer each.
// Clean-look pass (Nov 19): the matchup wings (the HUD already names both sides), the banded fills,
// the speed streaks and the welding arcs on the start word, the clock's drain bar, and the cut
// through the letters are gone. The sudden-death call now says what the clock says.
// Owner's rule (Nov 19, 15:12): the word under the clock is one word (Predictions), or LAST CALL,
// or LOCKED. The sudden-death words show once: the HUD clock stays away while this call is up.
// Everything is a function of the show clock (phaseMs, the window's msLeft, countdownMs, the tick).

import type { CreateScreen, Frame, StageCtx, StageModule } from '../api.ts';
import type { Side } from '../../sim/types.ts';
import { TIMING } from '../../show/events.ts';
import { DELAY_MS } from '../../show/playback.ts';
import { FONTS, PALETTE, el } from '../style.ts';
import {
  CountdownTrack, CutWord, FRAME_MS, WindowClock, clamp01, easeInCubic, fade, flashFrames, plate, put, seg, shake, shown, slamScale, slideIn, text,
} from './showkit.ts';

/** the lock beat: LOCKED slammed across the middle on a hazard band. Shared with the break. */
export class LockBeat {
  root: HTMLDivElement;
  private band: HTMLDivElement;
  private word: CutWord;
  private wordBox: HTMLDivElement;
  private ww = 0;
  private wh = 0;
  constructor(parent: HTMLElement, label = 'Locked') {
    this.root = el('div', parent, { position: 'absolute', inset: '0', display: 'none', pointerEvents: 'none' });
    const p = plate(this.root, { left: -60, top: 262, width: 1400, height: 150 }, PALETTE.hazard, { left: true, right: true }, 9);
    this.band = p.root;
    this.wordBox = el('div', this.root, { position: 'absolute', left: '0', top: '0', willChange: 'transform' });
    this.word = new CutWord(this.wordBox, { size: 176, top: PALETTE.navy, bottom: PALETTE.navy, skew: -13, gap: 0, rest: 0, letterSpacing: '0.02em' });
    this.word.setText(label);
  }
  /** t = ms since the lock; len = how long the beat lasts. Returns the flash to add to post. */
  update(t: number, len: number): number {
    const on = t >= 0 && t < len;
    shown(this.root, on);
    if (!on) return 0;
    if (!this.ww) {
      const m = this.word.measure();
      this.ww = m.w;
      this.wh = m.h;
    }
    // the band slams in from the left (4 frames), the word lands on it; the last 3 frames cut away
    const out = seg(t, len - 3 * FRAME_MS, len);
    put(this.band, slideIn(t, -1500, 70), shake(t, 70, 7, 140), 1, 0);
    fade(this.band, 1 - out);
    put(this.wordBox, 640 - this.ww / 2 + shake(t, 110, 9, 150), 337 - this.wh / 2, slamScale(t - 40, 70, 1.8));
    this.word.pose(0, 1 - out);
    return 0;
  }
}

/** the window clock with the phase word under it */
class Bug {
  root: HTMLDivElement;
  clock: WindowClock;
  stripBox: HTMLDivElement;
  strip: HTMLDivElement;
  stripHot = false;
  stripPlate: ReturnType<typeof plate>;
  constructor(parent: HTMLElement) {
    this.root = el('div', parent, { position: 'absolute', inset: '0', pointerEvents: 'none' });
    this.clock = new WindowClock(this.root, 640 - 118, 12, 236, 178);
    this.stripBox = el('div', this.root, { position: 'absolute', left: '0', top: '0', willChange: 'transform' });
    this.stripPlate = plate(this.stripBox, { left: 640 - 200, top: 200, width: 400, height: 50 }, PALETTE.hazard, { left: true, right: true }, 5);
    this.strip = el('div', this.stripPlate.face, {
      position: 'absolute', inset: '0', display: 'flex', alignItems: 'center', justifyContent: 'center',
      fontFamily: FONTS.display, fontWeight: '900', fontSize: '38px', color: PALETTE.navy, textTransform: 'uppercase', letterSpacing: '0.04em',
    });
    el('div', this.strip, { transform: 'skewX(-12deg)' });
  }
  setStrip(s: string, hot: boolean): void {
    text(this.strip.firstElementChild as HTMLElement, s);
    if (hot !== this.stripHot) {
      this.stripHot = hot;
      this.stripPlate.face.style.background = hot ? PALETTE.white : PALETTE.hazard;
    }
  }
  /** entrance at t (ms since it starts): the clock slams, the word drops under it */
  pose(t: number): void {
    put(this.clock.root, 0, 0, slamScale(t, 90, 1.6));
    put(this.stripBox, 0, slideIn(t - 150, -60, 120), 1);
    fade(this.stripBox, t >= 150 ? 1 : 0);
  }
}

// timeline of the phase (ms)
const TITLE_IN = 0;
const TITLE_OUT = 1650;
const BUG_IN = 1600;

export const createScreen: CreateScreen = (ctx: StageCtx): StageModule => {
  // above the HUD (z 2): the calls must sit on top of everything
  const layer = el('div', ctx.ui, { position: 'absolute', inset: '0', pointerEvents: 'none', overflow: 'hidden', zIndex: '3' });

  // ---- predictions ----
  const pred = el('div', layer, { position: 'absolute', inset: '0', display: 'none' });
  const titleBand = plate(pred, { left: -60, top: 296, width: 1400, height: 168 }, PALETTE.hazard, { left: true, right: true }, 10);
  const titleBox = el('div', pred, { position: 'absolute', left: '0', top: '0', willChange: 'transform' });
  const title = new CutWord(titleBox, { size: 156, top: PALETTE.navy, bottom: PALETTE.navy, skew: -13, gap: 0, rest: 0, letterSpacing: '0.01em' });
  title.setText('Predictions open');
  let titleW = 0;
  let titleH = 0;
  const bug = new Bug(pred);

  // ---- the countdown, the start call, overdrive ----
  const cd = el('div', layer, { position: 'absolute', inset: '0', display: 'none' });
  const lock = new LockBeat(cd);
  const numBox = el('div', cd, { position: 'absolute', left: '0', top: '0', willChange: 'transform' });
  const num = new CutWord(numBox, { size: 330, top: PALETTE.hazard, bottom: PALETTE.hazard, skew: -12, outline: 9, drop: 12, gap: 0, rest: 0 });
  const goBox = el('div', cd, { position: 'absolute', left: '0', top: '0', willChange: 'transform' });
  const go = new CutWord(goBox, { size: 290, top: PALETTE.hazard, bottom: PALETTE.hazard, skew: -13, outline: 10, drop: 14, gap: 0, rest: 0, letterSpacing: '0.01em' });
  go.setText('Fight');
  const odBox = el('div', layer, { position: 'absolute', left: '0', top: '0', willChange: 'transform', display: 'none' });
  const od = new CutWord(odBox, { size: 170, top: PALETTE.white, bottom: PALETTE.white, skew: -13, outline: 8, drop: 10, gap: 0, rest: 0, letterSpacing: '0.01em' });
  od.setText('Sudden death');
  let goSize: { w: number; h: number } | null = null;
  let odSize: { w: number; h: number } | null = null;

  const track = new CountdownTrack();
  let suddenTick = -1;
  let suddenKey = '';

  let numNow = '';
  let numM = { w: 0, h: 0 };
  function measureNum(s: string): { w: number; h: number } {
    if (s !== numNow) {
      numNow = s;
      num.setText(s);
      numM = num.measure();
    }
    return numM;
  }

  return {
    update(frame: Frame) {
      const s = frame.show;
      const f = frame.fight;
      const t = s.phaseMs;

      // ================= predictions =================
      const inPred = s.phase === 'predictions' && !!s.ctx;
      shown(pred, inPred);
      if (inPred) {
        if (!titleW) {
          const m = title.measure();
          titleW = m.w;
          titleH = m.h;
        }
        const w = s.window;
        const dur = w?.durationMs ?? (s.phaseDurationMs || 30_000);
        const left = w ? (w.state === 'open' ? w.msLeft : 0) : Math.max(0, (s.phaseDurationMs || 30_000) - t);
        // the call: band slides in, the words slam, then everything splits away along the cut
        const titleOn = t < TITLE_OUT + 4 * FRAME_MS;
        shown(titleBand.root, titleOn);
        shown(titleBox, titleOn);
        if (titleOn) {
          const out = seg(t, TITLE_OUT - FRAME_MS, TITLE_OUT + 4 * FRAME_MS);
          put(titleBand.root, slideIn(t - TITLE_IN, -1500, 90) + out * 1500, shake(t, 90, 6, 140), 1);
          put(titleBox, 640 - titleW / 2 + shake(t, 150, 8, 150), 380 - titleH / 2, slamScale(t - 60, 90, 1.7));
          title.pose(0, 1 - easeInCubic(out));
          frame.post.flash = Math.max(frame.post.flash, flashFrames(t, 150, 2, 0.4));
          frame.post.dim = Math.max(frame.post.dim, 0.45 * (1 - out));
        }
        const bt = t - BUG_IN;
        shown(bug.root, bt >= 0);
        if (bt >= 0) {
          bug.pose(bt);
          bug.clock.update(left, dur);
          const urgent = left <= 5000;
          bug.setStrip(left <= 0 ? 'Locked' : urgent ? 'Last call' : 'Predictions', urgent);
          if (urgent && left > 0) {
            // each second: the frame jolts once
            const into = 1000 - (left % 1000 || 1000);
            frame.post.flash = Math.max(frame.post.flash, flashFrames(into, 0, 1, 0.12));
          }
        }
      }

      // ================= countdown / start call / overdrive =================
      const inFight = s.phase === 'fight' && !!f && !!s.ctx;
      let cdOn = false;
      if (inFight) {
        const c = s.ctx!;
        const ci = track.read(t, frame.now, f!.countdownMs, c.lives, c.header?.lives ?? 2, (st) => (st ? TIMING.countdown : TIMING.resumeCountdown) + DELAY_MS);
        const { total, nums, lockLen, isStart, goT } = ci;
        const cdLeft = ci.left;
        cdOn = t < total + 1300;
        shown(cd, cdOn);
        if (cdOn) {
          // the lock beat (the start only; the break draws its own before a resume)
          const lt = isStart ? t : -1;
          frame.post.flash = Math.max(frame.post.flash, lock.update(lt, lockLen));
          // the numbers
          const showNum = cdLeft > 0 && t >= lockLen;
          shown(numBox, showNum);
          if (showNum) {
            const n = Math.min(nums, Math.ceil(cdLeft / 1000));
            const into = n * 1000 - cdLeft; // ms into this number's second
            const m = measureNum(String(n));
            const out = seg(into, 1000 - 3 * FRAME_MS, 1000);
            // slams in, then keeps leaning toward the viewer through its hold so it is never dead
            const lean = 1 + 0.07 * seg(into, 180, 1000 - 3 * FRAME_MS);
            put(numBox, 640 - m.w / 2 + shake(into, 70, 10, 150), 250 - m.h / 2, slamScale(into, 70, 2.1) * lean);
            num.pose(0, 1 - out);
            frame.post.flash = Math.max(frame.post.flash, flashFrames(into, 70, 1, 0.14));
          }
          // the start word
          const showGo = goT >= -60 && goT < 1300;
          if (showGo && !goSize?.w) {
            shown(goBox, true);
            goSize = go.measure();
          }
          shown(goBox, showGo && goT >= 0);
          if (showGo && goSize) {
            const gx = 640 - goSize.w / 2;
            const gy = 260 - goSize.h / 2;
            if (goT >= 0) {
              const out = seg(goT, 780, 1000);
              const sc = slamScale(goT, 80, 2.3) * (1 + 0.05 * seg(goT, 200, 780));
              put(goBox, gx + shake(goT, 80, 14, 200), gy + shake(goT, 80 + FRAME_MS, 6, 160), sc);
              go.pose(0, 1 - easeInCubic(out));
              frame.post.flash = Math.max(frame.post.flash, flashFrames(goT, 80, 2, 0.6));
            }
          }
        }
      } else shown(cd, false);

      // sudden death: the sim's sudden_death, a 1.5 s call that never stops the fight
      let odOn = false;
      if (inFight && f!.mode === 'live') {
        const mk = `${s.ctx!.matchNo}:${s.ctx!.header?.seed ?? ''}`;
        if (mk !== suddenKey) {
          suddenKey = mk;
          suddenTick = -1;
        }
        for (const ev of f!.events) if (ev.t === 'sudden_death') suddenTick = ev.tick;
        if (f!.state.phase === 'sudden' && suddenTick < 0) suddenTick = s.ctx!.header?.timeLimitTicks ?? f!.state.tick;
        if (suddenTick >= 0 && f!.state.phase === 'sudden') {
          const ot = ((f!.state.tick - suddenTick) * 1000) / 60 + f!.alpha * FRAME_MS;
          odOn = ot >= 0 && ot < 1500;
          if (odOn) {
            if (!odSize?.w) {
              shown(odBox, true);
              odSize = od.measure();
            }
            const out = seg(ot, 1250, 1500);
            put(odBox, 640 - odSize.w / 2 + shake(ot, 80, 12, 200), 250 - odSize.h / 2, slamScale(ot, 80, 2));
            od.pose(0, 1 - out);
            frame.post.flash = Math.max(frame.post.flash, flashFrames(ot, 80, 2, 0.5));
            frame.post.dim = Math.max(frame.post.dim, 0.5 * (1 - seg(ot, 300, 1500)));
            frame.post.dimColor = '#1a0700';
          }
        }
      }
      shown(odBox, odOn);
    },
    dispose() {
      layer.remove();
    },
  };
};

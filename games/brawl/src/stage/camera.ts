// Ringout fight camera: the director of the broadcast.
//
// One side-on perspective camera with a long lens. Every frame it picks a shot from the show
// phase and the fight view, computes where that shot wants the camera (a centre on the fight
// plane z = 0 and the height H of the visible slice of that plane), and moves there with
// critically damped springs (no wobble, no drift). Shake and the contact zoom sit on top, in
// screen space, after the framing.
//
// Shots:
//   live       both fighters fitted into the safe band left by the HUD (scorebugs in the two
//              bottom corners, the clock top centre), zoom from their spacing (the numbers measured
//              from the reference footage: tight = a fighter is a third of the frame height).
//              A launch has its own rule: the frame holds dead still through the hit pause and the
//              first ticks of flight, so the launched fighter tears across it; only when the fighter
//              (or where it will be 6 ticks on) reaches the frame edge does the frame give way, in
//              a frame or two, panning with the fighter and widening just enough, the attacker
//              left at the trailing edge. Off stage the ledge sits at the far third. A knockout gets
//              a beat on the edge it went through, then the frame opens for the respawn pad.
//   countdown  a short pull back that lands exactly on the live framing at tick 0
//   replay     lower, yawed behind the launch, locked tight on the victim; it lets the victim
//              fly out of the frame at the end instead of chasing it to the blast line
//   predict    slow push-ins on the waiting fighters, alternating sides, with cuts
//   break      a slow dolly across the deck
//   verdict    a push in on the winner
//   establish  (no fight on the deck) a slow drift across the set
//
// Everything is a function of frame.dt and state. No wall clock, no allocation per frame.

import * as THREE from 'three';
import type { CameraRig, CreateCamera, Frame, FightView, StageCtx } from './api.ts';
import type { FighterState, Side } from '../sim/types.ts';

// ---- lens ----
const FOV = 22; // vertical degrees: a long lens, so the set compresses behind the fighters
const TAN_HALF = Math.tan(THREE.MathUtils.degToRad(FOV / 2));
const ASPECT = 16 / 9;

// ---- framing numbers (H = visible height of the fight plane in metres) ----
const H_MIN = 5.9; // tightest: a 1.9 m robot is ~33% of the frame (the footage's tight shot)
const H_MAX = 17.2; // widest the live framing asks for (containment may go past it)
// visible width from the horizontal spread of the subjects: at range the pair fills the frame
// (a 10 m gap keeps the small robot ~125 px tall); the stage may leave the frame
const W_BASE = 3.4;
const W_PER_M = 1.18;
// The safe band, in fractions of the frame height from the bottom edge. The HUD is a scorebug in
// each bottom corner (x < 420 or x > 860 of 1280, y > 530 of 720) with the middle of the bottom
// clear, and the clock top centre (x 560-720, y < 60). d = a subject's horizontal distance from
// frame centre in half-widths.
const FEET_MID = 0.215; // feet over the clear middle of the bottom edge (y ~565)
const FEET_SIDE = 0.278; // feet over a corner scorebug (y ~520)
const TOP_MID = 0.745; // tag anchor under the clock: the 34 px tag ends 90 px under the clock
const TOP_SIDE = 0.865; // tag anchor clear of the clock
const feetAt = (d: number) => FEET_MID + (FEET_SIDE - FEET_MID) * smooth((d - 0.2) / 0.12);
const topAt = (d: number) => TOP_MID + (TOP_SIDE - TOP_MID) * smooth((d - 0.22) / 0.14);
const FLOOR_TIGHT = 0.29; // the deck line when tight: floor under the pair, the pair around the middle
const FLOOR_WIDE = 0.285; // the deck line at range (fighters near the corners stand over the scorebugs)
const TAG = 0.12; // the name tag's anchor above the head (hud.ts)
const PAD_SIDE = 0.1;
const DECAY = 0.0204; // launch speed decay per tick (sim/engine.ts, sim 2)
const PAD_STOP_Y = 6.2; // where the respawn pad stops (sim/arena.ts)
const PITCH_LIVE = 0.095; // looking down a little: the deck top reads as floor
const KO_HOLD = 0.8; // seconds the live knockout holds on the edge it went through (the blast column)

// ---- spring rates (rad/s); critically damped ----
const W_MOVE = 6.5;
const W_ZOOM_IN = 6.6;
const W_ZOOM_OUT = 7.5;

// ---- shake: per-frame offsets in px at 1280x720, alternating along the hit ----
const PAT_HEAVY = [14, -9, 12, -6, 9, -4, 6, -3, 4, -2, 2, -1];
const PAT_MED = [7, -4.5, 6, -3, 4, -2];
const PAT_LIGHT = [3];

type Shot = 'live' | 'countdown' | 'replay' | 'predict' | 'break' | 'verdict' | 'establish' | 'wide';

/** one axis of a critically damped spring, closed form (stable for any dt) */
function spring(x: number, v: number, target: number, w: number, dt: number, out: { x: number; v: number }): void {
  const d = x - target;
  const e = Math.exp(-w * dt);
  const t = (v + w * d) * dt;
  out.x = target + (d + t) * e;
  out.v = (v - w * t) * e;
}

const clamp = (v: number, a: number, b: number) => (v < a ? a : v > b ? b : v);
function smooth(t: number): number {
  const u = clamp(t, 0, 1);
  return u * u * (3 - 2 * u);
}
const easeOut = (t: number) => {
  const u = clamp(t, 0, 1);
  return 1 - (1 - u) * (1 - u) * (1 - u);
};

export const createCamera: CreateCamera = (ctx: StageCtx): CameraRig => {
  const cam = ctx.camera;
  const ar = ctx.arena;
  const B = ar.blast;
  cam.fov = FOV;
  cam.near = 0.5;
  cam.far = 700;
  cam.updateProjectionMatrix();

  let mode: 'auto' | 'wide' | 'follow' | 'close' = 'auto';
  let followSide: Side = 0;

  // spring state: centre on the fight plane and log of the visible height
  let cx = 0, cy = 2, lh = Math.log(12);
  let vx = 0, vy = 0, vlh = 0;
  const sp = { x: 0, v: 0 };
  let first = true;

  // targets written by the shot functions
  let tx = 0, ty = 0, tH = 12;
  let yaw = 0; // radians, + = camera sits to the left of its target and looks right
  let pitch = 0.07; // radians, + = camera above, looking down
  let roll = 0;
  let snapNext = false; // a cut: jump straight to the target
  let hold = false; // this frame the framing is held exactly where it is (hit pause, a launch)
  let ffReset = true; // restart the target-velocity estimate (after a cut or a hold)
  // target velocity (filtered), fed forward so the springs do not trail a moving pair
  let ptx = 0, pty = 0, tvx = 0, tvy = 0;

  // shot bookkeeping
  let shot: Shot = 'establish';
  let shotT = 0; // seconds in the current shot
  let shotKey = '';
  let cdTotal = 0;
  let clock = 0; // accumulated show seconds (for the establish drift)
  let fno = 0; // rendered frame counter
  let lastPhase = '';
  let sawReplay = false; // in this break, the replay has started (the live knockout beat is over)

  // ---- the launch: hold through the hit pause, then give way only as much as the victim needs ----
  let lOn = false;
  let lV: Side = 1; // victim
  let lA: Side = 0; // attacker
  let lFly = 0; // seconds since the victim left the hit pause (0 while frozen)
  let lLethal = false; // a launch that will cross a blast line: the frame lets the victim leave it
  let lPhase = 0; // 0 hit pause (held), 1 tearing across the held frame, 2 the frame gives way
  let lSpd0 = 0; // launch speed (m/tick) on release
  let lH0 = 0; // frame height when the frame gave way
  let ltx = 0, lty = 0, ltH = 0; // the launch frame this frame

  // ---- the live knockout beat ----
  let koT = -1; // seconds since the knockout, -1 = none this break
  let koEdge: 'left' | 'right' | 'top' | 'bottom' = 'left';
  let koX = 0, koY = 0;

  // ---- shake (screen space) and the contact zoom ----
  let shPat = PAT_LIGHT;
  let shI = 99; // index into the pattern; past the end = still
  let shScale = 0;
  let shDX = 0, shDY = 1;
  let shAcc = 0;
  let shFresh = false;
  let shFrame = -9; // frame the running pattern started on
  let shOX = 0, shOY = 0; // px this frame
  let zjAmt = 0; // the contact zoom: one frame up, one frame settling
  let zjI = 9;
  let zjFrame = -9;

  // ---- the lethal push-in (ko/lethal.ts asks for it with strength 1) ----
  let punchAge = -1; // seconds since punch() or -1
  let punchHold = 0;
  let punchStrength = 0;
  let punchX = 0, punchY = 0;

  // subject points, preallocated: x, bottom y, top y, half width, extra top allowance, side margin
  const MAXP = 12;
  const PX = new Float64Array(MAXP);
  const PY0 = new Float64Array(MAXP);
  const PY1 = new Float64Array(MAXP);
  const PW = new Float64Array(MAXP);
  const PT = new Float64Array(MAXP);
  const PM = new Float64Array(MAXP);
  const PIN = new Uint8Array(MAXP); // in the current fit
  let np = 0;
  function addPoint(x: number, y0: number, y1: number, hw: number, top = 0): number {
    if (np >= MAXP) return -1;
    PX[np] = x;
    PY0[np] = y0;
    PY1[np] = y1;
    PW[np] = hw;
    PT[np] = top;
    PM[np] = 0.025;
    return np++;
  }
  // the fighters that must never leave the frame (index into PX..), -1 = none
  const must = [-1, -1];
  // a recovery off stage: the ledge to put at the far third (NaN = none)
  let recLedge = NaN;
  let recFrom = 0;

  const ix = (f: FighterState, p: FighterState, a: number) => p.x + (f.x - p.x) * a;
  const iy = (f: FighterState, p: FighterState, a: number) => p.y + (f.y - p.y) * a;
  const heightOf = (f: FighterState) => ctx.fighterDefs[f.fighter]?.height ?? 2;
  const widthOf = (f: FighterState) => ctx.fighterDefs[f.fighter]?.width ?? 1;
  const inPlay = (f: FighterState) =>
    f.action !== 'dead' && f.x > B.left - 1.5 && f.x < B.right + 1.5 && f.y > B.bottom - 1.5 && f.y < B.top + 1.5;
  const offStage = (f: FighterState) => f.x < ar.main.x0 - 0.1 || f.x > ar.main.x1 + 0.1 || (f.y < -0.4 && !f.grounded);
  const flying = (f: FighterState) => f.action === 'hitstun' && f.tumble;

  /** collect one fighter into the point list (returns its index or -1) */
  function addFighter(fv: FightView, side: Side, recovery = true): number {
    const f = fv.state.fighters[side];
    const p = fv.prev.fighters[side];
    if (!inPlay(f)) return -1;
    const x = ix(f, p, fv.alpha);
    const y = iy(f, p, fv.alpha);
    const h = heightOf(f);
    // the body plus a reaching fist (a swing reaches a good metre past the body)
    const hw = widthOf(f) * 0.5 + (f.action === 'attack' || f.action === 'charge' ? 0.9 : 0.4);
    // a tumbling fighter's tag is faded out (hud.ts): its head may go a little higher
    const fl = flying(f);
    const i = addPoint(x, y - 0.05, y + h + TAG, hw, 0);
    must[side] = i;
    // off stage on the way back (not flying): keep the ledge and some deck in shot, and later put
    // the ledge at the far third so the gap to safety is the subject
    if (recovery && !fl && offStage(f) && f.action !== 'respawn' && f.y > B.bottom + 0.5) {
      const left = x < 0;
      const lx = left ? ar.main.x0 : ar.main.x1;
      addPoint(lx + (left ? 1.4 : -1.4), -0.05, 0.4, 0.2);
      if (Number.isNaN(recLedge) || Math.abs(x - lx) > Math.abs(recFrom - recLedge)) {
        recLedge = lx;
        recFrom = x;
      }
      // rising back fast (a recovery move): frame where it will be, so the frame opens ahead of it
      // instead of the hard guarantee popping it open at the last moment
      if (f.vy > 0.1) {
        const n = 8;
        const g = ctx.fighterDefs[f.fighter]?.gravity ?? 0.006;
        const py = y + f.vy * n - (g * n * n) / 2;
        if (py > y) addPoint(x + f.vx * n, py - 0.05, py + h + TAG, hw * 0.6);
      }
    }
    return i;
  }

  /** where a launched fighter will be in n ticks (the sim's decay and gravity, no control) */
  let predX = 0, predY = 0;
  function predict(fv: FightView, side: Side, n: number): void {
    const f = fv.state.fighters[side];
    const p = fv.prev.fighters[side];
    let lx = f.vx, ly = f.vy;
    // the first tick out of hit pause: the velocity is stale, the launch vector is not
    if (Math.abs(f.x - p.x) + Math.abs(f.y - p.y) < 0.004 && f.hitlag === 0) {
      lx = f.kbx;
      ly = f.kby;
    }
    const spd = Math.sqrt(lx * lx + ly * ly);
    const g = ctx.fighterDefs[f.fighter]?.gravity ?? 0.006;
    let k = n;
    if (spd > 1e-4) {
      const m = Math.min(n, spd / DECAY);
      k = (spd * m - (DECAY * m * m) / 2) / spd;
    }
    predX = clamp(ix(f, p, fv.alpha) + lx * k, B.left + 0.4, B.right - 0.4);
    predY = clamp(iy(f, p, fv.alpha) + ly * k - (g * n * (n + 1)) / 2, B.bottom + 0.4, B.top - 0.4);
  }

  /** where a launched fighter's flight runs out: steps the sim's launch rule (decay, gravity, fall
   *  cap) until the launch speed is spent, at most n ticks. Writes (endX, endY). */
  let endX = 0, endY = 0;
  function pathEnd(fv: FightView, side: Side, n: number): void {
    const f = fv.state.fighters[side];
    const p = fv.prev.fighters[side];
    let kx = f.vx, ky = f.vy;
    if (Math.abs(f.x - p.x) + Math.abs(f.y - p.y) < 0.004 && f.hitlag === 0) {
      kx = f.kbx;
      ky = f.kby;
    }
    const def = ctx.fighterDefs[f.fighter];
    const g = def?.gravity ?? 0.006;
    const fall = def?.fallSpeed ?? 0.2;
    let x = ix(f, p, fv.alpha), y = iy(f, p, fv.alpha), ov = 0;
    const y0 = y;
    // the flight that matters ends with the hitstun: after it the fighter flies itself (recovers)
    if (f.hitstun > 0 && f.hitstun < n) n = f.hitstun;
    for (let i = 0; i < n; i++) {
      const m = Math.sqrt(kx * kx + ky * ky);
      if (m < 0.05) break;
      const k = (m - DECAY) / m;
      kx *= k;
      ky *= k;
      ov = Math.max(ov - g, -fall);
      x += kx;
      y += ky + ov;
      if (x < B.left || x > B.right || y > B.top || y < B.bottom) break;
    }
    endX = clamp(x, B.left + 0.4, B.right - 0.4);
    // a falling end is not the subject (the fighter lands or recovers): at most a body below
    endY = clamp(Math.max(y, Math.min(y0, 0) - 0.3, y0 - 1.6), B.bottom + 0.4, B.top - 0.4);
  }

  const floorFracFor = (H: number) => FLOOR_TIGHT + (FLOOR_WIDE - FLOOR_TIGHT) * smooth((H - H_MIN) / 4.5);

  let ox = 0, oy = 0; // the result of fit()
  // band limits for the points in a fit (written by bandY)
  let yLo = 0, yHi = 0;
  /** the range of centre heights that keeps every point of the fit (PIN, or all) in the band */
  function bandY(x: number, H: number, all: boolean, feetLoose: number, topLoose: number, tallOnly = false): boolean {
    const hw = (H * ASPECT) / 2;
    yLo = -Infinity;
    yHi = Infinity;
    for (let i = 0; i < np; i++) {
      if (!all && !PIN[i]) continue;
      const d = Math.abs(PX[i] - x) / hw;
      const lo = PY1[i] - (topAt(d) + PT[i] + topLoose - 0.5) * H;
      if (lo > yLo) yLo = lo;
      if (tallOnly) continue;
      const hi = PY0[i] + (0.5 - feetAt(d) + feetLoose) * H;
      if (hi < yHi) yHi = hi;
    }
    return yLo <= yHi;
  }

  /** horizontal centre for the subjects at height H: a recovery puts the ledge at the far third,
   *  then everything is pulled in with a pad from the sides */
  function placeSubjX(H: number, x0: number, x1: number, xc: number, rec: boolean): number {
    const hw = (H * ASPECT) / 2;
    if (rec) xc = recLedge - Math.sign(recLedge - recFrom) * ((H * ASPECT) / 6);
    const lo = x1 + H * ASPECT * PAD_SIDE - hw;
    const hi = x0 - H * ASPECT * PAD_SIDE + hw;
    return lo <= hi ? clamp(xc, lo, hi) : (x0 + x1) / 2;
  }

  /** the range of centre x that keeps every pinned point inside its side margin (xLo > xHi: none) */
  let xLo = 0, xHi = 0;
  function xRange(H: number): void {
    const Wn = H * ASPECT;
    xLo = -Infinity;
    xHi = Infinity;
    for (let i = 0; i < np; i++) {
      if (!PIN[i]) continue;
      xLo = Math.max(xLo, PX[i] + PW[i] + PM[i] * Wn - Wn / 2);
      xHi = Math.min(xHi, PX[i] - PW[i] - PM[i] * Wn + Wn / 2);
    }
  }

  /** the least horizontal move from x that keeps every pinned point inside its side margin */
  function placeFitX(x: number, H: number): void {
    const Wn = H * ASPECT;
    let lo = -Infinity, hi = Infinity;
    for (let i = 0; i < np; i++) {
      if (!PIN[i]) continue;
      lo = Math.max(lo, PX[i] + PW[i] + PM[i] * Wn - Wn / 2);
      hi = Math.min(hi, PX[i] - PW[i] - PM[i] * Wn + Wn / 2);
    }
    ox = lo <= hi ? clamp(x, lo, hi) : (lo + hi) / 2;
  }

  /** subjects -> target centre and height (live framing rules) */
  function frameSubjects(hMin: number, floorY: number, wBase = W_BASE, floorAdj = 0, blast = true, hMax = H_MAX, wPer = W_PER_M): void {
    let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
    let gx0 = Infinity, gx1 = -Infinity;
    for (let i = 0; i < np; i++) {
      gx0 = Math.min(gx0, PX[i]);
      gx1 = Math.max(gx1, PX[i]);
      x0 = Math.min(x0, PX[i] - PW[i]);
      x1 = Math.max(x1, PX[i] + PW[i]);
      y0 = Math.min(y0, PY0[i]);
      y1 = Math.max(y1, PY1[i]);
    }
    if (np === 0) {
      tx = 0;
      tH = 9;
      ty = floorY + (0.5 - FLOOR_WIDE) * tH;
      return;
    }
    // width: from the spread of the subjects (the measured curve), never narrower than the bodies
    const span = gx1 - gx0;
    let W = Math.max(wBase + wPer * span, (x1 - x0) / (1 - 2 * PAD_SIDE));
    // a recovery: the ledge goes to the far third, so the frame must hold the fighter on the near side
    const rec = !Number.isNaN(recLedge);
    if (rec) W = Math.max(W, (Math.abs(recLedge - recFrom) + 0.7) / (0.5 - PAD_SIDE + 1 / 6));
    let H = Math.max(W / ASPECT, hMin);
    let xc = (x0 + x1) / 2;
    xc = placeSubjX(H, x0, x1, xc, rec);
    // height: everyone fits in the band. How much the deck belongs in the shot: fully while the
    // lowest subject is within about a body of it, not at all once everyone is well up in the air
    // (then the subjects are centred in the band and the deck slides down out of the picture).
    const kAir = smooth((y0 - floorY - 1.0) / 2.2);
    // the highest top, measured against the middle band (a subject off to the side may reach higher)
    bandY(xc, H, true, 0, 0, true);
    const topEff = yLo + (TOP_MID - 0.5) * H; // as if every subject were under the clock
    const ff0 = floorFracFor(H) + floorAdj;
    const hDeck = (topEff - floorY) / Math.max(0.3, TOP_MID - ff0);
    const hAir = (topEff - y0) / (TOP_MID - FEET_MID);
    H = Math.max(H, hDeck + (hAir - hDeck) * kAir);
    H = clamp(H, hMin, Math.max(hMin, hMax));
    xc = placeSubjX(H, x0, x1, xc, rec);
    for (let k = 0; k < 40 && !bandY(xc, H, true, 0, 0) && H < hMax; k++) {
      H = Math.min(hMax, H * 1.03);
      xc = placeSubjX(H, x0, x1, xc, rec);
    }
    bandY(xc, H, true, 0, 0);
    const ff = floorFracFor(H) + floorAdj;
    // vertical: the deck on its line, or with everyone up the subjects centred in the band
    const yDeck = floorY + (0.5 - ff) * H;
    const yAir = (y0 + y1) / 2 - ((TOP_MID + FEET_MID) / 2 - 0.5) * H;
    let yc = yDeck + Math.max(0, yAir - yDeck) * kAir;
    if (yLo <= yHi) yc = clamp(yc, yLo, yHi);
    else yc = yHi; // cannot hold both: feet first (the containment pass widens)
    // stay inside the blast lines: the edge of the world shows only when someone is out there
    if (blast) {
      const hw = (H * ASPECT) / 2;
      const lo = B.left - 0.5 + hw, hi = B.right + 0.5 - hw;
      xc = lo <= hi ? clamp(xc, lo, hi) : 0;
      yc = Math.min(yc, B.top + 0.6 - H / 2);
      yc = Math.max(yc, B.bottom + H / 2);
    }
    tx = xc;
    ty = yc;
    tH = H;
  }

  // ---------------------------------------------------------------------------------------------
  /** Fit the points marked in PIN into the frame with the least change: widen only if they cannot
   *  all fit, then move as little as possible. Each point keeps its side margin PM (a fraction of
   *  the width) from the side edges and stays in the band (loosened by feetLoose / topLoose).
   *  Writes (ox, oy) and returns the new height (never smaller than H). */
  function fit(x: number, y: number, H: number, feetLoose: number, topLoose: number, hCap = 60): number {
    let any = false;
    // width: every pair of points, with their margins, fits across
    let W = H * ASPECT;
    for (let i = 0; i < np; i++) {
      if (!PIN[i]) continue;
      any = true;
      for (let j = 0; j < np; j++) {
        if (!PIN[j]) continue;
        const span = PX[j] + PW[j] - (PX[i] - PW[i]);
        const room = 1 - PM[i] - PM[j];
        if (span > 0 && room > 0.2 && span / room > W) W = span / room;
      }
    }
    ox = x;
    oy = y;
    if (!any) return H;
    H = Math.min(Math.max(H, W / ASPECT), hCap);
    placeFitX(x, H);
    for (let k = 0; k < 60 && !bandY(ox, H, false, feetLoose, topLoose) && H < hCap; k++) {
      H = Math.min(hCap, H * 1.025);
      placeFitX(x, H);
    }
    bandY(ox, H, false, feetLoose, topLoose);
    if (oy < yLo) oy = yLo;
    if (oy > yHi) oy = yHi;
    if (yLo > yHi) oy = (yLo + yHi) / 2;
    return H;
  }

  /** the width the pinned points need with their side margins */
  function pinSpan(): number {
    let W = 0;
    for (let i = 0; i < np; i++) {
      if (!PIN[i]) continue;
      for (let j = 0; j < np; j++) {
        if (!PIN[j]) continue;
        const span = PX[j] + PW[j] - (PX[i] - PW[i]);
        const room = 1 - PM[i] - PM[j];
        if (span > 0 && span / room > W) W = span / room;
      }
    }
    return W;
  }

  /** the frame for a launch that has given way (writes ltx, lty, ltH): the victim now, where its
   *  flight runs out and the attacker all fit with margins; at least (1 + 0.8 x launch strength) times
   *  the frame it gave way from; the spare room goes ahead of the victim, along its flight. */
  function launchFrame(Hcur: number): void {
    PIN.fill(0);
    PIN[lPinV] = 1;
    PM[lPinV] = 0.16;
    PT[lPinV] = -0.06; // head room over a flying victim
    PIN[lPinE] = 1;
    PM[lPinE] = 0.1;
    PT[lPinE] = -0.04;
    if (lPinA >= 0) {
      PIN[lPinA] = 1;
      PM[lPinA] = 0.13;
    }
    // a high or long flight is not held whole: past ~2x the frame it gave way from (and ~14 m), the
    // frame keeps only where the victim will be in 6 ticks and pans with it instead
    const cap = lLethal ? Math.max(Hcur, 12) : Math.max(Hcur, Math.min(lH0 * 2.1, 14));
    let W = pinSpan();
    if (W / ASPECT > cap) {
      PIN[lPinE] = 0;
      PIN[lPinP] = 1;
      PM[lPinP] = 0.08;
      W = pinSpan();
    }
    const widen = 1 + 0.8 * smooth((lSpd0 - 0.15) / 0.3);
    let H = Math.min(cap, Math.max(Hcur, W / ASPECT, lH0 * widen));
    const v = must[lV] >= 0 ? must[lV] : lPinV;
    const vx = PX[lPinE] - PX[v];
    const vy = PY0[lPinE] - PY0[v];
    const vl = Math.sqrt(vx * vx + vy * vy) || 1;
    const dx = vx / vl, dy = vy / vl;
    // ahead of the flight: 0 = as far as the frame can go that way, 1 = as far back
    const bx = dx < -0.3 ? 0.3 : dx > 0.3 ? 0.7 : 0.5;
    let x = 0;
    for (let pass = 0; pass < 2; pass++) {
      let ok = false;
      for (let k = 0; k < 40; k++) {
        xRange(H);
        x = xLo <= xHi ? xLo + (xHi - xLo) * bx : (xLo + xHi) / 2;
        ok = bandY(x, H, false, 0, 0) && xLo <= xHi;
        if (ok || H >= cap) break;
        H = Math.min(cap, H * 1.03);
      }
      if (ok || !PIN[lPinE]) break;
      // the whole flight does not fit under the cap (a high launch): follow it instead
      PIN[lPinE] = 0;
      PIN[lPinP] = 1;
      PM[lPinP] = 0.08;
    }
    bandY(x, H, false, 0, 0);
    let y: number;
    if (yLo > yHi) y = (yLo + yHi) / 2;
    else if (dy > 0.45) y = yLo + (yHi - yLo) * 0.7; // up: the room goes above
    else if (dy < -0.45) y = yLo + (yHi - yLo) * 0.3;
    else y = clamp((0.5 - floorFracFor(H)) * H, yLo, yHi); // across: the deck on its line
    PT[lPinV] = 0;
    PT[lPinE] = 0;
    ltx = x;
    lty = y;
    ltH = H;
  }

  function pinMust(margin: number): void {
    PIN.fill(0);
    for (let s = 0; s < 2; s++) {
      const i = must[s];
      if (i < 0) continue;
      PIN[i] = 1;
      PM[i] = margin;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // shots
  // ---------------------------------------------------------------------------------------------
  // the launch points (used after the hold in update): victim now, in 6 ticks, where the flight
  // runs out, the attacker
  let lPinV = -1, lPinP = -1, lPinA = -1, lPinE = -1;

  function shotLive(fv: FightView): void {
    np = 0;
    must[0] = -1;
    must[1] = -1;
    recLedge = NaN;
    lPinV = lPinP = lPinA = lPinE = -1;
    const st = fv.state;
    if (mode === 'follow') {
      addFighter(fv, followSide);
      if (np === 0) addFighter(fv, followSide === 0 ? 1 : 0);
      frameSubjects(6.4, 0);
      setLiveAngles();
      return;
    }
    // ---- a launch in progress: the frame holds; update() lets it give way only as needed ----
    if (lOn) {
      const v = st.fighters[lV];
      if (v.action === 'dead' || !inPlay(v)) lOn = false;
      else if (v.hitlag > 0) {
        lFly = 0;
        lPhase = 0;
        addFighter(fv, 0, false);
        addFighter(fv, 1, false);
        hold = true;
        return;
      } else {
        const spd = Math.sqrt(v.vx * v.vx + v.vy * v.vy);
        const settled = v.action !== 'hitstun' || (v.grounded && lFly > 0.05) || (spd < 0.08 && lFly > 0.15) || lFly > 2.4;
        if (settled) lOn = false;
        else {
          lPinV = addFighter(fv, lV, false);
          lPinA = addFighter(fv, lA, false);
          const h = heightOf(v);
          predict(fv, lV, 6);
          lPinP = addPoint(predX, predY - 0.05, predY + h + TAG, PW[lPinV], 0);
          pathEnd(fv, lV, 24);
          lPinE = addPoint(endX, endY - 0.05, endY + h + TAG, PW[lPinV], 0);
          if (lPhase === 0) {
            lPhase = 1;
            let kx = v.vx, ky = v.vy;
            const p = fv.prev.fighters[lV];
            if (Math.abs(v.x - p.x) + Math.abs(v.y - p.y) < 0.004) {
              kx = v.kbx;
              ky = v.kby;
            }
            lSpd0 = Math.sqrt(kx * kx + ky * ky);
          }
          // a lethal launch: the frame opens up to a cap and lets the victim tear out of it
          if (lLethal) must[lV] = -1;
          hold = true;
          return;
        }
      }
      ffReset = true; // the launch is over: ease back from where the frame is, no kick
    }
    addFighter(fv, 0);
    addFighter(fv, 1);
    // projectiles near the action
    for (let i = 0; i < st.projectiles.length; i++) {
      const pr = st.projectiles[i];
      let near = false;
      for (let s = 0; s < 2; s++) {
        const f = st.fighters[s];
        if (f.action !== 'dead' && Math.abs(f.x - pr.x) < 9 && Math.abs(f.y - pr.y) < 6) near = true;
      }
      if (near && pr.x > B.left && pr.x < B.right) addPoint(pr.x, pr.y - pr.r - 0.2, pr.y + pr.r + 0.2, pr.r + 0.2);
    }
    const dead0 = st.fighters[0].action === 'dead';
    const dead1 = st.fighters[1].action === 'dead';
    if (dead0 !== dead1 && st.phase !== 'over') {
      if (koT >= 0 && koT < KO_HOLD) {
        // the live knockout: the frame stays where the flight left it, on the edge the fighter went
        // through, while the blast drives in from it
        hold = true;
        return;
      }
      if (koT < 0) {
        // the respawn pad comes down at top centre: open the frame for it early
        addPoint(ar.respawn.x, PAD_STOP_Y - 0.05, PAD_STOP_Y + 2.1, 1.0);
      } else {
        // then the beat settles on the survivor, a medium shot, until the replay
        frameSubjects(7.4, 0);
        setLiveAngles();
        return;
      }
    }
    frameSubjects(H_MIN, 0);
    setLiveAngles();
  }

  function setLiveAngles(): void {
    // yaw slightly toward the action for parallax; never enough to skew the fight plane
    yaw = clamp(tx / 16, -1, 1) * 0.055;
    pitch = PITCH_LIVE;
    roll = 0;
  }

  function shotWide(): void {
    const m = ar.main;
    const H = ((m.x1 - m.x0) + 8) / ASPECT;
    tx = (m.x0 + m.x1) / 2;
    ty = m.y + (0.5 - FLOOR_WIDE) * H;
    tH = H;
    yaw = 0;
    pitch = PITCH_LIVE;
    roll = 0;
  }

  function shotClose(): void {
    tx = 0;
    tH = 6.5;
    ty = (0.5 - FLOOR_TIGHT) * tH;
    yaw = 0.05;
    pitch = 0.06;
    roll = 0;
  }

  function shotCountdown(fv: FightView): void {
    // the exact live framing, then a pull back from a little closer and lower onto it
    shotLive(fv);
    hold = false;
    const u = cdTotal > 0 ? clamp(fv.countdownMs / cdTotal, 0, 1) : 0;
    const e = smooth(u); // 1 at the start of the countdown, 0 at tick 0 (zero slope at both ends)
    tH *= 1 - 0.2 * e;
    ty -= 0.35 * e * tH * 0.1;
    yaw += 0.05 * e;
    pitch -= 0.04 * e;
  }

  let rpHold = false; // the replay has let the victim go: the frame stays while it flies out
  function shotReplay(fv: FightView, frame: Frame): void {
    const st = fv.state;
    // the victim: the side that loses the life (break) or the loser (verdict)
    let victim: Side = 1;
    if (frame.show.phase === 'verdict' && frame.show.result) victim = frame.show.result.winner === 0 ? 1 : 0;
    else if (frame.show.lastKo) victim = frame.show.lastKo.side;
    else victim = st.fighters[0].damage > st.fighters[1].damage ? 0 : 1;
    const v = st.fighters[victim];
    np = 0;
    must[0] = -1;
    must[1] = -1;
    recLedge = NaN;
    // let go once the victim will cross a blast line within ~7 ticks: the frame holds and the
    // victim leaves it, so the replay ends on the fighter flying out, not on empty sky
    if (!rpHold && v.action !== 'dead' && flying(v) && v.hitlag === 0) {
      predict(fv, victim, 7);
      if (predX <= B.left + 0.5 || predX >= B.right - 0.5 || predY >= B.top - 0.5 || predY <= B.bottom + 0.5) rpHold = true;
    }
    if (v.action === 'dead' || rpHold) {
      tx = cx;
      ty = cy;
      tH = Math.exp(lh);
      hold = true;
    } else {
      // locked on the victim, led a little along its flight. The attacker is in the shot while it
      // is close (the build-up and the hit itself), never a reason to widen past the victim's size
      const iv = addFighter(fv, victim, false);
      const fl = flying(v) && v.hitlag === 0;
      if (fl) {
        predict(fv, victim, 5);
        addPoint(predX, predY - 0.05, predY + heightOf(v) + TAG, PW[iv] * 0.6);
      }
      const as: Side = victim === 0 ? 1 : 0;
      const a = st.fighters[as];
      const near = fl ? Math.abs(a.x - v.x) < 3.2 && Math.abs(a.y - v.y) < 2.6 : Math.abs(a.x - v.x) < 4.8 && Math.abs(a.y - v.y) < 3.8;
      const ia = near ? addFighter(fv, as, false) : -1;
      must[as] = -1;
      const h = heightOf(v);
      // the victim stays ~230 px tall at 720 (a tumbling robot curls to ~3/4 of that), never under
      // ~185 while it is in the shot
      const hTight = Math.max(3.6, (h * 720) / 230);
      // the build-up two-shot (the attacker in, nobody flying yet) may open to ~130 px for the pair
      const hLoose = (h * 720) / (ia >= 0 && !fl ? 110 : 185);
      frameSubjects(hTight, 0, hTight * ASPECT * 0.85, -0.04, false, hLoose, 0.9);
      if (ia < 0 && fl) {
        // the flight alone: the victim off centre, away from the score chips at top centre, with
        // the open side of the frame ahead of it
        const s = Math.abs(v.kbx) > 0.3 * Math.abs(v.kby) ? Math.sign(v.kbx) : 1;
        tx = PX[iv] + s * 0.24 * tH * ASPECT;
        // and the room ahead of a high flight goes above it: the victim rides below centre
        const kl = Math.sqrt(v.kbx * v.kbx + v.kby * v.kby) || 1;
        if (Math.abs(v.kby) > 0.4 * kl) ty = (PY0[iv] + PY1[iv]) / 2 + Math.sign(v.kby) * 0.16 * tH;
      }
    }
    const dir = v.kbx !== 0 ? Math.sign(v.kbx) : v.x >= 0 ? 1 : -1;
    yaw = 0.3 * dir; // stand behind the launch, looking along it
    pitch = 0.16; // above, looking down: the deck and the dark yard behind the victim, not the floodlights
    roll = 0.03 * dir;
  }

  function shotPredict(frame: Frame, fv: FightView): void {
    const SHOT = 3.0;
    const t = frame.show.phaseMs / 1000;
    const k = Math.floor(t / SHOT);
    const u = (t - k * SHOT) / SHOT;
    const kind = k % 3; // 0: side 0, 1: side 1, 2: both
    const key = `p${k}`;
    if (key !== shotKey) {
      shotKey = key;
      snapNext = true;
    }
    const a = fv.state.fighters[0];
    const b = fv.state.fighters[1];
    if (kind === 2) {
      const mid = (a.x + b.x) / 2;
      tH = Math.max(7.2, (Math.abs(a.x - b.x) + 4.2) / ASPECT) * (1 - 0.1 * easeOut(u));
      tx = mid + (k % 2 === 0 ? -0.4 : 0.4) * (u - 0.5);
      ty = (0.5 - 0.27) * tH;
      yaw = (k % 2 === 0 ? 0.1 : -0.1);
      pitch = 0.02;
      roll = 0;
    } else {
      const f = kind === 0 ? a : b;
      const s = kind === 0 ? 1 : -1; // the way this fighter faces (toward the opponent)
      const h = heightOf(f);
      // the title plates hang over the top ~38% of the frame: the fighter stands in the lower
      // middle, its head ending well under them, the push-in keeping the feet where they are
      const feet = 0.23;
      tH = Math.max(h / 0.33, 4.4) * (1 - 0.09 * easeOut(u));
      tx = f.x + s * tH * ASPECT * 0.07;
      ty = f.y + (0.5 - feet) * tH;
      yaw = -s * 0.42; // camera stands off the fighter's front: a three-quarter view
      pitch = -0.05;
      roll = 0;
    }
  }

  function shotBreak(fv: FightView): void {
    // a slow dolly across the deck, past whoever is standing on it: the drift is centred on the
    // fighters still in play and never carries one of them out of the frame
    const T = 16;
    const ph = (shotT % (2 * T)) / T; // 0..2
    const u = ph < 1 ? smooth(ph) : smooth(2 - ph);
    tH = 7.6;
    let lo = Infinity, hi = -Infinity;
    for (let s = 0; s < 2; s++) {
      const f = fv.state.fighters[s];
      if (f.action === 'dead' || !inPlay(f)) continue;
      lo = Math.min(lo, f.x);
      hi = Math.max(hi, f.x);
    }
    const hw = (tH * ASPECT) / 2;
    if (lo === Infinity) {
      tx = -3.5 + 7 * u;
    } else {
      const c = clamp((lo + hi) / 2, ar.main.x0 + 2, ar.main.x1 - 2);
      tx = c - 1.6 + 3.2 * u;
      const m = hw * 0.55;
      tx = clamp(tx, hi - m, lo + m);
    }
    ty = (0.5 - 0.26) * tH;
    yaw = -0.16 + 0.32 * u;
    pitch = -0.02;
    roll = 0;
  }

  function shotVerdict(frame: Frame, fv: FightView): void {
    const w: Side = frame.show.result ? frame.show.result.winner : fv.state.winner === 1 ? 1 : 0;
    const f = fv.state.fighters[w];
    const h = heightOf(f);
    const u = easeOut(shotT / 9);
    tH = Math.max(h * (4.2 - 1.3 * u), 4.6);
    const side = f.facing === 1 ? 1 : -1;
    tx = f.x + tH * ASPECT * 0.1; // the winner left of centre, the result plates take the right
    ty = f.y + (0.5 - FLOOR_WIDE) * tH;
    yaw = -side * (0.18 + 0.1 * u);
    pitch = -0.07;
    roll = 0;
  }

  function shotEstablish(): void {
    const t = clock;
    tH = 14.5;
    tx = Math.sin(t * 0.06) * 4;
    ty = 4.2 + Math.sin(t * 0.045) * 0.6;
    yaw = Math.sin(t * 0.06) * 0.12;
    pitch = 0.09;
    roll = 0;
  }

  function pickShot(frame: Frame): Shot {
    const f = frame.fight;
    if (mode === 'wide') return 'wide';
    if (!f) return 'establish';
    if (f.mode === 'replay') return 'replay';
    const ph = frame.show.phase;
    if (ph === 'predictions') return 'predict';
    // the break opens on the live knockout (it plays on, then freezes) until the replay starts
    if (ph === 'break') return sawReplay ? 'break' : 'live';
    if (ph === 'verdict') return sawReplay || koT < 0 ? 'verdict' : 'live';
    if (ph === 'fight' && f.mode === 'frozen' && f.countdownMs > 0) return 'countdown';
    return 'live';
  }

  // ---------------------------------------------------------------------------------------------
  function startShake(pat: number[], scale: number, dx: number, dy: number): void {
    // a running stronger shake is not cut short by a weaker one
    const left = shI < shPat.length ? Math.abs(shPat[shI]) * shScale : 0;
    if (Math.abs(pat[0]) * scale < left * 0.9) return;
    shPat = pat;
    shScale = scale;
    shI = 0;
    shFresh = true; // the next camera update shows the first offset, whatever its dt
    shFrame = fno;
    const l = Math.sqrt(dx * dx + dy * dy);
    if (l > 1e-4) {
      shDX = dx / l;
      shDY = dy / l;
    } else {
      shDX = 0.35;
      shDY = 0.94;
    }
  }
  /** amount (the trauma scale other modules use) -> a pattern */
  function shakeFor(amount: number, dx: number, dy: number): void {
    if (amount <= 0.02) return;
    if (amount >= 0.85) startShake(PAT_HEAVY, 1.35, dx, dy); // the blast
    else if (amount >= 0.5) startShake(PAT_HEAVY, 1, dx, dy);
    else if (amount >= 0.25) startShake(PAT_MED, 1, dx, dy);
    else startShake(PAT_LIGHT, clamp(amount / 0.12, 0.6, 1.5), dx, dy);
  }
  function zoomJump(a: number): void {
    if (zjI < 2 && a <= zjAmt) return;
    zjAmt = a;
    zjI = 0;
    zjFrame = fno;
  }

  /** read this frame's sim events: contact shakes and the launch / knockout state */
  function readEvents(fv: FightView): void {
    const ev = fv.events;
    for (let i = 0; i < ev.length; i++) {
      const e = ev[i];
      if (e.t === 'hit') {
        const s = e.strength;
        shakeFor(s === 'lethal' || s === 'heavy' ? 0.6 : s === 'medium' ? 0.32 : 0.12, e.dx, e.dy);
        if (s === 'heavy' || s === 'lethal') zoomJump(s === 'lethal' ? 0.045 : 0.035);
        if (fv.mode === 'live') {
          if (e.kb > 80 && s !== 'light') {
            lOn = true;
            lV = e.to;
            lA = e.by;
            lFly = 0;
            lPhase = 0;
            lLethal = s === 'lethal';
          } else if (lOn) {
            lOn = false; // hit again: the frame eases back
            ffReset = true;
          }
        }
      } else if (e.t === 'ko' && fv.mode === 'live') {
        koT = 0;
        koEdge = e.edge;
        koX = e.x;
        koY = e.y;
        lOn = false;
      }
    }
  }

  function update(frame: Frame): void {
    const dt = clamp(frame.dt, 0, 0.1);
    clock += dt;
    fno++;
    const f = frame.fight;
    const ph = frame.show.phase;
    if (ph !== lastPhase) {
      if (ph !== 'break' && ph !== 'verdict') sawReplay = false;
      if (ph === 'break') sawReplay = false;
      if (ph === 'fight' && lastPhase === 'break') koT = -1;
      lastPhase = ph;
    }
    if (f && f.mode === 'replay') sawReplay = true;
    if (koT >= 0) koT += dt;
    if (f) readEvents(f);
    if (lOn && f && f.state.fighters[lV].hitlag === 0) lFly += dt;

    const next = mode === 'close' && !f ? 'wide' : pickShot(frame);
    if (next !== shot) {
      // countdown -> live is one continuous move; everything else is a cut
      const continuous = shot === 'countdown' && next === 'live';
      if (!continuous) snapNext = true;
      if (next === 'countdown') cdTotal = f ? f.countdownMs : 0;
      if (next === 'replay') rpHold = false;
      if (next !== 'live') lOn = false;
      shot = next;
      shotT = 0;
      shotKey = '';
    } else {
      shotT += dt;
    }
    if (shot === 'countdown' && f && f.countdownMs > cdTotal) cdTotal = f.countdownMs;

    np = 0;
    must[0] = -1;
    must[1] = -1;
    hold = false;
    switch (shot) {
      case 'live':
        if (mode === 'close') shotClose();
        else shotLive(f!);
        break;
      case 'countdown':
        shotCountdown(f!);
        break;
      case 'replay':
        shotReplay(f!, frame);
        break;
      case 'predict':
        shotPredict(frame, f!);
        break;
      case 'break':
        shotBreak(f!);
        break;
      case 'verdict':
        shotVerdict(frame, f!);
        break;
      case 'wide':
        shotWide();
        break;
      default:
        if (mode === 'close') shotClose();
        else shotEstablish();
    }
    if (snapNext || first) hold = false;

    if (hold) {
      // held exactly where it is: the hit pause, or a launch giving way only as the victim needs
      vx = vy = vlh = 0;
      tvx = tvy = 0;
      ffReset = true;
    } else {
      const tlh = Math.log(tH);
      // feed-forward: a critically damped spring trails a target moving at v by 2v/w. Estimate the
      // target's velocity (low-passed, clamped so a subject entering or leaving cannot kick it)
      // and aim that far ahead, so a running or rising pair is framed where it is, not where it was.
      if (dt > 0 && !first && !snapNext && !ffReset && (shot === 'live' || shot === 'replay')) {
        const lim = (shot === 'replay' ? 5 : 1.4) * tH; // the replay follows one fast subject
        const k = 1 - Math.exp(-dt / 0.07);
        tvx += (clamp((tx - ptx) / dt, -lim, lim) - tvx) * k;
        tvy += (clamp((ty - pty) / dt, -lim, lim) - tvy) * k;
      } else {
        tvx = tvy = 0;
      }
      ffReset = false;
      ptx = tx;
      pty = ty;
      if (first || snapNext || shot === 'countdown') {
        // cuts land on the target; the countdown move is authored, so it drives the camera directly
        // (its last frame is the live target with zero velocity, so the fight starts with no jump)
        cx = tx;
        cy = ty;
        lh = tlh;
        vx = vy = vlh = 0;
        first = false;
        snapNext = false;
      } else if (dt > 0) {
        const wz = tlh > lh ? W_ZOOM_OUT : W_ZOOM_IN;
        const wm = shot === 'replay' ? 9 : W_MOVE;
        const ff = (2 / wm) * 0.75;
        spring(cx, vx, tx + tvx * ff, wm, dt, sp);
        cx = sp.x;
        vx = sp.v;
        spring(cy, vy, ty + tvy * ff, wm, dt, sp);
        cy = sp.x;
        vy = sp.v;
        spring(lh, vlh, tlh, wz, dt, sp);
        lh = sp.x;
        vlh = sp.v;
      }
    }
    let H = Math.exp(lh);

    // ---- a launch in flight. Held through the hit pause; on release the victim tears across the
    // still frame until it (or where it will be in 6 ticks) comes near the edge. Then the frame gives
    // way in a frame or two (faster the harder the launch): it widens to hold the whole flight to
    // where it runs out, with the victim's side of the frame open ahead of it and the attacker
    // toward the trailing edge, and keeps panning with the victim. It never zooms in mid flight. ----
    if (hold && lOn && lPinV >= 0 && lPinE >= 0) {
      if (lPhase === 1) {
        PIN.fill(0);
        PIN[lPinV] = 1;
        PM[lPinV] = 0.15;
        PIN[lPinP] = 1;
        PM[lPinP] = 0.0;
        PT[lPinP] = 0.05; // where it will be may reach a little past the safe band, not the edge
        const H2 = fit(cx, cy, H, 0.02, 0.0);
        PT[lPinP] = 0;
        if (H2 > H * 1.001 || Math.abs(ox - cx) > 1e-3 || Math.abs(oy - cy) > 1e-3) {
          lPhase = 2;
          lH0 = H;
        }
      }
      if (lPhase === 2 && dt > 0) {
        launchFrame(H);
        // the first frames close most of the gap at once (1-2 frames for the hardest launches,
        // ~8 for a medium one), the same rate then tracks the flight
        const r = clamp(0.3 + (lSpd0 - 0.2) * 2.2, 0.3, 0.82);
        const k = 1 - Math.pow(1 - r, dt * 60);
        cx += (ltx - cx) * k;
        cy += (lty - cy) * k;
        lh += (Math.log(ltH) - lh) * k;
        H = Math.exp(lh);
      }
    }

    // ---- the hard guarantee: no fighter's head, tag or feet leaves the band ----
    const guard = shot === 'live' || shot === 'replay';
    if (guard) {
      pinMust(0.025);
      const H2 = shot === 'replay' ? fit(cx, cy, H, 0.0, 0.0) : fit(cx, cy, H, -0.014, 0.06);
      if (ox !== cx) {
        if ((ox - cx) * vx < 0) vx = 0;
        cx = ox;
      }
      if (oy !== cy) {
        if ((oy - cy) * vy < 0) vy = 0;
        cy = oy;
      }
      if (H2 > H) {
        H = H2;
        lh = Math.log(H);
        if (vlh < 0) vlh = 0;
      }
    }

    // ---- the lethal push-in: toward the contact, ~6 frames in, hold, release on the launch ----
    let px = cx, py = cy, pz = 1;
    if (punchAge >= 0 && shot === 'wide') punchAge = -1; // the wide camera stays steady
    if (punchAge >= 0) {
      punchAge += dt;
      const IN = 0.1;
      const OUT = 0.16;
      const hld = punchHold / 1000;
      let a = 0;
      // the launch has started: let go now, the flight owns the frame
      if (lOn && lFly > 0 && punchAge > IN && punchAge < IN + hld) punchAge = IN + hld;
      if (punchAge < IN) a = easeOut(punchAge / IN);
      else if (punchAge < IN + hld) a = 1;
      else if (punchAge < IN + hld + OUT) a = 1 - smooth((punchAge - IN - hld) / OUT);
      else punchAge = -1;
      const zoom = 1 + 0.6 * punchStrength * punchStrength; // lethal 1.6x
      pz = 1 + (zoom - 1) * a;
      const pull = 0.65 * a * Math.min(1, punchStrength * 1.4);
      px = cx + (punchX - cx) * pull;
      py = cy + (punchY + 0.2 - cy) * pull;
    }
    let Hf = Math.max(H / pz, 3.4);
    if (guard && pz > 1) {
      // the push may go tight, never so tight that a fighter is cut
      pinMust(0.01);
      Hf = fit(px, py, Hf, -0.03, 0.08);
      px = ox;
      py = oy;
    }
    // the contact zoom: one frame 3-4% in, one frame settling
    if (zjI < 2) {
      Hf /= 1 + (zjI === 0 ? zjAmt : zjAmt * 0.3);
      zjI++;
    }

    // ---- place the camera ----
    const D = Hf / 2 / TAN_HALF;
    const cp = Math.cos(pitch);
    cam.position.set(px - Math.sin(yaw) * D * cp, py + Math.sin(pitch) * D, Math.cos(yaw) * D * cp);
    cam.up.set(Math.sin(roll), Math.cos(roll), 0);
    cam.lookAt(px, py, 0);

    // ---- shake: hard alternating per-frame steps along the hit, in screen space ----
    if (shFresh) {
      shFresh = false;
      shAcc = 0;
    } else {
      shAcc += dt;
      while (shAcc >= 1 / 60 - 1e-6) {
        shAcc -= 1 / 60;
        if (shI < shPat.length) shI++;
      }
    }
    if (shI >= 0 && shI < shPat.length) {
      const k = shot === 'wide' ? 0.35 : 1;
      const along = shPat[shI] * shScale * k;
      const across = -along * 0.22; // a little off the line, so it reads as a jolt, not a slide
      shOX = shDX * along - shDY * across;
      shOY = shDY * along + shDX * across;
    } else {
      shOX = shOY = 0;
    }
    cam.updateProjectionMatrix();
    if (shOX !== 0 || shOY !== 0) {
      const e = cam.projectionMatrix.elements;
      e[8] -= (shOX * 2) / 1280;
      e[9] -= (shOY * 2) / 720;
      cam.projectionMatrixInverse.copy(cam.projectionMatrix).invert();
    }
  }

  return {
    update,
    shake(amount: number, dirX = 0, dirY = 0) {
      // the hit that started a pattern this frame or the last already shook from its event
      if (fno - shFrame <= 1 && shI < shPat.length && amount < 0.85) return;
      shakeFor(amount, dirX, dirY);
    },
    punch(x: number, y: number, strength: number, holdMs: number) {
      const s = clamp(strength, 0, 1);
      if (s < 0.9) {
        // a heavy hit: the one-frame contact zoom (already started if the event was seen)
        if (fno - zjFrame > 1) zoomJump(0.035);
        return;
      }
      // the lethal hit: a push in on the contact, held through the freeze
      if (punchAge >= 0 && s < punchStrength && punchAge < 0.1 + punchHold / 1000) return;
      punchX = x;
      punchY = y;
      punchStrength = s;
      punchHold = Math.max(0, holdMs);
      punchAge = 0;
    },
    setMode(m: string, side?: Side) {
      const nm = m === 'wide' || m === 'follow' || m === 'close' ? m : 'auto';
      if (nm !== mode) snapNext = true;
      mode = nm;
      if (side === 0 || side === 1) followSide = side;
    },
    resize() {
      cam.aspect = ASPECT;
      cam.updateProjectionMatrix();
    },
    dispose() {
      // owns no GPU resources
    },
  };
};

// The 2D camera: which part of the world the picture shows. Frames both fighters with margins and
// eases there with critically damped springs (closed form, stable for any dt, no pops).
//
//   auto    both fighters, about 9 m wide at the tightest and x -13..13 at the widest; a launched
//           fighter adds a point ahead along its travel; the deck stays in the picture while anyone
//           is near it, and the picture never goes lower than y -5 unless someone is down there
//   wide    the whole arena
//   follow  one side, close
// In 'frozen' playback the frame holds where it is. shake() is a decaying trauma squared offset
// along the hit; punch() a brief push in toward a point.
//
// The safe box: every fighter alive and inside the blast zone is kept fully in the picture, at least
// 90 px from the sides, 70 px under the top (the clock) and, where it stands over a HUD plate (the
// outer 480 px of each side), with its feet 140 px above the bottom (36 px between the plates). The
// target is solved to keep it, and the eased view is pulled into it by a fast correction (no pop on
// a respawn or a launch). Only past the widest view may a fighter leave; fx.ts then draws a pointer.

import type { CameraRig2D, InkFrame, View } from './api.ts';
import { W, H } from './api.ts';
import type { FighterState, Side } from '../sim/types.ts';

const MIN_W = 9;
const MAX_W = 26;
const LIMIT_X = 13;
const FLOOR_Y = -5;
const ASPECT = H / W;

/** one critically damped spring step; s = [x, v] */
function spring(s: [number, number], target: number, omega: number, dt: number): void {
  const d = s[0] - target;
  const e = Math.exp(-omega * dt);
  const v = s[1];
  s[0] = target + (d + (v + omega * d) * dt) * e;
  s[1] = (v - omega * dt * (v + omega * d)) * e;
}

const alive = (f: FighterState) => f.action !== 'dead';

/** safe box margins in stage px */
const SAFE_X = 90;
const SAFE_TOP = 70;
const PLATE_W = 480;
const PLATE_FEET = 140;
const OPEN_FEET = 36;

/** a fighter's extent in world metres: x0..x1, feet y0, top y1 */
export interface SubjectBox { x0: number; x1: number; y0: number; y1: number }

/** the boxes the safe box keeps: alive fighters inside the blast zone */
export function subjectBoxes(f: InkFrame): SubjectBox[] {
  const out: SubjectBox[] = [];
  const fight = f.fight;
  if (!fight) return out;
  const b = f.arena.blast;
  for (const side of [0, 1] as Side[]) {
    const s = fight.state.fighters[side];
    if (!alive(s)) continue;
    if (s.x < b.left || s.x > b.right || s.y < b.bottom || s.y > b.top) continue;
    out.push(fighterBox(f, s));
  }
  return out;
}

export function fighterBox(f: InkFrame, s: FighterState): SubjectBox {
  const h = f.fighterDefs[s.fighter]?.height ?? 2;
  const wd = f.fighterDefs[s.fighter]?.width ?? 1;
  // a little ahead along the travel (8 ticks), so the eased view never trails a fast fighter
  const lx = s.vx * 8, ly = s.vy * 8;
  const lead = (b: SubjectBox): SubjectBox => ({ x0: b.x0 + Math.min(0, lx), x1: b.x1 + Math.max(0, lx), y0: b.y0 + Math.min(0, ly), y1: b.y1 + Math.max(0, ly) });
  if (s.tumble || s.action === 'hitstun' || s.action === 'knockdown' || !s.grounded) {
    // spun about the hip or stretched in the air (arms up in a jump): a square around the hip
    const r = h * 0.75;
    const hy = s.y + h * 0.5;
    return lead({ x0: s.x - r, x1: s.x + r, y0: Math.min(s.y, hy - r), y1: hy + r });
  }
  const hw = Math.max(0.55, wd * 0.5 + 0.2, h * 0.3);
  return lead({ x0: s.x - hw, x1: s.x + hw, y0: s.y, y1: s.y + h * 1.1 });
}

/** the view nearest (cx, cy, w) that keeps every box in the safe box, up to maxW wide; when even
 *  maxW cannot hold them all, the box nearest the arena centre is kept and the other may leave */
export function solveSafe(boxes: SubjectBox[], cx: number, cy: number, w: number, maxW: number): [number, number, number] {
  if (!boxes.length) return [cx, cy, w];
  const ax = 0.5 - SAFE_X / W;
  // horizontal
  let lo = 1e9, hi = -1e9;
  for (const b of boxes) { lo = Math.min(lo, b.x0); hi = Math.max(hi, b.x1); }
  let keep = boxes;
  if ((hi - lo) / (2 * ax) > maxW && boxes.length > 1) {
    const mid = (b: SubjectBox) => Math.abs((b.x0 + b.x1) / 2);
    keep = [boxes.reduce((a, b) => (mid(b) < mid(a) ? b : a))];
    lo = keep[0]!.x0;
    hi = keep[0]!.x1;
  }
  w = Math.max(w, Math.min(maxW, (hi - lo) / (2 * ax)));
  let a = ax * w;
  cx = hi - lo <= 2 * a ? Math.max(hi - a, Math.min(lo + a, cx)) : (lo + hi) / 2;
  // vertical: the feet margin depends on whether the box stands over a plate (screen x at this cx)
  for (let pass = 0; pass < 2; pass++) {
    const k = w / W;
    const plateL = cx - w / 2 + PLATE_W * k;
    const plateR = cx + w / 2 - PLATE_W * k;
    const feet = (b: SubjectBox) => (b.x0 < plateL || b.x1 > plateR ? PLATE_FEET : OPEN_FEET);
    const need = (b: SubjectBox, top: number) => (top - b.y0) / (ASPECT - (SAFE_TOP + feet(b)) / W);
    let top = -1e9;
    for (const b of keep) top = Math.max(top, b.y1);
    let wv = 0;
    for (const b of keep) wv = Math.max(wv, need(b, top));
    let vk = keep;
    if (wv > maxW && keep.length > 1) {
      const mid = (b: SubjectBox) => Math.hypot((b.x0 + b.x1) / 2, (b.y0 + b.y1) / 2 - 3);
      vk = [keep.reduce((p, q) => (mid(q) < mid(p) ? q : p))];
      top = vk[0]!.y1;
      wv = need(vk[0]!, top);
    }
    const nw = Math.max(w, Math.min(maxW, wv));
    if (nw > w + 1e-6) {
      w = nw;
      a = ax * w;
      cx = hi - lo <= 2 * a ? Math.max(hi - a, Math.min(lo + a, cx)) : (lo + hi) / 2;
      if (pass === 0) continue;
    }
    const k2 = w / W;
    const hh = (w * ASPECT) / 2;
    const cyLo = top - hh + SAFE_TOP * k2;
    let cyHi = 1e9;
    for (const b of vk) cyHi = Math.min(cyHi, b.y0 + hh - feet(b) * k2);
    cy = cyLo <= cyHi ? Math.max(cyLo, Math.min(cyHi, cy)) : (cyLo + cyHi) / 2;
    break;
  }
  return [cx, cy, w];
}

export function createCamera2D(): CameraRig2D {
  const sx: [number, number] = [0, 0];
  const sy: [number, number] = [3, 0];
  const sw: [number, number] = [Math.log(20), 0];
  let tx = 0;
  let ty = 3;
  let tw = 20;
  let first = true;
  /** the safe-box correction on top of the springs: dx, dy, dlog(w) */
  const corr: [number, number, number] = [0, 0, 0];
  let mode = 'auto';
  let followSide: Side = 0;

  let trauma = 0;
  let shakeDx = 1;
  let shakeDy = 0;
  let shakeT = 0;
  let offX = 0;
  let offY = 0;

  let punchAmt = 0;
  let punchHold = 0;
  let punchAge = 1e9;
  let px = 0;
  let py = 0;

  const view: View = {
    cx: 0,
    cy: 3,
    scale: W / 20,
    x(wx: number) {
      return W / 2 + (wx - view.cx) * view.scale + offX;
    },
    y(wy: number) {
      return H / 2 - (wy - view.cy) * view.scale + offY;
    },
  };

  // scratch bounds
  let x0 = 0, x1 = 0, y0 = 0, y1 = 0;
  function add(x: number, ylo: number, yhi: number): void {
    x0 = Math.min(x0, x);
    x1 = Math.max(x1, x);
    y0 = Math.min(y0, ylo);
    y1 = Math.max(y1, yhi);
  }

  function target(f: InkFrame): void {
    const fight = f.fight;
    if (!fight || mode === 'wide') {
      tx = 0;
      ty = 3;
      tw = mode === 'wide' ? MAX_W : 22;
      return;
    }
    const st = fight.state;
    x0 = 1e9; x1 = -1e9; y0 = 1e9; y1 = -1e9;
    let n = 0;
    for (const side of [0, 1] as Side[]) {
      if (mode === 'follow' && side !== followSide) continue;
      const s = st.fighters[side];
      if (!alive(s)) continue;
      const h = f.fighterDefs[s.fighter]?.height ?? 2;
      add(s.x, s.y, s.y + h);
      n++;
      // a launched fighter: frame where it is going, a little ahead
      if (s.tumble && s.action === 'hitstun') {
        const k = 14;
        const lx = Math.max(f.arena.blast.left + 2, Math.min(f.arena.blast.right - 2, s.x + s.vx * k));
        const ly = Math.max(f.arena.blast.bottom + 1, Math.min(f.arena.blast.top - 1, s.y + s.vy * k));
        add(lx, ly, ly + h * 0.6);
      }
    }
    if (!n) {
      // both gone (a knockout beat): hold where we are, then open toward the respawn
      return;
    }
    const marginX = 2.4;
    const top = 1.2;
    const bottom = 0.8;
    let w = Math.max(x1 - x0 + 2 * marginX, (y1 - y0 + top + bottom) / ASPECT);
    w = mode === 'follow' ? Math.max(11, w) : w;
    w = Math.max(MIN_W, Math.min(MAX_W, w));
    const hh = (w * ASPECT) / 2;
    let cx = (x0 + x1) / 2;
    let cy = (y0 - bottom + y1 + top) / 2;
    // keep the deck in the shot while the lowest subject is near it
    const deck = f.arena.main.y;
    if (y0 < deck + 2.5) cy = Math.max(y1 + top - hh, Math.min(cy, deck + 0.42 * hh));
    // nothing below y -5 unless someone is down there
    const floor = Math.min(FLOOR_Y, y0 - bottom);
    cy = Math.max(cy, floor + hh);
    // the picture stays inside x -13..13 unless someone is out there
    const lo = Math.min(-LIMIT_X, x0 - marginX);
    const hi = Math.max(LIMIT_X, x1 + marginX);
    const hw = w / 2;
    if (hi - lo <= w) cx = (lo + hi) / 2;
    else cx = Math.max(lo + hw, Math.min(hi - hw, cx));
    // the safe box wins over the framing taste above
    [tx, ty, tw] = solveSafe(subjectBoxes(f), cx, cy, w, MAX_W);
  }

  return {
    view,
    update(f: InkFrame) {
      const dt = Math.max(0, Math.min(0.25, f.dt));
      // frozen in the fight or break (the knockout beat): hold the frame; elsewhere frame what stands there
      const frozen = f.fight?.mode === 'frozen' && (f.show.phase === 'fight' || f.show.phase === 'break');
      if (!frozen || first) target(f);
      const justStarted = first;
      if (first) {
        sx[0] = tx;
        sy[0] = ty;
        sw[0] = Math.log(tw);
        first = false;
      } else {
        spring(sx, tx, 4.2, dt);
        spring(sy, ty, 3.6, dt);
        spring(sw, Math.log(tw), 3.0, dt);
      }
      let w = Math.exp(sw[0]);
      let cx = sx[0];
      let cy = sy[0];
      const boxes = frozen ? [] : subjectBoxes(f);
      // punch: hold, then ease out
      punchAge += dt * 1000;
      if (punchAmt > 0) {
        const out = Math.max(0, punchAge - punchHold);
        const env = punchAge < 60 ? punchAge / 60 : Math.max(0, 1 - out / 380);
        const k = env * env * (3 - 2 * env) * punchAmt;
        w *= 1 - 0.2 * k;
        cx += (px - cx) * 0.35 * k;
        cy += (py - cy) * 0.35 * k;
        if (env <= 0 && punchAge > punchHold) punchAmt = 0;
      }
      // the safe box on the eased (and punched) view: a fast eased correction, so the springs' lag
      // never lets a fighter slide under a plate or off the side, and a respawn never pops
      const [scx, scy, sw2] = solveSafe(boxes, cx, cy, w, MAX_W);
      const kc = justStarted ? 1 : frozen ? 0 : 1 - Math.exp(-dt * 24);
      corr[0] += (scx - cx - corr[0]) * kc;
      corr[1] += (scy - cy - corr[1]) * kc;
      corr[2] += (Math.log(sw2 / w) - corr[2]) * kc;
      cx += corr[0];
      cy += corr[1];
      w *= Math.exp(corr[2]);
      view.cx = cx;
      view.cy = cy;
      view.scale = W / w;
      // shake: trauma squared, along the hit, alternating
      shakeT += dt;
      trauma = Math.max(0, trauma - dt * 1.7);
      const a = trauma * trauma * 22;
      const osc = Math.sin(shakeT * 2 * Math.PI * 17);
      const perp = Math.sin(shakeT * 2 * Math.PI * 11 + 1.3) * 0.35;
      offX = (shakeDx * osc - shakeDy * perp) * a;
      offY = (-shakeDy * osc - shakeDx * perp) * a;
    },
    shake(amount, dirX = 1, dirY = 0) {
      trauma = Math.min(1, Math.max(trauma, 0) + amount);
      const l = Math.hypot(dirX, dirY) || 1;
      shakeDx = dirX / l;
      shakeDy = dirY / l;
    },
    punch(wx, wy, strength, holdMs) {
      if (strength < punchAmt && punchAge < punchHold) return;
      punchAmt = Math.max(0, Math.min(1, strength));
      punchHold = holdMs;
      punchAge = 0;
      px = wx;
      py = wy;
    },
    setMode(m, side) {
      mode = m === 'wide' || m === 'follow' ? m : 'auto';
      if (side === 0 || side === 1) followSide = side;
    },
  };
}

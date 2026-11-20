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

export function createCamera2D(): CameraRig2D {
  const sx: [number, number] = [0, 0];
  const sy: [number, number] = [3, 0];
  const sw: [number, number] = [Math.log(20), 0];
  let tx = 0;
  let ty = 3;
  let tw = 20;
  let first = true;
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
    tx = cx;
    ty = cy;
    tw = w;
  }

  return {
    view,
    update(f: InkFrame) {
      const dt = Math.max(0, Math.min(0.25, f.dt));
      // frozen in the fight or break (the knockout beat): hold the frame; elsewhere frame what stands there
      const frozen = f.fight?.mode === 'frozen' && (f.show.phase === 'fight' || f.show.phase === 'break');
      if (!frozen || first) target(f);
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

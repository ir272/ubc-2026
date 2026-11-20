// THE MIMIC (sim id 'vise' for now; its own id `mimic` when the rules team adds it): a walking
// treasure chest, an iron-bound wooden box seen three-quarter from its end, a barrel lid that opens
// like a jaw, uneven teeth on both rims, a slit-pupil eye in a knot of the lid, gold corner
// brackets, a very long tongue and four short clawed legs. The approved drawing is lab/cast/mimic.js.
//
// How the chest hangs off the biped skeleton: the box is the torso. It sits on the engine's hip and
// tilts with the engine's lean (less the build's hunch) and squashes with its stretch. The LID is the
// head and jaw: it opens and snaps with the moves. Bites pull the box until its mouth reaches the
// active hitbox (read the way wolf.ts does), the lid shutting on the active frames. The engine's
// front hand is the TONGUE TIP: in grabs, swipes, throws and the tongue specials the tongue lashes
// out of the mouth to handF; at rest it lolls short over the front teeth. The four legs are drawn
// from the box's underside: each takes the engine foot of its diagonal pair (near front and far back
// follow footF, the other two footB), moved under its own corner, so the engine's gait becomes a
// scuttling trot. The build puts the engine's head on the mouth, so a tether from the head starts
// at the teeth.
//
// Side: the iron bands and the hasp take the side tint; the brackets and coins stay gold.
// Deterministic: fixed seeds on every pen call, no Math.random, no Date.
import type { Build, CharacterDef, FigureExtra, Joints } from '../api.ts';
import type { Pen, Pt } from '../pen.ts';
import { ell, h01, smooth } from '../pen.ts';
import { FIGHTERS } from '../../sim/fighters.ts';
import type { Hitbox, MoveDef, MoveId, Projectile } from '../../sim/types.ts';

const BUILD: Build = { height: 120, hipY: 55, torso: 40, neckLen: 6, arm: [34, 34], leg: [28, 28], shoulderX: 20, stanceX: 44, hunch: 0.95, propLen: 0, heft: 1.4 };

// ---- small math ----
const PI = Math.PI;
const clamp = (v: number, a: number, b: number): number => (v < a ? a : v > b ? b : v);
const c01 = (v: number): number => clamp(v, 0, 1);
const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
const inOutSine = (u: number): number => 0.5 - 0.5 * Math.cos(PI * c01(u));
const outQuad = (u: number): number => 1 - (1 - c01(u)) ** 2;
const add = (a: Pt, v: Pt, k = 1): Pt => [a[0] + v[0] * k, a[1] + v[1] * k];
const sub = (a: Pt, b: Pt): Pt => [a[0] - b[0], a[1] - b[1]];
const len = (v: Pt): number => Math.hypot(v[0], v[1]);
const dist = (a: Pt, b: Pt): number => Math.hypot(a[0] - b[0], a[1] - b[1]);
const unit = (v: Pt): Pt => { const l = Math.hypot(v[0], v[1]) || 1; return [v[0] / l, v[1] / l]; };
const perp = (d: Pt): Pt => [-d[1], d[0]];
const dir = (a: number): Pt => [Math.cos(a), Math.sin(a)];
const angOf = (v: Pt): number => Math.atan2(v[1], v[0]);
const mixP = (a: Pt, b: Pt, t: number): Pt => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
const within = (v: Pt, r: number): Pt => { const l = len(v); return l <= r ? v : [v[0] * r / l, v[1] * r / l]; };
const rotAbout = (p: Pt, c: Pt, a: number): Pt => { const x = p[0] - c[0], y = p[1] - c[1], cs = Math.cos(a), sn = Math.sin(a); return [c[0] + x * cs - y * sn, c[1] + x * sn + y * cs]; };

/** two-bone IK from a toward t; the middle joint goes to the side of n. Returns [middle, end]. */
function ik2(a: Pt, t: Pt, l1: number, l2: number, n: Pt): [Pt, Pt] {
  let dx = t[0] - a[0], dy = t[1] - a[1];
  let d = Math.hypot(dx, dy);
  if (d < 1e-6) { dx = 0; dy = 1; d = 1; }
  const ux = dx / d, uy = dy / d;
  const dd = clamp(d, Math.abs(l1 - l2) + 1, (l1 + l2) * 0.999);
  const end: Pt = [a[0] + ux * dd, a[1] + uy * dd];
  const along = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
  const h = Math.sqrt(Math.max(0, l1 * l1 - along * along));
  let nx = -uy, ny = ux;
  if (nx * n[0] + ny * n[1] < 0) { nx = -nx; ny = -ny; }
  return [[a[0] + ux * along + nx * h, a[1] + uy * along + ny * h], end];
}

/** the hitbox a move aims at on this frame: the largest active one, or the nearest in time */
function hitboxAt(md: MoveDef, frame: number): Hitbox | null {
  let best: Hitbox | null = null;
  for (const h of md.hitboxes) if (frame >= h.from && frame <= h.to && (!best || h.r > best.r)) best = h;
  if (best) return best;
  let bd = 1e9;
  for (const h of md.hitboxes) {
    const d = frame < h.from ? h.from - frame : frame - h.to;
    if (d < bd) { bd = d; best = h; }
  }
  return best;
}

/** convex hull (a box seen with its depth) */
function hull(pts: Pt[]): Pt[] {
  const p = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o: Pt, a: Pt, b: Pt): number => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo: Pt[] = [], up: Pt[] = [];
  for (const q of p) { while (lo.length >= 2 && cr(lo[lo.length - 2]!, lo[lo.length - 1]!, q) <= 0) lo.pop(); lo.push(q); }
  for (let i = p.length - 1; i >= 0; i--) { const q = p[i]!; while (up.length >= 2 && cr(up[up.length - 2]!, up[up.length - 1]!, q) <= 0) up.pop(); up.push(q); }
  return lo.slice(0, -1).concat(up.slice(0, -1));
}

/** a tapering tube along a path: half-width wf(t) by arc fraction */
function tube(ctrl: Pt[], wf: (t: number) => number, per = 5): Pt[] {
  const p = ctrl.length > 2 ? smooth(ctrl, per) : [ctrl[0]!, mixP(ctrl[0]!, ctrl[1]!, 0.5), ctrl[1]!];
  const n = p.length, L: Pt[] = [], R: Pt[] = [];
  const cum = [0];
  for (let i = 1; i < n; i++) cum.push(cum[i - 1]! + dist(p[i]!, p[i - 1]!));
  const tot = cum[n - 1]! || 1;
  for (let i = 0; i < n; i++) {
    const d = unit(sub(p[Math.min(n - 1, i + 1)]!, p[Math.max(0, i - 1)]!)), nn = perp(d), w = wf(cum[i]! / tot);
    L.push(add(p[i]!, nn, w)); R.push(add(p[i]!, nn, -w));
  }
  return L.concat(R.reverse());
}

// ------------------------------------------------------------------------------------------------
// the chest's geometry, in its own frame: origin at the box centre, +x the mouth end, y down
// ------------------------------------------------------------------------------------------------

const X0 = -52, X1 = 48, YB = 27, YR = -23;
/** depth: the far end of the chest */
const DEP: Pt = [20, -12];
const HINGE: Pt = [X0, YR];
/** the lid's end profile, closed, relative to the hinge */
const LIDP: Pt[] = [[0, 0], [100, 0], [101, -9], [94, -19], [75, -27], [50, -30], [25, -27], [6, -19], [-1, -9]];
/** the tongue's root, just inside the front rim */
const MOUTH_B: Pt = [36, -27];
/** the legs' sockets on the underside: near back, near front (far ones add DEP * 0.8) */
const SOCK: Pt[] = [[-34, YB - 2], [30, YB - 2]];
const THIGH = 17, SHIN = 17;
const TEETH_LO = [6, 9, 6, 10, 7, 8, 12, 7, 13];
const TEETH_LO_F = [12, 8, 9];
const TEETH_UP = [8, 10, 7, 11, 8, 13, 9, 15];
const TEETH_UP_F = [13, 9, 11];

/** where the box is this frame */
interface Box { C: Pt; a: number; sx: number; sy: number }
const B = (bx: Box, p: Pt): Pt => {
  const x = p[0] * bx.sx, y = p[1] * bx.sy, c = Math.cos(bx.a), s = Math.sin(bx.a);
  return [bx.C[0] + x * c - y * s, bx.C[1] + x * s + y * c];
};
/** a point of the lid (closed frame, box units) opened by `open` radians about the hinge */
const lidPt = (p: Pt, open: number): Pt => rotAbout(p, HINGE, -open);

/** the whole pose of the Mimic for one frame */
interface Mim {
  box: Box;
  /** lid open, radians (0 shut) */
  open: number;
  /** eye: 0 shut .. 1 open .. 1.5 wide */
  eye: number;
  /** tongue tip out to this point (local units), with how far it has gone and how it wraps a catch */
  tip: Pt | null;
  tipK: number;
  wrap: number;
  /** the resting tongue over the teeth: 0 inside .. 1 lolling .. 2 hanging long */
  loll: number;
  /** four ground or air points for the feet: near back, near front, far back, far front */
  feet: Pt[];
  /** legs drawn up under the box (the 'just a chest' pose) */
  tuck: number;
  /** the swallow bulge */
  bulge: number;
  grounded: boolean;
}

// ------------------------------------------------------------------------------------------------
// the pose from the joints and the state
// ------------------------------------------------------------------------------------------------

const BITES: Partial<Record<MoveId, true>> = { jab: true, fair: true, uair: true, smash: true, uptilt: true, upsmash: true };
const TONGUE: Partial<Record<MoveId, true>> = { tilt: true, nair: true, grab: true, throwf: true, throwb: true, throwu: true, special: true };

/** the engine's rest offsets of each foot from the hip (ready stance), so the legs take only the change */
const REST_F = 12;
const REST_B = -19;

function mimicPose(J: Joints, x: FigureExtra): Mim {
  const s = x.state;
  const act = s.action, mv = s.move, f = Math.max(1, s.actionFrame), t = x.t;
  const fd = FIGHTERS[s.fighter] ?? FIGHTERS.vise;
  const md: MoveDef | null = mv && fd ? fd.moves[mv] : null;
  const box: Box = { C: add(J.hip, [-12, -1]), a: clamp((J.lean - BUILD.hunch) * 0.75, -0.9, 0.9), sx: 1 / Math.sqrt(J.stretch), sy: J.stretch };
  const breath = Math.sin(t * 2.1);
  let open = 0.3 + 0.07 * breath;
  // a blink every few seconds
  let eye = (t * 0.31) % 1 < 0.035 ? 0.15 : 1;
  let tip: Pt | null = null, tipK = 0, wrap = 0, loll = 1, tuck = 0, bulge = 0;
  const vxl = clamp((x.drag * s.facing) / 1200, -1, 1);
  // the scuttle: four short legs in a diagonal trot from the engine's feet
  const legScale = 0.85;
  const vF = sub(J.footF, J.hip), vB = sub(J.footB, J.hip);
  let dF: Pt = [(vF[0] - REST_F) * legScale, J.footF[1]], dB: Pt = [(vB[0] - REST_B) * legScale, J.footB[1]];
  let airLegs = !s.grounded || act === 'rise' || act === 'fall';
  let bite = 0;
  let biteAt: Pt | null = null;
  let rear = 0;

  const S = md ? md.startup : 1, Ac = md ? md.active : 1, R = md ? md.recovery : 1;
  const actEnd = S + Ac;
  const ff = act === 'charge' ? Math.min(f, S) : f;
  /** 0 -> 1 over startup, 1 through active, back to 0 over the first part of recovery */
  const swell = (rec = 0.6): number => ff <= S ? outQuad(ff / S) : ff <= actEnd ? 1 : 1 - inOutSine((ff - actEnd) / (R * rec));
  /** the lid of a bite: rises open over startup, snaps shut on the active frames, eases back ajar */
  const biteLid = (wide: number): number => ff <= S ? lerp(0.35, wide, outQuad(ff / S)) : ff <= actEnd ? lerp(wide, 0.02, c01((ff - S) / 1.5)) : lerp(0.02, 0.35, inOutSine((ff - actEnd) / (R * 0.5)));

  switch (act) {
    case 'idle': case 'respawn': case 'entrance': case 'turn':
      break;
    case 'land': {
      // the lid bangs open on landing and drops back
      const k = 1 - inOutSine((f - 1) / 10);
      open = lerp(open, 1.0, k); loll = lerp(1, 1.5, k); eye = lerp(1, 1.3, k);
      break;
    }
    case 'walk': {
      const ph = (s.x * 100 * s.facing) / (BUILD.leg[0] * 2.5);
      box.C = add(box.C, [0, -1.5 * Math.abs(Math.sin(PI * 2 * ph))]);
      box.a += 0.04 * Math.sin(PI * 2 * ph);
      open = 0.22 + 0.06 * Math.abs(Math.sin(PI * 2 * ph));
      break;
    }
    case 'run': {
      // a heavy scuttle: the box bounces and rocks, the lid bangs with every step
      const ph = (s.x * 100 * s.facing) / (BUILD.leg[0] * 4.4);
      const b2 = Math.abs(Math.sin(PI * 2 * ph));
      box.C = add(box.C, [4, -5 * b2 + 2]);
      box.a = 0.12 + 0.07 * Math.sin(PI * 2 * ph);
      open = 0.18 + 0.42 * b2;
      loll = 1.2;
      break;
    }
    case 'skid':
      box.a = -0.18; open = 0.6; loll = 1.3; eye = 1.3;
      break;
    case 'jumpsquat':
      open = 0.08; loll = 0.3; eye = 0.6;
      break;
    case 'rise':
      open = 0.55 + 0.12 * Math.sin(f * 0.9); loll = 1.1;
      break;
    case 'fall':
      open = 0.5 + 0.18 * Math.sin(f * 0.55); loll = 1.4; eye = 1.15;
      break;
    case 'win': {
      // laughing: the lid flaps open and shut, the box hops on the beat
      const k = c01(f / 10);
      const flap = Math.abs(Math.sin(t * 7.5));
      open = lerp(open, 0.08 + 0.95 * flap, k);
      box.C = add(box.C, [0, -6 * flap * k]);
      box.a = -0.12 * k + 0.05 * Math.sin(t * 7.5);
      eye = lerp(1, 0.35, k); loll = 1.2;
      break;
    }
    case 'lose': {
      // lid shut tight, legs tucked away, sitting on the floor: just an ordinary chest. Nothing to see.
      const k = inOutSine(f / 22);
      open = lerp(open, 0, c01(f / 6)); loll = 0;
      tuck = k;
      box.a = lerp(box.a, 0, k);
      box.C = mixP(box.C, [J.hip[0] - 12, -YB], k);
      // the eye, once in a long while, opens a crack to check
      const peek = (t * 0.23) % 1;
      eye = f > 40 && peek > 0.82 && peek < 0.95 ? 0.32 : lerp(1, 0, c01(f / 8));
      airLegs = false;
      break;
    }
    case 'hitstun': case 'held': case 'shieldbreak': case 'helpless': {
      // hurt: lid flung open, tongue out, eye wide
      const w = Math.sin(f * 0.9);
      open = act === 'helpless' ? 0.7 + 0.25 * Math.sin(t * 5) : 1.25 + 0.1 * w;
      eye = act === 'shieldbreak' ? 0.5 : 1.55;
      loll = act === 'helpless' ? 1.4 : 2;
      break;
    }
    case 'knockdown': case 'getup': {
      // tipped over on its back, legs paddling in the air
      const u = act === 'getup' ? c01(f / 22) : 0;
      const k = 1 - inOutSine((u - 0.25) / 0.6);
      box.a = lerp(box.a, -1.45, k);
      open = lerp(0.3, 1.0, k); eye = lerp(1, 1.4, k); loll = lerp(1, 2, k);
      break;
    }
    case 'shield': case 'shieldstun':
      // clamped shut and hunkered down
      open = act === 'shieldstun' ? 0.02 + 0.03 * Math.sin(f * 2) : 0;
      eye = 0.35; loll = 0;
      box.C = add(box.C, [-2, 9]); box.sy *= 0.94; box.sx *= 1.04; box.a = 0.05;
      break;
    case 'roll': case 'spotdodge': case 'airdodge':
      open = 0; loll = 0; eye = 0.3;
      break;
    case 'ledgehang': case 'ledgeclimb':
      // hanging off the ledge by the tongue
      tip = J.handF; tipK = 1; open = 0.9; eye = 1.2; box.a = clamp(box.a, -0.35, 0.35);
      break;
    case 'holding': {
      if (mv === 'special2') {
        // SWALLOW AND SPIT (24 ticks): the lid shut on the catch with a bulge, the tip of the tongue
        // poking out, a chew that shakes the whole box, then it rears back and flings the lid open
        // The held body hangs at the grip: the box lunges until the catch's middle is in its mouth,
        // so the dark of the mouth hides it and only the head and shoulders stick out over the lid.
        // (the engine's grip is not where the body hangs here: aim at the held hip, one body-width out)
        box.a = -0.12;
        const k0 = inOutSine(f / 3);
        box.C = mixP(box.C, add(box.C, sub([110, -82], B(box, [X1, YR]))), k0);
        if (f <= 11) {
          const w = f * 1.9;
          box.a = -0.12 + 0.07 * Math.sin(w);
          box.C = add(box.C, [2.2 * Math.sin(w * 1.3), 1.8 * Math.sin(w * 1.7)]);
          open = 0.42 + 0.12 * Math.abs(Math.sin(w * 0.8)); bulge = 1; eye = f < 4 ? 0.9 : 0.4; loll = 0;
        } else {
          const back = f <= 16 ? inOutSine((f - 11) / 5) : 1 - inOutSine((f - 16) / 4);
          const fling = c01((f - 16) / 2);
          box.a = lerp(-0.12, -0.45, back) + 0.2 * fling;
          box.C = add(box.C, [-10 * back + 6 * fling, -5 * back]);
          open = lerp(0.45, 0.3, back) * (1 - fling) + 1.6 * fling;
          bulge = 1 - fling; eye = fling > 0 ? 1.4 : 0.45; loll = 1.6 * fling;
        }
        break;
      }
      // the tongue wrapped round the catch at the engine's grip
      tip = J.handF; tipK = 1; wrap = 1; open = 1.0; eye = 1.1; loll = 0;
      box.a += 0.05 * Math.sin(f * 0.4);
      break;
    }
    case 'attack': case 'charge': {
      if (!md || !mv) break;
      const proj = md.projectile;
      if (md.kind === 'throw') {
        // the tongue keeps its catch and whips it where the throw goes
        tip = J.handF; tipK = 1; wrap = f <= S + 1 ? 1 : 1 - c01((f - S - 1) / 4); open = 1.1; loll = 0; eye = 1.2;
        if (mv === 'throwb') box.a -= 0.25 * swell();
        if (mv === 'throwu') { box.a -= 0.35 * swell(); open = 1.35; }
        break;
      }
      if (mv === 'special2') {
        // SWALLOW (the grab part): jaws wide and rearing, then SLAM shut lunging forward; a miss
        // leaves it chewing on nothing and opening again sulkily
        if (ff <= S) {
          const k = outQuad(ff / S);
          open = lerp(0.3, 1.6, k); box.a = lerp(box.a, -0.4, k); eye = lerp(1, 1.45, k); loll = 0.3;
          box.C = add(box.C, [-6 * k, -4 * k]);
        } else if (ff <= actEnd) {
          const k = c01((ff - S) / 1.5);
          open = lerp(1.6, 0.02, k); box.a = lerp(-0.4, 0.28, k); eye = 0.6; loll = 0;
          box.C = add(box.C, [lerp(-6, 18, k), lerp(-4, 4, k)]);
        } else {
          const v = (ff - actEnd) / Math.max(1, R);
          const back = 1 - inOutSine((v - 0.35) / 0.55);
          const w = (ff - actEnd) * 1.9;
          open = v < 0.4 ? 0.03 + 0.05 * Math.abs(Math.sin(w * 0.8)) : lerp(0.35, 0.05, back);
          box.a = 0.28 * back + (v < 0.4 ? 0.04 * Math.sin(w) : 0);
          box.C = add(box.C, [18 * back, 4 * back]);
          eye = v < 0.4 ? 0.5 : 0.8; loll = v < 0.4 ? 0 : 0.6;
        }
        break;
      }
      if (mv === 'recover') {
        // COIN BURST: crouch shut, then up on a blast of coins out of the bottom, legs flung wide
        if (ff <= S) {
          const k = outQuad(ff / S);
          open = lerp(0.3, 0.02, k); box.C = add(box.C, [0, 6 * k]); eye = 0.5; loll = 0.2;
        } else {
          const k = ff <= actEnd ? 1 : 1 - inOutSine((ff - actEnd) / (R * 0.7));
          open = lerp(0.3, 0.55 + 0.35 * Math.abs(Math.sin(ff * 0.7)), k); eye = lerp(1, 1.4, k); loll = lerp(1, 1.6, k);
          box.a = lerp(box.a, -0.15, k);
          airLegs = true;
          // the legs kicked out wide, away from the blast
          const sp = 18 * k;
          dF = [dF[0] + sp, dF[1]]; dB = [dB[0] - sp, dB[1]];
        }
        break;
      }
      if (proj && proj.tether) {
        // TONGUE LASH (its own move set): the stage draws the tongue from the head to the tip.
        // The box sets its mouth on the engine's head, so the tongue leaves the teeth.
        const k = swell(0.7);
        open = lerp(0.35, 1.5, k); eye = lerp(1, 1.4, k); loll = ff >= proj.frame ? 0 : lerp(1, 0.2, k);
        box.a = lerp(box.a, -0.15, k);
        box.C = add(box.C, sub(J.head, B(box, MOUTH_B)));
        // the line is gone (spent or the catch let go): the tongue snaps back into the mouth
        const gone = proj.frame + proj.life;
        if (ff > gone) {
          const u = c01((ff - gone) / 7);
          if (u < 1) { tip = add(J.head, [proj.vx * proj.life * 100 * (1 - inOutSine(u)) + 20, 6]); tipK = 1; }
          else loll = lerp(0, 1, c01((ff - gone - 7) / 6));
        }
        break;
      }
      if (mv === 'special') {
        // TONGUE LASH without a projectile (the borrowed Pounce): lid flung wide, the tongue thrown
        // forward to the hand, out past it to the hitbox while it is live
        const k = swell(0.5);
        let T = J.handF;
        const h = hitboxAt(md, Math.max(S + 1, Math.min(ff, actEnd)));
        if (h && ff > S && ff <= actEnd + 4) { const hc: Pt = [h.x * 100 + h.r * 60, -h.y * 100]; if (hc[0] > T[0]) T = mixP(T, hc, c01((ff - S) / 3)); }
        tip = T; tipK = k; open = lerp(0.35, 1.55, k); eye = lerp(1, 1.45, k); loll = 0;
        box.a = lerp(box.a, -0.1, k);
        break;
      }
      if (TONGUE[mv]) {
        const k = swell(0.6);
        tip = J.handF; tipK = k; open = lerp(0.35, 1.2, k); eye = lerp(1, 1.3, k); loll = lerp(1, 0, k);
        break;
      }
      if (BITES[mv]) {
        const h = hitboxAt(md, Math.max(S + 1, Math.min(ff, actEnd)));
        if (h) {
          biteAt = [h.x * 100, -h.y * 100];
          bite = swell(0.5);
          const wide = mv === 'smash' || mv === 'upsmash' ? 1.6 : 1.3;
          open = biteLid(wide);
          if (act === 'charge') open = wide + 0.05 * Math.sin(f * 2.1);
          rear = mv === 'uptilt' || mv === 'upsmash' || mv === 'uair' ? 1 : 0;
          eye = ff <= actEnd ? 1.35 : 1.1; loll = 0;
          if (mv === 'smash' && ff <= S) { box.a -= 0.3 * outQuad(ff / S); box.C = add(box.C, [-8 * outQuad(ff / S), 0]); }
        }
        break;
      }
      if (mv === 'dash') {
        // a charge: lid jammed shut, box rammed forward corner first
        const k = swell(0.6);
        open = lerp(0.3, 0.03, k); eye = lerp(1, 0.55, k); loll = lerp(1, 0, k); box.a += 0.08 * k;
        break;
      }
      if (mv === 'dair' || mv === 'bair') {
        // stomp below, or a mule kick behind: lid shut, the claws do it
        const k = swell(0.6);
        open = lerp(0.3, 0.05, k); eye = lerp(1, 0.6, k); loll = lerp(1, 0.2, k);
        if (mv === 'bair') { box.a += 0.25 * k; dB = [dB[0] - 14 * k, dB[1]]; }
        else { dF = [dF[0], dF[1] + 8 * k]; dB = [dB[0], dB[1] + 8 * k]; }
        break;
      }
      // anything else: the lid opens with the effort
      open = lerp(0.3, 0.9, swell());
      break;
    }
  }

  // a bite: the box swings its mouth toward the hitbox (tilting back to bite up), then lunges at it
  if (biteAt && bite > 0) {
    const ang = angOf(sub(biteAt, box.C));
    const mAng = angOf(MOUTH_B);
    const aWant = clamp(ang - mAng - 0.25, rear ? -1.25 : -0.7, 0.85);
    box.a = lerp(box.a, aWant, bite * 0.85);
    const M = B(box, MOUTH_B);
    box.C = add(box.C, within(sub(biteAt, M), 38), bite * 0.8);
  }

  // feet: each foot of a diagonal pair follows one engine foot, moved under its own socket
  const sock = (i: number): Pt => { const sk = SOCK[i % 2]!; return B(box, i >= 2 ? add(sk, DEP, 0.8) : sk); };
  const feet: Pt[] = [];
  for (let i = 0; i < 4; i++) {
    const front = i % 2 === 1;
    const d = (i === 1 || i === 2) ? dF : dB;
    const sk = sock(i);
    const splay = front ? 9 : -9;
    let p: Pt;
    if (airLegs) {
      // dangling and pedalling under the box, kicked about by the engine's legs
      p = add(sk, [splay * 0.8 + d[0] * 0.5, 22 + (d[1] - J.hip[1] - BUILD.hipY) * 0.25]);
      p = add(sk, within(sub(p, sk), THIGH + SHIN - 3));
    } else {
      p = [sk[0] + splay + d[0], Math.min(0, d[1])];
    }
    if (tuck > 0) p = mixP(p, add(sk, [front ? -6 : 6, 4]), tuck);
    feet.push(p);
  }
  // drag: the loll swings back when it runs
  if (Math.abs(vxl) > 0.2 && loll > 0) loll += 0.2 * Math.abs(vxl);
  return { box, open, eye, tip, tipK, wrap, loll, feet, tuck, bulge, grounded: s.grounded && !airLegs };
}

// ------------------------------------------------------------------------------------------------
// shapes
// ------------------------------------------------------------------------------------------------

/** a row of uneven teeth along a rim from a to b, pointing along `out`, as one outline */
function teethRow(a: Pt, b: Pt, out: Pt, sizes: number[], hook: number): Pt[] {
  const n = sizes.length, u = unit(sub(b, a)), step = dist(a, b) / n;
  const pts: Pt[] = [add(a, out, -3.5)];
  for (let i = 0; i < n; i++) {
    const sz = sizes[i]!, c = mixP(a, b, (i + 0.5) / n), hw = Math.min(step * 0.52, 2.4 + sz * 0.3);
    pts.push(add(c, u, -hw), add(add(c, u, -hw * 0.55), out, sz * 0.55), add(add(c, u, sz * hook), out, sz), add(add(c, u, hw * 0.6), out, sz * 0.45), add(c, u, hw));
  }
  pts.push(add(b, out, -3.5));
  return pts;
}

/** a big clawed foot: a pad on the deck and three hooked claws fanned out along `fwd` (+1/-1) */
function footShape(g: Pt, fwd: number, k: number, spread: number): Pt[] {
  const P = (u: number, v: number): Pt => [g[0] + u * fwd * k, g[1] + v * k];
  const pts: Pt[] = [P(-9, -2), P(-9, -9), P(-3, -14), P(5, -13)];
  const angs = [-0.45 * spread - 0.15, 0.0, 0.42];
  const lens = [13, 15, 12];
  for (let i = 0; i < 3; i++) {
    const d = dir(angs[i]!), n: Pt = [d[1], -d[0]];
    const base: Pt = [7, -9.5 + i * 4];
    const L = lens[i]!;
    const kn = add(base, d, L * 0.45);
    const tip = add(add(base, d, L), [0, 4]);
    pts.push(P(...add(base, n, 3.4)), P(...add(kn, n, 3.2)), P(...add(add(kn, d, L * 0.35), n, 1.6)), P(...tip), P(...add(kn, n, -1.6)), P(...add(base, n, -1.2)));
  }
  pts.push(P(8, 1), P(-3, 1.5), P(-9, 0.5));
  return pts;
}

function drawLeg(ink: Pen, hip: Pt, foot: Pt, front: boolean, near: boolean, onFloor: boolean, sd: number): void {
  const fwd = front ? 1 : -1;
  const ank = add(foot, [0, -9]);
  const [knee, a2] = ik2(hip, ank, THIGH, SHIN, [fwd, -0.6]);
  const k = near ? 1.15 : 1.02;
  // the foot: flat on the deck, or hanging with the claws curled down
  const foot2 = onFloor && foot[1] > -2 ? add(a2, [0, 9]) : add(a2, [0, 9]);
  const shin = tube([knee, mixP(knee, a2, 0.55), a2], (u) => (8 - u * 2) * k, 3);
  const thigh = tube([hip, knee], (u) => (10.5 - u * 3) * k, 3);
  ink.form(shin, { w: 2.1, seed: sd });
  ink.form(footShape(foot2, fwd, k, onFloor ? 1 : 0.6), { w: 1.7, seed: sd + 1 });
  ink.form(thigh, { w: 2.3, seed: sd + 2 });
  if (!near) { ink.hatch(thigh, { angle: 1.0, gap: 3.8, w: 0.9, seed: sd + 3 }); ink.hatch(shin, { angle: 1.0, gap: 3.8, w: 0.9, seed: sd + 4 }); }
  else {
    // scales down the shin
    const u = unit(sub(a2, knee)), n = perp(u);
    for (let i = 0; i < 2; i++) { const c = mixP(knee, a2, 0.3 + i * 0.32); ink.cut([add(add(c, u, -1.5), n, -4), add(c, u, 1.5), add(add(c, u, -1.5), n, 4)], { w: 1, seed: sd + 5 + i }); }
  }
}

/** a coin: a disc seen at an angle (ry/r from the tilt), gold, with its rim */
function coin(ink: Pen, c: Pt, r: number, rot: number, tilt: number, sd: number): void {
  const ry = r * Math.max(0.18, Math.abs(Math.cos(tilt)));
  ink.form(ell(c[0], c[1], r, ry, rot, 14), { tint: 'gold', w: 1.2, seed: sd });
  if (ry > r * 0.45) ink.cut(ell(c[0], c[1], r * 0.62, ry * 0.62, rot, 12), { closed: true, w: 0.8, seed: sd + 1 });
}

/** the tongue as a thick tapering ribbon from the mouth along a path, a centre line, a curled,
 *  slightly forked tip; with `wrap` it coils round what it caught at the end. Path in any units. */
function drawTongue(ink: Pen, path: Pt[], w0: number, wrap: number, sd: number, curl = 1): void {
  const n0 = path.length;
  const end = path[n0 - 1]!;
  const dEnd = unit(sub(end, path[Math.max(0, n0 - 2)]!));
  // the side the tip curls to: down on the picture
  let nd = perp(dEnd);
  if (nd[1] < 0) nd = [-nd[0], -nd[1]];
  if (wrap > 0.05) {
    const R = 21 * (0.75 + 0.25 * wrap);
    const c = add(end, nd, R * 0.9);
    // the line runs on to the near side of the catch, then loops round it twice, each loop over the last
    ink.form(tube(path, (u) => lerp(w0, w0 * 0.72, u), 6), { w: 2.3, seed: sd });
    ink.cut(smooth(path.slice(0, n0 - 0), 5).slice(2, -2), { w: 1.1, seed: sd + 1 });
    const a0 = angOf(sub(end, c));
    const turns = 1.6 * wrap + 0.3;
    const coil: Pt[] = [];
    const N = 30;
    for (let i = 0; i <= N; i++) {
      const u = i / N, a = a0 + u * turns * PI * 2 * (dEnd[0] >= 0 ? 1 : -1);
      coil.push(add(add(c, dir(a), R * (1 - 0.12 * u)), [0, (u - 0.3) * 20]));
    }
    const pieces = [[0, 9], [8, 17], [16, 24], [23, 30]];
    pieces.forEach(([a, b], k) => {
      const seg = coil.slice(a, b + 1);
      const sh = tube(seg, (u) => w0 * 0.72 - (k + u) * 0.55, 3);
      ink.form(sh, { w: 1.9, seed: sd + 2 + k });
      if (k % 2 === 1) ink.hatch(sh, { angle: 0.4, gap: 3.4, w: 0.9, seed: sd + 8 + k });
    });
    const last = coil[N]!, dl = unit(sub(last, coil[N - 2]!)), nl = perp(dl);
    ink.form(tube([last, add(add(last, dl, 7), nl, 2), add(add(last, dl, 9), nl, -4)], (u) => (w0 * 0.72 - 2.2) * (1 - u * 0.75), 3), { w: 1.4, seed: sd + 14 });
    return;
  }
  // free: the tip curls down and over, with a small fork
  const curl1 = add(add(end, dEnd, 7 * curl), nd, 6 * curl), curl2 = add(add(end, dEnd, 3 * curl), nd, 12 * curl), curl3 = add(add(end, dEnd, -4 * curl), nd, 10 * curl);
  const full = path.concat([curl1, curl2, curl3]);
  const sh = tube(full, (u) => w0 * (1 - 0.62 * u), 5);
  ink.form(sh, { w: 2.3, seed: sd });
  const sm = smooth(path, 5);
  ink.cut(sm.slice(Math.min(2, sm.length - 2), Math.max(3, sm.length - 2)), { w: 1.1, seed: sd + 1 });
  // the fork: a notch cut into the end of the curl
  const fd = unit(sub(curl3, curl2));
  ink.cut([add(curl3, fd, 2), add(curl3, fd, -4)], { w: 1.3, seed: sd + 2, taper: 0.2 });
}

// ------------------------------------------------------------------------------------------------
// the chest
// ------------------------------------------------------------------------------------------------

function drawChest(ink: Pen, m: Mim, tint: string, legs: boolean): void {
  const bx = m.box;
  const T = (p: Pt): Pt => B(bx, p);
  const mass = ink.mode === 'mass';
  const near0: Pt[] = [[X0, YB], [X1, YB], [X1 + 1, YR], [X0 - 1, YR]];
  // the swallow bulge: the box swells round its catch
  const bg = m.bulge;
  if (bg > 0) { near0[2] = add(near0[2]!, [3 * bg, -4 * bg]); near0[3] = add(near0[3]!, [-3 * bg, -3 * bg]); near0[0] = add(near0[0]!, [-2 * bg, 0]); near0[1] = add(near0[1]!, [3 * bg, 0]); }
  const far0 = near0.map((p) => add(p, DEP));
  const near = near0.map(T), far = far0.map(T);
  const NP = (u: number, v: number): Pt => { const a = mixP(near0[0]!, near0[1]!, u), b = mixP(near0[3]!, near0[2]!, u); return T(mixP(a, b, v)); };

  // ---- the far legs, in shade ----
  if (legs) for (const i of [2, 3]) drawLeg(ink, T(add(SOCK[i % 2]!, DEP, 0.8)), m.feet[i]!, i === 3, false, m.grounded, 300 + i * 10);

  // ---- the box: the silhouette with its depth, the shaded front end, the open top ----
  ink.form(hull(near.concat(far)), { w: 2.8, seed: 11 });
  const sideFace = [near[1]!, far[1]!, far[2]!, near[2]!];
  ink.hatch(sideFace, { angle: 1.35 + bx.a, gap: 4.2, w: 0.9, seed: 12 });
  ink.cut([mixP(near[1]!, near[2]!, 0.36), mixP(far[1]!, far[2]!, 0.36)], { w: 1.2, seed: 13 });
  ink.cut([mixP(near[1]!, near[2]!, 0.68), mixP(far[1]!, far[2]!, 0.68)], { w: 1.2, seed: 14 });

  // the mouth: the open top and the gap under the lid, dark
  const open = m.open;
  const L = (p: Pt): Pt => T(lidPt(add(HINGE, p), open));
  const lidFrontN = L([100, 0]), lidFrontF = T(add(lidPt(add(HINGE, [100, 0]), open), DEP));
  ink.mask([near[3]!, near[2]!, far[2]!, far[3]!]);
  if (open > 0.05) ink.mask([near[3]!, near[2]!, far[2]!, lidFrontF, lidFrontN, T(HINGE)]);
  // coins lying in the mouth behind the teeth
  if (open > 0.12) for (let i = 0; i < 3; i++) {
    const c = T(add(mixP([X0 + 6, YR], [X1, YR], 0.3 + i * 0.24), [DEP[0] * 0.5, DEP[1] * 0.5 + 1]));
    coin(ink, c, 5.5, -0.15 + i * 0.12 + bx.a, 1.15, 20 + i * 2);
  }

  // ---- the near end: planks, grain, the knot, the iron band in the side's tint, gold brackets ----
  ink.form(near, { w: 3.0, seed: 30 });
  ink.cut([NP(0.02, 0.35), NP(0.98, 0.35)], { w: 1.4, taper: 0.2, seed: 31 });
  ink.cut([NP(0.02, 0.68), NP(0.98, 0.68)], { w: 1.4, taper: 0.2, seed: 32 });
  ink.cut(smooth([NP(0.06, 0.17), NP(0.2, 0.13), NP(0.32, 0.19)], 5), { w: 1, seed: 33 });
  ink.cut(smooth([NP(0.68, 0.52), NP(0.8, 0.47), NP(0.94, 0.52)], 5), { w: 1, seed: 34 });
  const knot = NP(0.2, 0.52);
  ink.cut(ell(knot[0], knot[1], 4.5, 2.4, bx.a + 0.1, 12), { closed: true, w: 1, seed: 35 });
  ink.cut(smooth([NP(0.06, 0.84), NP(0.2, 0.8), NP(0.3, 0.86)], 4), { w: 1, seed: 36 });
  const band = [NP(0.4, -0.01), NP(0.6, -0.01), NP(0.6, 1.01), NP(0.4, 1.01)];
  ink.form(band, { tint, w: 1.8, seed: 37 });
  for (const v of [0.17, 0.5, 0.83]) { const r = NP(0.5, v); ink.dot(r[0], r[1], 1.7, { seed: 38 }); }
  // the band runs on round the front end
  ink.form([mixP(near[1]!, near[2]!, 0.4), mixP(far[1]!, far[2]!, 0.4), mixP(far[1]!, far[2]!, 0.6), mixP(near[1]!, near[2]!, 0.6)], { tint, w: 1.4, seed: 39 });
  let bi = 0;
  for (const [u, v, su, sv] of [[0, 0, 1, 1], [1, 0, -1, 1], [0, 1, 1, -1], [1, 1, -1, -1]] as [number, number, number, number][]) {
    const br = [NP(u, v), NP(u + su * 0.19, v), NP(u + su * 0.19, v + sv * 0.13), NP(u + su * 0.07, v + sv * 0.13), NP(u + su * 0.07, v + sv * 0.42), NP(u, v + sv * 0.42)];
    ink.form(br, { tint: 'gold', w: 1.5, seed: 40 + bi++ });
  }

  // lower teeth along the near rim and round the front rim
  ink.form(teethRow(T([X0 + 5, YR]), T([X1 - 1, YR]), unit(sub(T([0, -1]), T([0, 0]))), TEETH_LO, 0.16), { w: 1.4, seed: 45 });
  ink.form(teethRow(T([X1 + 1, YR - 1]), T(add([X1, YR], DEP, 0.92)), unit(sub(T([0, -1]), T([0, 0]))), TEETH_LO_F, 0.16), { w: 1.3, seed: 46 });

  // ---- the tongue: lolling over the front teeth, or out to the tip ----
  const root = T(MOUTH_B);
  if (m.tip && m.tipK > 0.02) {
    const out = T(add(MOUTH_B, [16, -4]));
    const lollEnd = T([X1 + 8, YR + 14]);
    const tip = mixP(lollEnd, m.tip, m.tipK);
    const span = dist(out, tip);
    const dd = unit(sub(tip, out));
    let sag = perp(dd); if (sag[1] < 0) sag = [-sag[0], -sag[1]];
    const mid = add(mixP(out, tip, 0.5), sag, Math.min(14, span * 0.08) * (1 - m.wrap * 0.5));
    drawTongue(ink, [root, out, mid, tip], 8.5, m.wrap, 60);
  } else if (m.loll > 0.05) {
    // draped out over the front teeth and hanging down past the front of the box, tip turned up
    const l = m.loll;
    const p0 = root, p1 = T([X1 + 3, YR - 6]);
    const p2 = T([X1 + 15 + 3 * l, YR + 1 + 2 * l]);
    const p3 = T([X1 + 22 + 6 * l, YR + 7 + 9 * l]);
    drawTongue(ink, [p0, p1, p2, p3], 8, 0, 60, 0.22);
  }

  // ---- the lid: the barrel seen from its end, boards running back, band, brackets, the eye ----
  const lidN = smooth(LIDP, 3, true).map((p) => L(p));
  const lidF = lidN.map((p, i) => { void p; return T(add(lidPt(add(HINGE, smooth(LIDP, 3, true)[i]!), open), DEP)); });
  ink.form(hull(lidN.concat(lidF)), { w: 2.8, seed: 50 });
  // the top boards running back
  for (const [u, v] of [[0.5, -30], [0.78, -26]] as [number, number][]) {
    const a = L([u * 100, v]);
    ink.cut([a, add(a, sub(T(DEP), T([0, 0])), 0.95)], { w: 1.1, seed: 51 });
  }
  ink.form(lidN, { w: 3.0, seed: 52 });
  // the band over the lid, in the side's tint
  ink.form([L([40, 0.5]), L([60, 0.5]), L([60, -30.5]), L([40, -30.5])], { tint, w: 1.7, seed: 53 });
  { const r1 = L([50, -6]), r2 = L([50, -21]); ink.dot(r1[0], r1[1], 1.6, { seed: 54 }); ink.dot(r2[0], r2[1], 1.6, { seed: 54 }); }
  // the lid's plank line and shade at the hinge end
  ink.cut(smooth([L([4, -10]), L([20, -12.5]), L([36, -12])], 4), { w: 1.2, seed: 55 });
  ink.hatch(smooth([L([0, -9]), L([6, -19]), L([22, -26]), L([22, -4]), L([4, -2])], 3, true), { angle: 1.1 + bx.a, gap: 4, w: 0.9, seed: 56 });
  ink.form([L([0, 0]), L([17, 0]), L([17, -4]), L([6, -4]), L([5, -13]), L([-0.5, -11])], { tint: 'gold', w: 1.4, seed: 57 });
  ink.form([L([100, 0]), L([83, 0]), L([83, -4]), L([94, -4]), L([95, -13]), L([100.5, -11])], { tint: 'gold', w: 1.4, seed: 58 });
  // the eye in the knot: grain swirling round an almond with a gold slit pupil
  {
    const e = L([74, -15]), ue = unit(sub(L([1, 0]), L([0, 0])));
    const fr = (a: number, b: number): Pt => [e[0] + ue[0] * a - ue[1] * b, e[1] + ue[1] * a + ue[0] * b];
    ink.cut(smooth([fr(-13, -8), fr(-2, -11), fr(9, -9.5), fr(14, -5)], 4), { w: 1, seed: 59 });
    ink.cut(smooth([fr(-14, 6), fr(-3, 9.5), fr(8, 8.5), fr(13, 4)], 4), { w: 1, seed: 60 });
    const eo = m.eye;
    if (eo < 0.2) {
      ink.cut(smooth([fr(-9, 0), fr(0, 1.8), fr(9, 0)], 3), { w: 1.6, seed: 61 });
    } else {
      const hw = 9 + 1.5 * Math.max(0, eo - 1), hh = 4.8 * eo;
      const almond = smooth([fr(-hw, 0), fr(0, -hh), fr(hw, 0), fr(0, hh)], 5, true);
      ink.mask(almond);
      ink.cut(almond, { closed: true, w: 1.4, seed: 62 });
      const ph = Math.max(1.2, hh - 1);
      const pw = eo > 1.2 ? 2.2 : 1.4;
      ink.form(smooth([fr(1.5, -ph), fr(1.5 + pw, 0), fr(1.5, ph), fr(1.5 - pw, 0)], 3, true), { tint: 'gold', w: 0.8, seed: 63 });
      // a heavy brow pressing down when it squints or bites
      if (eo < 0.7 || eo > 1.25) ink.cut([fr(-11, -hh - 2.5), fr(10, -hh - 0.5 + (eo > 1.25 ? -3 : 1.5))], { w: 1.6, seed: 64, taper: 0.4 });
    }
  }
  // the hasp hanging off the front edge, in the side's tint
  {
    const hp = mixP(lidFrontN, lidFrontF, 0.5), uh = unit(sub(lidFrontN, L([100, -10])));
    const fr = (a: number, b: number): Pt => [hp[0] + uh[0] * a - uh[1] * b, hp[1] + uh[1] * a + uh[0] * b];
    ink.form(smooth([fr(-7, -6), fr(-7, 6), fr(10, 6), fr(15, 0), fr(10, -6)], 3, true), { tint, w: 1.6, seed: 65 });
    const kh = fr(5, 0); ink.dot(kh[0], kh[1], 1.8, { seed: 66 });
  }
  // upper teeth down the lid's rim and its front edge
  {
    const dn = unit(sub(L([0, 1]), L([0, 0])));
    ink.form(teethRow(L([8, 0]), L([99, 0]), dn, TEETH_UP, -0.15), { w: 1.4, seed: 67 });
    ink.form(teethRow(add(lidFrontN, sub(lidFrontF, lidFrontN), 0.04), add(lidFrontN, sub(lidFrontF, lidFrontN), 0.94), dn, TEETH_UP_F, -0.15), { w: 1.3, seed: 68 });
  }
  // strain lines when it has something in its mouth
  if (bg > 0.3) {
    ink.cut(smooth([NP(0.1, 0.05), NP(0.3, 0.1), NP(0.45, 0.06)], 3), { w: 1.2, seed: 69 });
    ink.cut(smooth([NP(0.65, 0.07), NP(0.85, 0.12), NP(0.95, 0.05)], 3), { w: 1.2, seed: 70 });
  }
  void mass;

  // ---- the near legs ----
  if (legs) for (const i of [0, 1]) drawLeg(ink, T(SOCK[i]!), m.feet[i]!, i === 1, true, m.grounded, 320 + i * 10);
}

function drawMimic(ink: Pen, J: Joints, x: FigureExtra): void {
  const m = mimicPose(J, x);
  drawChest(ink, m, x.sideTint || 'blue', m.tuck < 0.98);
}

// ------------------------------------------------------------------------------------------------
// the abilities' own lines
// ------------------------------------------------------------------------------------------------

function drawMimicMove(ink: Pen, J: Joints, x: FigureExtra): void {
  const s = x.state;
  const mv = s.move, f = Math.max(1, s.actionFrame);
  const fd = FIGHTERS[s.fighter] ?? FIGHTERS.vise;
  const md = mv && fd ? fd.moves[mv] : null;
  if (s.action === 'win' && f > 8) {
    // coins hopping out of the laughing mouth and falling away
    const m = mimicPose(J, x);
    const mouth = B(m.box, [X1 - 6, YR - 8]);
    for (let i = 0; i < 4; i++) {
      const u = (x.t * 0.9 + i * 0.27) % 1;
      const vx = 30 + 40 * h01(i * 3.1), vy = 85 + 30 * h01(i * 1.7);
      const p: Pt = [mouth[0] + vx * u - 20 * i * 0.2, mouth[1] - vy * u + 150 * u * u];
      if (p[1] > -4) continue;
      coin(ink, p, 5.5, i * 0.7, x.t * 9 + i * 1.3, 400 + i * 2);
    }
    return;
  }
  if (s.action === 'holding' && mv === 'special2' && f > 16) {
    // THE SPIT: the lid flung open, speed strokes and coins thrown out of the mouth
    const m = mimicPose(J, x);
    const mouth = B(m.box, [X1, YR - 6]);
    const go = c01((f - 16) / 7);
    const k = 1 - 0.5 * go;
    for (let i = 0; i < 4; i++) {
      const y = mouth[1] - 18 + i * 10;
      const x0 = mouth[0] + 10 + go * 24;
      ink.line([[x0, y], [x0 + (70 + 30 * h01(i + 2)) * k, y - 6 + i * 3]], { w: 2.4, taper: 0.9, seed: 460 + i, alpha: 0.9 });
    }
    for (let i = 0; i < 4; i++) {
      const p: Pt = [mouth[0] + 16 + go * (50 + 28 * i), mouth[1] - 22 + i * 11 + go * go * 16];
      coin(ink, p, 5.5, i, f * 0.8 + i, 470 + i * 2);
    }
    return;
  }
  if (!md || !mv || (s.action !== 'attack' && s.action !== 'charge')) return;
  const S0 = md.startup, actEnd = md.startup + md.active;
  if (mv === 'recover' && s.action === 'attack' && f > S0 && f <= actEnd + 6) {
    // COIN BURST: a fan of coins blown down out of the bottom of the box
    const m = mimicPose(J, x);
    const base = B(m.box, [0, YB + 4]);
    const age = f - S0;
    const fade = f <= actEnd ? 1 : 1 - (f - actEnd) / 7;
    for (let i = 0; i < 11; i++) {
      const a = PI / 2 + (i - 5) * 0.2 + (h01(i * 2.3) - 0.5) * 0.14;
      const born = (i * 0.37) % 3;
      const life = ((age - born) % 6 + 6) % 6;
      const r = 10 + life * (14 + 6 * h01(i * 1.1)) + (i % 2) * 6;
      const p = add(base, dir(a), r * (0.9 + 0.2 * fade));
      coin(ink, p, 6 - life * 0.35, a + i, i * 1.1 + f * 0.6, 420 + i * 2);
    }
    // the blast: a few strokes down
    for (let i = 0; i < 4; i++) {
      const a = PI / 2 + (i - 1.5) * 0.28;
      const p0 = add(base, dir(a), 8);
      ink.line([p0, add(p0, dir(a), (60 + 25 * h01(i + 4)) * fade)], { w: 2.2, taper: 0.9, tint: 'gold', seed: 450 + i, alpha: 0.9 });
    }
    return;
  }
  if (mv === 'special2' && s.action === 'attack' && f > S0 && f <= actEnd + 1) {
    // the slam: two short strokes off the shutting lid
    const m = mimicPose(J, x);
    const top = B(m.box, [X1 + 4, YR - 14]);
    for (let i = 0; i < 3; i++) ink.line([add(top, [6 + i * 3, -8 + i * 8]), add(top, [22 + i * 4, -14 + i * 12])], { w: 2.2, taper: 0.8, seed: 480 + i });
    return;
  }
  if (mv === 'special' && s.action === 'attack' && f > S0 && f <= actEnd + 4 && !md.projectile) {
    // gold speed lines along the thrown tongue
    const m = mimicPose(J, x);
    if (!m.tip) return;
    const a = B(m.box, MOUTH_B), b = m.tip;
    const d = unit(sub(b, a)), n = perp(d), L = dist(a, b);
    for (let i = 0; i < 3; i++) {
      const o = (i - 1) * 13 + (i === 1 ? -22 : 0);
      const p0 = add(add(a, d, L * 0.25), n, o), p1 = add(add(a, d, L * 0.85), n, o * 0.9);
      ink.line([p0, p1], { w: 1.6, taper: 0.9, tint: 'gold', seed: 490 + i, alpha: 0.9 });
    }
  }
}

// ------------------------------------------------------------------------------------------------
// the Tongue Lash tether, drawn by the stage from the head (its mouth) to the tip
// ------------------------------------------------------------------------------------------------

function drawMimicTether(ink: Pen, from: Pt, to: Pt, p: Projectile, t: number): void {
  void t;
  const d = sub(to, from), L = len(d), u = unit(d);
  let sag = perp(u); if (sag[1] < 0) sag = [-sag[0], -sag[1]];
  // a slight whip while it flies, taut while it reels
  const bow = p.drag ? 4 : Math.min(18, L * 0.06) * Math.sin(p.life * 0.4 + 1);
  const out = add(from, u, Math.min(14, L * 0.2));
  const mid = add(add(from, u, L * 0.55), sag, bow);
  drawTongue(ink, [from, out, mid, to], 9, p.drag ? 1 : 0, 600 + (p.owner * 40));
  if (!p.drag) {
    // gold speed strokes along it while it flies
    const n = perp(u);
    for (let i = 0; i < 2; i++) {
      const o = i ? -16 : 18;
      ink.line([add(add(from, u, L * 0.3), n, o), add(add(from, u, L * 0.8), n, o * 0.85)], { w: 1.5, taper: 0.9, tint: 'gold', seed: 640 + i, alpha: 0.85 });
    }
  }
}

function drawMimicProjectile(ink: Pen, p: Projectile, t: number): void {
  void t;
  // the tongue's tip is drawn with the tether; anything else it throws is a coin
  if (p.kind === 'tongue' || p.tether) return;
  const r = Math.max(8, p.r * 100 * 0.6);
  const a = p.cd === 1 ? 0.4 : 1;
  void a;
  coin(ink, [0, 0], r, 0, p.life * 0.5, 700 + (p.id % 30));
}

// ------------------------------------------------------------------------------------------------
// the portrait: the lid ajar with the eye, the teeth and the tongue, about 100 units wide
// ------------------------------------------------------------------------------------------------

function drawPortrait(ink: Pen, t: number): void {
  const m: Mim = {
    box: { C: [-6, 26], a: -0.05, sx: 0.92, sy: 0.92 }, open: 0.42 + 0.04 * Math.sin(t * 2.1), eye: 1.1, tip: null, tipK: 0, wrap: 0,
    loll: 0.9, feet: [], tuck: 1, bulge: 0, grounded: true,
  };
  drawChest(ink, m, 'gold', false);
}

export const MIMIC: CharacterDef = {
  id: 'vise',
  build: BUILD,
  anims: {
    jab: { anim: 'jab' },
    tilt: { anim: 'swingSide' },
    uptilt: { anim: 'swingUp' },
    dash: { anim: 'charge' },
    smash: { anim: 'slam', hand: 'both' },
    upsmash: { anim: 'swingUp', hand: 'both' },
    nair: { anim: 'spin' },
    fair: { anim: 'jab' },
    bair: { anim: 'kick' },
    uair: { anim: 'swingUp' },
    dair: { anim: 'stomp' },
    grab: { anim: 'reach' },
    throwf: { anim: 'throwObj', hand: 'both' },
    throwb: { anim: 'throwObj', hand: 'both' },
    throwu: { anim: 'throwObj', hand: 'both' },
    special: { anim: 'reach' },
    special2: { anim: 'slam', hand: 'both' },
    recover: { anim: 'leap' },
  },
  draw: drawMimic,
  drawMove: drawMimicMove,
  drawProjectile: drawMimicProjectile,
  drawTether: drawMimicTether,
  portrait: drawPortrait,
};

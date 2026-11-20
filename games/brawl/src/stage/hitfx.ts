// Ringout hit feel: what the viewer needs around contact and motion, driven only by frame.fight.
// One clean idea per event (the owner's clean-look rule, 2026-11-19):
//
//   light hit   a small bright cut at the contact, 3 frames
//   medium hit  the cut plus one fan along the launch line, gone with the hit pause
//   heavy hit   a large cut on the contact frame, one sheet of the hitter's colour along the launch
//               line behind the robots, the set dimmed; all gone when the hit pause ends
//   lethal hit  nothing: ko.ts owns that moment
//   launch      one smooth tapering ribbon in the victim's side colour along its path, gone in 0.6 s
//   dust        one small soft puff for a dash start, a hard landing, a slam into the deck
//   big swings  one thin arc while the swing is live (heaviest moves only)
//   shield      a calm ring of plates in the side colour; a block is one flash on its face
//   projectiles one small bright shape with a short tail (a rivet, a molten glob)
//
// The cut is ours: one hard diagonal blade split along its length, its two halves offset.
// Do not add stars, shards, chunks, needles, comets, crowns, kites, debris, cloud trails or a
// camera cut-in back (see captures/hitfeel/JOURNAL.md, clean pass).
//
// Three pooled vertex batches (one draw call each, hidden when empty): UNDER draws over the set and
// under both robots (the heavy sheet, the medium fan), BACK is depth tested just behind the robots
// (trail, dust, swing arcs, the cut after its first frames), FRONT draws over everything (the cut's
// first two frames, the shield, projectiles). Effects age on the playback's clock.

import * as THREE from 'three';
import type { CameraRig, CreateHitFx, Frame, StageCtx, StageModule } from './api.ts';
import { LAYER } from './api.ts';
import type { FighterState, FightState, Side, SimEvent } from '../sim/types.ts';
import { PALETTE } from './style.ts';

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);
const easeOut = (t: number) => 1 - (1 - t) * (1 - t) * (1 - t);
const TAU = Math.PI * 2;

/** mix two #rrggbb colours in sRGB, returns #rrggbb */
function mixHex(a: string, b: string, k: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const ch = (sh: number) => Math.round(((pa >> sh) & 255) * (1 - k) + ((pb >> sh) & 255) * k);
  return '#' + ((1 << 24) | (ch(16) << 16) | (ch(8) << 8) | ch(0)).toString(16).slice(1);
}

// ---------------------------------------------------------------------------------------------
// a batch of flat coloured triangles in the XY plane at a fixed z
// ---------------------------------------------------------------------------------------------
class Batch {
  readonly mesh: THREE.Mesh;
  private readonly pos: Float32Array;
  private readonly col: Float32Array;
  private readonly posAttr: THREE.BufferAttribute;
  private readonly colAttr: THREE.BufferAttribute;
  private readonly maxVerts: number;
  private n = 0;
  z = 0;
  private r = 1;
  private g = 1;
  private b = 1;
  private a = 1;

  constructor(maxTris: number, depthTest: boolean, renderOrder: number, opaque = false) {
    this.maxVerts = maxTris * 3;
    this.pos = new Float32Array(this.maxVerts * 3);
    this.col = new Float32Array(this.maxVerts * 4);
    const geo = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(this.pos, 3);
    this.colAttr = new THREE.BufferAttribute(this.col, 4);
    this.posAttr.setUsage(THREE.DynamicDrawUsage);
    this.colAttr.setUsage(THREE.DynamicDrawUsage);
    geo.setAttribute('position', this.posAttr);
    geo.setAttribute('color', this.colAttr);
    geo.setDrawRange(0, 0);
    const mat = new THREE.MeshBasicMaterial({
      vertexColors: true,
      transparent: !opaque,
      depthWrite: false,
      depthTest,
      side: THREE.DoubleSide,
      toneMapped: false,
      fog: false,
    });
    // one pass in buffer order (a transparent DoubleSide material otherwise draws back faces first)
    mat.forceSinglePass = true;
    this.mesh = new THREE.Mesh(geo, mat);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = renderOrder;
    this.mesh.layers.set(LAYER.FX);
  }

  begin(): void {
    this.n = 0;
  }

  end(): void {
    this.mesh.geometry.setDrawRange(0, this.n);
    this.posAttr.clearUpdateRanges();
    this.colAttr.clearUpdateRanges();
    if (this.n > 0) {
      this.posAttr.addUpdateRange(0, this.n * 3);
      this.colAttr.addUpdateRange(0, this.n * 4);
      this.posAttr.needsUpdate = true;
      this.colAttr.needsUpdate = true;
    }
    this.mesh.visible = this.n > 0;
  }

  color(c: THREE.Color, a: number): void {
    this.r = c.r;
    this.g = c.g;
    this.b = c.b;
    this.a = clamp01(a);
  }

  private v(x: number, y: number, a = this.a): void {
    const i = this.n;
    const p = i * 3, q = i * 4;
    this.pos[p] = x;
    this.pos[p + 1] = y;
    this.pos[p + 2] = this.z;
    this.col[q] = this.r;
    this.col[q + 1] = this.g;
    this.col[q + 2] = this.b;
    this.col[q + 3] = a;
    this.n = i + 1;
  }

  tri(ax: number, ay: number, bx: number, by: number, cx: number, cy: number): void {
    if (this.n + 3 > this.maxVerts || this.a <= 0.003) return;
    this.v(ax, ay);
    this.v(bx, by);
    this.v(cx, cy);
  }

  /** a triangle whose vertices carry their own alpha (in the current colour) */
  triA(ax: number, ay: number, aa: number, bx: number, by: number, ab: number, cx: number, cy: number, ac: number): void {
    if (this.n + 3 > this.maxVerts || aa + ab + ac <= 0.01) return;
    this.v(ax, ay, aa);
    this.v(bx, by, ab);
    this.v(cx, cy, ac);
  }

  quad(ax: number, ay: number, bx: number, by: number, cx: number, cy: number, dx: number, dy: number): void {
    this.tri(ax, ay, bx, by, cx, cy);
    this.tri(ax, ay, cx, cy, dx, dy);
  }

  /** a thin pointed shape along angle `ang` from (cx, cy): back at r0, widest (half width w) at rm, tip at r1 */
  kite(cx: number, cy: number, ang: number, r0: number, rm: number, r1: number, w: number): void {
    const ux = Math.cos(ang), uy = Math.sin(ang);
    const px = -uy, py = ux;
    const bx = cx + ux * r0, by = cy + uy * r0;
    const lx = cx + ux * rm + px * w, ly = cy + uy * rm + py * w;
    const rx = cx + ux * rm - px * w, ry = cy + uy * rm - py * w;
    const tx = cx + ux * r1, ty = cy + uy * r1;
    this.tri(bx, by, lx, ly, tx, ty);
    this.tri(bx, by, tx, ty, rx, ry);
  }

  /** a filled ellipse, n segments */
  disc(cx: number, cy: number, rx: number, ry: number, n: number, rot = 0): void {
    let pxp = cx + Math.cos(rot) * rx, pyp = cy + Math.sin(rot) * ry;
    for (let i = 1; i <= n; i++) {
      const a = rot + (i / n) * TAU;
      const x = cx + Math.cos(a) * rx, y = cy + Math.sin(a) * ry;
      this.tri(cx, cy, pxp, pyp, x, y);
      pxp = x;
      pyp = y;
    }
  }

  /** a soft ellipse: alpha `a` at the centre falling to 0 at the rim */
  softDisc(cx: number, cy: number, rx: number, ry: number, a: number): void {
    const n = 14;
    let pxp = cx + rx, pyp = cy;
    for (let i = 1; i <= n; i++) {
      const t = (i / n) * TAU;
      const x = cx + Math.cos(t) * rx, y = cy + Math.sin(t) * ry;
      this.triA(cx, cy, a, pxp, pyp, 0, x, y, 0);
      pxp = x;
      pyp = y;
    }
  }

  dispose(): void {
    this.mesh.geometry.dispose();
    (this.mesh.material as THREE.Material).dispose();
  }
}

// ---------------------------------------------------------------------------------------------
// pooled effect records
// ---------------------------------------------------------------------------------------------
const K_HIT = 1, K_BLOCK = 2, K_DUST = 3, K_BREAK = 4;
interface Fx {
  on: boolean;
  kind: number;
  age: number; // frames
  x: number;
  y: number;
  dx: number; // hits: launch direction (unit)
  dy: number;
  /** 0 light, 1 medium, 2 heavy; -1 a clank (two attacks met) */
  str: number;
  by: Side;
  to: Side;
  hl: number; // hit pause in frames
  size: number; // hits: the pair's mean height; dust and breaks: radius
}

const SIDES: readonly Side[] = [0, 1];
const LIMBS = ['handR', 'handL', 'footR', 'footL', 'head'] as const;
const FX_POOL = 32;
const HIST = 48;
const TRAIL_LIFE = 36; // frames a trail point stays (0.6 s)
const STR_INDEX: Record<string, number> = { light: 0, medium: 1, heavy: 2, lethal: 3 };

export const createHitFx: CreateHitFx = (ctx: StageCtx, cam: CameraRig): StageModule => {
  const group = new THREE.Group();
  group.name = 'hitfx';
  ctx.scene.add(group);
  const back = new Batch(2400, true, 5);
  const front = new Batch(1200, false, 20);
  // UNDER: drawn first in the fighter pass (opaque, renderOrder -1000, no depth): over the whole
  // set, after the set dim, under both robots
  const under = new Batch(400, false, -1000, true);
  under.mesh.layers.set(LAYER.FIGHTER);
  under.z = 0;
  back.z = -0.35;
  front.z = 0;
  group.add(under.mesh, back.mesh, front.mesh);

  // ---- colours ----
  const C = (hex: string) => new THREE.Color(hex);
  const WHITE = C('#ffffff');
  const INK = C(PALETTE.ink);
  const EMBER = C(PALETTE.ember);
  const HOT = C('#ffe9a8');
  const SIDE = [C(ctx.sideColors[0]), C(ctx.sideColors[1])];
  // lightened by hand in sRGB (cobalt lightened in linear light drifts toward lavender)
  const SIDE_LIGHT = ctx.sideColors.map((hex) => C(hex === PALETTE.cobalt ? '#5ea6ff' : mixHex(hex, '#ffffff', 0.3)));
  const SIDE_DEEP = SIDE.map((c) => c.clone().lerp(INK, 0.5));
  const DUST = C('#d6dee8');
  const tmpA = new THREE.Color();

  // per side, this frame: body centre (chest when the stage has views) and height
  const BCX = [0, 0], BCY = [0, 0], BH = [2, 2];
  const _pt = new THREE.Vector3();

  // the visible rectangle on the fight plane (z = 0), so long shapes stop short of the HUD and clock
  const view = { l: -12, r: 12, b: -5, t: 8 };
  const _o = new THREE.Vector3();
  const _v = new THREE.Vector3();
  function viewAt(nx: number, ny: number): void {
    _v.set(nx, ny, 0.5).unproject(ctx.camera).sub(_o);
    const s = Math.abs(_v.z) > 1e-6 ? -_o.z / _v.z : 0;
    _v.multiplyScalar(s).add(_o);
  }
  function updateView(): void {
    ctx.camera.updateMatrixWorld();
    _o.setFromMatrixPosition(ctx.camera.matrixWorld);
    viewAt(-1, 0);
    const l = _v.x;
    viewAt(1, 0);
    const r = _v.x;
    viewAt(0, -1);
    const b = _v.y;
    viewAt(0, 1);
    const t = _v.y;
    const h = t - b;
    // the scorebugs own the bottom quarter, the clock the top strip
    view.l = l;
    view.r = r;
    view.b = b + h * 0.25;
    view.t = t - h * 0.13;
  }
  /** distance from (x, y) along (ux, uy) to the safe rectangle's edge */
  function edgeDist(x: number, y: number, ux: number, uy: number): number {
    let d = 1e9;
    if (ux > 1e-4) d = Math.min(d, (view.r - x) / ux);
    else if (ux < -1e-4) d = Math.min(d, (view.l - x) / ux);
    if (uy > 1e-4) d = Math.min(d, (view.t - y) / uy);
    else if (uy < -1e-4) d = Math.min(d, (view.b - y) / uy);
    return Math.max(0.6, Math.min(d, 40));
  }

  // ---- pools ----
  const fx: Fx[] = [];
  for (let i = 0; i < FX_POOL; i++) fx.push({ on: false, kind: 0, age: 0, x: 0, y: 0, dx: 0, dy: 0, str: 0, by: 0, to: 1, hl: 0, size: 1 });
  let fxNext = 0;
  function takeFx(kind: number, x: number, y: number): Fx {
    let e = fx[fxNext];
    for (let k = 0; k < FX_POOL; k++) {
      const c = fx[(fxNext + k) % FX_POOL];
      if (!c.on) {
        e = c;
        break;
      }
    }
    fxNext = (fx.indexOf(e) + 1) % FX_POOL;
    e.on = true;
    e.kind = kind;
    e.age = 0;
    e.x = x;
    e.y = y;
    e.dx = 0;
    e.dy = 0;
    e.str = 0;
    e.hl = 0;
    e.size = 1;
    return e;
  }

  // ---- per side launch trail: path points with their age ----
  interface Trail {
    pending: boolean; // hit landed, waiting for the hit pause to end
    active: boolean; // still flying: the newest point follows the robot
    kb: number;
    hx: Float32Array;
    hy: Float32Array;
    ha: Float32Array; // age of each point, frames
    count: number;
    head: number;
    lastX: number;
    lastY: number;
  }
  const trails: Trail[] = SIDES.map(() => ({
    pending: false, active: false, kb: 0,
    hx: new Float32Array(HIST), hy: new Float32Array(HIST), ha: new Float32Array(HIST),
    count: 0, head: 0, lastX: 0, lastY: 0,
  }));
  const shieldFlash = [0, 0]; // frames since the last blocked hit (large = none)
  const shieldUp = [0, 0];
  const swingHold = [0, 0];
  const swingMove: (string | null)[] = [null, null];

  let lastTick = -1;
  let lastMode = '';

  function clearAll(): void {
    for (const e of fx) e.on = false;
    for (const t of trails) {
      t.active = false;
      t.pending = false;
      t.count = 0;
    }
    shieldFlash[0] = shieldFlash[1] = 99;
  }

  // ---------------------------------------------------------------------------------------------
  // events
  // ---------------------------------------------------------------------------------------------
  function shieldRadius(s: FighterState, hp: number): number {
    const def = ctx.fighterDefs[s.fighter];
    return Math.max(def.height * 0.6, def.width * 0.85) * (0.45 + 0.55 * clamp01(hp));
  }

  function puff(x: number, y: number): void {
    takeFx(K_DUST, x, y);
  }

  function onHit(ev: Extract<SimEvent, { t: 'hit' }>, st: FightState): void {
    const str = STR_INDEX[ev.strength] ?? 0;
    const l = Math.hypot(ev.dx, ev.dy) || 1;
    const dx = ev.dx / l, dy = ev.dy / l;
    // the lethal hit belongs to ko.ts: the camera kick only, no drawing, no trail
    if (str === 3) {
      cam.shake(0.75, dx, dy);
      return;
    }
    const e = takeFx(K_HIT, ev.x, ev.y);
    e.dx = dx;
    e.dy = dy;
    e.str = str;
    e.by = ev.by;
    e.to = ev.to;
    e.hl = Math.max(3, ev.hitlag);
    e.size = Math.max(1.4, (BH[0] + BH[1]) * 0.5);
    // the contact sits on the struck robot: the sim's point pulled into its body box, or with the
    // robots' views, 35% of the way from the striking fist or boot to the victim's chest
    const v = st.fighters[ev.to];
    const vd = ctx.fighterDefs[v.fighter];
    const bx = Math.min(v.x + vd.width * 0.3, Math.max(v.x - vd.width * 0.3, ev.x));
    const byy = Math.min(v.y + vd.height * 0.75, Math.max(v.y + vd.height * 0.3, ev.y));
    e.x = ev.x + (bx - ev.x) * 0.6;
    e.y = ev.y + (byy - ev.y) * 0.6;
    const av = ctx.fighters ? ctx.fighters[ev.by] : null;
    const vv = ctx.fighters ? ctx.fighters[ev.to] : null;
    if (av && vv && ev.move !== 'projectile') {
      av.root.updateMatrixWorld(true);
      vv.root.updateMatrixWorld(true);
      vv.point('chest', _pt);
      const vcx = _pt.x, vcy = _pt.y;
      let best = 1e9, lx = 0, ly = 0;
      for (const n of LIMBS) {
        av.point(n, _pt);
        const d = Math.hypot(_pt.x - vcx, _pt.y - vcy);
        if (Number.isFinite(d) && d < best) {
          best = d;
          lx = _pt.x;
          ly = _pt.y;
        }
      }
      if (best < 3 && Number.isFinite(vcx + vcy)) {
        e.x = lx + (vcx - lx) * 0.35;
        e.y = ly + (vcy - ly) * 0.35;
      }
    }
    // camera: a kick along the launch; a small push toward the contact on heavy
    cam.shake(str === 0 ? 0.14 : str === 1 ? 0.36 : 0.7, dx, dy);
    if (str === 2) cam.punch(e.x, e.y, 0.3, (e.hl * 1000) / 60);
    // the launch ribbon, armed for the release (medium and up)
    if (str >= 1 && ev.kb >= 45) {
      const t = trails[ev.to];
      t.pending = true;
      t.active = false;
      t.kb = ev.kb;
      t.count = 0;
    }
    // spiked into the deck while standing on it: the slam puff
    if (dy < -0.5 && v.grounded) puff(v.x, v.y);
  }

  function onEvent(ev: SimEvent, st: FightState): void {
    switch (ev.t) {
      case 'hit':
        onHit(ev, st);
        break;
      case 'shield_hit': {
        shieldFlash[ev.to] = 0;
        const d = st.fighters[ev.to];
        cam.shake(ev.perfect ? 0.2 : 0.16, Math.sign(d.x - ev.x) || 0, 0);
        break;
      }
      case 'clank': {
        const e = takeFx(K_HIT, ev.x, ev.y);
        e.str = -1;
        e.hl = 3;
        e.size = Math.max(1.4, (BH[0] + BH[1]) * 0.5);
        cam.shake(0.18, 0, 0);
        break;
      }
      case 'dash':
        puff(ev.x - ev.dir * 0.3, ev.y);
        break;
      case 'land':
        if (ev.hard) puff(ev.x, ev.y);
        break;
      case 'bounce':
        puff(ev.x, ev.y);
        break;
      case 'shield_break': {
        const s = st.fighters[ev.side];
        const e = takeFx(K_BREAK, s.x, s.y + ctx.fighterDefs[s.fighter].height * 0.5);
        e.size = shieldRadius(s, 0.6);
        e.to = ev.side;
        cam.shake(0.4, 0, 1);
        break;
      }
      default:
        break;
    }
  }

  // ---------------------------------------------------------------------------------------------
  // drawing
  // ---------------------------------------------------------------------------------------------
  /** The cut: one hard blade along `a` (length L, half width w), split along its length into two
   *  halves; the halves are offset along the blade by `off` and parted across it by `gap`. */
  function cut(B: Batch, x: number, y: number, a: number, L: number, w: number, off: number, gap: number): void {
    const ux = Math.cos(a), uy = Math.sin(a);
    const px = -uy, py = ux;
    const h = L * 0.5, pk = -L * 0.1; // the widest point sits a little behind the middle
    for (const s of [1, -1]) {
      const ox = x + ux * off * s + px * gap * s, oy = y + uy * off * s + py * gap * s;
      B.tri(ox - ux * h, oy - uy * h, ox + ux * pk + px * w * s, oy + uy * pk + py * w * s, ox + ux * h, oy + uy * h);
    }
  }

  /** the cut in its edge colour, then its white blade */
  function cutMark(B: Batch, x: number, y: number, a: number, L: number, w: number, off: number, gap: number, edge: THREE.Color, al: number): void {
    B.color(edge, al);
    cut(B, x, y, a, L * 1.08, w * 1.6, off, gap);
    B.color(WHITE, al);
    cut(B, x, y, a, L, w, off, gap);
  }

  function drawHit(e: Fx): void {
    const t = e.age;
    const fr = Math.floor(t);
    const bu = e.size;
    const la = Math.atan2(e.dy, e.dx);
    // the cut always lies on a hard diagonal: the one that crosses the launch most squarely
    const ca = e.str < 0 || Math.abs(Math.sin(la - Math.PI / 4)) >= Math.abs(Math.sin(la - (3 * Math.PI) / 4)) ? Math.PI / 4 : (3 * Math.PI) / 4;
    const edge = e.str < 0 ? INK : SIDE[e.by];
    // its first two frames over everything, then behind the robots so no body stays covered
    const B = fr < 2 ? front : back;
    if (e.str <= 0) {
      // light (and a clank): small, 3 frames
      if (fr > 2) return;
      const k = fr === 2 ? 0.7 : 1;
      cutMark(B, e.x, e.y, ca, bu * 0.5 * k, bu * 0.05 * k, bu * (0.04 + 0.03 * fr), bu * (0.01 + 0.012 * fr), edge, fr === 2 ? 0.7 : 1);
      return;
    }
    const H = e.hl;
    if (e.str === 1) {
      // medium: the cut for 4 frames, and one fan along the launch line under the robots
      if (fr < 4) cutMark(B, e.x, e.y, ca, bu * 0.7 * (fr < 3 ? 1 : 0.75), bu * 0.065, bu * (0.05 + 0.035 * fr), bu * (0.012 + 0.015 * fr), edge, fr < 3 ? 1 : 0.6);
      if (t < H) {
        const grow = easeOut(clamp01((t + 1) / 3));
        const shrink = 1 - clamp01((t - (H - 2)) / 2);
        const L = Math.min(bu * 1.2, edgeDist(e.x, e.y, e.dx, e.dy)) * grow;
        const half = 0.2 * shrink;
        under.color(SIDE_LIGHT[e.by], 1);
        under.kite(e.x, e.y, la, -bu * 0.1, L * 0.18, L, Math.tan(half) * L * 0.5);
        under.color(WHITE, 1);
        under.kite(e.x, e.y, la, 0, L * 0.18, L * 0.8, Math.tan(half) * L * 0.2);
      }
      return;
    }
    // heavy: the large cut on the contact frame, thinning out by frame 4
    if (fr < 4) {
      const k = fr === 0 ? 1 : 1 - 0.2 * fr;
      cutMark(B, e.x, e.y, ca, bu * 1.3 * k, bu * 0.1 * k, bu * (0.07 + 0.05 * fr), bu * (0.02 + 0.02 * fr), edge, fr < 2 ? 1 : 0.6);
    }
    // one sheet of the hitter's colour (deepened, so both robots stand out on it) along the launch
    // line, behind both robots, for the pause
    if (t < H) {
      const shrink = 1 - clamp01((t - (H - 3)) / 3);
      const L = Math.min(bu * 3.4, edgeDist(e.x, e.y, e.dx, e.dy)) * easeOut(clamp01((t + 1) / 2));
      const ux = e.dx, uy = e.dy, px = -uy, py = ux;
      const w0 = bu * 0.32 * shrink, w1 = bu * 0.02 * shrink;
      const b0x = e.x - ux * bu * 0.35, b0y = e.y - uy * bu * 0.35;
      const b1x = e.x + ux * L, b1y = e.y + uy * L;
      under.color(SIDE_DEEP[e.by], 1);
      under.quad(b0x + px * w0 * 0.5, b0y + py * w0 * 0.5, e.x + px * w0, e.y + py * w0, e.x - px * w0, e.y - py * w0, b0x - px * w0 * 0.5, b0y - py * w0 * 0.5);
      under.quad(e.x + px * w0, e.y + py * w0, b1x + px * w1, b1y + py * w1, b1x - px * w1, b1y - py * w1, e.x - px * w0, e.y - py * w0);
    }
  }

  /** dust: one small soft puff that rises a little and fades, no wider than a foot span */
  function drawDust(e: Fx): void {
    const u = e.age / 14;
    if (u >= 1) {
      e.on = false;
      return;
    }
    const g = easeOut(clamp01(u * 1.6));
    back.color(DUST, 1);
    back.softDisc(e.x, e.y + 0.08 + 0.18 * g, 0.16 + 0.16 * g, 0.1 + 0.08 * g, 0.55 * (1 - u) * (1 - u));
  }

  function drawBreak(e: Fx): void {
    const u = e.age / 5;
    if (u >= 1) {
      e.on = false;
      return;
    }
    plates(front, e.x, e.y, e.size * (1 + 0.15 * u), WHITE, 0.7 * (1 - u), WHITE, 0.9 * (1 - u));
  }

  /** the barrier: five plates in a ring with thin seams, the robot showing through the middle */
  function plates(B: Batch, x: number, cy: number, R: number, fill: THREE.Color, fa: number, rim: THREE.Color, ra: number): void {
    const N = 5;
    const Ri = R * 0.58;
    const rot = Math.PI / 2;
    for (let k = 0; k < N; k++) {
      const a0 = rot + (k / N) * TAU + 0.03, a1 = rot + ((k + 1) / N) * TAU - 0.03;
      const o0x = x + Math.cos(a0) * R, o0y = cy + Math.sin(a0) * R;
      const o1x = x + Math.cos(a1) * R, o1y = cy + Math.sin(a1) * R;
      const i0x = x + Math.cos(a0) * Ri, i0y = cy + Math.sin(a0) * Ri;
      const i1x = x + Math.cos(a1) * Ri, i1y = cy + Math.sin(a1) * Ri;
      B.color(fill, fa);
      B.quad(i0x, i0y, o0x, o0y, o1x, o1y, i1x, i1y);
      const r0x = o0x + (i0x - o0x) * 0.16, r0y = o0y + (i0y - o0y) * 0.16;
      const r1x = o1x + (i1x - o1x) * 0.16, r1y = o1y + (i1y - o1y) * 0.16;
      B.color(rim, ra);
      B.quad(o0x, o0y, o1x, o1y, r1x, r1y, r0x, r0y);
    }
  }

  function drawShield(s: FighterState, side: Side, x: number, y: number): void {
    const hp = clamp01(s.shield / 100);
    const raise = easeOut(clamp01(shieldUp[side] / 4));
    const cy = y + ctx.fighterDefs[s.fighter].height * 0.5;
    const R = shieldRadius(s, hp) * (0.8 + 0.2 * raise);
    // the block: one flash on the barrier face, frame 0 white, frame 1 half, then back
    const fl = shieldFlash[side];
    const f = fl < 1 ? 1 : fl < 2 ? 0.5 : 0;
    tmpA.copy(SIDE[side]).lerp(WHITE, f * 0.85);
    plates(front, x, cy, R, tmpA, 0.3 + 0.4 * f, tmpA, 0.85);
    // nearly broken: two dark cracks
    if (hp < 0.25) {
      front.color(INK, 0.8);
      for (const a of [0.9, 3.6]) {
        const ax = x + Math.cos(a) * R, ay = cy + Math.sin(a) * R;
        const mx = x + Math.cos(a + 0.35) * R * 0.75, my = cy + Math.sin(a + 0.35) * R * 0.75;
        front.kite(ax, ay, Math.atan2(my - ay, mx - ax), 0, 0.1, Math.hypot(mx - ax, my - ay), 0.03);
      }
    }
  }

  /** big swings only: one thin arc through the hitbox while it is live, gone on contact */
  function drawSwing(s: FighterState, side: Side, x: number, y: number): void {
    if (s.action !== 'attack' || !s.move || s.hitlag > 0 || swingHold[side] > 0) return;
    const def = ctx.fighterDefs[s.fighter];
    const md = def.moves[s.move];
    if (!md || md.kind === 'grab' || md.kind === 'throw' || !md.hitboxes.length) return;
    let best = md.hitboxes[0];
    let first = 99, last = 0;
    for (const h of md.hitboxes) {
      if (h.damage > best.damage) best = h;
      if (h.from < first) first = h.from;
      if (h.to > last) last = h.to;
    }
    if (best.damage < 14 && s.move !== 'smash' && s.move !== 'upsmash') return;
    const fr = s.actionFrame;
    if (fr < first - 1 || fr > last + 1) return;
    const h = def.height;
    const pivotY = y + h * 0.5;
    const lx = best.x, ly = best.y - h * 0.5;
    const th = Math.atan2(ly, lx);
    const R = Math.hypot(lx, ly) + best.r * 0.6;
    const up = best.angle >= 60 && best.angle <= 120;
    const a0 = up ? th - 1.5 : th + 1.3, a1 = up ? th + 0.5 : th - 0.45;
    const head = easeOut(clamp01((fr - first + 1.5) / (last - first + 1)));
    const headA = a0 + (a1 - a0) * head;
    const W = 0.09;
    const segs = 10;
    const f = s.facing;
    back.color(SIDE_LIGHT[side], 0.9);
    let pox = 0, poy = 0, pix = 0, piy = 0;
    for (let k = 0; k <= segs; k++) {
      const v = k / segs;
      const a = a0 + (headA - a0) * v;
      const w = W * v;
      const ox = x + f * Math.cos(a) * R, oy = pivotY + Math.sin(a) * R;
      const ix = x + f * Math.cos(a) * (R - w), iy = pivotY + Math.sin(a) * (R - w);
      if (k > 0) back.quad(pox, poy, ox, oy, ix, iy, pix, piy);
      pox = ox;
      poy = oy;
      pix = ix;
      piy = iy;
    }
  }

  /** the launch ribbon: newest point at the robot, tapering to nothing at the oldest */
  function drawTrail(t: Trail, side: Side): void {
    const n = t.count;
    if (n < 2) return;
    const W = 0.16 + 0.12 * clamp01((t.kb - 45) / 100);
    const col = SIDE_LIGHT[side];
    back.color(col, 1);
    let pLx = 0, pLy = 0, pRx = 0, pRy = 0, pA = 0;
    for (let i = 0; i < n; i++) {
      const j = (t.head - i + HIST) % HIST;
      const jn = i + 1 < n ? (t.head - i - 1 + HIST) % HIST : (t.head - i + 1 + HIST) % HIST;
      const sgn = i + 1 < n ? 1 : -1;
      let tx = (t.hx[j] - t.hx[jn]) * sgn, ty = (t.hy[j] - t.hy[jn]) * sgn;
      const tl = Math.hypot(tx, ty) || 1;
      tx /= tl;
      ty /= tl;
      const life = 1 - clamp01(t.ha[j] / TRAIL_LIFE);
      const w = W * (1 - i / (n - 1)) * (0.4 + 0.6 * life);
      const a = 0.85 * life;
      const Lx = t.hx[j] - ty * w, Ly = t.hy[j] + tx * w;
      const Rx = t.hx[j] + ty * w, Ry = t.hy[j] - tx * w;
      if (i > 0) {
        back.triA(pLx, pLy, pA, pRx, pRy, pA, Rx, Ry, a);
        back.triA(pLx, pLy, pA, Rx, Ry, a, Lx, Ly, a);
      }
      pLx = Lx;
      pLy = Ly;
      pRx = Rx;
      pRy = Ry;
      pA = a;
    }
  }

  /** a projectile: one small bright shape with a short tail */
  function drawProjectile(x: number, y: number, vx: number, vy: number, kind: string, owner: Side, r: number): void {
    const sp = Math.hypot(vx, vy) || 1;
    const a = Math.atan2(vy, vx);
    const size = Math.max(0.18, r);
    const tail = size * (1.6 + Math.min(1.4, sp * 2));
    if (kind === 'slag') {
      // a molten glob: an ember tail, an orange body, a hot core
      front.color(EMBER, 0.75);
      front.kite(x, y, a + Math.PI, -size * 0.4, size * 0.2, tail, size * 0.75);
      front.color(EMBER, 1);
      front.disc(x, y, size, size * 0.85, 12, a);
      front.color(HOT, 1);
      front.disc(x + Math.cos(a) * size * 0.2, y + Math.sin(a) * size * 0.2, size * 0.55, size * 0.45, 10, a);
      return;
    }
    // a rivet (and anything else): a short tail in the owner's colour, a white shank, a dark head
    front.color(SIDE[owner], 0.8);
    front.kite(x, y, a + Math.PI, size * 0.2, size * 0.4, tail, size * 0.35);
    front.color(WHITE, 1);
    front.kite(x, y, a, -size * 0.5, 0, size * 1.1, size * 0.28);
    const hx = x - Math.cos(a) * size * 0.45, hy = y - Math.sin(a) * size * 0.45;
    front.color(SIDE[owner], 1);
    front.disc(hx, hy, size * 0.22, size * 0.55, 6, a);
  }

  // ---------------------------------------------------------------------------------------------
  // picture treatments
  // ---------------------------------------------------------------------------------------------
  function postFor(e: Fx, frame: Frame): void {
    if (e.kind !== K_HIT || e.str < 0) return;
    const t = e.age;
    const P = frame.post;
    // the victim flashes red on contact (1 frame light, 2 medium and heavy)
    const v = e.str === 0 ? (t < 1 ? 0.35 : 0) : t < 2 ? (e.str === 2 ? 0.55 : 0.36) : 0;
    if (v > P.fighterFlash[e.to]) {
      P.fighterFlash[e.to] = v;
      P.fighterFlashColor[e.to] = PALETTE.red;
    }
    // heavy: the set dims toward night navy for the pause and is back two frames after it
    if (e.str === 2) {
      const d = 0.5 * (1 - clamp01((t - e.hl) / 2));
      if (d > P.dim) {
        P.dim = d;
        P.dimColor = PALETTE.navy;
      }
    }
  }

  return {
    update(frame: Frame) {
      const f = frame.fight;
      front.begin();
      back.begin();
      under.begin();
      if (!f) {
        front.end();
        back.end();
        under.end();
        if (lastTick !== -1) clearAll();
        lastTick = -1;
        return;
      }
      const st = f.state;
      const pv = f.prev;
      // a new run (replay start, rejoin, a snap backwards) starts clean
      if (f.mode !== lastMode || st.tick < lastTick - 2) clearAll();
      lastMode = f.mode;
      lastTick = st.tick;

      for (const side of SIDES) {
        const s = st.fighters[side];
        const p = pv.fighters[side];
        const h = ctx.fighterDefs[s.fighter].height;
        BH[side] = h;
        BCX[side] = p.x + (s.x - p.x) * f.alpha;
        BCY[side] = p.y + (s.y - p.y) * f.alpha + h * 0.5;
        const fv = ctx.fighters ? ctx.fighters[side] : null;
        if (fv && s.action !== 'dead' && s.action !== 'respawn') {
          fv.point('chest', _pt);
          if (Number.isFinite(_pt.x) && Math.abs(_pt.x - BCX[side]) < h && Math.abs(_pt.y - BCY[side]) < h) {
            BCX[side] = _pt.x;
            BCY[side] = _pt.y;
          }
        }
      }
      for (const ev of f.events) onEvent(ev, st);

      // effect clock: frames on the playback's clock (a hold keeps everything where it is)
      const df = Math.min(30, frame.dt * 60 * (f.mode === 'frozen' ? 1 : f.speed));
      updateView();

      // ---- the robots: trails, shields, swings ----
      for (const side of SIDES) {
        const s = st.fighters[side];
        const p = pv.fighters[side];
        const x = p.x + (s.x - p.x) * f.alpha;
        const y = p.y + (s.y - p.y) * f.alpha;
        const tr = trails[side];
        const dead = s.action === 'dead' || s.action === 'respawn';
        if (tr.pending && s.hitlag <= 0 && !dead) {
          tr.pending = false;
          tr.active = true;
          tr.count = 0;
          tr.lastX = BCX[side];
          tr.lastY = BCY[side];
        }
        if (tr.active) {
          const flying = s.action === 'hitstun' && (s.tumble || Math.hypot(s.vx, s.vy) > 0.1) && !(s.grounded && Math.hypot(s.vx, s.vy) < 0.05);
          if (!flying || dead) tr.active = false;
        }
        // age the points, drop the old ones; once the flight ends the rest goes three times faster
        const ageK = tr.active ? df : df * 3;
        if (ageK > 0) for (let i = 0; i < tr.count; i++) tr.ha[(tr.head - i + HIST) % HIST] += ageK;
        while (tr.count > 0 && tr.ha[(tr.head - tr.count + 1 + HIST) % HIST] >= TRAIL_LIFE) tr.count--;
        if (tr.active && (Math.abs(BCX[side] - tr.lastX) > 0.04 || Math.abs(BCY[side] - tr.lastY) > 0.04 || tr.count === 0)) {
          tr.head = (tr.head + 1) % HIST;
          tr.hx[tr.head] = BCX[side];
          tr.hy[tr.head] = BCY[side];
          tr.ha[tr.head] = 0;
          tr.count = Math.min(HIST, tr.count + 1);
          tr.lastX = BCX[side];
          tr.lastY = BCY[side];
        }
        drawTrail(tr, side);

        const shielding = s.action === 'shield' || s.action === 'shieldstun';
        if (shielding) {
          shieldUp[side] += df;
          drawShield(s, side, x, y);
        } else shieldUp[side] = 0;
        shieldFlash[side] += df;

        // a swing's arc goes the moment it connects
        if (s.hitlag > 0 && s.action === 'attack') swingHold[side] += df;
        else if (s.action !== 'attack' || s.move !== swingMove[side]) swingHold[side] = 0;
        swingMove[side] = s.move;
        drawSwing(s, side, x, y);
      }

      // ---- contacts, dust, breaks ----
      for (const e of fx) {
        if (!e.on) continue;
        if (e.kind === K_HIT) {
          postFor(e, frame);
          drawHit(e);
          if (e.age > Math.max(4, e.hl) + 3) e.on = false;
        } else if (e.kind === K_DUST) drawDust(e);
        else if (e.kind === K_BREAK) drawBreak(e);
        e.age += df;
      }

      // ---- projectiles ----
      for (const pr of st.projectiles) {
        let px = pr.x, py = pr.y;
        for (const q of pv.projectiles) {
          if (q.id === pr.id) {
            px = q.x + (pr.x - q.x) * f.alpha;
            py = q.y + (pr.y - q.y) * f.alpha;
            break;
          }
        }
        drawProjectile(px, py, pr.vx, pr.vy, pr.kind, pr.owner, pr.r);
      }

      front.end();
      back.end();
      under.end();
    },
    dispose() {
      ctx.scene.remove(group);
      front.dispose();
      back.dispose();
      under.dispose();
    },
  };
};

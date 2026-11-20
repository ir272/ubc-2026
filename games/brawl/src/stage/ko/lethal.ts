// Beat 1: the lethal hit. A welding arc struck in a dark yard.
//
// On a hit with strength 'lethal' the playback holds about half a second (playback.ts) and the
// sim's own hitlag follows. For that stop: the set drops to near black (post.dim) and the robots
// with it (post.fighterFlash to ink), and the two robots are drawn again lit only by the arc
// (hulls.ts): one hard white-blue light burning between them, each body keeping its own paint
// where the arc hits it and falling to black on the far side. They are pushed apart along the hit
// line so dark space shows between them; the victim creeps along the launch line with a hard shake,
// the attacker leans through. In the picture: the dark, a handful of long speed lines converging on
// the contact, the arc (one white-blue blade across the hit line), one short spark burst at the
// strike, the two robots. Nothing else (clean pass: no spark shower, no outlines, no star). When
// the launch starts it lets go on one white frame. In a knockout replay it plays again at the
// replay's speed.

import * as THREE from 'three';
import type { CameraRig, Frame, StageCtx } from '../api.ts';
import type { Side, SimEvent } from '../../sim/types.ts';
import { PALETTE } from '../style.ts';
import { Rand, TriBatch, lin, toScreen, clamp01, easeOut } from './kit.ts';
import type { Sparks } from './sparks.ts';
import type { EmberHulls } from './hulls.ts';

type HitEv = Extract<SimEvent, { t: 'hit' }>;

/** seconds: the shortest the treatment runs in live play (the playback hold is 0.5 s) */
const MIN_LIVE = 0.46;
/** longest it may run whatever the sim does: about 30 frames, then the launch must read */
const MAX_T = 0.52;
/** release: white wash and fall-off */
const RELEASE = 0.08;
const LINES = 12;

export class LethalFx {
  private active = false;
  private releasing = false;
  /** seconds since the hit (scaled by the replay speed in replays) */
  private t = 0;
  private rt = 0;
  private hx = 0;
  private hy = 0;
  private dx = 1;
  private dy = 0;
  private to: 0 | 1 = 0;
  private by: 0 | 1 = 1;
  private tick = 0;
  private replay = false;
  private readonly r = new Rand(1);
  private readonly lr = new Rand(1);
  private readonly shk = new Rand(1);
  private readonly sc = { x: 0, y: 0 };
  private readonly pure = lin('#ffffff');
  private readonly arcBlue = lin('#7fb0ff');
  private readonly cool = lin('#c9d7ea');
  private readonly night = lin('#040a17');
  /** the speed lines: fixed per hold, they crawl in toward the arc */
  private readonly la = new Float32Array(LINES);
  private readonly lph = new Float32Array(LINES);
  private readonly lsp = new Float32Array(LINES);
  private readonly llen = new Float32Array(LINES);
  private readonly lw = new Float32Array(LINES);

  constructor(
    private readonly ctx: StageCtx,
    private readonly cam: CameraRig,
    private readonly lines: TriBatch, // screen space, FX layer, over the hit effects, under the lit figures
    private readonly sparks: Sparks,
    private readonly hulls: EmberHulls,
  ) {}

  get running(): boolean {
    return this.active || this.releasing;
  }

  /** still in the hold (the launch has not started) */
  get holding(): boolean {
    return this.active;
  }

  start(ev: HitEv, replay: boolean): void {
    this.active = true;
    this.releasing = false;
    this.t = 0;
    this.rt = 0;
    this.hx = ev.x;
    this.hy = ev.y;
    const len = Math.hypot(ev.dx, ev.dy) || 1;
    this.dx = ev.dx / len;
    this.dy = ev.dy / len;
    if (Math.hypot(ev.dx, ev.dy) < 1e-6) {
      this.dx = ev.by === 0 ? 1 : -1;
      this.dy = 0.3;
    }
    this.to = ev.to;
    this.by = ev.by;
    this.tick = ev.tick;
    this.replay = replay;
    this.r.seed(ev.tick * 7 + 3);
    this.hulls.scan(this.ctx.fighters);
    this.hulls.begin(ev.x, ev.y, this.dx, this.dy, ev.by, ev.to);
    this.cam.punch(ev.x, ev.y, 1, replay ? 700 : 520);
    this.cam.shake(0.35, this.dx, this.dy);
    // the speed lines for this hold: a handful, evenly round the arc, long and thin
    this.lr.seed(ev.tick * 131 + 5);
    for (let i = 0; i < LINES; i++) {
      this.la[i] = ((i + 0.2 + this.lr.next() * 0.6) / LINES) * Math.PI * 2;
      this.lph[i] = this.lr.next();
      this.lsp[i] = this.lr.range(1.2, 1.8);
      this.llen[i] = this.lr.range(520, 820);
      this.lw[i] = this.lr.range(5, 11);
    }
    // one short burst at the contact, along the launch line; it is out before the hold ends
    for (let i = 0; i < 18; i++) this.sparks.emit(this.hx, this.hy, this.dx, this.dy, this.r.range(10, 26), 0.4, this.r.range(0.14, 0.26), this.r.range(0.016, 0.028), this.r, 1.4);
  }

  /** stop at once (a cut to another view) */
  cut(): void {
    this.active = false;
    this.releasing = false;
    this.hulls.hide();
  }

  update(frame: Frame, rate: number): void {
    if (!this.active && !this.releasing) {
      this.hulls.hide();
      return;
    }
    const f = frame.fight;
    const dt = frame.dt * rate;
    const post = frame.post;
    if (this.active) {
      this.t += dt;
      // the launch has started once the target's hitlag has run out after the hold
      const target = f ? f.state.fighters[this.to] : null;
      const frozen = !!target && target.hitlag > 0 && f!.state.tick >= this.tick;
      const minT = this.replay ? 0.2 : MIN_LIVE;
      if ((this.t >= minT && !frozen) || this.t >= MAX_T || !f) {
        this.active = false;
        this.releasing = true;
        this.rt = 0;
      }
    } else {
      this.rt += frame.dt;
      if (this.rt >= RELEASE) this.releasing = false;
    }

    const camera = this.ctx.camera;
    camera.updateMatrixWorld();

    if (this.active) {
      const k = clamp01(this.t / (2 / 60)); // in over two frames
      post.dim = Math.max(post.dim, 0.965 * k);
      post.dimColor = '#02050b';
      // the robots themselves go to ink: the lit figures are drawn over them, pushed apart
      for (let s: Side = 0; s < 2; s = (s + 1) as Side) {
        post.fighterFlash[s] = Math.max(post.fighterFlash[s], k);
        post.fighterFlashColor[s] = PALETTE.ink;
      }
      // the strike itself: one hard white frame
      if (this.t < 1 / 60) post.flash = Math.max(post.flash, 0.5);
      this.shk.seed(this.tick * 13 + Math.floor(this.t * 60) * 7 + 1);
      // the figures push in about the arc: ~1.4x over 6 frames, then a slow creep on through the hold
      const zoom = 1 + 0.4 * easeOut(this.t / 0.1) + 0.16 * this.t;
      this.hulls.show(camera, this.t, easeOut(this.t / 0.09), this.shk, zoom);
      // the arc burns between the pushed-apart bodies; everything centres on it
      const L = this.hulls.light;
      toScreen(camera, L.x, L.y, 0, this.sc);
      this.drawLines();
      this.drawArc();
      // a low steady rumble through the hold
      if (Math.floor(this.t * 60) % 6 === 0) this.cam.shake(0.12, this.dx, this.dy);
    } else {
      // release: one white frame, the set and the robots back on the cut
      post.flash = Math.max(post.flash, this.rt < 1 / 60 ? 0.6 : 0);
      const k = this.rt < 1 / 60 ? 1 : 0;
      post.dim = Math.max(post.dim, 0.9 * k);
      this.hulls.hide();
    }
  }

  /** a handful of long speed lines that crawl in from beyond the frame toward the arc, and wrap */
  private drawLines(): void {
    const b = this.lines;
    // the hold's own ground: the yard gone dark. It also covers the hit effects and trails under
    // the figures, so only the arc, the lines, the sparks and the two bodies are in the picture.
    b.quad(-900, -500, 900, -500, 900, 500, -900, 500, this.night);
    const cx = this.sc.x;
    const cy = this.sc.y;
    const turn = this.t * 0.12 * (this.dx >= 0 ? 1 : -1);
    const rMin = 190;
    const rOut = 1500;
    for (let i = 0; i < LINES; i++) {
      const a = this.la[i] + turn;
      const ca = Math.cos(a);
      const sa = Math.sin(a);
      // the tip travels from the frame edge to just short of the arc, then starts again outside
      const ph = (this.lph[i] + this.t * this.lsp[i]) % 1;
      const r0 = rOut - (rOut - rMin) * ph;
      const r1 = r0 + this.llen[i];
      const w = this.lw[i];
      const tx = cx + ca * r0;
      const ty = cy + sa * r0;
      const bx = cx + ca * r1;
      const by = cy + sa * r1;
      b.tri(tx, ty, bx - sa * w, by + ca * w, bx + sa * w, by - ca * w, this.cool);
    }
  }

  /** the arc: one white-blue blade across the hit line between the bodies, a white core inside a
   *  blue body, its length flickering a little each frame */
  private drawArc(): void {
    const b = this.lines;
    const cx = this.sc.x;
    const cy = this.sc.y;
    const fr = Math.floor(this.t * 60);
    this.lr.seed(this.tick * 977 + fr * 31 + 11);
    const grow = easeOut(this.t / (3 / 60));
    // across the hit line (screen y is up, like the world)
    const ax = -this.dy;
    const ay = this.dx;
    const L = 120 * grow * (0.9 + 0.2 * this.lr.next());
    const W = 26 * grow;
    const blade = (len: number, wid: number, c: THREE.Color) =>
      b.quad(cx + ax * len, cy + ay * len, cx + this.dx * wid, cy + this.dy * wid, cx - ax * len, cy - ay * len, cx - this.dx * wid, cy - this.dy * wid, c);
    blade(L, W, this.arcBlue);
    blade(L * 0.7, W * 0.4, this.pure);
  }
}

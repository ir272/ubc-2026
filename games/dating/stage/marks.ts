// Emote marks drawn as flat hand-inked cel shapes (never emoji): a heart (charmed), a sweat drop
// (unsure), a fan of wavy gloom lines (cringing). One pops over a suitor's head on a `reaction`, with
// comic timing: a small squashed seed (the wind-up), a spring past full size, a squash, a hold that
// moves on twos like a cel, and a quick exit.
//
// The tally: each podium's plain curved front carries the marks the star has given that suitor and
// nothing else (hearts first), each drawn as its own glyph, small and flat. Nothing waits empty: a
// podium with no marks has a plain front. A suitor who is out keeps their marks, dimmed.
import * as THREE from 'three';
import type { Mark } from '../show/types.ts';
import { CAMERA_HOME, SPOTS, SUITOR_RISER } from './layout.ts';
import { MARK_COLORS, PALETTE, mix } from './theme.ts';
import { STUDIO, clamp01, easeOut, type Kit } from './toon.ts';

type Path = (c: CanvasRenderingContext2D) => void;
/** what can pop over a head: the three marks, and the reveal's tick (a booth read was right) or cross */
type Glyph = Mark | 'right' | 'wrong';

// the reveal's verdict on a booth read: a brush tick and a brush cross, in the same ink as the marks
const tickPath: Path = (c) => {
  c.moveTo(-40, 2);
  c.lineTo(-26, -12);
  c.lineTo(-8, 8);
  c.lineTo(32, -38);
  c.lineTo(46, -24);
  c.lineTo(-8, 38);
  c.closePath();
};
const crossPath: Path = (c) => {
  const w = 11, L = 38;
  c.moveTo(-L, -L + w);
  c.lineTo(-L + w, -L);
  c.lineTo(0, -w);
  c.lineTo(L - w, -L);
  c.lineTo(L, -L + w);
  c.lineTo(w, 0);
  c.lineTo(L, L - w);
  c.lineTo(L - w, L);
  c.lineTo(0, w);
  c.lineTo(-L + w, L);
  c.lineTo(-L, L - w);
  c.lineTo(-w, 0);
  c.closePath();
};

const heartPath: Path = (c) => {
  // a little lopsided on purpose: drawn by hand, not a font glyph
  c.moveTo(3, 40);
  c.bezierCurveTo(-26, 20, -50, 0, -45, -20);
  c.bezierCurveTo(-41, -40, -13, -46, -1, -24);
  c.bezierCurveTo(9, -43, 37, -42, 43, -21);
  c.bezierCurveTo(48, -2, 28, 18, 3, 40);
  c.closePath();
};

const dropPath: Path = (c) => {
  c.moveTo(0, -46);
  c.bezierCurveTo(7, -28, 31, -6, 31, 14);
  c.bezierCurveTo(31, 33, 17, 45, 0, 45);
  c.bezierCurveTo(-17, 45, -31, 33, -31, 14);
  c.bezierCurveTo(-31, -6, -7, -28, 0, -46);
  c.closePath();
};

// Gloom: anime "tatesen", a curtain of near-parallel brush strokes hanging down, thick at the top
// and tapering to a point, of uneven lengths, with a little hand wobble. No cloud, no round blobs:
// nothing that reads as weather or as a creature.
// [x at the top, top y, length, wobble phase]
const GLOOM: [number, number, number, number][] = [
  [-38, -26, 52, 0.3],
  [-19, -38, 80, 1.9],
  [0, -32, 64, 3.1],
  [19, -40, 84, 4.4],
  [38, -28, 50, 5.6],
];
const gloomPath = (w0: number): Path => (c) => {
  for (const [x0, top, len, ph] of GLOOM) {
    const N = 10;
    const L: [number, number][] = [];
    const R: [number, number][] = [];
    for (let i = 0; i <= N; i++) {
      const t = i / N;
      const cx = x0 + 2.2 * Math.sin(ph + t * Math.PI * 1.6);
      const cy = top + len * t;
      const w = w0 * (1 - 0.88 * t);
      L.push([cx - w, cy]);
      R.push([cx + w, cy]);
    }
    // a flat brush start, cut on a slight slant
    c.moveTo(L[0]![0], L[0]![1] + 1.5);
    c.lineTo(R[0]![0], R[0]![1] - 1.5);
    for (let i = 1; i <= N; i++) c.lineTo(R[i]![0], R[i]![1]);
    for (let i = N; i >= 1; i--) c.lineTo(L[i]![0], L[i]![1]);
    c.closePath();
  }
};

/** fill a shape in two cel steps: the base colour, and a hard shadow band on one side */
function celFill(c: CanvasRenderingContext2D, path: Path, base: string, shade: string, dx = -7, dy = -8) {
  c.save();
  c.beginPath();
  path(c);
  c.clip();
  c.fillStyle = shade;
  c.fillRect(-80, -80, 160, 160);
  c.translate(dx, dy);
  c.beginPath();
  path(c);
  c.fillStyle = base;
  c.fill();
  c.restore();
}

/** a stroke drawn under the fill: the outer half of the line shows */
function under(c: CanvasRenderingContext2D, path: Path, width: number, color: string) {
  c.beginPath();
  path(c);
  c.lineWidth = width;
  c.strokeStyle = color;
  c.stroke();
}

interface Ink {
  /** fill and its cel shade; default: the mark's own colour */
  base?: string;
  shade?: string;
  /** the milk keyline outside the ink line (pops over the dark set) */
  keyline: boolean;
  highlight: boolean;
}

/**
 * Draw one mark centred in a square of side s at (x, y), in 100 units across. One hand for every
 * mark in the show: an ink line, a two-tone fill, one milk highlight; the pops over a head add a
 * thin milk keyline outside the ink so they read on the dark set. The lamp windows draw the same
 * glyph without the keyline, lit or dimmed.
 */
export function drawMark(c: CanvasRenderingContext2D, mark: Glyph, x: number, y: number, s: number, ink: Ink = { keyline: true, highlight: true }) {
  c.save();
  c.translate(x, y);
  c.scale(s / 100, s / 100);
  c.lineJoin = 'round';
  c.lineCap = 'round';
  const rim = (path: Path, w = 9) => {
    if (ink.keyline) under(c, path, w + 6, PALETTE.milk);
    under(c, path, w, PALETTE.ink);
  };
  const highlight = (draw: () => void, w = 6.5) => {
    if (!ink.highlight) return;
    c.beginPath();
    draw();
    c.lineWidth = w;
    c.strokeStyle = PALETTE.milk;
    c.stroke();
  };
  if (mark === 'right' || mark === 'wrong') {
    const path = mark === 'right' ? tickPath : crossPath;
    const base = mark === 'right' ? PALETTE.mint : PALETTE.coral;
    c.rotate(mark === 'right' ? -0.06 : 0.1);
    rim(path);
    celFill(c, path, base, mix(base, PALETTE.ink, 0.3), -6, -6);
    under(c, path, 5, PALETTE.ink);
  } else if (mark === 'charmed') {
    c.rotate(-0.14);
    const base = ink.base ?? MARK_COLORS.charmed;
    rim(heartPath);
    celFill(c, heartPath, base, ink.shade ?? mix(base, PALETTE.ink, 0.32));
    highlight(() => {
      c.moveTo(-35, -14);
      c.quadraticCurveTo(-36, -29, -23, -33);
    });
    under(c, heartPath, 5, PALETTE.ink);
  } else if (mark === 'unsure') {
    c.rotate(0.3);
    const base = ink.base ?? MARK_COLORS.unsure;
    rim(dropPath);
    celFill(c, dropPath, base, ink.shade ?? mix(base, PALETTE.dusk, 0.45), 8, -8);
    highlight(() => {
      c.moveTo(-19, 8);
      c.quadraticCurveTo(-21, 24, -11, 32);
    });
    under(c, dropPath, 5, PALETTE.ink);
  } else {
    const base = ink.base ?? MARK_COLORS.cringing;
    const p = gloomPath(ink.keyline ? 4.6 : 6.5);
    rim(p, 6.5);
    celFill(c, p, base, ink.shade ?? mix(base, PALETTE.ink, 0.42), 4, 0);
    // one short highlight on the longest stroke's thick top
    under(c, p, 3.6, PALETTE.ink);
  }
  c.restore();
}

// ------------------------------------------------------------------ timing
// All times in seconds from the moment the director calls pop() (which is itself after a held beat).
const SEED = 0.11; // the wind-up: a small squashed seed, dipping
const SPRING = 0.11; // springs past full size, stretched
const SQUASH = 0.14; // lands squashed
const SETTLE = 0.12; // to rest
const LAND = SEED + SPRING + SQUASH + SETTLE;
const HOLD = 2.5; // hold from the start until the exit
const EXIT = 0.17;
const ONES = 12; // the hold moves on twos: 12 drawings a second
const PEAK = 1.13; // the overshoot (with the stretch, about 1.22 tall at the peak)

/** scale x, scale y and lift (in sizes) for a part at time t (seconds since that part's start) */
function popCurve(t: number): [number, number, number] {
  if (t < 0) return [0, 0, 0];
  if (t < SEED) {
    const k = easeOut(t / SEED);
    return [0.42 * k * 1.3, 0.42 * k * 0.72, -0.06 * k];
  }
  if (t < SEED + SPRING) {
    const k = easeOut((t - SEED) / SPRING);
    const s = 0.42 + (PEAK - 0.42) * k;
    return [s * (1.3 - 0.42 * k), s * (0.72 + 0.36 * k), -0.06 + 0.14 * k];
  }
  if (t < SEED + SPRING + SQUASH) {
    const k = easeOut((t - SEED - SPRING) / SQUASH);
    const s = PEAK - (PEAK - 0.95) * k;
    return [s * (0.88 + 0.26 * k), s * (1.08 - 0.2 * k), 0.08 - 0.11 * k];
  }
  if (t < LAND) {
    const k = easeOut((t - LAND + SETTLE) / SETTLE);
    const s = 0.95 + 0.05 * k;
    return [s * (1.14 - 0.14 * k), s * (0.88 + 0.12 * k), -0.03 + 0.03 * k];
  }
  return [1, 1, 0];
}

interface Part {
  sprite: THREE.Sprite;
  delay: number;
  size: number; // in units of the mark size
  ox: number; // offset from the main part, in mark sizes (toward the mark's side, up)
  oy: number;
  tilt: number; // a fixed lean of its own
}

interface Pop {
  mark: Glyph;
  parts: Part[];
  t: number;
  anchor: () => THREE.Vector3;
  active: boolean;
  fit: { side: number; x: number; y: number; k: number } | null; // where it rests: chosen at the start and after a cut
  fitFrame: number;
  fitCam: THREE.Vector3;
  /** the head as measured: its top's height over the anchor (negative: below), its outline to the camera's right and left */
  head: { top: number; ext: Record<1 | -1, number> };
}

/**
 * Where each mark rests, measured from the head itself (its top, and its outline on either side,
 * found by casting a few rays at the avatar when the pop starts and after a cut): sideways in
 * metres plus mark sizes, up from the head top in metres plus mark sizes. The heart sits over the
 * head, a little to one side, its point clear of the hair (Animal Crossing's "!"). The drop hangs
 * just outside the head's outline at the temple (`fromEdge`). The gloom lines hang over one side of
 * the head and stop short of it.
 */
const PLACE: Record<Glyph, { x: number; xu: number; y: number; yu: number; size: number; fromEdge: boolean }> = {
  charmed: { x: 0.03, xu: 0.24, y: 0.05, yu: 0.39, size: 1, fromEdge: false },
  unsure: { x: 0.065, xu: 0.22, y: -0.09, yu: 0.0, size: 0.82, fromEdge: true },
  cringing: { x: 0.05, xu: 0.2, y: 0.1, yu: 0.36, size: 0.95, fromEdge: false },
  right: { x: 0.03, xu: 0.22, y: 0.05, yu: 0.4, size: 0.9, fromEdge: false },
  wrong: { x: 0.03, xu: 0.22, y: 0.05, yu: 0.4, size: 0.8, fromEdge: false },
};
/** how much of the sprite square each glyph fills, across and down (for the fit boxes) */
const EXTENT: Record<Glyph, [number, number]> = { charmed: [0.82, 0.74], unsure: [0.56, 0.78], cringing: [0.66, 0.74], right: [0.78, 0.68], wrong: [0.68, 0.68] };
const HEAD_HALF = 0.15; // metres: half a head across, when the rays find nothing

const BASE_SIZE = 0.3; // metres, at close range
const MIN_FRAC = 0.08; // never smaller than this share of the frame height (the wide)
const MAX_FRAC = 0.165; // never bigger than this (the close-up): the heart about half a head tall

/** until the captions overlay can be read: screen areas a mark keeps out of, in NDC (cards, round name, subtitle panel) */
interface Zone {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
const ZONES: Zone[] = [
  { x0: 0.42, x1: 1.2, y0: 0.56, y1: 1.2 },
  { x0: -1.2, x1: -0.6, y0: 0.78, y1: 1.2 },
  { x0: -0.72, x1: 0.72, y0: -1.2, y1: -0.68 },
];

// ------------------------------------------------------------------ standing: the tally
/**
 * The podium's front: a low curved wall standing on the floor just outside the drum, facing the
 * audience (the wide camera's home). The earned marks sit on it side by side. Metres and radians.
 */
const SKIRT = {
  r: SUITOR_RISER.radius + 0.075,
  h: 0.47,
  span: THREE.MathUtils.degToRad(130),
  lampArc: THREE.MathUtils.degToRad(28.5),
  lampGap: THREE.MathUtils.degToRad(3),
  y0: 0.065,
  y1: 0.405,
};
const LAMPS = 4; // a suitor gets at most four marks: the walk-on snap, round one, round two, the one on one
const BADGE_DELAY = 1.05; // a new mark lands on the podium after the pop has had its moment
const FLICK = [0.07, 0.14, 0.21]; // a new heart catches: on, off, on (on twos)
const ORDER: Record<Mark, number> = { charmed: 0, unsure: 1, cringing: 2 };
const sortMarks = (m: Mark[]) => [...m].sort((a, b) => ORDER[a] - ORDER[b]);

/** what one place on the podium front shows */
type LampState = 'empty' | 'charmed' | 'unsure' | 'cringing' | 'outCharmed' | 'outUnsure' | 'outCringing';
const LAMP_PX = { w: 200, h: 184 };

/** paint one tally mark: the glyph alone on a clear ground (an out suitor's marks dimmed) */
function paintLamp(c: CanvasRenderingContext2D, state: LampState) {
  const { w: W, h: H } = LAMP_PX;
  c.clearRect(0, 0, W, H);
  if (state === 'empty') return;
  const out = state.startsWith('out');
  const m = (out ? state.slice(3).toLowerCase() : state) as Mark;
  const base = mix(MARK_COLORS[m], PALETTE.ink, out ? 0.62 : 0);
  const size = m === 'charmed' ? H * 0.7 : H * 0.78;
  drawMark(c, m, W / 2, H / 2, size, { base, shade: mix(base, PALETTE.ink, 0.3), keyline: false, highlight: false });
}

interface Podium {
  spot: number;
  group: THREE.Group;
  lamps: { mesh: THREE.Mesh; mat: THREE.MeshBasicMaterial }[];
  shown: Mark[];
  out: boolean;
  pending: { marks: Mark[]; t: number } | null;
  /** a mark that is catching: its index, time since it started, and what it showed before */
  flick: { i: number; t: number; was: LampState } | null;
}

export class Marks {
  readonly group = new THREE.Group();
  /** dev only: pin every active pop at this time (seconds) for stills */
  freeze: number | null = null;
  private tex: Record<Glyph, THREE.CanvasTexture>;
  private lampTex = new Map<string, THREE.CanvasTexture>();
  private pops = new Map<string, Pop>();
  private kit: Kit;
  private pods: Podium[] = [];
  private frame = 0;
  private zones: Zone[] = ZONES;
  private zoneFrame = -99;
  private anchorPos = new THREE.Vector3();
  private v = new THREE.Vector3();
  private w = new THREE.Vector3();
  private right = new THREE.Vector3();
  private toCam = new THREE.Vector3();
  private ray = new THREE.Raycaster();

  constructor(kit: Kit, scene: THREE.Scene, opts: { tally?: boolean } = {}) {
    this.kit = kit;
    this.group.name = 'marks';
    scene.add(this.group);
    const canvasTex = (draw: (c: CanvasRenderingContext2D, n: number) => void, n: number) => {
      const cv = document.createElement('canvas');
      cv.width = cv.height = n;
      const c = cv.getContext('2d');
      if (c) draw(c, n);
      const t = kit.bin.add(new THREE.CanvasTexture(cv));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 4;
      return t;
    };
    const big = (m: Glyph) => canvasTex((c, n) => drawMark(c, m, n / 2, n / 2, n * 0.84), 512);
    this.tex = { charmed: big('charmed'), unsure: big('unsure'), cringing: big('cringing'), right: big('right'), wrong: big('wrong') };

    // the studio's podium fronts carry the tally; the hangout has no podiums (standing is where people stand)
    if (opts.tally !== false) this.buildSkirts();

    const dev = (import.meta as unknown as { env?: { DEV?: boolean } }).env?.DEV;
    if (dev && typeof window !== 'undefined') (window as unknown as { __marks?: Marks }).__marks = this;
  }

  // ------------------------------------------------------------------ the podium fronts
  private buildSkirts() {
    const kit = this.kit;
    const S = SKIRT;
    const shellMat = kit.toon(STUDIO.podium, { side: THREE.DoubleSide });
    const inkMat = kit.flat(PALETTE.ink);
    const shellGeo = kit.geo(new THREE.CylinderGeometry(S.r, S.r, S.h, 40, 1, true, -S.span / 2, S.span));
    const lipGeo = kit.geo(new THREE.TorusGeometry(S.r - 0.008, 0.02, 6, 40, S.span));
    const lampH = S.y1 - S.y0;
    const total = LAMPS * S.lampArc + (LAMPS - 1) * S.lampGap;
    const lampGeos = Array.from({ length: LAMPS }, (_, i) =>
      kit.geo(new THREE.CylinderGeometry(S.r + 0.004, S.r + 0.004, lampH, 10, 1, true, -total / 2 + i * (S.lampArc + S.lampGap), S.lampArc)),
    );
    SPOTS.forEach((p, spot) => {
      const g = new THREE.Group();
      g.name = `tally-${spot}`;
      g.position.set(p.x, 0, p.z);
      // faces the audience: the wide camera's home
      g.rotation.y = Math.atan2(CAMERA_HOME.pos.x - p.x, CAMERA_HOME.pos.z - p.z);
      this.group.add(g);
      const shell = new THREE.Mesh(shellGeo, shellMat);
      shell.position.y = S.h / 2;
      g.add(shell);
      // the torus arc lies in its own xy plane starting at +x: laid flat (x turn) an arc angle a
      // lands on the cylinder's angle a + 90 degrees, so a turn about y brings it onto its span
      const lip = new THREE.Mesh(lipGeo, inkMat);
      lip.rotation.set(-Math.PI / 2, -S.span / 2 - Math.PI / 2, 0, 'YXZ');
      lip.position.y = S.h;
      g.add(lip);
      const lamps = lampGeos.map((geo) => {
        const mat = kit.flat('#ffffff', { map: this.lampMap('empty'), transparent: true, alphaTest: 0.4 });
        const mesh = new THREE.Mesh(geo, mat);
        mesh.position.y = (S.y0 + S.y1) / 2;
        mesh.visible = false;
        g.add(mesh);
        return { mesh, mat };
      });
      this.pods.push({ spot, group: g, lamps, shown: [], out: false, pending: null, flick: null });
    });
  }

  /** one texture per mark look, shared by every podium that shows it */
  private lampMap(state: LampState) {
    let t = this.lampTex.get(state);
    if (!t) {
      const cv = document.createElement('canvas');
      cv.width = LAMP_PX.w;
      cv.height = LAMP_PX.h;
      const c = cv.getContext('2d');
      if (c) paintLamp(c, state);
      t = this.kit.bin.add(new THREE.CanvasTexture(cv));
      t.colorSpace = THREE.SRGBColorSpace;
      t.anisotropy = 8;
      this.lampTex.set(state, t);
    }
    return t;
  }

  private stateOf(pod: Podium, i: number): LampState {
    const m = pod.shown[i];
    if (!m) return 'empty';
    if (pod.out) return m === 'charmed' ? 'outCharmed' : m === 'unsure' ? 'outUnsure' : 'outCringing';
    return m;
  }

  private paintPodium(pod: Podium) {
    // the marks sit together in the middle of the front, however many there are
    const n = Math.min(LAMPS, pod.shown.length);
    const S = SKIRT;
    pod.lamps.forEach(({ mesh, mat }, i) => {
      let state = this.stateOf(pod, i);
      const f = pod.flick;
      if (f && f.i === i) {
        // catching: new, old, new, on twos
        const k = FLICK.findIndex((x) => f.t < x);
        if (k === 0 || k === 2) state = f.was;
      }
      mesh.visible = state !== 'empty';
      mesh.rotation.y = (i - (n - 1) / 2) * (S.lampArc + S.lampGap) - (i - (LAMPS - 1) / 2) * (S.lampArc + S.lampGap);
      const map = this.lampMap(state);
      if (mat.map !== map) {
        mat.map = map;
        mat.needsUpdate = true;
      }
    });
  }

  // ------------------------------------------------------------------ pops
  /** pop a mark over someone's head; `anchor` returns the head-top anchor each frame */
  /** the reveal: a tick (the booth read was right) or a cross over a guesser's head, no text */
  verdict(id: string, right: boolean, anchor: () => THREE.Vector3) {
    this.pop(id, right ? 'right' : 'wrong', anchor);
  }

  /** is a mark over this suitor's head right now (their name tag steps aside for it) */
  isPopping(id: string) {
    return !!this.pops.get(id)?.active;
  }

  pop(id: string, mark: Glyph, anchor: () => THREE.Vector3) {
    let p = this.pops.get(id);
    if (!p) {
      p = { mark, parts: [], t: 0, anchor, active: false, fit: null, fitFrame: -1, fitCam: new THREE.Vector3(), head: { top: -0.08, ext: { 1: HEAD_HALF, [-1]: HEAD_HALF } } };
      this.pops.set(id, p);
    }
    // reuse this suitor's sprites from an earlier pop; make more only when needed
    const old = p.parts;
    for (const part of old) part.sprite.visible = false;
    p.parts = [];
    const add = (size: number, ox: number, oy: number, delay: number, tilt: number) => {
      const prev = old[p!.parts.length];
      let sprite: THREE.Sprite;
      if (prev) sprite = prev.sprite;
      else {
        sprite = new THREE.Sprite(this.kit.bin.add(new THREE.SpriteMaterial({ transparent: true, depthTest: false, depthWrite: false })));
        sprite.renderOrder = 6;
        sprite.frustumCulled = false;
        this.group.add(sprite);
      }
      const mat = sprite.material as THREE.SpriteMaterial;
      if (mat.map !== this.tex[mark]) {
        mat.map = this.tex[mark];
        mat.needsUpdate = true;
      }
      const part: Part = { sprite, delay, size, ox, oy, tilt };
      sprite.onBeforeRender = (r, _s, camera) => this.place(p!, part, r, camera);
      p!.parts.push(part);
    };
    add(PLACE[mark].size, 0, 0, 0, 0);
    p.mark = mark;
    p.anchor = anchor;
    p.t = 0;
    p.fit = null;
    p.active = true;
  }

  clearPops() {
    for (const p of this.pops.values()) {
      p.active = false;
      for (const part of p.parts) part.sprite.visible = false;
    }
  }

  /** dev: is any pop on screen (for stills) */
  activePops() {
    return [...this.pops.values()].filter((p) => p.active).map((p) => ({ mark: p.mark, t: p.t }));
  }

  // ------------------------------------------------------------------ standing
  /**
   * The marks on a podium's front. `flash` = a new mark just landed, so it lands after the pop.
   * `out` = this suitor has been cut: the marks stay, dimmed. `accent` is unused (kept for callers).
   */
  setPips(spot: number, marks: Mark[], flash = false, out = false, accent?: string) {
    const pod = this.pods[spot];
    if (!pod) return;
    void accent;
    const next = sortMarks(marks).slice(0, LAMPS);
    if (flash && !out && next.length > pod.shown.length) {
      pod.pending = { marks: next, t: BADGE_DELAY };
      return;
    }
    pod.pending = null;
    pod.flick = null;
    pod.out = out;
    pod.shown = next;
    this.paintPodium(pod);
  }

  /** kept for the director: the tally draws the marks in their own colours, whoever the suitor */
  setAccent(_spot: number, _accent: string | undefined) {}

  /** kept for the director: the lamps are part of the set now and always show */
  showStanding(_on: boolean | null) {}

  private land(pod: Podium, next: Mark[]) {
    // which lamp is new: the first place the sorted lists differ
    let fresh = next.findIndex((m, i) => pod.shown[i] !== m);
    if (fresh < 0) fresh = next.length - 1;
    const was = this.stateOf(pod, fresh);
    pod.shown = next;
    pod.flick = next[fresh] === 'charmed' ? { i: fresh, t: 0, was } : null;
    this.paintPodium(pod);
  }

  // ------------------------------------------------------------------ text areas
  /**
   * The text over the stage (subtitle panel and its name tab, the cards, the round name, the twist,
   * the result, the name tags), read from the captions overlay every few frames as NDC boxes, so the
   * pops keep out of whatever is on screen now. Before the overlay exists, a fixed guess.
   */
  private readZones(renderer: THREE.WebGLRenderer) {
    if (this.frame - this.zoneFrame < 6) return;
    this.zoneFrame = this.frame;
    const ov = renderer.domElement.parentElement?.querySelector<HTMLElement>('.cm-ov');
    if (!ov) return;
    const R = ov.getBoundingClientRect();
    if (R.width < 2 || R.height < 2) return;
    const ndc = (r: DOMRect): Zone => ({
      x0: ((r.left - R.left) / R.width) * 2 - 1,
      x1: ((r.right - R.left) / R.width) * 2 - 1,
      y0: 1 - ((r.bottom - R.top) / R.height) * 2,
      y1: 1 - ((r.top - R.top) / R.height) * 2,
    });
    const zones: Zone[] = [];
    for (const e of ov.querySelectorAll<HTMLElement>('.cm-sub, .cm-hand, .cm-round, .cm-twist, .cm-big, .cm-res, .cm-tag, .cm-bub')) {
      const cs = getComputedStyle(e);
      if (cs.display === 'none' || cs.visibility === 'hidden' || Number(cs.opacity) < 0.05) continue;
      const r = e.getBoundingClientRect();
      if (r.width < 2 || r.height < 2) continue;
      zones.push(ndc(r));
      if (e.classList.contains('cm-sub') || e.classList.contains('cm-twist') || e.classList.contains('cm-res')) {
        // the speaker's name tab sticks up over the panel's top edge
        for (const n of e.querySelectorAll<HTMLElement>('.n')) {
          const nr = n.getBoundingClientRect();
          if (nr.width > 2) zones.push(ndc(nr));
        }
      }
    }
    this.zones = zones;
  }

  // ------------------------------------------------------------------ pop placement
  /** NDC box of a mark of size w x h (metres) centred at world point c */
  private box(c: THREE.Vector3, w: number, h: number, frameH: number, aspect: number, camera: THREE.Camera) {
    const n = this.w.copy(c).project(camera);
    const hx = w / (frameH * aspect), hy = h / frameH;
    return { x0: n.x - hx, x1: n.x + hx, y0: n.y - hy, y1: n.y + hy };
  }

  /** how badly a box collides with the frame edge and the text areas (0 = clear) */
  private clash(b: Zone) {
    let bad = Math.max(0, b.x1 - 0.97) + Math.max(0, -0.97 - b.x0) + Math.max(0, b.y1 - 0.95) * 2 + Math.max(0, -0.95 - b.y0);
    for (const z of this.zones) {
      const ox = Math.min(b.x1, z.x1 + 0.02) - Math.max(b.x0, z.x0 - 0.02);
      const oy = Math.min(b.y1, z.y1 + 0.02) - Math.max(b.y0, z.y0 - 0.02);
      if (ox > 0 && oy > 0) bad += ox * oy * 10 + Math.min(ox, oy);
    }
    return bad;
  }

  /**
   * Find the head this pop belongs to: a ray straight down onto it for its top, and a few rays in
   * from either side (along the camera's right) for its outline, hair and ears included. Avatars
   * differ (a puff of hair, a helmet, a slice of toast), so the marks sit off the real silhouette.
   */
  private measureHead(p: Pop, anchor: THREE.Vector3, camera: THREE.Camera) {
    const cast = this.group.parent?.getObjectByName('cast');
    if (!cast) return;
    const ray = this.ray;
    ray.camera = camera;
    const hit = (o: THREE.Vector3, d: THREE.Vector3, far: number) => {
      ray.set(o, d);
      ray.far = far;
      for (const h of ray.intersectObject(cast, true)) if ((h.object as THREE.Mesh).isMesh && h.object.visible) return h.distance;
      return null;
    };
    const down = hit(this.w.copy(anchor).setY(anchor.y + 0.6), this.v.set(0, -1, 0), 1.0);
    const top = down === null ? -0.08 : Math.max(-0.4, Math.min(0.3, 0.6 - down));
    const ext: Record<1 | -1, number> = { 1: HEAD_HALF, [-1]: HEAD_HALF };
    for (const s of [1, -1] as const) {
      let e = 0;
      let found = false;
      for (const dy of [-0.04, -0.12, -0.2]) {
        const o = this.w.copy(anchor).addScaledVector(this.right, s * 0.7).setY(anchor.y + top + dy);
        const d = hit(o, this.v.copy(this.right).multiplyScalar(-s), 0.7);
        if (d !== null) {
          e = Math.max(e, 0.7 - d);
          found = true;
        }
      }
      if (found) ext[s] = Math.max(0.06, e);
    }
    p.head = { top, ext };
  }

  /**
   * Where the pop rests, as a side and offsets in mark sizes. Chosen when the pop starts and again
   * only after a cut, so the mark never wanders: the spot over the head if it is clear, else the
   * other side, else slid out or down beside the head, clear of the text and the frame edge.
   */
  private fit(p: Pop, anchor: THREE.Vector3, u: number, frameH: number, aspect: number, camera: THREE.Camera) {
    if (p.fit && p.fitFrame === this.frame) return p.fit;
    const pl = PLACE[p.mark];
    const [ex, ey] = EXTENT[p.mark];
    /** how badly a resting place collides with the frame edge and the text (0 = clear) */
    const clashAt = (side: number, lateral: number, y: number, k: number) => {
      const uk = u * k;
      const at = (ox: number, oy: number) =>
        this.v
          .copy(anchor)
          .addScaledVector(this.right, side * (lateral + ox * uk))
          .addScaledVector(this.toCam, 0.25)
          .setY(anchor.y + y + oy * uk);
      // the drawn glyph, a little larger (the overshoot)
      let bad = this.clash(this.box(at(0, 0), uk * pl.size * ex * 1.1, uk * pl.size * ey * 1.15, frameH, aspect, camera));
        return bad;
    };
    // keep the resting place unless the camera has cut, or (every few frames) a drifting or easing
    // camera has carried it into the frame edge or the text
    const moved = !p.fit || p.fitCam.distanceToSquared(camera.position) > 0.16;
    if (!moved && p.fit) {
      p.fitFrame = this.frame;
      if (this.frame % 4 !== 0 || clashAt(p.fit.side, p.fit.x, p.fit.y, p.fit.k) < 0.004) return p.fit;
    }
    this.measureHead(p, anchor, camera);
    let best = { side: 1, x: 0, y: 0, k: 1 }, bestCost = Infinity;
    for (const k of [1, 0.86, 0.74]) {
      const uk = u * k;
      for (const side of [1, -1]) {
        for (const extra of [0, 0.25, 0.5, 0.8]) {
          for (const push of [0, 0.12, 0.24, 0.36, 0.5, 0.65, 0.8, 1]) {
            const edge = p.head.ext[side as 1 | -1];
            let lateral = (pl.fromEdge ? edge : 0) + pl.x + (pl.xu + extra) * uk;
            // pushed down beside the face: clear of the head, not over it
            if (push > 0.3 && !pl.fromEdge) lateral = Math.max(lateral, edge + 0.03 + 0.5 * ex * pl.size * uk);
            const y = p.head.top + pl.y + (pl.yu - push) * uk;
            const bad = clashAt(side, lateral, y, k);
            const cost = bad * 40 + extra * 0.8 + push * 1.2 + (1 - k) * 4 + (side < 0 ? 0.08 : 0);
            if (cost < bestCost) {
              bestCost = cost;
              best = { side, x: lateral, y, k };
            }
          }
        }
      }
    }
    p.fit = best;
    p.fitFrame = this.frame;
    p.fitCam.copy(camera.position);
    return best;
  }

  private place(p: Pop, part: Part, renderer: THREE.WebGLRenderer, camera: THREE.Camera) {
    const sprite = part.sprite;
    if (!p.active) return;
    this.readZones(renderer);
    const t = (this.freeze ?? p.t) - part.delay;
    const anchor = this.anchorPos.copy(p.anchor());
    // a head out of the frame (cropped, or off to the side): its mark is not drawn floating in the shot
    const seen = this.w.copy(anchor).setY(anchor.y - 0.12).project(camera);
    if (seen.z > 1 || Math.abs(seen.x) > 1.02 || seen.y > 1.02 || seen.y < -1.02) {
      sprite.scale.set(1e-4, 1e-4, 1);
      sprite.updateMatrixWorld();
      return;
    }
    // keep the mark readable: a share of the frame height, between the wide and the close-up
    let size = BASE_SIZE;
    let frameH = 2; // height of the frame, in metres, at the mark's distance
    const cam = camera as THREE.PerspectiveCamera;
    const aspect = cam.aspect || 16 / 9;
    if (cam.isPerspectiveCamera) {
      const d = cam.position.distanceTo(anchor);
      frameH = 2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2);
      size = Math.min(MAX_FRAC * frameH, Math.max(MIN_FRAC * frameH, BASE_SIZE));
    }
    this.right.setFromMatrixColumn(camera.matrixWorld, 0).setY(0).normalize();
    this.toCam.copy(camera.position).sub(anchor).normalize();
    const f = this.fit(p, anchor, size, frameH, aspect, camera);
    const side = f.side;
    const u = size * f.k;
    const [sx, sy, lift] = popCurve(t);
    let s = 1, dy = 0, rot = 0, out = 1;
    const held = Math.max(0, t - LAND);
    // the hold moves on twos, like a drawn cel
    const step = Math.floor(held * ONES) / ONES;
    if (p.mark === 'charmed') {
      // two quick heartbeats, then a rest, repeating
      const b = step % 1.1;
      s = 1 + (b < 0.1 ? 0.08 : b > 0.2 && b < 0.3 ? 0.05 : 0);
      rot = Math.sin(step * 3.1) * 0.05;
    } else if (p.mark === 'unsure') {
      // the drop slides slowly down beside the temple
      dy = -0.22 * u * clamp01(step / 1.6);
      rot = 0.04 * Math.sin(step * 2.4);
    } else {
      // the lines droop a little and sway on twos, as if the air went out of them
      dy = -0.05 * u * clamp01(step / 1.2);
      rot = (Math.floor(step * 3) % 2 ? 1 : -1) * 0.03;
    }
    const exitT = (this.freeze ?? p.t) - HOLD;
    if (exitT > 0) {
      const k = clamp01(exitT / EXIT);
      // a tiny swell, then gone: the heart floats up, the drop slides off, the gloom just shrinks
      out = k < 0.3 ? 1 + 0.1 * (k / 0.3) : (1 - (k - 0.3) / 0.7) * 1.1;
      dy += (p.mark === 'charmed' ? 0.25 : p.mark === 'unsure' ? -0.2 : 0) * u * k;
    }
    const rest = u * part.size;
    const w = rest * sx * s * out;
    const hgt = rest * sy * s * (exitT > 0 && p.mark === 'charmed' ? 1 + 0.15 * clamp01(exitT / EXIT) : 1) * out;
    sprite.scale.set(Math.max(w, 1e-4), Math.max(hgt, 1e-4), 1);
    // grow from the right end: the heart stands on its point (it can never sink into the hair at
    // the overshoot), the gloom lines hang from their tops (they never reach down into the head)
    const [, ey] = EXTENT[p.mark];
    const grow = (hgt - rest) * ey * 0.5;
    const pivot = p.mark === 'charmed' ? grow : p.mark === 'cringing' ? -grow : 0;
    (sprite.material as THREE.SpriteMaterial).rotation = rot * (p.mark === 'charmed' ? 1 : side) + part.tilt * side * -1;
    sprite.position
      .copy(anchor)
      .addScaledVector(this.right, side * (f.x + part.ox * u))
      .addScaledVector(this.toCam, 0.25)
      .setY(anchor.y + f.y + part.oy * u + lift * part.size * u * 0.6 + dy + pivot);
    sprite.updateMatrixWorld();
  }

  update(dt: number) {
    this.frame++;
    for (const p of this.pops.values()) {
      if (!p.active) continue;
      if (this.freeze === null) p.t += dt;
      for (const part of p.parts) part.sprite.visible = true;
      if (p.t > HOLD + EXIT && this.freeze === null) {
        p.active = false;
        for (const part of p.parts) part.sprite.visible = false;
      }
    }
    for (const pod of this.pods) {
      if (pod.pending) {
        pod.pending.t -= dt;
        if (pod.pending.t <= 0) {
          const m = pod.pending.marks;
          pod.pending = null;
          this.land(pod, m);
        }
      }
      if (pod.flick) {
        pod.flick.t += dt;
        if (pod.flick.t > FLICK[FLICK.length - 1]!) pod.flick = null;
        this.paintPodium(pod);
      }
    }
  }

  dispose() {
    this.group.removeFromParent();
  }
}

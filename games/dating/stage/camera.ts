// The director camera: the shot grammar of a studio dating show. Every shot is a rig that is
// solved once at the cut from where the cast actually stands (headAnchor / faceAnchor, so a 1.1 m
// kid and a 2 m knight are framed the same way), then re-evaluated each frame against smoothed
// anchors so it follows anyone who moves. Each rig carries its own slow move (push, truck, crane)
// and every shot drifts a little, so the picture is never dead still and never fast.
//
// Close-ups are chosen by a small solver: candidate angles around the subject's gaze are scored by
// projecting the other performers and the lamp columns into the frame. A candidate loses for the
// back of a head, a pole through the face, a body in front of the subject, or clutter in frame.
import * as THREE from 'three';
import * as Layout from './layout.ts';
import { BOOTH, CAMERA_HOME, DATE_SPOT, LAMP_OFFSET, SPOTS, STAR, WALL, spotPos } from './layout.ts';
import { clamp01, damp, easeInOut } from './toon.ts';

export type ShotName =
  | 'wide' // the establishing wide from the audience
  | 'wideHigh' // the crane wide that counts the lights
  | 'entrance' // a walk-on: the spot and the path in
  | 'closeup' // a speaker, front three-quarter, eye level
  | 'medium' // a looser single (rival reactions, second angle on a speaker)
  | 'starReaction' // the star, close
  | 'starMedium' // the star in her chair with the lamp
  | 'ots' // over the shoulder of `id` onto `to`
  | 'row' // the suitors still standing, lit and dark lamps
  | 'pair' // two people in one frame (`id`, `to`) from the front
  | 'cut' // the light-out wide
  | 'twoShot' // the one on one: the star and `id`
  | 'booth' // the confession: tight, centred, handheld
  | 'boothWide' // the empty booth, opening a booth scene
  | 'pickPush' // the held pause: a slow push onto the star
  | 'cards' // the reveal: the star in her chair while a card turns on the rail
  | 'result'; // the winner beside the star, pulling back to the room

export interface Shot {
  name: ShotName;
  /** subject: closeup / medium / booth / twoShot / ots (the near shoulder) / pair */
  id?: string;
  /** ots: the face we look at; pair: the second person */
  to?: string;
  /** framing variant (booth side, second angle) */
  variant?: number;
  /** length of a shot that carries its own move (the pick push) */
  ms?: number;
  /** how far the subject's face is expected to turn to the lens (acting's cheat), if not usual */
  cheat?: number;
}

/** What the camera needs to know about the room. The director supplies it. */
export interface Subjects {
  starId(): string | null;
  /** eye-height world point of a cast member, or null if not on stage */
  face(id: string): THREE.Vector3 | null;
  /** facing yaw of a cast member */
  yaw(id: string): number;
  /** suitors still standing (ids) */
  standing(): string[];
  /** the point this cast member is talking to or looking at */
  partner(id: string): THREE.Vector3 | null;
  /** just above the head (performer.headAnchor) */
  head?(id: string): THREE.Vector3 | null;
  /** where the feet are */
  feet?(id: string): THREE.Vector3 | null;
  /** the world point this cast member is looking at right now */
  gaze?(id: string): THREE.Vector3 | null;
  /** ids of everyone visible on the main stage (not in the booth) */
  present?(): string[];
  /** how much wider than a person this cast member is (a toaster, a cape): 1 = usual */
  girth?(id: string): number;
}

interface Pose {
  pos: THREE.Vector3;
  target: THREE.Vector3;
  fov: number;
  roll: number;
  /** drift amplitude scale (0 = still) */
  drift: number;
  /** handheld wobble scale (booth) */
  wobble: number;
}

/** a solved shot: evaluated each frame at shot time t (s) */
type Rig = (t: number) => Pose;

const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
const UP = v(0, 1, 0);
const ASPECT = 16 / 9;
const DEG = Math.PI / 180;

/** the subtitle bar covers the bottom fifth; the cards sit top right; keep faces out of both */
const SAFE = { top: 0.93, bottom: -0.5 };

function pose(pos: THREE.Vector3, target: THREE.Vector3, fov: number, drift = 1, roll = 0, wobble = 0): Pose {
  return { pos, target, fov, roll, drift, wobble };
}
function lerpPose(a: Pose, b: Pose, k: number): Pose {
  return {
    pos: a.pos.clone().lerp(b.pos, k),
    target: a.target.clone().lerp(b.target, k),
    fov: a.fov + (b.fov - a.fov) * k,
    roll: a.roll + (b.roll - a.roll) * k,
    drift: a.drift + (b.drift - a.drift) * k,
    wobble: a.wobble + (b.wobble - a.wobble) * k,
  };
}
function clonePose(p: Pose): Pose {
  return { ...p, pos: p.pos.clone(), target: p.target.clone() };
}
/** horizontal unit vector at azimuth a (radians from +z toward +x) */
const azv = (a: number) => v(Math.sin(a), 0, Math.cos(a));
const azOf = (d: THREE.Vector3) => Math.atan2(d.x, d.z);

// ---------------------------------------------------------------------------- projection helpers
const probe = new THREE.PerspectiveCamera(30, ASPECT, 0.05, 200);
function aimProbe(pos: THREE.Vector3, target: THREE.Vector3, fov: number) {
  probe.fov = fov;
  probe.aspect = ASPECT;
  probe.position.copy(pos);
  probe.up.copy(UP);
  probe.lookAt(target);
  probe.updateProjectionMatrix();
  probe.updateMatrixWorld(true);
  probe.matrixWorldInverse.copy(probe.matrixWorld).invert();
}
const _p = v();
/** NDC of a world point for the aimed probe; z = view depth (metres, positive in front) */
function ndc(p: THREE.Vector3, out = v()) {
  _p.copy(p).applyMatrix4(probe.matrixWorldInverse);
  const depth = -_p.z;
  out.copy(p).project(probe);
  out.z = depth;
  return out;
}
/** half width (NDC) of a world radius r at view depth d */
function ndcRadius(r: number, depth: number) {
  const f = 1 / Math.tan((probe.fov * DEG) / 2);
  return (r * f) / Math.max(0.05, depth) / ASPECT;
}
function ndcRadiusY(r: number, depth: number) {
  const f = 1 / Math.tan((probe.fov * DEG) / 2);
  return (r * f) / Math.max(0.05, depth);
}

interface Rect {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
  depth: number;
}
const overlap = (a: Rect, b: Rect) => Math.max(0, Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0)) * Math.max(0, Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0));
const FRAME: Rect = { x0: -1, x1: 1, y0: -1, y1: 1, depth: 0 };

/** a body as a screen rectangle: an upright capsule from feet to head top */
interface Body {
  id: string;
  feet: THREE.Vector3;
  head: THREE.Vector3;
  r: number;
}
function bodyRect(b: Body): Rect | null {
  const a = ndc(b.head, v());
  const f = ndc(b.feet, v());
  const depth = Math.min(a.z, f.z);
  if (a.z < 0.1 && f.z < 0.1) return null;
  const rx = ndcRadius(b.r, Math.max(0.1, (a.z + f.z) / 2));
  const x0 = Math.min(a.x, f.x) - rx, x1 = Math.max(a.x, f.x) + rx;
  return { x0, x1, y0: Math.min(a.y, f.y), y1: Math.max(a.y, f.y) + ndcRadiusY(0.04, a.z), depth };
}

/** each suitor's lamp column behind their spot */
const COLUMNS = SPOTS.map((p, spot) => ({ spot, base: v(p.x, 0, p.z + LAMP_OFFSET), top: v(p.x, Layout.LAMP_BOX.h + 0.05, p.z + LAMP_OFFSET), r: Layout.LAMP_BOX.w / 2 }));
/** the one prop that stands up into frames: the star's chair (its heart back) */
const PROPS: Body[] = [{ id: 'chair', feet: STAR.seat.clone().setY(0), head: STAR.seat.clone().setY(1.5), r: 0.8 }];

function inRoom(p: THREE.Vector3) {
  const dx = p.x - WALL.center.x, dz = p.z - WALL.center.z;
  return Math.hypot(dx, dz) < WALL.radius - 0.7 && p.z > -4.6 && p.y > 0.35 && p.y < 5.5;
}

// ---------------------------------------------------------------------------- the camera
export class DirectorCamera {
  readonly camera: THREE.PerspectiveCamera;
  shot: Shot = { name: 'wide' };
  private subjects: Subjects;
  private rig: Rig;
  private cur: Pose;
  private blend: { from: Pose; t: number; dur: number } | null = null;
  private shotT = 0;
  private time = 0;
  private sinceCutT = 99;
  private smooth = new Map<string, { face: THREE.Vector3; head: THREE.Vector3 }>();
  private up = v(0, 1, 0);

  constructor(subjects: Subjects) {
    this.subjects = subjects;
    this.camera = new THREE.PerspectiveCamera(CAMERA_HOME.fov, ASPECT, 0.08, 120);
    // mount wires the director in after this constructor runs: start on a fixed home pose
    const home = pose(CAMERA_HOME.pos.clone(), CAMERA_HOME.target.clone(), CAMERA_HOME.fov);
    this.rig = () => home;
    this.cur = home;
    this.apply(this.cur);
    (globalThis as { __cam?: unknown }).__cam = this;
  }

  /** the director hands over its full view of the room (more than mount forwards) */
  bind(subjects: Subjects) {
    this.subjects = subjects;
  }

  /** would this shot frame cleanly right now (an over-the-shoulder may have no clean angle) */
  canFrame(shot: Shot) {
    return !!this.solveRaw(shot);
  }

  /** seconds since the last cut */
  sinceCut() {
    return this.sinceCutT;
  }

  /** the last solve, for tools/inspection: shot, score, camera and aim */
  debug: Record<string, unknown> = {};

  /** every cut and eased move, for tools: [time (s), shot] (last 200) */
  readonly log: { t: number; name: string; id?: string; to?: string }[] = [];
  private note(shot: Shot) {
    this.log.push({ t: +this.time.toFixed(2), name: shot.name, id: shot.id, to: shot.to });
    if (this.log.length > 200) this.log.shift();
  }

  /** instant cut to a shot */
  cut(shot: Shot) {
    this.note(shot);
    this.shot = shot;
    this.blend = null;
    this.smooth.clear();
    this.rig = this.solve(shot);
    this.shotT = 0;
    this.sinceCutT = 0;
    this.cur = this.rig(0);
  }

  /** eased move from wherever the camera is to a shot over ms */
  ease(shot: Shot, ms: number) {
    this.note(shot);
    this.shot = shot;
    this.blend = { from: clonePose(this.cur), t: 0, dur: Math.max(0.3, ms / 1000) };
    this.rig = this.solve(shot);
    this.shotT = 0;
  }

  setAspect(a: number) {
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  /** shots in which the suitors' name tags belong on screen */
  showsRow() {
    const n = this.shot.name;
    return n === 'wide' || n === 'wideHigh' || n === 'row' || n === 'cut';
  }

  // -------------------------------------------------------------------------- anchors
  private anchors(id: string | undefined | null) {
    if (!id) return null;
    const S = this.subjects;
    const face = S.face(id);
    if (!face) return null;
    const head = S.head?.(id) ?? face.clone().add(v(0, 0.3, 0));
    const feet = S.feet?.(id) ?? face.clone().setY(0);
    const h = Math.max(0.5, head.y - feet.y);
    const look = S.gaze?.(id) ?? S.partner(id);
    let gaze = look ? look.clone().sub(face).setY(0) : azv(S.yaw(id));
    if (gaze.lengthSq() < 1e-4) gaze = azv(S.yaw(id));
    gaze.normalize();
    // the head turns toward the look, the body less: the face points between the two
    const body = azv(S.yaw(id));
    // `gaze` is where they look; acting (stage/acting.ts) then cheats the face toward the lens,
    // as far as the neck allows from where the body faces
    return { face, head, feet, h, gaze, body, star: id === S.starId() };
  }

  /** who the current rig is framed on */
  private rigIds(): string[] {
    const n = this.shot.name;
    const star = this.subjects.starId();
    if ((n === 'starReaction' || n === 'starMedium' || n === 'pickPush') && star) return [star];
    if ((n === 'twoShot' || n === 'result') && star) return [star, this.shot.id].filter((x): x is string => !!x);
    return [this.shot.id, this.shot.to].filter((x): x is string => !!x);
  }

  /** a stand-in swapped for its model (or anyone resized) mid-shot: frame them again */
  private solvedAt = new Map<string, THREE.Vector3>();
  private recheck = 0;
  private resolveIfChanged() {
    this.recheck += 1;
    if (this.recheck % 15) return;
    const n = this.shot.name;
    if (n === 'pickPush' || n === 'result' || n === 'wideHigh' || n === 'boothWide') return;
    for (const id of this.rigIds()) {
      const h = this.subjects.head?.(id);
      const was = this.solvedAt.get(id);
      if (!h || !was) continue;
      const walking = Math.hypot(h.x - was.x, h.z - was.z) > 0.25;
      if (!walking && Math.abs(h.y - was.y) > 0.12) {
        const t = this.shotT;
        this.smooth.clear();
        this.rig = this.solve(this.shot);
        this.shotT = t;
        return;
      }
    }
  }

  /** smoothed face/head for following (so breathing and talking bob do not shake the frame) */
  private follow(id: string, dt: number) {
    const S = this.subjects;
    const f = S.face(id);
    if (!f) return this.smooth.get(id) ?? null;
    const h = S.head?.(id) ?? f.clone().add(v(0, 0.3, 0));
    let s = this.smooth.get(id);
    if (!s) {
      s = { face: f.clone(), head: h.clone() };
      this.smooth.set(id, s);
    } else if (dt > 0) {
      const r = 2.2;
      s.face.set(damp(s.face.x, f.x, r, dt), damp(s.face.y, f.y, r * 0.6, dt), damp(s.face.z, f.z, r, dt));
      s.head.set(damp(s.head.x, h.x, r, dt), damp(s.head.y, h.y, r * 0.6, dt), damp(s.head.z, h.z, r, dt));
    }
    return s;
  }

  private bodies(except: (string | undefined)[]): Body[] {
    const S = this.subjects;
    const ids = S.present?.() ?? [...S.standing(), S.starId()].filter((x): x is string => !!x);
    const out: Body[] = [];
    for (const id of ids) {
      if (except.includes(id)) continue;
      const a = this.anchors(id);
      if (!a) continue;
      const g = S.girth?.(id) ?? 1;
      out.push({ id, feet: a.feet, head: a.head, r: g * Math.max(0.26, Math.min(0.55, 0.2 * a.h + 0.08)) });
    }
    // the star's own chair is behind her, not in the way (the props obey `except` too)
    return out.concat(PROPS.filter((p) => !except.includes(p.id)));
  }

  // -------------------------------------------------------------------------- scoring
  /** clutter and collisions for a candidate whose subject's head occupies `headR` (NDC rect) */
  private why: string[] = [];
  /** the spot the current single's subject stands on (-1: none), so their own lamp is not clutter */
  private subjSpot = -1;
  private clutter(pos: THREE.Vector3, subjDepth: number, headR: Rect, bodyR: Rect | null, others: Body[], strict = false) {
    let s = 0;
    const why: string[] = [];
    const note = (k: string, x: number) => {
      if (x > 0.5) why.push(`${k}:${x.toFixed(1)}`);
      s += x;
    };
    for (const b of others) {
      // a camera inside someone
      const dxz = Math.hypot(pos.x - b.feet.x, pos.z - b.feet.z);
      if (dxz < b.r + 0.25 && pos.y < b.head.y + 0.2) note(b.id + '-inside', 60);
      // a single shows one character: anyone else (or the star's chair) in frame at all is a fault,
      // so the body is taken generously (arms, a cape, a toaster's handles)
      const r = bodyRect(strict ? { ...b, r: b.r * 1.3 + 0.12, head: b.head.clone().setY(b.head.y + 0.12) } : b);
      if (!r) continue;
      const inFrame = overlap(r, FRAME) / 4;
      const front = r.depth < subjDepth - 0.15;
      if (strict && inFrame > 0) note(b.id + '-in', 40 + inFrame * 200);
      note(b.id + '-frame', inFrame * (front ? 90 : 45));
      // someone else cut by the frame edge (a shoulder, half a head) reads as a mistake: worse in front
      const area = Math.max(1e-6, (r.x1 - r.x0) * (r.y1 - r.y0));
      if (inFrame > 0.002 && (inFrame * 4) / area < 0.95 && b.id !== 'chair') note(b.id + '-edge', front ? 30 : r.y1 > 1 && r.y0 < 0.9 ? 14 : 4); // a neighbour beheaded by the frame top is a crop too
      if (overlap(r, headR) > 0) note(b.id + '-head', front ? 60 : 8);
      if (front && bodyR && overlap(r, bodyR) > 0) note(b.id + '-body', 14);
    }
    for (const c of COLUMNS) {
      const a = ndc(c.top, v());
      const b = ndc(c.base, v());
      if (a.z < 0.1 && b.z < 0.1) continue;
      const depth = Math.min(a.z, b.z);
      const rx = ndcRadius(c.r, Math.max(0.1, (a.z + b.z) / 2));
      // x of the column at the head's height (the column is vertical; interpolate)
      const k = clamp01(((headR.y1 + headR.y0) / 2 - b.y) / Math.max(1e-3, a.y - b.y));
      const cx = b.x + (a.x - b.x) * k;
      const colR: Rect = { x0: Math.min(a.x, b.x) - rx, x1: Math.max(a.x, b.x) + rx, y0: Math.min(a.y, b.y), y1: Math.max(a.y, b.y), depth };
      const atHead: Rect = { x0: cx - rx - 0.03, x1: cx + rx + 0.03, y0: colR.y0, y1: colR.y1, depth };
      // a pole through the face: graded by how much of the head's width it crosses
      const ox = Math.max(0, Math.min(atHead.x1, headR.x1) - Math.max(atHead.x0, headR.x0));
      if (ox > 0 && atHead.y1 > headR.y0) {
        // a lamp that stops below the eyes sits behind the shoulders, not through the face
        const faceMid = (headR.y0 + headR.y1) / 2 - (headR.y1 - headR.y0) * 0.15;
        const through = atHead.y1 > faceMid ? 1 : 0.1;
        note('pole-face', through * (6 + 60 * Math.pow(ox / Math.max(1e-3, headR.x1 - headR.x0), 0.7)));
      }
      const front = depth < subjDepth - 0.1;
      if (front && bodyR && overlap(colR, bodyR) > 0) note('pole-front', 30);
      const colIn = overlap(colR, FRAME) / 4;
      note('pole-frame', colIn * (front ? 20 : 2.5));
      // a neighbour's lamp in a single is clutter: the background behind one character stays calm
      if (strict && c.spot !== this.subjSpot && colIn > 0) note('pole-other', 12 + colIn * 100);
    }
    if (!inRoom(pos)) note('room', 80);
    this.why = why;
    return s;
  }

  /**
   * A single: the subject front three-quarter at their own eye level, head room above, the face
   * on the upper third, lead room on the side they look to.
   */
  private solveSingle(id: string, size: 'close' | 'medium' | 'tight', prefer = 26, cheatOverride?: number): Rig | null {
    const A = this.anchors(id);
    if (!A) return null;
    const others = this.bodies(A.star ? [id, 'chair'] : [id]);
    this.subjSpot = SPOTS.findIndex((sp) => Math.hypot(sp.x - A.feet.x, sp.z - A.feet.z) < 0.8);
    const h = A.h;
    // the face sits on the upper third (clear of the subtitle bar), the head under the frame top.
    // A big head (a chibi, a helmet) would need a tall frame for that, and a tall frame is a wide
    // one that takes in the neighbours: the face drops toward the middle instead, the frame stays tight
    const baseY = size === 'medium' ? 0.14 : 0.2;
    const span = Math.max(0.12, A.head.y - A.face.y);
    const fit = (want: number) => {
      const fy = Math.max(-0.05, Math.min(baseY, 0.8 - (2 * span) / want));
      return { FH: Math.max(want, (2 * span) / (0.8 - fy)), fy };
    };
    // a close-up is head and shoulders whatever the height: a frame sized off the whole body
    // (a 2 m knight) is wide enough at 16:9 to take in the neighbours on either side
    const tight = fit(Math.min(0.95, Math.max(0.64, 0.16 * h + 0.42)));
    const close = fit(Math.min(1.15, Math.max(0.76, 0.2 * h + 0.5)));
    const medium = fit(Math.min(1.6, Math.max(0.95, 0.5 * h + 0.45)));
    const between = fit((medium.FH + close.FH) / 2);
    // a tighter size is the fallback when the room crowds the frame
    const sizes = size === 'tight' ? [{ ...tight, bias: 0 }] : size === 'close' ? [{ ...close, bias: 0 }, { ...tight, bias: 0.6 }] : [{ ...medium, bias: 0 }, { ...between, bias: 1.5 }, { ...close, bias: 3 }];
    // a wide lens up close throws the neighbours out of frame (the Animal Crossing feel)
    const fovs = size === 'medium' ? [26, 34, 42] : [24, 32, 42];
    const tops: { s: number; k: number; fov: number; why: string }[] = [];
    let best: { pos: THREE.Vector3; target: THREE.Vector3; fov: number; s: number; why?: string[] } | null = null;
    for (const { FH, fy: faceY, bias } of sizes)
    for (const fov of fovs) {
      const dist = FH / 2 / Math.tan((fov * DEG) / 2);
      // every angle on the audience side: acting turns the face toward wherever the lens is
      for (let k = -80; k <= 80; k += 10) {
        const dir = azv(k * DEG);
        const pos = A.face.clone().addScaledVector(dir, dist);
        pos.y = A.face.y + 0.03;
        const fwd = dir.clone().negate();
        const right = fwd.clone().cross(UP).normalize();
        // the face the lens will see: the look pulled toward the camera, as acting does it, and
        // never more than a three-quarter away
        const cheat = cheatOverride ?? (A.star ? 0.25 : 0.65);
        const faceDir = A.gaze.clone().lerp(dir, cheat).normalize();
        // the neck turns about 60 degrees from the body at most
        const neck = 60 * DEG;
        const fromBody = Math.atan2(A.body.x * faceDir.z - A.body.z * faceDir.x, A.body.dot(faceDir));
        if (Math.abs(fromBody) > neck) {
          const a = azOf(A.body) - Math.sign(fromBody) * neck;
          faceDir.copy(azv(a));
        }
        const away = Math.acos(Math.max(-1, Math.min(1, faceDir.dot(dir))));
        const looksLeft = faceDir.dot(right) < 0;
        for (const lead of [0.08, 0]) {
        const ox = looksLeft ? lead : -lead;
        const halfW = (FH / 2) * ASPECT;
        const centerY = A.face.y - (faceY * FH) / 2;
        const target = A.face.clone().addScaledVector(right, -ox * halfW);
        target.y = centerY;
        aimProbe(pos, target, fov);
        const fN = ndc(A.face, v());
        const hN = ndc(A.head, v());
        const headHalf = ndcRadius(Math.max(0.14, 0.12 * h + 0.05), fN.z);
        const headR: Rect = { x0: fN.x - headHalf, x1: fN.x + headHalf, y0: fN.y - (hN.y - fN.y) * 0.9, y1: hN.y, depth: fN.z };
        const bodyR: Rect = { x0: fN.x - headHalf * 1.4, x1: fN.x + headHalf * 1.4, y0: -1, y1: hN.y, depth: fN.z };
        let s = Math.pow((away / DEG - prefer) / 18, 2);
        if (away > 70 * DEG) s += 40; // the back of a head
        // the audience side: never shoot from upstage back out at the dark house
        if (dir.z < 0) s += 40; // never from upstage, back out at the dark house
        if (hN.y > SAFE.top) s += 20;
        if (ndc(A.face, v()).y < -0.2) s += 20;
        s += this.clutter(pos, fN.z, headR, bodyR, others, true);
        s += fov === fovs[0] ? 0 : fov === fovs[1] ? 0.5 : 1.5; // a little prefer the longer lens
        s += bias;
        if (lead < 0.1) s += 0.8; // lead room is the grammar; centring is the fallback
        tops.push({ s: +s.toFixed(1), k, fov, why: this.why.join(' ') });
        if (!best || s < best.s) best = { pos, target, fov, s, why: [...this.why, `k${k}`] };
        }
      }
    }
    if (!best) return null;
    this.debug = { kind: 'single', id, size, score: +best.s.toFixed(2), pos: best.pos.toArray().map((x) => +x.toFixed(2)), face: A.face.toArray().map((x) => +x.toFixed(2)), gaze: A.gaze.toArray().map((x) => +x.toFixed(2)), fov: best.fov, why: best.why, tops: tops.sort((a, b) => a.s - b.s).slice(0, 12) };
    const off = best.pos.clone().sub(A.face);
    const aim = best.target.clone().sub(A.face);
    const fov = best.fov;
    const push = size === 'medium' ? 0.05 : 0.035;
    return (t) => {
      const sm = this.smooth.get(id);
      const base = sm ? sm.face : A.face;
      const p = base.clone().add(off);
      const tg = base.clone().add(aim);
      // the slow push: a few per cent over the shot
      const k = Math.min(t, 7) * push;
      p.addScaledVector(tg.clone().sub(p).normalize(), k);
      return pose(p, tg, fov, size === 'tight' ? 0.5 : 0.7);
    };
  }

  /** over the shoulder of `from`, onto the face of `to` */
  private solveOts(from: string, to: string): Rig | null {
    const A = this.anchors(from);
    const B = this.anchors(to);
    if (!A || !B) return null;
    const others = this.bodies([from, to]);
    const ab = B.face.clone().sub(A.face).setY(0);
    const dAB = ab.length();
    if (dAB < 0.6) return null;
    ab.normalize();
    const perp = v(ab.z, 0, -ab.x); // right of the line A -> B
    const FHB = Math.min(2.2, Math.max(1.0, 0.7 * B.h + 0.55));
    let best: { pos: THREE.Vector3; target: THREE.Vector3; fov: number; s: number } | null = null;
    for (const side of [1, -1]) {
      // beside the near head as well as behind it: a tall chair can fill the space behind
      for (const back of [-0.25, 0.35, 0.9, 1.5]) {
        for (const lat of [0.4, 0.6, 0.85]) {
          for (const upY of [0.08, 0.3, 0.6]) {
            const pos = A.face.clone().addScaledVector(ab, -back).addScaledVector(perp, side * lat);
            pos.y = Math.max(A.face.y, B.face.y) + upY;
            const dist = pos.distanceTo(B.face);
            const fov = Math.max(12, Math.min(40, (2 * Math.atan(FHB / 2 / dist)) / DEG));
            const fwd = B.face.clone().sub(pos).setY(0).normalize();
            const right = fwd.clone().cross(UP).normalize();
            // A's shoulder sits on the side of the frame toward A; B on the far third
            const aSide = Math.sign(A.face.clone().sub(pos).dot(right)) || -side;
            const ox = -aSide * 0.26;
            const halfW = (FHB / 2) * ASPECT;
            const target = B.face.clone().addScaledVector(right, -ox * halfW);
            target.y = B.face.y - 0.1 * FHB;
            aimProbe(pos, target, fov);
            const bN = ndc(B.face, v());
            const bH = ndc(B.head, v());
            const half = ndcRadius(Math.max(0.14, 0.12 * B.h + 0.05), bN.z);
            const headR: Rect = { x0: bN.x - half, x1: bN.x + half, y0: bN.y - (bH.y - bN.y), y1: bH.y, depth: bN.z };
            const aN = ndc(A.face, v());
            const aHalf = ndcRadius(Math.max(0.14, 0.12 * A.h + 0.05), Math.max(0.2, aN.z));
            const aR: Rect = { x0: aN.x - aHalf, x1: aN.x + aHalf, y0: aN.y - aHalf * ASPECT * 1.3, y1: aN.y + aHalf * ASPECT, depth: aN.z };
            let s = 0;
            // the shoulder must be in frame, on its side, not over the face we are looking at
            if (aN.z < 0.2) s += 40;
            const ax = Math.abs(aN.x);
            if (ax > 1.0 || ax < 0.45) s += 30; // no shoulder in frame: it is not an over-the-shoulder
            if (aN.y < -0.3 || aN.y > 0.7) s += 30; // nor if the subtitle bar hides it
            if (overlap(aR, headR) > 0) s += 60;
            if (overlap(aR, FRAME) / 4 > 0.28) s += 12; // the near head swallowing the frame
            if (bH.y > SAFE.top) s += 15;
            s += this.clutter(pos, bN.z, headR, null, others);
            // B must face us: the camera within 60 degrees of where B looks
            const toCam = pos.clone().sub(B.face).setY(0).normalize();
            const ang = Math.acos(Math.max(-1, Math.min(1, toCam.dot(B.gaze)))) / DEG;
            if (ang > 60) s += (ang - 60) * 0.8;
            s += Math.abs(back) * 0.6;
            if (!best || s < best.s) best = { pos, target, fov, s };
          }
        }
      }
    }
    this.debug = { kind: 'ots', from, to, score: best ? +best.s.toFixed(2) : null, pos: best?.pos.toArray().map((x) => +x.toFixed(2)), a: A.face.toArray().map((x) => +x.toFixed(2)), b: B.face.toArray().map((x) => +x.toFixed(2)) };
    if (!best || best.s > 24) return null;
    const off = best.pos.clone().sub(B.face);
    const aim = best.target.clone().sub(B.face);
    const fov = best.fov;
    return (t) => {
      const sm = this.smooth.get(to);
      const base = sm ? sm.face : B.face;
      const p = base.clone().add(off);
      const tg = base.clone().add(aim);
      p.addScaledVector(tg.clone().sub(p).normalize(), Math.min(t, 6) * 0.04);
      return pose(p, tg, fov, 0.6);
    };
  }

  /**
   * Fit a set of world points into the frame from azimuth `az` and elevation `el`, at `fov`.
   * Points land within |x| <= bx and y in [y0, y1] (NDC).
   */
  private fit(points: THREE.Vector3[], az: number, el: number, fov: number, bx = 0.86, y0 = -0.62, y1 = 0.62): { pos: THREE.Vector3; target: THREE.Vector3; fov: number } {
    const c = points.reduce((a, p) => a.add(p), v()).multiplyScalar(1 / Math.max(1, points.length));
    const dir = v(Math.sin(az) * Math.cos(el), Math.sin(el), Math.cos(az) * Math.cos(el));
    const cx = 0, cy = (y0 + y1) / 2;
    let lo = 0.8, hi = 40;
    let out = { pos: c.clone().addScaledVector(dir, hi), target: c.clone(), fov };
    for (let i = 0; i < 18; i++) {
      const D = (lo + hi) / 2;
      const pos = c.clone().addScaledVector(dir, D);
      const target = c.clone();
      let ok = true;
      for (let pass = 0; pass < 3; pass++) {
        aimProbe(pos, target, fov);
        let x0 = Infinity, x1 = -Infinity, ya = Infinity, yb = -Infinity;
        ok = true;
        for (const p of points) {
          const n = ndc(p, v());
          if (n.z < 0.2) ok = false;
          x0 = Math.min(x0, n.x);
          x1 = Math.max(x1, n.x);
          ya = Math.min(ya, n.y);
          yb = Math.max(yb, n.y);
        }
        if (!ok) break;
        // recentre: shift the aim so the span sits where we want it
        const fwd = target.clone().sub(pos).normalize();
        const right = fwd.clone().cross(UP).normalize();
        const upv = right.clone().cross(fwd).normalize();
        const depth = target.distanceTo(pos);
        const halfH = depth * Math.tan((fov * DEG) / 2);
        target.addScaledVector(right, (((x0 + x1) / 2 - cx) * halfH * ASPECT));
        target.addScaledVector(upv, (((ya + yb) / 2 - cy) * halfH));
        if (pass === 2) ok = x1 - x0 <= 2 * bx && yb - ya <= y1 - y0;
      }
      if (ok) {
        out = { pos, target, fov };
        hi = D;
      } else lo = D;
    }
    return out;
  }

  private ids() {
    const S = this.subjects;
    return { star: S.starId(), standing: S.standing() };
  }

  /** points that describe the whole suitors' side: four spots, their columns, heads */
  private rowPoints(all: boolean) {
    const pts: THREE.Vector3[] = [];
    const S = this.subjects;
    // everyone still on a spot, lit or dark (a cut suitor stays in the row until they walk)
    const star = S.starId();
    const live = new Set((S.present?.() ?? S.standing()).filter((id) => id !== star));
    SPOTS.forEach((sp, i) => {
      const base = spotPos(i);
      if (all || this.spotHasLive(i, live)) {
        pts.push(base.clone().add(v(-0.45, 0, 0.45)), base.clone().add(v(0.45, 0, 0.45)));
        pts.push(COLUMNS[i]!.top.clone(), base.clone().add(v(0, 2.05, 0)));
      }
    });
    for (const id of live) {
      const h = S.head?.(id);
      if (h && SPOTS.some((sp) => Math.hypot(sp.x - h.x, sp.z - h.z) < 0.8)) pts.push(h.clone().add(v(0, 0.32, 0))); // the name tag above
    }
    return pts;
  }
  private spotHasLive(i: number, live: Set<string>) {
    const S = this.subjects;
    for (const id of live) {
      const f = S.feet?.(id) ?? S.face(id);
      if (f && Math.hypot(f.x - SPOTS[i]!.x, f.z - SPOTS[i]!.z) < 0.8) return true;
    }
    return false;
  }

  // -------------------------------------------------------------------------- the shot list
  private solve(shot: Shot): Rig {
    this.shot = shot;
    this.solvedAt.clear();
    for (const id of this.rigIds()) {
      const h = this.subjects.head?.(id);
      if (h) this.solvedAt.set(id, h);
    }
    const r = this.solveRaw(shot);
    if (r) return r;
    return this.solveRaw({ name: 'wide' })!;
  }

  private solveRaw(shot: Shot): Rig | null {
    const S = this.subjects;
    const { star } = this.ids();
    switch (shot.name) {
      case 'wide': {
        const pts = [STAR.seat.clone().add(v(-1.1, 0, 0.6)), STAR.seat.clone().add(v(0, 1.6, 0)), STAR.seat.clone().add(v(-1.3, 1.3, -0.5)), spotPos(3).add(v(0.7, 0, 0.5)), v(SPOTS[3]!.x + 0.3, 2.5, SPOTS[3]!.z), spotPos(0).add(v(0, 0, 0.7))];
        const a = this.fit(pts, 0.02, 11 * DEG, 30, 0.9, -0.5, 0.6);
        const side = this.time % 2 < 1 ? 1 : -1;
        return (t) => {
          const k = Math.min(t, 12);
          const p = a.pos.clone().add(v(side * 0.05 * k, 0, -0.03 * k));
          const tg = a.target.clone().add(v(side * 0.04 * k, 0, 0));
          return pose(p, tg, a.fov, 1);
        };
      }
      case 'wideHigh': {
        // the crane: high, looking down on the lit spots, settling down toward the wide
        const pts = [STAR.seat.clone().add(v(-0.6, 0, 0.9)), STAR.seat.clone().add(v(0, 1.4, 0)), spotPos(3).add(v(0.8, 0, 0.6)), spotPos(0).add(v(0, 0, 1.0)), v(SPOTS[3]!.x, 2.3, SPOTS[3]!.z)];
        const a = this.fit(pts, 0.04, 30 * DEG, 34, 0.86, -0.58, 0.5);
        const b = this.fit(pts, -0.02, 17 * DEG, 32, 0.86, -0.55, 0.55);
        return (t) => lerpPose(pose(a.pos, a.target, a.fov, 0.8), pose(b.pos, b.target, b.fov, 0.8), easeInOut(clamp01(t / 7)));
      }
      case 'entrance': {
        // the spot someone is walking to, and the way they come in
        const id = shot.id;
        const isStar = !!id && id === star;
        let pts: THREE.Vector3[];
        let az: number;
        if (isStar) {
          pts = [STAR.seat.clone().add(v(-1.9, 0, 1.0)), STAR.seat.clone().add(v(0.7, 0, 0.6)), STAR.seat.clone().add(v(-0.4, 1.75, -0.2))];
          az = 0.28;
        } else {
          const sp = id ? this.spotIndexOf(id) : 0;
          const base = spotPos(sp);
          // the spot in the middle third, the way in from the wing to its right
          pts = [base.clone().add(v(-1.3, 0, 0.5)), base.clone().add(v(1.9, 0, 0.5)), base.clone().add(v(0, 2.3, LAMP_OFFSET)), base.clone().add(v(1.4, 1.9, 0))];
          az = -0.22;
        }
        const a = this.fit(pts, az, 9 * DEG, 30, 0.84, -0.55, 0.62);
        return (t) => {
          const k = Math.min(t, 6);
          const fwd = a.target.clone().sub(a.pos).setY(0).normalize();
          return pose(a.pos.clone().addScaledVector(fwd, 0.06 * k), a.target.clone(), a.fov, 0.8);
        };
      }
      case 'closeup':
        return shot.id ? this.solveSingle(shot.id, 'close', 26, shot.cheat) : null;
      case 'medium':
        return shot.id ? this.solveSingle(shot.id, 'medium', 26, shot.cheat) : null;
      case 'starReaction':
        return star ? this.solveSingle(star, 'close', 30) : null;
      case 'starMedium':
        return star ? this.solveSingle(star, 'medium', 34) : null;
      case 'ots':
        return shot.id && shot.to ? this.solveOts(shot.id, shot.to) : null;
      case 'row': {
        const pts = this.rowPoints(false);
        if (pts.length < 3) return null;
        const a = this.fit(pts, -0.3, 6 * DEG, 30, 0.82, -0.5, 0.6);
        return (t) => {
          // a slow truck along the row
          const k = Math.min(t, 10);
          const fwd = a.target.clone().sub(a.pos).setY(0).normalize();
          const right = fwd.clone().cross(UP).normalize();
          return pose(a.pos.clone().addScaledVector(right, -0.045 * k), a.target.clone().addScaledVector(right, -0.03 * k), a.fov, 0.8);
        };
      }
      case 'cut': {
        // the light-out wide: all four spots, level and frontal, the dying lamp in plain view
        const pts = this.rowPoints(true);
        const a = this.fit(pts, -0.12, 12 * DEG, 32, 0.84, -0.48, 0.62);
        return (t) => {
          const k = Math.min(t, 8);
          const fwd = a.target.clone().sub(a.pos).normalize();
          return pose(a.pos.clone().addScaledVector(fwd, -0.05 * k), a.target.clone(), a.fov, 0.7);
        };
      }
      case 'pair': {
        const A = this.anchors(shot.id);
        const B = this.anchors(shot.to);
        if (!A || !B) return null;
        const pts = [A.head.clone().add(v(0, 0.08, 0)), B.head.clone().add(v(0, 0.08, 0)), A.face.clone().setY(A.face.y - 0.55 * A.h), B.face.clone().setY(B.face.y - 0.55 * B.h)];
        const sideBy = B.face.clone().sub(A.face).setY(0);
        const az = azOf(v(-sideBy.z, 0, sideBy.x)) ;
        const aud = Math.cos(az) > 0 ? az : az + Math.PI;
        const a = this.fit(pts, aud - 0.12, 4 * DEG, 30, 0.6, -0.42, 0.55);
        return (t) => {
          const fwd = a.target.clone().sub(a.pos).normalize();
          return pose(a.pos.clone().addScaledVector(fwd, 0.04 * Math.min(t, 8)), a.target.clone(), a.fov, 0.7);
        };
      }
      case 'twoShot': {
        const A = this.anchors(star);
        const B0 = this.anchors(shot.id);
        if (!A || !B0) return null;
        // the finalist may still be walking over: frame where they will stand, the date spot
        const B = { ...B0, face: DATE_SPOT.clone().setY(B0.face.y - B0.feet.y), head: DATE_SPOT.clone().setY(B0.head.y - B0.feet.y), feet: DATE_SPOT.clone() };
        const pts = [A.head.clone().add(v(0, 0.1, 0)), B.head.clone().add(v(0, 0.1, 0)), A.feet.clone().add(v(0, 0.25, 0)), B.face.clone().setY(B.feet.y + 0.35 * B.h)];
        const a = this.fit(pts, 0.08, 5 * DEG, 30, 0.56, -0.45, 0.5);
        const b = this.fit(pts, -0.06, 5 * DEG, 30, 0.54, -0.43, 0.5);
        // a slow arc across the pair
        return (t) => lerpPose(pose(a.pos, a.target, a.fov, 0.6), pose(b.pos, b.target, b.fov, 0.6), easeInOut(clamp01(t / 9)));
      }
      case 'booth': {
        // the confession: dead centre, frontal, eye level, tight, a hand-held breath. A longer
        // lens and a tighter frame than anything on the floor, so it reads as private at a glance.
        const id = shot.id;
        const A = this.anchors(id);
        const face0 = A?.face ?? BOOTH.seat.clone().setY(1.25);
        const head0 = A?.head ?? face0.clone().add(v(0, 0.35, 0));
        const h = A?.h ?? 1.5;
        const faceY = 0.24;
        const minFH = (2 * Math.max(0.12, head0.y - face0.y)) / (0.92 - faceY);
        const FH = Math.max(minFH, Math.min(1.05, Math.max(0.66, 0.32 * h + 0.34)));
        const variant = shot.variant ?? 0;
        const side = variant % 2 ? -1 : 1;
        const fov = Math.min(30, Math.max(14, (2 * Math.atan(FH / 2 / 2.2)) / DEG));
        const dist = FH / 2 / Math.tan((fov * DEG) / 2);
        const dir = azv(BOOTH.yaw + side * 0.12);
        const off = dir.clone().multiplyScalar(dist).add(v(0, 0.02, 0));
        const aimY = -(faceY * FH) / 2;
        const roll = side * 0.03;
        return (t) => {
          const sm = id ? this.smooth.get(id) : undefined;
          const face = sm ? sm.face : face0;
          const pos = face.clone().add(off);
          const target = face.clone().add(v(0, aimY, 0));
          const fwd = target.clone().sub(pos).normalize();
          return pose(pos.addScaledVector(fwd, 0.03 * Math.min(t, 8)), target, fov, 0.25, roll, 1);
        };
      }
      case 'boothWide': {
        const c = BOOTH.center;
        const a = pose(c.clone().add(v(1.25, 1.55, 2.15)), BOOTH.seat.clone().add(v(0, 0.75, -0.1)), 44, 0.3, 0, 0.8);
        const b = pose(c.clone().add(v(0.95, 1.4, 1.75)), BOOTH.seat.clone().add(v(0, 0.8, -0.1)), 40, 0.3, 0, 0.8);
        return (t) => lerpPose(a, b, easeInOut(clamp01(t / 4)));
      }
      case 'pickPush': {
        const wideR = star ? this.solveSingle(star, 'medium', 28) : null;
        const closeR = star ? this.solveSingle(star, 'tight', 28) : null;
        if (!wideR || !closeR) return null;
        const a0 = wideR(0), b0 = closeR(0);
        // keep one line of approach so it reads as a single push, not a zoom
        const dur = Math.max(2, (shot.ms ?? 5000) / 1000);
        return (t) => {
          const k = easeInOut(clamp01(t / dur));
          const p = lerpPose(a0, b0, k);
          p.drift = 0.35;
          return p;
        };
      }
      case 'cards': {
        // the star alone in her chair, a little wider than her medium: the card turns on the rail
        const pts = [STAR.seat.clone().add(v(-0.55, 1.6, -0.3)), STAR.seat.clone().add(v(0.55, 1.6, -0.3)), STAR.seat.clone().add(v(0, 0.3, 0.5))];
        const variant = shot.variant ?? 0;
        const a = this.fit(pts, variant % 2 ? 0.45 : 0.25, 6 * DEG, variant % 2 ? 26 : 30, 0.55, -0.55, 0.5);
        return (t) => {
          const fwd = a.target.clone().sub(a.pos).normalize();
          return pose(a.pos.clone().addScaledVector(fwd, 0.06 * Math.min(t, 8)), a.target.clone(), a.fov, 0.6);
        };
      }
      case 'result': {
        const A = this.anchors(star);
        const B = this.anchors(shot.id);
        const pts = [STAR.seat.clone().add(v(0, 1.55, 0)), STAR.seat.clone().add(v(0.3, 0.1, 0.6)), v(-1.6, 1.9, -0.55), v(-1.4, 0.1, -0.2)];
        if (A) pts.push(A.head.clone());
        if (B) pts.push(B.head.clone());
        const a = this.fit(pts, 0.12, 6 * DEG, 30, 0.66, -0.45, 0.55);
        const wide = this.solveRaw({ name: 'wide' })!(0);
        return (t) => lerpPose(pose(a.pos, a.target, a.fov, 0.6), wide, easeInOut(clamp01((t - 1.5) / 6)));
      }
    }
    void S;
    return null;
  }

  private spotIndexOf(id: string) {
    const f = this.subjects.feet?.(id);
    if (!f) return 0;
    let best = 0, bd = Infinity;
    SPOTS.forEach((p, i) => {
      const d = Math.hypot(p.x - f.x, p.z - f.z);
      if (d < bd) {
        bd = d;
        best = i;
      }
    });
    return best;
  }

  // -------------------------------------------------------------------------- per frame
  update(dt: number) {
    this.time += dt;
    this.shotT += dt;
    this.sinceCutT += dt;
    for (const id of this.rigIds()) this.follow(id, dt);
    this.resolveIfChanged();
    let want = this.rig(this.shotT);
    if (this.blend) {
      this.blend.t += dt;
      const k = easeInOut(clamp01(this.blend.t / this.blend.dur));
      want = lerpPose(this.blend.from, want, k);
      if (this.blend.t >= this.blend.dur) this.blend = null;
    }
    this.cur = want;
    this.apply(this.cur);
  }

  private apply(p: Pose) {
    const t = this.time;
    const c = this.camera;
    const dist = Math.max(1, p.pos.distanceTo(p.target));
    // slow drift, scaled to the shot so a close-up drifts centimetres and a wide decimetres
    const d = p.drift * Math.min(1.6, 0.35 + dist * 0.07);
    const w = p.wobble;
    c.position.set(
      p.pos.x + Math.sin(t * 0.23) * 0.05 * d + Math.sin(t * 1.3 + 0.4) * 0.006 * w,
      p.pos.y + Math.sin(t * 0.19 + 1) * 0.025 * d + Math.sin(t * 1.7) * 0.005 * w,
      p.pos.z + Math.cos(t * 0.15) * 0.04 * d,
    );
    this.up.set(Math.sin(p.roll + Math.sin(t * 0.9) * 0.004 * w), Math.cos(p.roll), 0);
    c.up.copy(this.up);
    c.lookAt(p.target.x + Math.sin(t * 0.13) * 0.02 * d, p.target.y + Math.sin(t * 1.1) * 0.004 * w, p.target.z);
    if (Math.abs(c.fov - p.fov) > 0.01) {
      c.fov = p.fov;
      c.updateProjectionMatrix();
    }
  }
}

/** where the star sits, for fallbacks */
export const STAR_FACE = STAR.seat.clone().add(v(0, 1.0, 0));
export const spotFace = (spot: number) => spotPos(spot).add(v(0, 1.3, 0));

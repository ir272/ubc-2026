// Character slots: the star and four suitors. Everything the director asks of a character goes
// through `Performer`, so a later loader (assets/cast/<id>/manifest.json -> rigged VRM or GLB) can
// replace the neutral mannequin without the director changing. Register it with `Cast.factory`.
import * as THREE from 'three';
import type { CastMember, DatingMeta, SuitorMember } from '../show/types.ts';
import { HEAD_TOP } from './layout.ts';
import { FALLBACK_ACCENTS, PALETTE, mix } from './theme.ts';
import { clamp01, damp, easeInOut, type Kit } from './toon.ts';

export type Gesture = 'lean' | 'shrug' | 'wince' | 'slump' | 'victory';
/** every gesture a model-backed performer knows (stage/vrm/puppet.ts); mannequins map them down */
export type ActGesture =
  | Gesture | 'nod' | 'recoil' | 'bow' | 'pump' | 'glare' | 'smirk' | 'exhale' | 'shuffle' | 'perk' | 'deflate'
  | 'tilt' | 'headshake' | 'flourish' | 'leanback' | 'hop' | 'point' | 'gulp';
export type ActPose = 'behind' | 'hips' | 'clasp' | 'fold' | 'booth' | 'proud' | 'slouch' | 'none';
const MANNEQUIN_GESTURE: Partial<Record<ActGesture, Gesture>> = {
  lean: 'lean', shrug: 'shrug', wince: 'wince', slump: 'slump', victory: 'victory', pump: 'victory', hop: 'victory',
  bow: 'lean', nod: 'lean', perk: 'lean', flourish: 'shrug', point: 'lean', recoil: 'wince', gulp: 'wince',
  deflate: 'slump', headshake: 'wince', shuffle: 'shrug', leanback: 'slump',
};
export type Mood = 'neutral' | 'happy' | 'angry' | 'sad' | 'relaxed';

/** assets/cast/<id>/manifest.json (written by the asset scout; paths relative to assets/) */
export interface CastManifest {
  id: string;
  model: string;
  format: 'vrm' | 'glb' | string;
  vrmVersion?: string;
  height?: number;
  scale?: number;
  expressions?: string[];
  clips?: string[];
  accent?: string;
  [k: string]: unknown;
}

export interface Performer {
  readonly id: string;
  readonly root: THREE.Object3D;
  /** walk on from `from` to `to` over ms, ending facing `yaw`; `sit` seats them on arrival */
  enter(from: THREE.Vector3, to: THREE.Vector3, yaw: number, ms: number, opts?: { sit?: boolean }): void;
  /** walk off toward `to` over ms, then hide */
  exit(to: THREE.Vector3, ms: number): void;
  /** walk somewhere on stage (one on one) */
  moveTo(to: THREE.Vector3, yaw: number, ms: number): void;
  /**
   * optional: walk along a polyline (path[0] = where they stand now) at one even pace over ms,
   * ending facing `end.yaw`; `sit` seats them on arrival, `hide` hides them (gone through a door)
   */
  walkPath?(path: THREE.Vector3[], ms: number, end: PathEnd): void;
  /** instant: stand (or sit) at pos, visible or not. Used by snapshot rebuilds and the booth. */
  place(pos: THREE.Vector3, yaw: number, opts?: { sit?: boolean; visible?: boolean }): void;
  /** talking for ms (mouth or bob) */
  speak(ms: number): void;
  /** look toward a world point (head, then a little of the body), or straight ahead */
  lookAt(target: THREE.Vector3 | null): void;
  gesture(name: Gesture): void;
  /** face preset where the model has one (no-op on mannequins) */
  mood(name: Mood): void;
  /** a held posture: slumped after a cut, or none */
  setPosture(p: 'slump' | null): void;
  /** lit: normal colour. Dark: the cut (colour drops in one frame). */
  setLit(on: boolean): void;
  /** world point just above the head: marks, name tags, camera framing */
  headAnchor(out?: THREE.Vector3): THREE.Vector3;
  /** world point at eye height: camera framing */
  faceAnchor(out?: THREE.Vector3): THREE.Vector3;
  readonly visible: boolean;
  readonly walking: boolean;
  update(dt: number, t: number): void;
  dispose(): void;
  /** optional: resolves when an async model is loaded and ready to be shown */
  ready?: Promise<void>;
}

export interface PerformerContext {
  kit: Kit;
  assetsBase: string;
  star: boolean;
}

export interface PathEnd {
  yaw: number;
  sit?: boolean;
  hide?: boolean;
}

/** cumulative lengths along a polyline (xz plane), first entry 0 */
export function pathLengths(path: THREE.Vector3[]): number[] {
  const cum = [0];
  for (let i = 1; i < path.length; i++) cum.push(cum[i - 1]! + Math.hypot(path[i]!.x - path[i - 1]!.x, path[i]!.z - path[i - 1]!.z));
  return cum;
}
/** the point at distance s along a polyline, and the heading (yaw) of the segment it is on */
export function pathAt(path: THREE.Vector3[], cum: number[], s: number, out: THREE.Vector3): number {
  const n = path.length;
  if (n === 1) {
    out.copy(path[0]!);
    return 0;
  }
  let i = 1;
  while (i < n - 1 && cum[i]! < s) i++;
  const a = path[i - 1]!, b = path[i]!;
  const len = Math.max(1e-6, cum[i]! - cum[i - 1]!);
  const k = Math.max(0, Math.min(1, (s - cum[i - 1]!) / len));
  out.lerpVectors(a, b, k);
  return Math.atan2(b.x - a.x, b.z - a.z);
}

type Walk = { from: THREE.Vector3; to: THREE.Vector3; t: number; dur: number; yaw: number; sit: boolean; hide: boolean; path?: THREE.Vector3[]; cum?: number[] };
type Gest = { name: Gesture; t: number; dur: number };

const GEST_DUR: Record<Gesture, number> = { lean: 1.4, shrug: 1.2, wince: 0.9, slump: 2.2, victory: 1.6 };

/** A neutral toy mannequin: capsule body, sphere head, stubby arms and legs, two dot eyes. */
export class Mannequin implements Performer {
  readonly id: string;
  readonly root = new THREE.Group();
  private hop = new THREE.Group();
  private turn = new THREE.Group();
  private lean = new THREE.Group();
  private neck = new THREE.Group();
  private armL = new THREE.Group();
  private armR = new THREE.Group();
  private legL = new THREE.Group();
  private legR = new THREE.Group();
  private eyes: THREE.Mesh[] = [];
  private bodyMat: THREE.MeshToonMaterial;
  private headMat: THREE.MeshToonMaterial;
  private litColor: { body: THREE.Color; head: THREE.Color };
  private darkColor: { body: THREE.Color; head: THREE.Color };
  private walk: Walk | null = null;
  private gest: Gest | null = null;
  private posture: 'slump' | null = null;
  private slumpAmt = 0;
  sitting = false;
  private speakLeft = 0;
  private look: THREE.Vector3 | null = null;
  private headYaw = 0;
  private headPitch = 0;
  private torsoYaw = 0;
  private phase = Math.random() * 10;
  private blinkIn = 2 + Math.random() * 3;
  private stepPhase = 0;
  private tmp = new THREE.Vector3();

  constructor(kit: Kit, member: CastMember, opts: { star: boolean }) {
    this.id = member.id;
    this.root.name = `performer:${member.id}`;
    const accent = member.accent || FALLBACK_ACCENTS[0]!;
    this.litColor = { body: new THREE.Color(accent), head: new THREE.Color(mix(accent, PALETTE.milk, 0.45)) };
    this.darkColor = {
      body: new THREE.Color(mix(accent, PALETTE.night, 0.72)),
      head: new THREE.Color(mix(mix(accent, PALETTE.milk, 0.45), PALETTE.night, 0.72)),
    };
    this.bodyMat = kit.toon(accent);
    this.headMat = kit.toon(mix(accent, PALETTE.milk, 0.45));
    const limbMat = this.bodyMat;
    const eyeMat = kit.flat(PALETTE.ink);

    const scale = opts.star ? 1.04 : 1;
    this.root.add(this.hop);
    this.hop.add(this.turn);
    // legs (do not lean)
    const legGeo = kit.geo(new THREE.CapsuleGeometry(0.075, 0.12, 4, 10));
    for (const [leg, x] of [[this.legL, 0.11], [this.legR, -0.11]] as const) {
      leg.position.set(x, 0.24, 0);
      const m = new THREE.Mesh(legGeo, limbMat);
      m.position.y = -0.13;
      kit.outline(m, 0.018);
      leg.add(m);
      this.turn.add(leg);
    }
    this.lean.position.y = 0.2;
    this.turn.add(this.lean);
    const body = new THREE.Mesh(kit.geo(new THREE.CapsuleGeometry(0.27, 0.42, 6, 20)), this.bodyMat);
    body.position.y = 0.41;
    kit.outline(body, 0.022);
    this.lean.add(body);
    const armGeo = kit.geo(new THREE.CapsuleGeometry(0.065, 0.3, 4, 10));
    for (const [arm, x] of [[this.armL, 0.31], [this.armR, -0.31]] as const) {
      arm.position.set(x, 0.66, 0);
      const m = new THREE.Mesh(armGeo, limbMat);
      m.position.y = -0.2;
      kit.outline(m, 0.018);
      arm.add(m);
      arm.rotation.z = x > 0 ? 0.12 : -0.12;
      this.lean.add(arm);
    }
    this.neck.position.y = 0.86;
    this.lean.add(this.neck);
    const head = new THREE.Mesh(kit.geo(new THREE.SphereGeometry(0.27, 24, 16)), this.headMat);
    head.position.y = 0.22;
    kit.outline(head, 0.022);
    this.neck.add(head);
    const eyeGeo = kit.geo(new THREE.CapsuleGeometry(0.028, 0.05, 3, 8));
    for (const x of [0.09, -0.09]) {
      const e = new THREE.Mesh(eyeGeo, eyeMat);
      e.position.set(x, 0.25, 0.25);
      e.rotation.x = -0.15;
      this.neck.add(e);
      this.eyes.push(e);
    }
    this.root.scale.setScalar(scale);
    this.root.visible = false;
  }

  get visible() {
    return this.root.visible;
  }
  get walking() {
    return !!this.walk;
  }

  enter(from: THREE.Vector3, to: THREE.Vector3, yaw: number, ms: number, opts: { sit?: boolean } = {}) {
    this.sitting = false;
    this.root.visible = true;
    this.root.position.copy(from);
    this.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    this.walk = { from: from.clone(), to: to.clone(), t: 0, dur: Math.max(0.3, ms / 1000), yaw, sit: !!opts.sit, hide: false };
  }

  exit(to: THREE.Vector3, ms: number) {
    if (!this.root.visible) return;
    this.sitting = false;
    this.walk = { from: this.root.position.clone(), to: to.clone(), t: 0, dur: Math.max(0.3, ms / 1000), yaw: this.root.rotation.y, sit: false, hide: true };
  }

  moveTo(to: THREE.Vector3, yaw: number, ms: number) {
    this.root.visible = true;
    this.sitting = false;
    this.walk = { from: this.root.position.clone(), to: to.clone(), t: 0, dur: Math.max(0.3, ms / 1000), yaw, sit: false, hide: false };
  }

  walkPath(path: THREE.Vector3[], ms: number, end: PathEnd) {
    if (path.length < 2) return this.moveTo(path[0] ?? this.root.position, end.yaw, ms);
    this.root.visible = true;
    this.sitting = false;
    this.root.position.copy(path[0]!);
    const p = path.map((x) => x.clone());
    this.walk = { from: p[0]!, to: p[p.length - 1]!, t: 0, dur: Math.max(0.3, ms / 1000), yaw: end.yaw, sit: !!end.sit, hide: !!end.hide, path: p, cum: pathLengths(p) };
  }

  place(pos: THREE.Vector3, yaw: number, opts: { sit?: boolean; visible?: boolean } = {}) {
    this.walk = null;
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;
    this.sitting = !!opts.sit;
    this.root.visible = opts.visible ?? true;
  }

  speak(ms: number) {
    this.speakLeft = Math.max(this.speakLeft, ms / 1000);
  }

  lookAt(target: THREE.Vector3 | null) {
    this.look = target ? target.clone() : null;
  }

  gesture(name: Gesture) {
    this.gest = { name, t: 0, dur: GEST_DUR[name] };
  }

  setPosture(p: 'slump' | null) {
    this.posture = p;
  }

  mood(_name: Mood) {
    /* mannequins have no face */
  }

  setLit(on: boolean) {
    const c = on ? this.litColor : this.darkColor;
    this.bodyMat.color.copy(c.body);
    this.headMat.color.copy(c.head);
  }

  headAnchor(out = new THREE.Vector3()) {
    this.root.updateWorldMatrix(true, true);
    return this.neck.localToWorld(out.set(0, 0.62, 0));
  }

  faceAnchor(out = new THREE.Vector3()) {
    this.root.updateWorldMatrix(true, true);
    return this.neck.localToWorld(out.set(0, 0.24, 0));
  }

  update(dt: number, t: number) {
    if (!this.root.visible && !this.walk) return;
    this.phase += dt;
    let hopY = 0, swayZ = 0, leanX = 0, stride = 0;

    // walking: eased position, waddle, face the way you go, then turn to the mark
    if (this.walk) {
      const w = this.walk;
      w.t = Math.min(w.dur, w.t + dt);
      const p = w.t / w.dur;
      const e = easeInOut(p);
      let dx = w.to.x - w.from.x, dz = w.to.z - w.from.z;
      let segYaw = Math.atan2(dx, dz);
      if (w.path && w.cum) {
        segYaw = pathAt(w.path, w.cum, e * w.cum[w.cum.length - 1]!, this.root.position);
      } else this.root.position.lerpVectors(w.from, w.to, e);
      if (w.path) dx = dz = 1;
      const moving = p < 0.92 && dx * dx + dz * dz > 0.01;
      const heading = moving ? segYaw : w.yaw;
      this.root.rotation.y = damp(this.root.rotation.y, nearestAngle(this.root.rotation.y, heading), moving ? 10 : 7, dt);
      if (moving) {
        this.stepPhase += dt * 11;
        stride = Math.sin(this.stepPhase);
        hopY = Math.abs(Math.sin(this.stepPhase)) * 0.05;
        swayZ = Math.sin(this.stepPhase) * 0.07;
        leanX = 0.08;
      }
      if (p >= 1) {
        this.root.rotation.y = w.yaw;
        this.sitting = w.sit;
        if (w.hide) this.root.visible = false;
        this.walk = null;
      }
    }

    // seated: drop onto the chair, legs forward
    const sitY = this.sitting ? 0.2 : 0;
    this.legL.rotation.x = this.sitting ? -1.35 : stride * 0.5;
    this.legR.rotation.x = this.sitting ? -1.35 : -stride * 0.5;

    // breathing
    const breath = Math.sin(this.phase * 1.7) * 0.012;
    let squashY = 1 + breath, squashXZ = 1 - breath * 0.5;

    // talking: a small bob in time with syllables
    let talkPitch = 0;
    if (this.speakLeft > 0) {
      this.speakLeft -= dt;
      const s = Math.max(0, Math.sin(this.phase * 13));
      talkPitch = -s * 0.07;
      squashY += s * 0.025;
      hopY += s * 0.012;
    }

    // gestures: short procedural moves on an envelope
    let armLz = 0.12, armRz = -0.12, armLx = stride * 0.4, armRx = -stride * 0.4, neckRoll = 0, extraYaw = 0, eyeSquint = 1, spin = 0;
    if (this.gest) {
      const gs = this.gest;
      gs.t += dt;
      const p = clamp01(gs.t / gs.dur);
      const env = Math.sin(Math.PI * Math.min(1, p * 1.15));
      switch (gs.name) {
        case 'lean':
          leanX += 0.3 * env;
          talkPitch -= 0.08 * env;
          break;
        case 'shrug':
          armLz += 0.75 * env;
          armRz -= 0.75 * env;
          neckRoll = 0.22 * env;
          hopY += 0.02 * env;
          break;
        case 'wince':
          leanX -= 0.22 * env;
          squashY -= 0.07 * env;
          squashXZ += 0.05 * env;
          extraYaw = Math.sin(gs.t * 38) * 0.06 * env - 0.35 * env;
          eyeSquint = 1 - 0.8 * env;
          break;
        case 'slump':
          this.slumpAmt = Math.max(this.slumpAmt, env);
          break;
        case 'victory':
          hopY += Math.abs(Math.sin(p * Math.PI * 2)) * 0.22 * (1 - p * 0.5);
          armRz -= 2.5 * env;
          armLz += 0.4 * env;
          spin = p < 0.6 ? 0 : Math.sin((p - 0.6) / 0.4 * Math.PI) * 0.4;
          break;
      }
      if (gs.t >= gs.dur) this.gest = null;
    }
    const slumpTarget = this.posture === 'slump' ? 1 : this.gest?.name === 'slump' ? this.slumpAmt : 0;
    this.slumpAmt = damp(this.slumpAmt, slumpTarget, 4, dt);
    leanX += this.slumpAmt * 0.32;
    talkPitch += this.slumpAmt * 0.38;
    armLx -= this.slumpAmt * 0.25;
    armRx -= this.slumpAmt * 0.25;
    hopY -= this.slumpAmt * 0.04;

    // look-at: mostly the head, a little of the torso
    let wantYaw = 0, wantPitch = 0;
    if (this.look) {
      this.root.updateWorldMatrix(true, false);
      const local = this.root.worldToLocal(this.tmp.copy(this.look));
      local.y -= HEAD_TOP - 0.3;
      wantYaw = Math.max(-1.6, Math.min(1.6, Math.atan2(local.x, local.z)));
      const flat = Math.hypot(local.x, local.z);
      wantPitch = Math.max(-0.3, Math.min(0.3, -Math.atan2(local.y, flat)));
    }
    this.torsoYaw = damp(this.torsoYaw, wantYaw * 0.22, 4, dt);
    this.headYaw = damp(this.headYaw, wantYaw * 0.6, 7, dt);
    this.headPitch = damp(this.headPitch, wantPitch, 6, dt);

    // blink
    this.blinkIn -= dt;
    let eyeY = eyeSquint;
    if (this.blinkIn < 0) {
      eyeY = Math.min(eyeY, 0.12);
      if (this.blinkIn < -0.12) this.blinkIn = 2.5 + Math.random() * 3.5;
    }
    for (const e of this.eyes) e.scale.y = eyeY;

    this.hop.position.y = hopY + sitY;
    this.turn.rotation.y = this.torsoYaw + spin * Math.PI * 2;
    this.lean.rotation.set(leanX * (this.sitting ? 0.5 : 1) - (this.sitting ? 0.12 : 0), 0, swayZ);
    this.lean.scale.set(squashXZ, squashY, squashXZ);
    this.neck.rotation.set(this.headPitch + talkPitch, this.headYaw + extraYaw, neckRoll);
    this.armL.rotation.set(armLx, 0, armLz);
    this.armR.rotation.set(armRx, 0, armRz);
    void t;
  }

  dispose() {
    this.root.removeFromParent();
  }
}

function nearestAngle(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}

/**
 * THE seam for real characters. Called once with `manifest = null` (must return a performer: the
 * mannequin stand-in), then again when assets/cast/<cast>/manifest.json has loaded. Return a
 * model-backed Performer (with `ready`) to replace the stand-in, or null to keep it.
 * The VRM builder plugs in here, e.g. `if (manifest?.format === 'vrm') return new VrmPerformer(...)`.
 */
export let createPerformer = (member: CastMember, manifest: CastManifest | null, ctx: PerformerContext): Performer | null =>
  manifest ? null : new Mannequin(ctx.kit, member, { star: ctx.star });

/** Lets a module (e.g. stage/vrm) install its factory without editing this file. */
export function setPerformerFactory(f: typeof createPerformer) {
  createPerformer = f;
}

/**
 * Forwards every call to the current performer and remembers the lasting state (placement, lit,
 * posture, mood, look) so a loaded model can replace the stand-in mid-show without the director
 * noticing.
 */
export class PerformerSlot implements Performer {
  readonly id: string;
  readonly root = new THREE.Group();
  private inner: Performer;
  private lit = true;
  private posture: 'slump' | null = null;
  private moodName: Mood = 'neutral';
  private look: THREE.Vector3 | null = null;
  private dead = false;
  /**
   * Set once stage/acting.ts directs this character: from then on the director's own looks,
   * gestures, moods and postures are ignored (acting decides them for everyone, every event), and
   * only placement, walking, speaking and the lamp come from the director.
   */
  puppeted = false;
  /** the text of the next line, so the mouth can shape its syllables (set by acting before the director speaks) */
  nextText: string | undefined;
  private pose: ActPose = 'none';
  private freeze = 0;
  private idleClip: string | null = null;
  private confidence = 0;
  /** the hangout: a yaw to turn to on the spot while standing (null: hold whatever yaw they have) */
  faceYaw: number | null = null;
  /** the hangout: cut and on the way out (acting slumps them) without the studio's dark colour */
  out = false;

  constructor(first: Performer) {
    this.id = first.id;
    this.inner = first;
    this.root.add(first.root);
  }

  /** swap in a new performer, carrying over where it stands and how it looks */
  swap(next: Performer) {
    if (this.dead) {
      next.dispose();
      return;
    }
    const old = this.inner;
    const pos = old.root.position.clone();
    const yaw = old.root.rotation.y;
    const visible = old.visible;
    next.place(pos, yaw, { visible, sit: (old as { sitting?: boolean }).sitting });
    next.setLit(this.lit);
    next.setPosture(this.posture);
    next.mood(this.moodName);
    next.lookAt(this.look);
    this.root.add(next.root);
    old.dispose();
    this.inner = next;
    const x = next as Partial<ActingBody>;
    x.setPose?.(this.pose);
    x.setFreeze?.(this.freeze);
    x.setIdleClip?.(this.idleClip);
    x.setConfidence?.(this.confidence);
  }

  get visible() { return this.inner.visible; }
  get walking() { return this.inner.walking; }
  /** where acting last told them to look (the camera frames faces from it) */
  get lookTarget(): THREE.Vector3 | null { return this.look ? this.look.clone() : null; }
  get isLit() { return this.lit; }
  /** still in the game for acting: lit and not cut */
  get inPlay() { return this.lit && !this.out; }
  /** where the body stands (the performer's own root, not this wrapper) */
  get pos(): THREE.Vector3 { return this.inner.root.position; }
  /** the yaw the body faces */
  get yaw(): number { return this.inner.root.rotation.y; }
  get sitting() { return !!(this.inner as { sitting?: boolean }).sitting; }
  /** a model has replaced the stand-in */
  get loaded() { return !(this.inner instanceof Mannequin); }
  enter(from: THREE.Vector3, to: THREE.Vector3, yaw: number, ms: number, opts?: { sit?: boolean }) { this.inner.enter(from, to, yaw, ms, opts); }
  exit(to: THREE.Vector3, ms: number) { this.inner.exit(to, ms); }
  moveTo(to: THREE.Vector3, yaw: number, ms: number) { this.inner.moveTo(to, yaw, ms); }
  walkPath(path: THREE.Vector3[], ms: number, end: PathEnd) {
    if (this.inner.walkPath) return this.inner.walkPath(path, ms, end);
    // a performer without paths: straight to the last point
    const to = path[path.length - 1]!;
    if (end.hide) this.inner.exit(to, ms);
    else if (end.sit) this.inner.enter(this.inner.root.position.clone(), to, end.yaw, ms, { sit: true });
    else this.inner.moveTo(to, end.yaw, ms);
  }
  place(pos: THREE.Vector3, yaw: number, opts?: { sit?: boolean; visible?: boolean }) { this.inner.place(pos, yaw, opts); }
  speak(ms: number) {
    const text = this.nextText;
    this.nextText = undefined;
    (this.inner as { speak(ms: number, text?: string): void }).speak(ms, text);
  }
  lookAt(target: THREE.Vector3 | null) { if (!this.puppeted) this.actLook(target); }
  gesture(name: Gesture) { if (!this.puppeted) this.actGesture(name); }
  mood(name: Mood) { if (!this.puppeted) this.actMood(name); }
  setPosture(p: 'slump' | null) { if (!this.puppeted) this.actPosture(p); }
  setLit(on: boolean) { this.lit = on; this.inner.setLit(on); }
  headAnchor(out?: THREE.Vector3) { return this.inner.headAnchor(out); }
  faceAnchor(out?: THREE.Vector3) { return this.inner.faceAnchor(out); }
  update(dt: number, t: number) {
    // the hangout: turning on the spot to face someone (no steps: an avatar rotating in place)
    if (this.faceYaw !== null && !this.inner.walking && !this.sitting && this.inner.visible) {
      const r = this.inner.root.rotation;
      const want = nearestAngle(r.y, this.faceYaw);
      r.y = want + (r.y - want) * Math.exp(-5.5 * dt);
    }
    this.inner.update(dt, t);
  }
  dispose() {
    this.dead = true;
    this.inner.dispose();
    this.root.removeFromParent();
  }

  // ---- the acting channel (stage/acting.ts) ---------------------------------------------
  actLook(target: THREE.Vector3 | null) {
    if (target) (this.look ??= new THREE.Vector3()).copy(target);
    else this.look = null;
    this.inner.lookAt(target);
  }
  /** `beat`: seconds of held stillness before it lands */
  actGesture(name: ActGesture, beat?: number) {
    if (this.inner instanceof Mannequin) {
      const g = MANNEQUIN_GESTURE[name];
      if (g) this.inner.gesture(g);
      return;
    }
    (this.inner as unknown as ActingBody).gesture(name, beat);
  }
  actMood(name: Mood) { this.moodName = name; this.inner.mood(name); }
  actPosture(p: 'slump' | null) { if (p === this.posture) return; this.posture = p; this.inner.setPosture(p); }
  actPose(p: ActPose) {
    if (p === this.pose) return;
    this.pose = p;
    (this.inner as Partial<ActingBody>).setPose?.(p);
  }
  actFreeze(x: number) {
    if (Math.abs(x - this.freeze) < 1e-3) return;
    this.freeze = x;
    (this.inner as Partial<ActingBody>).setFreeze?.(x);
  }
  actIdle(clip: string | null) {
    if (clip === this.idleClip) return;
    this.idleClip = clip;
    (this.inner as Partial<ActingBody>).setIdleClip?.(clip);
  }
  /** how the night is going for them, -1..1: chest out and chin up, or shrinking (the ranking reads on the body) */
  actConfidence(x: number) {
    if (Math.abs(x - this.confidence) < 1e-3) return;
    this.confidence = x;
    (this.inner as Partial<ActingBody>).setConfidence?.(x);
  }
  hasClip(name: string) { return !!(this.inner as Partial<ActingBody>).hasClip?.(name); }
  blink() { (this.inner as Partial<ActingBody>).blink?.(); }
}

/** what a model-backed performer offers acting beyond the Performer interface */
interface ActingBody {
  gesture(name: ActGesture, beat?: number): void;
  setPose(p: ActPose): void;
  setFreeze(x: number): void;
  setIdleClip(clip: string | null): void;
  setConfidence(x: number): void;
  hasClip(name: string): boolean;
  blink(): void;
}

/** The cast on stage for one episode. */
export class Cast {
  readonly group = new THREE.Group();
  private kit: Kit;
  private assetsBase: string;
  private performers = new Map<string, PerformerSlot>();
  private generation = 0;
  meta: DatingMeta | null = null;
  /** stage/acting.ts installs itself here on the first event; ticked before the performers */
  acting: { update(dt: number): void } | null = null;

  constructor(kit: Kit, scene: THREE.Scene, assetsBase: string) {
    this.kit = kit;
    this.assetsBase = assetsBase;
    this.group.name = 'cast';
    scene.add(this.group);
  }

  /** replace the cast (new episode). Performers start hidden; the director places them. */
  build(meta: DatingMeta) {
    this.clear();
    this.meta = meta;
    const gen = ++this.generation;
    const make = (m: CastMember, star: boolean) => {
      const ctx: PerformerContext = { kit: this.kit, assetsBase: this.assetsBase, star };
      const first = createPerformer(m, null, ctx) ?? new Mannequin(this.kit, m, { star });
      const slot = new PerformerSlot(first);
      this.performers.set(m.id, slot);
      this.group.add(slot.root);
      if (!m.cast) return;
      fetch(`${this.assetsBase}cast/${m.cast}/manifest.json`)
        .then((r) => (r.ok ? (r.json() as Promise<CastManifest>) : null))
        .then(async (manifest) => {
          if (!manifest || gen !== this.generation) return;
          const next = createPerformer(m, manifest, ctx);
          if (!next) return;
          try {
            await next.ready;
          } catch {
            next.dispose();
            return;
          }
          if (gen !== this.generation) return next.dispose();
          slot.swap(next);
        })
        .catch(() => {
          /* no manifest: the mannequin stays */
        });
    };
    make(meta.star, true);
    meta.suitors.forEach((s, i) => make({ ...s, accent: s.accent || FALLBACK_ACCENTS[i % FALLBACK_ACCENTS.length]! }, false));
  }

  clear() {
    this.generation++;
    for (const p of this.performers.values()) p.dispose();
    this.performers.clear();
    this.meta = null;
  }

  get(id: string | null | undefined): Performer | undefined {
    return id ? this.performers.get(id) : undefined;
  }

  get star(): Performer | undefined {
    return this.meta ? this.performers.get(this.meta.star.id) : undefined;
  }

  member(id: string): CastMember | SuitorMember | undefined {
    if (!this.meta) return undefined;
    if (this.meta.star.id === id) return this.meta.star;
    return this.meta.suitors.find((s) => s.id === id);
  }

  suitor(id: string): SuitorMember | undefined {
    return this.meta?.suitors.find((s) => s.id === id);
  }

  bySpot(): SuitorMember[] {
    return this.meta ? [...this.meta.suitors].sort((a, b) => a.spot - b.spot) : [];
  }

  all(): Performer[] {
    return [...this.performers.values()];
  }

  /** the slots themselves (stage/acting.ts) */
  slots(): PerformerSlot[] {
    return [...this.performers.values()];
  }

  slot(id: string | null | undefined): PerformerSlot | undefined {
    return id ? this.performers.get(id) : undefined;
  }

  update(dt: number, t: number) {
    this.acting?.update(dt);
    for (const p of this.performers.values()) p.update(dt, t);
  }

  dispose() {
    this.clear();
    this.group.removeFromParent();
  }
}

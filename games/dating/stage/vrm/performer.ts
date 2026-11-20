// VrmPerformer: one imported VRM cast member, driven through the stage's `Performer` interface.
//
//   root (feet on the floor, yaw)            <- the stage places and turns this
//     hover (float height, locomotion hops)
//       body (the puppet's whole-body pivot: lean, hop, squash)
//         actor.object (manifest scale) > vrm.scene
//
// Per frame: locomotion, then reset the normalized pose, the animation mixer (retargeted
// Quaternius clips), the puppet's additive acting layer, then vrm.update (springs, faces).
import * as THREE from 'three';
import { Mannequin, createPerformer, pathAt, pathLengths, setPerformerFactory, type CastManifest, type Gesture, type Mood, type PathEnd, type Performer, type PerformerContext } from '../cast.ts';
import { loadVrm, type VrmActor, type VrmManifest } from './loader.ts';
import { GESTURE_DEFS, Puppet, type GestureName, type MoodName, type PoseName } from './puppet.ts';
import { SHOW_CLIPS, loadClip, measureWalkSpeed } from './retarget.ts';

type Member = { id: string; accent?: string };
type Opts = { assetsBase: string; star?: boolean; rng?: () => number };

type Move = {
  from: THREE.Vector3;
  to: THREE.Vector3;
  yaw: number;
  t: number;
  dur: number;
  sit: boolean;
  hide: boolean;
  dist: number;
  /** a polyline walk (path[0] = from), with cumulative lengths */
  path?: THREE.Vector3[];
  cum?: number[];
};

const FADE = 0.28;
/** the stage's chair: cushion top above the seat point, and where the hips should land (z) */
export const SEAT_TOP = 0.36;
const SEAT_HIPS_Z = -0.12;
const ACCEL = 0.3; // seconds to reach walking speed (and to stop)

function nearestAngle(from: number, to: number) {
  let d = (to - from) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return from + d;
}
const damp = (a: number, b: number, rate: number, dt: number) => b + (a - b) * Math.exp(-rate * dt);

export class VrmPerformer implements Performer {
  readonly id: string;
  readonly root = new THREE.Group();
  readonly ready: Promise<void>;
  sitting = false;

  private hover = new THREE.Group();
  private body = new THREE.Group();
  private manifest: VrmManifest;
  private opts: Opts;
  private actor: VrmActor | null = null;
  private puppet: Puppet | null = null;
  private mixer: THREE.AnimationMixer | null = null;
  private actions = new Map<string, THREE.AnimationAction>();
  private current: THREE.AnimationAction | null = null;
  private currentName = '';
  private walkSpeed = new Map<string, number>(); // metres per second at timeScale 1 (scaled)
  private move: Move | null = null;
  private sitPhase: 'none' | 'enter' | 'seated' = 'none';
  private sitEnterLeft = 0;
  private talkLeft = 0;
  private lit = true;
  private posture: 'slump' | null = null;
  private moodName: MoodName = 'neutral';
  private look: THREE.Vector3 | null = null;
  private hopPhase = 0;
  private floatPhase = 0;
  private stepPhase = 0;
  private idleOverride: string | null = null;
  private poseName: PoseName = 'none';
  private freezeAmt = 0;
  private confidence = 0;
  private disposed = false;
  private tmp = new THREE.Vector3();

  constructor(member: Member, manifest: VrmManifest, opts: Opts) {
    this.id = member.id;
    this.manifest = manifest;
    this.opts = opts;
    this.root.name = `performer:${member.id}`;
    this.root.add(this.hover);
    this.hover.add(this.body);
    this.root.visible = false;
    this.ready = this.load();
  }

  private async load() {
    const actor = await loadVrm(this.manifest, this.opts.assetsBase);
    if (this.disposed) {
      actor.dispose();
      throw new Error('disposed');
    }
    this.actor = actor;
    this.body.add(actor.object);
    this.puppet = new Puppet(actor, this.body, this.opts.rng);
    this.mixer = new THREE.AnimationMixer(actor.vrm.scene);
    const wanted = new Set<string>(SHOW_CLIPS);
    const st = actor.style;
    for (const n of [st.idle, st.talk, st.walk]) if (n && n !== 'none' && n !== 'hop' && n !== 'float') wanted.add(n);
    const names = [...wanted].filter((n) => !actor.allow || actor.allow.has(n));
    const clips = await Promise.all(names.map((n) => loadClip(actor.vrm, this.manifest.model, n, this.opts.assetsBase).catch(() => null)));
    if (this.disposed) {
      actor.dispose();
      throw new Error('disposed');
    }
    this.computeSeat(actor, clips.find((c) => c?.name === 'Sitting_Idle_Loop') ?? null);
    clips.forEach((c, i) => {
      if (!c) return;
      const a = this.mixer!.clipAction(c);
      if (!/_Loop$/.test(c.name)) {
        a.setLoop(THREE.LoopOnce, 1);
        a.clampWhenFinished = true;
      }
      this.actions.set(names[i]!, a);
    });
    for (const w of ['Walk_Loop', 'Walk_Formal_Loop']) {
      const a = this.actions.get(w);
      if (a) this.walkSpeed.set(w, measureWalkSpeed(actor.vrm, a.getClip()) * actor.scale);
    }
    actor.setLit(this.lit);
    this.puppet.mood(this.moodName);
    this.puppet.lookAt(this.look);
    this.puppet.setSlump(this.posture === 'slump');
    this.puppet.setPose(this.poseName);
    this.puppet.setFreeze(this.freezeAmt);
    this.puppet.setConfidence(this.confidence);
    this.settleClip(0);
    this.update(0, 0);
  }

  /**
   * Where the body goes when seated. The stage's chair is centred on the seat point, cushion top
   * SEAT_TOP above it; the sitting clip puts the hips behind the feet, so move the whole model
   * forward and up until the hips sit on the cushion. Manifest `seatOffset` fine-tunes it.
   */
  private seatShift = new THREE.Vector3();
  private computeSeat(a: VrmActor, sitClip: THREE.AnimationClip | null) {
    const hipsTrack = sitClip?.tracks.find((t) => t.name.endsWith('.position'));
    const so = this.manifest.seatOffset ?? {};
    if (!hipsTrack) return this.seatShift.set(0, so.y ?? 0, so.z ?? 0);
    const flip = a.vrm.meta?.metaVersion === '0' ? -1 : 1;
    const hy = hipsTrack.values[1]! * a.scale;
    const hz = hipsTrack.values[2]! * flip * a.scale; // character frame, + forward
    const butt = 0.13 * a.scale * (a.hipsHeight / 0.9);
    this.seatShift.set(0, SEAT_TOP + butt - hy + (so.y ?? 0), SEAT_HIPS_Z - hz + (so.z ?? 0));
  }

  // ---- clips ------------------------------------------------------------------------------
  private has(name: string) {
    return this.actions.has(name);
  }

  private play(name: string | null, fade = FADE) {
    if ((name ?? '') === this.currentName) return;
    const next = name ? this.actions.get(name) ?? null : null;
    const prev = this.current;
    if (next && next === prev) {
      next.enabled = true;
      next.setEffectiveWeight(1);
      if (!next.isRunning()) next.play();
      this.currentName = name!;
      return;
    }
    if (next) {
      next.reset();
      // loops start at a random phase, so a row of characters never breathes in unison
      if (next.loop === THREE.LoopRepeat) next.time = (this.opts.rng ?? Math.random)() * next.getClip().duration;
      next.enabled = true;
      next.setEffectiveTimeScale(1);
      next.setEffectiveWeight(1);
      next.play();
      if (prev && fade > 0) prev.crossFadeTo(next, fade, false);
      else if (prev) prev.stop();
    } else if (prev) {
      if (fade > 0) prev.fadeOut(fade);
      else prev.stop();
    }
    this.current = next;
    this.currentName = next ? name! : '';
  }

  private walkClip(): string | null {
    const w = this.actor?.style.walk ?? 'Walk_Loop';
    if (this.manifest.floats || w === 'float' || w === 'hop') return null;
    return this.has(w) ? w : this.has('Walk_Loop') ? 'Walk_Loop' : null;
  }

  private locoKind(): 'clip' | 'hop' | 'float' {
    const w = this.actor?.style.walk ?? 'Walk_Loop';
    if (this.manifest.floats || w === 'float') return 'float';
    if (w === 'hop' || !this.walkClip()) return 'hop';
    return 'clip';
  }

  /** lab and debugging: hold one clip regardless of state (null releases it) */
  forceClip(name: string | null) {
    this.forced = name;
    this.currentName = '__';
    this.settleClip(0);
  }
  private forced: string | null = null;

  /** clips this body can play (after the manifest's allow list) */
  get clipNames() {
    return [...this.actions.keys()];
  }

  /** which looping clip the body should be in right now */
  private settleClip(fade = FADE) {
    if (!this.actor) return;
    if (this.forced) return this.play(this.has(this.forced) ? this.forced : null, fade);
    const st = this.actor.style;
    if (this.move && this.locoKind() === 'clip') return this.play(this.walkClip(), fade);
    if (this.sitting) {
      if (this.sitPhase === 'enter') return;
      const talk = this.talkLeft > 0 && this.has('Sitting_Talking_Loop');
      return this.play(talk ? 'Sitting_Talking_Loop' : this.has('Sitting_Idle_Loop') ? 'Sitting_Idle_Loop' : null, fade);
    }
    // a folded-arms stance keeps its clip while talking (the talk clip would unfold the arms)
    const idle = this.idleOverride && this.has(this.idleOverride) ? this.idleOverride : st.idle;
    if (this.talkLeft > 0 && !this.idleOverride && st.talk !== 'none' && this.has(st.talk)) return this.play(st.talk, fade);
    if (idle !== 'none' && this.has(idle)) return this.play(idle, fade);
    this.play(null, fade);
  }

  // ---- Performer --------------------------------------------------------------------------
  get visible() {
    return this.root.visible;
  }
  get walking() {
    return !!this.move;
  }

  private startMove(from: THREE.Vector3, to: THREE.Vector3, yaw: number, ms: number, sit: boolean, hide: boolean, path?: THREE.Vector3[]) {
    const cum = path ? pathLengths(path) : undefined;
    const dist = cum ? cum[cum.length - 1]! : Math.hypot(to.x - from.x, to.z - from.z);
    this.move = { from: from.clone(), to: to.clone(), yaw, t: 0, dur: Math.max(0.3, ms / 1000), sit, hide, dist, path, cum };
    this.sitting = false;
    this.sitPhase = 'none';
    this.hopPhase = 0;
    // a short step keeps the body's facing (a shuffle, not a turn and walk)
    if (dist > 0.6 && !path) this.root.rotation.y = Math.atan2(to.x - from.x, to.z - from.z);
    this.settleClip(0.2);
  }

  walkPath(path: THREE.Vector3[], ms: number, end: PathEnd) {
    if (path.length < 2) return this.moveTo(path[0] ?? this.root.position, end.yaw, ms);
    this.root.visible = true;
    const p = path.map((x) => x.clone());
    this.root.position.copy(p[0]!);
    this.startMove(p[0]!, p[p.length - 1]!, end.yaw, ms, !!end.sit, !!end.hide, p);
  }

  enter(from: THREE.Vector3, to: THREE.Vector3, yaw: number, ms: number, opts: { sit?: boolean } = {}) {
    this.root.visible = true;
    this.root.position.copy(from);
    this.actor?.vrm.springBoneManager?.reset();
    this.startMove(from, to, yaw, ms, !!opts.sit, false);
  }

  exit(to: THREE.Vector3, ms: number) {
    if (!this.root.visible) return;
    this.startMove(this.root.position, to, this.root.rotation.y, ms, false, true);
  }

  moveTo(to: THREE.Vector3, yaw: number, ms: number) {
    this.root.visible = true;
    this.startMove(this.root.position, to, yaw, ms, false, false);
  }

  place(pos: THREE.Vector3, yaw: number, opts: { sit?: boolean; visible?: boolean } = {}) {
    this.move = null;
    this.root.position.copy(pos);
    this.root.rotation.y = yaw;
    this.root.visible = opts.visible ?? true;
    this.sitting = !!opts.sit;
    this.sitPhase = this.sitting ? 'seated' : 'none';
    this.settleClip(0);
    this.actor?.vrm.springBoneManager?.reset();
  }

  /** the star: sit down where you stand (or at `seat`), with the sitting-down clip */
  sit(seat?: THREE.Vector3, yaw?: number) {
    this.move = null;
    this.root.visible = true;
    if (seat) this.root.position.copy(seat);
    if (yaw !== undefined) this.root.rotation.y = yaw;
    this.sitting = true;
    if (this.has('Sitting_Enter')) {
      this.sitPhase = 'enter';
      this.play('Sitting_Enter', 0.2);
      this.sitEnterLeft = this.actions.get('Sitting_Enter')!.getClip().duration;
    } else {
      this.sitPhase = 'seated';
      this.settleClip();
    }
  }

  speak(ms: number, text?: string) {
    this.talkLeft = Math.max(this.talkLeft, ms / 1000);
    this.puppet?.talk(ms, text);
    if (!this.move) this.settleClip(0.35);
  }

  lookAt(target: THREE.Vector3 | null) {
    this.look = target ? target.clone() : null;
    this.puppet?.lookAt(target);
  }

  /** gestures; `beat` is the held stillness before it lands (seconds) */
  gesture(name: Gesture | GestureName, beat?: number) {
    if (!(name in GESTURE_DEFS)) return;
    this.puppet?.gesture(name as GestureName, beat);
  }

  mood(name: Mood | MoodName) {
    this.moodName = name as MoodName;
    this.puppet?.mood(this.moodName);
  }

  setPosture(p: 'slump' | null) {
    this.posture = p;
    this.puppet?.setSlump(p === 'slump');
  }

  setLit(on: boolean) {
    this.lit = on;
    this.actor?.setLit(on);
  }

  /** a held stance under the gestures (stance families, the booth) */
  setPose(name: PoseName) {
    this.poseName = name;
    this.puppet?.setPose(name);
  }

  /** the held pause: 1 = frozen but breathing */
  setFreeze(x: number) {
    this.freezeAmt = x;
    this.puppet?.setFreeze(x);
  }

  /** -1..1: how the night is going (chest out, chin up / shrinking) */
  setConfidence(x: number) {
    this.confidence = x;
    this.puppet?.setConfidence(x);
  }

  /** the standing idle clip for this stance (null: the character's own) */
  setIdleClip(name: string | null) {
    if (name === this.idleOverride) return;
    this.idleOverride = name;
    if (!this.move && !this.sitting) this.settleClip(0.5);
  }

  /** whether this body has a clip (after the manifest's allow list) */
  hasClip(name: string) {
    return this.has(name);
  }

  blink() {
    this.puppet?.blink();
  }

  private headPos(out: THREE.Vector3) {
    const a = this.actor;
    if (!a) return this.root.localToWorld(out.set(0, 1.4, 0));
    this.root.updateWorldMatrix(true, true);
    const head = a.vrm.humanoid.getRawBoneNode((this.manifest.headBone as 'head') ?? 'head') ?? a.vrm.humanoid.getRawBoneNode('head')!;
    return head.getWorldPosition(out);
  }

  headAnchor(out = new THREE.Vector3()) {
    this.headPos(out);
    if (!this.actor) return out;
    const s = this.actor.scale * this.body.scale.y * this.root.scale.y;
    out.y += this.actor.headTop * s + 0.08;
    // standing, the anchor never sinks below the standing head top: a slump or a cringe drops the
    // head, but the name tag and the marks over it stay where the head was, clear of the body
    if (!this.sitting) {
      const stand = this.root.position.y + this.hover.position.y + this.actor.height * this.actor.scale * 0.98 + 0.08;
      out.y = Math.max(out.y, stand);
    }
    return out;
  }

  faceAnchor(out = new THREE.Vector3()) {
    this.headPos(out);
    if (!this.actor) return out;
    // eye line as a fraction of the head (manifest eyeLine): big chibi heads carry their eyes low
    const eye = typeof this.manifest.eyeLine === 'number' ? this.manifest.eyeLine : 0.4;
    out.y += this.actor.headTop * this.actor.scale * eye;
    return out;
  }

  /** peak time of a gesture after its held beat (for stills) */
  static gesturePeak(name: GestureName, beat = 0.14) {
    return beat + GESTURE_DEFS[name].peak;
  }

  // ---- per frame --------------------------------------------------------------------------
  update(dt: number, _t = 0) {
    const a = this.actor;
    const p = this.puppet;
    if (!a || !p || !this.mixer) return;
    if (!this.root.visible && !this.move) return;

    // talking timer: back to idle when the line ends
    if (this.talkLeft > 0) {
      this.talkLeft -= dt;
      if (this.talkLeft <= 0 && !this.move) this.settleClip(0.4);
    }

    // sitting down: the enter clip, then the seated loop
    if (this.sitPhase === 'enter') {
      this.sitEnterLeft -= dt;
      if (this.sitEnterLeft <= 0) {
        this.sitPhase = 'seated';
        this.settleClip(0.25);
      }
    }

    const kind = this.locoKind();
    let hoverY = this.manifest.floats ?? 0;
    let hoverPitch = 0;
    let hoverRoll = 0;
    let hopSq = 0;
    if (this.manifest.floats) {
      this.floatPhase += dt;
      hoverY += Math.sin(this.floatPhase * 1.3) * 0.03;
      hoverPitch = Math.sin(this.floatPhase * 0.9) * 0.025;
    }

    // locomotion
    if (this.move) {
      const m = this.move;
      m.t = Math.min(m.dur, m.t + dt);
      // trapezoid speed profile: a short start and stop, constant in the middle (feet can match)
      const acc = Math.min(ACCEL, m.dur / 3);
      const vmax = m.dist / Math.max(0.05, m.dur - acc);
      const s = (t: number) => (t < acc ? (0.5 * vmax * t * t) / acc : t > m.dur - acc ? m.dist - (0.5 * vmax * (m.dur - t) ** 2) / acc : 0.5 * vmax * acc + vmax * (t - acc));
      const speed = m.t < acc ? (vmax * m.t) / acc : m.t > m.dur - acc ? (vmax * (m.dur - m.t)) / acc : vmax;
      const u = m.dist > 1e-4 ? Math.min(1, s(m.t) / m.dist) : 1;
      let segYaw = Math.atan2(m.to.x - m.from.x, m.to.z - m.from.z);
      if (m.path && m.cum) segYaw = pathAt(m.path, m.cum, u * m.dist, this.root.position);
      else this.root.position.lerpVectors(m.from, m.to, u);
      // a short step (a shuffle closer, half a step in) keeps facing where it faced
      const moving = m.dist > 0.6 && m.t < m.dur - 0.05;
      const heading = moving ? segYaw : m.yaw;
      this.root.rotation.y = damp(this.root.rotation.y, nearestAngle(this.root.rotation.y, heading), moving ? 12 : 8, dt);

      // the character's own way of moving, on top of the walk
      const gait = a.style.gait;
      const h = a.height * a.scale;
      this.stepPhase += (dt * speed) / (gait === 'scurry' ? 0.32 : gait === 'bound' ? 0.75 : 0.5);
      const step = Math.sin(this.stepPhase * Math.PI);
      if (moving) {
        if (gait === 'bound') {
          const up = Math.abs(step);
          hoverY += up * 0.09 * h;
          hopSq = up > 0.5 ? (up - 0.5) * 0.12 : -(0.5 - up) * 0.16;
          hoverPitch += 0.1;
        } else if (gait === 'waddle') {
          hoverRoll = step * 0.15;
          hoverY += Math.abs(step) * 0.025 * h;
          hopSq = -Math.abs(step) * 0.03;
        } else if (gait === 'scurry') {
          hoverY += Math.abs(step) * 0.018 * h;
          hoverPitch += 0.09;
        } else if (gait === 'strut') {
          hoverRoll = step * 0.055;
          hoverPitch -= 0.04;
          hoverY += Math.abs(step) * 0.012 * h;
        } else if (gait === 'stride') {
          hoverPitch -= 0.05;
        }
      }

      if (kind === 'clip' && this.current) {
        const base = this.walkSpeed.get(this.currentName) ?? 1;
        this.current.timeScale = Math.max(0.35, Math.min(gait === 'scurry' ? 3.4 : 3.0, speed / base));
      } else if (kind === 'hop') {
        // little two-footed hops; the root only travels while airborne (no skating)
        const hopLen = 0.42;
        this.hopPhase += dt / hopLen;
        const hu = this.hopPhase % 1;
        const air = Math.sin(Math.PI * Math.min(1, hu / 0.7));
        if (moving) {
          hoverY += hu < 0.7 ? air * 0.07 * a.height * a.scale * 0.6 : 0;
          hopSq = hu < 0.7 ? air * 0.06 : -Math.sin(Math.PI * ((hu - 0.7) / 0.3)) * 0.1;
          hoverPitch += 0.08;
        }
      } else if (kind === 'float') {
        hoverPitch += moving ? 0.14 * Math.min(1, speed) : 0;
      }

      if (m.t >= m.dur) {
        this.root.rotation.y = m.yaw;
        this.move = null;
        if (m.hide) this.root.visible = false;
        if (m.sit) this.sit(undefined, m.yaw);
        else this.settleClip(0.3);
        if (this.current) this.current.timeScale = 1;
      }
    }
    this.hover.position.y = hoverY;
    this.hover.rotation.x = hoverPitch;
    this.hover.rotation.z = hoverRoll;
    this.hover.scale.set(1 - hopSq * 0.5, 1 + hopSq, 1 - hopSq * 0.5);

    // seated: lift and slide the body so the hips land on the cushion over the chair centre
    {
      const k = this.sitting ? 1 : 0;
      const rate = this.sitPhase === 'enter' ? 4 : 12;
      a.object.position.y = damp(a.object.position.y, this.seatShift.y * k, rate, dt);
      a.object.position.z = damp(a.object.position.z, this.seatShift.z * k, rate, dt);
    }

    // the held beat before a gesture slows the clip too, so the whole body goes still
    if (this.current && !this.move) this.current.timeScale = 1 - 0.85 * p.stillness;

    // The mixer only writes a bone when its value changed since the last frame, so the acting
    // layer must not leave its offsets on the normalized bones: keep the clip's pose (base), add
    // the acting on top, let vrm.update copy it to the raw bones, then put the base back.
    if (!this.current) a.vrm.humanoid.resetNormalizedPose();
    this.mixer.update(dt);
    if (!this.base) this.base = this.collectBase(a);
    for (const b of this.base) {
      b.q.copy(b.node.quaternion);
      b.p.copy(b.node.position);
    }
    p.update(dt, this.root, {
      walking: !!this.move,
      sitting: this.sitting,
      proceduralArms: !this.current || this.currentName === '',
    });
    a.vrm.update(dt);
    for (const b of this.base) {
      b.node.quaternion.copy(b.q);
      b.node.position.copy(b.p);
    }
  }

  private base: { node: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3 }[] | null = null;
  private collectBase(a: VrmActor) {
    const out: { node: THREE.Object3D; q: THREE.Quaternion; p: THREE.Vector3 }[] = [];
    for (const name of Object.keys(a.vrm.humanoid.humanBones)) {
      const node = a.vrm.humanoid.getNormalizedBoneNode(name as 'hips');
      if (node) out.push({ node, q: node.quaternion.clone(), p: node.position.clone() });
    }
    return out;
  }

  dispose() {
    this.disposed = true;
    this.root.removeFromParent();
    this.mixer?.stopAllAction();
    if (this.actor) this.mixer?.uncacheRoot(this.actor.vrm.scene);
    this.actor?.dispose();
    this.actor = null;
  }
}

/**
 * Install the VRM factory into the stage's cast seam. Any manifest with format 'vrm' gets a
 * VrmPerformer; everything else falls through to the previous factory (the mannequin).
 */
let installed = false;
export function installVrmPerformers() {
  if (installed) return;
  installed = true;
  const prev = createPerformer;
  setPerformerFactory((member, manifest: CastManifest | null, ctx: PerformerContext) => {
    if (manifest && manifest.format === 'vrm') {
      return new VrmPerformer(member, manifest as unknown as VrmManifest, { assetsBase: ctx.assetsBase, star: ctx.star });
    }
    return prev(member, manifest, ctx) ?? (manifest ? null : new Mannequin(ctx.kit, member, { star: ctx.star }));
  });
}

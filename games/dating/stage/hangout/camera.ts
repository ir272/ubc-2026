// The hangout camera is a person in the room filming friends (stage/LOOK.md "The hangout"): eye
// level, a wide-ish lens, a slight handheld drift and breathing, usually two to four people in the
// frame. It stands at one place per phase of the show (a "station"), turns toward whoever speaks
// and steps in a little; between phases it may cut to another place (by the window, by the couch).
// It never frames a single face tight, and it always keeps the speaker (and the room their bubble
// needs above the head) in the frame.
import * as THREE from 'three';

export interface Station {
  name: string;
  pos: THREE.Vector3;
  /** where it looks when nobody is speaking */
  look: THREE.Vector3;
  /** vertical field of view, degrees */
  fov: number;
}

export interface CameraHost {
  /** eye-height point of a cast member in the room, or null */
  face(id: string, out: THREE.Vector3): THREE.Vector3 | null;
  /** just above the head */
  head(id: string, out: THREE.Vector3): THREE.Vector3 | null;
  /** the floor under them */
  feet(id: string, out: THREE.Vector3): THREE.Vector3 | null;
  /** share of the frame height the speaker's bubble and plate need above the head */
  headroom(id: string): number;
}

export interface Attend {
  /** the one who must be in frame (the speaker), with their bubble's room */
  primary?: string | null;
  /** the others the shot would like to hold (who they talk to, who reacts) */
  also?: string[];
  /** a point that must be in frame instead of a person (a line remembered at the door) */
  point?: THREE.Vector3 | null;
  /** hold everyone listed in `also` as a group (wider) */
  group?: boolean;
}

const DEG = Math.PI / 180;
const v = (x = 0, y = 0, z = 0) => new THREE.Vector3(x, y, z);
/** never nearer a face than this: no television close-ups */
const MIN_DIST = 2.35;
/** how far the operator steps toward the speaker, at most */
const STEP = 0.35;

export class HangoutCamera {
  readonly camera: THREE.PerspectiveCamera;
  /** for acting (who the lens is on) */
  shot: { name: string; id?: string } = { name: 'hangout' };
  private host: CameraHost;
  private station: Station;
  private want: Attend = {};
  private aspect = 16 / 9;
  private time = 0;
  // smoothed state: where the operator stands, where they aim (yaw, pitch), the lens
  private pos = v();
  private posVel = v();
  private yaw = 0;
  private yawVel = 0;
  private pitch = 0;
  private pitchVel = 0;
  private fov = 40;
  private snapNext = true;
  private tmp = v();
  private tmp2 = v();
  /** dev: the last solve */
  debug: Record<string, unknown> = {};
  readonly log: { t: number; name: string; id?: string }[] = [];

  constructor(host: CameraHost, station: Station) {
    this.host = host;
    this.station = station;
    this.camera = new THREE.PerspectiveCamera(station.fov, this.aspect, 0.08, 80);
    this.pos.copy(station.pos);
    const d = station.look.clone().sub(station.pos);
    this.yaw = Math.atan2(d.x, d.z);
    this.pitch = Math.atan2(d.y, Math.hypot(d.x, d.z));
    this.fov = station.fov;
    this.apply();
    (globalThis as { __cam?: unknown }).__cam = this;
  }

  setAspect(a: number) {
    this.aspect = a;
    this.camera.aspect = a;
    this.camera.updateProjectionMatrix();
  }

  /** move to another place in the room: a cut (a new phase) or a walk (eased) */
  setStation(s: Station, cut: boolean) {
    const same = s.name === this.station.name;
    this.station = s;
    if (cut && !same) this.snapNext = true;
    this.log.push({ t: +this.time.toFixed(2), name: `station:${s.name}${cut ? ':cut' : ''}` });
    if (this.log.length > 200) this.log.shift();
  }

  get stationName() {
    return this.station.name;
  }

  /** who to frame from now on */
  attend(a: Attend) {
    this.want = a;
    this.shot = { name: 'hangout', id: a.primary ?? undefined };
    this.log.push({ t: +this.time.toFixed(2), name: 'attend', id: a.primary ?? (a.point ? 'point' : undefined) });
    if (this.log.length > 200) this.log.shift();
  }

  /** jump straight to the solved framing on the next update (a late join, a cut) */
  snap() {
    this.snapNext = true;
  }

  /** is this world point inside the frame now (NDC margin) */
  inFrame(p: THREE.Vector3, margin = 0.02) {
    this.tmp.copy(p).project(this.camera);
    return this.tmp.z < 1 && Math.abs(this.tmp.x) < 1 - margin && Math.abs(this.tmp.y) < 1 - margin;
  }

  private hfov(vfovDeg: number) {
    return 2 * Math.atan(Math.tan((vfovDeg * DEG) / 2) * this.aspect);
  }

  /** the framing this moment wants: operator position, yaw, pitch, fov */
  private solve() {
    const h = this.host;
    const st = this.station;
    const a = this.want;
    const prim = a.primary ? h.head(a.primary, v()) : null;
    const primFace = a.primary ? h.face(a.primary, v()) : null;
    const primFeet = a.primary ? h.feet(a.primary, v()) : null;
    const pts: { p: THREE.Vector3; w: number; must: boolean; id: string }[] = [];
    if (prim && primFace) pts.push({ p: primFace, w: 2, must: true, id: a.primary! });
    else if (a.point) pts.push({ p: a.point.clone(), w: 2, must: true, id: 'point' });
    for (const id of a.also ?? []) {
      if (id === a.primary) continue;
      const f = h.face(id, v());
      if (f) pts.push({ p: f, w: a.group ? 1 : 0.8, must: false, id });
    }
    // the operator: the station, stepped a little toward the speaker (never too near anyone framed)
    const pos = st.pos.clone();
    const focus = pts[0]?.p;
    if (focus) {
      const d = this.tmp.copy(focus).sub(st.pos).setY(0);
      const dist = d.length();
      const step = Math.max(0, Math.min(STEP, (dist - 3.6) * 0.25));
      if (step > 0 && dist > 0.01) pos.addScaledVector(d.normalize(), step);
    }
    for (const q of pts) {
      const d = this.tmp.copy(q.p).sub(pos).setY(0);
      const dist = d.length();
      if (dist < MIN_DIST && dist > 0.01) pos.addScaledVector(d.normalize(), dist - MIN_DIST);
    }
    pos.y = st.pos.y;
    if (!pts.length) {
      const d = st.look.clone().sub(pos);
      return { pos, yaw: Math.atan2(d.x, d.z), pitch: Math.atan2(d.y, Math.hypot(d.x, d.z)), fov: st.fov };
    }
    // horizontal: the yaw of each point; keep the must-have, drop the farthest optional ones until
    // the span fits the lens (with a margin for bodies and bubbles)
    let fov = st.fov;
    const yawOf = (p: THREE.Vector3) => Math.atan2(p.x - pos.x, p.z - pos.z);
    const ref = yawOf(pts[0]!.p);
    const rel = (p: THREE.Vector3) => {
      let d = yawOf(p) - ref;
      while (d > Math.PI) d -= 2 * Math.PI;
      while (d < -Math.PI) d += 2 * Math.PI;
      return d;
    };
    let keep = pts.map((q) => ({ ...q, r: rel(q.p), dist: Math.max(0.5, Math.hypot(q.p.x - pos.x, q.p.z - pos.z)) }));
    const margin = (q: { dist: number }) => Math.atan2(0.55, q.dist);
    const fits = (ks: typeof keep, f: number) => {
      const lo = Math.min(...ks.map((k) => k.r - margin(k)));
      const hi = Math.max(...ks.map((k) => k.r + margin(k)));
      return hi - lo <= this.hfov(f) * 0.9;
    };
    while (keep.length > 1 && !fits(keep, fov)) {
      if (fov < st.fov + 8) {
        fov += 2;
        continue;
      }
      // drop the optional one farthest from the speaker
      let worst = -1, wd = -1;
      keep.forEach((k, i) => {
        if (k.must) return;
        const d = Math.abs(k.r);
        if (d > wd) {
          wd = d;
          worst = i;
        }
      });
      if (worst < 0) break;
      keep.splice(worst, 1);
    }
    const lo = Math.min(...keep.map((k) => k.r - margin(k)));
    const hi = Math.max(...keep.map((k) => k.r + margin(k)));
    // centre the kept span, leaning a little toward the speaker
    const mid = (lo + hi) / 2;
    const yaw = ref + mid * 0.8;
    // vertical: the speaker's head top where its bubble still fits above it
    let pitch: number;
    const vh = Math.tan((fov * DEG) / 2);
    if (prim && a.primary) {
      const room = Math.min(0.62, this.host.headroom(a.primary));
      const topNdc = 1 - 2 * room;
      const d = Math.max(0.5, Math.hypot(prim.x - pos.x, prim.z - pos.z));
      const up = Math.atan2(prim.y - pos.y, d);
      // tan(up - pitch) / vh = topNdc  ->  pitch = up - atan(topNdc * vh)
      // the head top no higher than topNdc (the bubble fits above it): the lowest the aim may be
      const headMin = up - Math.atan(topNdc * vh);
      // the waist stays in the frame: the highest the aim may be
      const low = primFeet ? Math.atan2(primFeet.y + 0.5 - pos.y, d) : up - 0.5;
      const waistMax = low + Math.atan(0.9 * vh);
      // natural: the face a little above the middle of the frame
      const faceUp = primFace ? Math.atan2(primFace.y - pos.y, d) : up - 0.1;
      const natural = faceUp - Math.atan(0.12 * vh);
      pitch = Math.min(Math.max(natural, headMin), Math.max(waistMax, headMin));
      // a tall speaker with a long line, close in: widen rather than crop the body
      if (headMin > waistMax) fov = Math.min(st.fov + 10, fov + 4);
    } else {
      const avgY = keep.reduce((acc, k) => acc + k.p.y, 0) / keep.length;
      const d = keep.reduce((acc, k) => acc + k.dist, 0) / keep.length;
      pitch = Math.atan2(avgY - 0.1 - pos.y, d);
    }
    pitch = Math.max(-16 * DEG, Math.min(6 * DEG, pitch));
    this.debug = { keep: keep.map((k) => k.id), fov, station: st.name };
    return { pos, yaw, pitch, fov };
  }

  update(dt: number) {
    this.time += dt;
    const w = this.solve();
    if (this.snapNext) {
      this.snapNext = false;
      this.pos.copy(w.pos);
      this.posVel.set(0, 0, 0);
      this.yaw = w.yaw;
      this.pitch = w.pitch;
      this.yawVel = this.pitchVel = 0;
      this.fov = w.fov;
      this.apply();
      return;
    }
    // is the speaker out of the frame? then turn to them first, quicker
    let urgent = false;
    const pid = this.want.primary;
    if (pid) {
      const f = this.host.face(pid, this.tmp2);
      if (f && !this.inFrame(f, 0.12)) urgent = true;
    } else if (this.want.point && !this.inFrame(this.want.point, 0.12)) urgent = true;
    // critically damped springs: an eased start and an eased stop, like a hand turning
    const k = urgent ? 22 : 7;
    const c = 2 * Math.sqrt(k);
    let dy = w.yaw - this.yaw;
    while (dy > Math.PI) dy -= 2 * Math.PI;
    while (dy < -Math.PI) dy += 2 * Math.PI;
    this.yawVel += (dy * k - this.yawVel * c) * dt;
    this.yaw += this.yawVel * dt;
    this.pitchVel += ((w.pitch - this.pitch) * k - this.pitchVel * c) * dt;
    this.pitch += this.pitchVel * dt;
    const kp = 2.2, cp = 2 * Math.sqrt(kp);
    this.posVel.addScaledVector(this.tmp.copy(w.pos).sub(this.pos), kp * dt).addScaledVector(this.posVel, -cp * dt);
    this.pos.addScaledVector(this.posVel, dt);
    this.fov += (w.fov - this.fov) * Math.min(1, dt * 2.5);
    this.apply();
  }

  private apply() {
    const t = this.time;
    const c = this.camera;
    // handheld: a slow drift, a little sway, breathing
    const hx = Math.sin(t * 0.53) * 0.009 + Math.sin(t * 1.31 + 0.7) * 0.004;
    const hy = Math.sin(t * 1.6) * 0.006 + Math.sin(t * 0.41 + 1.3) * 0.006;
    const hz = Math.sin(t * 0.37 + 2.1) * 0.008;
    const ry = Math.sin(t * 0.29 + 0.4) * 0.0035 + Math.sin(t * 0.9) * 0.0012;
    const rp = Math.sin(t * 0.33 + 1.9) * 0.0025 + Math.sin(t * 1.6 + 0.3) * 0.0012;
    const roll = Math.sin(t * 0.21) * 0.006;
    c.position.set(this.pos.x + hx, this.pos.y + hy, this.pos.z + hz);
    const yaw = this.yaw + ry, pitch = this.pitch + rp;
    const dir = this.tmp.set(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    c.up.set(Math.sin(roll) * Math.cos(yaw), Math.cos(roll), -Math.sin(roll) * Math.sin(yaw));
    c.lookAt(c.position.x + dir.x, c.position.y + dir.y, c.position.z + dir.z);
    if (Math.abs(c.fov - this.fov) > 0.01) {
      c.fov = this.fov;
      c.updateProjectionMatrix();
    }
  }
}

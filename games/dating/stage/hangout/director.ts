// The hangout director: the same feed events as the studio, drawn as people hanging out in a room
// (stage/LOOK.md "The hangout"). Everything the format needs is carried by where people stand,
// what they do and what they say; nothing is printed but speech.
//
// One handler per event type. `rebuild` puts everyone where the state says they are (who is in
// the room, where they stand, who has left, who is on the couch), with no animation and no sound.
// Standing is physical and a pure function of PublicState.marks (blocking.ts).
import * as THREE from 'three';
import type { Mark, PublicState, SceneId } from '../../show/types.ts';
import { actOn, type ActingRoom } from '../acting.ts';
import type { Cast, PerformerSlot } from '../cast.ts';
import type { CatchUp, DatingEvent, Feed, FeedSink, ShowState, WindowInfo } from '../feed.ts';
import type { Marks } from '../marks.ts';
import { SOUND_TIMING, type Sound, type Track } from '../sound.ts';
import { HANGOUT } from '../theme.ts';
import type { Kit } from '../toon.ts';
import {
  type Body,
  DOOR_ANCHOR,
  DOOR_IN,
  DOOR_OUT,
  GREET,
  GUEST_SEAT,
  NOOK,
  NOOK_YAW,
  type Placed,
  RING,
  RING_FACE,
  SEAT_YAW,
  STAR_SEAT,
  STAR_STAND,
  clearOfCouch,
  frontPlaces,
  pathLength,
  ringPlaces,
  route,
  walkMs,
  yawTo,
} from './blocking.ts';
import type { Bubbles, BubbleStyle } from './bubbles.ts';
import type { HangoutCamera, Station } from './camera.ts';
import type { Room } from './room.ts';

export interface HangoutDeps {
  cast: Cast;
  cam: HangoutCamera;
  room: Room;
  marks: Marks;
  bubbles: Bubbles;
  sound: Sound;
  kit: Kit;
  scene: THREE.Scene;
}

type Ev<T extends DatingEvent['type']> = Extract<DatingEvent, { type: T }>;

const v = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/** where the operator stands for each phase (a cut between phases makes each look its own) */
export const STATIONS: Record<string, Station> = {
  front: { name: 'front', pos: v(0.55, 1.45, 4.0), look: v(0.55, 1.0, -1.0), fov: 42 },
  frontRight: { name: 'frontRight', pos: v(2.5, 1.45, 3.55), look: v(0.0, 1.0, -1.2), fov: 42 },
  aside: { name: 'aside', pos: v(1.85, 1.42, 4.25), look: v(0.0, 1.0, -1.0), fov: 42 },
  couch: { name: 'couch', pos: v(2.75, 1.38, 1.55), look: v(-0.9, 0.85, -2.3), fov: 40 },
};
const SCENE_STATION: Record<SceneId, string> = {
  title: 'front',
  walkon: 'front',
  round1: 'front',
  booth1: 'aside',
  round2: 'frontRight',
  booth2: 'aside',
  oneonone: 'couch',
  pick: 'front',
  reveal: 'front',
  result: 'front',
};

const SCENE_MUSIC: Record<SceneId, Track | null> = {
  title: 'walkon',
  walkon: 'walkon',
  round1: 'rounds',
  booth1: 'rounds',
  round2: 'rounds',
  booth2: 'rounds',
  oneonone: 'final',
  pick: null,
  reveal: 'final',
  result: 'walkon',
};

/** cast members wider than their height suggests (by avatar folder) */
const GIRTH: Record<string, number> = { frost: 1.45, crumb: 1.45, vex: 1.35, dash: 1.15, prince: 1.15, brock: 1.1 };

interface Job {
  at: number;
  fn: () => void;
  /** beat: dropped by the next event; lasting: run at once by the next event; keep: runs on time whatever comes */
  group: 'beat' | 'lasting' | 'keep';
}

export class HangoutDirector implements FeedSink {
  private d: HangoutDeps;
  private feed: Feed | null = null;
  private clock = 0;
  private jobs: Job[] = [];
  private state: ShowState | null = null;
  /** the confessor stepped out toward the lens, and where they came from */
  private asideId: string | null = null;
  private asideHome: Placed | null = null;
  /** a speaker's half step in: where they go back to */
  private stepped = new Map<string, Placed>();
  /** the bottom two, stepped forward, until the cut settles */
  private bottomPair: string[] = [];
  /** cut and walked out through the door (this stage's own record, ahead of the feed's) */
  private left = new Set<string>();
  /** the star: on the couch, up on her feet, or beside the one she picked */
  private starPhase: 'seat' | 'stand' | 'winner' = 'seat';
  /** the finalists have stood up in front of her (compare) */
  private comparing = false;
  /** a walk-on suitor who has not yet had their snap reaction stays by the couch to say hello */
  private greeting: string | null = null;
  private lastScene: SceneId | null = null;
  private highlightId: string | null = null;
  private veil: THREE.Mesh;
  private veilOn = 0;
  private houseHold = false;
  private tmp = new THREE.Vector3();

  readonly actingRoom: ActingRoom = {
    aside: (id) => this.asideId === id,
    ceiling: () => STAR_SEAT.clone().add(v(1.2, 3.2, 1.6)),
    thinking: () => {
      const s = this.d.cast.star;
      return s && s.visible ? s.faceAnchor(new THREE.Vector3()) : null;
    },
    center: (out) => out.copy(RING.c).setY(1.25),
    phone: () => STAR_SEAT.clone().add(v(0.25, 1.0, 0.2)),
    cheat: 0.55,
    door: () => DOOR_ANCHOR.clone(),
    outside: () => v(-2.6, 1.6, -6),
    free: (id) => {
      const sl = this.slot(id);
      return !!sl && !sl.walking && Math.hypot(sl.pos.x - NOOK[0]!.x, sl.pos.z - NOOK[0]!.z) < 0.35;
    },
  };

  constructor(d: HangoutDeps) {
    this.d = d;
    // the dim veil behind someone talking to the lens: a plain dark sheet hung in front of the lens
    const mat = d.kit.bin.add(new THREE.MeshBasicMaterial({ color: HANGOUT.veil, transparent: true, opacity: 0, depthWrite: false }));
    this.veil = new THREE.Mesh(d.kit.geo(new THREE.PlaneGeometry(1, 1)), mat);
    this.veil.renderOrder = 5;
    this.veil.visible = false;
    this.veil.frustumCulled = false;
    d.scene.add(this.veil);
  }

  attach(feed: Feed) {
    this.feed = feed;
  }

  // ------------------------------------------------------------------ helpers
  private after(ms: number, fn: () => void, group: Job['group'] = 'beat') {
    this.jobs.push({ at: this.clock + ms / 1000, fn, group });
  }
  private cancelBeat() {
    const run = this.jobs.filter((j) => j.group === 'lasting').sort((a, b) => a.at - b.at);
    this.jobs = this.jobs.filter((j) => j.group === 'keep');
    for (const j of run) j.fn();
  }
  private meta() {
    return this.d.cast.meta;
  }
  private starId() {
    return this.meta()?.star.id ?? '';
  }
  private isStar(id: string) {
    return this.starId() === id;
  }
  private slot(id: string | null | undefined): PerformerSlot | undefined {
    return this.d.cast.slot(id);
  }
  private spotOf = (id: string) => this.d.cast.suitor(id)?.spot ?? 0;
  private visible(id: string | null | undefined) {
    const s = this.slot(id);
    return !!s && s.visible;
  }
  private rOf(id: string) {
    const c = this.d.cast.member(id)?.cast ?? id;
    return 0.27 * (GIRTH[c] ?? GIRTH[id] ?? 1);
  }
  private accent(id: string) {
    return this.d.cast.member(id)?.accent || '#ffb347';
  }
  private nameOf(id: string, fb = '') {
    return this.d.cast.member(id)?.name ?? fb;
  }
  private cutIds() {
    return new Set((this.state?.pub.cut ?? []).map((c) => c.id));
  }
  /** in the room (seen), not walking out */
  private present(): string[] {
    return this.d.cast.slots().filter((s) => s.visible).map((s) => s.id);
  }

  // ------------------------------------------------------------------ where everyone belongs
  /** the resting place of everyone for a state (no one mid-beat): the room as a late joiner sees it */
  private targets(s: ShowState): Map<string, Placed & { visible: boolean }> {
    const out = new Map<string, Placed & { visible: boolean }>();
    const meta = s.meta;
    if (!meta) return out;
    const pub = s.pub;
    const star = meta.star.id;
    const scene = pub.scene;
    const cut = new Set(pub.cut.map((c) => c.id));
    const gone = (id: string) => s.gone.has(id) || this.left.has(id);
    const marks = pub.marks;
    // the suitors
    const suitors = meta.suitors.map((m) => m.id);
    const entered = suitors.filter((id) => (scene === 'title' ? false : scene === 'walkon' ? s.entered.has(id) : true));
    const inRoom = entered.filter((id) => !gone(id));
    const set = (id: string, p: Placed | null | undefined, visible = true) => {
      if (p) out.set(id, { ...p, pos: p.pos.clone(), visible });
    };
    for (const id of suitors) if (!inRoom.includes(id)) out.set(id, { pos: DOOR_OUT.clone(), yaw: 0, visible: false });
    if (scene === 'oneonone' && pub.focus) {
      const f = pub.focus;
      const other = pub.alive.find((x) => x !== f);
      if (this.comparing) {
        const fp = frontPlaces(this.finalOrder(s));
        for (const id of pub.alive) set(id, fp.get(id));
      } else {
        set(f, { pos: GUEST_SEAT.clone(), yaw: SEAT_YAW, sit: true });
        if (other) set(other, { pos: NOOK[0]!.clone(), yaw: NOOK_YAW });
      }
    } else if (scene === 'pick' || scene === 'reveal') {
      const fp = frontPlaces(this.finalOrder(s));
      for (const id of fp.keys()) if (inRoom.includes(id)) set(id, fp.get(id));
    } else if (scene === 'result') {
      // the winner sits down beside her, on the side they came from
      if (pub.winner && inRoom.includes(pub.winner)) set(pub.winner, { pos: (this.winnerRight(s) ? STAR_SEAT : GUEST_SEAT).clone(), yaw: SEAT_YAW, sit: true });
      for (const id of inRoom) if (id !== pub.winner && !out.has(id)) set(id, ringPlaces([id], this.spotOf, marks).get(id));
    } else {
      // the ring: everyone still in (and anyone cut who has not walked out yet keeps a place)
      const standing = inRoom.filter((id) => id !== this.greeting);
      const places = ringPlaces(standing, this.spotOf, marks);
      for (const id of standing) set(id, places.get(id));
      if (this.greeting && inRoom.includes(this.greeting)) set(this.greeting, { pos: GREET.clone(), yaw: yawTo(GREET, STAR_SEAT) });
    }
    void cut;
    // the star
    let sp: Placed = { pos: STAR_SEAT.clone(), yaw: SEAT_YAW, sit: true };
    const w = pub.winner;
    if ((scene === 'pick' || scene === 'reveal') && w && out.get(w)) {
      const wp = out.get(w)!.pos;
      const p = wp.clone().add(STAR_STAND.clone().sub(wp).setY(0).normalize().multiplyScalar(0.85));
      clearOfCouch(p, 0.4);
      sp = { pos: p, yaw: yawTo(p, wp) };
    } else if (scene === 'pick' && this.starPhase !== 'seat') sp = { pos: STAR_STAND.clone(), yaw: 0 };
    else if (scene === 'result' && w && this.winnerRight(s)) sp = { pos: GUEST_SEAT.clone(), yaw: SEAT_YAW, sit: true };
    out.set(star, { ...sp, visible: true });
    return out;
  }

  /** the two finalists, in the order they stand in front of her (first: her right as seen) */
  private finalOrder(s: ShowState): string[] {
    const pub = s.pub;
    const two = new Set([...pub.alive, ...pub.cut.filter((c) => c.round === 3).map((c) => c.id)]);
    if (pub.scene === 'oneonone' || pub.scene === 'pick') for (const id of pub.alive) two.add(id);
    return [...two].sort((a, b) => this.spotOf(a) - this.spotOf(b)).slice(0, 2);
  }
  /** the winner stood on her right as seen (so sits down on the right seat, and she moves over) */
  private winnerRight(s: ShowState) {
    const w = s.pub.winner;
    return !!w && this.finalOrder(s)[0] === w;
  }

  /** the others standing still in the room, as obstacles for a walker */
  private bodies(except: string[]): Body[] {
    const out: Body[] = [];
    for (const s of this.d.cast.slots()) {
      if (!s.visible || s.walking || except.includes(s.id)) continue;
      if (s.sitting) {
        // the couch is already an obstacle; their knees and feet stick out in front of it
        out.push({ id: s.id, pos: s.pos.clone().add(new THREE.Vector3(Math.sin(s.yaw), 0, Math.cos(s.yaw)).multiplyScalar(0.5)), r: 0.34 });
        continue;
      }
      out.push({ id: s.id, pos: s.pos.clone(), r: this.rOf(s.id) + 0.06 });
    }
    return out;
  }

  /** walk someone to a place by a clear path; returns the walk's ms */
  private walkTo(id: string, p: Placed, opts: { speed?: number; hide?: boolean; via?: THREE.Vector3[]; delay?: number } = {}) {
    const sl = this.slot(id);
    if (!sl) return 0;
    const from = sl.pos.clone().setY(0);
    const goal = p.pos.clone().setY(0);
    let path: THREE.Vector3[];
    if (opts.via?.length) {
      path = [from];
      let cur = from;
      for (const w of [...opts.via, goal]) {
        const seg = route(cur, w, this.rOf(id), this.bodies([id]));
        path.push(...seg.slice(1));
        cur = w;
      }
    } else path = route(from, goal, this.rOf(id), this.bodies([id]));
    const len = pathLength(path);
    if (len < 0.03 && !p.sit && !opts.hide) {
      sl.faceYaw = p.yaw;
      return 0;
    }
    const ms = walkMs(len, opts.speed);
    const go = () => {
      sl.faceYaw = p.sit || opts.hide ? null : p.yaw;
      sl.walkPath(path, ms, { yaw: p.yaw, sit: p.sit, hide: opts.hide });
    };
    if (opts.delay) this.after(opts.delay, go, 'keep');
    else go();
    return ms + (opts.delay ?? 0);
  }

  /** put someone exactly at a place (no walk) */
  private put(id: string, p: Placed & { visible?: boolean }) {
    const sl = this.slot(id);
    if (!sl) return;
    sl.place(p.pos.clone(), p.yaw, { sit: !!p.sit, visible: p.visible ?? true });
    sl.faceYaw = p.sit ? null : p.yaw;
  }

  /**
   * Everyone to where the state says they belong: those already near walk the last bit, the rest
   * walk by a clear path. `only` limits it to some; `instant` places with no walk (late join).
   */
  private settle(opts: { only?: string[]; instant?: boolean; except?: string[] } = {}) {
    const s = this.state;
    if (!s) return;
    const t = this.targets(s);
    for (const [id, p] of t) {
      if (opts.only && !opts.only.includes(id)) continue;
      if (opts.except?.includes(id)) continue;
      if (this.asideId === id || this.bottomPair.includes(id) || this.stepped.has(id)) continue;
      const sl = this.slot(id);
      if (!sl) continue;
      if (opts.instant || (!sl.visible && p.visible)) {
        // someone not in the room yet appears where they belong only on a rebuild; live, they walk in
        if (!opts.instant && !sl.visible) continue;
        this.put(id, p);
        continue;
      }
      if (!p.visible) {
        if (sl.visible && !sl.walking) this.walkOut(id, 0);
        continue;
      }
      if (sl.walking) continue;
      const far = Math.hypot(sl.pos.x - p.pos.x, sl.pos.z - p.pos.z);
      if (far < 0.04 && !!p.sit === sl.sitting) {
        if (!p.sit) sl.faceYaw = p.yaw;
        continue;
      }
      this.walkTo(id, p);
    }
  }

  /** out through the door: a walk that lasts about `ms` (the line said on the way) */
  private walkOut(id: string, ms: number) {
    const sl = this.slot(id);
    if (!sl || !sl.visible) return;
    const from = sl.pos.clone().setY(0);
    const path = route(from, DOOR_IN, this.rOf(id), this.bodies([id]));
    path.push(DOOR_OUT.clone());
    const len = pathLength(path);
    const natural = walkMs(len, 1.45);
    const dur = Math.max(natural * 0.85, Math.min(natural * 1.5, ms + 600));
    sl.faceYaw = null;
    sl.walkPath(path, dur, { yaw: Math.PI, hide: true });
    this.after(dur + 50, () => {
      this.left.add(id);
      if (this.d.cam.shot.id === id) this.attendGroup();
    }, 'keep');
    return dur;
  }

  /** the half step a speaker takes into the circle, and back after the line */
  private stepIn(id: string, ms: number, to?: string) {
    const sl = this.slot(id);
    if (!sl || sl.walking || sl.sitting || this.isStar(id) || this.asideId === id || this.bottomPair.includes(id)) return;
    if (this.stepped.has(id)) return;
    const home: Placed = { pos: sl.pos.clone(), yaw: sl.faceYaw ?? sl.yaw };
    const target = to && this.visible(to) ? this.slot(to)!.pos : RING.c;
    const dir = this.tmp.copy(target).sub(home.pos).setY(0);
    if (dir.length() < 0.8) return;
    dir.normalize();
    const p = home.pos.clone().addScaledVector(dir, 0.28);
    clearOfCouch(p, 0.45);
    // never into someone
    for (const b of this.bodies([id])) if (Math.hypot(b.pos.x - p.x, b.pos.z - p.z) < b.r + this.rOf(id) + 0.05) return;
    this.stepped.set(id, home);
    sl.walkPath([sl.pos.clone(), p], 420, { yaw: yawTo(p, to && this.visible(to) ? this.slot(to)!.pos : RING_FACE) });
    sl.faceYaw = yawTo(p, to && this.visible(to) ? this.slot(to)!.pos : RING_FACE);
    this.after(ms + 250, () => this.stepBack(id), 'lasting');
  }
  private stepBack(id: string) {
    const h = this.stepped.get(id);
    this.stepped.delete(id);
    const sl = this.slot(id);
    if (!h || !sl || !sl.visible || this.left.has(id)) return;
    if (sl.walking) return;
    // back to where the state now says (a reaction may have moved their place meanwhile)
    const t = this.state ? this.targets(this.state).get(id) : null;
    const p = t && t.visible ? t : h;
    sl.walkPath([sl.pos.clone(), p.pos.clone()], 520, { yaw: p.yaw });
    sl.faceYaw = p.yaw;
  }

  /** everyone standing turns toward the speaker (bodies a good way round, heads the rest) */
  private faceSpeaker(speaker: string | null, to?: string) {
    const s = this.state;
    if (!s) return;
    const t = this.targets(s);
    const sp = speaker ? this.slot(speaker) : undefined;
    for (const sl of this.d.cast.slots()) {
      if (!sl.visible || sl.sitting || sl.walking || this.asideId === sl.id || this.left.has(sl.id)) continue;
      const home = t.get(sl.id);
      if (!home || !home.visible) continue;
      // the one waiting by the window keeps their back to the room
      if (home.yaw === NOOK_YAW && Math.hypot(home.pos.x - NOOK[0]!.x, home.pos.z - NOOK[0]!.z) < 0.3) {
        sl.faceYaw = NOOK_YAW;
        continue;
      }
      let want = home.yaw;
      if (sl.id === speaker) {
        const tg = to && this.visible(to) ? this.slot(to)!.pos : this.isStar(sl.id) ? RING.c : this.slot(this.starId())?.pos;
        if (tg) want = blendYaw(home.yaw, yawTo(sl.pos, tg), 0.85);
      } else if (sp && sp.visible) {
        want = blendYaw(home.yaw, yawTo(sl.pos, sp.pos), 0.6);
      }
      sl.faceYaw = want;
    }
  }

  // ------------------------------------------------------------------ speech
  private say(who: string, text: string, ms: number, style: BubbleStyle = 'say', at?: THREE.Vector3 | null, label?: { name: string; accent: string }) {
    if (!text || !/[A-Za-z0-9]/.test(text)) return;
    this.d.bubbles.say({ id: who, text, ms, style, at: at ?? null, name: label?.name ?? this.nameOf(who, who), accent: label?.accent ?? this.accent(who) });
  }
  private voice(who: string, text: string, ms: number) {
    this.d.sound.speak(who, this.d.cast.member(who)?.voice, text, ms);
    this.slot(who)?.speak(ms);
  }

  // ------------------------------------------------------------------ the camera
  private attend(primary: string | null, also: string[] = [], group = false) {
    const ids = also.filter((id) => id !== primary && this.visible(id) && id !== this.asideId);
    this.d.cam.attend({ primary: primary && this.visible(primary) ? primary : null, also: ids, group });
  }
  /** nobody speaking: hold the room (the star and whoever is with her) */
  private attendGroup() {
    const ids = this.present().filter((id) => !this.left.has(id));
    this.d.cam.attend({ primary: null, also: ids, group: true });
  }
  private listeners(who: string, to?: string): string[] {
    const star = this.starId();
    const pres = this.present().filter((id) => id !== who && !this.left.has(id));
    const first = to && pres.includes(to) ? [to] : who === star ? [] : [star];
    // then the nearest others to the speaker
    const sl = this.slot(who);
    const rest = pres.filter((id) => !first.includes(id)).sort((a, b) => {
      if (!sl) return 0;
      const pa = this.slot(a)!.pos, pb = this.slot(b)!.pos;
      return pa.distanceTo(sl.pos) - pb.distanceTo(sl.pos);
    });
    return [...first, ...rest].slice(0, 3);
  }

  private station(scene: SceneId, cut: boolean) {
    const st = STATIONS[SCENE_STATION[scene]] ?? STATIONS.front!;
    this.d.cam.setStation(st, cut);
  }

  // ------------------------------------------------------------------ house light
  private applyHouse(instant: boolean) {
    const w = this.feed?.currentWindow();
    this.d.room.setHouse(this.houseHold ? 'hold' : w && w.state === 'open' ? 'up' : 'down', instant);
  }

  // ------------------------------------------------------------------ the aside (a confession)
  private asideSpot(id: string): Placed {
    const cam = this.d.cam.camera.position.clone().setY(0);
    const st = STATIONS[this.d.cam.stationName] ?? STATIONS.front!;
    const look = st.look.clone().sub(st.pos).setY(0).normalize();
    const sl = this.slot(id)!;
    const others = this.bodies([id]);
    let best: THREE.Vector3 | null = null;
    let bestCost = Infinity;
    // the nearest of the others to the lens: the confessor must stand well in front of all of them
    const nearest = Math.min(...others.map((o) => Math.hypot(o.pos.x - cam.x, o.pos.z - cam.z)), 9);
    for (const dist of [2.4, 2.65, 2.9, 3.15]) {
      for (const deg of [-14, -9, -4, 0, 4, 9, 14]) {
        const a = (deg * Math.PI) / 180;
        const d = look.clone().applyAxisAngle(new THREE.Vector3(0, 1, 0), a);
        const p = cam.clone().addScaledVector(d, dist);
        clearOfCouch(p, 0.5);
        const clear = Math.min(...others.map((o) => Math.hypot(o.pos.x - p.x, o.pos.z - p.z) - o.r), 9);
        if (clear < 0.75) continue;
        const ahead = nearest - dist;
        const cost = Math.hypot(p.x - sl.pos.x, p.z - sl.pos.z) + Math.abs(deg) * 0.03 - Math.min(clear, 1.6) * 0.5 + (ahead < 0.6 ? 3 + (0.6 - ahead) * 4 : 0);
        if (cost < bestCost) {
          bestCost = cost;
          best = p;
        }
      }
    }
    const p = best ?? sl.pos.clone().lerp(cam, 0.35);
    return { pos: p, yaw: yawTo(p, cam) };
  }

  private toAside(id: string) {
    if (this.asideId === id) return;
    this.fromAside();
    const sl = this.slot(id);
    if (!sl || !sl.visible) return;
    this.cancelStep(id);
    const home: Placed = { pos: sl.pos.clone(), yaw: sl.faceYaw ?? sl.yaw };
    const spot = this.asideSpot(id);
    this.asideHome = home;
    this.asideId = id;
    this.walkTo(id, spot, { speed: 1.9 });
    this.d.bubbles.setPlates(new Set([id]));
  }

  private fromAside() {
    const id = this.asideId;
    if (!id) return;
    this.asideId = null;
    this.asideHome = null;
    this.d.bubbles.setPlates(null);
    const sl = this.slot(id);
    if (!sl || !sl.visible) return;
    const t = this.state ? this.targets(this.state).get(id) : null;
    if (t && t.visible) this.walkTo(id, t, { speed: 1.7 });
  }

  private cancelStep(id: string) {
    if (this.stepped.has(id)) this.stepped.delete(id);
  }

  // ------------------------------------------------------------------ FeedSink
  rebuild(s: ShowState, inProgress: CatchUp[]) {
    this.state = s;
    this.jobs = [];
    this.asideId = null;
    this.asideHome = null;
    this.stepped.clear();
    this.bottomPair = [];
    this.left.clear();
    this.greeting = null;
    this.comparing = false;
    this.houseHold = false;
    const { cast, bubbles, marks, sound } = this.d;
    sound.rebuild(s.meta ? s.pub.scene : null, s.meta);
    marks.clearPops();
    bubbles.clearSay();
    bubbles.setPlates(null);
    if (!s.meta) {
      cast.clear();
      bubbles.setCast([]);
      this.station('title', true);
      this.attendGroup();
      this.d.cam.snap();
      this.applyHouse(true);
      return;
    }
    const cur = cast.meta;
    if (!cur || cur.star.id !== s.meta.star.id || cur.episode !== s.meta.episode || cur.suitors.map((x) => x.id).join() !== s.meta.suitors.map((x) => x.id).join()) {
      cast.build(s.meta);
      bubbles.setCast([s.meta.star, ...s.meta.suitors].map((m) => ({ id: m.id, name: m.name, accent: m.accent })));
    }
    const pub = s.pub;
    this.lastScene = pub.scene;
    // the walk-on: whoever came in but has no snap mark yet is still saying hello by the couch
    if (pub.scene === 'walkon') {
      const fresh = s.meta.suitors.filter((m) => s.entered.has(m.id) && !(pub.marks[m.id]?.length));
      this.greeting = fresh.length ? fresh[fresh.length - 1]!.id : null;
    }
    const lastLine = inProgress.find((c) => c.ev.type === 'line' || c.ev.type === 'hold' || c.ev.type === 'pick' || c.ev.type === 'cut');
    // the star's phase in the pick
    this.starPhase = (pub.scene === 'pick' || pub.scene === 'reveal') && pub.winner ? 'winner' : pub.scene === 'pick' && lastLine?.ev.type === 'hold' ? 'stand' : 'seat';
    if (pub.scene === 'oneonone' && lastLine?.ev.type === 'line' && lastLine.ev.data.kind === 'compare') this.comparing = true;
    const cut = this.cutIds();
    for (const sl of cast.slots()) {
      sl.out = cut.has(sl.id) && pub.winner !== sl.id;
      sl.faceYaw = null;
    }
    this.settle({ instant: true });
    this.station(pub.scene, true);
    this.attendGroup();
    this.d.cam.snap();
    this.applyHouse(true);
    // acting picks up the scene as it stands, silently
    if (pub.scene !== 'title') actOn(this.actDeps(), { type: 'scene', at: 0, data: { state: pub, ms: 0 } }, s);
    // anything mid-air when we joined: show it for the time it has left, silently
    for (const { ev, elapsed } of inProgress) {
      const d = ev.data as { ms: number };
      const left = d.ms - elapsed;
      if (left < 300 || ev.type === 'scene') continue;
      this.spoken(ev, left, true, elapsed);
    }
  }

  private actDeps() {
    return { cast: this.d.cast, cam: this.d.cam, room: this.actingRoom };
  }

  event(ev: DatingEvent, s: ShowState) {
    this.state = s;
    this.cancelBeat();
    actOn(this.actDeps(), ev, s);
    this.d.sound.event(ev);
    try {
      switch (ev.type) {
        case 'cast':
          return;
        case 'scene':
          return this.onScene(ev);
        case 'enter':
          return this.onEnter(ev);
        default:
          return this.spoken(ev, Number((ev.data as { ms?: number })?.ms) || 0, false, 0);
      }
    } catch (e) {
      console.error('[dating stage] hangout director failed on', ev.type, e);
    }
  }

  windowChange(_s: ShowState, w: WindowInfo) {
    this.applyHouse(false);
    this.d.sound.window(w.state);
  }

  phase(_s: ShowState) {}

  matchEnd(_s: ShowState) {}

  highlight(id: string | null) {
    this.highlightId = id;
  }

  // ------------------------------------------------------------------ handlers
  private onScene(ev: Ev<'scene'>) {
    const s = this.state!;
    const pub = s.pub;
    const fresh = pub.scene !== this.lastScene;
    const prevScene = this.lastScene;
    this.lastScene = pub.scene;
    this.fromAside();
    for (const id of [...this.stepped.keys()]) this.stepBack(id);
    this.bottomPair = [];
    this.greeting = null;
    this.houseHold = false;
    this.d.bubbles.clearSay();
    if (pub.scene !== 'oneonone') this.comparing = false;
    if (pub.scene === 'pick' && prevScene !== 'pick') this.starPhase = 'seat';
    if (pub.scene === 'result') this.starPhase = 'seat';
    // anyone cut who is still in the room goes now
    for (const id of s.gone) if (this.visible(id) && !this.slot(id)!.walking) this.walkOut(id, 0);
    if (pub.scene === 'title') {
      this.left.clear();
      for (const sl of this.d.cast.slots()) {
        sl.out = false;
        if (!this.isStar(sl.id)) sl.place(DOOR_OUT.clone(), 0, { visible: false });
      }
      this.put(this.starId(), { pos: STAR_SEAT.clone(), yaw: SEAT_YAW, sit: true });
    }
    if (pub.scene === 'oneonone' && pub.focus && !fresh) {
      // the swap: the first date gets up and steps aside, the second comes over and sits, then
      // the first goes to wait by the window
      const f = pub.focus;
      const other = pub.alive.find((x) => x !== f);
      if (other && this.visible(other)) {
        const aside = { pos: v(-1.75, 0, -0.75), yaw: yawTo(v(-1.75, 0, -0.75), STAR_SEAT) };
        const t1 = this.walkTo(other, aside, { speed: 1.7 });
        const t2 = this.walkTo(f, { pos: GUEST_SEAT.clone(), yaw: SEAT_YAW, sit: true }, { speed: 1.7, delay: Math.max(300, t1 * 0.55) });
        this.after(Math.max(t1 + 200, t2 * 0.75), () => this.walkTo(other, { pos: NOOK[0]!.clone(), yaw: NOOK_YAW }, { speed: 1.5 }), 'keep');
      } else this.settle();
    } else this.settle();
    if (fresh) this.station(pub.scene, pub.scene !== 'title' && pub.scene !== 'walkon' && pub.scene !== 'result');
    if (pub.scene === 'result') {
      // the operator walks over to the couch as the two sit down
      this.after(2600, () => this.d.cam.setStation(STATIONS.couch!, false), 'keep');
    }
    this.faceSpeaker(null);
    this.attendGroup();
    this.applyHouse(false);
    this.d.sound.music(SCENE_MUSIC[pub.scene]);
    if (pub.scene !== 'pick') this.d.sound.loop('heartbeat', false);
    if (fresh) this.d.sound.sfx('whoosh');
    void ev;
  }

  private onEnter(ev: Ev<'enter'>) {
    const { who, ms } = ev.data;
    const sl = this.slot(who);
    if (!sl) return;
    sl.out = false;
    if (this.isStar(who)) {
      // the star is already on the couch: she just settles in
      if (!sl.visible) this.put(who, { pos: STAR_SEAT.clone(), yaw: SEAT_YAW, sit: true });
      this.attendGroup();
      return;
    }
    // through the door, up to the couch to say hello
    this.greeting = who;
    sl.place(DOOR_OUT.clone(), Math.PI, { visible: false });
    const path = [DOOR_OUT.clone(), ...route(DOOR_IN, GREET, this.rOf(who), this.bodies([who]))];
    const dur = Math.max(ms, walkMs(pathLength(path), 1.65));
    sl.faceYaw = yawTo(GREET, STAR_SEAT);
    sl.walkPath(path, dur, { yaw: yawTo(GREET, STAR_SEAT) });
    this.attend(who, [this.starId()]);
    this.after(dur, () => this.d.sound.sfx('spotOn'), 'lasting');
  }

  /**
   * Every event that has a speaking time. `resume` = joined mid-line: show it for `ms` left with
   * no sound and no new moves beyond putting people where the beat has them.
   */
  private spoken(ev: DatingEvent, ms: number, resume: boolean, elapsed: number) {
    const { cast, marks } = this.d;
    const star = this.starId();
    const full = Number((ev.data as { ms?: number })?.ms) || ms;
    switch (ev.type) {
      case 'line': {
        const d = ev.data;
        if (this.asideId && this.asideId !== d.who) this.fromAside();
        const onCast = this.visible(d.who) || (!!cast.get(d.who) && d.kind !== 'caller');
        if (d.kind === 'caller' || !cast.get(d.who)) {
          // a voice on the phone: the bubble over the star, with the caller's name
          this.say(star, d.text, ms, 'phone', null, { name: d.name || 'Caller', accent: this.accent(star) });
          this.attend(star, this.listeners(star));
          return;
        }
        void onCast;
        // the compare: both finalists stand up in front of her
        if (d.kind === 'compare' && !this.comparing) {
          this.comparing = true;
          if (!resume) this.settle();
          else this.settle({ instant: true });
        }
        this.say(d.who, d.text, ms);
        this.faceSpeaker(d.who, d.to);
        const also = this.listeners(d.who, d.to);
        this.attend(d.who, also);
        if (d.kind === 'exit' || d.kind === 'lose') {
          // the line said on the way to the door
          this.slot(d.who)!.out = true;
          if (this.visible(d.who)) this.walkOut(d.who, resume ? ms : full);
          if (!resume) this.voice(d.who, d.text, ms);
          return;
        }
        if (resume) return;
        this.voice(d.who, d.text, ms);
        if (d.kind === 'answer' || d.kind === 'twist' || d.kind === 'jab') this.stepIn(d.who, ms, d.kind === 'jab' ? d.to : undefined);
        return;
      }
      case 'reaction': {
        const d = ev.data;
        this.fromAside();
        const silent = !d.text || !/[A-Za-z0-9]/.test(d.text);
        if (!silent) this.say(d.who, d.text, ms);
        else this.d.bubbles.setSpeaker(d.who);
        this.faceSpeaker(d.who, d.to);
        // the camera: the star and the one she is judging
        this.attend(silent ? d.to : d.who, silent ? [d.who] : [d.to]);
        if (resume) {
          if (this.greeting === d.to && elapsed > SOUND_TIMING.markPop(full)) this.greeting = null;
          return;
        }
        if (!silent) this.voice(d.who, d.text, ms);
        const tPop = SOUND_TIMING.markPop(full) - 150;
        const to = d.to;
        const mark = d.mark;
        this.after(Math.max(0, tPop), () => {
          const target = cast.get(to);
          if (target && target.visible && this.asideId !== to) marks.pop(to, mark, () => target.headAnchor(new THREE.Vector3()));
        }, 'lasting');
        // standing: a heart steps closer, a cringe shuffles back, unsure shifts on the spot
        this.after(Math.max(0, tPop) + 420, () => this.landStanding(to, mark), 'lasting');
        return;
      }
      case 'confession': {
        const d = ev.data;
        if (!this.visible(d.who)) {
          this.say(d.who, d.text, ms, 'private', DOOR_ANCHOR);
          this.d.cam.attend({ point: DOOR_ANCHOR });
          return;
        }
        this.toAside(d.who);
        if (resume) {
          // already out there
          const sl = this.slot(d.who)!;
          const spot = this.asideSpot(d.who);
          this.put(d.who, spot);
          void sl;
        }
        this.say(d.who, d.text, ms, 'private');
        this.attend(d.who, []);
        if (resume) return;
        this.voice(d.who, d.text, ms);
        // back to the group a beat after (sooner if the next one comes)
        this.after(ms + 350, () => {
          if (this.asideId === d.who) {
            this.fromAside();
            this.attendGroup();
          }
        }, 'lasting');
        return;
      }
      case 'twist': {
        // no card: she will say it. Everyone turns to her.
        this.fromAside();
        this.faceSpeaker(star);
        this.attend(star, this.listeners(star), true);
        return;
      }
      case 'bottom': {
        const d = ev.data;
        this.fromAside();
        const pair = (Array.isArray(d.who) ? d.who : []).filter((id) => this.visible(id));
        const hold = Math.max(0, Math.min(full, Number(d.holdMs) || 3000));
        const spokenMs = Math.max(0, full - hold) - elapsed;
        if (spokenMs > 300) this.say(d.by, d.text, spokenMs);
        this.faceSpeaker(d.by);
        this.attend(d.by, pair, true);
        const warn = SOUND_TIMING.bottomWarn(full, hold) - elapsed;
        const forward = (instant: boolean) => {
          this.bottomPair = pair;
          for (const id of pair) {
            const sl = this.slot(id);
            if (!sl || sl.walking) continue;
            this.cancelStep(id);
            const toStar = STAR_SEAT.clone().sub(sl.pos).setY(0).normalize();
            const p = sl.pos.clone().addScaledVector(toStar, 0.55);
            clearOfCouch(p, 0.5);
            const pl = { pos: p, yaw: yawTo(p, STAR_SEAT) };
            if (instant) this.put(id, pl);
            else this.walkTo(id, pl, { speed: 1.2 });
          }
          // the silence: hold both of them and her
          this.attend(null, [d.by, ...pair], true);
        };
        if (resume && warn <= 0) forward(true);
        else this.after(Math.max(0, warn - 100), () => forward(false), 'lasting');
        if (!resume) this.voice(d.by, d.text, Math.max(300, full - hold));
        return;
      }
      case 'cut': {
        const d = ev.data;
        this.fromAside();
        this.say(d.by, d.text, ms);
        this.faceSpeaker(d.by, d.who);
        this.attend(d.by, [d.who, ...this.bottomPair.filter((x) => x !== d.who)]);
        const tLamp = SOUND_TIMING.cutLamp(full) - elapsed;
        const sag = () => {
          const sl = this.slot(d.who);
          if (sl) sl.out = true;
          // the one who stays steps back into the circle
          const keep = this.bottomPair.filter((x) => x !== d.who);
          this.bottomPair = this.bottomPair.filter((x) => x === d.who);
          this.after(700, () => this.settle({ only: keep }), 'lasting');
          this.attend(d.who, [d.by]);
        };
        if (resume && tLamp <= 0) sag();
        else this.after(Math.max(0, tLamp), sag, 'lasting');
        if (!resume) this.voice(d.by, d.text, ms);
        return;
      }
      case 'replay': {
        // an earlier line comes back, remembered: lighter, italic, over them (or at the door)
        const d = ev.data;
        this.fromAside();
        const here = this.visible(d.who) && !this.left.has(d.who) && !this.slot(d.who)?.walking;
        if (here) {
          this.say(d.who, d.text, ms, 'memory');
          this.attend(d.who, [star]);
        } else {
          this.say(d.who, d.text, ms, 'memory', DOOR_ANCHOR, { name: this.nameOf(d.who, d.name), accent: this.accent(d.who) });
          this.d.cam.attend({ point: DOOR_ANCHOR, also: [star] });
        }
        return;
      }
      case 'hold': {
        // she gets up; nobody says anything; the light drops
        const d = ev.data;
        this.fromAside();
        this.d.bubbles.clearSay();
        this.houseHold = true;
        this.applyHouse(resume);
        this.starPhase = 'stand';
        const st = this.slot(star);
        if (st) {
          if (resume) this.put(star, { pos: STAR_STAND.clone(), yaw: 0 });
          else this.walkTo(star, { pos: STAR_STAND.clone(), yaw: 0 }, { speed: 1.0 });
        }
        for (const id of d.finalists) {
          const sl = this.slot(id);
          if (sl && !sl.walking && sl.visible) sl.faceYaw = yawTo(sl.pos, STAR_STAND);
        }
        this.attend(null, [star, ...d.finalists], true);
        this.after(ms, () => {
          this.houseHold = false;
          this.applyHouse(false);
        }, 'lasting');
        return;
      }
      case 'pick': {
        // she says it, the name last; as it lands she walks over to them
        const d = ev.data;
        this.fromAside();
        this.houseHold = false;
        this.applyHouse(resume);
        this.say(d.by, d.text, ms);
        this.attend(d.by, [d.who, d.loser], true);
        const tName = SOUND_TIMING.pickLight(full) - elapsed;
        const go = (instant: boolean) => {
          this.starPhase = 'winner';
          const t = this.state ? this.targets(this.state).get(star) : null;
          if (t) {
            if (instant) this.put(star, t);
            else this.walkTo(star, t, { speed: 1.25 });
          }
          const w = this.slot(d.who);
          if (w && !w.walking) w.faceYaw = t ? yawTo(w.pos, t.pos) : w.faceYaw;
          this.attend(d.who, [d.by], false);
        };
        if (resume && tName <= 0) go(true);
        else this.after(Math.max(0, tName), () => go(false), 'lasting');
        if (!resume) this.voice(d.by, d.text, ms);
        return;
      }
      case 'reveal': {
        // she names what she likes; if a line proved it, it comes back over whoever said it
        const d = ev.data;
        this.fromAside();
        const q = d.quote;
        const first = q ? Math.max(300, full * 0.45 - elapsed) : ms;
        if (first > 250) {
          this.say(star, d.text, first);
          this.attend(star, this.listeners(star), true);
        }
        if (q) {
          const at = Math.max(0, full * 0.45 - elapsed);
          this.after(at, () => {
            const here = this.visible(q.who) && !this.left.has(q.who);
            const left = full - full * 0.45;
            if (here) {
              this.say(q.who, q.text, left, 'memory');
              this.attend(q.who, [star]);
            } else {
              this.say(q.who, q.text, left, 'memory', DOOR_ANCHOR, { name: this.nameOf(q.who, q.name), accent: this.accent(q.who) });
              this.d.cam.attend({ point: DOOR_ANCHOR, also: [star] });
            }
          });
        }
        if (!resume && !q) this.voice(star, d.text, ms);
        return;
      }
      case 'result': {
        // nothing printed: the winner is already beside her on the couch
        this.fromAside();
        this.d.bubbles.clearSay();
        const d = ev.data;
        this.attend(null, [star, d.winner], true);
        return;
      }
      default:
        return;
    }
  }

  /** a mark has landed: the room rearranges to the new standing */
  private landStanding(to: string, mark: Mark) {
    const sl = this.slot(to);
    if (!sl || !sl.visible || sl.sitting) return;
    if (this.greeting === to) {
      // the walk-on: hello said, find a place in the circle
      this.greeting = null;
      this.settle();
      return;
    }
    const s = this.state;
    if (!s) return;
    const scene = s.pub.scene;
    if (scene !== 'walkon' && scene !== 'round1' && scene !== 'round2') return;
    const before = sl.pos.clone();
    this.stepped.delete(to);
    this.settle();
    const t = this.targets(s).get(to);
    if (mark === 'unsure' && t && Math.hypot(t.pos.x - before.x, t.pos.z - before.z) < 0.08 && !sl.walking) {
      // shifts on the spot: a little side step and back
      const side = new THREE.Vector3(Math.cos(sl.yaw), 0, -Math.sin(sl.yaw)).multiplyScalar(0.16);
      const p = before.clone().add(side);
      sl.walkPath([before.clone(), p], 380, { yaw: sl.yaw });
      this.after(760, () => {
        if (!sl.walking) sl.walkPath([sl.pos.clone(), t.pos.clone()], 420, { yaw: t.yaw });
      }, 'lasting');
    }
  }

  // ------------------------------------------------------------------ per frame
  update(dt: number) {
    this.clock += dt;
    if (this.jobs.length) {
      const due = this.jobs.filter((j) => j.at <= this.clock);
      if (due.length) {
        this.jobs = this.jobs.filter((j) => j.at > this.clock);
        for (const j of due.sort((a, b) => a.at - b.at)) j.fn();
      }
    }
    // the betting clock is sound only here (no clock on the wall)
    const w = this.feed?.currentWindow();
    if (w && w.state === 'open' && this.feed) this.d.sound.clock((w.closesAt - this.feed.serverNow()) / 1000);
    else this.d.sound.clock(null);
    // the veil: up while someone talks to the lens
    const want = this.asideId ? 0.42 : 0;
    this.veilOn += (want - this.veilOn) * Math.min(1, dt * 4);
    this.veil.visible = this.veilOn > 0.01;
  }

  /** after the camera moved: hang the veil just behind the confessor, then the bubbles and plates */
  overlay(dt: number) {
    const cam = this.d.cam.camera;
    if (this.veil.visible) {
      const id = this.asideId;
      const f = id ? this.slot(id)?.faceAnchor(new THREE.Vector3()) : null;
      const camDir = cam.getWorldDirection(new THREE.Vector3());
      const depth = f ? Math.max(1.2, f.clone().sub(cam.position).dot(camDir) + 0.55) : 3.4;
      const hgt = 2 * depth * Math.tan(((cam.fov * Math.PI) / 180) / 2) * 1.2;
      this.veil.position.copy(cam.position).addScaledVector(camDir, depth);
      this.veil.quaternion.copy(cam.quaternion);
      this.veil.scale.set(hgt * cam.aspect, hgt, 1);
      (this.veil.material as THREE.MeshBasicMaterial).opacity = this.veilOn;
    }
    this.d.bubbles.update(dt, cam);
  }

  destroy() {
    this.jobs = [];
    this.veil.removeFromParent();
  }
}

/** turn from yaw a toward yaw b by k (0..1), the short way round */
function blendYaw(a: number, b: number, k: number) {
  let d = (b - a) % (Math.PI * 2);
  if (d > Math.PI) d -= Math.PI * 2;
  if (d < -Math.PI) d += Math.PI * 2;
  return a + d * k;
}

// The director: reacts to each feed event as it arrives (the script already paces them; every
// spoken event carries `ms`) and tells camera, cast, captions, marks, cards, lights and sound what
// to do. One small handler per event type. `rebuild` draws the whole picture from state with no
// animation and no sound (late join, new episode).
//
// The cut: every scene opens on its own move, cuts land on the start of a line, long lines get a
// reaction insert (the star or a rival), no framing repeats back to back, and no shot is shorter
// than MIN_CUT seconds.
import * as THREE from 'three';
import type { Mark, PublicState, SceneId } from '../show/types.ts';
import type { Cast, Gesture, Mood, Performer } from './cast.ts';
import type { DirectorCamera, Shot, Subjects } from './camera.ts';
import type { Captions, SayStyle } from './captions.ts';
import type { CatchUp, DatingEvent, Feed, FeedSink, ShowState, WindowInfo } from './feed.ts';
import { actOn } from './acting.ts';
import { BOOTH, DATE_SPOT, DATE_YAW, SPOTS, STAR, SUITOR_FEET_Y, SUITOR_WING, spotPos, spotYaw } from './layout.ts';
import type { Lights } from './lights.ts';
import type { Marks } from './marks.ts';
import type { StudioSet } from './set.ts';
import { SOUND_TIMING, type Sound, type Track } from './sound.ts';
import { PALETTE } from './theme.ts';

export interface DirectorDeps {
  cast: Cast;
  cam: DirectorCamera;
  set: StudioSet;
  lights: Lights;
  marks: Marks;
  captions: Captions;
  sound: Sound;
  /** the stage's pixel size (for projecting name tags) */
  size(): { w: number; h: number };
}

type Ev<T extends DatingEvent['type']> = Extract<DatingEvent, { type: T }>;

/** no shot shorter than this (seconds) */
const MIN_CUT = 1.25;
/** a line at least this long (ms) gets a reaction insert */
const INSERT_MIN_MS = 4000;

const SCENE_NAME: Record<SceneId, string> = {
  title: 'Compatibility Mode',
  walkon: 'The walk-on',
  round1: 'Round one',
  booth1: 'The booth',
  round2: 'Round two',
  booth2: 'The booth',
  oneonone: 'One on one',
  pick: 'The pick',
  reveal: 'The reveal',
  result: 'Tonight',
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

/** cast members wider than their height suggests, for the camera's clutter test (by avatar folder) */
const GIRTH: Record<string, number> = { frost: 1.45, crumb: 1.45, vex: 1.35, dash: 1.15, prince: 1.15, brock: 1.1 };

const MARK_GESTURE: Record<Mark, Gesture> = { charmed: 'lean', unsure: 'shrug', cringing: 'wince' };
const MARK_MOOD: Record<Mark, Mood> = { charmed: 'happy', unsure: 'neutral', cringing: 'sad' };
const STAR_MOOD: Record<Mark, Mood> = { charmed: 'happy', unsure: 'relaxed', cringing: 'angry' };

interface Job {
  at: number;
  fn: () => void;
  group: 'beat' | 'lasting';
}

export class Director implements FeedSink {
  private d: DirectorDeps;
  private feed: Feed | null = null;
  private clock = 0;
  private jobs: Job[] = [];
  private state: ShowState | null = null;
  private boothOccupant: string | null = null;
  private focus: string | null = null;
  private highlightId: string | null = null;
  private dealt = false;
  private tmp = new THREE.Vector3();
  private shownCards = '';
  private lastScene: SceneId | null = null;
  /** what each performer was last told to look at (the camera frames faces from it) */
  private gazes = new Map<string, THREE.Vector3>();
  /** the cut's memory */
  private lastKey = '';
  private lastCutAt = -99;
  private insertTurn = 0;
  private boothTurn = 0;
  private cardsTurn = 0;
  private duoSeen = new Set<string>();
  /** the scene's opening move is on screen and no line has played over it yet */
  private sceneFresh = false;
  private rebuiltAt = -99;

  constructor(d: DirectorDeps) {
    this.d = d;
    d.cam.bind(this.subjects);
  }

  attach(feed: Feed) {
    this.feed = feed;
  }

  /** what the camera needs to know about the room */
  readonly subjects: Subjects = {
    starId: () => this.d.cast.meta?.star.id ?? null,
    face: (id) => {
      const p = this.d.cast.get(id);
      return p && p.visible ? p.faceAnchor(new THREE.Vector3()) : null;
    },
    head: (id) => {
      const p = this.d.cast.get(id);
      return p && p.visible ? p.headAnchor(new THREE.Vector3()) : null;
    },
    feet: (id) => {
      // the performer's root may be a wrapper at the origin: stand the feet under the face, on
      // whatever floor is there (a podium, the star's riser, the deck)
      const f = this.faceOf(id);
      if (!f) return null;
      let y = 0;
      if (this.isStar(id) && Math.hypot(f.x - STAR.seat.x, f.z - STAR.seat.z) < 1.2) y = STAR.seat.y;
      else if (SPOTS.some((sp) => Math.hypot(f.x - sp.x, f.z - sp.z) < 0.6)) y = SUITOR_FEET_Y;
      return new THREE.Vector3(f.x, y, f.z);
    },
    // who they mean to look at (acting then cheats the face toward whatever lens is chosen; its
    // cheated look would drag the next shot toward the last camera, so it is only the fallback)
    gaze: (id) => this.gazes.get(id)?.clone() ?? this.d.cast.slot(id)?.lookTarget ?? null,
    present: () => this.d.cast.all().filter((p) => p.visible && p.id !== this.boothOccupant).map((p) => p.id),
    yaw: (id) => this.yawOf(id),
    girth: (id) => GIRTH[this.d.cast.member(id)?.cast ?? id] ?? GIRTH[id] ?? 1,
    standing: () => (this.state?.pub.alive ?? []).filter((id) => !!this.faceOf(id) && id !== this.boothOccupant),
    partner: (id) => {
      const star = this.meta()?.star.id;
      if (!star) return null;
      if (id !== star) return this.faceOf(star) ?? STAR.seat.clone().setY(1.2);
      return (this.focus ? this.faceOf(this.focus) : null) ?? this.rowCenter();
    },
  };

  // ------------------------------------------------------------------ helpers
  private after(ms: number, fn: () => void, group: Job['group'] = 'beat') {
    this.jobs.push({ at: this.clock + ms / 1000, fn, group });
  }
  private cancelBeat() {
    // a new event: drop pending camera beats, but land every lasting effect now
    const run: Job[] = [];
    for (const j of this.jobs) if (j.group === 'lasting') run.push(j);
    this.jobs = [];
    for (const j of run.sort((a, b) => a.at - b.at)) j.fn();
  }

  private meta() {
    return this.d.cast.meta;
  }
  private isStar(id: string) {
    return this.meta()?.star.id === id;
  }
  private accent(id: string) {
    return this.d.cast.member(id)?.accent || PALETTE.tungsten;
  }
  private nameOf(id: string, fallback = '') {
    return this.d.cast.member(id)?.name ?? fallback;
  }
  private spotOf(id: string) {
    return this.d.cast.suitor(id)?.spot ?? -1;
  }
  private yawOf(id: string) {
    if (this.isStar(id)) return STAR.yaw;
    if (this.boothOccupant === id) return BOOTH.yaw;
    if (this.focus === id) return DATE_YAW;
    const s = this.spotOf(id);
    return s >= 0 ? spotYaw(s) : 0;
  }
  private homeOf(id: string): { pos: THREE.Vector3; yaw: number; sit: boolean } {
    if (this.isStar(id)) return { pos: STAR.seat.clone(), yaw: STAR.yaw, sit: true };
    if (this.focus === id) return { pos: DATE_SPOT.clone(), yaw: DATE_YAW, sit: false };
    const s = Math.max(0, this.spotOf(id));
    return { pos: spotPos(s), yaw: spotYaw(s), sit: false };
  }
  private faceOf(id: string | null | undefined): THREE.Vector3 | null {
    if (!id) return null;
    const p = this.d.cast.get(id);
    if (!p || !p.visible) return null;
    return p.faceAnchor(new THREE.Vector3());
  }
  private rowCenter() {
    return new THREE.Vector3(2.4, 1.3, -0.6);
  }
  private cutIds(): Set<string> {
    return new Set((this.state?.pub.cut ?? []).map((c) => c.id));
  }
  /** suitors still in and on their spots (not walking off, not in the booth) */
  private standingIds() {
    return this.subjects.standing();
  }

  /** look, and remember it for the camera */
  private look(p: Performer | undefined, t: THREE.Vector3 | null) {
    if (!p) return;
    p.lookAt(t);
    if (t) this.gazes.set(p.id, t.clone());
    else this.gazes.delete(p.id);
  }

  /** everyone on stage looks at the speaker; the speaker looks at `to` or the natural partner */
  private looksFor(speaker: string | null, to?: string) {
    const meta = this.meta();
    if (!meta) return;
    const sp = this.faceOf(speaker);
    for (const p of this.d.cast.all()) {
      if (!p.visible) continue;
      if (p.id === speaker) {
        let t = to ? this.faceOf(to) : this.isStar(p.id) ? (this.focus ? this.faceOf(this.focus) : this.rowCenter()) : this.faceOf(meta.star.id);
        this.look(p, t);
      } else if (this.boothOccupant === p.id) {
        this.look(p, BOOTH.camera.clone());
      } else this.look(p, sp ?? (this.isStar(p.id) ? this.rowCenter() : this.faceOf(meta.star.id)));
    }
  }

  private say(who: string, name: string, text: string, ms: number, style: SayStyle = 'normal') {
    this.d.captions.say({ name: name || this.nameOf(who, who), accent: this.accent(who), text, ms, style });
  }

  private voice(who: string, text: string, ms: number) {
    this.d.sound.speak(who, this.d.cast.member(who)?.voice, text, ms);
    this.d.cast.get(who)?.speak(ms);
  }

  // ------------------------------------------------------------------ the cut
  private keyOf(s: Shot) {
    return `${s.name}:${s.id ?? ''}:${s.to ?? ''}:${s.variant ?? ''}`;
  }

  /** can this shot be framed right now (subjects on stage, a clean angle exists)? */
  private framable(s: Shot) {
    const one = (id?: string) => !id || !!this.faceOf(id);
    if (!one(s.id) || !one(s.to)) return false;
    if (s.name === 'ots') {
      // across the room the row stacks up behind itself: only close pairs get a shoulder shot
      const a = this.faceOf(s.id), b = this.faceOf(s.to);
      if (!a || !b || a.distanceTo(b) > 6) return false;
      return this.d.cam.canFrame(s);
    }
    if (s.name === 'starReaction' || s.name === 'starMedium' || s.name === 'pickPush') return !!this.faceOf(this.meta()?.star.id);
    return true;
  }

  /** the first framable shot that is not the framing on screen now */
  private choose(...options: (Shot | null | undefined | false)[]): Shot | null {
    const star = this.meta()?.star.id;
    for (let s of options) {
      if (!s) continue;
      if (!s.id && (s.name === 'starReaction' || s.name === 'starMedium')) s = { ...s, id: star };
      // a different person in the same size of single is still the same framing twice
      const sameSize = (s.name === 'closeup' || s.name === 'medium') && this.lastKey.startsWith(s.name + ':');
      if (this.framable(s) && this.keyOf(s) !== this.lastKey && !sameSize) return s;
    }
    return null;
  }

  /**
   * Cut (or ease) to a shot. Never the same framing twice; a cut that comes too soon after the
   * last one waits until the minimum shot length is up (scene openings are forced).
   */
  private shot(s: Shot | null, opts: { ease?: number; force?: boolean } = {}) {
    if (!s) return false;
    // the star's own shots carry her id, so acting knows the lens is on her
    if (!s.id && (s.name === 'starReaction' || s.name === 'starMedium' || s.name === 'pickPush')) s = { ...s, id: this.meta()?.star.id };
    const key = this.keyOf(s);
    if (key === this.lastKey && !opts.force) return false;
    const since = this.clock - this.lastCutAt;
    if (since < MIN_CUT && !opts.force) {
      this.after((MIN_CUT - since) * 1000 + 10, () => this.shot(s, opts));
      return false;
    }
    if (opts.ease) this.d.cam.ease(s, opts.ease);
    else this.d.cam.cut(s);
    this.lastKey = key;
    this.lastCutAt = this.clock;
    return true;
  }

  /** a reaction cut inside a long line, at a moment that leaves both shots long enough */
  private insert(ms: number, s: () => Shot | null, at = 0.52) {
    if (ms < INSERT_MIN_MS) return;
    const t = Math.max(MIN_CUT * 1000 + 200, Math.min(ms * at, ms + 500 - MIN_CUT * 1000 - 200));
    if (t <= MIN_CUT * 1000) return;
    this.after(t, () => this.shot(s()));
  }

  /** a listener for a suitor's line: the star, then a rival, then the row, in turn */
  private listenerFor(who: string): Shot | null {
    const rivals = this.standingIds().filter((id) => id !== who);
    const n = this.insertTurn++ % 3;
    const rival = rivals.length ? rivals[(this.insertTurn >> 1) % rivals.length] : undefined;
    const row: Shot | null = rivals.length >= 2 ? { name: 'row' } : null;
    const rivalShot: Shot | null = rival ? { name: 'closeup', id: rival } : null;
    const order: (Shot | null)[] =
      n === 0 ? [{ name: 'starMedium' }, rivalShot, row]
      : n === 1 ? [rivalShot, { name: 'starMedium' }, row]
      : [row, { name: 'starMedium' }, rivalShot];
    return this.choose(...order);
  }

  private returnFromBooth() {
    const id = this.boothOccupant;
    if (!id) return;
    this.boothOccupant = null;
    const p = this.d.cast.get(id);
    const st = this.state;
    if (!p || !st) return;
    const gone = st.gone.has(id);
    const h = this.homeOf(id);
    p.place(h.pos, h.yaw, { visible: !gone && st.entered.has(id) });
    p.setLit(!this.cutIds().has(id) || st.pub.winner === id);
  }

  /** the shot a scene settles on (late join, and after a booth) */
  private sceneShot(scene: SceneId, pub: PublicState): Shot {
    switch (scene) {
      case 'title':
        return { name: 'wide' };
      case 'walkon':
        return { name: 'wide' };
      case 'round1':
      case 'round2':
        return { name: 'row' };
      case 'booth1':
      case 'booth2':
        // the booth is only seen with someone in it: between confessions, the room
        return { name: 'row' };
      case 'oneonone':
        return pub.focus ? { name: 'twoShot', id: pub.focus } : { name: 'wide' };
      case 'pick':
        return { name: 'wide' };
      case 'reveal':
        return { name: 'cards' };
      case 'result':
        return { name: 'wide' };
    }
  }

  /** each scene opens on its own move, so a viewer who joins on it knows where the show is */
  private sceneOpening(scene: SceneId, pub: PublicState): { shot: Shot; ease?: number } {
    switch (scene) {
      case 'title':
        return { shot: { name: 'wideHigh' } }; // the empty room from above, settling down
      case 'walkon':
        return { shot: { name: 'wide' }, ease: 2200 }; // continues down into the room
      case 'round1':
        return { shot: { name: 'wideHigh' } }; // the crane: count the lights
      case 'booth1':
      case 'booth2':
        // the room while the title is up; the booth itself opens on its first confessor
        return { shot: { name: 'row' } };
      case 'round2':
        return { shot: { name: 'cut' } }; // level on all four spots: who is still lit
      case 'oneonone':
        return { shot: pub.focus ? { name: 'twoShot', id: pub.focus } : { name: 'wide' } }; // an arc across the pair
      case 'pick':
        return { shot: { name: 'wide' } }; // the whole room, pushing in
      case 'reveal':
        return { shot: { name: 'cards', variant: this.cardsTurn++ } }; // the star, as her cards turn
      case 'result':
        return { shot: { name: 'wide' }, ease: 1600 };
    }
  }

  private sceneTitle(pub: PublicState): { text: string; sub: string } {
    const meta = this.meta();
    if (pub.scene === 'title') {
      return { text: meta?.show || SCENE_NAME.title, sub: meta ? `Episode ${meta.episode}, starring ${meta.star.name}` : '' };
    }
    let sub = '';
    if (pub.scene === 'oneonone') sub = pub.alive.map((id) => this.nameOf(id)).join(' and ');
    return { text: sentence(pub.label) || SCENE_NAME[pub.scene], sub };
  }

  /** lamps, pips, cards, twist, round, pick light: all lasting state, applied instantly */
  private applyLasting(s: ShowState, animateCards: boolean) {
    const { lights, marks, captions } = this.d;
    const cut = this.cutIds();
    for (const m of this.d.cast.bySpot()) {
      const on = s.entered.has(m.id) && !cut.has(m.id) && !s.gone.has(m.id);
      lights.setLamp(m.spot, on, m.accent);
      // the tally stays with its suitor's podium; a suitor who is out goes dark, marks faint in the glass
      marks.setPips(m.spot, s.pub.marks[m.id] ?? [], false, cut.has(m.id), m.accent);
    }
    for (let i = 0; i < 4; i++) if (!this.d.cast.bySpot().some((m) => m.spot === i)) lights.setLamp(i, false);
    // cards: dealt from the walk-on on
    const dealt = s.pub.scene !== 'title';
    const key = JSON.stringify(s.pub.cards);
    if (!dealt) {
      captions.setCards(null);
    } else if (key !== this.shownCards || !this.dealt) {
      const prev = this.shownCards ? (JSON.parse(this.shownCards) as PublicState['cards']) : [];
      let flip: number | null = null;
      for (const c of s.pub.cards) {
        const was = prev.find((x) => x.slot === c.slot);
        const turned = animateCards && c.faceUp && !was?.faceUp;
        if (turned) flip = c.slot;
      }
      captions.setCards(s.pub.cards, flip);
      if (animateCards && !this.dealt) this.d.sound.sfx('deal');
      if (flip !== null) this.d.sound.sfx('card');
    }
    this.dealt = dealt;
    this.shownCards = dealt ? key : '';
    captions.twist(s.pub.twist ? { label: s.pub.twist.label, rule: s.pub.twist.rule } : null, 0);
    captions.setRound(s.pub.scene === 'title' ? '' : sentence(s.pub.label) || SCENE_NAME[s.pub.scene]);
    const w = s.pub.winner;
    const showPick = !!w && (s.pub.scene === 'pick' || s.pub.scene === 'reveal' || s.pub.scene === 'result');
    lights.setPick(showPick && w ? this.homeOfFloor(w) : null);
    this.applyHighlight();
  }

  private homeOfFloor(id: string) {
    const h = this.homeOf(id);
    return new THREE.Vector3(h.pos.x, this.focus === id ? 0 : h.pos.y, h.pos.z);
  }

  private applyHouse(instant: boolean) {
    const w = this.feed?.currentWindow();
    this.d.lights.setHouse(w && w.state === 'open' ? 'up' : 'down', instant);
  }

  // ------------------------------------------------------------------ FeedSink
  rebuild(s: ShowState, inProgress: CatchUp[]) {
    this.state = s;
    this.jobs = [];
    this.boothOccupant = null;
    this.gazes.clear();
    const { cast, captions, marks, sound } = this.d;
    sound.rebuild(s.meta ? s.pub.scene : null, s.meta);
    marks.clearPops();
    captions.clearSay();
    captions.clearTitle();
    if (!s.meta) {
      cast.clear();
      captions.clearTags();
      captions.setRound('');
      captions.setCards(null);
      captions.twist(null);
      this.shot({ name: 'wide' }, { force: true });
      this.applyHouse(true);
      return;
    }
    const cur = cast.meta;
    if (!cur || cur.star.id !== s.meta.star.id || cur.episode !== s.meta.episode || cur.suitors.map((x) => x.id).join() !== s.meta.suitors.map((x) => x.id).join()) {
      cast.build(s.meta);
      captions.setStar(s.meta.star.name, s.meta.star.accent);
      captions.clearTags();
      for (const m of s.meta.suitors) captions.setTag(m.id, { name: m.name, accent: m.accent });
    }
    this.focus = s.pub.scene === 'oneonone' ? s.pub.focus : null;
    this.lastScene = s.pub.scene;
    const cut = this.cutIds();
    for (const p of cast.all()) {
      const on = s.entered.has(p.id) && !s.gone.has(p.id);
      const h = this.homeOf(p.id);
      p.place(h.pos, h.yaw, { sit: h.sit, visible: on });
      p.setLit(!cut.has(p.id));
      p.setPosture(cut.has(p.id) ? 'slump' : null);
      p.mood(cut.has(p.id) ? 'sad' : s.pub.winner === p.id ? 'happy' : 'neutral');
    }
    this.shownCards = '';
    this.dealt = false;
    this.applyLasting(s, false);
    this.applyHouse(true);
    this.looksFor(null);
    // acting picks up the scene as it stands (who watches whom, the date's pair), silently
    if (s.pub.scene !== 'title') actOn(this.d, { type: 'scene', at: 0, data: { state: s.pub, ms: 0 } }, s);
    this.shot(this.sceneShot(s.pub.scene, s.pub), { force: true });
    this.lastCutAt = -99; // a late join: the next line may cut at once
    this.rebuiltAt = this.clock;
    // anything that was mid-air when we joined: show it for the time it has left, silently
    for (const { ev, elapsed } of inProgress) {
      const d = ev.data as { ms: number };
      const left = d.ms - elapsed;
      if (left < 300) continue;
      if (ev.type === 'scene') {
        const t = this.sceneTitle(ev.data.state);
        captions.title(t.text, t.sub, left, ev.data.state.scene);
      } else this.spoken(ev, left, true);
    }
  }

  event(ev: DatingEvent, s: ShowState) {
    this.state = s;
    this.cancelBeat();
    actOn(this.d, ev, s); // stage/acting.ts: who looks where, how each reaction lands
    this.d.sound.event(ev); // stage/sound.ts owns every sound and its timing (never throws)
    try {
      switch (ev.type) {
        case 'cast':
          return; // same cast: nothing to redraw
        case 'scene':
          return this.onScene(ev);
        case 'enter':
          return this.onEnter(ev);
        default:
          return this.spoken(ev, Number((ev.data as { ms?: number })?.ms) || 0, false);
      }
    } catch (e) {
      console.error('[dating stage] director failed on', ev.type, e);
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
    this.applyHighlight();
  }

  private applyHighlight() {
    const id = this.highlightId;
    const s = this.state;
    const spot = id ? this.spotOf(id) : -1;
    const visible = !!id && spot >= 0 && !!s && !s.gone.has(id);
    this.d.lights.setHighlight(visible ? spot : null);
  }

  // ------------------------------------------------------------------ handlers
  private onScene(ev: Ev<'scene'>) {
    const s = this.state!;
    const pub = s.pub;
    const { captions, cast, sound } = this.d;
    this.returnFromBooth();
    captions.clearSay();
    // one on one: the finalist alone with the star walks to the date spot
    const newFocus = pub.scene === 'oneonone' ? pub.focus : null;
    if (newFocus !== this.focus) {
      const old = this.focus;
      this.focus = newFocus;
      if (old) {
        const p = cast.get(old);
        const h = this.homeOf(old);
        if (p?.visible) p.moveTo(h.pos, h.yaw, 1600);
      }
      if (newFocus) cast.get(newFocus)?.moveTo(DATE_SPOT.clone(), DATE_YAW, 1800);
    }
    // anyone cut who has not walked off yet goes now
    for (const id of s.gone) {
      const p = cast.get(id);
      if (p?.visible && !p.walking) p.exit(SUITOR_WING, 2200);
    }
    if (pub.scene === 'title') for (const p of cast.all()) if (!s.entered.has(p.id)) p.place(new THREE.Vector3(), 0, { visible: false });
    this.applyLasting(s, true);
    // a scene event inside the same scene (one on one: the focus changes) is not a new title call
    const fresh = pub.scene !== this.lastScene;
    this.lastScene = pub.scene;
    if (fresh) this.duoSeen.clear();
    const t = this.sceneTitle(pub);
    if (fresh && ev.data.ms > 0) captions.title(t.text, t.sub, ev.data.ms, pub.scene);
    this.looksFor(null);
    if (newFocus) {
      // the pair look at each other as the finalist arrives
      this.look(cast.get(newFocus), this.faceOf(this.meta()?.star.id));
      this.look(cast.star, DATE_SPOT.clone().setY(1.3));
    }
    const open = this.sceneOpening(pub.scene, pub);
    // (a late join lands on the same opening a moment earlier: do not restart it)
    const justOpened = this.clock - Math.max(this.lastCutAt, this.rebuiltAt) < 0.6;
    if (!(this.keyOf(open.shot) === this.lastKey && justOpened)) this.shot(open.shot, { force: true, ease: open.ease });
    this.sceneFresh = true;
    sound.music(SCENE_MUSIC[pub.scene]);
    if (pub.scene !== 'pick') sound.loop('heartbeat', false);
    if (fresh) sound.sfx('whoosh');
  }

  private onEnter(ev: Ev<'enter'>) {
    const { who, ms } = ev.data;
    const p = this.d.cast.get(who);
    if (!p) return;
    const star = this.isStar(who);
    const h = this.homeOf(who);
    const from = star ? STAR.wing.clone() : SUITOR_WING.clone();
    p.setLit(true);
    p.setPosture(null);
    p.enter(from, h.pos, h.yaw, ms, { sit: star });
    this.shot({ name: 'entrance', id: who }, { force: true });
    // the others watch the newcomer arrive
    for (const o of this.d.cast.all()) if (o.id !== who && o.visible) this.look(o, h.pos.clone().setY(1.2));
    this.after(
      ms,
      () => {
        const sp = this.spotOf(who);
        if (!star && sp >= 0) {
          this.d.lights.setLamp(sp, true, this.accent(who));
          this.d.sound.sfx('spotOn');
        }
        this.look(p, star ? this.rowCenter() : this.faceOf(this.meta()?.star.id));
      },
      'lasting',
    );
  }

  /** the opening framing for a line, by kind, never repeating what is on screen */
  private lineShot(who: string, kind: string, to: string | undefined, onCast: boolean): Shot | null {
    const starId = this.meta()?.star.id ?? '';
    // already on this speaker alone (a quote replay, a reaction landing): let the line play there
    if (this.lastKey.startsWith(`closeup:${who}:`) || this.lastKey.startsWith(`medium:${who}:`)) return null;
    if (kind === 'caller' || !onCast) return this.choose({ name: 'starReaction' }, { name: 'starMedium' }, { name: 'wide' });
    if (who === starId) {
      if (kind === 'hold') return this.choose({ name: 'starReaction' }, { name: 'starMedium' });
      return this.choose({ name: 'starMedium' }, { name: 'starReaction' }, { name: 'wide' });
    }
    if (kind === 'jab' && to && this.faceOf(to)) return this.choose({ name: 'closeup', id: who }, { name: 'medium', id: who }, { name: 'pair', id: who, to });
    // the dark, slumped suitor turns less to the lens: frame for that
    if (kind === 'exit') return this.choose({ name: 'cut' }, { name: 'row' }, { name: 'medium', id: who, cheat: 0.3 });
    if (kind === 'lose') return this.choose({ name: 'medium', id: who, cheat: 0.3 }, { name: 'closeup', id: who, cheat: 0.3 }, { name: 'starReaction' });
    // every suitor line, the one on one included: the speaker alone, from the front
    return this.choose({ name: 'closeup', id: who }, { name: 'medium', id: who });
  }

  /** two suitors in one frame: side by side on the row a pair shot, further apart the level row wide */
  private twoOf(a: string | undefined, b: string | undefined): Shot | null {
    if (!a || !b || !this.faceOf(a) || !this.faceOf(b)) return this.choose({ name: 'cut' }, { name: 'row' });
    const sa = this.spotOf(a), sb = this.spotOf(b);
    const adjacent = sa >= 0 && sb >= 0 && Math.abs(sa - sb) === 1 && this.focus !== a && this.focus !== b;
    return adjacent ? this.choose({ name: 'pair', id: a, to: b }, { name: 'cut' }) : this.choose({ name: 'cut' }, { name: 'row' });
  }

  /** run `fn` once `id` has stopped walking (at most `maxMs` from now) */
  private whenSettled(id: string, fn: () => void, maxMs: number) {
    const p = this.d.cast.get(id);
    if (!p || !p.walking || maxMs <= 0) return fn();
    this.after(120, () => this.whenSettled(id, fn, maxMs - 120));
  }

  /** the star's look lands on a suitor: the mark pops over their head and the tally lamp follows */
  private landMark(to: string, mark: Mark) {
    const { cast, marks } = this.d;
    const target = cast.get(to);
    if (target && target.visible && this.boothOccupant !== to) {
      marks.pop(to, mark, () => target.headAnchor(new THREE.Vector3()));
      target.gesture(MARK_GESTURE[mark]);
      target.mood(MARK_MOOD[mark]);
    }
    const sp = this.spotOf(to);
    if (sp >= 0) marks.setPips(sp, this.state?.pub.marks[to] ?? [], true, this.cutIds().has(to), this.accent(to));
  }

  /** a suitor in the booth, lit, looking at the lens (a confession, or a replay of someone gone) */
  private toBooth(id: string) {
    if (this.boothOccupant !== id) this.returnFromBooth();
    const p = this.d.cast.get(id);
    if (!p) return false;
    this.boothOccupant = id;
    p.place(BOOTH.seat.clone(), BOOTH.yaw, { visible: true });
    p.setLit(true);
    this.look(p, BOOTH.camera.clone());
    return true;
  }

  /**
   * Every event that has a speaking time. `resume` = joined mid-line: show it for `ms` left with
   * no sound, no gestures and no lasting changes (state already has them).
   */
  private spoken(ev: DatingEvent, ms: number, resume: boolean) {
    const { captions, cast, marks, lights } = this.d;
    const meta = this.meta();
    const starId = meta?.star.id ?? '';
    const full = Number((ev.data as { ms?: number })?.ms) || ms;
    const late = resume && ms < 0.5 * full; // joined after the insert point
    // the first line of a scene plays over its opening move (the title card covers its start)
    const fresh = this.sceneFresh && !resume;
    this.sceneFresh = false;
    switch (ev.type) {
      case 'line': {
        const d = ev.data;
        if (this.boothOccupant && this.boothOccupant !== d.who) this.returnFromBooth();
        const isStar = d.who === starId;
        const onCast = !!cast.get(d.who) && !!this.faceOf(d.who);
        this.looksFor(onCast ? d.who : null, d.to);
        const carry = fresh && (d.kind === 'question' || d.kind === 'hold' || d.kind === 'twistintro');
        this.say(d.who, d.name, d.text, ms, d.kind === 'caller' || !onCast ? 'caller' : 'normal');
        const alive = (this.state?.pub.alive ?? []).filter((id) => !!this.faceOf(id));
        // the insert: the one spoken to or about, or the row listening (the star asks)
        const insertFor = (): Shot | null => {
          if (!onCast) return null;
          if (isStar) {
            if (carry) return this.choose({ name: 'starMedium' }, { name: 'starReaction' });
            if (d.kind === 'question' || d.kind === 'twistintro' || d.kind === 'intro' || d.kind === 'outro') return this.choose({ name: 'row' }, { name: 'wide' });
            if ((d.kind === 'verdict' || d.kind === 'duo') && d.to && this.faceOf(d.to)) return this.choose({ name: 'closeup', id: d.to, cheat: 0.3 }, { name: 'medium', id: d.to, cheat: 0.3 });
            if (d.kind === 'compare' && alive.length === 2) return this.twoOf(alive[0], alive[1]);
            if (this.focus && this.faceOf(this.focus)) return this.choose({ name: 'closeup', id: this.focus, cheat: 0.3 });
            return null;
          }
          if (d.kind === 'jab' && d.to && this.faceOf(d.to)) return this.choose({ name: 'closeup', id: d.to, cheat: 0.3 }, { name: 'medium', id: d.to, cheat: 0.3 });
          if (d.kind === 'answer' && d.to && this.faceOf(d.to)) return this.choose({ name: 'closeup', id: d.to, cheat: 0.3 }, { name: 'medium', id: d.to, cheat: 0.3 });
          if (d.kind === 'duo' || d.kind === 'opener') return this.choose({ name: 'starReaction' }, { name: 'starMedium' });
          if (d.kind === 'answer' || d.kind === 'twist') return this.listenerFor(d.who);
          return null;
        };
        if (late) {
          this.shot(insertFor() ?? this.lineShot(d.who, d.kind, d.to, onCast), { force: true });
          return;
        }
        if (resume) {
          this.shot(this.lineShot(d.who, d.kind, d.to, onCast), { force: true });
          return;
        }
        // a suitor still walking to their mark: stay on the walk, frame them once they stand
        this.whenSettled(d.who, () => this.shot(carry ? null : this.lineShot(d.who, d.kind, d.to, onCast)), Math.min(2500, ms * 0.6));
        this.insert(ms, insertFor);
        this.voice(d.who, d.text, ms);
        const p = cast.get(d.who);
        if (d.kind === 'exit' || d.kind === 'lose') {
          this.after(
            ms + 150,
            () => {
              p?.exit(SUITOR_WING, 2600);
              this.applyHighlight();
              // never follow someone off into the wings: back to the room as they go
              if (this.lastKey.includes(`:${d.who}:`)) this.shot(this.choose({ name: 'row' }, { name: 'cut' }, { name: 'wide' }), { force: true });
            },
            'lasting',
          );
        }
        return;
      }
      case 'reaction': {
        const d = ev.data;
        this.returnFromBooth();
        this.looksFor(d.who, d.to);
        const silent = !d.text || !/[A-Za-z0-9]/.test(d.text);
        // the landing: a looser single, so the mark has room over the head
        const onTarget = () => this.choose({ name: 'medium', id: d.to, cheat: 0.3 }, { name: 'closeup', id: d.to, cheat: 0.3 }, { name: 'row' });
        const tPop = SOUND_TIMING.markPop(full) - 150;
        if (silent) {
          // the mark alone: no caption; the star's look, then the mark on the suitor, in their shot
          captions.clearSay();
          const onThem = this.lastKey.startsWith(`closeup:${d.to}:`) || this.lastKey.startsWith(`medium:${d.to}:`);
          if (!onThem) this.shot(onTarget(), { force: resume });
          if (resume) return;
          cast.get(d.who)?.mood(STAR_MOOD[d.mark]);
          this.after(Math.max(0, tPop), () => this.landMark(d.to, d.mark), 'lasting');
          return;
        }
        // the star's face as the verdict starts, then the line lands on the suitor
        this.say(d.who, d.name, d.text, ms);
        if (late) {
          this.shot(onTarget(), { force: true });
          return;
        }
        this.shot(this.choose({ name: 'starReaction' }, { name: 'starMedium' }), { force: resume });
        if (resume) return;
        this.voice(d.who, d.text, ms);
        cast.get(d.who)?.mood(STAR_MOOD[d.mark]);
        this.after(tPop, () => this.shot(onTarget()));
        this.after(tPop + 150, () => this.landMark(d.to, d.mark), 'lasting');
        return;
      }
      case 'confession': {
        const d = ev.data;
        this.toBooth(d.who);
        this.shot({ name: 'booth', id: d.who, variant: this.boothTurn++ }, { force: true });
        this.say(d.who, d.name, d.text, ms, 'private');
        if (resume) return;
        this.voice(d.who, d.text, ms);
        // in a booth scene the camera stays in the booth until the next confession or scene;
        // anywhere else the confessor goes back to the floor when done
        const scene = this.state?.pub.scene;
        if (scene !== 'booth1' && scene !== 'booth2') {
          this.after(ms + 300, () => {
            if (this.boothOccupant === d.who) {
              this.returnFromBooth();
              this.shot(this.sceneShot(scene ?? 'booth1', this.state!.pub), { force: true });
            }
          });
        }
        return;
      }
      case 'twist': {
        const d = ev.data;
        this.returnFromBooth();
        // the card stays up while the star reads it out (the title call covers the first second)
        captions.twist({ label: d.label, rule: d.rule }, Math.max(ms, resume ? ms : 4500));
        this.looksFor(starId);
        this.shot(this.choose({ name: 'row' }, { name: 'cut' }), { force: resume });
        return;
      }
      case 'bottom': {
        // the star names the bottom two; their lamps flash; then held silence on both of them
        const d = ev.data;
        this.returnFromBooth();
        const [a, b] = Array.isArray(d.who) ? d.who : [];
        const hold = Math.max(0, Math.min(full, Number(d.holdMs) || 3000));
        const warn = SOUND_TIMING.bottomWarn(full, hold);
        const both = (): Shot | null => this.twoOf(a, b);
        const spoken = Math.max(0, full - hold) - (full - ms);
        if (spoken > 300) this.say(d.by, d.name || this.nameOf(d.by), d.text, spoken);
        else captions.clearSay();
        this.looksFor(d.by);
        if (resume) {
          this.shot(spoken > 600 ? this.choose({ name: 'starMedium' }, { name: 'starReaction' }) : both(), { force: true });
          return;
        }
        this.shot(this.choose({ name: 'starMedium' }, { name: 'starReaction' }), { force: false });
        this.voice(d.by, d.text, Math.max(300, full - hold));
        this.after(warn - 120, () => this.shot(both(), { force: true }));
        // the two lamps flash on twos, three times, and stay on
        for (const id of [a, b]) {
          const sp = id ? this.spotOf(id) : -1;
          if (sp < 0) continue;
          const acc = this.accent(id!);
          for (let k = 0; k < 6; k++) this.after(warn + k * 140, () => lights.setLamp(sp, k % 2 === 1, acc));
          this.after(warn + 6 * 140, () => lights.setLamp(sp, true, acc), 'lasting');
        }
        this.after(Math.max(0, full - hold + 100), () => captions.clearSay());
        return;
      }
      case 'cut': {
        const d = ev.data;
        this.returnFromBooth();
        this.say(d.by, this.nameOf(d.by), d.text, ms);
        this.looksFor(d.by, d.who);
        // the verdict on the star, then the light-out wide: the lamp dies, the others turn
        const tLamp = SOUND_TIMING.cutLamp(full);
        const tOut = tLamp - 450;
        if (late) {
          this.shot({ name: 'cut' }, { force: true });
          return;
        }
        this.shot(this.choose({ name: 'starReaction' }, { name: 'starMedium' }), { force: true });
        if (resume) return;
        this.voice(d.by, d.text, ms);
        cast.get(d.by)?.mood('relaxed');
        this.after(tOut, () => this.shot({ name: 'cut' }, { force: true }));
        this.after(
          tLamp,
          () => {
            const sp = this.spotOf(d.who);
            if (sp >= 0) {
              lights.setLamp(sp, false);
              marks.setPips(sp, this.state?.pub.marks[d.who] ?? [], false, true, this.accent(d.who));
            }
            const p = cast.get(d.who);
            p?.setLit(false);
            p?.setPosture('slump');
            p?.mood('sad');
          },
          'lasting',
        );
        return;
      }
      case 'replay': {
        // an earlier line played back: the replay caption, a cut to that face. Someone cut long
        // ago is shown in the booth (off the stage floor), never walked back on.
        const d = ev.data;
        const gone = !!this.state?.gone.has(d.who) || !this.faceOf(d.who) || this.boothOccupant === d.who;
        this.looksFor(starId);
        this.say(d.who, d.name || this.nameOf(d.who, d.who), d.text, ms, 'replay');
        if (gone) {
          if (this.toBooth(d.who)) this.shot({ name: 'booth', id: d.who, variant: this.boothTurn++ }, { force: true });
        } else {
          this.returnFromBooth();
          this.shot(this.choose({ name: 'closeup', id: d.who, cheat: 0.3 }, { name: 'medium', id: d.who, cheat: 0.3 }) ?? { name: 'medium', id: d.who, variant: 1 }, { force: true });
        }
        if (resume) return;
        const p = cast.get(d.who);
        if (p && !gone) p.speak(Math.max(300, ms - 400));
        if (gone) this.after(ms + 200, () => {
          if (this.boothOccupant === d.who) {
            this.returnFromBooth();
            this.shot(this.choose({ name: 'starMedium' }, { name: 'cards', variant: this.cardsTurn++ }), { force: true });
          }
        });
        return;
      }
      case 'hold': {
        const d = ev.data;
        this.returnFromBooth();
        captions.clearSay();
        this.d.lights.setHouse('hold', resume);
        this.shot({ name: 'pickPush', ms }, { force: true });
        if (resume) return;
        const star = cast.star;
        const [a, b] = d.finalists;
        for (const id of d.finalists) this.look(cast.get(id), this.faceOf(starId));
        let k = 0;
        for (let t = 400; t < ms - 300; t += 1300) {
          const id = k++ % 2 ? b : a;
          this.after(t, () => this.look(star, this.faceOf(id)));
        }
        this.after(ms, () => this.applyHouse(false), 'lasting');
        return;
      }
      case 'pick': {
        // the star says it, the name last; as the name lands the pick light finds the winner
        const d = ev.data;
        this.returnFromBooth();
        this.say(d.by, this.nameOf(d.by), d.text, ms);
        this.looksFor(d.by, d.who);
        const tLight = SOUND_TIMING.pickLight(full);
        const both = () => this.twoOf(d.who, d.loser);
        if (late) {
          this.shot(both(), { force: true });
          return;
        }
        this.shot(this.choose({ name: 'starReaction' }, { name: 'starMedium' }), { force: true });
        if (resume) return;
        this.applyHouse(false);
        this.voice(d.by, d.text, ms);
        cast.get(d.by)?.mood('happy');
        this.after(tLight - 120, () => this.shot(both(), { force: true }));
        this.after(
          tLight,
          () => {
            lights.setPick(this.homeOfFloor(d.who));
            const w = cast.get(d.who);
            w?.gesture('victory');
            w?.mood('happy');
            const sp = this.spotOf(d.loser);
            if (sp >= 0) lights.setLamp(sp, false);
            const l = cast.get(d.loser);
            l?.setLit(false);
            l?.setPosture('slump');
            l?.mood('sad');
          },
          'lasting',
        );
        return;
      }
      case 'reveal': {
        // the card on the rail turns; the star names it; a tick or a cross over each booth guesser
        const d = ev.data;
        const s = this.state;
        this.returnFromBooth();
        this.say(starId, this.nameOf(starId), d.text, ms);
        this.looksFor(starId);
        if (s) this.applyLasting(s, !resume);
        this.shot(this.choose({ name: 'cards', variant: this.cardsTurn++ }, { name: 'cards', variant: this.cardsTurn++ }), { force: true });
        if (resume) return;
        this.voice(starId, d.text, ms);
        const guessers = (Array.isArray(d.guesses) ? d.guesses : []).filter((g) => g && this.faceOf(g.who) && !s?.gone.has(g.who));
        if (guessers.length) {
          const at = Math.min(Math.max(1400, ms * 0.5), Math.max(0, ms - 400));
          this.after(
            at,
            () => {
              for (const g of guessers) {
                const p = cast.get(g.who);
                if (p?.visible) marks.verdict(g.who, !!g.right, () => p.headAnchor(new THREE.Vector3()));
              }
            },
            'lasting',
          );
          // and a look at whoever guessed, so the tick is seen
          const g0 = guessers[0]!;
          this.after(Math.max(MIN_CUT * 1000 + 50, at - 250), () => this.shot(guessers.length === 2 ? this.twoOf(guessers[0]!.who, guessers[1]!.who) : this.choose({ name: 'medium', id: g0.who, cheat: 0.3 }, { name: 'closeup', id: g0.who, cheat: 0.3 })));
        }
        return;
      }
      case 'result': {
        const d = ev.data;
        this.returnFromBooth();
        const winner = this.nameOf(d.winner, d.winner);
        captions.result({ name: winner, accent: this.accent(d.winner), ms: Math.max(ms, 6000), by: this.nameOf(starId) });
        captions.clearSay();
        const w = cast.get(d.winner);
        this.shot(w?.visible ? { name: 'result', id: d.winner } : { name: 'wide' }, { force: true });
        if (resume) return;
        if (w?.visible) {
          this.focus = d.winner;
          w.moveTo(DATE_SPOT.clone(), DATE_YAW, 2200);
          this.after(2300, () => {
            w.gesture('victory');
            lights.setPick(this.homeOfFloor(d.winner));
          });
        }
        this.look(cast.star, this.faceOf(d.winner));
        return;
      }
      default:
        // an event type this stage does not know yet: nothing on screen, never a throw
        return;
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
    // the betting clock
    const w = this.feed?.currentWindow();
    if (w && w.state === 'open' && this.feed) {
      const total = Math.max(1, w.closesAt - w.openedAt);
      this.d.set.setClock((w.closesAt - this.feed.serverNow()) / total);
      this.d.sound.clock((w.closesAt - this.feed.serverNow()) / 1000);
    } else {
      this.d.set.setClock(null);
      this.d.sound.clock(null);
    }
  }

  /** name tags: projected from each suitor's head, only on the shots that show the row */
  placeTags(camera: THREE.Camera) {
    const s = this.state;
    const { w, h } = this.d.size();
    const show = this.d.cam.showsRow();
    const cut = this.cutIds();
    for (const m of this.d.cast.bySpot()) {
      const p: Performer | undefined = this.d.cast.get(m.id);
      // a mark over the head takes the tag's place while it is up
      // a tag belongs to a suitor on their spot: not one walking on or off
      const f = p?.visible ? this.faceOf(m.id) : null;
      const sp = SPOTS[m.spot];
      const onSpot = !!f && !!sp && Math.hypot(f.x - sp.x, f.z - sp.z) < 0.9;
      if (!p || !s || !show || !onSpot || s.gone.has(m.id) || this.boothOccupant === m.id || this.d.marks.isPopping(m.id)) {
        this.d.captions.placeTag(m.id, null);
        continue;
      }
      const v = p.headAnchor(this.tmp).project(camera);
      if (v.z > 1 || v.x < -1.1 || v.x > 1.1) {
        this.d.captions.placeTag(m.id, null);
        continue;
      }
      this.d.captions.placeTag(m.id, ((v.x + 1) / 2) * w, ((1 - v.y) / 2) * h, cut.has(m.id));
    }
  }

  destroy() {
    this.jobs = [];
  }
}

/** on-stage labels are sentence case ("Round One" -> "Round one") */
function sentence(s: string | undefined) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1).toLowerCase();
}

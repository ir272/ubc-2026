// Acting: what every character on stage does, for every feed event. The director places people,
// walks them, speaks for them and switches the lamps; this file decides where everyone looks, how
// they stand, and how each reaction lands (a held beat, the move, the settle), in character.
//
// The rules, from Tomodachi Life and Animal Crossing:
// - everyone looks at whoever is talking; the speaker looks at the person addressed; nobody turns
//   their back on the lens (looks are cheated a little toward the camera, as on a stage);
// - a reaction is a beat of stillness first, then a small move, then a settle;
// - a reaction is never alone: when one suitor is charmed the others deflate or glare, when one
//   cringes the others smirk at each other;
// - no two characters stand in the same pose family at the same time;
// - the star is the boss of the room: leans in when charmed, sinks back and looks at the ceiling
//   when bored.
//
// Hooked from the director with one line (`actOn(this.d, ev, s)`) before the director's own
// handling; from then on the director's looks, gestures and moods are ignored (stage/cast.ts).
import * as THREE from 'three';
import type { Mark } from '../show/types.ts';
import type { ActGesture, ActPose, Cast, Mood } from './cast.ts';
import type { DatingEvent, ShowState } from './feed.ts';
import { BOOTH, CARD_LOOK, DATE_SPOT, STAR, spotPos } from './layout.ts';

/** what acting reads from the director's world (structural, so camera changes do not break it) */
export interface ActingDeps {
  cast: Cast;
  cam: { camera: THREE.Camera; shot: { name: string; id?: string } };
  /** a staging other than the studio (stage/hangout) says where its places are; absent = the studio */
  room?: ActingRoom;
}

/** the places acting glances at, for a staging that is not the studio */
export interface ActingRoom {
  /** this one is talking to the lens (a confession aside): they look at the camera */
  aside(id: string): boolean;
  /** where the star rolls her eyes to */
  ceiling(): THREE.Vector3;
  /** what everyone looks at while a card turns (the hangout: the star, as she says it) */
  thinking(): THREE.Vector3 | null;
  /** the middle of the group (the star's resting look) */
  center(out: THREE.Vector3): THREE.Vector3;
  /** a voice not in the room (the ex on the phone): where they look */
  phone(): THREE.Vector3;
  /** how much a look is pulled toward the lens (the studio: 1) */
  cheat: number;
  /** the door (where someone who has left is remembered) */
  door(): THREE.Vector3;
  /** out of the window: where the one waiting out a date looks */
  outside(): THREE.Vector3;
  /** looks freely, not pulled toward the lens at all (the one waiting by the window) */
  free(id: string): boolean;
}

// ------------------------------------------------------------------------------------------------
// who they are, in moves

type Family = 'loop' | 'fold' | 'behind' | 'hips' | 'clasp';

interface Temper {
  /** stance families, best first (no two on stage share one) */
  stance: Family[];
  /** on reaching their spot */
  arrive: ActGesture;
  /** opening a line */
  talk: ActGesture[];
  /** the star was charmed by them */
  charmed: ActGesture;
  /** the star was unsure */
  unsure: ActGesture;
  /** the star cringed */
  cringe: ActGesture;
  /** a rival just got a heart */
  rivalCharmed: ActGesture;
  /** a rival just got a cringe */
  rivalCringe: ActGesture;
  /** when nothing is happening (sparse) */
  fidget: ActGesture[];
  /** a held beat before their reactions land, seconds (the deadpan ones wait longer) */
  beat: number;
  /** how far they turn their face toward the lens while looking at someone (0..1) */
  cheat: number;
  /** the face is drawn on a flat front (it reads only near front on) */
  flat?: boolean;
}

const BASE: Temper = {
  stance: ['loop', 'clasp', 'behind', 'fold', 'hips'],
  arrive: 'nod',
  talk: ['lean', 'nod'],
  charmed: 'pump',
  unsure: 'shrug',
  cringe: 'wince',
  rivalCharmed: 'deflate',
  rivalCringe: 'smirk',
  fidget: ['tilt'],
  beat: 0.3,
  cheat: 0.5,
};

const TEMPER: Record<string, Partial<Temper>> = {
  // the dog: all bounce, proud of everyone, hurt easily
  brock: { stance: ['hips', 'loop', 'clasp'], arrive: 'pump', talk: ['pump', 'lean'], charmed: 'victory', unsure: 'tilt', cringe: 'deflate', rivalCharmed: 'gulp', rivalCringe: 'tilt', fidget: ['hop', 'perk'], beat: 0.2 },
  // the salesman: points at everything, pivots fast
  dash: { stance: ['loop', 'hips', 'fold'], arrive: 'point', talk: ['point', 'flourish'], charmed: 'pump', unsure: 'shrug', cringe: 'recoil', rivalCharmed: 'glare', rivalCringe: 'smirk', fidget: ['point', 'tilt'], beat: 0.18 },
  // the toaster: deadpan, judges, the longest pause
  frost: { stance: ['loop', 'clasp'], arrive: 'nod', talk: ['nod'], charmed: 'pump', unsure: 'tilt', cringe: 'gulp', rivalCharmed: 'glare', rivalCringe: 'nod', fidget: ['tilt'], beat: 0.55, cheat: 0.4, flat: true },
  // the concierge: hands behind, a bow, a blade
  maximilian: { stance: ['behind', 'fold', 'loop'], arrive: 'bow', talk: ['flourish', 'nod'], charmed: 'bow', unsure: 'tilt', cringe: 'recoil', rivalCharmed: 'smirk', rivalCringe: 'smirk', fidget: ['tilt'], beat: 0.4 },
  // the satnav: calm, floats, recalculates
  nav: { stance: ['clasp', 'loop'], arrive: 'nod', talk: ['nod', 'point'], charmed: 'hop', unsure: 'tilt', cringe: 'headshake', rivalCharmed: 'tilt', rivalCringe: 'nod', fidget: ['tilt'], beat: 0.35 },
  // the streamer: all bursts
  pixel: { stance: ['fold', 'loop'], arrive: 'hop', talk: ['point', 'hop'], charmed: 'hop', unsure: 'shrug', cringe: 'recoil', rivalCharmed: 'shrug', rivalCringe: 'smirk', fidget: ['tilt', 'perk'], beat: 0.15 },
  // the spam prince: lavish
  prince: { stance: ['hips', 'fold', 'loop'], arrive: 'flourish', talk: ['flourish', 'lean'], charmed: 'victory', unsure: 'shrug', cringe: 'recoil', rivalCharmed: 'glare', rivalCringe: 'smirk', fidget: ['flourish'], beat: 0.25 },
  // the knight: bows, takes offence, duels
  quill: { stance: ['loop', 'fold', 'behind'], arrive: 'bow', talk: ['flourish', 'lean'], charmed: 'victory', unsure: 'recoil', cringe: 'recoil', rivalCharmed: 'glare', rivalCringe: 'smirk', fidget: ['tilt'], beat: 0.3, flat: true },
  // the support bot: tiny, sorry, steel underneath
  tilly: { stance: ['behind', 'clasp'], arrive: 'bow', talk: ['nod', 'tilt'], charmed: 'hop', unsure: 'shuffle', cringe: 'deflate', rivalCharmed: 'shuffle', rivalCringe: 'gulp', fidget: ['shuffle', 'nod'], beat: 0.3 },
  // the algorithm: never surprised
  vex: { stance: ['loop', 'clasp'], arrive: 'tilt', talk: ['tilt', 'nod'], charmed: 'smirk', unsure: 'tilt', cringe: 'headshake', rivalCharmed: 'smirk', rivalCringe: 'smirk', fidget: ['tilt'], beat: 0.5, cheat: 0.35 },
};

// Crumb the toaster: member id `crumb`, avatar folder still `assets/cast/frost`. One temper either way.
TEMPER.crumb = TEMPER.frost!;

const temper = (id: string): Temper => ({ ...BASE, ...(TEMPER[id] ?? {}) });

/** how the star shows a mark while saying the reaction */
const STAR_MARK: Record<Mark, { mood: Mood; move: ActGesture }> = {
  charmed: { mood: 'happy', move: 'lean' },
  unsure: { mood: 'relaxed', move: 'leanback' },
  cringing: { mood: 'angry', move: 'recoil' },
};

// ------------------------------------------------------------------------------------------------

type Look = { id: string } | { point: THREE.Vector3 } | null;

interface Actor {
  id: string;
  /** where they look when nothing else is going on */
  base: Look;
  /** a timed look that wins over the base */
  glance: { look: Look; until: number } | null;
  /** a timed mood over the lasting one */
  mood: { name: Mood; until: number } | null;
  /** the held pause, 0..1, with an end time */
  freeze: { x: number; until: number } | null;
  /** stance family (standing at their spot) */
  family: Family;
  /** a held pose that wins over the family for a while (the booth, nerves) */
  pose: { name: ActPose; until: number } | null;
  /** last time they fidgeted */
  lastFidget: number;
  /** when their last reaction ended (keeps fidgets out of the way) */
  busyUntil: number;
}

interface Job {
  at: number;
  fn: () => void;
}

const FAMILY_POSE: Record<Family, ActPose> = { loop: 'none', fold: 'fold', behind: 'behind', hips: 'hips', clasp: 'clasp' };
const FOLD_CLIP = 'Idle_FoldArms_Loop';

const _v = new THREE.Vector3();
const _f = new THREE.Vector3();
const _d = new THREE.Vector3();
const _c = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

export class Acting {
  private d: ActingDeps;
  private time = 0;
  private jobs: Job[] = [];
  private actors = new Map<string, Actor>();
  private metaKey = '';
  private s: ShowState | null = null;
  /** who is speaking and until when (fidgets and idle glances wait for quiet) */
  private talk: { who: string; until: number } | null = null;
  private rng = mulberry(0x5eed);

  constructor(d: ActingDeps) {
    this.d = d;
  }

  // ---------------------------------------------------------------------------- helpers
  private get cast() {
    return this.d.cast;
  }
  private starId() {
    return this.cast.meta?.star.id ?? '';
  }
  private slot(id: string | null | undefined) {
    return this.cast.slot(id);
  }
  private actor(id: string): Actor {
    let a = this.actors.get(id);
    if (!a) {
      a = { id, base: null, glance: null, mood: null, freeze: null, family: 'loop', pose: null, lastFidget: 0, busyUntil: 0 };
      this.actors.set(id, a);
    }
    return a;
  }
  private at(sec: number, fn: () => void) {
    this.jobs.push({ at: this.time + Math.max(0, sec), fn });
  }
  private alive(): string[] {
    const s = this.s;
    if (!s) return this.cast.bySpot().map((m) => m.id);
    return s.pub.alive.filter((id) => this.slot(id)?.visible);
  }
  /** suitors on stage and lit (the ones who can still react) */
  private standing(except?: string[]): string[] {
    return this.alive().filter((id) => !except?.includes(id) && this.slot(id)?.inPlay);
  }
  private spotOf(id: string) {
    return this.cast.suitor(id)?.spot ?? -1;
  }
  /** the suitors either side of a spot first, then the rest */
  private neighbours(id: string, among: string[]) {
    const sp = this.spotOf(id);
    return [...among].sort((a, b) => Math.abs(this.spotOf(a) - sp) - Math.abs(this.spotOf(b) - sp));
  }
  private gesture(id: string, g: ActGesture, beat = 0.12) {
    this.slot(id)?.actGesture(g, beat);
  }
  private glance(id: string, look: Look, sec: number) {
    this.actor(id).glance = { look, until: this.time + sec };
  }
  private moodFor(id: string, m: Mood, sec: number) {
    this.actor(id).mood = { name: m, until: this.time + sec };
  }
  private freeze(id: string, x: number, sec: number) {
    this.actor(id).freeze = { x, until: this.time + sec };
  }
  private poseFor(id: string, p: ActPose, sec: number) {
    this.actor(id).pose = { name: p, until: this.time + sec };
  }
  private busy(id: string, sec: number) {
    const a = this.actor(id);
    a.busyUntil = Math.max(a.busyUntil, this.time + sec);
  }
  private pick<T>(xs: T[]): T {
    return xs[Math.floor(this.rng() * xs.length)]!;
  }
  /** every suitor (lit, on stage) looks at `id`, each turning a little after the last */
  private allLookAt(id: string | null, except: string[] = [], stagger = 0.12) {
    let k = 0;
    for (const s of this.cast.slots()) {
      if (s.id === id || except.includes(s.id) || !s.visible) continue;
      const a = this.actor(s.id);
      const delay = stagger * k++ + this.rng() * 0.08;
      const look: Look = id ? { id } : null;
      if (delay < 0.02) a.base = look;
      else this.at(delay, () => (a.base = look));
    }
  }

  // ---------------------------------------------------------------------------- cast changes
  private ensureCast() {
    const meta = this.cast.meta;
    const key = meta ? `${meta.episode}:${meta.star.id}:${meta.suitors.map((x) => x.id).join()}` : '';
    if (key === this.metaKey) return;
    this.metaKey = key;
    this.actors.clear();
    this.jobs = [];
    if (!meta) return;
    // stance families: in spot order, each takes the first of their own that is still free
    const taken = new Set<Family>();
    for (const m of [...meta.suitors].sort((a, b) => a.spot - b.spot)) {
      const prefs = [...temper(m.cast || m.id).stance, ...BASE.stance];
      const fam = prefs.find((f) => !taken.has(f)) ?? 'loop';
      taken.add(fam);
      this.actor(m.id).family = fam;
    }
    for (const s of this.cast.slots()) s.puppeted = true;
  }

  /** the character file (manifest id) behind a cast member: tempers are per avatar */
  private who(id: string) {
    return this.cast.member(id)?.cast || id;
  }
  private temper(id: string) {
    return TEMPER[id] ? temper(id) : temper(this.who(id));
  }

  // ---------------------------------------------------------------------------- events
  event(ev: DatingEvent, s: ShowState) {
    this.s = s;
    this.ensureCast();
    switch (ev.type) {
      case 'cast':
        return;
      case 'scene':
        return this.onScene(s);
      case 'enter':
        return this.onEnter(ev.data.who, ev.data.ms);
      case 'line':
        return this.onLine(ev.data.who, ev.data.kind, ev.data.text, ev.data.ms, ev.data.to);
      case 'reaction':
        return this.onReaction(ev.data.who, ev.data.to, ev.data.mark, ev.data.text, ev.data.ms);
      case 'confession':
        return this.onConfession(ev.data.who, ev.data.text, ev.data.ms, ev.data.about);
      case 'twist':
        return this.onTwist(ev.data.ms);
      case 'cut':
        return this.onCut(ev.data.who, ev.data.by, ev.data.text, ev.data.ms);
      case 'hold':
        return this.onHold(ev.data.finalists, ev.data.ms);
      case 'pick':
        return this.onPick(ev.data.who, ev.data.loser, ev.data.by, ev.data.text, ev.data.ms);
      case 'reveal':
        return this.onReveal(ev.data.text, ev.data.ms, ev.data.quote?.who, ev.data.card.kind);
      case 'result':
        return this.onResult(ev.data.winner, ev.data.ms);
      case 'replay':
        // the hangout: she looks at whoever said it (or at the door they left by)
        if (this.d.room) {
          const who = ev.data.who;
          const here = !!this.slot(who)?.visible;
          this.glance(this.starId(), here ? { id: who } : { point: this.d.room.door() }, ev.data.ms / 1000);
          for (const id of this.standing([who])) this.glance(id, here ? { id: who } : { point: this.d.room.door() }, ev.data.ms / 1000);
        }
        return;
    }
  }

  private speaking(who: string, text: string, ms: number) {
    const sl = this.slot(who);
    if (sl) sl.nextText = text;
    this.talk = { who, until: this.time + ms / 1000 };
  }

  private onScene(s: ShowState) {
    const pub = s.pub;
    const star = this.starId();
    this.talk = null;
    // a new scene: drop pending beats, release holds, anyone off their mark goes back to it
    this.jobs = [];
    for (const id of [...this.displaced.keys()]) this.stepBack(id);
    for (const a of this.actors.values()) {
      a.glance = null;
      a.freeze = null;
      a.pose = null;
    }
    // the star watches the row; the row watches the star
    for (const sl of this.cast.slots()) {
      const a = this.actor(sl.id);
      a.base = sl.id === star ? null : { id: star };
    }
    if (pub.scene === 'round1' || pub.scene === 'round2') {
      // the title call: everyone straightens up for the round, one after the other
      this.standing().forEach((id, i) => this.at(0.5 + i * 0.18, () => this.gesture(id, 'perk', 0.05)));
    }
    if (pub.scene === 'oneonone' && pub.focus) {
      const f = pub.focus;
      this.actor(star).base = { id: f };
      const other = pub.alive.find((x) => x !== f);
      // the hangout: the one waiting looks out of the window, back to the room
      if (other && this.d.room) {
        this.actor(other).base = { point: this.d.room.outside() };
        this.poseFor(other, 'fold', 60);
      } else if (other) {
      // the one waiting watches the date with their arms folded
        this.actor(other).base = { id: f };
        this.poseFor(other, 'fold', 60);
        this.at(2.2, () => this.glance(other, { id: star }, 1.4));
      }
      this.actor(f).base = { id: star };
      this.poseFor(f, 'clasp', 60);
    }
    if (pub.scene === 'pick') {
      for (const id of pub.alive) this.freeze(id, 0.5, 60);
    }
    if (pub.scene === 'reveal' && !this.d.room) {
      const cards = CARD_LOOK.clone().setY(1.35);
      for (const sl of this.cast.slots()) this.actor(sl.id).base = sl.id === star ? { point: cards } : { id: star };
      this.glance(star, { point: cards }, 3);
    }
  }

  private onEnter(who: string, ms: number) {
    const star = this.starId();
    const sec = ms / 1000;
    this.actor(who).base = who === star ? null : { id: star };
    // the room turns to watch the newcomer walk in (the look follows them every frame)
    for (const sl of this.cast.slots()) {
      if (sl.id === who || !sl.visible) continue;
      this.glance(sl.id, { id: who }, sec + 0.9);
    }
    if (who === star) return;
    const t = this.temper(who);
    // arriving: a beat on the mark, then their own entrance move, aimed at the star
    this.at(sec + 0.05, () => {
      this.glance(who, { id: star }, 2.5);
      this.gesture(who, t.arrive, 0.18);
      this.moodFor(who, 'happy', 1.8);
      this.busy(who, 2.5);
    });
    // the star gives them the once-over
    this.at(sec + 0.25, () => {
      this.glance(star, { id: who }, 2.2);
      this.gesture(star, this.rng() < 0.5 ? 'tilt' : 'nod', 0.2);
    });
    // one rival already on stage sizes them up
    const rivals = this.standing([who]).filter((id) => id !== who);
    if (rivals.length) {
      const r = this.neighbours(who, rivals)[0]!;
      this.at(sec + 0.7, () => {
        this.glance(r, { id: who }, 1.6);
        this.gesture(r, this.temper(r).rivalCringe === 'smirk' ? 'smirk' : 'tilt', 0.15);
      });
    }
  }

  private onLine(who: string, kind: string, text: string, ms: number, to?: string) {
    const star = this.starId();
    const sec = ms / 1000;
    const onCast = !!this.slot(who);
    if (onCast) this.speaking(who, text, ms);
    const t = this.temper(who);
    const listeners = this.standing([who]);

    if (kind === 'caller' || !onCast) {
      // a voice from the ceiling: everyone looks up at the line, the star looks away
      const phone = this.d.room?.phone() ?? new THREE.Vector3(0.4, 5.2, 0.5);
      for (const id of listeners) {
        this.at(this.rng() * 0.3, () => this.glance(id, { point: phone }, sec));
        this.at(0.4 + this.rng() * 0.5, () => this.gesture(id, this.pick<ActGesture>(['tilt', 'recoil', 'gulp']), 0.1));
      }
      this.glance(star, { point: this.d.room ? this.ceiling() : STAR.seat.clone().add(new THREE.Vector3(1.6, 3.6, -1.2)) }, sec);
      this.gesture(star, 'leanback', 0.3);
      this.moodFor(star, 'relaxed', sec);
      return;
    }

    // the speaker looks at whoever they are talking to
    const sp = this.actor(who);
    if (to === 'ex') sp.glance = { look: { point: this.d.room?.phone() ?? new THREE.Vector3(0.4, 5.2, 0.5) }, until: this.time + sec * 0.6 };
    else if (to && this.slot(to)) sp.base = { id: to };
    else sp.base = who === star ? null : { id: star };

    // everyone else looks at the speaker, one after another
    this.allLookAt(who, [], 0.1);

    if (who === star) {
      // the star addressing the room: her eyes sweep the row; they straighten up
      const row = this.alive();
      if (kind === 'question' || kind === 'intro' || kind === 'twistintro' || kind === 'hold' || kind === 'outro') {
        row.forEach((id, i) => this.at((sec * (i + 0.3)) / (row.length + 0.5), () => this.glance(star, { id }, sec / (row.length + 0.5))));
        if (kind === 'question' || kind === 'twistintro') row.forEach((id, i) => this.at(0.3 + i * 0.15, () => this.gesture(id, 'perk', 0.05)));
        if (kind === 'hold') for (const id of row) this.freeze(id, 0.6, sec + 6);
      }
      return;
    }

    // a suitor speaking: their own opening move, and a second beat on a long line
    if (kind === 'exit') {
      // cut and in the dark: head down, the line goes to the floor
      sp.base = { point: this.groundAhead(who) };
      this.moodFor(who, 'sad', sec + 3);
      this.gesture(who, 'deflate', 0.1);
      // the survivors watch them go
      this.allLookAt(who, [], 0.15);
      return;
    }
    if (kind === 'lose') {
      this.moodFor(who, 'sad', sec + 4);
      this.gesture(who, 'shrug', 0.25);
      this.at(sec * 0.5, () => this.glance(who, { point: this.groundAhead(who) }, sec * 0.5));
      return;
    }
    if (kind === 'win') {
      this.moodFor(who, 'happy', sec + 6);
      this.gesture(who, 'victory', 0.1);
      this.moodFor(star, 'happy', sec + 4);
      return;
    }
    if (kind === 'jab' && to && this.slot(to)) {
      // the dig: look at the rival, point or smirk; the rival takes it, turns, glares; the star enjoys it
      this.gesture(who, this.pick<ActGesture>(['point', 'smirk']), 0.1);
      this.moodFor(who, 'happy', sec);
      this.at(sec * 0.55, () => {
        this.actor(to).base = { id: who };
        this.gesture(to, 'recoil', 0.2);
      });
      this.at(sec * 0.55 + 1.0, () => {
        this.gesture(to, 'glare', 0.1);
        this.moodFor(to, 'angry', 2.4);
      });
      this.at(sec * 0.6, () => {
        this.glance(star, { id: to }, 1.6);
        this.moodFor(star, 'relaxed', 2.5);
        this.gesture(star, 'smirk', 0.15);
      });
      // the rest look from one to the other
      for (const id of listeners.filter((x) => x !== to)) this.at(sec * 0.6 + this.rng() * 0.4, () => this.glance(id, { id: to }, 1.2));
      return;
    }
    const g = t.talk[Math.floor(this.rng() * t.talk.length)] ?? 'lean';
    this.gesture(who, g, 0.08);
    if (sec > 3.2) this.at(sec * 0.55, () => this.gesture(who, this.pick<ActGesture>(['nod', 'tilt', ...t.talk]), 0.05));
    if (kind === 'opener' || kind === 'answer' || kind === 'twist') this.moodFor(who, 'happy', sec);

    // the star listening: interested, or visibly bored if this one already made her cringe
    if (kind === 'duo' || kind === 'answer' || kind === 'twist' || kind === 'opener') {
      const marks = this.s?.pub.marks[who] ?? [];
      const last = marks[marks.length - 1];
      if (last === 'cringing' || marks.filter((m) => m === 'unsure').length >= 2) {
        this.at(sec * 0.45, () => {
          this.glance(star, { point: this.ceiling() }, 1.6);
          this.gesture(star, 'leanback', 0.2);
        });
      } else if (last === 'charmed' || kind === 'duo') {
        this.at(sec * 0.35, () => this.gesture(star, 'lean', 0.1));
      } else this.at(sec * 0.5, () => this.gesture(star, 'tilt', 0.1));
    }
    // a rival mid-line: one listener glances at another suitor (what is this?)
    if (listeners.length >= 2 && sec > 3 && kind !== 'duo') {
      const [a, b] = this.neighbours(who, listeners);
      if (a && b) this.at(sec * 0.4, () => this.glance(a, { id: b }, 0.9));
    }
  }

  private onReaction(star: string, to: string, mark: Mark, text: string, ms: number) {
    const sec = ms / 1000;
    this.speaking(star, text, ms);
    const sm = STAR_MARK[mark];
    const a = this.actor(star);
    a.base = { id: to };
    this.moodFor(star, sm.mood, sec + 1.5);
    this.gesture(star, sm.move, 0.25);
    if (mark !== 'charmed') this.at(0.5, () => this.glance(star, { point: this.ceiling() }, Math.min(1.4, sec * 0.4)));
    // everyone waits on her words, the one she is judging most of all
    this.allLookAt(star, [], 0.08);
    this.freeze(to, 0.75, sec * 0.55 + 0.05);
    const rivals = this.standing([to]);
    for (const r of rivals) this.freeze(r, 0.35, sec * 0.55);

    // the mark pops over them (director, at 0.55); a beat; then the reaction lands
    const t = this.temper(to);
    const land = sec * 0.55;
    this.at(land, () => {
      this.busy(to, 3);
      if (mark === 'charmed') {
        this.gesture(to, t.charmed, t.beat);
        this.moodFor(to, 'happy', 3.5);
        this.at(t.beat + 1.4, () => this.glance(to, { id: star }, 2));
      } else if (mark === 'unsure') {
        this.gesture(to, t.unsure, t.beat);
        this.moodFor(to, 'sad', 2.6);
        this.at(t.beat + 1.3, () => this.gesture(to, 'shuffle', 0.05));
      } else {
        this.gesture(to, t.cringe, t.beat);
        this.moodFor(to, 'sad', 4);
        this.at(t.beat + 1.0, () => this.gesture(to, 'deflate', 0.05));
      }
    });
    // the others: never a reaction alone
    const near = this.neighbours(to, rivals);
    near.forEach((r, i) => {
      const rt = this.temper(r);
      const delay = land + t.beat + 0.35 + i * 0.3;
      this.at(delay, () => {
        this.busy(r, 2.5);
        if (mark === 'charmed') {
          // the two beside the favourite turn and take it in their own way (glare, deflate,
          // gulp), the one further off just swallows
          if (i < 2) {
            const g = rt.rivalCharmed;
            this.glance(r, { id: to }, 2.6);
            this.gesture(r, g, 0.1);
            this.moodFor(r, g === 'glare' ? 'angry' : g === 'smirk' ? 'relaxed' : 'sad', 2.6);
            // the nearest rival steps into the favourite's space to glare (and into their shot)
            if (i === 0 && g === 'glare') this.stepToward(r, to, 0.32, 2.4);
          } else {
            this.gesture(r, 'gulp', 0.1);
          }
        } else if (mark === 'cringing') {
          // rivals smirk and trade a look
          const other = near[i === 0 ? 1 : 0];
          this.glance(r, other ? { id: other } : { id: to }, 1.5);
          this.gesture(r, rt.rivalCringe, 0.1);
          this.moodFor(r, 'happy', 1.8);
        } else if (i === 0) {
          this.glance(r, { id: to }, 1.2);
          this.gesture(r, 'tilt', 0.1);
        }
      });
    });
  }

  private onConfession(who: string, text: string, ms: number, about?: string) {
    const sec = ms / 1000;
    this.speaking(who, text, ms);
    const a = this.actor(who);
    // the booth is smaller and more honest: rounded over, hands together, eyes down, then up to
    // the lens; halfway, a look away; the last words straight to camera
    if (this.d.room) {
      // the hangout aside: eyes down a beat, then to the lens (the update loop aims at the camera);
      // halfway a look back over the shoulder at the group
      const cam = this.d.cam.camera.position;
      a.base = null;
      a.glance = { look: { point: cam.clone().setY(0.4) }, until: this.time + 0.6 };
      const star = this.starId();
      this.at(sec * 0.48, () => this.glance(who, about && this.slot(about)?.visible ? { id: about } : { id: star }, 0.8));
    } else {
      this.poseFor(who, 'booth', sec + 0.6);
      a.base = { point: BOOTH.camera.clone() };
      a.glance = { look: { point: BOOTH.seat.clone().add(new THREE.Vector3(0.5, 0.2, 1.2)) }, until: this.time + 0.7 };
      this.at(sec * 0.48, () => this.glance(who, { point: BOOTH.seat.clone().add(new THREE.Vector3(-1.2, 1.1, 0.8)) }, 0.8));
    }
    const t = this.temper(who);
    const marks = this.s?.pub.marks[who] ?? [];
    const last = marks[marks.length - 1];
    if (about) {
      this.moodFor(who, 'relaxed', sec);
      this.at(sec * 0.7, () => this.gesture(who, 'smirk', 0.1));
    } else if (last === 'cringing') {
      this.moodFor(who, 'sad', sec);
      this.at(sec * 0.25, () => this.gesture(who, 'gulp', 0.1));
    } else if (last === 'charmed') {
      this.moodFor(who, 'happy', sec);
      this.at(sec * 0.3, () => this.gesture(who, 'tilt', 0.1));
    } else {
      this.moodFor(who, 'neutral', sec);
      this.at(sec * 0.3, () => this.gesture(who, 'tilt', 0.1));
    }
    this.at(sec * 0.85, () => this.gesture(who, 'nod', 0.05));
  }

  private onTwist(ms: number) {
    const sec = ms / 1000;
    const star = this.starId();
    const thinking = this.d.room ? this.d.room.thinking() : CARD_LOOK.clone().setY(1.4);
    if (!thinking) return;
    const cards = thinking;
    // everyone looks at the card as it turns, then each takes it in their own way
    this.standing().forEach((id, i) => {
      this.at(0.1 + i * 0.12, () => this.glance(id, { point: cards }, sec * 0.6));
      const g: ActGesture = this.pick<ActGesture>(['recoil', 'gulp', 'tilt', 'shrug']);
      this.at(sec * 0.45 + i * 0.25, () => this.gesture(id, g, this.temper(id).beat));
    });
    this.glance(star, { point: cards }, sec * 0.5);
    this.at(sec * 0.6, () => this.gesture(star, 'smirk', 0.1));
  }

  private onCut(who: string, by: string, text: string, ms: number) {
    const sec = ms / 1000;
    this.speaking(by, text, ms);
    this.actor(by).base = { id: who };
    this.moodFor(by, 'relaxed', sec + 1);
    // the room goes still and watches the star say it
    const row = this.standing();
    for (const id of row) {
      this.actor(id).base = { id: by };
      this.freeze(id, id === who ? 0.85 : 0.6, sec * 0.6 + 0.38);
    }
    // the lamp dies (director: 0.6 of the line + 380 ms); the cut one holds, then sinks
    const dark = sec * 0.6 + 0.38;
    this.at(dark, () => {
      this.freeze(who, 1, 0.35);
      this.actor(who).base = { point: this.groundAhead(who) };
      this.at(0.35, () => {
        this.gesture(who, 'slump', 0.05);
        this.moodFor(who, 'sad', 30);
      });
    });
    // a beat, then the survivors exhale, one after another, and trade a look
    const survivors = row.filter((x) => x !== who);
    survivors.forEach((id, i) => {
      this.at(dark + 0.9 + i * 0.22, () => {
        this.gesture(id, 'exhale', 0.05);
        this.busy(id, 3);
      });
      const other = survivors[(i + 1) % survivors.length];
      if (other && other !== id)
        this.at(dark + 2.9 + i * 0.2, () => {
          this.glance(id, { id: other }, 1.1);
          this.moodFor(id, 'happy', 1.1);
        });
      this.at(dark + 4.1 + i * 0.15, () => this.glance(id, { id: who }, 1.2));
    });
    this.at(dark + 0.6, () => this.glance(by, { point: this.ceiling() }, 1.2));
  }

  private onHold(finalists: [string, string], ms: number) {
    const sec = ms / 1000;
    const star = this.starId();
    // frozen but breathing, eyes on the star
    for (const id of finalists) {
      this.actor(id).base = { id: star };
      this.freeze(id, 1, sec + 0.4);
    }
    this.freeze(star, 0.7, sec);
    // her eyes go from one to the other, slower each time
    let t = 0.5;
    let k = 0;
    while (t < sec - 0.4) {
      const id = finalists[k++ % 2]!;
      const d = 1.0 + k * 0.25;
      this.at(t, () => this.glance(star, { id }, d));
      t += d;
    }
    // a nervous swallow from the more nervous one, late in the hold
    this.at(sec * 0.6, () => this.gesture(finalists[1], 'gulp', 0.05));
  }

  private onPick(who: string, loser: string, by: string, text: string, ms: number) {
    const sec = ms / 1000;
    this.speaking(by, text, ms);
    this.actor(by).base = { id: who };
    this.moodFor(by, 'happy', sec + 4);
    for (const id of [who, loser]) {
      this.actor(id).base = { id: by };
      this.freeze(id, 0.8, sec * 0.45);
    }
    const land = sec * 0.45;
    const tw = this.temper(who);
    this.at(land, () => {
      this.gesture(who, 'victory', 0.12);
      this.moodFor(who, 'happy', 30);
      this.busy(who, 4);
    });
    this.at(land + 2.0, () => this.gesture(who, tw.charmed === 'victory' ? 'hop' : tw.charmed, 0.1));
    this.at(land, () => {
      this.freeze(loser, 1, 0.5);
      this.at(0.5, () => {
        this.gesture(loser, 'deflate', 0.05);
        this.moodFor(loser, 'sad', 30);
        // eyes to the floor in front of them (face still open to the lens), not off at the star
        this.actor(loser).base = { point: this.groundAhead(loser) };
      });
      this.at(1.8, () => this.glance(loser, { id: who }, 1.6));
      this.at(3.6, () => this.gesture(loser, 'shrug', 0.1));
    });
  }

  private onReveal(text: string, ms: number, quoted: string | undefined, kind: 'on' | 'off') {
    const sec = ms / 1000;
    const star = this.starId();
    this.speaking(star, text, ms * (quoted ? 0.45 : 1));
    if (this.d.room) {
      // the hangout: she thinks it over (eyes up), everyone else watches her
      this.glance(star, { point: this.ceiling() }, sec * 0.3);
      this.allLookAt(star, [], 0.08);
    } else {
      const cards = CARD_LOOK.clone().setY(1.35);
      this.glance(star, { point: cards }, sec * 0.3);
      for (const id of this.alive()) this.glance(id, { point: cards }, sec * 0.35);
    }
    if (quoted && this.slot(quoted)?.visible) {
      this.at(sec * 0.45, () => {
        this.glance(star, { id: quoted }, sec * 0.5);
        if (kind === 'on') {
          this.gesture(quoted, 'nod', 0.2);
          this.moodFor(quoted, 'happy', 3);
        } else {
          this.gesture(quoted, 'wince', 0.2);
          this.moodFor(quoted, 'sad', 3);
        }
      });
    }
  }

  private onResult(winner: string, _ms: number) {
    const star = this.starId();
    this.actor(star).base = { id: winner };
    this.actor(winner).base = { id: star };
    this.moodFor(star, 'happy', 30);
    this.moodFor(winner, 'happy', 30);
    this.at(1.0, () => this.glance(winner, { id: star }, 2));
  }

  /** a small step toward someone, held, then back to the mark (a rival getting in a face) */
  private stepToward(id: string, target: string, dist: number, hold: number) {
    const sl = this.slot(id);
    const tg = this.slot(target);
    const body = sl?.root.children[0];
    const tb = tg?.root.children[0];
    if (!sl || !body || !tb || sl.walking || sl.sitting || this.d.room) return;
    const home = body.position.clone();
    const yaw = body.rotation.y;
    const d = new THREE.Vector3().subVectors(tb.position, home).setY(0);
    if (d.length() < dist * 2) return;
    d.setLength(dist);
    const to = home.clone().add(d);
    // keep facing the front (cheated toward the target): a step, not a walk
    const face = yaw + Math.sign(Math.sin(Math.atan2(d.x, d.z) - yaw)) * 0.35;
    sl.moveTo(to, face, 380);
    this.displaced.set(id, { home, yaw });
    this.at(hold + 0.4, () => this.stepBack(id));
  }
  private displaced = new Map<string, { home: THREE.Vector3; yaw: number }>();
  private stepBack(id: string) {
    const h = this.displaced.get(id);
    const sl = this.slot(id);
    this.displaced.delete(id);
    if (h && sl && !sl.walking && sl.visible) sl.moveTo(h.home, h.yaw, 520);
  }

  // ---------------------------------------------------------------------------- points
  private ceiling() {
    if (this.d.room) return this.d.room.ceiling();
    // up and out toward the house, not behind her: the eye-roll still reads and the face stays open
    return STAR.seat.clone().add(new THREE.Vector3(1.6, 3.6, 1.4));
  }
  private groundAhead(id: string) {
    const sl = this.slot(id);
    if (!sl) return new THREE.Vector3();
    const p = sl.root.children[0]?.position ?? sl.root.position;
    const yaw = sl.root.children[0]?.rotation.y ?? 0;
    return new THREE.Vector3(p.x + Math.sin(yaw) * 1.2, 0.1, p.z + Math.cos(yaw) * 1.2);
  }
  private resolve(look: Look, out: THREE.Vector3): THREE.Vector3 | null {
    if (!look) return null;
    if ('point' in look) return out.copy(look.point);
    const sl = this.slot(look.id);
    if (!sl || !sl.visible) return null;
    return sl.faceAnchor(out);
  }

  // ---------------------------------------------------------------------------- per frame
  update(dt: number) {
    this.time += dt;
    this.ensureCast();
    if (this.jobs.length) {
      const due = this.jobs.filter((j) => j.at <= this.time);
      if (due.length) {
        this.jobs = this.jobs.filter((j) => j.at > this.time);
        for (const j of due.sort((a, b) => a.at - b.at)) j.fn();
      }
    }
    const meta = this.cast.meta;
    if (!meta) return;
    const star = meta.star.id;
    const cam = this.d.cam;
    const camPos = cam.camera.position;
    const shot = cam.shot;
    const quiet = !this.talk || this.talk.until < this.time;
    const pub = this.s?.pub;

    for (const sl of this.cast.slots()) {
      sl.puppeted = true;
      const a = this.actor(sl.id);
      if (a.glance && a.glance.until <= this.time) a.glance = null;
      if (a.mood && a.mood.until <= this.time) a.mood = null;
      if (a.freeze && a.freeze.until <= this.time) a.freeze = null;
      if (a.pose && a.pose.until <= this.time) a.pose = null;
      if (!sl.visible) continue;
      const isStar = sl.id === star;
      const lit = sl.inPlay;
      const room = this.d.room;
      const inBooth = room ? room.aside(sl.id) : sl.root.children[0] ? sl.root.children[0].position.z < -10 : false;

      // lasting state: the cut stand slumped and sad in the dark; the winner glows
      // (held off while they are frozen: the beat before the sink)
      const held = !!a.freeze && a.freeze.x >= 1;
      sl.actPosture(!lit && !isStar && !held ? 'slump' : null);
      const lasting: Mood = !lit && !isStar ? 'sad' : pub?.winner === sl.id ? 'happy' : 'neutral';
      sl.actMood(a.mood?.name ?? lasting);
      sl.actFreeze(a.freeze?.x ?? 0);
      // how the night is going, on the body: hearts stand taller, gloom shrinks
      if (!isStar) {
        const ms = pub?.marks[sl.id] ?? [];
        const score = ms.reduce((acc, m) => acc + (m === 'charmed' ? 1 : m === 'cringing' ? -1 : -0.4), 0);
        const won = pub?.winner === sl.id;
        sl.actConfidence(!lit ? 0 : won ? 1 : Math.max(-1, Math.min(1, score / 2)));
      }

      // stance: the booth pose, a held pose, or their family (standing only)
      let pose: ActPose = 'none';
      let idle: string | null = null;
      if (!isStar && lit) {
        if (a.pose) pose = a.pose.name;
        else if (!inBooth) {
          pose = FAMILY_POSE[a.family];
          if (a.family === 'fold' && sl.hasClip(FOLD_CLIP)) {
            idle = FOLD_CLIP;
            pose = 'none';
          }
        }
        if (inBooth && !a.pose && !room) pose = 'booth';
      }
      sl.actPose(sl.walking ? 'none' : pose);
      sl.actIdle(idle);

      // the look: a glance, else the base, else the natural partner
      let look = a.glance?.look ?? a.base;
      // in the booth the lens is the person they talk to
      if (inBooth && !a.glance) look = { point: room || shot.name.startsWith('booth') ? camPos : BOOTH.camera };
      let p = this.resolve(look, _v);
      if (!p) p = isStar ? this.rowCenter(_v) : this.resolve({ id: star }, _v) ?? STAR.seat.clone().setY(1.2);
      // cheat out: pull the look toward the lens so faces stay open to camera. More for whoever
      // the camera is on, none in the booth (they already look at the lens).
      if (!inBooth && !sl.walking && !room?.free(sl.id)) {
        const t = this.temper(sl.id);
        let cheat = isStar ? 0.25 : t.cheat;
        if (shot.id === sl.id) cheat += 0.2;
        if (room) cheat *= room.cheat;
        if (!lit) cheat *= 0.8;
        // the date: the two of them hold a shared eyeline, three-quarters to the lens at most
        const date = pub?.scene === 'oneonone' && (isStar || sl.id === pub.focus) && (shot.name === 'twoShot' || shot.name === 'ots');
        if (date) cheat = 0.22;
        const face = sl.faceAnchor(_f);
        const dist = Math.max(1.5, face.distanceTo(p));
        // directions from the face: to the target and to the lens
        _d.copy(p).sub(face).normalize();
        _c.copy(camPos).sub(face).normalize();
        _d.lerp(_c, cheat).normalize();
        // and never more than this far from the lens (a three-quarter face at worst)
        // a drawn face on a flat front (the toast, the visor) only reads within about 40 degrees
        const flat = t.flat ? 0.68 : 1;
        // the hangout: people look at each other more freely (the camera is one of the group)
        const maxAway = (date ? 1.0 : isStar ? 1.05 : shot.id === sl.id ? 0.55 : lit ? 0.85 : 0.95) * flat * (room ? 1.45 : 1);
        const away = _d.angleTo(_c);
        // and never dead into the lens either (a flat front face reads worse than three-quarters,
        // the fish most of all): turn toward the side the target is on
        const minAway = isStar ? 0.32 : 0.14;
        if (away < minAway) {
          const side = Math.sign(_c.x * (p.z - face.z) - _c.z * (p.x - face.x)) || 1;
          _q2.setFromAxisAngle(_up, -side * minAway);
          _d.copy(_c).applyQuaternion(_q2);
        } else if (away > maxAway) {
          _q.setFromUnitVectors(_c, _d);
            const k = maxAway / away;
          _q2.identity().slerp(_q, k);
          _d.copy(_c).applyQuaternion(_q2);
        }
        p.copy(face).addScaledVector(_d, dist);
      }
      sl.actLook(sl.walking && !a.glance ? null : p);

      // quiet moments: a small fidget now and then, in character
      if (quiet && !isStar && lit && !inBooth && !sl.walking && this.time > a.busyUntil && this.time - a.lastFidget > 7 && this.rng() < dt * 0.12) {
        a.lastFidget = this.time;
        const t = this.temper(sl.id);
        const others = this.standing([sl.id]);
        if (others.length && this.rng() < 0.5) this.glance(sl.id, { id: this.pick(others) }, 1.2);
        else this.gesture(sl.id, this.pick(t.fidget), 0.1);
      }
    }
  }

  private rowCenter(out: THREE.Vector3) {
    if (this.d.room) return this.d.room.center(out);
    const ids = this.alive();
    if (!ids.length) return out.set(2.4, 1.3, -0.6);
    out.set(0, 0, 0);
    for (const id of ids) out.add(spotPos(Math.max(0, this.spotOf(id))));
    out.divideScalar(ids.length);
    if (this.s?.pub.focus) out.copy(DATE_SPOT);
    return out.setY(1.3);
  }
}

function mulberry(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The director's hook: forward every event here, before the director handles it. */
export function actOn(d: ActingDeps, ev: DatingEvent, s: ShowState) {
  const cast = d.cast as Cast & { acting: Acting | null };
  let a = cast.acting as Acting | null;
  if (!a || !(a instanceof Acting)) {
    a = new Acting(d);
    cast.acting = a;
  }
  try {
    a.event(ev, s);
  } catch (e) {
    console.error('[dating stage] acting failed', e);
  }
}


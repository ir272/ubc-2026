// The show's sound: one WebAudio graph, three buses and a limiter.
//
//   speech  synthesized voices (our own blip-and-formant design, never game samples), replays
//           (band-limited, a touch of room) and the ex's phone line
//   bed     one music bed per phase, crossfaded, with a filter state (the booth hears it through a
//           door), ducked under every spoken line by a fixed amount, gated to nothing for the
//           bottom-two silence, the lamp cut and the held pause
//   cues    the vendor sound effects, trimmed and normalised into assets/audio (ASSETS.md "Derived
//           audio"; tools/soundcheck.mjs --derive rebuilds them)
//
// Two ways to drive it. The score: `event(ev)` for every live feed event, `window(state)` for the
// betting windows and `clock(secondsLeft)` every frame; then this file owns every sound and its
// timing, and the legacy calls below are ignored. Legacy: `speak`, `sfx`, `loop`, `music`, as the
// first director called them; they keep working until `event` is first called.
// The timing the director's pictures must share (lamp out, mark pop, pick light) is in SOUND_TIMING.
//
// Audio starts only after a user gesture (or an injected context, for the offline soundcheck) and no
// public method ever throws.
import type { CastMember, DatingMeta, Mark, SceneId } from '../show/types.ts';

type Voice = NonNullable<CastMember['voice']>;
type Wave = Voice['wave'];

/** a feed event as the director receives it (stage/feed.ts DatingEvent, plus the v2 bottom and replay) */
export interface SoundEvent {
  type: string;
  at?: number;
  data: unknown;
}

// ------------------------------------------------------------------------------------------
// Timing shared with the director (all ms from the start of the event)
// ------------------------------------------------------------------------------------------

export const SOUND_TIMING = {
  /** cut: the lamp goes dark (director.ts: tOut + 450) and the thunk lands */
  cutLamp: (ms: number) => Math.max(1350, Math.min(ms * 0.55, ms - 900)) + 450,
  /** reaction: the mark pops over the suitor (director.ts: tLand + 150), at most just past the event */
  markPop: (ms: number) => Math.min(Math.max(1300, Math.min(ms * 0.5, ms - 850)) + 150, ms + 200),
  /** pick: the name is said last and the pick light lands on it (FORMAT2: the NAME LAST) */
  pickLight: (ms: number) => Math.max(600, ms - 950),
  /** bottom: the two lamps flash as the star finishes naming them; silence follows */
  bottomWarn: (ms: number, holdMs: number) => Math.max(300, ms - holdMs + 120),
  /** exit and lose lines: the walk-off sting (director.ts: ms + 150) */
  exit: (ms: number) => ms + 150,
} as const;

// ------------------------------------------------------------------------------------------
// Files (assets/audio, derived from assets/vendor)
// ------------------------------------------------------------------------------------------

const SFX = {
  cut: 'cut.wav', // switch click, then the heavy wood thunk with a soft low body and a breaker clunk
  spotOn: 'spot-on.wav',
  bong: 'bottom.wav', // the bottom-two warning, struck twice falling
  lock: 'lock.wav', // betting lock: clunk with a bell ring
  tick: 'tick.wav', // betting clock, last five seconds; the hold's slow tock
  pulse: 'pulse.wav', // one heartbeat (lub-dub)
  card: 'card.wav',
  deal: 'deal.wav',
  twist: 'twist.wav',
  reveal: 'reveal.wav',
  betsOpen: 'bets-open.wav',
  pick: 'pick.wav', // the pick light: switch and a struck bell
  win: 'win.wav', // winner sting
  exit: 'exit.wav',
  walkon: 'walkon.wav',
  whoosh: 'whoosh.wav',
  mark: 'mark.wav', // glass ding, pitched into the three marks
  thud: 'thud.wav',
  replay: 'replay.wav',
  phone: 'phone.wav',
  applause: 'applause.wav',
  settle: 'settle.wav',
} as const;
export type Sfx = keyof typeof SFX;

/** each cue's level into the cue bus (files are peak-normalised to -1 dBFS) */
const SFX_GAIN: Record<Sfx, number> = {
  cut: 1.0,
  spotOn: 0.32,
  bong: 0.55,
  lock: 0.42,
  tick: 0.2,
  pulse: 0.9,
  card: 0.32,
  deal: 0.3,
  twist: 0.42,
  reveal: 0.4,
  betsOpen: 0.32,
  pick: 0.55,
  win: 0.42,
  exit: 0.36,
  walkon: 0.38,
  whoosh: 0.16,
  mark: 0.3,
  thud: 0.35,
  replay: 0.16,
  phone: 0.3,
  applause: 0.4,
  settle: 0.24,
};

/** the beds: a loudness-normalised file (-18 LUFS) with a seam baked in at [loopStart, loopEnd] */
const BEDS = {
  theme: { file: 'bed-theme.mp3', loop: [3.8429, 37.72791] }, // Daytime TV Theme: title, result
  walkon: { file: 'bed-walkon.mp3', loop: [15.23229, 38.71054] }, // Vegas Glitz
  rounds: { file: 'bed-rounds.mp3', loop: [4.29569, 31.72383] }, // Funk Game Loop (and the booth, through the door)
  date: { file: 'bed-date.mp3', loop: [17.70522, 39.85916] }, // Vibe Ace: one on one
  tension: { file: 'bed-tension.mp3', loop: [3.97061, 31.39918] }, // Fast Talkin: the pick and the reveal
} as const;
export type Bed = keyof typeof BEDS;

/** legacy track names (director.ts SCENE_MUSIC) */
export type Track = 'walkon' | 'rounds' | 'final' | Bed;
const TRACK_BED: Record<Track, Bed> = { walkon: 'walkon', rounds: 'rounds', final: 'tension', theme: 'theme', date: 'date', tension: 'tension' };

/** what a viewer who joins at any second hears: a bed, its filter (lowpass Hz) and level */
const SCENE_BED: Record<SceneId, { bed: Bed; lp: number; level: number }> = {
  title: { bed: 'theme', lp: 20000, level: 1.15 },
  walkon: { bed: 'walkon', lp: 20000, level: 1 },
  round1: { bed: 'rounds', lp: 20000, level: 0.9 },
  booth1: { bed: 'rounds', lp: 420, level: 0.95 }, // behind the booth door
  round2: { bed: 'rounds', lp: 20000, level: 0.9 },
  booth2: { bed: 'rounds', lp: 420, level: 0.95 },
  oneonone: { bed: 'date', lp: 20000, level: 1 },
  pick: { bed: 'tension', lp: 2200, level: 0.85 }, // held breath: the top shaved off
  reveal: { bed: 'tension', lp: 20000, level: 0.95 },
  result: { bed: 'theme', lp: 20000, level: 1.1 },
};

/** legacy cue names (director.ts) -> what plays */
export type Cue = 'cut' | 'spotOn' | 'whoosh' | 'card' | 'deal' | 'reveal' | 'betsOpen' | 'locked' | 'tick' | 'heartbeat' | 'applause' | 'laugh' | 'ooh' | 'win' | 'exit' | 'phone';
const LEGACY: Record<Cue, Sfx[] | null> = {
  cut: ['cut'],
  spotOn: ['spotOn'],
  whoosh: ['whoosh'],
  card: ['card'],
  deal: ['deal'],
  reveal: ['reveal'],
  betsOpen: ['betsOpen'],
  locked: ['lock'],
  tick: ['tick'],
  heartbeat: ['pulse'],
  applause: ['applause'],
  laugh: null,
  ooh: null,
  win: ['win'],
  exit: ['exit'],
  phone: ['phone'],
};

// ------------------------------------------------------------------------------------------
// The mix (linear gains). Calibrated with tools/soundcheck.mjs: speech 8 to 12 dB over the
// ducked bed, about -16 LUFS integrated, true peak under -1 dBFS.
// ------------------------------------------------------------------------------------------

const MIX = {
  speech: 0.62,
  bed: 0.3,
  cues: 0.7,
  /** the bed under a spoken line: -7 dB */
  duck: 0.45,
  /** after the limiter */
  makeup: 1.0,
  /** limiter ceiling (sample peak), and the soft clip's ceiling behind it */
  ceiling: 0.83,
  clip: 0.87,
};

const STAR_IDS = new Set(['vesper', 'maximilian', 'pixel']);

// ------------------------------------------------------------------------------------------
// Voices
// ------------------------------------------------------------------------------------------

interface Profile {
  id: string;
  star: boolean;
  /** base pitch (Hz) after the role's register */
  f0: number;
  rate: number;
  wave: Wave;
  /** formant scale (body size): under 1 is bigger */
  formant: number;
  pan: number;
  /** pitch spread across a line (expressiveness), fraction */
  range: number;
  breath: number;
  /** fraction of each syllable step that is voiced */
  duty: number;
  vib: number;
  gain: number;
}

function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return h >>> 0;
}
const unit = (s: string) => (hash(s) % 10007) / 10007;

/** loudness per waveform (equal perceived level through the formant filters; soundcheck voices pass) */
const WAVE_GAIN: Record<Wave, number> = { sine: 1.0, triangle: 0.92, square: 0.5, sawtooth: 0.58 };

/**
 * Stars and suitors sit in different registers whatever the roster says: stars 88 to 165 Hz, suitors
 * 172 to 340 Hz, order kept inside each role. A small per-name offset parts voices that share a pitch.
 */
function register(pitch: number, star: boolean, id: string) {
  const nudge = 1 + (unit(id + ':reg') - 0.5) * 0.08;
  if (star) return Math.min(165, Math.max(88, 88 + ((pitch - 100) / 170) * 77)) * nudge;
  return Math.min(340, Math.max(172, 172 + ((pitch - 110) / 190) * 168)) * nudge;
}

function profileFor(id: string, voice: Voice | undefined, star: boolean, spot: number | null): Profile {
  const h = hash(id);
  const v: Voice = voice ?? { pitch: 150 + (h % 140), rate: 9 + (h % 7), wave: (['sine', 'triangle', 'square', 'sawtooth'] as const)[h % 4]! };
  const f0 = register(v.pitch, star, id);
  return {
    id,
    star,
    f0,
    rate: v.rate,
    wave: v.wave,
    // a deeper voice has a bigger head; suitors are a little toy-like
    formant: Math.pow(f0 / 200, 0.3) * (star ? 0.97 : 1.06) * (1 + (unit(id + ':fmt') - 0.5) * 0.12),
    pan: star ? -0.32 : spot === null ? 0.25 : 0.12 + spot * 0.14,
    range: 0.05 + unit(id + ':range') * (v.rate > 13 ? 0.16 : 0.1),
    breath: v.wave === 'sine' ? 0.05 + unit(id + ':br') * 0.06 : 0.02,
    duty: 0.62 + unit(id + ':duty') * 0.26,
    vib: star ? 0.008 + unit(id + ':vib') * 0.01 : unit(id + ':vib') * 0.008,
    gain: WAVE_GAIN[v.wave],
  };
}

type Vowel = 'a' | 'e' | 'i' | 'o' | 'u' | 'm';
/** formants F1, F2, F3 (Hz) of each vowel, before the body scale; 'm' is a closed, nasal hum */
const FORMANT: Record<Vowel, [number, number, number]> = {
  a: [780, 1250, 2600],
  e: [500, 1850, 2550],
  i: [320, 2300, 3000],
  o: [500, 900, 2450],
  u: [350, 780, 2300],
  m: [260, 1050, 2500],
};
const VOWEL_PITCH: Record<Vowel, number> = { a: 1, e: 1.02, i: 1.04, o: 0.98, u: 0.97, m: 1 };

type Onset = 'none' | 'fric' | 'soft' | 'stop' | 'nasal' | 'glide' | 'breath';

interface Syl {
  onset: Onset;
  /** fricative/stop colour (noise highpass Hz) */
  hiss: number;
  vowel: Vowel;
  /** weight in time and loudness */
  stress: number;
  /** ALL CAPS or an exclamation */
  emph: number;
  /** pitch accent for a capitalised word */
  accent: number;
  /** seconds of breath after this syllable */
  pause: number;
  /** index in its clause and the clause's length, and how the clause ends */
  k: number;
  n: number;
  end: '.' | '?' | '!' | ',';
}

const DIGITS = ['zero', 'one', 'two', 'three', 'four', 'five', 'six', 'seven', 'eight', 'nine'];
const FUNCTION_WORDS = new Set(['a', 'an', 'the', 'of', 'to', 'in', 'on', 'and', 'or', 'is', 'it', 'i', 'my', 'me', 'at', 'as', 'be', 'by', 'for', 'so', 'do']);

function vowelOf(n: string): Vowel {
  if (/^(ee|ea|ie|ei|i|y)/.test(n)) return 'i';
  if (/^(oo|ou|ue|ew|u)/.test(n)) return 'u';
  if (/^(ai|ay|e)/.test(n)) return 'e';
  if (/^(oa|oi|oy|au|aw|ow|o)/.test(n)) return 'o';
  return 'a';
}

function onsetOf(c: string): { onset: Onset; hiss: number } {
  if (!c) return { onset: 'none', hiss: 0 };
  if (/^(sh|ch|j)/.test(c)) return { onset: 'fric', hiss: 2600 };
  if (/^(th|f|v)/.test(c)) return { onset: 'soft', hiss: 3200 };
  if (/^[szcx]/.test(c)) return { onset: 'fric', hiss: 4800 };
  if (/^h/.test(c)) return { onset: 'breath', hiss: 1400 };
  if (/^[pb]/.test(c)) return { onset: 'stop', hiss: 1000 };
  if (/^[tdq]/.test(c)) return { onset: 'stop', hiss: 3200 };
  if (/^[kg]/.test(c)) return { onset: 'stop', hiss: 1800 };
  if (/^[mn]/.test(c)) return { onset: 'nasal', hiss: 0 };
  return { onset: 'glide', hiss: 0 }; // l r w y
}

/** text -> syllables: one per vowel group, with what starts it, what stresses it and what follows it */
export function syllables(text: string): Syl[] {
  const src = String(text ?? '').replace(/[0-9]/g, (d) => ` ${DIGITS[Number(d)]} `);
  const tokens = src.match(/[A-Za-zÀ-ɏ'’]+|[.,!?;:—–]+|\s-\s/g) ?? [];
  const out: Syl[] = [];
  let clause: Syl[] = [];
  let sentenceStart = true;
  const close = (end: Syl['end'], pause: number) => {
    clause.forEach((s, k) => {
      s.k = k;
      s.n = clause.length;
      s.end = end;
      if (end === '!') s.emph = Math.max(s.emph, 0.35);
    });
    const last = clause[clause.length - 1];
    if (last) last.pause = pause;
    clause = [];
  };
  for (const tok of tokens) {
    if (!/[A-Za-zÀ-ɏ]/.test(tok)) {
      if (/[?]/.test(tok)) close('?', 0.3);
      else if (/[!]/.test(tok)) close('!', 0.3);
      else if (/[.]/.test(tok)) close('.', 0.3);
      else close(',', 0.17);
      if (/[.?!]/.test(tok)) sentenceStart = true;
      continue;
    }
    const raw = tok.replace(/['’]/g, '');
    const caps = raw.length > 1 && raw === raw.toUpperCase() && /[A-Z]/.test(raw);
    const capd = !sentenceStart && /^[A-Z]/.test(raw) && raw !== 'I';
    sentenceStart = false;
    let w = raw.toLowerCase();
    let lead = '';
    const yv = /^y[aeiou]/.exec(w);
    if (yv) {
      lead = 'y';
      w = w.slice(1);
    }
    let parts: string[] = w.match(/[^aeiouy]*[aeiouy]+/g) ?? [w];
    if (parts.length > 1 && /^[^aeiouy]+e$/.test(parts[parts.length - 1]!) && /e$/.test(w) && !/le$/.test(w)) parts = parts.slice(0, -1);
    const fn = FUNCTION_WORDS.has(w);
    parts.forEach((p, i) => {
      const m = /^([^aeiouy]*)([aeiouy]+)$/.exec(p) ?? ['', '', p];
      const cons = (i === 0 ? lead : '') + m[1]!;
      const o = onsetOf(cons);
      clause.push({
        onset: o.onset,
        hiss: o.hiss,
        vowel: vowelOf(m[2]! || 'a'),
        stress: fn ? 0.62 : i === 0 ? 1 : 0.78,
        emph: caps ? 1 : 0,
        accent: capd && i === 0 ? 0.06 : 0,
        pause: 0,
        k: 0,
        n: 1,
        end: '.',
      });
    });
    out.push(...clause.slice(clause.length - parts.length));
  }
  close('.', 0);
  return out;
}

/** one voiced note: the oscillator's pitch glide, the formants and the envelope peak */
interface Note {
  at: number;
  dur: number;
  f0a: number;
  f0b: number;
  vowel: Vowel;
  /** glide the formants in from this vowel (l, r, w) */
  from?: Vowel;
  peak: number;
  /** a consonant or breath in noise before or under the note */
  noise?: { at: number; dur: number; level: number; hp: number; hp2?: number; bp?: boolean };
}

// ------------------------------------------------------------------------------------------
// The limiter (AudioWorklet): stereo-linked lookahead brickwall, so the master never clips
// ------------------------------------------------------------------------------------------

const LIMITER_JS = `
class CmLimiter extends AudioWorkletProcessor {
  constructor(o) {
    super();
    const p = (o && o.processorOptions) || {};
    this.ceil = p.ceil || 0.83;
    this.L = Math.max(16, Math.round((p.lookahead || 0.005) * sampleRate));
    this.D = this.L - 1;
    this.rel = Math.exp(-1 / ((p.release || 0.12) * sampleRate));
    this.dl = [new Float32Array(this.D), new Float32Array(this.D)];
    this.w = 0;
    this.Q = this.L + 1;
    this.qi = new Float64Array(this.Q); this.qv = new Float32Array(this.Q); this.qh = 0; this.qt = 0; this.n = 0;
    this.box = new Float32Array(this.L).fill(1); this.sum = this.L; this.bw = 0;
    this.g = 1;
  }
  process(inputs, outputs) {
    const inp = inputs[0] || [];
    const out = outputs[0];
    const l = inp[0], r = inp[1] || inp[0];
    const N = out[0].length;
    for (let i = 0; i < N; i++) {
      const a = l ? l[i] : 0, b = r ? r[i] : 0;
      const pk = Math.max(Math.abs(a), Math.abs(b));
      const need = pk > this.ceil ? this.ceil / pk : 1;
      // running minimum of the needed gain over the lookahead window
      while (this.qt !== this.qh && this.qv[(this.qt - 1 + this.Q) % this.Q] >= need) this.qt = (this.qt - 1 + this.Q) % this.Q;
      this.qi[this.qt] = this.n; this.qv[this.qt] = need; this.qt = (this.qt + 1) % this.Q;
      while (this.qi[this.qh] <= this.n - this.L) this.qh = (this.qh + 1) % this.Q;
      const m = this.qv[this.qh];
      this.n++;
      // box-smoothed over the same window, so the gain is down by the time the peak comes out
      this.sum += m - this.box[this.bw]; this.box[this.bw] = m; this.bw = (this.bw + 1) % this.L;
      const s = Math.min(1, this.sum / this.L);
      this.g = s < this.g ? s : s - (s - this.g) * this.rel;
      const da = this.dl[0][this.w], db = this.dl[1][this.w];
      this.dl[0][this.w] = a; this.dl[1][this.w] = b;
      this.w = (this.w + 1) % this.D;
      out[0][i] = da * this.g;
      if (out[1]) out[1][i] = db * this.g;
    }
    return true;
  }
}
registerProcessor('cm-limiter', CmLimiter);
`;

// ------------------------------------------------------------------------------------------

/** a record of every cue fired (the soundcheck reads it; live it keeps the last 200) */
export interface CueRecord {
  name: string;
  /** context seconds the cue sounds */
  at: number;
  dur: number;
  gain: number;
  /** the feed event that caused it, and that event's context time */
  ev?: string;
  evAt?: number;
}
/** a spoken stretch (speech bus) */
export interface LineRecord {
  who: string;
  kind: string;
  at: number;
  end: number;
}

type Ctx = BaseAudioContext;

export class Sound {
  private base: string;
  private ctx: Ctx | null = null;
  private injected = false;
  private dead = false;
  private muted = false;
  private vol = 1;
  /** event() has been called: the score owns every sound and legacy calls are ignored */
  private scored = false;

  private master: GainNode | null = null;
  private mix: GainNode | null = null;
  private clip: WaveShaperNode | null = null;
  private limiter: AudioNode | null = null;
  private speechBus: GainNode | null = null;
  private replayIn: GainNode | null = null;
  private phoneIn: GainNode | null = null;
  private bedIn: GainNode | null = null;
  private bedLevel: GainNode | null = null;
  private bedFilter: BiquadFilterNode | null = null;
  private duck: GainNode | null = null;
  private gate: GainNode | null = null;
  private bedOut: GainNode | null = null;
  private cueBus: GainNode | null = null;
  private noise: AudioBuffer | null = null;
  private waves = new Map<string, PeriodicWave>();

  private buffers = new Map<string, Promise<AudioBuffer | null>>();
  private decoded = new Map<string, AudioBuffer>();
  private bed: { name: Bed; src: AudioBufferSourceNode; gain: GainNode } | null = null;
  private wantBed: { bed: Bed; lp: number; level: number } | null = null;
  private duckEnd = 0;
  private lines = new Map<string, { stop: (t: number) => void }>();
  private pulseLoop: AudioBufferSourceNode | null = null;
  private lastClock = 0;
  private lastSettle = -9;

  private meta: DatingMeta | null = null;
  private profiles = new Map<string, Profile>();
  private spots = new Map<string, number>();
  private scene: SceneId | null = null;

  /** every cue fired, and every spoken stretch (bounded live, whole in offline runs) */
  readonly cueLog: CueRecord[] = [];
  readonly lineLog: LineRecord[] = [];
  private evName = '';
  private evAt = 0;

  private onGesture = () => this.unlock();

  constructor(assetsBase: string, opts: { context?: BaseAudioContext } = {}) {
    this.base = assetsBase.endsWith('/') ? assetsBase : assetsBase + '/';
    if (opts.context) {
      this.injected = true;
      try {
        this.build(opts.context);
      } catch {
        this.ctx = null;
      }
      return;
    }
    try {
      for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.addEventListener(ev, this.onGesture, { passive: true });
    } catch {
      /* no window */
    }
  }

  get ready() {
    if (!this.ctx || this.dead) return false;
    return this.injected || this.ctx.state === 'running';
  }

  /** called from a user gesture: create or resume the context */
  unlock() {
    if (this.dead || this.injected) return;
    try {
      if (!this.ctx) {
        const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!AC) return;
        this.build(new AC({ latencyHint: 'playback' }));
        void this.preload(false);
      }
      const c = this.ctx as AudioContext | null;
      if (c && c.state === 'suspended') {
        void c
          .resume()
          .then(() => this.resumeBed())
          .catch(() => {});
      } else this.resumeBed();
    } catch {
      this.ctx = null;
    }
  }

  private resumeBed() {
    if (this.wantBed && !this.bed) this.setBed(this.wantBed, this.now(), 1.5);
  }

  // ------------------------------------------------------------------ the graph
  private build(ctx: Ctx) {
    this.ctx = ctx;
    const g = (v = 1) => {
      const n = ctx.createGain();
      n.gain.value = v;
      return n;
    };
    // master: mix -> limiter (when loaded) -> makeup -> soft clip -> volume -> out
    this.mix = g(1);
    this.master = g(this.muted ? 0 : this.vol * this.vol);
    const pre = g(0.5);
    this.clip = ctx.createWaveShaper();
    this.clip.curve = softClip(MIX.clip);
    this.clip.oversample = 'none';
    const makeup = g(MIX.makeup);
    this.mix.connect(makeup).connect(pre).connect(this.clip).connect(this.master).connect(ctx.destination);
    this.limiterIn = makeup;
    this.limiterPre = pre;
    void this.loadLimiter();

    // speech: voices, replays (band-limited, a touch of room) and the phone line
    this.speechBus = g(MIX.speech);
    this.speechBus.connect(this.mix);
    this.replayIn = g(1);
    const hp = biquad(ctx, 'highpass', 380, 0.7);
    const lp = biquad(ctx, 'lowpass', 3000, 0.9);
    const mid = biquad(ctx, 'peaking', 1600, 1.2, 3);
    const room = ctx.createConvolver();
    room.buffer = roomIR(ctx, 0.42);
    const wet = g(0.3);
    const dry = g(0.9);
    this.replayIn.connect(hp).connect(lp).connect(mid);
    mid.connect(dry).connect(this.speechBus);
    mid.connect(room).connect(wet).connect(this.speechBus);
    this.phoneIn = g(1.1);
    const php = biquad(ctx, 'highpass', 650, 0.9);
    const plp = biquad(ctx, 'lowpass', 2500, 1.2);
    const crush = ctx.createWaveShaper();
    crush.curve = softClip(0.6, 1.6);
    this.phoneIn.connect(php).connect(plp).connect(crush).connect(this.speechBus);

    // bed: source gains -> level -> filter -> duck -> gate -> out
    this.bedIn = g(1);
    this.bedLevel = g(1);
    this.bedFilter = biquad(ctx, 'lowpass', 20000, 0.5);
    this.duck = g(1);
    this.gate = g(1);
    this.bedOut = g(MIX.bed);
    this.bedIn.connect(this.bedLevel).connect(this.bedFilter).connect(this.duck).connect(this.gate).connect(this.bedOut).connect(this.mix);

    this.cueBus = g(MIX.cues);
    this.cueBus.connect(this.mix);

    // shared white noise for consonants and breaths
    const n = ctx.createBuffer(1, Math.round(ctx.sampleRate * 1.5), ctx.sampleRate);
    const d = n.getChannelData(0);
    let seed = 1234567;
    for (let i = 0; i < d.length; i++) {
      seed = (Math.imul(seed, 1103515245) + 12345) >>> 0;
      d[i] = (seed / 4294967296) * 2 - 1;
    }
    this.noise = n;
  }

  private limiterIn: GainNode | null = null;
  private limiterPre: GainNode | null = null;
  private limiterReady: Promise<void> | null = null;

  private loadLimiter() {
    if (this.limiterReady) return this.limiterReady;
    const ctx = this.ctx;
    this.limiterReady = (async () => {
      try {
        if (!ctx || !ctx.audioWorklet || typeof AudioWorkletNode === 'undefined') return;
        const url = URL.createObjectURL(new Blob([LIMITER_JS], { type: 'application/javascript' }));
        await ctx.audioWorklet.addModule(url);
        URL.revokeObjectURL(url);
        if (this.dead || ctx !== this.ctx || !this.limiterIn || !this.limiterPre) return;
        const lim = new AudioWorkletNode(ctx, 'cm-limiter', {
          numberOfInputs: 1,
          numberOfOutputs: 1,
          outputChannelCount: [2],
          channelCount: 2,
          channelCountMode: 'explicit',
          processorOptions: { ceil: MIX.ceiling, lookahead: 0.005, release: 0.12 },
        });
        this.limiterIn.disconnect();
        this.limiterIn.connect(lim).connect(this.limiterPre);
        this.limiter = lim;
      } catch {
        /* the soft clip alone guards the output */
      }
    })();
    return this.limiterReady;
  }

  /** soundcheck taps: each bus before the master, and the master itself */
  taps(): { speech: AudioNode; bed: AudioNode; cues: AudioNode; master: AudioNode } | null {
    if (!this.speechBus || !this.bedOut || !this.cueBus || !this.master) return null;
    return { speech: this.speechBus, bed: this.bedOut, cues: this.cueBus, master: this.master };
  }

  /** decode every file (offline: before rendering; live: the cues and the current bed) */
  async preload(all = true) {
    try {
      if (!this.ctx) return;
      const jobs: Promise<unknown>[] = [this.loadLimiter()];
      // one file first: if the audio folder is missing, nothing else is requested
      await this.load(SFX.cut);
      for (const f of Object.values(SFX)) jobs.push(this.load(f));
      if (all) for (const b of Object.values(BEDS)) jobs.push(this.load(b.file));
      else if (this.wantBed) jobs.push(this.load(BEDS[this.wantBed.bed].file));
      await Promise.all(jobs);
    } catch {
      /* silent */
    }
  }

  /** assets/audio answered 404: the files are not there, so stop asking (one console line, not forty) */
  private audioMissing = false;

  private load(file: string): Promise<AudioBuffer | null> {
    let p = this.buffers.get(file);
    if (!p) {
      const ctx = this.ctx;
      if (this.audioMissing) return Promise.resolve(null);
      p = fetch(this.base + 'audio/' + encodeURIComponent(file))
        .then((r) => {
          if (r.status === 404) this.audioMissing = true;
          return r.ok ? r.arrayBuffer() : null;
        })
        .then((ab) => (ab && ctx ? ctx.decodeAudioData(ab) : null))
        .then((b) => {
          if (b) this.decoded.set(file, b);
          return b;
        })
        .catch(() => null);
      this.buffers.set(file, p);
    }
    return p;
  }

  private now() {
    return this.ctx ? this.ctx.currentTime : 0;
  }

  // ------------------------------------------------------------------ volume
  setMuted(m: boolean) {
    this.muted = m;
    this.applyVolume();
  }
  get isMuted() {
    return this.muted;
  }
  /** master volume 0..1 (perceptual: squared) */
  setVolume(v: number) {
    this.vol = Math.min(1, Math.max(0, Number(v) || 0));
    this.applyVolume();
  }
  get volume() {
    return this.vol;
  }
  private applyVolume() {
    try {
      if (this.master && this.ctx) this.master.gain.setTargetAtTime(this.muted ? 0 : this.vol * this.vol, this.ctx.currentTime, 0.03);
    } catch {
      /* ignore */
    }
  }

  // ------------------------------------------------------------------ cues
  /** play a cue at context time `at` (or as soon as it is decoded) */
  private cue(name: Sfx, at: number, o: { gain?: number; rate?: number; pan?: number; tag?: string } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.cueBus || this.dead) return;
    const file = SFX[name];
    const go = (buf: AudioBuffer) => {
      if (!this.ready || !this.cueBus) return;
      const t = Math.max(at, ctx.currentTime);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = o.rate ?? 1;
      const gn = ctx.createGain();
      const gain = SFX_GAIN[name] * (o.gain ?? 1);
      gn.gain.value = gain;
      let tail: AudioNode = gn;
      if (o.pan) {
        const p = ctx.createStereoPanner();
        p.pan.value = o.pan;
        gn.connect(p);
        tail = p;
      }
      src.connect(gn);
      tail.connect(this.cueBus);
      src.start(t);
      this.log({ name: o.tag ?? name, at: t, dur: buf.duration / (o.rate ?? 1), gain, ev: this.evName, evAt: this.evAt });
    };
    const b = this.decoded.get(file);
    if (b) go(b);
    else void this.load(file).then((x) => x && go(x));
  }

  private log(r: CueRecord) {
    this.cueLog.push(r);
    if (!this.injected && this.cueLog.length > 200) this.cueLog.splice(0, this.cueLog.length - 200);
  }

  // ------------------------------------------------------------------ beds
  private setBed(want: { bed: Bed; lp: number; level: number } | null, t: number, fade = 1.2) {
    this.wantBed = want;
    const ctx = this.ctx;
    if (!ctx || !this.bedIn || !this.bedLevel || !this.bedFilter) return;
    if (!want) {
      this.fadeOutBed(t, fade);
      return;
    }
    ramp(this.bedLevel.gain, want.level, t, 0.35);
    ramp(this.bedFilter.frequency, want.lp, t, want.lp < 1000 ? 0.12 : 0.3);
    if (this.bed?.name === want.bed) return;
    this.fadeOutBed(t, fade);
    const def = BEDS[want.bed];
    const start = (buf: AudioBuffer) => {
      if (!this.ready || this.wantBed?.bed !== want.bed || this.bed?.name === want.bed || !this.bedIn) return;
      const at = Math.max(t, ctx.currentTime);
      const src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      src.loopStart = def.loop[0];
      src.loopEnd = Math.min(def.loop[1], buf.duration);
      const gn = ctx.createGain();
      gn.gain.setValueAtTime(0, at);
      gn.gain.linearRampToValueAtTime(1, at + Math.max(0.05, fade * 0.7));
      src.connect(gn).connect(this.bedIn);
      src.start(at);
      this.bed = { name: want.bed, src, gain: gn };
      this.log({ name: `bed:${want.bed}`, at, dur: 0, gain: want.level, ev: this.evName, evAt: this.evAt });
    };
    const b = this.decoded.get(def.file);
    if (b) start(b);
    else if (this.ready) void this.load(def.file).then((x) => x && start(x));
  }

  private fadeOutBed(t: number, fade: number) {
    const old = this.bed;
    if (!old) return;
    this.bed = null;
    try {
      hold(old.gain.gain, t);
      old.gain.gain.linearRampToValueAtTime(0, t + fade);
      old.src.stop(t + fade + 0.05);
    } catch {
      /* stopped */
    }
  }

  /** the bed's gate: 0 = music out (the bottom silence, the cut, the hold) */
  private gateTo(v: number, t: number, tau: number) {
    if (!this.gate) return;
    hold(this.gate.gain, t);
    this.gate.gain.setTargetAtTime(v, t, tau);
  }

  /** duck the bed under speech from t0 to t1 */
  private duckSpan(t0: number, t1: number) {
    if (!this.duck) return;
    const p = this.duck.gain;
    const ts = Math.max(this.now(), t0 - 0.04);
    hold(p, ts);
    p.setTargetAtTime(MIX.duck, ts, 0.05);
    this.duckEnd = Math.max(t0 < this.duckEnd ? this.duckEnd : 0, t1);
    p.setTargetAtTime(1, this.duckEnd + 0.08, 0.3);
  }

  // ------------------------------------------------------------------ voices
  /** tell the sound who is on: register (star or suitor) and where they stand */
  setCast(meta: DatingMeta | null) {
    this.meta = meta;
    this.profiles.clear();
    this.spots.clear();
    if (meta) for (const s of meta.suitors) this.spots.set(s.id, s.spot);
  }

  private profile(id: string, voice?: Voice): Profile {
    let p = this.profiles.get(id);
    if (p && (!voice || p.rate === voice.rate)) return p;
    const m = this.meta;
    const member = m ? (m.star.id === id ? m.star : m.suitors.find((s) => s.id === id)) : undefined;
    const star = m ? m.star.id === id : STAR_IDS.has(id);
    p = profileFor(id, voice ?? member?.voice, star, this.spots.get(id) ?? null);
    this.profiles.set(id, p);
    return p;
  }

  private wave(w: Wave): PeriodicWave | null {
    const ctx = this.ctx;
    if (!ctx) return null;
    let pw = this.waves.get(w);
    if (pw) return pw;
    const N = 32;
    const real = new Float32Array(N);
    const imag = new Float32Array(N);
    for (let k = 1; k < N; k++) {
      let a = 0;
      if (w === 'sine') a = k === 1 ? 1 : k <= 6 ? 0.42 / Math.pow(k, 1.6) : 0; // round, with a few harmonics for the formants
      else if (w === 'triangle') a = k % 2 ? 1 / (k * k) + (k < 8 ? 0.04 : 0) : k < 7 ? 0.05 / k : 0;
      else if (w === 'square') a = k % 2 ? 1 / k : 0;
      else a = 1 / k;
      imag[k] = a;
    }
    pw = ctx.createPeriodicWave(real, imag, { disableNormalization: false });
    this.waves.set(w, pw);
    return pw;
  }

  /** text -> notes for one speaker, fitted into [t0, t0 + dur] */
  private notesFor(p: Profile, text: string, t0: number, dur: number, mood = 0): Note[] {
    const syl = syllables(text);
    if (!syl.length) return [];
    // the character's own pace: rate 8 says about 3.4 syllables a second, rate 18 about 7.6
    const step0 = 1 / (p.rate * 0.42);
    const weight = syl.map((s) => (s.emph >= 1 ? 1.3 : 1) * (s.stress < 0.7 ? 0.82 : 1));
    const pauses = syl.reduce((a, s, i) => a + (i < syl.length - 1 ? s.pause : 0), 0);
    const natural = step0 * weight.reduce((a, b) => a + b, 0) + pauses;
    const avail = Math.max(0.25, dur - 0.12);
    const target = Math.min(avail, Math.max(natural, avail * 0.62));
    const k = target / natural;
    const notes: Note[] = [];
    let t = t0;
    const base = p.f0 * (1 + mood * 0.07);
    syl.forEach((s, i) => {
      const step = step0 * weight[i]! * k;
      const len = Math.max(0.05, step * p.duty);
      const pos = s.n > 1 ? s.k / (s.n - 1) : 0;
      let f = base * VOWEL_PITCH[s.vowel] * (1.05 - 0.1 * pos);
      f *= 1 + (unit(`${p.id}:${i}:${s.vowel}`) - 0.5) * 2 * p.range;
      f *= 1 + s.accent + (s.emph >= 1 ? 0.18 : s.emph * 0.15);
      if (s.stress >= 1) f *= 1.03;
      let glide = s.end === '?' ? 1 : 0.95;
      const fromEnd = s.n - 1 - s.k;
      if (s.end === '?' && fromEnd < 3) {
        f *= 1 + 0.11 * (3 - fromEnd);
        glide = 1.1;
      }
      if (s.end === '!' && fromEnd === 0) f *= 1.1;
      let peak = p.gain * (0.55 + 0.45 * s.stress) * (1 + s.emph * 0.5);
      if (s.end === '.' && fromEnd === 0) peak *= 0.82;
      const voicedAt = s.onset === 'stop' ? t + 0.018 : s.onset === 'fric' || s.onset === 'soft' ? t + 0.03 : s.onset === 'breath' ? t + 0.025 : t;
      const n: Note = { at: voicedAt, dur: Math.max(0.04, len - (voicedAt - t)), f0a: f, f0b: f * glide, vowel: s.vowel, peak };
      if (s.onset === 'glide') n.from = 'u';
      if (s.onset === 'nasal') n.from = 'm';
      if (s.onset === 'fric') n.noise = { at: t, dur: 0.045, level: 0.3, hp: s.hiss };
      else if (s.onset === 'soft') n.noise = { at: t, dur: 0.04, level: 0.14, hp: s.hiss };
      else if (s.onset === 'breath') n.noise = { at: t, dur: 0.035, level: 0.12, hp: s.hiss };
      else if (s.onset === 'stop') n.noise = { at: t + 0.01, dur: 0.012, level: 0.35, hp: s.hiss };
      notes.push(n);
      t += step + (i < syl.length - 1 ? s.pause * k : 0);
    });
    return notes;
  }

  /** a non-verbal reaction from the star (mark-only): a hum, a tut, an intake */
  private nonverbal(p: Profile, mark: Mark, t0: number): Note[] {
    const f = p.f0;
    if (mark === 'charmed') {
      // "mm-HM": closed mouth, the second hum rising
      return [
        { at: t0, dur: 0.13, f0a: f, f0b: f * 0.98, vowel: 'm', peak: p.gain * 0.75 },
        { at: t0 + 0.19, dur: 0.27, f0a: f * 1.06, f0b: f * 1.32, vowel: 'm', from: 'm', peak: p.gain * 0.9 },
      ];
    }
    if (mark === 'unsure') {
      // a tut, then "hmm?" level and lifting at the end
      return [
        { at: t0 + 0.13, dur: 0.34, f0a: f * 0.98, f0b: f * 1.12, vowel: 'm', peak: p.gain * 0.7, noise: { at: t0, dur: 0.014, level: 0.5, hp: 3800 } },
      ];
    }
    // cringing: a sharp intake through the teeth, then a small falling "eh"
    return [{ at: t0 + 0.36, dur: 0.2, f0a: f * 0.96, f0b: f * 0.76, vowel: 'e', peak: p.gain * 0.75, noise: { at: t0, dur: 0.32, level: 0.22, hp: 900, hp2: 2400, bp: true } }];
  }

  /** schedule notes through one voice chain into `out`; returns when it ends */
  private sing(who: string, p: Profile, notes: Note[], out: AudioNode, kind: string): number {
    const ctx = this.ctx;
    if (!ctx || !notes.length) return 0;
    const first = notes[0]!;
    const last = notes[notes.length - 1]!;
    const tStart = Math.min(first.at, first.noise?.at ?? first.at) - 0.01;
    const tEnd = last.at + last.dur + 0.06;
    const osc = ctx.createOscillator();
    const pw = this.wave(p.wave);
    if (pw) osc.setPeriodicWave(pw);
    else osc.type = p.wave;
    const f1 = biquad(ctx, 'bandpass', 500, 4.5);
    const f2 = biquad(ctx, 'bandpass', 1500, 6);
    const f3 = biquad(ctx, 'bandpass', 2600, 5);
    const g1 = gainNode(ctx, 1.0);
    const g2 = gainNode(ctx, 0.62);
    const g3 = gainNode(ctx, 0.22);
    const gd = gainNode(ctx, p.wave === 'sine' ? 0.32 : 0.14);
    const env = gainNode(ctx, 0);
    osc.connect(f1).connect(g1).connect(env);
    osc.connect(f2).connect(g2).connect(env);
    osc.connect(f3).connect(g3).connect(env);
    osc.connect(gd).connect(env);
    let tail: AudioNode = env;
    if (p.star) {
      const warm = biquad(ctx, 'lowshelf', 240, 0.7, 3.5);
      env.connect(warm);
      tail = warm;
    }
    const pan = ctx.createStereoPanner();
    pan.pan.value = kind === 'confession' ? 0 : p.pan;
    tail.connect(pan).connect(out);
    // vibrato
    let lfo: OscillatorNode | null = null;
    if (p.vib > 0.001) {
      lfo = ctx.createOscillator();
      lfo.frequency.value = 5.2 + unit(p.id + ':lfo') * 1.6;
      const depth = gainNode(ctx, p.f0 * p.vib);
      lfo.connect(depth).connect(osc.frequency);
      lfo.start(tStart);
      lfo.stop(tEnd);
    }
    // consonants and breath
    let nsrc: AudioBufferSourceNode | null = null;
    let nEnv: GainNode | null = null;
    let nf: BiquadFilterNode | null = null;
    if (this.noise) {
      nsrc = ctx.createBufferSource();
      nsrc.buffer = this.noise;
      nsrc.loop = true;
      nf = biquad(ctx, 'highpass', 3000, 0.8);
      nEnv = gainNode(ctx, 0);
      nsrc.connect(nf).connect(nEnv).connect(pan);
      nsrc.start(tStart, unit(who + tStart) * 1.2);
      nsrc.stop(tEnd);
    }
    const fs = p.formant;
    osc.frequency.setValueAtTime(first.f0a, tStart);
    for (const n of notes) {
      const a = n.at;
      const e = n.at + n.dur;
      const att = Math.min(0.018, n.dur * 0.25);
      const [F1, F2, F3] = FORMANT[n.vowel];
      osc.frequency.setValueAtTime(n.f0a, a);
      osc.frequency.exponentialRampToValueAtTime(Math.max(30, n.f0b), e);
      if (n.from) {
        const [A1, A2, A3] = FORMANT[n.from];
        f1.frequency.setValueAtTime(A1 * fs, a);
        f2.frequency.setValueAtTime(A2 * fs, a);
        f3.frequency.setValueAtTime(A3 * fs, a);
        const g = a + Math.min(0.05, n.dur * 0.4);
        f1.frequency.linearRampToValueAtTime(F1 * fs, g);
        f2.frequency.linearRampToValueAtTime(F2 * fs, g);
        f3.frequency.linearRampToValueAtTime(F3 * fs, g);
      } else {
        f1.frequency.setValueAtTime(F1 * fs, a);
        f2.frequency.setValueAtTime(F2 * fs, a);
        f3.frequency.setValueAtTime(F3 * fs, a);
      }
      env.gain.setValueAtTime(0, a);
      env.gain.linearRampToValueAtTime(n.peak, a + att);
      env.gain.linearRampToValueAtTime(n.peak * 0.72, a + n.dur * 0.7);
      env.gain.linearRampToValueAtTime(0, e);
      if (nEnv && nf) {
        const z = n.noise;
        if (z) {
          nf.type = z.bp ? 'bandpass' : 'highpass';
          nf.frequency.setValueAtTime(z.hp, z.at);
          if (z.hp2) nf.frequency.linearRampToValueAtTime(z.hp2, z.at + z.dur);
          nEnv.gain.setValueAtTime(0, z.at);
          nEnv.gain.linearRampToValueAtTime(z.level * p.gain * (z.bp ? 1 : 0.8), z.at + Math.min(0.006, z.dur * 0.3) + (z.bp ? z.dur * 0.7 : 0));
          nEnv.gain.linearRampToValueAtTime(0, z.at + z.dur);
        }
        if (p.breath > 0.01) {
          // a breathy voice: a little air under the vowel
          const bt = Math.max(a, z ? z.at + z.dur : a);
          if (!z?.bp) {
            nf.type = 'highpass';
            nf.frequency.setValueAtTime(1800, bt);
          }
          nEnv.gain.setValueAtTime(0, bt);
          nEnv.gain.linearRampToValueAtTime(p.breath * n.peak, bt + att);
          nEnv.gain.linearRampToValueAtTime(0, e);
        }
      }
    }
    osc.start(tStart);
    osc.stop(tEnd);
    const stop = (t: number) => {
      try {
        hold(env.gain, t);
        env.gain.setTargetAtTime(0, t, 0.015);
        osc.stop(t + 0.08);
        nsrc?.stop(t + 0.08);
        lfo?.stop(t + 0.08);
      } catch {
        /* already stopped */
      }
    };
    this.lines.set(who, { stop });
    osc.onended = () => {
      if (this.lines.get(who)?.stop === stop) this.lines.delete(who);
    };
    return tEnd;
  }

  /** speak a line now-ish: who, text, fitted into [t0, t0 + dur]; returns the end time */
  private say(who: string, text: string, t0: number, dur: number, o: { kind?: string; via?: 'replay' | 'phone'; mood?: number; voice?: Voice } = {}) {
    const ctx = this.ctx;
    if (!ctx || !this.speechBus || !text || !/[A-Za-z0-9]/.test(text)) return t0;
    const p = this.profile(who, o.voice);
    this.hushOne(who, t0);
    const notes = this.notesFor(p, text, t0, dur, o.mood ?? 0);
    const out = o.via === 'replay' ? this.replayIn! : o.via === 'phone' ? this.phoneIn! : this.speechBus;
    const end = this.sing(who, p, notes, out, o.kind ?? 'line');
    if (end > t0) {
      this.duckSpan(t0, end);
      this.lineLog.push({ who, kind: o.kind ?? 'line', at: notes[0]!.at, end });
      if (!this.injected && this.lineLog.length > 200) this.lineLog.splice(0, this.lineLog.length - 200);
    }
    return end;
  }

  private hushOne(who: string, t: number) {
    const cur = this.lines.get(who);
    if (cur) {
      cur.stop(t);
      this.lines.delete(who);
    }
  }

  // ------------------------------------------------------------------ the score
  /** one live feed event (not on a late-join catch-up). Owns all sound from now on. */
  event(ev: SoundEvent) {
    this.scored = true;
    try {
      this.onEvent(ev);
    } catch {
      /* never break the stage */
    }
  }

  private onEvent(ev: SoundEvent) {
    const d = (ev.data ?? {}) as Record<string, unknown>;
    if (ev.type === 'cast') {
      this.setCast((d.meta as DatingMeta) ?? null);
      return;
    }
    if (ev.type === 'scene') {
      const st = d.state as { scene: SceneId } | undefined;
      if (st?.scene) this.toScene(st.scene, this.ready);
      return;
    }
    if (!this.ready) return;
    const t = this.now() + 0.03;
    this.evName = ev.type;
    this.evAt = t;
    const ms = Number(d.ms) || 0;
    const sec = ms / 1000;
    const who = String(d.who ?? '');
    const text = String(d.text ?? '');
    switch (ev.type) {
      case 'enter': {
        const star = this.meta ? this.meta.star.id === who : STAR_IDS.has(who);
        const spot = typeof d.spot === 'number' ? d.spot : null;
        this.cue('walkon', t, { rate: star ? 0.84 : 1, gain: star ? 1.15 : 1, pan: star ? -0.3 : spotPan(spot) });
        if (!star) this.cue('spotOn', t + sec, { pan: spotPan(spot) });
        return;
      }
      case 'line': {
        const kind = String(d.kind ?? 'line');
        if (kind === 'caller') {
          this.cue('phone', t);
          this.cue('phone', t + 0.2, { gain: 0.8 });
          this.say(who, text, t + 0.5, sec - 0.5, { kind, via: 'phone' });
          return;
        }
        this.say(who, text, t, sec, { kind });
        if (kind === 'exit' || kind === 'lose') this.cue('exit', t + SOUND_TIMING.exit(ms) / 1000);
        return;
      }
      case 'reaction': {
        const mark = (d.mark as Mark) ?? 'unsure';
        const pop = t + SOUND_TIMING.markPop(ms) / 1000;
        if (text && /[A-Za-z0-9]/.test(text)) {
          this.say(who, text, t, sec, { kind: 'reaction', mood: mark === 'charmed' ? 1 : mark === 'cringing' ? -0.7 : 0 });
        } else {
          const p = this.profile(who);
          const notes = this.nonverbal(p, mark, t + 0.12);
          const end = this.sing(who, p, notes, this.speechBus!, 'nonverbal');
          this.duckSpan(t + 0.1, end);
          this.lineLog.push({ who, kind: `nonverbal:${mark}`, at: t + 0.12, end });
          this.log({ name: `nonverbal:${mark}`, at: t + 0.12, dur: end - t - 0.12, gain: 0, ev: 'reaction', evAt: t });
        }
        this.markCue(mark, pop, this.spots.get(String(d.to ?? '')) ?? null);
        return;
      }
      case 'confession': {
        // private: the voice dry and central, the studio bed behind the booth door
        if (this.scene !== 'booth1' && this.scene !== 'booth2' && this.bedFilter) {
          ramp(this.bedFilter.frequency, 420, t, 0.1);
          ramp(this.bedFilter.frequency, SCENE_BED[this.scene ?? 'round1'].lp, t + sec, 0.3);
        }
        this.say(who, text, t, sec, { kind: 'confession' });
        return;
      }
      case 'twist': {
        this.cue('card', t);
        this.cue('twist', t + 0.14);
        return;
      }
      case 'bottom': {
        const pair = (d.who as string[]) ?? [];
        const holdMs = Number(d.holdMs) || 3000;
        const warn = t + SOUND_TIMING.bottomWarn(ms, holdMs) / 1000;
        this.say(String(d.by ?? this.meta?.star.id ?? ''), text, t, warn - t - 0.12, { kind: 'bottom' });
        // the two lamps flash: struck twice, falling; then the music goes and a pulse holds the silence
        this.cue('bong', warn, { pan: spotPan(this.spots.get(pair[0] ?? '') ?? null), tag: 'bottom' });
        this.cue('bong', warn + 0.42, { rate: 0.89, pan: spotPan(this.spots.get(pair[1] ?? '') ?? null), tag: 'bottom' });
        this.gateTo(0, warn + 0.3, 0.3);
        const end = t + sec;
        for (let p = warn + 1.25, i = 0; p < end - 0.3; p += 1.05, i++) this.cue('pulse', p, { gain: 0.42 + i * 0.08, tag: 'bottomPulse' });
        return;
      }
      case 'cut': {
        const lamp = t + SOUND_TIMING.cutLamp(ms) / 1000;
        this.say(String(d.by ?? ''), text, t, lamp - t - 0.22, { kind: 'cut' });
        // the lamp: the bed to nothing, the thunk alone, then the music back after a beat
        if (this.gate) {
          hold(this.gate.gain, lamp - 0.03);
          this.gate.gain.setTargetAtTime(0, lamp - 0.03, 0.01);
          this.gate.gain.setTargetAtTime(1, lamp + 1.2, 0.55);
        }
        this.cue('cut', lamp, { pan: spotPan(this.spots.get(who) ?? null) * 0.6 });
        return;
      }
      case 'hold': {
        // music out; a slow pulse and nothing else
        this.gateTo(0, t, 0.06);
        const n = Math.max(1, Math.floor((sec - 0.3) / 1.0));
        for (let i = 0; i < n; i++) {
          const at = t + 0.3 + i * 1.0;
          this.cue('pulse', at, { gain: 0.6 + i * 0.1, tag: 'holdPulse' });
          this.cue('tick', at + 0.02, { rate: 0.62, gain: 0.55, tag: 'holdTock' });
        }
        return;
      }
      case 'pick': {
        const at = t + SOUND_TIMING.pickLight(ms) / 1000;
        this.say(String(d.by ?? ''), text, t, at - t - 0.05, { kind: 'pick' });
        this.cue('pick', at);
        this.cue('win', at + 0.3);
        this.gateTo(1, at + 1.0, 0.5);
        if (this.bedFilter) ramp(this.bedFilter.frequency, 20000, at + 0.6, 0.4);
        if (this.bedLevel) ramp(this.bedLevel.gain, 1, at + 0.6, 0.4);
        return;
      }
      case 'replay': {
        // a playback: a soft tape swish, then the line band-limited in a little room
        this.cue('replay', t);
        this.say(who, text, t + 0.32, sec - 0.4, { kind: 'replay', via: 'replay' });
        return;
      }
      case 'reveal': {
        this.cue('card', t);
        this.cue('reveal', t + 0.18);
        const q = d.quote as { who: string; text: string } | undefined;
        const star = this.meta?.star.id ?? String(d.who ?? '');
        if (q) {
          this.say(star, text, t + 0.6, sec * 0.45 - 0.6, { kind: 'reveal' });
          this.say(q.who, q.text, t + sec * 0.45 + 0.1, sec * 0.55 - 0.1, { kind: 'replay', via: 'replay' });
        } else this.say(star, text, t + 0.6, sec - 0.6, { kind: 'reveal' });
        return;
      }
      case 'result': {
        this.cue('applause', t);
        this.cue('settle', t + 0.4);
        return;
      }
      default:
        return;
    }
  }

  /** the three marks: one glass ding, three contours (up, level, down) */
  private markCue(mark: Mark, at: number, spot: number | null) {
    const pan = spotPan(spot);
    if (mark === 'charmed') {
      this.cue('mark', at, { pan, tag: 'charmed' });
      this.cue('mark', at + 0.075, { rate: 1.335, gain: 0.9, pan, tag: 'charmed' });
    } else if (mark === 'unsure') {
      this.cue('mark', at, { rate: 0.84, gain: 0.8, pan, tag: 'unsure' });
      this.cue('mark', at + 0.12, { rate: 0.84, gain: 0.55, pan, tag: 'unsure' });
    } else {
      this.cue('mark', at, { rate: 0.89, gain: 0.85, pan, tag: 'cringing' });
      this.cue('mark', at + 0.09, { rate: 0.594, gain: 0.85, pan, tag: 'cringing' });
      this.cue('thud', at + 0.09, { rate: 1.5, gain: 0.7, pan, tag: 'cringing' });
    }
  }

  private toScene(scene: SceneId, audible: boolean) {
    const fresh = scene !== this.scene;
    this.scene = scene;
    const t = this.now() + 0.03;
    this.evName = 'scene';
    this.evAt = t;
    if (!this.ctx) {
      this.wantBed = SCENE_BED[scene];
      return;
    }
    // any silence from the last scene is over
    this.gateTo(1, t, 0.2);
    this.setBed(SCENE_BED[scene], t, 1.2);
    if (audible && fresh && scene !== 'title') this.cue('whoosh', t);
  }

  /** a betting window changed: open, locked, settled or void */
  window(state: string) {
    try {
      if (!this.ready) return;
      const t = this.now() + 0.02;
      this.evName = `window:${state}`;
      this.evAt = t;
      if (state === 'open') {
        this.lastClock = 0;
        this.cue('betsOpen', t);
      } else if (state === 'locked') {
        this.lastClock = 0;
        this.cue('lock', t);
      } else if (state === 'settled' && t - this.lastSettle > 1) {
        this.lastSettle = t;
        this.cue('settle', t);
      }
    } catch {
      /* silent */
    }
  }

  /** every frame: seconds left in the open window, or null. Ticks the last five seconds. */
  clock(secondsLeft: number | null) {
    try {
      if (secondsLeft === null || !Number.isFinite(secondsLeft) || secondsLeft <= 0) {
        this.lastClock = 0;
        return;
      }
      const s = Math.ceil(secondsLeft);
      if (s === this.lastClock) return;
      const prev = this.lastClock;
      this.lastClock = s;
      if (!this.ready || s > 5 || (prev !== 0 && s > prev)) return;
      this.evName = 'clock';
      this.evAt = this.now();
      this.cue('tick', this.now() + 0.01, { gain: 0.8 + (5 - s) * 0.1, rate: s === 1 ? 1.12 : 1, tag: 'clock' });
    } catch {
      /* silent */
    }
  }

  /** late join or a new episode: the scene's bed at once, nothing else */
  rebuild(scene: SceneId | null, meta?: DatingMeta | null) {
    try {
      this.scored = true;
      if (meta !== undefined) this.setCast(meta);
      this.hush();
      this.stopLoops();
      if (this.ctx && this.duck && this.gate) {
        const t = this.now();
        hold(this.duck.gain, t);
        this.duck.gain.setTargetAtTime(1, t, 0.1);
        this.gateTo(1, t, 0.1);
      }
      if (scene) this.toScene(scene, false);
      else this.setBed(null, this.now(), 0.8);
    } catch {
      /* silent */
    }
  }

  // ------------------------------------------------------------------ legacy calls
  /** legacy: one cue now (ignored once the score runs) */
  sfx(name: Cue) {
    if (this.scored || !this.ready) return;
    try {
      const t = this.now() + 0.02;
      if (name === 'cut' && this.gate) {
        hold(this.gate.gain, t);
        this.gate.gain.setTargetAtTime(0, t, 0.01);
        this.gate.gain.setTargetAtTime(1, t + 1.2, 0.55);
      }
      if (name === 'win') this.cue('pick', t);
      for (const s of LEGACY[name] ?? []) this.cue(s, name === 'win' ? t + 0.3 : t);
    } catch {
      /* silent */
    }
  }

  /** legacy: the held pause's pulse on or off (music out while on) */
  loop(name: Cue, on: boolean) {
    if (this.scored) return;
    try {
      if (name !== 'heartbeat') return;
      if (!on) {
        this.stopLoops();
        this.gateTo(1, this.now(), 0.4);
        return;
      }
      if (this.pulseLoop || !this.ready) return;
      const ctx = this.ctx!;
      const b = this.decoded.get(SFX.pulse);
      if (!b || !this.cueBus) return;
      const one = ctx.createBuffer(1, Math.round(ctx.sampleRate), ctx.sampleRate);
      one.getChannelData(0).set(b.getChannelData(0).subarray(0, Math.min(b.length, one.length)));
      const src = ctx.createBufferSource();
      src.buffer = one;
      src.loop = true;
      const g = gainNode(ctx, SFX_GAIN.pulse * 0.7);
      src.connect(g).connect(this.cueBus);
      src.start(this.now() + 0.05);
      this.pulseLoop = src;
      this.gateTo(0, this.now(), 0.06);
    } catch {
      /* silent */
    }
  }

  private stopLoops() {
    try {
      this.pulseLoop?.stop();
    } catch {
      /* stopped */
    }
    this.pulseLoop = null;
  }

  /** legacy: the bed by track name, or none */
  music(name: Track | null) {
    if (this.scored) return;
    try {
      const want = name ? { bed: TRACK_BED[name], lp: 20000, level: 1 } : null;
      this.setBed(want, this.now() + 0.02, 1.2);
    } catch {
      /* silent */
    }
  }

  /** legacy: speech blips for one line, spread over ms */
  speak(who: string, voice: Voice | undefined, text: string, ms: number) {
    if (this.scored || !this.ready || this.dead || !text) return;
    try {
      const t = this.now() + 0.03;
      this.say(who, text, t, ms / 1000, { voice });
    } catch {
      /* silent */
    }
  }

  hush(who?: string) {
    const t = this.now();
    for (const id of who ? [who] : [...this.lines.keys()]) this.hushOne(id, t);
  }

  stopAll() {
    try {
      this.hush();
      this.stopLoops();
      this.setBed(null, this.now(), 0.6);
    } catch {
      /* silent */
    }
  }

  destroy() {
    if (this.dead) return;
    this.stopAll();
    this.dead = true;
    try {
      for (const ev of ['pointerdown', 'keydown', 'touchstart'] as const) window.removeEventListener(ev, this.onGesture);
    } catch {
      /* no window */
    }
    try {
      if (!this.injected) void (this.ctx as AudioContext | null)?.close();
    } catch {
      /* ignore */
    }
    this.ctx = null;
  }
}

// ------------------------------------------------------------------------------------------
// helpers
// ------------------------------------------------------------------------------------------

function spotPan(spot: number | null) {
  return spot === null ? 0 : 0.1 + spot * 0.14;
}

function gainNode(ctx: Ctx, v: number) {
  const g = ctx.createGain();
  g.gain.value = v;
  return g;
}

function biquad(ctx: Ctx, type: BiquadFilterType, f: number, q: number, gainDb = 0) {
  const b = ctx.createBiquadFilter();
  b.type = type;
  b.frequency.value = f;
  b.Q.value = q;
  b.gain.value = gainDb;
  return b;
}

/** cancel what is scheduled after t and hold the value there */
function hold(p: AudioParam, t: number) {
  try {
    const x = p as AudioParam & { cancelAndHoldAtTime?: (t: number) => AudioParam };
    if (typeof x.cancelAndHoldAtTime === 'function') {
      x.cancelAndHoldAtTime(t);
      return;
    }
  } catch {
    /* fall through */
  }
  p.cancelScheduledValues(t);
}

function ramp(p: AudioParam, v: number, t: number, tau: number) {
  hold(p, t);
  p.setTargetAtTime(v, t, tau);
}

/** linear to 0.75 of the ceiling, then a tanh knee into it; input pre-scaled by 0.5 */
function softClip(ceiling: number, drive = 1) {
  const n = 4097;
  const c = new Float32Array(n);
  const knee = ceiling * 0.86;
  for (let i = 0; i < n; i++) {
    const x = ((i / (n - 1)) * 2 - 1) * 2 * drive;
    const a = Math.abs(x);
    const y = a <= knee ? a : knee + (ceiling - knee) * Math.tanh((a - knee) / (ceiling - knee));
    c[i] = Math.sign(x) * y;
  }
  return c;
}

/** a small room: two decorrelated noise tails, darkening as they decay */
function roomIR(ctx: Ctx, seconds: number) {
  const len = Math.round(ctx.sampleRate * seconds);
  const b = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    let seed = 99 + ch * 7919;
    let lp = 0;
    for (let i = 0; i < len; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      const w = (seed / 4294967296) * 2 - 1;
      const k = i / len;
      lp += (w - lp) * (0.6 - 0.45 * k);
      d[i] = lp * Math.exp(-6.5 * k) * (i < ctx.sampleRate * 0.004 ? 0.3 : 1);
    }
  }
  return b;
}

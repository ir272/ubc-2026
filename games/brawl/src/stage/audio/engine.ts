/// <reference types="vite/client" />
// Blood Moon sound engine: buses, the master limiter, sample bank, synth primitives and the voice cap.
// Works on a live AudioContext and on an OfflineAudioContext alike (the harness renders through the
// same code), so everything is scheduled at explicit context times and nothing reads a wall clock.

export type BusName = 'sfx' | 'ui' | 'crowd' | 'music';

/**
 * Every sample the show uses, decoded once at unlock. Missing files are fine: that layer is skipped.
 * Recorded, CC0 or CC-BY (ASSETS.md): the Blood Moon set (cloth, claws, jaws, bats, a breath, a
 * wolf, a candle, a bell, a quill, a night wind) and the two Danse Macabre stings.
 */
export const SAMPLE_NAMES = [
  // body hits, by class: light smacks, body punches, heavy thuds, low impacts, one bone crack
  'p-light-1', 'p-light-2', 'p-light-3', 'p-light-4',
  'p-med-1', 'p-med-2', 'p-med-3', 'p-med-4',
  'p-heavy-1', 'p-heavy-2', 'p-heavy-3', 'p-heavy-4',
  'impact-low', 'impact-big', 'crack-lethal',
  // claws and jaws on top of a strike
  'claw-1', 'claw-2', 'bite-1', 'bite-2',
  // cloth and cloak: swings, jumps, dodges, throws
  'cloak-1', 'cloak-2', 'cloak-3', 'cloak-4', 'cloak-big-1', 'cloak-big-2', 'swoosh-long',
  // the Count and the Wolf
  'bats-1', 'bats-2', 'bat-squeak', 'mist', 'snarl-1', 'snarl-2', 'howl',
  // movement
  'step-a', 'step-b', 'step-c', 'step-d', 'land-1', 'grab-1',
  // the knockout: a bell and a candle
  'bell-toll', 'candle-snuff',
  // the show
  'quill-1', 'quill-2', 'clock-tick', 'lock-1', 'sting-danse-finale', 'sting-danse-hit',
  // the Empty Armour, the Magpie, the Hexer, the Mimic
  'plate-1', 'plate-2', 'plate-3', 'plates-fall', 'blade-1', 'blade-2', 'blade-3', 'flame', 'fire-breath',
  'knife-1', 'knife-2', 'feathers-1', 'feathers-2', 'magpie',
  'staff-1', 'staff-2', 'wood-knock', 'hex-crackle', 'ward-snap', 'crow', 'cackle',
  'creak-1', 'creak-2', 'lid-1', 'lid-2', 'lid-slam', 'tongue-whip', 'slurp', 'spit', 'coins-spill', 'coins-jingle', 'coin-bag',
  // the night under the fight
  'night-bed',
] as const;
export type SampleName = (typeof SAMPLE_NAMES)[number];

/** loops and long beds: never trimmed or faded at load */
const RAW = ['night-bed', 'music-danse-fight', 'music-danse-opening', 'music-danse-theme'];
/** fetched first at unlock, so the night is heard at once */
export const BED_NAMES: readonly string[] = ['night-bed'];

// ------------------------------------------------------------------------------------------------
// Sample bank: decoded once per page, shared by every context (AudioBuffers are context-free).
// Memory: every sample is decoded to mono at 32 kHz (the music beds at 24 kHz, and only the bed
// the current phase needs is held), so the whole bank stays near 20 MB of float data. Panning and
// the hall put the width back.
// ------------------------------------------------------------------------------------------------

const decoded = new Map<string, AudioBuffer | null>();
const pending = new Map<string, Promise<AudioBuffer | null>>();
const SFX_SR = 32000;
const BED_SR = 24000;
const decoders = new Map<number, BaseAudioContext>();
let assetRoot = '/';

/**
 * Every sound file's url as the bundler serves it (the site, the harness and the offline page all
 * run through vite, which rewrites this literal call). The page that mounts the game may serve
 * nothing at assetsBase, so this is the first choice; assetsBase is only the fallback. Under plain
 * node (tests) import.meta.glob does not exist: the table is simply empty.
 */
const URLS: Record<string, string> = (() => {
  const out: Record<string, string> = {};
  try {
    const g = import.meta.glob('../../../assets/vendor/sound/*.mp3', { eager: true, query: '?url', import: 'default' });
    for (const [path, url] of Object.entries(g)) {
      const m = /([^/]+)\.mp3$/.exec(path);
      if (m && typeof url === 'string') out[m[1]] = url;
    }
  } catch {
    /* not bundled (node): fall back to assetsBase */
  }
  return out;
})();

function urlOf(name: string): string {
  return URLS[name] ?? `${assetRoot}assets/vendor/sound/${name}.mp3`;
}

/** one warning for the first file that fails to load or decode, so a silent game is never a mystery */
let warnedLoad = false;
function warnLoad(name: string, url: string, err: unknown): void {
  if (warnedLoad) return;
  warnedLoad = true;
  console.warn(`[blood moon audio] could not load "${name}" from ${url}: ${err instanceof Error ? err.message : String(err)} (later failures are not reported)`);
}

/** an OfflineAudioContext only for decoding: decodeAudioData resamples to its rate */
function decoderAt(sr: number, fallback: BaseAudioContext | null): BaseAudioContext | null {
  let d = decoders.get(sr);
  if (!d) {
    try {
      d = new OfflineAudioContext(1, 1, sr);
    } catch {
      return fallback;
    }
    decoders.set(sr, d);
  }
  return d;
}

/**
 * Fold to mono, trim leading near-silence (mp3 encoder delay) so a hit lands on its frame, and fade
 * the last stretch to true silence so no layer ever ends on a hard edge. Loops are only folded.
 */
function prepare(b: AudioBuffer, raw: boolean): AudioBuffer {
  const sr = b.sampleRate;
  const nch = b.numberOfChannels;
  const src = Array.from({ length: nch }, (_, c) => b.getChannelData(c));
  const mono = (i: number) => {
    let v = 0;
    for (let c = 0; c < nch; c++) v += src[c][i];
    return v / nch;
  };
  let start = 0;
  if (!raw) {
    let peak = 0;
    for (let i = 0; i < b.length; i++) peak = Math.max(peak, Math.abs(mono(i)));
    const lim = peak * 0.02;
    while (start < b.length && Math.abs(mono(start)) < lim) start++;
    start = Math.max(0, start - Math.round(sr * 0.002));
    if (start < sr * 0.004) start = 0;
  }
  if (nch === 1 && start === 0 && raw) return b;
  const n = b.length - start;
  const out = new AudioBuffer({ numberOfChannels: 1, length: n, sampleRate: sr });
  const d = out.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = mono(start + i);
  if (!raw) {
    const fade = Math.min(n >> 1, Math.max(Math.round(sr * 0.05), Math.round(n * 0.18)));
    for (let i = 0; i < fade; i++) d[n - fade + i] *= Math.pow(1 - i / fade, 3);
  }
  return out;
}

function loadOne(ctx: BaseAudioContext | null, name: string): Promise<AudioBuffer | null> {
  if (decoded.has(name)) return Promise.resolve(decoded.get(name) ?? null);
  let p = pending.get(name);
  if (!p) {
    const bed = name.startsWith('music-');
    const dec = decoderAt(bed ? BED_SR : SFX_SR, ctx);
    const url = urlOf(name);
    p = fetch(url)
      .then((r) => {
        if (!r.ok) return Promise.reject(new Error(`HTTP ${r.status}`));
        // a site that serves its own page for unknown paths answers 200 with html: say so
        const ct = r.headers.get('content-type') ?? '';
        if (ct.includes('text/html')) return Promise.reject(new Error('the server answered with an html page, not audio'));
        return r.arrayBuffer();
      })
      .then((ab) => (dec ? dec.decodeAudioData(ab) : Promise.reject(new Error('no decoder'))))
      .then((b) => prepare(b, RAW.includes(name)))
      .catch((err) => {
        warnLoad(name, url, err);
        return null;
      })
      .then((b) => {
        pending.delete(name);
        decoded.set(name, b);
        return b;
      });
    pending.set(name, p);
  }
  return p;
}

export function loadSamples(ctx: BaseAudioContext | null, base: string, names: readonly string[] = SAMPLE_NAMES): Promise<void> {
  assetRoot = base.endsWith('/') ? base : base + '/';
  return Promise.all(names.map((n) => loadOne(ctx, n))).then(() => undefined);
}

/** load one long bed on demand (the music loops) */
export function loadBed(name: string): Promise<AudioBuffer | null> {
  return loadOne(null, name);
}

/** forget a decoded bed so its memory can go (it is fetched again if a phase needs it) */
export function releaseSample(name: string): void {
  decoded.delete(name);
}

/** how many sound files are decoded and ready (for the stage's sound check) */
export function decodedCount(): number {
  return decoded.size;
}

export function sample(name: string): AudioBuffer | null {
  return decoded.get(name) ?? null;
}

const rev = new Map<string, AudioBuffer>();
/** a sample backwards (made once, from the decoded buffer) */
export function reversed(name: string): AudioBuffer | null {
  const b = sample(name);
  if (!b) return null;
  let r = rev.get(name);
  if (!r || r.length !== b.length) {
    r = new AudioBuffer({ numberOfChannels: 1, length: b.length, sampleRate: b.sampleRate });
    const s = b.getChannelData(0);
    const d = r.getChannelData(0);
    // the sample's own fade-out becomes a fade-in; give the new end (its attack) a short fade too
    for (let i = 0; i < s.length; i++) d[i] = s[s.length - 1 - i];
    const f = Math.min(d.length >> 2, Math.round(b.sampleRate * 0.004));
    for (let i = 0; i < f; i++) d[d.length - 1 - i] *= i / f;
    rev.set(name, r);
  }
  return r;
}

export function missingSamples(): string[] {
  return SAMPLE_NAMES.filter((n) => decoded.has(n) && !decoded.get(n));
}

/** float bytes held by decoded audio (for the memory budget) */
export function decodedBytes(): number {
  let n = 0;
  for (const b of decoded.values()) if (b) n += b.length * b.numberOfChannels * 4;
  return n;
}

// ------------------------------------------------------------------------------------------------
// Deterministic variation (no Math.random: offline renders must repeat exactly)
// ------------------------------------------------------------------------------------------------

export class Rng {
  private s: number;
  constructor(seed = 0x9e3779b9) {
    this.s = seed >>> 0 || 1;
  }
  next(): number {
    let x = this.s;
    x ^= x << 13; x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5; x >>>= 0;
    this.s = x;
    return x / 4294967296;
  }
  range(a: number, b: number): number {
    return a + (b - a) * this.next();
  }
  pick<T>(arr: readonly T[]): T {
    return arr[Math.floor(this.next() * arr.length) % arr.length];
  }
}

// ------------------------------------------------------------------------------------------------
// The engine
// ------------------------------------------------------------------------------------------------

export interface SmpOpts {
  gain?: number;
  rate?: number;
  pan?: number;
  bus?: BusName;
  lp?: number;
  hp?: number;
  /** seconds into the sample */
  offset?: number;
  /** stop after this many seconds (with a short fade) */
  dur?: number;
  /** send to the reverb (0..1) */
  verb?: number;
  fadeIn?: number;
  /** shape the sample: full level for `hold` s, then an exponential decay with time constant `tc` */
  hold?: number;
  tc?: number;
  /** glide the playback rate to rate * rate1 over `glide` s (a servo winding up) */
  rate1?: number;
  glide?: number;
  /** play the sample backwards (a swell that lands on t + its length) */
  reverse?: boolean;
}

export interface NoiseOpts {
  dur: number;
  gain: number;
  attack?: number;
  /** band-pass centre at start and end (Hz) */
  f0: number;
  f1?: number;
  q?: number;
  type?: BiquadFilterType;
  pan?: number;
  bus?: BusName;
  verb?: number;
  /** envelope shape: exponential decay (default) or a swell that peaks at `peakAt` (s) */
  peakAt?: number;
  pink?: boolean;
  /** sparse crackle instead of steady noise (explosion sizzle, embers) */
  crackle?: boolean;
  /** waveshaper drive 0..1 after the filter (crunch) */
  drive?: number;
}

export interface ToneOpts {
  f0: number;
  f1?: number;
  dur: number;
  gain: number;
  type?: OscillatorType;
  attack?: number;
  /** time constant of the pitch glide */
  glide?: number;
  pan?: number;
  bus?: BusName;
  lp?: number;
  verb?: number;
  /** waveshaper drive 0..1 */
  drive?: number;
}

const VOICE_CAP = 24;

export class Engine {
  readonly ctx: BaseAudioContext;
  readonly out: GainNode;
  /** the site's volume (0..1), after the limiter */
  readonly vol: GainNode;
  readonly master: GainNode;
  readonly limiter: DynamicsCompressorNode;
  readonly bus: Record<BusName, GainNode>;
  /** extra gain stage per bus for ducking (music, crowd) */
  readonly duck: Record<BusName, GainNode>;
  readonly verbIn: GainNode;
  readonly rng = new Rng(1234567);
  private noiseBuf: AudioBuffer;
  private pinkBuf: AudioBuffer;
  private crackleBuf: AudioBuffer;
  private curves = new Map<number, Float32Array>();
  private voices: { end: number; prio: number }[] = [];
  private lastPick = new Map<string, number>();
  /** global playback-rate factor for samples (replays run slow and low) */
  rateMul = 1;
  /** gain factor applied to every layer scheduled while it is set (each recipe sets its level) */
  level = 1;
  /** while set, sfx layers go through this node instead of straight to the sfx bus (a hit class's
   *  own compressor, so the loud picks of a round-robin set are held to their rung of the ladder) */
  into: AudioNode | null = null;
  private squeezers = new Map<string, DynamicsCompressorNode>();

  /** a compressor that feeds the sfx bus, one per name, made on first use */
  squeezer(name: string, thresholdDb: number, outDb = 0, ratio = 3): DynamicsCompressorNode {
    let c = this.squeezers.get(name);
    if (!c) {
      c = this.ctx.createDynamicsCompressor();
      c.threshold.value = thresholdDb;
      c.knee.value = 4;
      c.ratio.value = ratio;
      c.attack.value = 0.0005;
      c.release.value = 0.12;
      // the compressor adds its own makeup gain: take it back out so the rung stays where it was set
      const out = this.ctx.createGain();
      out.gain.value = Math.pow(10, outDb / 20);
      c.connect(out);
      out.connect(this.bus.sfx);
      this.squeezers.set(name, c);
    }
    return c;
  }

  constructor(ctx: BaseAudioContext) {
    this.ctx = ctx;
    this.out = ctx.createGain();
    this.out.gain.value = 1;
    this.vol = ctx.createGain();
    this.vol.gain.value = 1;
    this.limiter = ctx.createDynamicsCompressor();
    // headroom for the ladder: light hits peak near -14 dBFS, the knockout near -1
    this.limiter.threshold.value = -2.5;
    this.limiter.knee.value = 1;
    this.limiter.ratio.value = 20;
    this.limiter.attack.value = 0.001;
    this.limiter.release.value = 0.12;
    this.master = ctx.createGain();
    this.master.gain.value = 0.9;
    // sub rumble off the whole mix, then the limiter, then a soft clip that only touches overshoots
    const lowCut = ctx.createBiquadFilter();
    lowCut.type = 'highpass';
    lowCut.frequency.value = 32;
    lowCut.Q.value = 0.6;
    const clip = ctx.createWaveShaper();
    const cc = new Float32Array(2048);
    for (let i = 0; i < cc.length; i++) {
      const x = (i / (cc.length - 1)) * 2 - 1;
      const a = Math.abs(x);
      const y = a < 0.86 ? a : 0.86 + 0.13 * Math.tanh((a - 0.86) / 0.13);
      cc[i] = Math.sign(x) * y;
    }
    clip.curve = cc;
    this.master.connect(lowCut);
    lowCut.connect(this.limiter);
    this.limiter.connect(clip);
    clip.connect(this.vol);
    this.vol.connect(this.out);
    this.out.connect(ctx.destination);

    const mk = (g: number): [GainNode, GainNode] => {
      const b = ctx.createGain();
      b.gain.value = g;
      const d = ctx.createGain();
      d.gain.value = 1;
      b.connect(d);
      d.connect(this.master);
      return [b, d];
    };
    const [sfx, dsfx] = mk(1);
    const [ui, dui] = mk(0.8);
    const [crowd, dcrowd] = mk(1.0);
    const [music, dmusic] = mk(0.6);
    this.bus = { sfx, ui, crowd, music };
    // the music sits above the hits' low end: cut its sub, thin its low mids
    const mhp = ctx.createBiquadFilter();
    mhp.type = 'highpass';
    mhp.frequency.value = 50;
    const mshelf = ctx.createBiquadFilter();
    mshelf.type = 'lowshelf';
    mshelf.frequency.value = 160;
    mshelf.gain.value = -3;
    // the score is already rolled off above about 5 kHz (the files): nothing added on top, so it
    // sits behind the hits
    const mair = ctx.createBiquadFilter();
    mair.type = 'highshelf';
    mair.frequency.value = 3000;
    mair.gain.value = 0;
    music.disconnect();
    music.connect(mhp);
    mhp.connect(mshelf);
    mshelf.connect(mair);
    mair.connect(dmusic);
    this.duck = { sfx: dsfx, ui: dui, crowd: dcrowd, music: dmusic };

    // a stone hall: generated impulse response, bright early, dark late
    const sr = ctx.sampleRate;
    const len = Math.floor(sr * 2.6);
    const ir = ctx.createBuffer(2, len, sr);
    const r = new Rng(77);
    for (let c = 0; c < 2; c++) {
      const d = ir.getChannelData(c);
      let lp = 0;
      for (let i = 0; i < len; i++) {
        const t = i / sr;
        // decays past -80 dB by the end of the buffer: the room never stops on an edge
        const env = Math.exp(-t / 0.4) * (t < 0.012 ? t / 0.012 : 1) * (t > 2.2 ? Math.max(0, (2.6 - t) / 0.4) : 1);
        const k = Math.min(0.95, 0.25 + t * 0.9); // darker as it decays
        lp = lp * k + (r.next() * 2 - 1) * (1 - k);
        d[i] = lp * env * 2.2;
      }
    }
    const conv = ctx.createConvolver();
    conv.buffer = ir;
    this.verbIn = ctx.createGain();
    this.verbIn.gain.value = 0.55;
    const vhp = ctx.createBiquadFilter();
    vhp.type = 'highpass';
    vhp.frequency.value = 280;
    this.verbIn.connect(vhp);
    vhp.connect(conv);
    conv.connect(this.duck.sfx);

    this.noiseBuf = ctx.createBuffer(1, sr * 2, sr);
    const nd = this.noiseBuf.getChannelData(0);
    const rn = new Rng(4242);
    for (let i = 0; i < nd.length; i++) nd[i] = rn.next() * 2 - 1;
    this.pinkBuf = ctx.createBuffer(1, sr * 2, sr);
    const pd = this.pinkBuf.getChannelData(0);
    let b0 = 0, b1 = 0, b2 = 0;
    for (let i = 0; i < pd.length; i++) {
      const w = nd[i];
      b0 = 0.99765 * b0 + w * 0.099046;
      b1 = 0.963 * b1 + w * 0.2965164;
      b2 = 0.57 * b2 + w * 1.0526913;
      pd[i] = (b0 + b1 + b2 + w * 0.1848) * 0.2;
    }
    // crackle: sparse short grains of noise with random sizes, like sparks and frying metal
    this.crackleBuf = ctx.createBuffer(1, sr * 2, sr);
    const cd = this.crackleBuf.getChannelData(0);
    const rc = new Rng(9191);
    for (let i = 0; i < cd.length;) {
      const gap = Math.floor(sr * rc.range(0.0015, 0.011));
      const glen = Math.floor(sr * rc.range(0.0008, 0.005));
      const amp = Math.pow(rc.next(), 1.6) * 2.2;
      for (let k = 0; k < glen && i + gap + k < cd.length; k++) cd[i + gap + k] += (rc.next() * 2 - 1) * amp * Math.exp(-k / (glen * 0.35));
      i += gap + glen;
    }
  }

  /** round robin: a random member of `arr`, never the one this key played last */
  rr<T>(key: string, arr: readonly T[]): T {
    const last = this.lastPick.get(key) ?? -1;
    let i = Math.floor(this.rng.next() * arr.length) % arr.length;
    if (arr.length > 1 && i === last) i = (i + 1 + Math.floor(this.rng.next() * (arr.length - 1))) % arr.length;
    this.lastPick.set(key, i);
    return arr[i];
  }

  get now(): number {
    return this.ctx.currentTime;
  }

  // ---- voices ----

  /** claim a voice; false when the cap is hit and this sound is not important enough */
  voice(t: number, dur: number, prio = 1): boolean {
    const now = this.ctx.currentTime;
    this.voices = this.voices.filter((v) => v.end > now);
    if (this.voices.length >= VOICE_CAP) {
      if (prio < 2) return false;
      // drop the least important voice's slot (it keeps sounding, we just stop counting it)
      let k = -1;
      for (let i = 0; i < this.voices.length; i++) if (this.voices[i].prio < prio && (k < 0 || this.voices[i].prio < this.voices[k].prio)) k = i;
      if (k < 0 && this.voices.length >= VOICE_CAP + 8) return false;
      if (k >= 0) this.voices.splice(k, 1);
    }
    this.voices.push({ end: t + dur, prio });
    return true;
  }

  activeVoices(): number {
    const now = this.ctx.currentTime;
    return this.voices.filter((v) => v.end > now).length;
  }

  // ---- routing helpers ----

  private tail(node: AudioNode, t: number, o: { pan?: number; bus?: BusName; verb?: number }): void {
    let n: AudioNode = node;
    if (o.pan) {
      const p = this.ctx.createStereoPanner();
      p.pan.value = Math.max(-1, Math.min(1, o.pan));
      n.connect(p);
      n = p;
    }
    n.connect(this.into && (o.bus ?? 'sfx') === 'sfx' ? this.into : this.bus[o.bus ?? 'sfx']);
    if (o.verb) {
      const s = this.ctx.createGain();
      s.gain.value = o.verb;
      n.connect(s);
      s.connect(this.verbIn);
    }
    void t;
  }

  /** play a sample. Returns its length in seconds (0 when missing). */
  smp(name: string, t: number, o: SmpOpts = {}): number {
    const b = o.reverse ? reversed(name) : sample(name);
    if (!b) return 0;
    const src = this.ctx.createBufferSource();
    src.buffer = b;
    const rate = (o.rate ?? 1) * this.rateMul;
    src.playbackRate.setValueAtTime(rate, t);
    if (o.rate1 && o.glide) src.playbackRate.exponentialRampToValueAtTime(rate * o.rate1, t + o.glide);
    const avgRate = o.rate1 && o.glide ? rate * Math.sqrt(o.rate1) : rate;
    let n: AudioNode = src;
    if (o.hp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'highpass';
      f.frequency.value = o.hp;
      n.connect(f);
      n = f;
    }
    if (o.lp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      n.connect(f);
      n = f;
    }
    const g = this.ctx.createGain();
    const gain = Math.max(0.0001, (o.gain ?? 1) * this.level);
    const off = o.offset ?? 0;
    const full = (b.duration - off) / avgRate;
    let len = o.dur ? Math.min(o.dur, full) : full;
    if (o.fadeIn) {
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain, t + o.fadeIn);
    } else g.gain.setValueAtTime(gain, t);
    if (o.tc != null) {
      // a shaped decay: hold, then fall exponentially (stops ~80 dB down). The decay is made fast
      // enough to be ~60 dB down before the recording runs out, so no layer ends on an edge.
      const h = Math.min(Math.max(o.fadeIn ?? 0, o.hold ?? 0), full * 0.5);
      const tc = Math.max(0.004, Math.min(o.tc, (len - h) / 7));
      g.gain.setTargetAtTime(0, t + h, tc);
      len = Math.min(full, h + tc * 13);
    } else if (o.dur && o.dur < full) {
      // cut short: an exponential fade that starts in the last third and runs on past `dur`
      // until it is ~120 dB down, never a gate
      const f = Math.max(0.08, len * 0.4);
      g.gain.setTargetAtTime(0, t + Math.max(0, len - f), f / 5);
      len = Math.min(full, len + f * 2);
    }
    n.connect(g);
    this.tail(g, t, o);
    src.start(t, off);
    src.stop(t + len + 0.01);
    return len;
  }

  /** filtered noise burst */
  noise(t: number, o: NoiseOpts): void {
    o = { ...o, gain: Math.max(0.00011, o.gain * this.level), f0: o.f0 * this.rateMul, f1: o.f1 != null ? o.f1 * this.rateMul : undefined };
    const src = this.ctx.createBufferSource();
    src.buffer = o.crackle ? this.crackleBuf : o.pink ? this.pinkBuf : this.noiseBuf;
    src.loop = true;
    const f = this.ctx.createBiquadFilter();
    f.type = o.type ?? 'bandpass';
    f.Q.value = o.q ?? 1;
    f.frequency.setValueAtTime(o.f0, t);
    if (o.f1 != null && o.f1 !== o.f0) f.frequency.exponentialRampToValueAtTime(Math.max(20, o.f1), t + o.dur);
    let n: AudioNode = f;
    src.connect(f);
    if (o.drive) {
      const ws = this.ctx.createWaveShaper();
      ws.curve = this.shaper(o.drive) as Float32Array<ArrayBuffer>;
      f.connect(ws);
      n = ws;
    }
    const g = this.ctx.createGain();
    const a = o.attack ?? 0.002;
    g.gain.setValueAtTime(0.00001, t);
    let end: number;
    if (o.peakAt != null) {
      // a swell: up to the peak, then down to -100 dB by the end (no edge)
      g.gain.exponentialRampToValueAtTime(o.gain, t + Math.max(0.005, o.peakAt));
      g.gain.exponentialRampToValueAtTime(0.00001, t + o.dur);
      end = t + o.dur + 0.02;
    } else {
      const tc = Math.max(0.002, (o.dur - a) / 4.5);
      g.gain.exponentialRampToValueAtTime(o.gain, t + a);
      g.gain.setTargetAtTime(0, t + a, tc);
      end = t + a + tc * 14; // ~120 dB down: the decay reaches silence before the source stops
    }
    n.connect(g);
    this.tail(g, t, o);
    const off = this.rng.range(0, 1.5);
    src.start(t, off);
    src.stop(end);
  }

  private shaper(drive: number): Float32Array {
    const k = Math.round(drive * 100);
    let c = this.curves.get(k);
    if (!c) {
      c = new Float32Array(1024);
      const amt = 1 + drive * 30;
      for (let i = 0; i < 1024; i++) {
        const x = (i / 1023) * 2 - 1;
        c[i] = Math.tanh(x * amt) / Math.tanh(amt);
      }
      this.curves.set(k, c);
    }
    return c;
  }

  /** an oscillator with a pitch glide and a percussive envelope */
  tone(t: number, o: ToneOpts): void {
    o = { ...o, gain: Math.max(0.00011, o.gain * this.level), f0: o.f0 * this.rateMul, f1: o.f1 != null ? o.f1 * this.rateMul : undefined };
    const osc = this.ctx.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.f0, t);
    if (o.f1 != null && o.f1 !== o.f0) osc.frequency.setTargetAtTime(o.f1, t, o.glide ?? o.dur / 4);
    let n: AudioNode = osc;
    if (o.drive) {
      const ws = this.ctx.createWaveShaper();
      ws.curve = this.shaper(o.drive) as Float32Array<ArrayBuffer>;
      n.connect(ws);
      n = ws;
    }
    if (o.lp) {
      const f = this.ctx.createBiquadFilter();
      f.type = 'lowpass';
      f.frequency.value = o.lp;
      n.connect(f);
      n = f;
    }
    const g = this.ctx.createGain();
    const a = o.attack ?? 0.002;
    const tc = Math.max(0.005, (o.dur - a) / 5);
    g.gain.setValueAtTime(0.00001, t);
    g.gain.exponentialRampToValueAtTime(o.gain, t + a);
    g.gain.setTargetAtTime(0, t + a, tc);
    n.connect(g);
    this.tail(g, t, o);
    osc.start(t);
    osc.stop(t + a + tc * 14);
  }

  /**
   * Modal ring of a struck steel plate or bar: a few inharmonic partials, each decaying on its own.
   * Each partial is a narrow band of noise, not a sine, and sags a little in pitch as it dies, so
   * the ring reads as struck metal and never as a test tone.
   * ratios: partial frequency ratios; the higher ones die faster.
   */
  ring(t: number, f: number, o: { gain: number; decay: number; ratios?: number[]; pan?: number; bus?: BusName; verb?: number; bright?: number; q?: number; sag?: number }): void {
    o = { ...o, gain: o.gain * this.level };
    f *= this.rateMul;
    const sag = o.sag ?? 0.018;
    const ratios = o.ratios ?? [1, 2.32, 4.25, 6.63];
    const g = this.ctx.createGain();
    g.gain.value = 1;
    this.tail(g, t, o);
    const sr = this.ctx.sampleRate;
    ratios.forEach((r, i) => {
      const fr = Math.min(sr * 0.45, f * r * (1 + this.rng.range(-0.006, 0.006)));
      const q = (o.q ?? 16) / (1 + i * 0.25);
      const src = this.ctx.createBufferSource();
      src.buffer = this.noiseBuf;
      src.loop = true;
      const bp = this.ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = q;
      const dec = o.decay / (1 + i * 0.9);
      bp.frequency.setValueAtTime(fr * (1 + sag * 0.35), t);
      bp.frequency.setTargetAtTime(fr * (1 - sag * 0.65), t, dec * 0.5);
      // a narrow band of white noise is much quieter than a sine of the same peak: compensate
      const comp = Math.sqrt((sr * q) / (2 * fr)) * 1.2;
      const pg = this.ctx.createGain();
      const amp = Math.max(0.0002, ((o.gain * Math.pow(o.bright ?? 0.6, i)) / (1 + i * 0.3)) * comp);
      pg.gain.setValueAtTime(0.00001, t);
      pg.gain.exponentialRampToValueAtTime(amp, t + 0.003);
      pg.gain.setTargetAtTime(0, t + 0.003, dec / 4);
      src.connect(bp);
      bp.connect(pg);
      pg.connect(g);
      src.start(t, this.rng.range(0, 1.5));
      src.stop(t + 0.003 + (dec / 4) * 14);
    });
  }

  /** duck a bus: drop to `level` (linear) over `attack`, hold, recover over `release` */
  duckBus(name: BusName, t: number, level: number, attack: number, hold: number, release: number): void {
    const p = this.duck[name].gain;
    p.cancelScheduledValues(t);
    // start from wherever it is now (approximation: the current value)
    p.setValueAtTime(p.value, t);
    p.linearRampToValueAtTime(level, t + attack);
    p.setValueAtTime(level, t + attack + hold);
    p.linearRampToValueAtTime(1, t + attack + hold + release);
  }

  /** the site's master volume, 0..1 (0 is silent), smoothed over about 50 ms */
  setVolume(v: number, now = false): void {
    const g = Math.max(0, Math.min(1, v));
    const t = this.ctx.currentTime;
    const p = this.vol.gain;
    p.cancelScheduledValues(t);
    if (now) p.setValueAtTime(g, t);
    else {
      p.setValueAtTime(p.value, t);
      p.setTargetAtTime(g, t, 0.016);
    }
  }

  setMasterMuted(m: boolean): void {
    const t = this.ctx.currentTime;
    this.out.gain.cancelScheduledValues(t);
    this.out.gain.setTargetAtTime(m ? 0 : 1, t, 0.03);
  }
}

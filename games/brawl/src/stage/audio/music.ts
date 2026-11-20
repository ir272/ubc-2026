// Ringout music. The show plays two recorded loops (see TRACKS below); this file also keeps a
// fallback made in code, rendered once into looping buffers, used only if a recording cannot load.
//
// The fallback: two loops in D minor at 132 BPM, both 8 bars (14.55 s), built from the same parts so the show
// sounds like one piece: a dock-yard band of struck steel, a driving bass and a drum kit.
//   fight: kick and backbeat snare, 16th hats, an 8th-note bass drive, palm-muted power chugs and a
//          struck-steel motif every two bars (i - VI - VII - V).
//   bed:   for every other phase. No backbeat; a soft pulse, sustained bass, a filtered pad and the
//          steel motif sparse, so the calls and screens sit on top.
// Rendered through OfflineAudioContext at startup (well under a second), then looped with no cost.

import { Engine, loadBed, releaseSample, sample } from './engine.ts';

export const BPM = 132;
const S16 = 60 / BPM / 4; // a 16th note, s
const BAR = S16 * 16;
export const LOOP_BARS = 8;
export const LOOP_S = BAR * LOOP_BARS;
const TAIL = 1.6;

// chord roots per two bars: D, Bb, C, A
const ROOTS = [73.42, 58.27, 65.41, 55.0];
// minor or major third over each root (D minor: Dm, Bb, C, A)
const THIRDS = [1.189, 1.26, 1.26, 1.26];

function kick(e: Engine, t: number, g = 1): void {
  e.tone(t, { f0: 180, f1: 58, dur: 0.22, gain: 0.38 * g, glide: 0.02 });
  e.tone(t, { f0: 110, f1: 60, dur: 0.12, gain: 0.14 * g, type: 'triangle', drive: 0.5, lp: 500 });
  e.noise(t, { dur: 0.012, gain: 0.25 * g, f0: 4000, q: 0.6 });
}

function snare(e: Engine, t: number, g = 1): void {
  e.noise(t, { dur: 0.22, gain: 0.42 * g, f0: 2100, q: 0.7, verb: 0.25 });
  e.noise(t, { dur: 0.09, gain: 0.25 * g, f0: 6500, q: 0.8 });
  e.tone(t, { f0: 210, f1: 165, dur: 0.12, gain: 0.32 * g, type: 'triangle' });
  // a plate struck with the snare: the dock-yard colour
  e.smp('body-1', t, { gain: 0.16 * g, rate: 0.82, lp: 4500 });
}

function hat(e: Engine, t: number, g: number, open = false): void {
  e.noise(t, { dur: open ? 0.26 : 0.045, gain: 0.12 * g, f0: 8500, q: 0.6, type: 'highpass' });
}

function bassNote(e: Engine, t: number, f: number, dur: number, g = 1, bright = 0.5): void {
  e.tone(t, { f0: f, dur, gain: 0.22 * g, type: 'sawtooth', lp: 320 + 700 * bright, drive: 0.35, attack: 0.006 });
  e.tone(t, { f0: f, dur, gain: 0.12 * g, type: 'sine', attack: 0.006 });
}

function chug(e: Engine, t: number, root: number, g: number, dur = 0.11): void {
  // a palm-muted power chord: root, fifth, octave, detuned, driven, dark
  for (const [m, det] of [[2, -6], [2, 6], [3, 0], [4, 3]] as const) {
    e.tone(t, { f0: root * m * Math.pow(2, det / 1200), dur, gain: 0.045 * g, type: 'sawtooth', drive: 0.75, lp: 1100, attack: 0.003 });
  }
}

function steel(e: Engine, t: number, f: number, g: number): void {
  // a struck steel bar: the melody instrument of the yard
  e.ring(t, f, { gain: 0.07 * g, decay: 0.9, ratios: [1, 2.756, 5.404, 8.933], bright: 0.45, verb: 0.35 });
  e.ring(t, f * 2, { gain: 0.02 * g, decay: 0.4, ratios: [1], verb: 0.2 });
}

function pad(e: Engine, t: number, root: number, third: number, dur: number, g: number): void {
  for (const [m, det] of [[2, -8], [2, 8], [2 * third, -5], [2 * third, 5], [3, 0], [4, -4]] as const) {
    e.tone(t, { f0: root * m * Math.pow(2, det / 1200), dur, gain: 0.03 * g, type: 'sawtooth', lp: 900, attack: dur * 0.35 });
  }
}

// the steel motif (scale degrees over D minor, as frequency ratios of D5 = 587.3 Hz)
const D5 = 587.33;
const MOTIF: [number, number][][] = [
  // [16th step, ratio]
  [[0, 1], [3, 1.189], [6, 1.335], [10, 1.189], [12, 1.122]],
  [[0, 1.0], [3, 0.891], [6, 0.794], [8, 0.891], [14, 1]],
];

function arrange(e: Engine, kind: 'fight' | 'bed', t0: number): void {
  for (let bar = 0; bar < LOOP_BARS; bar++) {
    const tb = t0 + bar * BAR;
    const ci = Math.floor(bar / 2) % 4;
    const root = ROOTS[ci];
    const lastBar = bar === LOOP_BARS - 1;
    for (let s = 0; s < 16; s++) {
      const t = tb + s * S16;
      if (kind === 'fight') {
        // drums
        const kickSteps = lastBar ? [0, 6, 8, 10, 11] : [0, 6, 8, 11];
        if (kickSteps.includes(s)) kick(e, t, s === 0 ? 1 : 0.85);
        if (s === 4 || s === 12) snare(e, t);
        if (lastBar && (s === 13 || s === 14 || s === 15)) snare(e, t, 0.55 + 0.15 * (s - 13));
        hat(e, t, s % 4 === 2 ? 0.9 : s % 2 === 0 ? 0.5 : 0.28, s === 14 && bar % 2 === 1);
        // bass: 8ths, octave jump on the "and" of 2 and 4
        if (s % 2 === 0) {
          const up = s === 6 || s === 14;
          bassNote(e, t, root * (up ? 2 : 1), S16 * 3.4, s === 0 ? 0.85 : 0.65, s === 0 ? 0.7 : 0.4);
        }
        // chugs on the off 16ths that drive into the next beat
        if (s % 2 === 0 && !(lastBar && s >= 12)) chug(e, t, root, s % 4 === 0 ? 1 : 0.6);
        if (lastBar && s === 12) chug(e, t, root, 1.3, 0.45);
        // a held chord under the drive so the bed is continuous, not a pulse
        if (s === 0 && bar % 2 === 0) pad(e, t, root, THIRDS[ci], BAR * 2 - 0.05, 0.55);
      } else {
        // bed: pulse on the beat, soft hats, long bass, pad
        if (s === 0) kick(e, t, 0.45);
        if (s === 8 && bar % 2 === 1) kick(e, t, 0.3);
        if (s % 2 === 0) hat(e, t, s % 4 === 2 ? 0.45 : 0.2);
        if (s === 0) bassNote(e, t, root, BAR * 0.95, 0.7, 0.15);
        if (s === 0 && bar % 2 === 0) pad(e, t, root, THIRDS[ci], BAR * 2 - 0.05, 1);
      }
    }
    // the steel motif: every bar in the fight (alternating phrases), every other bar in the bed
    const phrase = MOTIF[bar % 2];
    if (kind === 'fight' || bar % 2 === 0) {
      const tr = ci === 1 ? 0.794 : ci === 2 ? 0.891 : ci === 3 ? 0.749 : 1; // follow the chord
      for (const [s, r] of phrase) steel(e, tb + s * S16, D5 * r * tr, kind === 'fight' ? 1 : 0.7);
    }
    if (kind === 'fight' && bar === 0) e.noise(tb, { dur: 1.6, gain: 0.12, f0: 6000, q: 0.4, type: 'highpass', verb: 0.3 });
  }
}

/** Render one loop. The tail past the loop end is folded back onto the start so it loops seamlessly. */
export async function renderMusic(kind: 'fight' | 'bed', sampleRate = 44100): Promise<AudioBuffer> {
  const len = Math.ceil((LOOP_S + TAIL) * sampleRate);
  const ctx = new OfflineAudioContext(2, len, sampleRate);
  const e = new Engine(ctx);
  e.master.gain.value = 0.55;
  arrange(e, kind, 0);
  const out = await ctx.startRendering();
  const n = Math.round(LOOP_S * sampleRate);
  const loop = new AudioBuffer({ numberOfChannels: 2, length: n, sampleRate });
  for (let c = 0; c < 2; c++) {
    const src = out.getChannelData(c);
    const dst = loop.getChannelData(c);
    dst.set(src.subarray(0, n));
    for (let i = n; i < src.length; i++) dst[i - n] += src[i];
  }
  return loop;
}

/**
 * The recorded loops (CC-BY 4.0, Kevin MacLeod, see ASSETS.md):
 *   fight  "Metalmania", 150 BPM: a metal band (drums, bass, guitars), 32 bars cut from the middle
 *          of the piece (77.6 to 128.8 s), 51.2 s.
 *   bed    "Industrial Cinematic", 110 BPM: industrial percussion and synths, 16 bars from its calmer
 *          middle (87.3 to 122.2 s), 34.9 s, for every phase that is not the fight.
 * Each was cut on its downbeats (50 ms ahead of them) and its first 30 ms crossfaded with the audio
 * that followed its end in the original, so the end runs into the start without a click; the
 * buffer is folded onto that exact length (decoder padding) and the seam crossfaded again over
 * 12 ms in code. The generated loops stay as the fallback if a recording cannot load.
 */
const TRACKS: Record<'fight' | 'bed', { name: string; len: number }> = {
  fight: { name: 'music-fight', len: 51.2 },
  bed: { name: 'music-bed', len: 34.909093 },
};

const loopEnds = new WeakMap<AudioBuffer, number>();
/** where a music buffer's loop ends (s); 0 means the whole buffer */
export function loopEndOf(b: AudioBuffer): number {
  return loopEnds.get(b) ?? 0;
}

/** done in place (no second copy of a 90 s stereo buffer): only the first 12 ms change */
function loopTrack(b: AudioBuffer, nominal: number): AudioBuffer {
  if (loopEnds.has(b)) return b;
  const sr = b.sampleRate;
  const L = Math.min(b.length, Math.round(nominal * sr));
  const N = Math.round(0.012 * sr);
  const n = L - N;
  for (let c = 0; c < b.numberOfChannels; c++) {
    const d = b.getChannelData(c);
    // the head fades in over the tail that would have followed it: continuous at both joins
    for (let i = 0; i < N; i++) {
      const w = Math.sin(((i + 0.5) / N) * Math.PI * 0.5);
      d[i] = d[i] * w + d[n + i] * Math.sqrt(1 - w * w);
    }
  }
  loopEnds.set(b, n / sr);
  return b;
}

const cache = new Map<string, Promise<AudioBuffer>>();
/**
 * The loop for a phase. The recording is fetched and decoded the first time its phase needs it
 * (mono, 24 kHz); the generated loop is the fallback when the recording cannot load.
 */
export function music(kind: 'fight' | 'bed', sampleRate = 44100): Promise<AudioBuffer> {
  const tr = TRACKS[kind];
  let p = cache.get(kind);
  if (!p) {
    p = loadBed(tr.name).then((rec) => (rec ? loopTrack(rec, tr.len) : renderMusic(kind, sampleRate)));
    cache.set(kind, p);
  }
  return p;
}

/** drop a loop nobody is playing, so only one bed is held in memory at a time */
export function releaseMusic(kind: 'fight' | 'bed'): void {
  cache.delete(kind);
  releaseSample(TRACKS[kind].name);
}

/** the music bus level each loop needs so both sit at the same place in the mix */
export function musicTrim(kind: 'fight' | 'bed'): number {
  const rec = !!sample(TRACKS[kind].name);
  if (!rec) return 1;
  return kind === 'fight' ? 1.0 : 1.3;
}

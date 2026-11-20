// Blood Moon music: one score, Danse Macabre (Saint-Saens, Kevin MacLeod's recording, CC BY 4.0,
// ASSETS.md). Two loops cut from the one recording, plus two stings (sounds.ts, stingFinale and
// stingHit) from MacLeod's own Danse Macabre pieces.
//
//   fight  69.49 to 160.075 s of the piece (90.585 s): the waltz at full orchestra from the first
//          bar; the end runs back into the start where the theme comes round again (the seam was
//          chosen by matching the 5 s after each point, and the head is crossfaded over 250 ms
//          with the audio that followed the end).
//   bed    0.95 to 21.70 s (20.75 s): the quiet opening, the harp striking midnight and the solo
//          violin, for every phase that is not the fight, at a low level.
// Both levelled to about -20 LUFS integrated, true peak under -1 dBTP, rolled off above 5 kHz
// (12 dB per octave) so the score sits behind the hits. If a recording cannot load the phase is
// silent (no generated music).

import { loadBed, releaseSample, sample } from './engine.ts';

const TRACKS: Record<'fight' | 'bed', { name: string; len: number }> = {
  fight: { name: 'music-danse-fight', len: 90.585 },
  bed: { name: 'music-danse-opening', len: 20.75 },
};

const loopEnds = new WeakMap<AudioBuffer, number>();
/** where a music buffer's loop ends (s); 0 means the whole buffer */
export function loopEndOf(b: AudioBuffer): number {
  return loopEnds.get(b) ?? 0;
}

/** done in place (no second copy of a long buffer): only the first 12 ms change */
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

/** a short silent loop: what a phase plays when its recording cannot load */
function silence(sampleRate: number): AudioBuffer {
  return new AudioBuffer({ numberOfChannels: 1, length: Math.round(sampleRate), sampleRate });
}

const cache = new Map<string, Promise<AudioBuffer>>();
/**
 * The loop for a phase. The recording is fetched and decoded the first time its phase needs it
 * (mono, 24 kHz); silence when it cannot load.
 */
export function music(kind: 'fight' | 'bed', sampleRate = 44100): Promise<AudioBuffer> {
  const tr = TRACKS[kind];
  let p = cache.get(kind);
  if (!p) {
    p = loadBed(tr.name).then((rec) => (rec ? loopTrack(rec, tr.len) : silence(sampleRate)));
    cache.set(kind, p);
  }
  return p;
}

/** drop a loop nobody is playing, so only one bed is held in memory at a time */
export function releaseMusic(kind: 'fight' | 'bed'): void {
  cache.delete(kind);
  releaseSample(TRACKS[kind].name);
}

/** the music bus level each loop plays at: the fight full, the opening well under it */
export function musicTrim(kind: 'fight' | 'bed'): number {
  const rec = !!sample(TRACKS[kind].name);
  if (!rec) return 1;
  return kind === 'fight' ? 1.25 : 0.6;
}

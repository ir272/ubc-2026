// Ringout sound: the AudioRig the stage calls every frame.
//
// Silent until unlock() (browsers need a gesture). unlock() makes the one AudioContext inside the
// gesture (or resumes it), plays one silent sample so iOS lets it run, and creates the director at
// once: the crowd bed and the music start as soon as their files are decoded (a fraction of a
// second), never on a second gesture. The beds are fetched first, then every other sample in the
// background; a sample that is missing or not decoded yet is simply skipped (the show plays on).
// The director turns every Frame into sound: fight sounds from frame.fight.events and the fight
// state, show sounds from frame.show changes. Recipes live in audio/sounds.ts, the mixer and voice
// cap in audio/engine.ts, the music in audio/music.ts. harness/audio.html renders the same code
// offline for measurement.
//
// Volume: setVolume(v) sets a master gain 0..1 after the limiter (0 is silent), smoothed over about
// 50 ms; called before unlock it is remembered and applied when the context is made. setMuted(m)
// is a separate gain on top of it, so muting and unmuting returns to the same volume.

import type { AudioRig, CreateAudio, Frame, StageCtx } from './api.ts';
import { BED_NAMES, Engine, SAMPLE_NAMES, loadSamples } from './audio/engine.ts';
import { createDirector, type Director, type MoveDefs } from './audio/director.ts';

type AC = typeof AudioContext;

export const createAudio: CreateAudio = (ctx: StageCtx): AudioRig => {
  let muted = false;
  let volume = 1;
  let ac: AudioContext | null = null;
  let engine: Engine | null = null;
  let director: Director | null = null;
  let disposed = false;

  function boot(): void {
    if (ac || disposed) return;
    const Ctor: AC | undefined = (globalThis as { AudioContext?: AC; webkitAudioContext?: AC }).AudioContext
      ?? (globalThis as { webkitAudioContext?: AC }).webkitAudioContext;
    if (!Ctor) return;
    try {
      ac = new Ctor({ latencyHint: 'interactive' });
    } catch {
      ac = null;
      return;
    }
    engine = new Engine(ac);
    engine.setVolume(volume, true);
    engine.setMasterMuted(muted);
    try {
      // one silent sample inside the gesture: some mobile browsers only unlock on a played source
      const b = ac.createBuffer(1, 1, ac.sampleRate);
      const s = ac.createBufferSource();
      s.buffer = b;
      s.connect(ac.destination);
      s.start(0);
    } catch {
      /* not needed everywhere */
    }
    // the director exists from the first frame; it starts the beds the moment they are decoded
    director = createDirector(engine, { live: true, defs: ctx.fighterDefs as unknown as MoveDefs });
    // the beds first (the crowd now, the music on demand), then everything else
    const rest = SAMPLE_NAMES.filter((n) => !BED_NAMES.includes(n));
    loadSamples(ac, ctx.assetsBase, BED_NAMES)
      .then(() => (disposed ? undefined : loadSamples(ac, ctx.assetsBase, rest)))
      .catch(() => {
        /* the show plays on without them */
      });
  }

  return {
    update(frame: Frame) {
      if (!director || !ac) return;
      if (ac.state !== 'running') return;
      try {
        director.update(frame);
      } catch (err) {
        // sound must never take the stage down
        console.warn('[ringout audio]', err);
      }
    },
    unlock() {
      boot();
      if (ac && ac.state !== 'running') void ac.resume().catch(() => undefined);
    },
    setMuted(m: boolean) {
      muted = !!m;
      engine?.setMasterMuted(muted);
    },
    setVolume(v: number) {
      if (typeof v !== 'number' || Number.isNaN(v)) return;
      volume = Math.max(0, Math.min(1, v));
      engine?.setVolume(volume);
    },
    dispose() {
      disposed = true;
      director?.stop();
      director = null;
      const a = ac;
      ac = null;
      engine = null;
      if (a) void a.close().catch(() => undefined);
    },
  };
};

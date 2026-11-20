// Tumbletop sound. Recorded where there is a recording: one looping music track and a one-shot for
// each moment (web/src/audio/, see samples.js and ASSETS.md). Each sound also has a synthesised
// stand-in (Web Audio), used when its file is missing or has not loaded yet: a music box with a
// figure per phase, pips, bells, a thump and a crack for a hit, a slide whistle for a fall.
//
// The mix is shaped by measurement (tools/sound.mjs writes the numbers): betting is quiet, the lock
// lands hard, a race lifts toward the line, the final sits higher, and the win is the loudest thing
// in the show. Every one-shot ducks the music for a moment so it stands clear of it.
//
// Browsers only let audio start after a user gesture: the context is created on the first
// pointer or key event anywhere on the page. Until then every call here is a no-op.
//
//   const snd = createSound();
//   snd.setPhase('call' | 'lineup' | 'title' | 'race' | 'cut' | 'recap' | 'result' | 'idle', { round })
//   snd.pip(n)  snd.go()  snd.tick()  snd.through(left)  snd.lastPlace()  snd.lock()  snd.knock()  snd.fall()  snd.win()
//   snd.setVolume(0..1)  snd.destroy()

// D major pentatonic over two octaves, as frequencies. The music box only ever plays these.
const SCALE = [293.66, 329.63, 369.99, 440.0, 493.88, 587.33, 659.25, 739.99, 880.0, 987.77, 1174.66];

// One bar = 8 steps. A figure is scale indexes (-1 = rest). Each phase: tempo (steps per second),
// the figure, how loud the box is, the room (band noise) and the air (high noise) under it, and for
// a race the seconds over which it builds.
const PHASES = {
  idle: { rate: 2.2, vol: 0.45, room: 0.008, air: 0.002, pad: 0.055, bars: [[0, -1, 4, -1, 3, -1, 5, -1], [2, -1, 4, -1, 3, -1, 1, -1]] },
  call: { rate: 5.2, vol: 0.8, room: 0.015, air: 0.008, bars: [[0, 3, 5, 3, 6, 5, 3, 5], [1, 4, 6, 4, 7, 6, 4, 6], [0, 3, 5, 3, 8, 6, 5, 3], [4, 3, 1, 3, 0, -1, 5, -1]] },
  lineup: { rate: 3.6, vol: 0.62, room: 0.008, air: 0.002, pad: 0.055, bars: [[0, -1, 3, 5, -1, 3, 4, -1], [1, -1, 3, 6, -1, 4, 3, -1], [0, -1, 5, 6, -1, 5, 3, -1], [1, -1, 4, 3, -1, 1, 0, -1]] },
  title: { rate: 6.5, vol: 0.9, room: 0.02, air: 0.012, bars: [[0, 0, 3, 3, 5, 5, 8, 8], [1, 1, 4, 4, 6, 6, 9, 9]] },
  race: { rate: 7.6, vol: 0.62, room: 0.04, air: 0.012, build: 34, top: 0.6, bars: [[0, 5, 3, 5, 0, 6, 3, 6], [1, 6, 4, 6, 1, 7, 4, 7], [0, 5, 3, 5, 0, 8, 5, 8], [1, 6, 4, 6, 3, 5, 4, 3]] },
  final: { rate: 8.8, vol: 0.62, room: 0.05, air: 0.014, build: 19, top: 0.45, bars: [[0, 5, 3, 8, 0, 6, 3, 9], [1, 6, 4, 9, 1, 7, 4, 10], [0, 5, 3, 8, 5, 8, 6, 9], [1, 6, 4, 6, 8, 5, 4, 3]] },
  cut: { rate: 2.0, vol: 0.55, room: 0.03, air: 0.006, pad: 0.055, bars: [[5, -1, 3, -1, 0, -1, -1, -1]] },
  recap: { rate: 3.0, vol: 0.82, room: 0.008, air: 0.002, pad: 0.055, bars: [[5, -1, 3, 1, -1, 0, -1, -1], [4, -1, 3, 0, -1, 1, -1, -1]] },
  result: { rate: 5.6, vol: 0.85, room: 0.03, air: 0.008, bars: [[0, 3, 5, 8, 5, 8, 10, 8], [1, 4, 6, 9, 6, 9, 10, 9], [0, 3, 5, 8, 10, 8, 5, 3], [5, 8, 10, -1, 8, -1, 5, -1]] },
};

import { loadBank } from './samples.js';

const MIX = { box: 1.0, fx: 1.0, volume: 0.82 };
// The recorded music track's level in each phase (the track replaces the music box when its file is
// there). A race lifts it by MUSIC_BUILD over its length.
// Recordings are played CLEAN: straight to the output with headroom, no compressor, no clipper, no
// equaliser, no pitch change. (The first recorded mix pushed the track to 6.4 times its level and
// the one-shots to as much as 3 times full scale through a fast compressor and a soft clipper, to
// hit loudness numbers; it measured well and sounded horrible.) The track peaks at about -10 dBFS in
// its file: MUSIC_GAIN takes its peaks to about -5, the table shapes it by phase, and a one-shot
// never plays above ONE_SHOT (peaks about -6 dBFS), so the two together stay under full scale.
const MUSIC_GAIN = 1.0;
// (music files are prepared at about -20 LUFS, so these are plain multipliers and nothing clips)
const MUSIC = { idle: 0.5, call: 0.8, lineup: 0.7, title: 0.9, race: 0.9, final: 1.0, cut: 0.6, recap: 0.8, result: 1.0 };
const MUSIC_BUILD = 1.15;
const ONE_SHOT = 0.85;
// With no music file there is no music at all: the owner rejected the synthesised music box and
// the first recorded track, and silence under the effects is better than either until he picks one.
const MUSIC_BOX = false;
// The same for one-shots: the owner rejected the synthesised sounds as well as the first recorded
// set, so a sound with no file is SILENT. Nothing synthesised plays unless this is turned back on.
const STAND_INS = false;
const METHODS = ['pip', 'go', 'tick', 'through', 'lastPlace', 'lock', 'knock', 'fall', 'win'];

// The voices and the buses, on any audio context (the live one or an offline render). Every
// function takes the time it should sound at, so the two paths play exactly the same mix.
function createKit(ctx, volume, bank = {}) {
  const master = ctx.createGain(); master.gain.value = volume;
  // a peak catcher only: the level differences between phases are meant to be heard
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -9; comp.knee.value = 6; comp.ratio.value = 8; comp.attack.value = 0.003; comp.release.value = 0.12;
  // and a soft ceiling a decibel and a half under full scale, so a stack of bells and a thump never clips
  const ceil = ctx.createWaveShaper();
  const curve = new Float32Array(2049), DRIVE = 1.3, TOP = 0.84;
  for (let i = 0; i < curve.length; i++) { const x = (i / 1024 - 1) * 2; curve[i] = Math.tanh(DRIVE * x) / Math.tanh(DRIVE * 2) * TOP; }
  ceil.curve = curve; ceil.oversample = '4x';
  const pre = ctx.createGain(); pre.gain.value = 0.5; // the curve spans -2..2 of input
  master.connect(comp); comp.connect(pre); pre.connect(ceil); ceil.connect(ctx.destination);
  const duck = ctx.createGain(); duck.connect(master);         // the bed steps back under a one-shot
  const boxBus = ctx.createGain(); boxBus.gain.value = PHASES.idle.vol * MIX.box; boxBus.connect(duck);
  const fxBus = ctx.createGain(); fxBus.gain.value = MIX.fx; fxBus.connect(master);
  // the clean path for recordings: volume, then the output. Nothing else touches them.
  const clean = ctx.createGain(); clean.gain.value = volume; clean.connect(ctx.destination);
  const musicDuck = ctx.createGain(); musicDuck.connect(clean); // the track eases back 3 dB under a jingle
  const musicBus = ctx.createGain(); musicBus.gain.value = MUSIC.idle * MUSIC_GAIN; musicBus.connect(musicDuck);
  const recBus = ctx.createGain(); recBus.gain.value = ONE_SHOT; recBus.connect(clean);
  function easeMusic(at, hold) {
    if (!inside(at)) return;
    musicDuck.gain.setTargetAtTime(0.7, at, 0.05);
    musicDuck.gain.setTargetAtTime(1, at + hold, 0.5);
  }

  // a recorded sound by name; false when there is no such file (the caller then synthesises it)
  function play(name, at, gain = 1) {
    const buf = bank[name];
    if (!buf || !inside(at)) return false;
    const src = ctx.createBufferSource(); src.buffer = buf; const bus = recBus;
    const g = ctx.createGain(); g.gain.value = gain;
    src.connect(g); g.connect(bus); src.start(at);
    return true;
  }
  // one of several takes of the same sound ("hit-1", "hit-2", ...), in turn
  let takeN = 0;
  function playAny(base, at, gain = 1) {
    const names = Object.keys(bank).filter((k) => k === base || k.startsWith(`${base}-`)).sort();
    if (!names.length) return false;
    return play(names[takeN++ % names.length], at, gain);
  }
  // Music is a set of tracks, one per part of the show, never one loop under everything:
  //   music-lineup  the call, the line-up while bets are open, the roster shelf
  //   music-race    Rounds One and Two (music-race-2, if there is one, for Round Two)
  //   music-final   the Final
  //   music-win     the winner
  // A part with no file is silent. Tracks crossfade at the change of part; a track that is shorter
  // than its part loops, each pass fading in over MX seconds while the pass before fades out (and
  // the few milliseconds of padding an AAC or MP3 file carries at each end are skipped).
  const TRACK = { idle: 'music-lineup', call: 'music-lineup', title: 'music-lineup', lineup: 'music-lineup', recap: 'music-lineup',
    race: 'music-race', final: 'music-final', result: 'music-win' }; // (the cut keeps whatever is playing)
  const MX = 1.5, ME = 0.06;
  const FADE_IN = new Float32Array(33).map((_, i) => Math.sin((i / 32) * Math.PI / 2));
  const FADE_OUT = new Float32Array(33).map((_, i) => Math.cos((i / 32) * Math.PI / 2));
  let cur = null;      // { name, gain (GainNode), next (when its next pass starts) }
  let musicOn = false; // any music file at all: then nothing synthesised stands in for music
  let lastKey = 'idle', lastRound = 0;
  function musicPass(tr, at, first) {
    const b = bank[tr.name], dur = b.duration - 2 * ME;
    const src = ctx.createBufferSource(); src.buffer = b;
    const g = ctx.createGain();
    // equal-power curves: two different bars of the same tune summed on straight ramps dip 3 dB in the middle
    if (first) g.gain.setValueAtTime(1, at); else { g.gain.setValueAtTime(0, at); g.gain.setValueCurveAtTime(FADE_IN, at, MX); g.gain.setValueAtTime(1, at + MX + 0.001); }
    g.gain.setValueCurveAtTime(FADE_OUT, at + dur - MX, MX);
    src.connect(g); g.connect(tr.gain); src.start(at, ME, dur);
    tr.sources.push(src);
    return at + dur - MX;
  }
  function trackFor(key, round) {
    if (key === 'cut') return cur?.name ?? null;
    let name = TRACK[key] ?? null;
    if (name === 'music-race' && round === 1 && bank['music-race-2']) name = 'music-race-2';
    return name && bank[name] ? name : null;
  }
  /** The part of the show changed (or the files have just arrived): bring in the right track. */
  function musicAt(key, round, at) {
    lastKey = key; lastRound = round;
    musicOn = Object.keys(bank).some((k) => k.startsWith('music-'));
    const want = trackFor(key, round);
    if ((cur?.name ?? null) === want) return;
    const t = Math.max(0, at);
    if (cur) {
      const old = cur;
      old.gain.gain.cancelScheduledValues(t); old.gain.gain.setTargetAtTime(0, t, 0.25);
      for (const src of old.sources) { try { src.stop(t + 1.6); } catch { /* already stopped */ } }
    }
    cur = null;
    if (!want) return;
    const g = ctx.createGain(); g.gain.setValueAtTime(0, t); g.gain.setTargetAtTime(1, t, 0.12); g.connect(musicBus);
    cur = { name: want, gain: g, next: t, sources: [], first: true };
  }
  /** Keep the playing track scheduled up to time `until` (the live mix calls this as it goes). */
  function pumpMusic(until) {
    if (!cur) return;
    while (cur.next < until) { cur.next = musicPass(cur, cur.next, cur.first); cur.first = false; }
  }
  /** The files have arrived (live): start whatever this part of the show should be playing. */
  function startMusic(at = 0) { musicAt(lastKey, lastRound, at); return !!cur; }

  // two seconds of noise: the room (band-passed), the air (high-passed), cheers and the hat
  const sr = ctx.sampleRate;
  const noise = ctx.createBuffer(1, sr * 2, sr);
  const d = noise.getChannelData(0);
  let s = 12345;
  for (let i = 0; i < d.length; i++) { s = (Math.imul(s, 1664525) + 1013904223) | 0; d[i] = ((s >>> 8) / 8388608 - 1) * 0.6; }
  const loop = (type, freq, q) => {
    const src = ctx.createBufferSource(); src.buffer = noise; src.loop = true;
    const f = ctx.createBiquadFilter(); f.type = type; f.frequency.value = freq; f.Q.value = q;
    const g = ctx.createGain(); g.gain.value = 0;
    src.connect(f); f.connect(g); g.connect(master); src.start(0);
    return { src, gain: g.gain };
  };
  const room = loop('bandpass', 700, 0.5), air = loop('highpass', 6500, 0.7), cheer = loop('bandpass', 1500, 0.4);

  const inside = (at) => at >= 0 && (ctx.length == null || at < ctx.length / sr);

  // one music-box note: a sine with a bright overtone and a fast pluck envelope
  function note(freq, at, gain = 0.5, bus = boxBus, len = 0.9) {
    if (!inside(at)) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(gain, at + 0.006);
    g.gain.exponentialRampToValueAtTime(0.0001, at + len);
    g.connect(bus);
    const o = ctx.createOscillator(); o.type = 'sine'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 4.02;
    const g2 = ctx.createGain(); g2.gain.value = 0.18;
    o.connect(g); o2.connect(g2); g2.connect(g);
    o.start(at); o2.start(at); o.stop(at + len + 0.05); o2.stop(at + len * 0.4);
  }
  function sweep(at, f0, f1, dur, type = 'sine', gain = 0.3) {
    if (!inside(at)) return;
    const o = ctx.createOscillator(); o.type = type;
    o.frequency.setValueAtTime(f0, at); o.frequency.exponentialRampToValueAtTime(f1, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g); g.connect(fxBus); o.start(at); o.stop(at + dur + 0.05);
  }
  // a short burst of filtered noise: the crack of a hit, the hat, the shimmer on a bell
  function burst(at, dur, gain, hp, bus = fxBus) {
    if (!inside(at)) return;
    const src = ctx.createBufferSource(); src.buffer = noise;
    const f = ctx.createBiquadFilter(); f.type = 'highpass'; f.frequency.value = hp;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at); g.gain.exponentialRampToValueAtTime(gain, at + 0.003); g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f); f.connect(g); g.connect(bus);
    src.start(at, (at * 0.731) % 1.6); src.stop(at + dur + 0.02);
  }
  // a soft held tone: slow in, slow out, overlapping the next one
  function pad(freq, at, dur, gain) {
    if (!inside(at)) return;
    const g = ctx.createGain();
    g.gain.setValueAtTime(0, at); g.gain.linearRampToValueAtTime(gain, at + 0.35); g.gain.setValueAtTime(gain, at + dur - 0.1); g.gain.linearRampToValueAtTime(0, at + dur + 0.5);
    g.connect(boxBus);
    const o = ctx.createOscillator(); o.type = 'triangle'; o.frequency.value = freq;
    const o2 = ctx.createOscillator(); o2.type = 'sine'; o2.frequency.value = freq * 1.5;
    const g2 = ctx.createGain(); g2.gain.value = 0.4;
    o.connect(g); o2.connect(g2); g2.connect(g);
    o.start(at); o2.start(at); o.stop(at + dur + 0.6); o2.stop(at + dur + 0.6);
  }
  // the low end: a sine that drops from about 110 Hz to 50 Hz
  const thump = (at, gain = 0.8, dur = 0.26) => sweep(at, 112, 48, dur, 'sine', gain);
  const bell = (at, idx, delay = 0, gain = 0.5, len = 1.3) => note(SCALE[idx], at + delay, gain, fxBus, len);
  function duckAt(at, depth = 0.5, hold = 0.12) {
    if (!inside(at)) return;
    // (never deeper than about -6 dB, and back up slowly: deep fast ducks measured as pumping holes)
    duck.gain.setTargetAtTime(Math.max(0.5, depth), at, 0.02);
    duck.gain.setTargetAtTime(1, at + hold, 0.3);
  }
  function cheerAt(at, peak, dur) {
    if (!inside(at)) return;
    cheer.gain.setTargetAtTime(peak, at, 0.09);
    cheer.gain.setTargetAtTime(0, at + dur, 0.6);
  }

  /** The bed changes phase at `at`. */
  function phaseAt(key, at, round = 0) {
    const cfg = PHASES[key];
    const t = Math.max(0, at);
    musicAt(key, round, t);
    boxBus.gain.setTargetAtTime(cfg.vol * MIX.box, t, 0.25);
    const m = (MUSIC[key] ?? 0.5) * MUSIC_GAIN;
    musicBus.gain.cancelScheduledValues(t);
    musicBus.gain.setTargetAtTime(m, t, 0.3);
    if (cfg.build) musicBus.gain.setTargetAtTime(m * MUSIC_BUILD, t + cfg.build * 0.45, cfg.build * 0.3); // a race lifts toward the line
    // (the synthesised room tone and air belong to the music box: with the recorded track there is none)
    room.gain.setTargetAtTime(musicOn || !MUSIC_BOX ? 0 : cfg.room, t, 0.6);
    air.gain.setTargetAtTime(musicOn || !MUSIC_BOX ? 0 : cfg.air, t, 0.6);
  }
  /** One step of the music box. `since` = seconds since this phase began (a race builds on it). */
  function step(key, n, at, since) {
    if (musicOn || !MUSIC_BOX) return; // the recorded track is playing, or there is to be no music
    const cfg = PHASES[key];
    const bar = cfg.bars[Math.floor(n / 8) % cfg.bars.length];
    const k = bar[n % 8], down = n % 8 === 0;
    const u = cfg.build ? Math.max(0, Math.min(1, since / cfg.build)) : 0; // 0 at the start of a race, 1 coming to the line
    const lift = cfg.build ? 0.7 + (cfg.top ?? 0.6) * u : 1;
    if (k >= 0) {
      note(SCALE[k], at, (down ? 0.55 : 0.4) * lift);
      if (u > 0.45) note(SCALE[k] * 2, at, 0.22 * (u - 0.45) / 0.55 * lift, boxBus, 0.5); // the octave comes in over the second half
    }
    // a low note on the bar keeps the pulse; in the slow phases a soft held tone under the bar
    // fills the rests, so there is never a hole between notes
    if (down) {
      const root = SCALE[bar.find((x) => x >= 0) % 5] / 2;
      note(root, at, 0.3 * lift, boxBus, 1.4);
      if (cfg.pad) pad(root * 2, at, 8 / cfg.rate, cfg.pad); // (an octave up from the pulse: a hum, not a drone)
    }
    if (cfg.build) {
      if (n % 2 === 1) burst(at, 0.045, 0.16 + 0.34 * u, 8000, duck);     // the hat, off the beat
      if (n % 8 === 0 || (u > 0.6 && n % 8 === 4)) sweep(at, 96, 52, 0.16, 'sine', 0.22 + 0.3 * u); // a soft kick: twice a bar near the line
    }
  }

  let lastKnock = -9, lastFall = -9, lastWin = -99;
  /** A one-shot at time `at`. */
  function shot(fn, args, at) {
    if (!STAND_INS) {
      // recordings only: the file if there is one, otherwise nothing
      if (fn === 'knock') { if (at - lastKnock >= 0.18) { lastKnock = at; playAny('hit', at, 0.85); } return; }
      if (fn === 'fall') { if (at - lastFall >= 0.4) { lastFall = at; play('fall', at, 0.7); } return; }
      if (fn === 'win') { if (at - lastWin < 8) return; lastWin = at; const w = play('win', at, 1.0), ap = play('applause', at + 0.3, 0.9); if (w || ap) easeMusic(at, 3.5); return; }
      const file = { pip: 'pip', go: 'go', tick: 'tick', through: 'through', lastPlace: 'last-place', lock: 'lock' }[fn];
      const gain = { pip: 0.7, go: 0.9, tick: 0.5, through: 0.6, lastPlace: 0.9, lock: 1.0 }[fn] ?? 0.7;
      if (file && play(file, at, gain) && (fn === 'lastPlace' || fn === 'lock')) easeMusic(at, 1.2);
      return;
    }
    switch (fn) {
      case 'pip': { const f = args[0] === 1 ? 660 : 520; if (!play('pip', at, 0.7)) { sweep(at, f, f, 0.16, 'triangle', 0.45); duckAt(at, 0.6, 0.1); } break; }
      case 'go': if (!play('go', at, 0.9)) { sweep(at, 1040, 1040, 0.5, 'triangle', 0.5); bell(at, 8, 0, 0.6); bell(at, 10, 0.08, 0.5); thump(at, 0.7); burst(at, 0.25, 0.12, 5000); duckAt(at, 0.5, 0.3); } break;
      case 'tick': if (!play('tick', at, 0.5)) sweep(at, 1800, 1500, 0.035, 'square', 0.1); break;
      case 'through': { const few = (args[0] ?? 3) <= 2; if (!play('through', at, 0.6)) { bell(at, few ? 8 : 5, 0, 0.6); bell(at, few ? 10 : 8, 0.09, 0.55); burst(at, 0.18, 0.16, 8000); duckAt(at, 0.5, 0.25); } break; }
      case 'lastPlace': if (play('last-place', at, 0.9)) easeMusic(at, 1.2); else { bell(at, 5, 0, 0.6); bell(at, 8, 0.1, 0.6); bell(at, 10, 0.2, 0.65); bell(at, 10, 0.42, 0.5); thump(at, 0.7); burst(at, 0.3, 0.1, 6000); cheerAt(at, 0.09, 1.2); duckAt(at, 0.3, 0.9); } break;
      case 'lock': if (play('lock', at, 1.0)) easeMusic(at, 1.2); else { thump(at, 1.0, 0.34); note(SCALE[0] / 2, at, 0.85, fxBus, 2.0); bell(at, 5, 0.02, 0.6, 1.6); bell(at, 8, 0.14, 0.5, 1.6); burst(at, 0.06, 0.3, 2500); duckAt(at, 0.3, 0.7); } break;
      case 'knock': if (at - lastKnock >= 0.18) { lastKnock = at; if (!playAny('hit', at, 0.85)) { thump(at, 1.0); sweep(at, 190, 70, 0.16, 'sine', 0.5); burst(at, 0.06, 0.5, 2500); duckAt(at, 0.25, 0.4); } } break;
      case 'fall': if (at - lastFall >= 0.4) { lastFall = at; if (!play('fall', at, 0.7)) { sweep(at, 900, 180, 0.55, 'sine', 0.3); duckAt(at, 0.6, 0.4); } } break;
      case 'win':
        if (bank.win || bank.applause) {
          // (the stage calls this at the line and again as the winner's card comes up: it sounds once)
          if (at - lastWin < 8) break;
          lastWin = at;
          play('win', at, 1.0); play('applause', at + 0.3, 0.9); easeMusic(at, 3.5);
          break;
        }
        // (synthesised: the peal rings twice over a held chord, and the cheer is as big as it gets)
        for (const t0 of [0, 1.5]) {
          [0, 3, 5, 8, 10].forEach((k, i) => { bell(at + t0, k, i * 0.11, 1.0, 1.8); note(SCALE[k] * 2, at + t0 + i * 0.11, 0.5, fxBus, 1.0); });
          bell(at + t0, 10, 0.75, 1.0, 2.4); bell(at + t0, 8, 0.75, 0.9, 2.4); bell(at + t0, 5, 0.75, 0.8, 2.4);
          thump(at + t0, 1.0, 0.36); thump(at + t0 + 0.75, 1.0, 0.4); burst(at + t0, 0.5, 0.36, 7000); burst(at + t0 + 0.75, 0.9, 0.4, 7000);
        }
        for (const k of [0, 3, 5]) { const g0 = 0.5; note(SCALE[k] / 2, at, g0, fxBus, 3.6); note(SCALE[k], at + 0.75, g0, fxBus, 3.2); }
        cheerAt(at, 0.6, 3.4); duckAt(at, 0.15, 3.2);
        break;
      default:
    }
  }
  function stop() { for (const l of [room, air, cheer]) { try { l.src.stop(); } catch { /* not started */ } } }
  return { master, clean, phaseAt, step, shot, stop, startMusic, pumpMusic };
}

export function createSound({ volume = MIX.volume } = {}) {
  let ctx = null, kit = null;
  let phase = 'idle', cfg = PHASES.idle, step = 0, nextAt = 0, phaseStart = 0, timer = 0, vol = volume, dead = false, curRound = 0;

  function boot() {
    if (ctx || dead) return;
    const AC = globalThis.AudioContext || globalThis.webkitAudioContext;
    if (!AC) return;
    try { ctx = new AC(); } catch { ctx = null; return; }
    const bank = {};
    kit = createKit(ctx, vol, bank);
    nextAt = ctx.currentTime + 0.05; phaseStart = ctx.currentTime;
    timer = setInterval(schedule, 60);
    kit.phaseAt(phase, ctx.currentTime, curRound);
    // the recordings arrive a moment later; until then (and for any that are missing) the synthesised sounds play
    const c0 = ctx, k0 = kit;
    loadBank(c0).then((b) => { if (dead || ctx !== c0) return; Object.assign(bank, b); k0.startMusic(c0.currentTime + 0.05); }).catch(() => {});
  }
  const onGesture = () => { boot(); if (ctx && ctx.state === 'suspended') ctx.resume(); };
  if (typeof document !== 'undefined') {
    document.addEventListener('pointerdown', onGesture, { passive: true });
    document.addEventListener('keydown', onGesture, { passive: true });
  }

  function schedule() {
    if (!ctx || ctx.state !== 'running') return;
    const horizon = ctx.currentTime + 0.25;
    kit.pumpMusic(ctx.currentTime + 2);
    if (nextAt < ctx.currentTime - 0.5) nextAt = ctx.currentTime + 0.02; // after a suspended tab
    while (nextAt < horizon) {
      kit.step(phase, step, nextAt, nextAt - phaseStart);
      step++;
      nextAt += 1 / cfg.rate;
    }
  }

  const api = {
    /** `round` 2 gives the final its own faster figure. */
    setPhase(p, { round = 0 } = {}) {
      const key = p === 'race' && round === 2 ? 'final' : p;
      if (key === phase || !PHASES[key]) return;
      phase = key; cfg = PHASES[key]; step = 0;
      curRound = round;
      if (ctx) { phaseStart = ctx.currentTime; kit.phaseAt(key, ctx.currentTime, round); }
    },
    setVolume(v) { vol = Math.min(1, Math.max(0, v)); if (kit) { kit.master.gain.setTargetAtTime(vol, ctx.currentTime, 0.05); kit.clean.gain.setTargetAtTime(vol, ctx.currentTime, 0.05); } },
    /** The page has had its click or key press: make the context (or wake it) and play. */
    unlock() { onGesture(); },
    get running() { return !!ctx && ctx.state === 'running'; },
    destroy() {
      dead = true;
      if (typeof document !== 'undefined') { document.removeEventListener('pointerdown', onGesture); document.removeEventListener('keydown', onGesture); }
      if (timer) clearInterval(timer);
      kit?.stop();
      try { ctx?.close(); } catch { /* already closed */ }
      ctx = null;
    },
  };
  for (const fn of METHODS) api[fn] = (...args) => { if (ctx) kit.shot(fn, args, ctx.currentTime); };
  return api;
}

// ---------------------------------------------------------------------------------------------
// Offline: the same mix rendered to samples, so the sound of a whole show can be written to a
// file and measured (tools/sound.mjs). createSoundLog() stands in for createSound() on a virtual
// clock and records every call with its time; renderSoundLog() plays that record through an
// OfflineAudioContext with the same kit as the live mix.

export function createSoundLog(nowSeconds) {
  const log = [];
  const api = { log, setVolume() {}, destroy() {}, running: false, setPhase(p, o = {}) { log.push({ t: nowSeconds(), fn: 'setPhase', args: [p, { round: o.round ?? 0 }] }); } };
  for (const fn of METHODS) api[fn] = (...args) => { log.push({ t: nowSeconds(), fn, args }); };
  return api;
}

/** Render a sound log to stereo samples. Returns { sampleRate, samples (left), right }. */
export async function renderSoundLog(log, { sampleRate = 44100, volume = MIX.volume, from = null, to = null } = {}) {
  const t0 = from ?? (log.length ? log[0].t : 0);
  const t1 = to ?? (log.length ? log[log.length - 1].t + 3 : 1);
  const OAC = globalThis.OfflineAudioContext || globalThis.webkitOfflineAudioContext;
  const ctx = new OAC(2, Math.ceil((t1 - t0) * sampleRate), sampleRate); // stereo, as the page plays it
  const bank = await loadBank(ctx);
  const kit = createKit(ctx, volume, bank);

  // the music box, phase by phase
  const marks = log.filter((e) => e.fn === 'setPhase').map((e) => ({ t: e.t - t0, round: e.args[1]?.round ?? 0, key: e.args[0] === 'race' && e.args[1]?.round === 2 ? 'final' : e.args[0] })).filter((m) => PHASES[m.key]);
  if (!marks.length || marks[0].t > 0) marks.unshift({ t: 0, key: 'idle' });
  for (let i = 0; i < marks.length; i++) {
    if (i && marks[i].key === marks[i - 1].key) continue; // (the live sound ignores a repeat of the same phase)
    let b = t1 - t0;
    for (let j = i + 1; j < marks.length; j++) if (marks[j].key !== marks[i].key) { b = marks[j].t; break; }
    const cfg = PHASES[marks[i].key], a = Math.max(0, marks[i].t);
    kit.pumpMusic(a);                       // the track of the part before, up to this change
    kit.phaseAt(marks[i].key, a, marks[i].round);
    for (let n = 0, at = a + 0.05; at < b; n++, at += 1 / cfg.rate) kit.step(marks[i].key, n, at, at - a);
  }
  kit.pumpMusic(t1 - t0);
  // the one-shots
  for (const e of log) if (e.fn !== 'setPhase') kit.shot(e.fn, e.args, e.t - t0);
  const buf = await ctx.startRendering();
  return { sampleRate, samples: buf.getChannelData(0), right: buf.getChannelData(1) };
}

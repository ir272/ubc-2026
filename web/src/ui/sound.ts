// Code-made UI sounds (Web Audio, no files). Five cues, three takes of each to audition on /ui.
// On by default; uiSound.enable(false) mutes it and the choice is remembered. Browsers only let sound start
// after the first click on the page. The components never play sound themselves; the page decides when
// (see README.md), and each Clayzo moment has a cue timed to it (MOMENT_CUE, uiSound.playFor).
// NOT YET APPROVED BY EAR. Ian picks the takes on the /ui sound board before any of this ships.

export type UiSound = 'pick' | 'tick' | 'place' | 'confirm' | 'payout' | 'send' | 'course';

export const CUES: Array<{ id: UiSound; when: string }> = [
  { id: 'pick', when: 'Picking a side' },
  { id: 'tick', when: 'Last ten seconds' },
  { id: 'place', when: 'Sending the bet' },
  { id: 'confirm', when: 'Bet placed' },
  { id: 'payout', when: 'Payout arrives' },
  { id: 'send', when: 'Chat sent' },
  { id: 'course', when: 'Watch and bet' },
];

/** The cue that belongs to each Clayzo moment, and how long after the moment starts it should sound (seconds), so it lands on the beat. */
export const MOMENT_CUE: Record<string, [cue: UiSound, delay: number]> = {
  'bet-placed': ['confirm', 0.36],
  payout: ['payout', 0.58],
  'chat-sent': ['send', 0],
  'watch-and-bet': ['course', 0.18],
  'watch-and-bet-press': ['course', 0],
};

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
const ON_KEY = 'ink.sound.on';
let on = true;
try {
  on = localStorage.getItem(ON_KEY) !== '0';
} catch { /* storage blocked: stay on */ }
let volume = 0.5;

const KEY = 'ink.sound.takes';
// Defaults are the takes Ian had selected on the sound board on 2026-11-20 (wood knock, wood tick, swish, two bells,
// chime run); he had not picked for the two newer cues, so those start on their first take.
const choice: Record<UiSound, number> = { pick: 1, tick: 2, place: 2, confirm: 0, payout: 2, send: 0, course: 0 };
try {
  Object.assign(choice, JSON.parse(localStorage.getItem(KEY) ?? '{}'));
} catch { /* first visit or storage blocked */ }

function audio(): AudioContext | null {
  if (!on) return null;
  if (!ctx) {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = volume;
    const limit = ctx.createDynamicsCompressor();
    limit.threshold.value = -4;
    limit.ratio.value = 8;
    master.connect(limit).connect(ctx.destination);
  }
  return ctx;
}

interface NoiseOpts { dur: number; f0: number; f1?: number; q?: number; gain: number; type?: BiquadFilterType; attack?: number }
/** Filtered noise: a pen touching or crossing paper, a swish, the click of a knock. */
function noise(c: AudioContext, at: number, o: NoiseOpts) {
  const n = Math.max(1, Math.floor(c.sampleRate * o.dur));
  const buf = c.createBuffer(1, n, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < n; i++) d[i] = Math.random() * 2 - 1;
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = o.type ?? 'bandpass';
  f.Q.value = o.q ?? 1.2;
  f.frequency.setValueAtTime(o.f0, at);
  if (o.f1) f.frequency.exponentialRampToValueAtTime(o.f1, at + o.dur);
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.gain, at + (o.attack ?? Math.min(0.006, o.dur * 0.3)));
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
  src.connect(f).connect(g).connect(master!);
  src.start(at);
  src.stop(at + o.dur + 0.02);
}

interface ToneOpts { hz: number; to?: number; dur: number; gain: number; type?: OscillatorType; partials?: Array<[ratio: number, gain: number]>; attack?: number }
/** A struck or popped tone: a pitch (optionally falling), a fast attack, an exponential decay, optional upper partials. */
function tone(c: AudioContext, at: number, o: ToneOpts) {
  const g = c.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(o.gain, at + (o.attack ?? 0.004));
  g.gain.exponentialRampToValueAtTime(0.0001, at + o.dur);
  g.connect(master!);
  for (const [ratio, pg] of [[1, 1] as [number, number], ...(o.partials ?? [])]) {
    const osc = c.createOscillator();
    osc.type = o.type ?? 'sine';
    osc.frequency.setValueAtTime(o.hz * ratio, at);
    if (o.to) osc.frequency.exponentialRampToValueAtTime(o.to * ratio, at + o.dur * 0.7);
    const pgn = c.createGain();
    pgn.gain.value = pg;
    osc.connect(pgn).connect(g);
    osc.start(at);
    osc.stop(at + o.dur + 0.02);
  }
}

const BAR: Array<[number, number]> = [[2.76, 0.18], [5.4, 0.06]]; // a struck metal bar (glockenspiel)
const WOOD: Array<[number, number]> = [[4, 0.22]]; // a struck wooden bar (marimba)

type Take = { name: string; play: (c: AudioContext, t: number) => void };

export const TAKES: Record<UiSound, Take[]> = {
  pick: [
    { name: 'Pen tap', play: (c, t) => noise(c, t, { dur: 0.03, f0: 2400, f1: 1500, gain: 0.9 }) },
    { name: 'Wood knock', play: (c, t) => { tone(c, t, { hz: 240, to: 170, dur: 0.07, gain: 0.8, partials: WOOD }); noise(c, t, { dur: 0.012, f0: 2000, gain: 0.3 }); } },
    { name: 'Soft pop', play: (c, t) => tone(c, t, { hz: 560, to: 330, dur: 0.08, gain: 0.7 }) },
  ],
  tick: [
    { name: 'Paper tick', play: (c, t) => noise(c, t, { dur: 0.016, f0: 3600, f1: 3000, gain: 0.5 }) },
    { name: 'Clock', play: (c, t) => { tone(c, t, { hz: 1800, dur: 0.03, gain: 0.3 }); noise(c, t, { dur: 0.01, f0: 4500, gain: 0.25 }); } },
    { name: 'Wood tick', play: (c, t) => tone(c, t, { hz: 920, to: 760, dur: 0.04, gain: 0.45, partials: WOOD }) },
  ],
  place: [
    { name: 'Pen stroke', play: (c, t) => noise(c, t, { dur: 0.16, f0: 1700, f1: 3000, gain: 0.7, attack: 0.02 }) },
    { name: 'Stamp', play: (c, t) => { tone(c, t, { hz: 130, to: 70, dur: 0.14, gain: 0.9 }); noise(c, t, { dur: 0.03, f0: 1200, gain: 0.4 }); } },
    { name: 'Swish', play: (c, t) => noise(c, t, { dur: 0.2, f0: 2600, f1: 6500, q: 0.7, gain: 0.45, attack: 0.07 }) },
  ],
  confirm: [
    { name: 'Two bells', play: (c, t) => { tone(c, t, { hz: 880, dur: 0.24, gain: 0.5, partials: BAR }); tone(c, t + 0.09, { hz: 1318.5, dur: 0.34, gain: 0.45, partials: BAR }); } },
    { name: 'Marimba', play: (c, t) => { tone(c, t, { hz: 523.25, dur: 0.18, gain: 0.6, partials: WOOD }); tone(c, t + 0.1, { hz: 783.99, dur: 0.26, gain: 0.55, partials: WOOD }); } },
    { name: 'Tick and bell', play: (c, t) => { noise(c, t, { dur: 0.07, f0: 2200, f1: 3400, gain: 0.5, attack: 0.015 }); tone(c, t + 0.07, { hz: 1174.66, dur: 0.36, gain: 0.45, partials: BAR }); } },
  ],
  payout: [
    { name: 'Three bells', play: (c, t) => [783.99, 987.77, 1318.5].forEach((hz, i) => tone(c, t + i * 0.08, { hz, dur: i === 2 ? 0.46 : 0.22, gain: 0.48, partials: BAR })) },
    { name: 'Coins', play: (c, t) => [2637, 3136, 2794, 3520].forEach((hz, i) => tone(c, t + i * 0.055, { hz, dur: 0.12, gain: 0.3, partials: [[1.5, 0.3], [2.4, 0.15]] })) },
    { name: 'Chime run', play: (c, t) => [659.25, 783.99, 987.77, 1174.66, 1567.98].forEach((hz, i) => tone(c, t + i * 0.06, { hz, dur: i === 4 ? 0.5 : 0.2, gain: 0.42, partials: BAR })) },
  ],
  send: [
    { name: 'Swish and ping', play: (c, t) => { noise(c, t, { dur: 0.3, f0: 1800, f1: 5200, q: 0.8, gain: 0.5, attack: 0.06 }); tone(c, t + 0.34, { hz: 1760, dur: 0.18, gain: 0.3, partials: BAR }); } },
    { name: 'Pen flick', play: (c, t) => { noise(c, t, { dur: 0.14, f0: 2200, f1: 3800, gain: 0.7, attack: 0.02 }); noise(c, t + 0.34, { dur: 0.025, f0: 3000, gain: 0.5 }); } },
    { name: 'Rising pop', play: (c, t) => { tone(c, t, { hz: 420, to: 760, dur: 0.13, gain: 0.6 }); tone(c, t + 0.34, { hz: 1318.5, dur: 0.16, gain: 0.28, partials: BAR }); } },
  ],
  course: [
    // the rose swings and slows: ticks further and further apart, then it knocks home
    { name: 'Compass ticks', play: (c, t) => { [0, 0.1, 0.24, 0.44].forEach((d) => tone(c, t + d, { hz: 920, to: 760, dur: 0.04, gain: 0.4, partials: WOOD })); tone(c, t + 0.76, { hz: 240, to: 170, dur: 0.09, gain: 0.8, partials: WOOD }); } },
    { name: 'Brass ping', play: (c, t) => { noise(c, t, { dur: 0.34, f0: 1400, f1: 3200, q: 0.8, gain: 0.35, attack: 0.1 }); tone(c, t + 0.38, { hz: 659.25, dur: 0.5, gain: 0.45, partials: BAR }); tone(c, t + 0.46, { hz: 987.77, dur: 0.5, gain: 0.35, partials: BAR }); } },
    { name: 'Ratchet', play: (c, t) => { [0, 0.05, 0.11, 0.18, 0.27, 0.38].forEach((d) => { tone(c, t + d, { hz: 1800, dur: 0.025, gain: 0.25 }); noise(c, t + d, { dur: 0.01, f0: 4500, gain: 0.2 }); }); tone(c, t + 0.6, { hz: 130, to: 80, dur: 0.14, gain: 0.8 }); } },
  ],
};

export const uiSound = {
  /** On by default. The choice is remembered in this browser. */
  enable(v: boolean) {
    on = v;
    try {
      localStorage.setItem(ON_KEY, v ? '1' : '0');
    } catch { /* storage blocked */ }
    if (!v && ctx) void ctx.suspend();
  },
  enabled: () => on,
  /** 0..1 */
  setVolume(v: number) {
    volume = Math.min(1, Math.max(0, v));
    if (master) master.gain.value = volume;
  },
  volume: () => volume,
  /** Which take a cue uses (0, 1 or 2). Remembered in this browser. */
  choose(name: UiSound, take: number) {
    choice[name] = take;
    try {
      localStorage.setItem(KEY, JSON.stringify(choice));
    } catch { /* storage blocked */ }
  },
  chosen: (name: UiSound) => choice[name] ?? 0,
  /** Plays the cue's chosen take (or a given one), `delay` seconds from now. */
  play(name: UiSound, take?: number, delay = 0) {
    const c = audio();
    if (!c) return;
    const takes = TAKES[name];
    const fire = () => (takes[take ?? choice[name]] ?? takes[0]!).play(c, c.currentTime + 0.005 + delay);
    if (c.state === 'running') return fire();
    // Not started yet (no click on the page so far). Start it, but never let a stale cue sound late.
    const asked = performance.now();
    void c.resume().then(() => { if (performance.now() - asked < 250) fire(); });
  },
  /** Plays the cue that belongs to a Clayzo moment, timed to its beat. Call it from the moment's `onStart`. */
  playFor(moment: string) {
    const m = MOMENT_CUE[moment];
    if (m) this.play(m[0], undefined, m[1]);
  },
};

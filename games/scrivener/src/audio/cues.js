// Sound design table for The Scrivener. Owner: sound. PURE DATA (imported by audio.js in the
// browser and by tools/audio_render.mjs in Node, so the offline render uses the same numbers).
//
// Every sound is a real recording from assets/audio (see LICENSES.md). Nothing is synthesized:
// cues only layer, pitch (playback rate), filter, delay, envelope, pan and reverberate recordings.
//
// Cue keys are tried most-specific first (see cueKeys): `${type}:${q}:heavy`, `${type}:${q}`,
// `${type}` where q is the event's attackId, target or kind.
//
// Layer fields:
//   s    sound id from manifest.json (or an array: variants cycle per cue fire, deterministic)
//   g    gain in dB
//   r    playback rate (pitch+speed; < 1 = lower, heavier). Array: cycles with the variant index
//   re   playback rate at the end of the layer: a tape-style pitch glide from r (linear in time),
//        so a held throat sags or swells instead of sitting on fixed harmonics
//   d    delay in ms after the event
//   off  start offset into the file, seconds        len  max play length, seconds
//   fi   fade-in ms (default 4)                     fo   fade-out ms at len (default 60)
//   lp   low-pass Hz        hp  high-pass Hz        v    reverb send (0..1)
//   dk   exponential decay time constant ms after the fade-in (replaces fo): a struck body
//        rings down at once, so a sub never outlasts the transient it sits under
//   wt   weight from the event: [field, lo, hi, dB] adds 0..dB as e[field] goes lo..hi
//        (e.g. ['damage', 8, 50, 10]: a 50-point blow carries 10 dB more low end than a scratch)
//   wr   playback-rate change at full weight (negative: a heavier blow is pitched lower)
//   te   (boss.tell cues) fire te ms relative to the END of the tell, i.e. the strike moment
//   hit  (boss.active cues) fire at that melee hit's time (+ d), read from the attack table
//        te/hit layers run on sim time: they are held through the thinking freeze and are
//        cancelled if the attack is interrupted (stagger, phase change, death, new attempt).
// Cue fields: L (layers), cd (cooldown ms), duck ([dB, ms] dips the music bed),
//   pri (0 low .. 3 critical: low-priority cues are dropped first when many voices are live)

export const MIX = {
  masterGain: 0.72,
  // master bus glue, then a brickwall-ish catch (DynamicsCompressorNodes in the browser; the
  // offline render applies the same curves, including WebAudio's automatic makeup gain)
  // gentle glue only (ratio 2 above -12 dB): impacts must still stand 8-10 dB above the bed
  comp: { threshold: -12, knee: 8, ratio: 2, attack: 0.006, release: 0.25 },
  // round 10: -3 (was -1): with WebAudio's automatic makeup gain a -1 threshold let peaks out at
  // -0.35 dBFS; -3.5 holds true peaks under -1 dBTP
  limit: { threshold: -3.5, knee: 0, ratio: 20, attack: 0.001, release: 0.06 },
  sfxDb: -2.5,   // round 10: effects down 2.5 dB, the score up ~10 dB: the phases now sit within ~3 LU
  // stone-hall reverb: convolution with a REAL recorded impulse response of a stone church
  // (ir_church_stone_hall: direct sound removed, ~3 s tail), scaled to unit energy (irScale).
  reverb: { ir: 'ir_church_stone_hall', preDelayMs: 18, hpHz: 220, lpHz: 7000, wetDb: -4 },
  // music bed (streamed media elements) + ambience + choir under it. Round 10: the score was
  // ~17 dB under the effects (about -37 LUFS) and inaudible outside the fight; it now sits
  // 6-10 dB under them, and the fight is scored in acts (see MUSIC below).
  //   in      the show phases a layer plays under (audio.setScene); no `in` = always
  //   entry   seconds into the file it restarts from each time its phase opens (it is heard
  //           from a chosen section, not from wherever the loop happened to be)
  //   page    the fight's low drone between tries (the walk-on, the notes)
  //   act     a fight track: one act sounds per try, tries 1-2 / 3-4 / 5-6 (MUSIC.actOf);
  //           entries[] cycles per try, so a returning act starts from a new section
  //   rise    [dB at level 0, dB at level 1]: follows the fight's level (the choir swells)
  bed: [
    { id: 'music_drone_halls_of_the_undead', db: -2, off: 22, entry: 22, in: ['call', 'choosing'] }, // the library before the bell
    // the countdown under the predictions: a tension underscore (plucked strings, no pulse yet)
    { id: 'music_boss_final_count', db: -1, off: 150, entry: 150, in: ['tape'] },
    { id: 'music_drone_land_of_the_dead', db: -12, off: 30, in: ['fight'], page: true },
    // the acts, chosen by ear (an audio model described each section; nobody on the team has
    // listened): heavy plodding brass -> mechanical 132 bpm ostinato -> war drums and frantic
    // 155 bpm spiccato strings for the last tries
    { id: 'music_boss_clash_defiant', db: -2, off: 120, in: ['fight'], act: 0, entries: [120, 0] },
    { id: 'music_boss_corruption', db: -3, off: 180, in: ['fight'], act: 1, entries: [180, 60] },
    { id: 'music_boss_final_count', db: 0, off: 0, in: ['fight'], act: 2, entries: [0, 112] },
    { id: 'drone_dark_choir_loop', db: -14, off: 0, in: ['fight'], rise: [-14, 0] },                 // a sustained pad: swells with the level
    { id: 'music_boss_truth_of_the_legend', db: -4, off: 20, entry: 20, in: ['verdict'] },
    { id: 'amb_howling_wind_loop', db: -19, off: 0 },   // room tone: noise, not pitch
  ],
  // the score sits behind the fight: rolled off above 4.5 kHz so its string/pad overtones never
  // whine over the tails; the top of the spectrum belongs to blades, stone and the hall
  bedLpHz: 4500,
  // during the thinking freeze the world is held: the bed is muffled and pulled back (lighter than
  // before round 10: a quarter of every try is a held decision, and the build must survive it)
  freeze: { lpHz: 1400, db: -4, attack: 0.2, release: 0.45 },
  maxVoices: 40,
};

import { ATTACKS } from '../sim/attacks.js';
import { BOSS } from '../sim/boss.js';

// the sub layer: a recorded bass-drum boom, started on its first peak so it lands with the hit
// slam_debris_crash: its recorded tail (after ~1.6 s) carries thin tonal whines, so every use is
// cut (len <= 1.6 s) before it.
// It rings DOWN from the hit (dk): the weight is felt on the frame, then gets out of the way.
const SUB = (g = -8, d = 0, r = 1, dk = 130) => ({ s: 'sting_death_bass_drum_boom', g, d, r, off: 0.07, len: 0.7, dk, lp: 150, v: 0 });

// Pre-strike hush: every tell pulls the bed down for the length of the pose (+300 ms) so the
// windup reads alone (round 10: -10 dB, was -14: the score now builds stroke by stroke and a
// full hush on every tell made it stutter).
const hush = (id, db = -10) => [db, Math.round(ATTACKS[id].tell.ms + 300)];

// A sub that weighs what it carries: lo..hi damage adds 0..`add` dB (the base `g` is a scratch).
const SUBW = (g, add, d = 0, r = 1, dk = 140, field = 'damage', lo = 8, hi = 50) => ({ ...SUB(g, d, r, dk), wt: [field, lo, hi, add] });

// ---------------------------------------------------------------- the fight's music
// One scalar, the level (0..1), and the act (which track) drive the fight bed. The stage calls
// musicCall() on every bus event and hands what it returns to audio.setIntensity(); the offline
// renderer (tools/audio_match.mjs) does exactly the same, so both hear the same score.
//   - within a try the level climbs with each stroke of the name (1..6): the act's track comes up
//     from lowDb to full and its low-pass opens from lpLo to lpHi; the choir swells under it
//   - across the match each try starts higher, and the act changes: tries 1-2, 3-4, 5-6
//   - between tries (the walk-on, the notes) the acts fall away to a low drone (the page)
//   - the kill cuts the score dead on the blow; a fall (death, or the name written) drops it
//     at once and the page drone returns after a breath
export const MUSIC = {
  lowDb: -12, lpLo: 2400, lpHi: 4500,
  base: 0.08, perStroke: 0.52, perTry: 0.4, phase2: 0.12,
  tauIn: 1.2, tauRise: 1.8, tauOut: 0.9, tauCut: 0.035, tauFall: 0.2, pageDelay: 2.6,
};
const clamp01 = (v) => Math.max(0, Math.min(1, v));
export const actOf = (index, total) => Math.max(0, Math.min(2, Math.floor((total > 1 ? clamp01((index - 1) / (total - 1)) : 0) * 3 - 1e-9)));

export function musicState(total = 6, strokes = 6) { return { total, strokes, index: 0, k: 0, phase2: false, live: false }; }

function level(st, extra = {}) {
  const m = st.total > 1 ? clamp01((st.index - 1) / (st.total - 1)) : 0;
  const s = clamp01(st.k / st.strokes);
  const lv = clamp01(MUSIC.base + MUSIC.perStroke * s + MUSIC.perTry * m + (st.phase2 ? MUSIC.phase2 : 0));
  return { level: lv, act: actOf(st.index, st.total), tryNo: st.index, page: false, ...extra };
}

// -> null, or the arguments for audio.setIntensity(level, opts): { level, act, tryNo, page, start, cut, fall, hold }
// (hold: the page drone waits a breath, so the fight's phase strike lands on a clear floor)
export function musicCall(e, st) {
  switch (e.type) {
    case 'show.phase': if (e.kind !== 'fight') return null; st.live = false; return { level: 0, page: true, hold: true };
    case 'show.ready': st.live = false; return { level: 0, page: true };
    case 'match.attempt': st.index = e.attempt || st.index + 1; st.k = 0; st.phase2 = false; st.live = true; return level(st, { start: true });
    case 'name.stroke': if (!st.live) return null; st.k = e.k || st.k + 1; return level(st);
    case 'boss.phase': if (!st.live) return null; st.phase2 = true; return level(st);
    case 'boss.death': if (!st.live) return null; st.live = false; return { level: 0, cut: true };
    case 'agent.death': case 'show.written': if (!st.live) return null; st.live = false; return { level: 0, page: true, fall: true };
    default: return null;
  }
}

// What one bed layer does on a music call: { target (linear gain), tau (s), delay (s), seek (s|null) },
// or null when the layer does not follow the fight. `prev` is the call before this one.
export function bedResponse(b, c, prev) {
  if (b.act != null) {
    const on = !c.page && !c.cut && c.act === b.act;
    const entering = on && (c.start || prev.page || prev.cut || prev.act !== b.act);
    const tau = c.cut ? MUSIC.tauCut : c.fall ? MUSIC.tauFall : entering ? MUSIC.tauIn : on ? MUSIC.tauRise : MUSIC.tauOut;
    const seek = entering && b.entries ? b.entries[(Math.max(1, c.tryNo || 1) - 1) % b.entries.length] : null;
    return { target: on ? dbToGain(MUSIC.lowDb * (1 - c.level)) : 0, tau, delay: 0, seek };
  }
  if (b.page) {
    const on = !!c.page;
    return { target: on ? 1 : 0, tau: c.cut ? MUSIC.tauCut : on ? MUSIC.tauIn : MUSIC.tauOut, delay: on && (c.fall || c.hold) ? MUSIC.pageDelay : 0, seek: null };
  }
  if (b.rise) {
    const on = !c.page && !c.cut;
    return { target: on ? dbToGain(b.rise[0] + (b.rise[1] - b.rise[0]) * c.level) : 0, tau: c.cut ? MUSIC.tauCut : c.fall ? MUSIC.tauFall : MUSIC.tauRise, delay: 0, seek: null };
  }
  return null;
}
// the acts' shared low-pass for a level
export const actLpHz = (c) => MUSIC.lpLo * Math.pow(MUSIC.lpHi / MUSIC.lpLo, c.page || c.cut ? 0 : c.level);

export const CUES = {
  // ---------- the challenge: the Scrivener rises and roars at the start of every attempt ----------
  // A short pulsing rise, then the iron-bound ledger slams down and the main bellow tears out on
  // top of it (the loudest moment, ~0.8 s in); a second, lower growl phrase answers as the hall
  // takes the first. Every voice is a recorded creature/animal throat with its own movement
  // (formant sweeps, pulsing): no sustained shrieks or wails that would hang as tonal lines.
  'match.attempt': { pri: 3, duck: [-20, 4300], L: [
    { s: 'footstep_stone_boot_1', r: 0.5, g: -4, v: 0.2 },                             // two heavy steps forward
    { s: 'footstep_stone_boot_2', d: 270, r: 0.48, g: -4, v: 0.2 },
    { s: 'monster_death_throes', off: 0.1, len: 0.55, r: 0.75, g: -10, hp: 350, fi: 350, fo: 150, v: 0.15 }, // the rise (pulsing)
    { s: 'roll_fabric_swish', d: 150, r: 0.62, g: -7, v: 0.2 },                        // wings unfurl
    // the ledger slams down: transients aligned on the same frame, the sub under them
    // every slam layer rings DOWN from its first frame (dk): one hard peak, no plateau
    { s: 'slam_stone_mining_hit', d: 600, r: 0.62, g: 1, len: 0.6, dk: 110, v: 0.35 },  // the crack: first and sharpest
    { s: 'book_slam_hard', d: 600, off: 0.16, r: 0.78, g: 3, len: 0.6, dk: 80, v: 0.3 },
    { s: 'slam_heavy_body_ground', d: 600, off: 0.11, r: 0.85, g: 2, len: 0.7, dk: 100, v: 0.25 },
    { s: 'slam_concrete_smash', d: 600, r: 0.95, g: -5, hp: 150, v: 0.35 },
    { s: 'clash_metal_heavy_1', d: 605, r: 0.7, g: -8, hp: 500, v: 0.3 },             // the iron clasp
    SUB(-5, 600, 0.85),
    { s: 'slam_debris_crash', d: 650, len: 1.1, r: 0.8, g: -14, hp: 400, fo: 700, v: 0.4 }, // grit rains from the vault
    // the bellow: lion chest, demon throat with moving formants, groan underneath, snarl grit
    // it tears out ~150 ms AFTER the slam with a soft 70 ms swell, so the slam lands alone and is
    // the loudest frame; 1.1 s long, so the hall has dropped >10 dB before the answer
    { s: 'monster_roar_demon_lion', d: 750, off: 1.35, len: 1.1, r: 0.86, re: 0.82, g: -3, hp: 70, lp: 1300, fi: 70, fo: 550, v: 0.35 },
    { s: 'monster_death_demon_choke', d: 760, off: 4.25, len: 1.1, r: 0.82, re: 0.78, g: -7, hp: 150, lp: 1700, fi: 80, fo: 600, v: 0.35 },
    { s: 'monster_death_groan', d: 770, off: 0.65, len: 0.8, r: 0.72, re: 0.68, g: -9, hp: 100, fi: 70, fo: 300, v: 0.3 },
    { s: 'monster_roar_snarl', d: 760, off: 0.15, len: 0.9, r: 0.95, g: -10, hp: 300, fi: 60, fo: 400, v: 0.25 },
    // the answer: a lower pulsing growl as the first bellow dies into the hall
    { s: 'monster_death_dying_breath', d: 2400, off: 1.45, len: 1.6, r: 0.78, re: 0.72, g: -4, hp: 90, lp: 3500, fi: 40, fo: 700, v: 0.4 },
    { s: 'monster_death_throes', d: 2350, off: 0.1, len: 0.8, r: 0.74, re: 0.7, g: -5, hp: 380, fo: 300, v: 0.4 },
    { s: 'monster_roar_demon_lion', d: 2450, off: 0.15, len: 0.5, r: 0.8, g: -6, hp: 80, fo: 250, v: 0.4 },
    { s: 'paper_rustle', d: 1900, off: 2.6, len: 0.6, g: -12, hp: 900, fi: 120, fo: 300, v: 0.15 },  // pages stir
    { s: 'footstep_stone_3', d: 1600, r: 1.25, g: -18, v: 0.3 },                      // grit trickles
  ] },

  // ---------- tells: each pose has its own signature; dry and close, the bed hushed under it ----------
  'boss.tell:quill_slash': { pri: 3, duck: hush('quill_slash'), L: [
    { s: 'clash_sword_knives', r: 0.5, g: -9, hp: 700, lp: 7000, v: 0.12 },            // pen-blade scrapes free
    { s: 'roll_fabric_swish', off: 0.1, r: 0.8, g: -9, v: 0.08 },
    { s: 'monster_roar_snarl', off: 0.3, len: 0.6, r: 1.0, g: -6, hp: 300, fi: 40, fo: 200, v: 0.1 },
    { s: 'paper_tear_single', d: 120, off: 0.38, len: 0.25, r: 1.6, g: -14, hp: 2000, v: 0.08 },  // ink drips
    // the sweep (peaks just as the blade crosses)
    { s: 'whoosh_heavy_spear_hammer', te: -230, off: 0.2, r: 0.82, g: 0, v: 0.2 },
    { s: 'whoosh_light_longsword_swing', te: -170, r: 0.72, g: -5, hp: 700, v: 0.2 },
  ] },
  'boss.tell:ink_lunge': { pri: 3, duck: hush('ink_lunge'), L: [
    { s: 'slam_debris_crash', len: 1.6, r: 0.42, g: -11, lp: 520, fi: 120, fo: 500, v: 0.05 },           // floor trembles
    { s: 'monster_roar_snarl', off: 0.35, len: 0.9, r: 0.8, g: -4, lp: 4500, hp: 150, fi: 60, fo: 250, v: 0.1 },
    { s: 'roll_clothing_drag', r: 0.65, g: -10, v: 0.05 },
    SUB(-14, 0, 0.7),
    { s: 'whoosh_heavy_low_swoosh', te: -200, off: 0.08, r: 0.62, g: 0, v: 0.2 },      // the lunge launches
  ] },
  'boss.tell:ledger_slam': { pri: 3, duck: hush('ledger_slam', -12), L: [
    // the windup is dry and close; the impact (boss.strike:ledger_slam) blooms into the hall
    { s: 'roll_shirt_whoosh', r: 0.6, g: -6, v: 0.04 },                               // the book is hoisted
    { s: 'monster_roar_snarl', d: 40, off: 0.3, len: 0.6, r: 0.88, g: -5, hp: 250, fi: 40, fo: 220, v: 0.06 }, // the effort as it heaves
    { s: 'paper_pages_flip', d: 140, r: 0.75, g: -1, v: 0.05 },                       // pages flap open
    { s: 'paper_book_flip', d: 250, off: 0.2, r: 0.8, g: -2, v: 0.05 },
    { s: 'whoosh_heavy_cardboard_swing', te: -130, r: 0.55, g: -3, hp: 60, v: 0.08 },  // the book comes down (te is from the END of the pose = active start; the strike lands ~115 ms later, so the whoosh crests into it)
    { s: 'whoosh_heavy_low_swoosh', te: -110, off: 0.12, r: 0.58, g: -5, hp: 90, v: 0.08 },
  ] },
  'boss.tell:wing_gust': { pri: 3, duck: hush('wing_gust'), L: [
    { s: 'roll_fabric_swish', r: 0.52, g: -3, v: 0.15 },                              // wings spread
    { s: 'amb_howling_wind_loop', off: 31, len: 1.1, fi: 450, fo: 250, r: 0.85, g: -6, v: 0.15 }, // long in-breath
    { s: 'paper_rustle', d: 120, off: 2.7, len: 0.9, g: 0, hp: 1200, v: 0.15 },       // torn-paper feathers
    { s: 'monster_death_dying_breath', off: 0.15, len: 0.9, r: 1.1, g: -9, fi: 200, fo: 200, v: 0.1 },
    // round 10: the wind-up had no throat; a deep growl swells as the wings draw back
    { s: 'monster_growl_deep', off: 0.2, len: 1.0, r: 0.9, re: 0.84, g: -5, hp: 90, lp: 2200, fi: 160, fo: 300, v: 0.12 },
  ] },
  'boss.tell:written_name': { pri: 3, duck: hush('written_name', -12), L: [
    { s: 'book_snap_shut', r: 0.7, g: 3, v: 0.15 },                                   // the ledger opens
    { s: 'quill_scratch_line', d: 300, r: 0.85, g: -3, v: 0.1 },                      // first careful stroke
    { s: 'bell_toll_funeral', d: 80, len: 3.5, r: 0.6, g: -16, lp: 2400, fo: 1200, v: 0.4 },  // a name is being entered
    { s: 'drone_dark_choir_loop', off: 22, len: 2.2, fi: 500, fo: 700, g: -13, v: 0.2 },
    // round 10: the curse is spoken: a low groan murmurs under the first stroke
    { s: 'monster_death_groan', d: 150, off: 0.4, len: 1.0, r: 0.66, re: 0.62, g: -8, hp: 70, lp: 1400, fi: 120, fo: 400, v: 0.2 },
  ] },
  'boss.tell:page_storm': { pri: 3, duck: hush('page_storm'), L: [
    { s: 'paper_rip', r: 0.8, g: -4, v: 0.15 },
    { s: 'paper_rustle', off: 1.4, len: 2, g: 1, fi: 200, v: 0.2 },
    { s: 'amb_howling_wind_loop', off: 40, len: 1.6, fi: 400, fo: 400, g: -5, v: 0.2 },
    { s: 'monster_shriek_mutant', d: 200, r: 0.6, g: -9, v: 0.3 },
  ] },

  // ---------- active: whooshes and impacts ----------
  'boss.active:quill_slash': { pri: 2, L: [
    // the second (backhand) and third (delayed) sweeps, timed from the attack table
    { s: 'whoosh_heavy_spear_hammer', hit: 1, d: -230, off: 0.2, r: 0.76, g: 0, v: 0.3 },
    { s: 'whoosh_light_longsword_swing', hit: 1, d: -170, r: 0.68, g: -5, hp: 700, v: 0.3 },
    { s: 'whoosh_heavy_spear_hammer', hit: 2, d: -230, off: 0.2, r: 0.7, g: 1, v: 0.35 },
    { s: 'whoosh_heavy_low_swoosh', hit: 2, d: -200, off: 0.08, r: 0.66, g: -4, v: 0.3 },
  ] },
  'boss.strike:quill_slash': { pri: 1, L: [
    { s: 'clash_sword_short', r: 0.55, g: -10, hp: 1500, v: 0.4 },                    // the nib sings (was -17: inaudible)
    { s: 'whoosh_heavy_staff_pitched', r: 0.6, g: -9, lp: 2500, v: 0.2 },             // the great pen cuts the air low
  ] },
  'boss.active:ink_lunge': { pri: 2, duck: [-5, 500], L: [
    { s: 'whoosh_heavy_spear_hammer', off: 0.3, r: 0.7, g: -3, v: 0.3 },
    { s: 'paper_rip', r: 0.62, g: -5, lp: 6000, v: 0.3 },                             // the black streak
    { s: 'monster_roar_snarl', off: 0.75, len: 0.9, r: 0.85, g: -6, fi: 30, fo: 250, v: 0.35 },
    SUB(-9, 30, 0.9),
  ] },
  // round 10: the lunge's blow had no body of its own (boss.strike fell through to nothing)
  'boss.strike:ink_lunge': { pri: 2, L: [
    { s: 'bodyfall_heavy_dirt', off: 0.45, len: 0.6, r: 0.7, g: 1, dk: 160, v: 0.3 },
    { s: 'slam_concrete_smash', r: 1.1, g: -5, hp: 220, len: 0.6, dk: 120, v: 0.35 },
  ] },
  // the ledger lands: fires on the strike frame (hit or miss), the moment the book meets stone.
  // Transients aligned within ~10 ms; the sub carries the weight, the hall takes the tail.
  'boss.strike:ledger_slam': { pri: 3, duck: [-16, 2500], L: [
    { s: 'sting_death_bass_drum_boom', off: 0.07, len: 0.9, r: 0.8, g: 3, lp: 130, dk: 170, v: 0 },  // sub: the weight, ringing down (round 10: -4 dB, it hit the limiter)
    { s: 'slam_stone_mining_hit', r: 0.6, g: -2, len: 0.6, dk: 110, v: 0.35 },          // the crack: first, instant, loudest
    { s: 'slam_heavy_body_ground', off: 0.11, r: 0.8, g: -1, len: 0.7, dk: 120, v: 0.35 },  // the dead weight
    { s: 'book_slam_hard', off: 0.16, r: 0.7, g: -2, hp: 150, len: 0.6, dk: 90, v: 0.3 },  // leather + paper slap
    { s: 'slam_concrete_smash', r: 0.9, g: -5, hp: 200, v: 0.4 },                    // stone breaks, blooms into the hall
    { s: 'clash_metal_heavy_1', r: 0.62, g: -9, hp: 600, v: 0.25 },                   // the iron clasp cracks on stone
  ] },
  // the ink geysers burst up after the hitstop: rubble and a wet tearing rush, no second thump
  'boss.spawn:shockwave': { pri: 2, cd: 160, L: [
    // each geyser is its own punctuation ~6 dB under the slam: the floor cracks, ink tears upward
    { s: 'slam_concrete_smash', r: [1.12, 1.02], g: -3, hp: 260, len: 0.7, dk: 120, v: 0.4 },
    { s: 'slam_stone_mining_hit', r: [0.9, 0.82], g: -9, hp: 400, len: 0.5, dk: 80, v: 0.3 },
    { s: 'slam_debris_crash', len: 1.5, r: 0.9, g: -10, hp: 500, fo: 600, v: 0.35 },                 // rubble skitters out
    { s: 'paper_rip', d: 20, r: 0.6, g: -8, hp: 300, v: 0.3 },                        // ink tears up out of the floor
  ] },
  'boss.gust': { pri: 2, duck: [-5, 900], L: [
    SUB(-12, 0, 0.75, 220),                                                          // round 10: the wings' downbeat has weight
    { s: 'roll_shirt_whoosh', off: 0.1, r: 0.48, g: 0, v: 0.4 },
    { s: 'whoosh_heavy_low_swoosh', r: 0.5, g: -4, v: 0.4 },
    { s: 'amb_howling_wind_loop', off: 22, len: 1.6, fi: 60, fo: 600, g: -1, v: 0.45 },
    { s: 'paper_rustle', off: 2.9, len: 1.1, g: 2, hp: 1000, v: 0.5 },
  ] },
  'boss.spawn:page': { pri: 1, cd: 110, L: [
    { s: ['paper_tear_single', 'paper_pages_flip'], r: [1, 0.9, 1.12], g: [-9, 2], hp: 800, v: 0.4 },
  ] },
  'boss.storm_wave': { pri: 1, cd: 170, L: [
    { s: 'paper_pages_flip', r: [0.8, 0.9, 0.75], g: 3, v: 0.5 },
    { s: 'whoosh_light_cable_fast', r: 0.6, g: -10, v: 0.5 },
  ] },
  'boss.write': { pri: 2, L: [
    { s: 'quill_scratch_fountain_pen_1', off: 0.2, len: 3.2, r: 0.82, g: -2, fo: 400, v: 0.35 },
    { s: 'drone_dark_choir_loop', off: 40, len: 3.2, fi: 900, fo: 600, g: -10, v: 0.5 },
  ] },
  'boss.curse_detonate': { pri: 3, duck: [-10, 1500], L: [
    { s: 'book_slam_hard', off: 0.15, r: 0.5, g: 0, v: 0.5 },
    { s: 'sting_death_gong', r: 0.7, g: -4, v: 0.6 },
    { s: 'sting_death_trailer_boom', off: 0.4, len: 3, g: -2, lp: 900, v: 0.2 },
    { s: 'monster_shriek_high', r: 0.55, g: -7, v: 0.6 },
    { s: 'paper_rip', r: 0.7, g: -6, v: 0.4 },
  ] },
  'boss.curse_broken': { pri: 2, L: [
    { s: 'paper_rip', r: 0.95, g: -2, v: 0.4 },
    { s: 'monster_shriek_dragon_pain', r: 0.7, g: -5, v: 0.5 },
    { s: 'clash_sword_bright', r: 0.6, g: -12, v: 0.5 },
  ] },

  // ---------- the boss is hurt ----------
  'boss.stagger': { pri: 3, duck: [-6, 900], L: [
    { s: 'monster_shriek_dragon_pain', r: 0.72, g: -2, v: 0.45 },
    { s: 'clash_metal_heavy_1', r: 0.6, g: 4, v: 0.45 },
    { s: 'bodyfall_thud', d: 120, r: 0.75, g: 0, v: 0.3 },
    SUB(-6, 0, 0.9),
  ] },
  'poise.break': { pri: 2, cd: 300, L: [
    { s: 'clash_metal_heavy_2', r: 0.5, g: 2, v: 0.5 },
    { s: 'slam_stone_mining_hit', r: 0.72, g: -3, v: 0.3 },
  ] },
  'boss.phase': { pri: 3, duck: [-12, 2800], L: [
    { s: 'roll_fabric_swish', r: 0.45, g: -2, v: 0.5 },
    { s: 'monster_roar_long', d: 120, r: 0.7, g: 0, lp: 5000, v: 0.5 },
    { s: 'monster_roar_demon_lion', d: 60, r: 0.82, g: -3, v: 0.5 },
    { s: 'monster_shriek_mutant', d: 500, r: 0.52, g: -9, v: 0.6 },
    { s: 'sting_death_tamtam', d: 200, len: 5, r: 0.8, g: -6, v: 0.4 },
    { s: 'sting_death_trailer_boom', off: 0.3, len: 3, g: -2, lp: 900, v: 0.2 },
    { s: 'amb_howling_wind_loop', off: 5, len: 2.5, fi: 100, fo: 900, g: -2, v: 0.5 },
  ] },
  'boss.death': { pri: 3, duck: [-24, 6000], L: [
    // the killing blow: the sharpest, loudest transient of the fight (every layer peaks on the frame)
    { s: 'hit_flesh_large_stab', r: 0.8, g: 4, v: 0.15 },
    { s: 'hit_flesh_sword_body', off: 0.2, r: 0.75, g: 1, v: 0.15 },
    { s: 'slam_stone_mining_hit', r: 0.7, g: -2, v: 0.3 },                            // the crack through it
    { s: 'clash_metal_heavy_2', r: 0.7, g: 3, v: 0.25 },
    { s: 'clash_sword_bright', len: 0.4, r: 0.8, g: -12, hp: 800, fo: 250, v: 0.35 },  // the blade rings, briefly
    SUB(-5, 0, 0.85),
    // the scream, choked off: it tears out ~110 ms AFTER the blow (soft swell), so the blow lands
    // alone; the throats live under ~2 kHz and barely glide, so no partial draws a whining line
    { s: 'monster_shriek_dragon_pain', d: 110, off: 0.1, r: 0.78, re: 0.75, g: 1, hp: 550, lp: 3200, fi: 45, v: 0.35 },
    { s: 'monster_death_demon_choke', d: 170, off: 4.3, len: 1.3, r: 0.8, re: 0.76, g: -1, hp: 220, lp: 1150, fi: 60, fo: 600, v: 0.35 },
    { s: 'monster_death_throes', d: 420, off: 0.1, len: 0.9, r: 0.8, re: 0.76, g: -5, hp: 550, lp: 2500, fo: 350, v: 0.35 },
    { s: 'paper_rip', d: 380, r: 0.7, g: -8, hp: 300, v: 0.3 },                         // the ledger tears
    // the collapse (heavy, but under the blow)
    { s: 'roll_fabric_swish', d: 1050, r: 0.6, g: -9, v: 0.25 },                      // wings fold as it falls
    { s: 'bodyfall_heavy_dirt', d: 1350, off: 0.3, r: 0.72, g: -3, v: 0.3 },
    { s: 'slam_heavy_body_ground', d: 1480, off: 0.11, r: 0.78, g: 0, v: 0.3 },
    SUB(-11, 1480, 0.75),
    { s: 'slam_debris_crash', d: 1560, len: 1.4, r: 0.85, g: -12, hp: 400, fo: 800, v: 0.35 },
    { s: 'slam_debris_crash', d: 1700, off: 0.3, r: 0.55, g: -13, lp: 2500, fo: 1500, len: 1.5, v: 0.4 },  // stone settles, low and long
    { s: 'book_slam_hard', d: 2350, off: 0.16, r: 0.7, g: -7, v: 0.35 },              // the ledger lands
    // the hush: the throat rattles out, a page settles, the hall takes the rest
    { s: 'monster_death_demon_choke', d: 2400, off: 5.2, len: 1.6, r: 0.78, re: 0.74, g: -11, hp: 150, lp: 1100, fo: 1000, v: 0.3 },
    { s: 'monster_death_dying_breath', d: 2700, off: 4.3, len: 1.4, r: 0.84, re: 0.8, g: -12, hp: 200, lp: 3000, fi: 150, fo: 900, v: 0.3 },
    { s: 'paper_rustle', d: 2600, off: 1.0, len: 1.4, g: -19, hp: 900, fo: 1000, v: 0.3 },
  ] },

  // ---------- the challenger ----------
  // Blows that land on the fighter weigh what they cost: the sub and the flesh scale with damage
  // (wt), a knockdown adds the fall, a guarded blow is steel on steel (agent.guard:blocked) with
  // only a dull push through.
  'hit:agent': { pri: 3, duck: [-6, 450], L: [
    { s: 'hit_flesh_sword_body', off: 0.2, r: [0.86, 0.8, 0.92], g: -5, wt: ['damage', 8, 50, 5], v: 0.2 },
    { s: 'hit_flesh_large_stab', r: 0.75, g: -5, wt: ['damage', 8, 50, 5], wr: -0.08, v: 0.2 },
    SUBW(-17, 11, 0, 1, 90),
    { s: ['player_hurt_grunt_1', 'player_hurt_grunt_2', 'player_hurt_grunt_3'], d: 30, g: -6, wt: ['damage', 8, 50, 3], v: 0.2 },
  ] },
  'hit:agent:heavy': { pri: 3, duck: [-8, 650], L: [
    { s: 'hit_flesh_sword_body', off: 0.2, r: [0.82, 0.78, 0.88], g: -3, wt: ['damage', 20, 60, 4], v: 0.2 },
    { s: 'hit_flesh_large_stab', r: 0.7, g: -2, wt: ['damage', 20, 60, 4], wr: -0.1, v: 0.2 },
    SUBW(-11, 9, 0, 0.9, 150, 'damage', 20, 60),
    { s: ['player_hurt_grunt_1', 'player_hurt_grunt_2', 'player_hurt_grunt_3'], d: 30, r: 0.92, g: -4, v: 0.2 },
    { s: 'bodyfall_floor', d: 160, r: 1.0, g: -6, wt: ['damage', 20, 60, 4], v: 0.25 },     // knocked down
  ] },
  'hit:guarded': { pri: 2, L: [
    { s: 'bodyfall_thud', off: 0.15, r: 1.1, g: -10, wt: ['damage', 4, 30, 5], v: 0.15 },  // what still gets through the guard
    { s: ['player_hurt_grunt_2', 'player_hurt_grunt_3'], d: 40, r: 1.05, g: -14, v: 0.15 },
  ] },
  'agent.guard': { pri: 1, L: [                                                         // the guard comes up
    { s: 'roll_cloth_rustle', r: 0.9, g: -8, v: 0.15 },
    { s: 'clash_metal_heavy_1', d: 60, r: 1.5, g: -18, hp: 700, v: 0.2 },
  ] },
  'agent.guard:blocked': { pri: 3, L: [                                                 // steel takes the blow
    { s: 'clash_metal_heavy_2', r: 0.78, g: -2, wt: ['damage', 4, 40, 4], v: 0.35 },
    { s: 'clash_sword_bright', len: 0.45, r: 0.72, g: -9, hp: 600, fo: 250, v: 0.4 },
    { s: 'slam_stone_mining_hit', r: 1.1, g: -14, len: 0.4, dk: 70, v: 0.2 },
    SUBW(-18, 8, 0, 1, 90, 'damage', 4, 40),
  ] },
  'agent.guard:broken': { pri: 3, duck: [-6, 600], L: [                                 // the guard is smashed open
    { s: 'clash_metal_heavy_2', r: 0.62, g: 0, v: 0.4 },
    { s: 'clash_metal_heavy_1', d: 30, r: 0.7, g: -4, v: 0.35 },
    { s: 'clash_sword_bright', len: 0.6, r: 0.6, g: -8, hp: 500, fo: 300, v: 0.45 },
    SUB(-8, 0, 0.85, 160),
    { s: 'player_hurt_grunt_1', d: 60, r: 0.95, g: -6, v: 0.2 },
  ] },
  'hit:boss': { pri: 2, L: [
    { s: ['hit_flesh_sword_stab_body', 'hit_flesh_knife_stab_whoosh'], r: [1, 0.92, 1.06], g: [-5, -2], wt: ['damage', 8, 40, 4], v: 0.25 },
    { s: 'paper_tear_single', off: 0.42, len: 0.22, r: 1.3, g: -12, v: 0.3 },        // ink-paper flesh
    SUBW(-22, 9, 0, 1.05, 90),
  ] },
  'hit:boss:heavy': { pri: 2, L: [
    { s: 'hit_flesh_large_stab', r: 0.85, g: 1, v: 0.3 },
    { s: 'hit_flesh_sword_stab_body', r: 0.8, g: -3, v: 0.3 },
    { s: 'slam_stone_mining_hit', r: 0.8, g: -8, len: 0.5, dk: 100, v: 0.3 },
    SUBW(-12, 7, 0, 1.0, 130, 'damage', 15, 50),
  ] },
  // ---- steel by weapon: the swing (agent.attack) and the contact on the boss (hit:boss) ----
  // sabre: a thin fast blade; its cut rings
  'agent.attack:light:sabre': { pri: 1, L: [
    { s: 'whoosh_light_longsword_swing', r: [1.18, 1.26, 1.08], g: -2, hp: 250, v: 0.2 },
  ] },
  'hit:boss:sabre': { pri: 2, L: [
    { s: 'clash_sword_short', r: [1.0, 0.94, 1.08], len: 0.3, g: -9, hp: 1200, fo: 150, v: 0.35 },
    { s: 'hit_flesh_sword_body', off: 0.2, r: [0.98, 0.92, 1.04], g: -3, wt: ['damage', 8, 40, 4], v: 0.25 },
    { s: 'paper_tear_single', off: 0.42, len: 0.22, r: 1.3, g: -11, v: 0.3 },
    SUBW(-20, 8, 0, 1.1, 80),
  ] },
  // maul: iron on a haft; every blow drops a weight
  'agent.attack:light:maul': { pri: 1, L: [
    { s: 'whoosh_heavy_cardboard_swing', r: [0.82, 0.76], g: -4, hp: 50, v: 0.2 },
    { s: 'whoosh_heavy_low_swoosh', off: 0.08, r: 0.78, g: -9, v: 0.2 },
  ] },
  'agent.attack:heavy:maul': { pri: 2, L: [                                           // the Crushing Blow is heaved overhead
    { s: 'roll_fabric_swish', r: 0.7, g: -12, v: 0.15 },
    { s: 'whoosh_heavy_spear_hammer', d: 40, off: 0.1, r: 0.8, g: -2, v: 0.25 },
    { s: 'whoosh_heavy_cardboard_swing', d: 330, r: 0.66, g: -4, hp: 50, v: 0.25 },
  ] },
  'hit:boss:maul': { pri: 2, L: [
    { s: 'slam_stone_mining_hit', r: [0.76, 0.7], g: -5, len: 0.5, dk: 110, v: 0.3 },
    { s: 'clash_metal_heavy_2', r: 0.72, g: -8, v: 0.3 },
    { s: 'bodyfall_thud', off: 0.2, r: 0.85, g: -6, v: 0.25 },
    { s: 'hit_flesh_large_stab', r: 0.72, g: -7, v: 0.25 },
    SUBW(-14, 9, 0, 0.95, 140),
  ] },
  'hit:boss:maul:heavy': { pri: 3, duck: [-8, 700], L: [
    SUBW(-7, 6, 0, 0.82, 170, 'damage', 20, 50),
    { s: 'slam_stone_mining_hit', r: 0.62, g: 0, len: 0.6, dk: 120, v: 0.35 },
    { s: 'slam_heavy_body_ground', off: 0.11, r: 0.8, g: -2, len: 0.7, dk: 120, v: 0.35 },
    { s: 'clash_metal_heavy_2', r: 0.6, g: -4, v: 0.3 },
    { s: 'hit_flesh_large_stab', r: 0.7, g: -3, v: 0.3 },
    { s: 'slam_debris_crash', len: 0.9, r: 0.9, g: -16, hp: 500, fo: 500, v: 0.35 },
  ] },
  // knives: four quick small cuts, high and close
  'agent.attack:light:knives': { pri: 1, cd: 60, L: [
    { s: 'whoosh_light_cable_fast', r: [1.25, 1.36, 1.18, 1.3], len: 0.32, g: -5, v: 0.15 },
    { s: 'whoosh_light_bamboo_sword', r: [1.45, 1.55, 1.4, 1.5], len: 0.3, g: -12, hp: 600, v: 0.15 },
  ] },
  'hit:boss:knives': { pri: 2, L: [
    { s: 'clash_sword_knives', off: 0.03, len: 0.24, r: [1.15, 1.26, 1.1, 1.3], g: -9, hp: 1500, fo: 120, v: 0.3 },
    { s: 'hit_flesh_knife_stab_whoosh', off: 0.12, len: 0.3, r: [1.1, 1.2, 1.0, 1.15], g: -4, wt: ['damage', 6, 20, 3], v: 0.2 },
    { s: 'paper_tear_single', off: 0.45, len: 0.15, r: 1.5, g: -13, v: 0.25 },
    SUBW(-22, 8, 0, 1.15, 60, 'damage', 6, 30),
  ] },
  // pole: a long ash shaft with an iron tip; a thrust, not a cut
  'agent.attack:light:pole': { pri: 1, L: [
    { s: 'whoosh_heavy_staff_pitched', r: [1.0, 0.94], g: -4, v: 0.2 },
    { s: 'whoosh_light_longsword_swing', r: 0.86, g: -13, v: 0.2 },
  ] },
  'hit:boss:pole': { pri: 2, L: [
    { s: 'hit_flesh_sword_stab_body', off: 0.12, r: [0.92, 0.86], g: -4, wt: ['damage', 8, 40, 4], v: 0.25 },
    { s: 'clash_metal_heavy_1', r: 1.2, g: -13, hp: 600, v: 0.3 },                    // the iron tip
    { s: 'bodyfall_thud', off: 0.2, r: 1.1, g: -11, v: 0.2 },                        // the shaft's weight behind it
    SUBW(-19, 8, 0, 1.05, 90),
  ] },
  // censer: an iron bowl on a chain, swung; every hit leaves it burning
  'agent.attack:light:censer': { pri: 1, L: [
    { s: 'whoosh_heavy_spear_hammer', off: 0.25, r: 1.0, g: -6, v: 0.2 },
    { s: 'clash_metal_heavy_1', d: 50, r: 1.55, g: -20, hp: 1200, v: 0.2 },          // the chain rattles at the top of the swing
  ] },
  'hit:boss:censer': { pri: 2, L: [
    { s: 'clash_metal_heavy_1', r: 0.75, g: 1, v: 0.3 },                             // the iron bowl
    { s: 'clash_metal_heavy_2', d: 40, r: 1.35, g: -10, hp: 800, v: 0.3 },            // the chain
    { s: 'hit_flesh_large_stab', r: 0.92, g: -3, v: 0.25 },
    { s: 'paper_rip', off: 0.1, len: 0.35, r: 1.35, g: -11, hp: 1500, fo: 200, v: 0.25 }, // embers bite the paper
    SUBW(-12, 8, 0, 1.0, 110),
  ] },
  // quill: a stolen nib, stabbing
  'agent.attack:light:quill': { pri: 1, L: [
    { s: 'whoosh_light_foam_sword', r: [1.35, 1.45, 1.3], g: -5, v: 0.15 },
    { s: 'quill_scratch_line', len: 0.15, r: 1.6, g: -16, hp: 2000, fo: 60, v: 0.15 },
  ] },
  'hit:boss:quill': { pri: 2, L: [
    { s: 'clash_sword_short', r: [1.5, 1.6, 1.45], len: 0.2, g: -9, hp: 2500, fo: 100, v: 0.3 }, // the nib
    { s: 'hit_flesh_knife_stab_whoosh', off: 0.12, len: 0.35, r: [1.1, 1.0, 1.15], g: -2, wt: ['damage', 8, 30, 4], v: 0.25 },
    { s: 'quill_scratch_line', len: 0.2, r: 1.4, g: -10, hp: 1500, fo: 80, v: 0.2 },
    SUBW(-18, 8, 0, 1.1, 70),
  ] },
  // a spell on the boss: the spell's own cue (spell.hit) carries it; the body takes only a tear
  'hit:boss:spell': { pri: 1, L: [
    { s: 'paper_tear_single', off: 0.4, len: 0.25, r: 1.1, g: -12, v: 0.3 },
  ] },
  'dodge': { pri: 1, cd: 200, L: [
    { s: 'whoosh_light_cable_fast', r: 0.85, g: -10, v: 0.3 },
  ] },
  'agent.roll': { pri: 1, L: [
    { s: ['roll_clothing_drag', 'roll_cloth_rustle'], g: -7, v: 0.15 },
    { s: ['footstep_stone_boot_1', 'footstep_stone_boot_2'], d: 260, g: -2, v: 0.15 },
  ] },
  'agent.jump': { pri: 1, L: [{ s: 'roll_cloth_rustle', r: 1.1, g: -10, v: 0.15 }] },
  'agent.land': { pri: 1, L: [{ s: 'footstep_stone_boot_3', g: -3, v: 0.15 }] },
  'agent.attack:light': { pri: 1, L: [
    { s: ['whoosh_light_bamboo_sword', 'whoosh_light_foam_sword'], r: [1, 1.08, 0.94], g: -7, v: 0.2 },
  ] },
  'agent.attack:heavy': { pri: 1, L: [
    { s: 'whoosh_light_longsword_swing', r: 0.82, g: -2, v: 0.25 },
    { s: 'whoosh_heavy_staff_pitched', r: 0.85, g: -6, v: 0.25 },
  ] },
  'agent.heal_start': { pri: 1, L: [{ s: 'heal_potion_drink', g: -7, v: 0.15 }] },
  'agent.heal': { pri: 1, L: [{ s: ['heal_drink_swallow', 'heal_drink_gulp'], g: -8, v: 0.15 }] },
  // the fall: the throat, the body, and the weight of it under the score as the score drops away
  'agent.death': { pri: 3, duck: [-14, 2500], L: [
    { s: ['player_death_warrior_groan', 'player_death_last_gasp', 'player_death_cry', 'player_death_pain_grunt'], g: -3, v: 0.4 },
    { s: 'bodyfall_floor', d: 520, r: 0.9, g: -3, v: 0.35 },
    SUB(-7, 520, 0.8, 200),
    { s: 'sting_death_tamtam', d: 400, len: 6, g: -8, fo: 2200, v: 0.4 },
  ] },

  // ---------- spells, charms, burns (round 10: these were all silent) ----------
  'agent.cast:candle': { pri: 2, L: [                                                 // a bolt of fire leaves the hand
    { s: 'whoosh_light_cable_fast', r: 0.7, g: -6, v: 0.25 },
    { s: 'roll_fabric_swish', r: 1.3, g: -12, v: 0.2 },
    { s: 'paper_rip', d: 40, off: 0.05, len: 0.3, r: 1.5, g: -15, hp: 1800, fo: 150, v: 0.25 },  // the flame's crackle (paper stands in)
  ] },
  'agent.cast:blot': { pri: 2, L: [                                                   // an ink ward goes up
    { s: 'book_snap_shut', r: 0.8, g: 0, v: 0.25 },
    { s: 'paper_pages_flip', d: 60, r: 0.8, g: -5, v: 0.25 },
  ] },
  'agent.cast:margin': { pri: 2, L: [                                                 // a step through the margin
    { s: 'paper_page_turn', off: 0.6, len: 0.4, r: 1.3, g: -4, hp: 300, v: 0.3 },
    { s: 'whoosh_light_cable_fast', r: 1.4, g: -8, v: 0.3 },
  ] },
  'agent.cast:knot': { pri: 2, L: [
    { s: 'roll_clothing_drag', r: 0.7, g: -5, v: 0.2 },
    { s: 'clash_metal_heavy_1', d: 120, r: 0.85, g: -13, v: 0.25 },                   // the binding's iron
  ] },
  'agent.cast:mend': { pri: 2, L: [{ s: 'heal_potion_drink', g: -6, v: 0.15 }] },
  'agent.cast:echo': { pri: 2, L: [
    { s: 'clash_sword_bright', len: 0.5, r: 1.2, g: -11, hp: 900, fo: 300, v: 0.55 },  // the blade's ring is kept
  ] },
  'agent.cast:hex': { pri: 2, L: [
    { s: 'quill_scratch_scribble', len: 0.6, r: 0.8, g: -8, fo: 150, v: 0.25 },         // a sigil scratched in the air
    { s: 'bell_toll_funeral', d: 150, len: 1.4, r: 1.6, g: -20, fo: 700, v: 0.45 },
  ] },
  'spell.hit:candle': { pri: 2, L: [                                                  // the fire bolt lands
    SUBW(-16, 8, 0, 1.0, 120, 'damage', 10, 50),
    { s: 'slam_concrete_smash', r: 1.3, g: -8, hp: 300, len: 0.6, dk: 120, v: 0.35 },
    { s: 'paper_rip', r: 0.8, g: -5, v: 0.3 },                                        // the ink catches
    { s: 'hit_flesh_large_stab', r: 0.95, g: -9, v: 0.25 },
  ] },
  'spell.hit:echo': { pri: 2, L: [                                                    // the strike, again, as a ghost
    { s: 'clash_sword_bright', d: 70, len: 0.5, r: 1.1, g: -11, hp: 900, fo: 250, v: 0.55 },
  ] },
  'spell.hit:knot': { pri: 2, L: [
    { s: 'roll_clothing_drag', r: 0.55, g: -3, v: 0.25 },
    { s: 'clash_metal_heavy_2', r: 0.6, g: -5, v: 0.3 },
    SUB(-14, 0, 0.9),
  ] },
  'spell.hit:mend': { pri: 2, L: [
    { s: 'heal_drink_swallow', g: -7, v: 0.15 },
    { s: 'bell_toll_large', d: 120, len: 1.2, r: 2.2, g: -21, fo: 700, v: 0.5 },
  ] },
  'spell.hit:blot': { pri: 3, L: [                                                    // the ward takes the blow
    { s: 'book_slam_shut', r: 0.8, g: 0, v: 0.35 },
    { s: 'book_slam_hard', off: 0.16, r: 1.05, g: -8, len: 0.5, dk: 90, v: 0.3 },
    { s: 'paper_rip', d: 60, len: 0.5, r: 1.1, g: -12, v: 0.3 },
  ] },
  'boss.hexed': { pri: 2, L: [
    { s: 'bell_toll_funeral', len: 1.6, r: 1.4, g: -15, fo: 800, v: 0.45 },
    { s: 'monster_shriek_mutant', d: 60, r: 0.8, g: -15, lp: 2500, v: 0.3 },
  ] },
  'burn.start': { pri: 2, L: [                                                        // it catches fire (no fire recording yet: paper and cloth)
    { s: 'paper_rip', r: 0.6, g: -9, lp: 3000, v: 0.3 },
    { s: 'roll_fabric_swish', r: 0.7, g: -11, v: 0.3 },
  ] },
  'burn.tick': { pri: 0, cd: 450, L: [
    { s: 'paper_tear_single', off: 0.42, len: 0.2, r: [0.7, 0.8, 0.75], g: -16, hp: 1500, v: 0.25 },
  ] },
  'charm.proc': { pri: 3, L: [                                                        // the wax seal holds against a killing blow
    { s: 'book_snap_shut', r: 0.6, g: -2, v: 0.3 },
    { s: 'bell_toll_large', d: 80, len: 1.6, r: 1.9, g: -11, fo: 900, v: 0.5 },
  ] },
  'boss.heal': { pri: 2, L: [
    { s: 'drone_dark_choir_loop', off: 30, len: 1.8, fi: 300, fo: 600, g: -12, v: 0.4 },
    { s: 'quill_scratch_line', r: 0.7, g: -12, v: 0.2 },
  ] },
  'hazard.land': { pri: 0, cd: 250, L: [
    { s: 'paper_page_turn', off: 0.6, len: 0.25, g: -12, hp: 600, v: 0.25 },
  ] },
  // the name, one stroke at a time: a hard nib stroke under each tell, and a far bell that grows
  // with the count, so the sixth stroke is heard to be the last
  'name.stroke': { pri: 2, L: [
    { s: 'quill_scratch_line', len: 0.45, r: 0.9, g: -12, wt: ['k', 1, 6, 5], fo: 120, v: 0.2 },
    { s: 'bell_toll_funeral', d: 60, len: 1.8, r: 1.25, g: -25, wt: ['k', 1, 6, 11], fo: 900, v: 0.55 },
  ] },

  // ---------- match flow ----------
  'match.death': { pri: 3, duck: [-14, 3800], L: [
    { s: 'sting_death_tamtam', len: 7, g: -4, fo: 2000, v: 0.4 },
    SUB(-6, 0, 0.8),
    { s: 'bell_toll_funeral', d: 700, r: 0.8, g: -9, v: 0.6 },
  ] },
  // the bells wait: the collapse rings out into silence first (match.victory comes ~3 s after
  // boss.death, so the first toll lands ~5.6 s after the killing blow)
  'match.victory': { pri: 3, duck: [-24, 9000], L: [
    { s: 'bell_toll_large', d: 2600, g: -6, v: 0.5 },
    { s: 'bell_cathedral_peal', d: 4200, off: 4, len: 7, fi: 800, fo: 2500, g: -11, v: 0.6 },
  ] },
  // ---------- the show: phase calls, the choosing, the prediction clock ----------
  // (lead) keyed by `show.<what>` events the stage raises from the feed; `kind` picks a variant.
  // Round 10, the phase strike: every phase opens with ONE family, a book slammed down under a
  // struck bell, so a viewer with their eyes shut knows the show has moved on; which phase it is
  // reads from the bell: the call one deep toll, the choosing two, the tape three quick and
  // higher, the fight a darker bell over steel, the verdict the deepest toll and then the peal.
  'show.phase:call': { pri: 3, duck: [-12, 3200], L: [
    { s: 'book_slam_hard', off: 0.16, r: 0.82, g: -2, len: 0.7, dk: 140, v: 0.4 },
    SUB(-10, 0, 0.85, 160),
    { s: 'bell_toll_large', off: 0.06, len: 5, r: 0.8, g: -2, fo: 2500, v: 0.55 },     // one deep toll
    { s: 'paper_book_flip', d: 700, g: -9, v: 0.3 },                                  // the ledger opens to a fresh leaf
    { s: 'quill_scratch_fountain_pen_1', d: 1700, len: 0.9, g: -10, fo: 200, v: 0.25 }, // the first name
    { s: 'quill_scratch_fountain_pen_2', d: 2700, len: 0.9, g: -10, fo: 200, v: 0.25 }, // the second
  ] },
  'show.phase:choosing': { pri: 3, duck: [-12, 2600], L: [
    { s: 'book_slam_hard', off: 0.16, r: 0.9, g: -1, len: 0.7, dk: 120, v: 0.4 },
    SUB(-10, 0, 0.9),
    { s: 'bell_toll_large', off: 0.06, len: 3, r: 0.95, g: -2, fo: 1500, v: 0.55 },    // two tolls
    { s: 'bell_toll_large', d: 450, off: 0.06, len: 4, r: 0.95, g: -3, fo: 2200, v: 0.55 },
    { s: 'paper_pages_flip', d: 900, g: -6, len: 1.2, fo: 300, v: 0.3 },
  ] },
  'show.temper': { pri: 3, duck: [-10, 3200], L: [
    { s: 'monster_growl_deep', d: 1100, len: 2.2, r: 0.8, g: -5, lp: 2200, fi: 200, fo: 900, v: 0.45 },
    SUB(-8, 1950, 0.8),
    { s: 'paper_rustle', d: 850, off: 2.6, len: 0.7, g: -12, hp: 900, fi: 100, fo: 300, v: 0.2 },
  ] },
  'show.offer': { pri: 1, duck: [-4, 1200], L: [
    { s: 'paper_page_turn', off: 0.6, len: 0.35, g: 0, hp: 300, v: 0.25 },            // three plates dealt
    { s: 'paper_page_turn', d: 300, off: 0.6, len: 0.35, r: 1.06, g: 0, hp: 300, v: 0.25 },
    { s: 'paper_page_turn', d: 600, off: 0.6, len: 0.35, r: 0.95, g: 0, hp: 300, v: 0.25 },
  ] },
  'show.pick': { pri: 2, duck: [-5, 1300], L: [
    { s: 'book_snap_shut', r: 1.1, g: 1, v: 0.3 },                                    // taken
    { s: 'book_close_kenney', r: 0.85, g: -4, v: 0.3 },
    { s: ['quill_scratch_line', 'quill_scratch_scribble'], d: 120, len: 0.5, g: -5, fo: 150, v: 0.2 }, // the other two struck out
  ] },
  'show.phase:tape': { pri: 3, duck: [-12, 2400], L: [
    { s: 'book_slam_hard', off: 0.16, r: 0.98, g: -1, len: 0.7, dk: 120, v: 0.35 },
    SUB(-10, 0, 0.95),
    { s: 'bell_toll_large', off: 0.06, len: 1.6, r: 1.12, g: -3, fo: 900, v: 0.5 },    // three quick tolls, higher
    { s: 'bell_toll_large', d: 330, off: 0.06, len: 1.6, r: 1.12, g: -4, fo: 900, v: 0.5 },
    { s: 'bell_toll_large', d: 660, off: 0.06, len: 3.5, r: 1.12, g: -4, fo: 1800, v: 0.5 },
  ] },
  // predictions: a small high bell opens them, the book shuts on them with its iron clasp,
  // two small bells pay out. `kind` is 'who' (the match) or 'try' (how far this try gets).
  // The try window opens with the walk-on (and the fight's phase strike): its bell waits a beat.
  'show.window.open': { pri: 2, cd: 500, L: [
    { s: 'bell_toll_large', d: 900, off: 0.06, r: 1.7, g: -9, len: 1.6, fo: 900, v: 0.5 },
  ] },
  'show.window.locked:who': { pri: 3, cd: 500, duck: [-8, 900], L: [                  // predictions closed: the book shuts
    { s: 'book_slam_shut', r: 0.9, g: 5, v: 0.35 },
    { s: 'book_slam_hard', off: 0.16, r: 1.1, g: -6, len: 0.4, dk: 70, v: 0.3 },
    { s: 'clash_metal_heavy_1', d: 140, r: 1.5, g: -9, hp: 800, v: 0.3 },            // the clasp locks
  ] },
  // the try window locks on the same frame the try's bell rings: only the clasp, under the bell
  'show.window.locked': { pri: 2, cd: 500, L: [
    { s: 'book_slam_shut', r: 1.0, g: -8, v: 0.3 },
    { s: 'clash_metal_heavy_1', d: 90, r: 1.6, g: -16, hp: 800, v: 0.3 },
  ] },
  // paid: after the try's ending has rung out (a try window settles 0.2 s after the end)
  'show.window.settled': { pri: 2, cd: 900, L: [
    { s: 'bell_toll_large', d: 2600, off: 0.06, r: 2.0, g: -14, len: 0.9, fo: 600, v: 0.5 },
    { s: 'bell_toll_large', d: 2790, off: 0.06, r: 2.25, g: -14, len: 1.2, fo: 800, v: 0.5 },
  ] },
  'show.window.settled:who': { pri: 1, cd: 900, L: [                                  // settles under the verdict's strike: after it
    { s: 'bell_toll_large', d: 3200, off: 0.06, r: 2.0, g: -16, len: 0.9, fo: 600, v: 0.5 },
    { s: 'bell_toll_large', d: 3390, off: 0.06, r: 2.25, g: -16, len: 1.2, fo: 800, v: 0.5 },
  ] },
  'show.phase:fight': { pri: 3, duck: [-18, 2400], L: [
    { s: 'slam_stone_mining_hit', r: 0.7, g: -3, len: 0.5, dk: 90, v: 0.3 },           // the crack: the strike's edge
    { s: 'book_slam_hard', off: 0.16, r: 0.76, g: 1, len: 0.7, dk: 150, v: 0.4 },
    SUB(-5, 0, 0.8, 200),
    { s: 'bell_toll_funeral', off: 0.08, len: 5, r: 0.82, g: -4, fo: 2500, v: 0.55 },  // the darker bell
    { s: 'clash_metal_heavy_2', d: 20, r: 0.7, g: -6, v: 0.4 },                        // and steel
    { s: 'clash_sword_bright', d: 40, len: 0.8, r: 0.62, g: -14, hp: 500, fo: 400, v: 0.45 },
  ] },
  'show.ready': { pri: 1, L: [
    { s: 'footsteps_stone_walk_loop', len: 1.7, g: -5, fo: 250, v: 0.35 },             // the walk-on
  ] },
  // the start of a try: a high bell with a blade drawn under it (not the phase family)
  'show.bell': { pri: 3, L: [
    { s: 'bell_toll_large', off: 0.06, r: 1.32, g: -3, len: 2.4, fo: 1200, v: 0.55 },
    { s: 'clash_sword_bright', d: 30, len: 0.7, r: 0.85, g: -12, hp: 700, fo: 400, v: 0.45 },
  ] },
  'show.think.made': { pri: 2, cd: 300, L: [
    { s: 'quill_scratch_line', len: 0.35, g: -3, fo: 100, v: 0.2 },                    // the answer struck in
  ] },
  // the end of a try. The landing itself is in the fight (boss.death, agent.death, show.written);
  // this is the toll after it, when the channel calls the result.
  'show.attempt.end:death': { pri: 3, duck: [-12, 3000], L: [
    { s: 'bell_toll_funeral', off: 0.08, r: 0.8, g: -7, len: 5, fo: 2500, v: 0.6 },
  ] },
  'show.written': { pri: 3, duck: [-14, 3500], L: [                                   // the name is finished: the last stroke, the book slams
    { s: 'quill_scratch_fountain_pen_1', len: 1.1, g: -2, fo: 250, v: 0.3 },
    { s: 'book_slam_hard', d: 1000, off: 0.16, r: 0.8, g: 0, len: 0.7, dk: 130, v: 0.4 },
    SUB(-8, 1000, 0.85, 180),
    { s: 'sting_death_gong', d: 1050, len: 5, g: -7, fo: 2000, v: 0.4 },
  ] },
  'show.attempt.end:written': { pri: 2, duck: [-8, 2000], L: [
    { s: 'paper_rustle', off: 1.0, len: 1.4, g: -10, hp: 900, fo: 900, v: 0.3 },        // the page settles
  ] },
  // one toll into the silence after the kill; the peal is the verdict's (it opens ~5 s later,
  // and two peals two seconds apart blurred into one wash)
  'show.attempt.end:kill': { pri: 3, duck: [-24, 6000], L: [
    { s: 'bell_toll_large', d: 1800, off: 0.06, len: 3.2, g: -6, fo: 1500, v: 0.5 },
  ] },
  'show.note': { pri: 1, L: [
    { s: 'quill_scratch_scribble', len: 1.2, g: -6, fo: 300, v: 0.2 },
  ] },
  'show.phase:verdict': { pri: 3, duck: [-12, 3400], L: [
    { s: 'book_slam_hard', off: 0.16, r: 0.72, g: -1, len: 0.7, dk: 160, v: 0.4 },
    { s: 'sting_death_trailer_boom', g: -5, v: 0.5 },
    { s: 'bell_toll_large', off: 0.06, len: 5, r: 0.7, g: -3, fo: 2500, v: 0.55 },     // the deepest toll
    { s: 'bell_cathedral_peal', d: 900, off: 4, len: 6, fi: 600, fo: 2500, g: -10, v: 0.6 },
  ] },
  'show.line': { pri: 1, cd: 400, L: [
    { s: 'paper_page_turn', off: 0.6, len: 0.4, g: -6, hp: 300, v: 0.3 },
  ] },

  'think.start': { pri: 1, cd: 300, L: [
    { s: 'paper_page_turn', off: 0.6, len: 0.6, g: -6, hp: 300, v: 0.4 },              // the panel cut
  ] },
  'think.end': { pri: 1, cd: 300, L: [
    { s: 'whoosh_light_foam_sword', r: 0.7, g: -14, v: 0.3 },                        // time snaps back
  ] },
};

// Events that interrupt an attack: pending te/hit layers are dropped.
export const CANCEL_PENDING = new Set(['boss.stagger', 'boss.phase', 'boss.death', 'match.attempt', 'match.reset', 'agent.death']);

// Sim-time delay (ms) for te/hit layers; null for ordinary layers. `phase` is the boss phase
// (boss.tell carries it; for boss.active pass the phase of the last tell).
export function simDelayMs(l, e, phase = 1) {
  if (l.te == null && l.hit == null) return null;
  const atk = e.attackId && ATTACKS[e.attackId];
  if (!atk) return null;
  const spd = (BOSS.phaseSpeed && BOSS.phaseSpeed[e.phase || phase]) || 1;
  if (l.te != null) return Math.max(0, atk.tell.ms / spd + l.te);
  const h = atk.hits && atk.hits[l.hit];
  return h ? Math.max(0, h.atMs / spd + (l.d || 0)) : -1;
}

// Candidate keys for an event, most specific first:
//   flags      `${type}:guarded|broken|blocked` (a guarded blow, a broken or blocking guard)
//   heavy      `${type}:${q}:${weapon}:heavy`, `${type}:${q}:heavy`
//   weapon     `${type}:${q}:${weapon}` (steel fitted to the fighter's weapon), `${type}:${target}:${kind}`
//   plain      `${type}:${q}`, `${type}`
// where q is the event's attackId, target, kind, spell or charm.
export function cueKeys(e) {
  const keys = [];
  const T = e.type, W = e.weapon;
  const qs = [e.attackId, e.target, e.kind, e.spell, e.charm].filter((q) => q != null);
  for (const f of ['guarded', 'broken', 'blocked']) if (e[f]) keys.push(`${T}:${f}`);
  if (e.heavy) for (const q of qs) { if (W) keys.push(`${T}:${q}:${W}:heavy`); keys.push(`${T}:${q}:heavy`); }
  if (W) for (const q of qs) keys.push(`${T}:${q}:${W}`);
  if (e.target != null && e.kind != null) keys.push(`${T}:${e.target}:${e.kind}`);
  for (const q of qs) keys.push(`${T}:${q}`);
  keys.push(T);
  return keys;
}

export function findCue(e, cues = CUES) {
  for (const k of cueKeys(e)) if (cues[k]) return { key: k, cue: cues[k] };
  return null;
}

const pick = (v, i) => (Array.isArray(v) ? v[i % v.length] : v);
export const dbToGain = (db) => Math.pow(10, db / 20);

// Gain that scales an impulse response (array of channel Float32Arrays) to unit energy per
// channel, so the reverb level is set by MIX.reverb.wetDb alone (browser and offline render).
export function irScale(chans) {
  let e = 0;
  for (const d of chans) for (let i = 0; i < d.length; i++) e += d[i] * d[i];
  e /= Math.max(1, chans.length);
  return e > 0 ? 1 / Math.sqrt(e) : 0;
}

// Resolve one layer for the n-th firing of its cue (deterministic variant cycling). `e`, the
// event, is optional: it feeds the layer's weight (wt / wr), e.g. the damage a blow carried.
export function resolveLayer(l, n, e = null) {
  let w = 0;
  if (l.wt && e && e[l.wt[0]] != null) w = Math.max(0, Math.min(1, (+e[l.wt[0]] - l.wt[1]) / (l.wt[2] - l.wt[1]))) || 0;
  const dr = (l.wr || 0) * w;
  return {
    s: pick(l.s, n),
    gain: dbToGain(pick(l.g ?? 0, n) + (l.wt ? l.wt[3] * w : 0)),
    rate: pick(l.r ?? 1, n) + dr,
    rateEnd: pick(l.re ?? l.r ?? 1, n) + dr,
    delay: (l.te == null && l.hit == null ? (l.d || 0) : 0) / 1000,
    off: l.off || 0,
    len: l.len || 0,
    fi: (l.fi ?? 4) / 1000,
    fo: (l.fo ?? 60) / 1000,
    lp: l.lp || 0,
    hp: l.hp || 0,
    send: l.v || 0,
    dk: (l.dk || 0) / 1000,
  };
}

// Sound ids a cue table needs (to preload).
export function cueSoundIds(cues = CUES) {
  const ids = new Set();
  for (const c of Object.values(cues)) for (const l of c.L) for (const s of [].concat(l.s)) ids.add(s);
  return [...ids];
}

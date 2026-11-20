// The Scrivener's attack table. Owner: tells. Pure data (+ small cue helpers).
//
// Units: ms and world px. All times are UNSCALED attack-local time; phase 2
// plays everything faster by BOSS.phaseSpeed[phase] (boss.js scales).
//
// Schema per attack:
//   id, name (debug only; never shown to agents), phases: [1,2], weight,
//   range: [minDist, maxDist]  center-to-center distance the boss prefers to start it from,
//   cooldownMs,
//   tell: { ms, poseDescription }   poseDescription = purely VISUAL words an observer
//                                   would see. Never the attack name, never mechanics.
//   activeMs      length of the active phase (tell end -> recovery start)
//   recoveryMs    punish window after the active phase
//   hits:   melee hitboxes that follow the boss: { atMs, activeMs, box:{fx0,fx1,y0,y1}, damage, poise, kb, desc }
//           fx = forward distance from boss center along its facing; y = height above floor.
//           poise = poise damage dealt TO THE AGENT (>= 30 knocks it down).
//   spawns: free hazards (projectiles / shockwaves): { atMs, kind, fx, y, w, h, vx (forward), vy, ttl, damage, poise, kb, desc }
//   motion: boss forward velocity segments { atMs, durMs, vx }
//   gust:   { atMs, durMs, push (px/s away from boss), reach }
//   curse:  Written Name: { writeMs, brokenRecoveryMs, det: {...hazard} }
//   storm:  page storm: { startMs, durMs, everyMs, eye, fallFrom, fallSpeed, ... }
//   cue(dist): OPTIONAL fallback estimate (attack-local ms from TELL START until the first
//              threat reaches a target `dist` px away). world.applyDecision normally
//              measures contact by probing the physics instead, so you rarely need it.
//   float: px the boss hovers during active (render + hurtbox)
//
// hit/spawn `desc` is a VISUAL description used in death reflections.
// hit/spawn `style` (optional) picks a strike painter in src/render/attack_fx.js
//   (quill_smear, lunge_streak, geyser, ripple); render only, no effect on the sim.
// Render poses + keyframe tracks per attack live in src/render/boss_pose.js.

export const ATTACKS = {
  // One huge committed sweep (bar: Ten Piedad's arm sweep, ~380 ms tell, long crouched
  // punish). Anticipation: coil -> cock back and strain -> ink star on the nib -> snap.
  // The blade buries itself in the floor and stays there: that is the punish window.
  quill_slash: {
    id: 'quill_slash',
    name: 'Quill Slash',
    phases: [1, 2],
    weight: 4,
    range: [0, 285],
    cooldownMs: 0,
    tell: {
      ms: 450,
      poseDescription:
        'It folds its wings shut down its back and twists away from you, crouching low; its arm and the long white-edged pen-blade are cocked high up and back over its shoulder in one long black diagonal, while its other hand thrusts the black book out toward you; the arm shakes, then a hard star of light flares on the nib.',
    },
    // Strike (round 3): the blade travels a visible arc (over the head 0-50 ms, level at
    // full reach ~118 ms, slammed flat into the floor at ~160 ms) and bites at 138 ms.
    // The far edge (fx1 470) is exactly where the drawn blade buries its tip, and it
    // stays buried there through the recovery: the punish window sits where it landed.
    activeMs: 500, // (agents r2) 380 -> 500: the blade stays buried while the wings strike behind
    recoveryMs: 1350,
    hits: [
      { atMs: 35, activeMs: 50, box: { fx0: 40, fx1: 340, y0: 210, y1: 560 }, damage: 26, poise: 42, kb: 380, style: 'quill_smear',
        desc: 'the pen-blade swinging over its head and down through the air above it' },
      // (r14) render track: crest 30 -> HALFWAY 66 (blade level at you) -> on the floor 98, so a
      // 12 fps strip always catches the blade in the air between the drawn pose and the contact.
      // (r12) bites at 100 ms, when the drawn blade has come down to the floor line (it bit at
      // 82 ms, while the blade was still level at head height: the burst hid an empty contact)
      { atMs: 100, activeMs: 150, box: { fx0: 30, fx1: 470, y0: 0, y1: 200 }, damage: 26, poise: 42, kb: 380, style: 'quill_smear',
        desc: 'one enormous overhead chop of the pen-blade that came down flat along the floor at full reach' },
    ],
    // (agents r2) The wings it swept back in the tell whip down behind it a beat after the
    // chop: the ground BEHIND it erupts. A roll that passes through it and ends at its back
    // is out of i-frames by then, so the answer is to roll in and stop in front of it
    // (or get clear of the 470 px reach early), never to roll through.
    spawns: [
      { atMs: 420, kind: 'shockwave', fx: -118, y: 0, w: 96, h: 230, vx: 0, vy: 0, ttl: 300, damage: 24, poise: 40, kb: 340, style: 'geyser',
        desc: 'its swept-back wings slamming down behind it, ink bursting out of the floor at its back' },
      { atMs: 455, kind: 'shockwave', fx: -222, y: 0, w: 96, h: 200, vx: 0, vy: 0, ttl: 280, damage: 24, poise: 40, kb: 340, style: 'geyser',
        desc: 'its swept-back wings slamming down behind it, ink bursting out of the floor at its back' },
    ],
    motion: [
      { atMs: 0, durMs: 110, vx: 330 },
    ],
    cue: () => 450 + 100,
  },

  // Rear up tall with everything spread, plunge flat and coil, then cross the floor
  // (bar: Ten Piedad's root lunge: rear -> plunge -> ~500 ms -> eruption).
  ink_lunge: {
    id: 'ink_lunge',
    name: 'Ink Lunge',
    phases: [1, 2],
    weight: 3,
    range: [380, 5000],
    cooldownMs: 0,
    tell: {
      ms: 680,
      poseDescription:
        'It rears up to its full height and arches back, wings tucked tight, the black book flung up and out toward you; its other arm and the long white pen-blade are pulled straight back behind its skull in one long level black line trailing far behind it; it rears further, shaking, then locks dead still and a star of light flares where its eyes should be.',
    },
    activeMs: 300,
    recoveryMs: 1250,
    hits: [
      // (r13) fx1 = the spear line's tip in the dash pose (boss_pose lunge_act, ~470 local
      // px x 1.25). It bites once the arm has come forward out of the rear-up (40 ms); the
      // dash is shorter (337 px vs 540) so the whole reach is about what it was (897 vs 905)
      { atMs: 40, activeMs: 215, box: { fx0: -30, fx1: 560, y0: 0, y1: 190 }, damage: 26, poise: 45, kb: 420, style: 'lunge_streak',
        desc: 'a black streak that crossed the floor at you, the blade driven out in front of it like a spear' },
    ],
    motion: [{ atMs: 30, durMs: 225, vx: 1500 }],
    cue: (dist) => 680 + 40 + Math.max(0, dist - 560 - 18) / 1.5,
  },

  // Book thrown straight up -> folded behind the head -> re-extended on its toes ->
  // star on the ledger -> slammed into the floor. Ink geysers burst at both edges of
  // the impact and a ripple runs out both ways (bar: Ten Piedad's arms-up slam).
  ledger_slam: {
    id: 'ledger_slam',
    name: 'Ledger Slam',
    phases: [1, 2],
    weight: 3,
    range: [0, 320],
    cooldownMs: 1500,
    tell: {
      ms: 560,
      poseDescription:
        'It wraps its wings shut around itself like a tall narrow black pillar, throwing a huge black book straight up over its head with both long arms, sinks with the book pressed down onto its skull, then rises again holding it high overhead, swelling, until it locks dead still and the cover flares white with black rays.',
    },
    // Strike (round 3): the book swings forward over the head (0-60 ms) and comes down
    // (60-115 ms) before it bites (112 ms), so the arc is visible; it lands ~260 px out and stays
    // there, cracked into the floor, through the whole recovery.
    activeMs: 460, // (agents r2) 380 -> 460: the second wave wells up behind it before it rises
    recoveryMs: 1450,
    hits: [
      { atMs: 112, activeMs: 140, box: { fx0: -40, fx1: 330, y0: 0, y1: 170 }, damage: 30, poise: 45, kb: 320, style: 'slam_book',
        desc: 'the heavy book coming straight down on you' },
    ],
    spawns: [
      { atMs: 118, kind: 'shockwave', fx: 345, y: 0, w: 46, h: 230, vx: 0, vy: 0, ttl: 300, damage: 22, poise: 30, kb: 260, style: 'geyser',
        desc: 'a column of ink bursting up out of the floor beside the book' },
      { atMs: 118, kind: 'shockwave', fx: -70, y: 0, w: 46, h: 230, vx: 0, vy: 0, ttl: 300, damage: 22, poise: 30, kb: 260, style: 'geyser',
        desc: 'a column of ink bursting up out of the floor behind it' },
      { atMs: 165, kind: 'shockwave', fx: 375, y: 0, w: 70, h: 38, vx: 780, vy: 0, ttl: 820, damage: 14, poise: 18, kb: 200, style: 'ripple',
        desc: 'a low ripple of ink racing along the floor' },
      { atMs: 165, kind: 'shockwave', fx: -100, y: 0, w: 70, h: 38, vx: -780, vy: 0, ttl: 820, damage: 14, poise: 18, kb: 200, style: 'ripple',
        desc: 'a low ripple of ink racing along the floor behind it' },
      // (agents r2) the ink the book drove into the floor wells back out BEHIND it as a second,
      // slower wave: a roll that went through it and ends at its back is caught once the
      // i-frames run out. Inside, in front of the book, is the safe place.
      { atMs: 420, kind: 'shockwave', fx: -92, y: 0, w: 84, h: 46, vx: -560, vy: 0, ttl: 640, damage: 18, poise: 34, kb: 260, style: 'ripple',
        desc: 'a second, heavier wave of ink welling up behind it and rolling out across the floor at its back' },
    ],
    cue: (dist) => 560 + 112 + (dist <= 368 ? 0 : 53 + (dist - 368) / 0.78),
  },

  wing_gust: {
    id: 'wing_gust',
    name: 'Wing Gust',
    phases: [1, 2],
    weight: 2,
    range: [220, 5000],
    cooldownMs: 3500,
    tell: {
      ms: 720,
      poseDescription:
        'It folds in on itself, wings wrapped tight and arms crossed, then flings two tattered black wings open wide behind it, loose feathers lifting like torn paper, and draws in a long breath.',
    },
    activeMs: 1100,
    recoveryMs: 900,
    hits: [],
    gust: { atMs: 0, durMs: 1000, push: 240, reach: 950 },
    spawns: [5, 45, 85, 125].map((y) => (
      { atMs: 150, kind: 'page', fx: 90, y, w: 36, h: 32, vx: 520, vy: 0, ttl: 2600, damage: 18, poise: 22, kb: 160,
        desc: 'a wall of torn pages carried on the wind' })),
    cue: (dist) => 720 + 150 + Math.max(0, dist - 90 - 36) / 0.52,
  },

  written_name: {
    id: 'written_name',
    name: 'Written Name',
    phases: [1, 2],
    weight: 1.25,
    range: [0, 5000],
    cooldownMs: 11000,
    tell: {
      ms: 880,
      poseDescription:
        'It stands tall and holds the black book open up in front of its face, both arms tied up in the page and its body left wide open in front of you, and starts to write in long careful strokes, pen scratching, its eyeless face turned toward you; a ring of wet black ink seeps out on the floor under your feet and slides along with you wherever you go, darkening as the pen nears the end of the line, until the pen lifts, the ring stops dead on the floor and bubbles up.',
    },
    activeMs: 2400 + 380 + 500,
    recoveryMs: 900,
    hits: [],
    curse: {
      writeMs: 2400,
      brokenRecoveryMs: 1150,
      // (tells r9) w 200 -> 150 and the ring locks in place at the eruption (boss.js), so an
      // on-cue roll in any direction leaves the column inside its i-frames
      det: { warnMs: 380, activeMs: 500, w: 150, h: 330, damage: 45, poise: 70, kb: 300,
        desc: 'black ink erupting from the floor beneath you, as if your name had been struck through' },
    },
    cue: () => 880 + 2400 + 380,
  },

  page_storm: {
    id: 'page_storm',
    name: 'Page Storm',
    phases: [2],
    weight: 2.2,
    range: [0, 5000],
    cooldownMs: 12000,
    tell: {
      ms: 1050,
      poseDescription:
        'It rises off the floor with its wings folded tight around its body while the pages of the book tear loose and spiral upward around it.',
    },
    activeMs: 3200,
    recoveryMs: 1250,
    hits: [],
    float: 70,
    storm: { startMs: 200, durMs: 2600, everyMs: 240, perSpawn: 2, aimEvery: 2, eye: 175,
      fallFrom: 520, fallSpeed: 820, w: 44, h: 30, damage: 9, poise: 12, kb: 80,
      desc: 'pages falling like blades from above, everywhere except right beside it' },
    cue: () => 1050 + 200 + 520 / 0.82,
  },
};

export const ATTACK_IDS = Object.keys(ATTACKS);

export function attackTotalMs(atk) {
  return atk.tell.ms + atk.activeMs + atk.recoveryMs;
}

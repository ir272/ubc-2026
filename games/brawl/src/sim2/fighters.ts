// The four robots: physical numbers, all 18 moves each, and the select-screen bars computed from
// the numbers themselves (so they can never drift from what the sim does).
import type { FighterDef, FighterId, Hitbox, MoveDef, MoveId } from './types.ts';

// ------------------------------------------------------------------------------------------------
// Sim-only move data the contract does not carry (motion, grab flags, tethers).
// ------------------------------------------------------------------------------------------------

export interface MoveExtra {
  /** forward speed along facing, m/tick, on frames [from, to] */
  fwd?: [number, number, number];
  /** vertical speed set on frames [from, to] (overrides gravity) */
  up?: [number, number, number];
  /** helpless after the move ends in the air */
  helpless?: boolean;
  /** hitboxes catch instead of strike */
  grabbing?: boolean;
  /** command grab: after the catch the holder waits `delay` ticks then applies `hb` (ignores shields) */
  cmd?: { delay: number; hb: Hitbox; endlag: number };
  /** tether: on frames [from, to] a free ledge within `range` of the hand pulls the fighter to it */
  tether?: { from: number; to: number; range: number; speed: number };
  /** free-aimed flight on frames [from, to] (direction chosen by the controller at start) */
  aimed?: { from: number; to: number; speed: number };
  /** where it can be used */
  air: boolean;
  ground: boolean;
  /** once per airtime when used in the air */
  oncePerAir?: boolean;
}

export const MOVE_EXTRA: Record<FighterId, Partial<Record<MoveId, MoveExtra>>> = { kiln: {}, tick: {}, gantry: {}, vise: {} };

/** global damage scale applied when the data is built (tuned for fight length; the built numbers are the truth) */
const DMG = 0.84;

function hb(from: number, to: number, x: number, y: number, r: number, damage: number, angle: number, bkb: number, kbg: number): Hitbox {
  return { from, to, x, y, r, damage: damage > 0 ? Math.max(1, Math.round(damage * DMG)) : 0, angle, bkb, kbg };
}

type MoveSpec = Omit<MoveDef, 'id'> & { extra?: Partial<MoveExtra> };

const AIR_MOVES: MoveId[] = ['nair', 'fair', 'bair', 'uair', 'dair'];

function build(id: FighterId, specs: Record<MoveId, MoveSpec>): Record<MoveId, MoveDef> {
  const out = {} as Record<MoveId, MoveDef>;
  for (const k of Object.keys(specs) as MoveId[]) {
    const { extra, ...m } = specs[k];
    out[k] = { id: k, ...m };
    const isAir = AIR_MOVES.indexOf(k) >= 0;
    const base: MoveExtra = { air: isAir, ground: !isAir };
    MOVE_EXTRA[id][k] = { ...base, ...(extra || {}) };
  }
  return out;
}

const NO_HB: Hitbox[] = [];

// ------------------------------------------------------------------------------------------------
// Kiln: heavy hitter. Squat foundry robot, furnace chest, piston fists.
// ------------------------------------------------------------------------------------------------

const KILN = build('kiln', {
  jab: { name: 'Slag Tap', kind: 'ground', startup: 4, active: 3, recovery: 15, hitboxes: [hb(5, 7, 1.0, 1.1, 0.5, 4, 361, 22, 40)],
    look: 'Short straight jab with the right piston fist; elbow pumps back, a puff from the wrist vent.' },
  tilt: { name: 'Bellows Shove', kind: 'ground', startup: 9, active: 4, recovery: 21, hitboxes: [hb(10, 13, 1.3, 1.0, 0.6, 11, 35, 30, 95)],
    look: 'Both fists shove forward from the chest like a bellows closing; shoulders hunch, feet planted.' },
  uptilt: { name: 'Chimney Hook', kind: 'ground', startup: 8, active: 5, recovery: 22, hitboxes: [hb(9, 13, 0.45, 2.15, 0.8, 10, 88, 36, 100)],
    look: 'Rising uppercut that sweeps from hip to above the head; chest grate flares on contact frames.' },
  dash: { name: 'Ingot Charge', kind: 'ground', startup: 8, active: 7, recovery: 28, hitboxes: [hb(9, 15, 0.95, 0.9, 0.75, 12, 50, 40, 85)],
    extra: { fwd: [1, 14, 0.12] },
    look: 'Lowers the head and drives the furnace chest forward like a ram, sliding on the soles.' },
  smash: { name: 'Furnace Hammer', kind: 'ground', startup: 17, active: 4, recovery: 36, maxCharge: 50, armor: [6, 17],
    hitboxes: [hb(18, 21, 1.5, 1.0, 0.85, 24, 38, 40, 102)],
    look: 'Winds both fists back over one shoulder (furnace glowing hotter with charge), then hammers them down-forward in an arc.' },
  upsmash: { name: 'Crucible Lift', kind: 'ground', startup: 13, active: 6, recovery: 36, maxCharge: 50,
    hitboxes: [hb(14, 19, 0.3, 2.25, 0.95, 21, 88, 42, 100)],
    look: 'Crouches, then heaves both arms straight up as if lifting a crucible, venting a burst of heat from the shoulders.' },
  nair: { name: 'Ember Spin', kind: 'air', startup: 7, active: 6, recovery: 20, landingLag: 12, hitboxes: [hb(8, 13, 0, 1.0, 1.1, 10, 361, 25, 90)],
    look: 'Tucks and spins once on the spot with both fists out, vents trailing short heat streaks.' },
  fair: { name: 'Ladle Swing', kind: 'air', startup: 16, active: 4, recovery: 24, landingLag: 18,
    hitboxes: [hb(17, 20, 1.0, 0.5, 0.75, 16, 280, 30, 85), hb(17, 20, 1.1, 1.3, 0.55, 13, 45, 30, 85)],
    look: 'Raises one fist high and brings it down in front like pouring a ladle; the low end of the swing spikes.' },
  bair: { name: 'Flue Kick', kind: 'air', startup: 9, active: 4, recovery: 20, landingLag: 14, hitboxes: [hb(10, 13, -1.1, 1.0, 0.7, 14, 145, 30, 95)],
    look: 'Mule kick straight backward with both stubby legs, exhaust flaps open at the heels.' },
  uair: { name: 'Flue Swat', kind: 'air', startup: 7, active: 5, recovery: 18, landingLag: 12, hitboxes: [hb(8, 12, 0.2, 2.1, 0.75, 12, 85, 30, 95)],
    look: 'Overhead backhand swat in a half circle above the head.' },
  dair: { name: 'Pour Stomp', kind: 'air', startup: 14, active: 4, recovery: 26, landingLag: 24, hitboxes: [hb(15, 18, 0, -0.1, 0.75, 17, 270, 30, 90)],
    look: 'Draws the knees up then stamps both feet straight down, molten glow under the soles.' },
  grab: { name: 'Tong Grip', kind: 'grab', startup: 8, active: 3, recovery: 34, hitboxes: [hb(9, 11, 1.0, 1.0, 0.6, 0, 0, 0, 0)],
    extra: { grabbing: true },
    look: 'Both fists open into tongs and snap shut in front of the chest.' },
  throwf: { name: 'Kiln Toss', kind: 'throw', startup: 12, active: 1, recovery: 20, hitboxes: [hb(13, 13, 1, 1, 0.5, 9, 40, 60, 70)],
    look: 'Lifts the opponent to chest height and shot-puts them forward with a piston punch.' },
  throwb: { name: 'Backfire Heave', kind: 'throw', startup: 16, active: 1, recovery: 22, hitboxes: [hb(17, 17, 1, 1, 0.5, 12, 140, 58, 100)],
    look: 'Turns at the waist and hurls the opponent behind, the furnace door blowing open with the effort.' },
  throwu: { name: 'Chimney Launch', kind: 'throw', startup: 14, active: 1, recovery: 20, hitboxes: [hb(15, 15, 1, 1, 0.5, 9, 90, 70, 62)],
    look: 'Holds the opponent over the chest vent and blasts them straight up on a column of heat.' },
  special: { name: 'Blast Furnace', kind: 'special', startup: 24, active: 6, recovery: 36, armor: [6, 24],
    hitboxes: [hb(25, 30, 1.45, 1.0, 1.15, 24, 40, 45, 100)],
    projectile: { frame: 26, kind: 'slag', vx: 0.17, vy: 0, gravity: 0, life: 40, r: 0.42, damage: 5, angle: 35, bkb: 34, kbg: 50 },
    extra: { air: true, ground: true },
    look: 'Braces, the chest furnace door swings open and glows white, then belches a short wide cone of fire forward that throws a glob of molten slag on across the deck. Armoured while it builds.' },
  special2: { name: 'Ram Piston', kind: 'special', startup: 12, active: 8, recovery: 26, armor: [1, 12],
    hitboxes: [hb(13, 20, 1.0, 1.0, 0.75, 13, 35, 40, 80)],
    extra: { fwd: [10, 20, 0.28], air: true, ground: true, oncePerAir: true },
    look: 'Cocks one arm and fires the piston fist forward, the whole body lunging behind it; steam jets from the elbow.' },
  recover: { name: 'Thermal Rise', kind: 'special', startup: 6, active: 14, recovery: 20, armor: [3, 20],
    hitboxes: [hb(7, 14, 0, 1.0, 1.0, 10, 80, 50, 60)],
    extra: { up: [7, 22, 0.25], fwd: [7, 22, 0.035], helpless: true, air: true, ground: true },
    look: 'Feet vents ignite and Kiln rises on a short column of flame, fists up, slow and armoured.' },
});

// ------------------------------------------------------------------------------------------------
// Tick: fast and light. Small clockwork sprinter, blade antennae.
// ------------------------------------------------------------------------------------------------

const TICK = build('tick', {
  jab: { name: 'Tock Tap', kind: 'ground', startup: 2, active: 2, recovery: 14, hitboxes: [hb(3, 4, 0.65, 0.75, 0.42, 3, 361, 18, 30)],
    look: 'Quick flick of one blade-hand, like a clock hand ticking forward one notch.' },
  tilt: { name: 'Escapement Kick', kind: 'ground', startup: 5, active: 3, recovery: 18, hitboxes: [hb(6, 8, 0.9, 0.6, 0.45, 6, 30, 25, 80)],
    look: 'Snappy forward kick, the leg locks out with a visible click.' },
  uptilt: { name: 'Hand Sweep', kind: 'ground', startup: 5, active: 4, recovery: 17, hitboxes: [hb(6, 9, 0.3, 1.45, 0.62, 4, 95, 55, 62)],
    look: 'Sweeps one arm overhead from front to back like a minute hand, sparks off the antennae.' },
  dash: { name: 'Wind-up Dash', kind: 'ground', startup: 5, active: 8, recovery: 18, hitboxes: [hb(6, 13, 0.6, 0.6, 0.55, 7, 70, 42, 60)],
    extra: { fwd: [1, 12, 0.17] },
    look: 'Dives forward head first with the key on its back spinning, antennae swept back.' },
  smash: { name: 'Mainspring Lash', kind: 'ground', startup: 11, active: 3, recovery: 26, maxCharge: 50, hitboxes: [hb(12, 14, 1.05, 0.7, 0.55, 13, 38, 30, 90)],
    look: 'Coils the body back (spring winding audibly with charge) and uncoils into a lashing double kick.' },
  upsmash: { name: 'Pendulum Flick', kind: 'ground', startup: 9, active: 7, recovery: 28, maxCharge: 50, hitboxes: [hb(9, 16, 0.1, 1.6, 0.78, 12, 88, 32, 90)],
    look: 'Handstand flip that swings both legs overhead like a pendulum.' },
  nair: { name: 'Gear Whirl', kind: 'air', startup: 3, active: 10, recovery: 12, landingLag: 11,
    hitboxes: [hb(4, 7, 0, 0.7, 0.78, 6, 361, 20, 62), hb(8, 13, 0, 0.7, 0.66, 4, 361, 12, 60)],
    look: 'Curls into a ball and spins like a gear, blades out; strong at the start, weaker after.' },
  fair: { name: 'Second Hand', kind: 'air', startup: 5, active: 4, recovery: 12, landingLag: 12, hitboxes: [hb(6, 9, 0.75, 0.7, 0.52, 7, 62, 26, 70)],
    look: 'A fast forward slash with one blade-hand in a short arc, like a hand sweeping past the twelve.' },
  bair: { name: 'Recoil Kick', kind: 'air', startup: 6, active: 3, recovery: 14, landingLag: 13, hitboxes: [hb(7, 9, -0.8, 0.7, 0.52, 9, 145, 26, 85)],
    look: 'Back kick with both feet, the body jolting forward from the recoil.' },
  uair: { name: 'Antenna Snip', kind: 'air', startup: 4, active: 5, recovery: 12, landingLag: 12, hitboxes: [hb(5, 9, 0.1, 1.5, 0.62, 6, 82, 30, 75)],
    look: 'Head flick upward, the blade antennae scissor shut above it.' },
  dair: { name: 'Pin Drill', kind: 'air', startup: 6, active: 12, recovery: 14, landingLag: 12,
    hitboxes: [hb(7, 8, 0, -0.1, 0.5, 2, 280, 10, 20), hb(11, 12, 0, -0.1, 0.5, 2, 280, 10, 20), hb(15, 18, 0, 0, 0.55, 4, 70, 36, 60)],
    look: 'Points both feet down and spins like a drill bit, finishing with a kick that pops upward.' },
  grab: { name: 'Quick Catch', kind: 'grab', startup: 7, active: 2, recovery: 30, hitboxes: [hb(8, 9, 0.72, 0.7, 0.45, 0, 0, 0, 0)],
    extra: { grabbing: true },
    look: 'Darts both hands out and snaps them shut, a click from the wrist gears.' },
  throwf: { name: 'Ratchet Toss', kind: 'throw', startup: 8, active: 1, recovery: 16, hitboxes: [hb(9, 9, 1, 1, 0.5, 6, 45, 55, 50)],
    look: 'Cranks the opponent in a quick half turn and lets go forward.' },
  throwb: { name: 'Rewind Throw', kind: 'throw', startup: 10, active: 1, recovery: 18, hitboxes: [hb(11, 11, 1, 1, 0.5, 8, 140, 55, 66)],
    look: 'Runs a tiny circle around the opponent, winding them, and flings them behind.' },
  throwu: { name: 'Chime Pop', kind: 'throw', startup: 9, active: 1, recovery: 14, hitboxes: [hb(10, 10, 1, 1, 0.5, 5, 90, 62, 40)],
    look: 'Hops under the opponent and headbutts them straight up, antennae ringing.' },
  special: { name: 'Overclock Dart', kind: 'special', startup: 8, active: 16, recovery: 28,
    hitboxes: [hb(9, 10, 0.45, 0.7, 0.6, 2, 45, 12, 8), hb(12, 13, 0.45, 0.7, 0.6, 2, 45, 12, 8), hb(15, 16, 0.45, 0.7, 0.6, 2, 45, 12, 8),
      hb(18, 19, 0.45, 0.7, 0.6, 2, 45, 12, 8), hb(21, 24, 0.6, 0.7, 0.66, 5, 40, 46, 75)],
    extra: { fwd: [8, 23, 0.22], air: true, ground: true, oncePerAir: true },
    look: 'Overclocks: gears whine up, then it darts forward in a blur, slashing four times and ending with a spinning kick.' },
  special2: { name: 'Spring Hop', kind: 'special', startup: 5, active: 6, recovery: 16, hitboxes: [hb(6, 11, 0.5, 1.0, 0.58, 7, 80, 42, 55)],
    extra: { up: [5, 10, 0.2], fwd: [5, 10, 0.08], air: true, ground: true, oncePerAir: true },
    look: 'A coiled spring pops out of its heel and launches it into a rising knee.' },
  recover: { name: 'Unwind', kind: 'special', startup: 5, active: 24, recovery: 14, hitboxes: [hb(6, 10, 0, 0.7, 0.62, 3, 70, 40, 40)],
    extra: { aimed: { from: 6, to: 29, speed: 0.29 }, helpless: true, air: true, ground: true },
    look: 'The key on its back spins free and it shoots along a straight line in a blur of unwinding spring.' },
});

// ------------------------------------------------------------------------------------------------
// Gantry: long reach. Tall thin crane robot, telescoping arm, rivet gun.
// ------------------------------------------------------------------------------------------------

const GANTRY = build('gantry', {
  jab: { name: 'Boom Poke', kind: 'ground', startup: 4, active: 3, recovery: 14, hitboxes: [hb(5, 7, 1.4, 1.4, 0.42, 4, 30, 25, 40)],
    look: 'The arm telescopes out one section in a quick poke and snaps back.' },
  tilt: { name: 'Jib Reach', kind: 'ground', startup: 7, active: 3, recovery: 18,
    hitboxes: [hb(8, 10, 2.25, 1.2, 0.45, 11, 25, 30, 85), hb(8, 10, 1.45, 1.2, 0.4, 9, 30, 30, 70)],
    look: 'Leans forward and fully extends the jib arm level at chest height, the hook tip doing the damage.' },
  uptilt: { name: 'Hoist Swing', kind: 'ground', startup: 7, active: 6, recovery: 20, hitboxes: [hb(8, 13, 0.6, 2.6, 0.62, 10, 95, 40, 80)],
    look: 'Swings the extended arm up through a wide arc overhead like a crane boom raising.' },
  dash: { name: 'Trolley Run', kind: 'ground', startup: 8, active: 6, recovery: 24, hitboxes: [hb(9, 14, 1.25, 1.0, 0.62, 11, 55, 40, 75)],
    extra: { fwd: [1, 15, 0.12] },
    look: 'Slides forward on its heels with the arm thrust out low like a trolley hook.' },
  smash: { name: 'Wrecking Swing', kind: 'ground', startup: 16, active: 4, recovery: 34, maxCharge: 50,
    hitboxes: [hb(17, 20, 2.35, 1.1, 0.72, 20, 35, 38, 100), hb(17, 20, 1.35, 1.1, 0.55, 16, 40, 30, 92)],
    look: 'Lets the arm out on its cable and whirls a heavy hook in a flat arc, the tip hits hardest.' },
  upsmash: { name: 'Mast Raise', kind: 'ground', startup: 11, active: 6, recovery: 32, maxCharge: 50, hitboxes: [hb(12, 17, 0.2, 3.0, 0.8, 18, 90, 38, 97)],
    look: 'Telescopes the whole body taller and drives the arm straight up like a mast being stepped.' },
  nair: { name: 'Cable Spin', kind: 'air', startup: 6, active: 8, recovery: 18, landingLag: 11, hitboxes: [hb(7, 14, 0, 1.2, 1.25, 9, 361, 25, 82)],
    look: 'Spins horizontally with the cable let out, the hook circling the body.' },
  fair: { name: 'Boom Sweep', kind: 'air', startup: 8, active: 4, recovery: 18, landingLag: 12,
    hitboxes: [hb(9, 12, 1.95, 1.1, 0.5, 12, 40, 32, 92), hb(9, 12, 1.15, 1.1, 0.45, 10, 45, 30, 82)],
    look: 'Sweeps the extended arm downward in front from high to low.' },
  bair: { name: 'Counterweight', kind: 'air', startup: 9, active: 4, recovery: 20, landingLag: 13, hitboxes: [hb(10, 13, -1.3, 1.0, 0.68, 15, 145, 30, 97)],
    look: 'Swings the heavy counterweight block on its back out behind like a pendulum.' },
  uair: { name: 'Hook Lift', kind: 'air', startup: 7, active: 6, recovery: 18, landingLag: 11, hitboxes: [hb(8, 13, 0.3, 2.65, 0.62, 11, 85, 30, 92)],
    look: 'Raises the hook straight overhead and twists it.' },
  dair: { name: 'Stake Drive', kind: 'air', startup: 12, active: 4, recovery: 22, landingLag: 18, hitboxes: [hb(13, 16, 0.1, -0.6, 0.56, 15, 275, 28, 87)],
    look: 'Drives the arm straight down under itself like a stake, the hook spikes.' },
  grab: { name: 'Hook Grab', kind: 'grab', startup: 9, active: 3, recovery: 36, hitboxes: [hb(10, 12, 1.65, 1.0, 0.5, 0, 0, 0, 0), hb(10, 12, 0.7, 1.0, 0.5, 0, 0, 0, 0)],
    extra: { grabbing: true },
    look: 'Shoots the hook out on the cable and reels in whatever it catches.' },
  throwf: { name: 'Cargo Sling', kind: 'throw', startup: 12, active: 1, recovery: 20, hitboxes: [hb(13, 13, 1, 1, 0.5, 9, 40, 60, 65)],
    look: 'Hoists the opponent up on the hook and slings them forward like loose cargo.' },
  throwb: { name: 'Swing Out', kind: 'throw', startup: 14, active: 1, recovery: 22, hitboxes: [hb(15, 15, 1, 1, 0.5, 10, 140, 60, 76)],
    look: 'Swings the opponent around in a full circle on the cable and releases behind.' },
  throwu: { name: 'Crane Lift', kind: 'throw', startup: 12, active: 1, recovery: 20, hitboxes: [hb(13, 13, 1, 1, 0.5, 8, 90, 70, 56)],
    look: 'Lifts the opponent high overhead on the boom and flicks them up.' },
  special: { name: 'Rivet Shot', kind: 'special', startup: 14, active: 2, recovery: 20, hitboxes: NO_HB,
    projectile: { frame: 15, kind: 'rivet', vx: 0.3, vy: 0, gravity: 0, life: 38, r: 0.28, damage: 4, angle: 25, bkb: 26, kbg: 36 },
    extra: { air: true, ground: true },
    look: 'Raises the rivet gun on the forearm, braces, and fires a glowing hot rivet straight ahead with a kick of recoil.' },
  special2: { name: 'Ballast Swing', kind: 'special', startup: 22, active: 5, recovery: 34, hitboxes: [hb(23, 27, 2.4, 0.8, 0.82, 18, 40, 42, 100)],
    look: 'Unhooks a ballast weight, lets it out at full cable length and swings it low through a slow heavy arc.' },
  recover: { name: 'Grapple Line', kind: 'special', startup: 8, active: 24, recovery: 16, hitboxes: [hb(10, 14, 1.5, 2.0, 0.5, 6, 60, 40, 40)],
    extra: { up: [4, 12, 0.16], tether: { from: 10, to: 30, range: 6.2, speed: 0.38 }, helpless: true, air: true, ground: true },
    look: 'Fires the hook at the ledge on a taut line and winches itself up to it.' },
});

// ------------------------------------------------------------------------------------------------
// Vise: grappler. Wide shoulders, huge clamp hands.
// ------------------------------------------------------------------------------------------------

const VISE = build('vise', {
  jab: { name: 'Clamp Jab', kind: 'ground', startup: 4, active: 2, recovery: 14, hitboxes: [hb(5, 6, 0.9, 1.1, 0.48, 4, 361, 20, 40)],
    look: 'Short jab with a half-closed clamp, the jaws clack.' },
  tilt: { name: 'Jaw Shove', kind: 'ground', startup: 7, active: 4, recovery: 19, hitboxes: [hb(8, 11, 1.1, 1.0, 0.52, 9, 32, 30, 90)],
    look: 'Shoves forward with an open clamp, palm first.' },
  uptilt: { name: 'Overhead Pinch', kind: 'ground', startup: 7, active: 5, recovery: 18, hitboxes: [hb(8, 12, 0.4, 2.1, 0.68, 8, 92, 40, 85)],
    look: 'Both clamps snap shut over the head in a quick pinch.' },
  dash: { name: 'Shoulder Rush', kind: 'ground', startup: 7, active: 8, recovery: 24, hitboxes: [hb(8, 15, 0.85, 1.1, 0.68, 10, 45, 40, 75)],
    extra: { fwd: [1, 14, 0.12] },
    look: 'Drops a huge shoulder and barges forward like a linebacker.' },
  smash: { name: 'Hydraulic Clap', kind: 'ground', startup: 16, active: 3, recovery: 34, maxCharge: 50, hitboxes: [hb(17, 19, 1.25, 1.1, 0.72, 20, 38, 38, 98)],
    look: 'Spreads both clamps wide (hydraulics hissing with charge) then claps them together in front.' },
  upsmash: { name: 'Jack Lift', kind: 'ground', startup: 12, active: 6, recovery: 32, maxCharge: 50, hitboxes: [hb(13, 18, 0.3, 2.3, 0.82, 18, 88, 36, 95)],
    look: 'Squats and jacks both clamps straight up, the body extending like a hydraulic jack.' },
  nair: { name: 'Hull Press', kind: 'air', startup: 5, active: 6, recovery: 18, landingLag: 11, hitboxes: [hb(6, 11, 0, 1.0, 1.0, 9, 361, 25, 85)],
    look: 'Spreads arms and body flat like a closing press plate.' },
  fair: { name: 'Clamp Swipe', kind: 'air', startup: 9, active: 4, recovery: 20, landingLag: 13, hitboxes: [hb(10, 13, 1.05, 1.0, 0.62, 11, 45, 30, 90)],
    look: 'Backhand swipe in front with an open clamp.' },
  bair: { name: 'Elbow Piston', kind: 'air', startup: 8, active: 3, recovery: 20, landingLag: 12, hitboxes: [hb(9, 11, -1.05, 1.0, 0.62, 13, 145, 30, 95)],
    look: 'Fires an elbow straight back on a hydraulic piston.' },
  uair: { name: 'Scissor Snap', kind: 'air', startup: 7, active: 5, recovery: 18, landingLag: 11, hitboxes: [hb(8, 12, 0.2, 2.1, 0.66, 10, 85, 30, 90)],
    look: 'Both clamps scissor above the head.' },
  dair: { name: 'Press Drop', kind: 'air', startup: 12, active: 6, recovery: 22, landingLag: 20, hitboxes: [hb(13, 18, 0, -0.2, 0.72, 13, 270, 25, 80)],
    look: 'Locks both clamps together below and drops like a press ram.' },
  grab: { name: 'Wide Clamp', kind: 'grab', startup: 7, active: 3, recovery: 34, hitboxes: [hb(8, 10, 1.2, 1.0, 0.7, 0, 0, 0, 0), hb(8, 10, 0.6, 1.0, 0.5, 0, 0, 0, 0)],
    extra: { grabbing: true },
    look: 'Throws both huge clamps forward wide open and shuts them, a long reach.' },
  throwf: { name: 'Bench Throw', kind: 'throw', startup: 10, active: 1, recovery: 18, hitboxes: [hb(11, 11, 1, 1, 0.5, 10, 42, 60, 76)],
    look: 'Presses the opponent overhead like a bench press and pushes them away.' },
  throwb: { name: 'Crusher Spin', kind: 'throw', startup: 20, active: 1, recovery: 24, hitboxes: [hb(21, 21, 1, 1, 0.5, 13, 140, 60, 104)],
    look: 'Locks the opponent in both clamps, spins twice like a car crusher turntable and hurls them behind.' },
  throwu: { name: 'Lift Toss', kind: 'throw', startup: 12, active: 1, recovery: 18, hitboxes: [hb(13, 13, 1, 1, 0.5, 9, 88, 65, 70)],
    look: 'Hoists the opponent with straight arms and tosses them straight up.' },
  special: { name: 'Lunge Clamp', kind: 'special', startup: 12, active: 5, recovery: 32, hitboxes: [hb(13, 17, 1.05, 1.0, 0.78, 0, 0, 0, 0)],
    extra: { grabbing: true, fwd: [6, 16, 0.2], cmd: { delay: 16, hb: hb(1, 1, 1, 1, 0.5, 13, 48, 66, 78), endlag: 14 } },
    look: 'Lunges forward with both clamps wide; if they shut on someone, lifts and slams them into the deck. Goes straight through a shield.' },
  special2: { name: 'Torque Spin', kind: 'special', startup: 6, active: 14, recovery: 22,
    hitboxes: [hb(7, 9, 0, 1.0, 1.1, 3, 361, 20, 20), hb(12, 14, 0, 1.0, 1.1, 3, 361, 20, 20), hb(17, 20, 0, 1.0, 1.15, 6, 45, 50, 80)],
    extra: { air: true, ground: true, oncePerAir: true },
    look: 'Spins on the spot with both arms out, clamps open like a torque wrench, three strikes.' },
  recover: { name: 'Clamp Climb', kind: 'special', startup: 5, active: 20, recovery: 18, hitboxes: [hb(6, 12, 0.5, 1.8, 0.7, 9, 80, 45, 70)],
    extra: { up: [6, 24, 0.24], fwd: [6, 24, 0.05], helpless: true, air: true, ground: true },
    look: 'Reaches up and climbs the air hand over hand with the clamps, rising steeply, hitting on the way up.' },
});

// ------------------------------------------------------------------------------------------------
// Bodies
// ------------------------------------------------------------------------------------------------

type Body = Omit<FighterDef, 'stats' | 'moves'>;

const BODIES: Record<FighterId, Body> = {
  kiln: { id: 'kiln', name: 'Kiln', role: 'Heavy hitter', blurb: 'Slow foundry brawler. Armoured swings that end lives early.',
    width: 1.2, height: 1.9, weight: 112, walkSpeed: 0.075, runSpeed: 0.16, airSpeed: 0.09, airAccel: 0.0046,
    gravity: 0.017, fallSpeed: 0.21, fastFallSpeed: 0.3, jumpSpeed: 0.3, shortHopSpeed: 0.19, doubleJumpSpeed: 0.29,
    airJumps: 1, jumpsquat: 4, traction: 0.02 },
  tick: { id: 'tick', name: 'Tick', role: 'Fast and light', blurb: 'Clockwork sprinter. Fastest on the deck, quick strings, flies far.',
    width: 0.75, height: 1.35, weight: 84, walkSpeed: 0.1, runSpeed: 0.215, airSpeed: 0.12, airAccel: 0.007,
    gravity: 0.019, fallSpeed: 0.23, fastFallSpeed: 0.34, jumpSpeed: 0.31, shortHopSpeed: 0.2, doubleJumpSpeed: 0.3,
    airJumps: 2, jumpsquat: 3, traction: 0.032 },
  gantry: { id: 'gantry', name: 'Gantry', role: 'Long reach', blurb: 'Crane on legs. Rivets and a long arm keep you out.',
    width: 0.8, height: 2.2, weight: 102, walkSpeed: 0.085, runSpeed: 0.185, airSpeed: 0.1, airAccel: 0.0055,
    gravity: 0.0145, fallSpeed: 0.19, fastFallSpeed: 0.27, jumpSpeed: 0.29, shortHopSpeed: 0.185, doubleJumpSpeed: 0.285,
    airJumps: 1, jumpsquat: 5, traction: 0.022 },
  vise: { id: 'vise', name: 'Vise', role: 'Grappler', blurb: 'Huge clamps. Grabs from far, throws that finish fights.',
    width: 1.3, height: 2.0, weight: 106, walkSpeed: 0.09, runSpeed: 0.18, airSpeed: 0.09, airAccel: 0.005,
    gravity: 0.016, fallSpeed: 0.205, fastFallSpeed: 0.29, jumpSpeed: 0.295, shortHopSpeed: 0.185, doubleJumpSpeed: 0.285,
    airJumps: 1, jumpsquat: 4, traction: 0.022 },
};

const MOVES: Record<FighterId, Record<MoveId, MoveDef>> = { kiln: KILN, tick: TICK, gantry: GANTRY, vise: VISE };

/** per-fighter damage trim (balance), applied once to the built hitboxes */
const TRIM: Partial<Record<FighterId, number>> = { tick: 1.27, kiln: 1, gantry: 0.94, vise: 1.05 };
for (const id of Object.keys(TRIM) as FighterId[]) for (const m of Object.values(MOVES[id])) for (const h of m.hitboxes) if (h.damage > 0) h.damage = Math.max(1, Math.round(h.damage * TRIM[id]!));

// ------------------------------------------------------------------------------------------------
// Select-screen bars, computed from the numbers.
// ------------------------------------------------------------------------------------------------

/** knockback a hitbox deals to a 100 kg target that is at `pct` before the hit (formula as in the engine) */
export function kbAt(h: Hitbox, pct: number, weight: number): number {
  const p = pct + h.damage;
  return ((p / 10 + (p * h.damage) / 20) * (200 / (weight + 100)) * 1.4 + 18) * (h.kbg / 100) + h.bkb;
}

function bestKb(m: MoveDef, pct: number): number {
  let best = 0;
  for (const h of m.hitboxes) best = Math.max(best, kbAt(h, pct, 100));
  return best;
}

function frontReach(m: MoveDef): number {
  let best = 0;
  for (const h of m.hitboxes) if (h.damage > 0 || m.kind === 'grab') best = Math.max(best, h.x + h.r);
  return best;
}

function bar(v: number, lo: number, hi: number): number {
  const t = (v - lo) / (hi - lo);
  return Math.max(1, Math.min(5, 1 + Math.round(t * 4)));
}

/** the raw numbers behind each bar (also printed by the batch tool) */
export function statNumbers(id: FighterId) {
  const b = BODIES[id];
  const m = MOVES[id];
  // power: mean knockback of the three finishers on a 100 kg target at 90%
  const power = (bestKb(m.smash, 90) + bestKb(m.upsmash, 90) + Math.max(bestKb(m.special, 90), bestKb(m.special2, 90))) / 3;
  // speed: run + air speed in m/s, minus a little for slow jab/tilt startup
  const speed = (b.runSpeed + b.airSpeed) * 60 - (m.jab.startup + m.tilt.startup) * 0.08;
  // reach: furthest front strike among ground pokes, metres from the feet
  const reach = Math.max(frontReach(m.jab), frontReach(m.tilt), frontReach(m.smash), frontReach(m.special2), m.special.projectile ? 3.2 : 0);
  // grab: grab reach (a command grab counts with half its lunge) plus the best throw's knockback at 90% (scaled)
  const cmd = MOVE_EXTRA[id].special?.cmd;
  const throwKb = Math.max(bestKb(m.throwf, 90), bestKb(m.throwb, 90), bestKb(m.throwu, 90), cmd ? kbAt(cmd.hb, 90, 100) : 0);
  let lunge = 0;
  const fw = MOVE_EXTRA[id].special?.fwd;
  if (fw) lunge = (fw[1] - fw[0] + 1) * fw[2] * 0.5;
  let cmdReach = 0;
  if (cmd) for (const h of m.special.hitboxes) cmdReach = Math.max(cmdReach, h.x + h.r);
  const grabReach = Math.max(frontReach(m.grab), cmd ? cmdReach + lunge : 0);
  const grab = grabReach + throwKb / 100;
  return { power, speed, reach, weight: b.weight, grab };
}

function statsFor(id: FighterId) {
  const n = statNumbers(id);
  return {
    power: bar(n.power, 105, 210),
    speed: bar(n.speed, 13.5, 20),
    reach: bar(n.reach, 1.5, 3.2),
    weight: bar(n.weight, 78, 124),
    grab: bar(n.grab, 2.2, 4.4),
  };
}

export const FIGHTERS: Record<FighterId, FighterDef> = {
  kiln: { ...BODIES.kiln, stats: statsFor('kiln'), moves: KILN },
  tick: { ...BODIES.tick, stats: statsFor('tick'), moves: TICK },
  gantry: { ...BODIES.gantry, stats: statsFor('gantry'), moves: GANTRY },
  vise: { ...BODIES.vise, stats: statsFor('vise'), moves: VISE },
};

export function moveExtra(f: FighterId, m: MoveId): MoveExtra {
  return MOVE_EXTRA[f][m] as MoveExtra;
}

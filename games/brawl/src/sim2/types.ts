// Ringout fight simulation: the contract.
//
// Everything in src/sim is pure: no imports from outside src/sim, no Date, no Math.random, no DOM,
// no node APIs. Only + - * / Math.sqrt Math.abs Math.min Math.max Math.floor Math.round Math.sign
// on numbers (no Math.sin/cos/atan2/pow/exp/log: they may differ between JS engines; use the
// helpers in the sim's own math file). The same header and the same plans at the same ticks must
// give bit-identical fights in node and in any browser.
//
// World: x to the right, y up, units are metres. A fighter's (x, y) is the point between its feet.
// One tick is 1/60 s. All durations in the sim are in ticks.

export const TICK_HZ = 60;
export const COACH_PERIOD = 180; // ticks between plan boundaries (3 s)

export type Side = 0 | 1;
export type FighterId = 'kiln' | 'tick' | 'gantry' | 'vise' | 'hexer' | 'mimic';
export const FIGHTER_IDS: FighterId[] = ['kiln', 'tick', 'gantry', 'vise', 'hexer', 'mimic'];

// ------------------------------------------------------------------------------------------------
// The mind's side: a game plan. This is all a model (or a mock coach) can say during a fight.
// ------------------------------------------------------------------------------------------------

export type Stance = 'rush' | 'keepaway' | 'bait' | 'wall';
export const STANCES: Stance[] = ['rush', 'keepaway', 'bait', 'wall'];

export interface Plan {
  stance: Stance;
  /** 0 = patient, 1 = all in */
  aggression: number;
  range: 'close' | 'mid' | 'far';
  /** 0 = all strikes, 1 = all grabs */
  grabMix: number;
  /** off-stage play when the opponent is recovering: chase deep, hold the ledge, or stay on stage */
  edge: 'deep' | 'ledge' | 'stage';
  /** own recovery habit */
  recover: 'high' | 'low' | 'mix';
  /** one-time order, consumed when carried out or when the next plan arrives */
  order: 'none' | 'special' | 'kill';
  /** shown to viewers, 8 words at most */
  read: string;
}

export const DEFAULT_PLAN: Plan = {
  stance: 'bait',
  aggression: 0.5,
  range: 'mid',
  grabMix: 0.25,
  edge: 'ledge',
  recover: 'mix',
  order: 'none',
  read: '',
};

/** A plan scheduled to take effect when state.tick === tick. */
export interface PlanAt {
  side: Side;
  tick: number;
  plan: Plan;
}

// ------------------------------------------------------------------------------------------------
// Fighters and moves (static data, read by the renderer too)
// ------------------------------------------------------------------------------------------------

export type MoveId =
  // ground
  | 'jab' | 'tilt' | 'uptilt' | 'dash' | 'smash' | 'upsmash'
  // air
  | 'nair' | 'fair' | 'bair' | 'uair' | 'dair'
  // grab game
  | 'grab' | 'throwf' | 'throwb' | 'throwu'
  // specials: `special` is the fighter's signature tool, `special2` its second, `recover` its up special
  | 'special' | 'special2' | 'recover';

export const MOVE_IDS: MoveId[] = [
  'jab', 'tilt', 'uptilt', 'dash', 'smash', 'upsmash',
  'nair', 'fair', 'bair', 'uair', 'dair',
  'grab', 'throwf', 'throwb', 'throwu',
  'special', 'special2', 'recover',
];

export interface Hitbox {
  /** active on move frames [from, to], 1-based, inclusive */
  from: number;
  to: number;
  /** centre relative to the feet point; +x is the facing direction */
  x: number;
  y: number;
  r: number;
  damage: number;
  /** launch angle in degrees: 0 = straight forward, 90 = up, 270 = down (spike), 361 = "sakurai" auto angle */
  angle: number;
  /** base knockback and knockback growth (the usual platform fighter formula, see engine) */
  bkb: number;
  kbg: number;
  /** a stagger instead of a launch: 'snare' roots the one hit for effectTicks (no knockback; a shield blocks it) */
  effect?: 'snare';
  effectTicks?: number;
}

export interface MoveDef {
  id: MoveId;
  /** our own display name, e.g. "Piston Driver" */
  name: string;
  kind: 'ground' | 'air' | 'grab' | 'throw' | 'special';
  /** frames before the first active frame, frames active, frames after. total = startup + active + recovery */
  startup: number;
  active: number;
  recovery: number;
  hitboxes: Hitbox[];
  /** air moves: landing lag in ticks if the fighter lands mid-move */
  landingLag?: number;
  /** smash attacks: max extra charge ticks */
  maxCharge?: number;
  /** frames [from, to] with super armour (takes damage, no flinch) */
  armor?: [number, number];
  /** spawns a projectile on this frame */
  projectile?: {
    frame: number; kind: string; vx: number; vy: number; gravity: number; life: number; r: number; damage: number; angle: number; bkb: number; kbg: number;
    /** spawn height above the feet (default 0.62 of the body height); a floor wave spawns low */
    y?: number;
    /** a fan: several shots, one per velocity (+x along facing), `delay` ticks after `frame` (default 0); replaces vx and vy */
    fan?: { vx: number; vy: number; delay?: number }[];
    /** how many shots of one fan may land (default 1; the rest are spent once that many have landed or been blocked) */
    fanHits?: number;
    /** on hit: 'pull' drags the target to the owner and holds it (then the move's command slam); 'snare' roots it for effectTicks */
    effect?: 'pull' | 'snare';
    effectTicks?: number;
    /** becomes a floor hazard when it touches a floor and stays `linger` ticks; a snare hazard springs once, a burn hazard hits every `every` ticks */
    linger?: number;
    every?: number;
    /** half-width of the hazard on the floor (default r) */
    floorR?: number;
    /** placed: spawned already lying on the floor this many metres ahead (no flight) */
    place?: number;
    /** a tether (chain, tongue, vine): drawn from the owner's hand to the tip; gone when the owner's move ends or the owner is hit */
    tether?: boolean;
  };
  /** blink: on `frame` the fighter vanishes and reappears `dx` ahead, or just behind the opponent when it stands within `behind` metres
   * ahead; invulnerable on move frames [from, to]; never ends further off the deck than it started (no blink into a fall) */
  blink?: { frame: number; dx: number; behind: number; invuln: [number, number] };
  /** free-form notes for the animator: what the move looks like */
  look: string;
}

export interface FighterDef {
  id: FighterId;
  name: string;
  /** one or two words: "Heavy hitter" */
  role: string;
  /** one line for the select screen, 12 words at most */
  blurb: string;
  /** select-screen bars, 1..5, and they must be true to the numbers below */
  stats: { power: number; speed: number; reach: number; weight: number; grab: number };
  /** hurtbox: a capsule approximated by width and height, feet at (x, y) */
  width: number;
  height: number;
  weight: number;
  walkSpeed: number;
  runSpeed: number;
  airSpeed: number;
  airAccel: number;
  gravity: number;
  fallSpeed: number;
  fastFallSpeed: number;
  jumpSpeed: number;
  shortHopSpeed: number;
  doubleJumpSpeed: number;
  airJumps: number;
  jumpsquat: number;
  traction: number;
  moves: Record<MoveId, MoveDef>;
}

// ------------------------------------------------------------------------------------------------
// Arena (static)
// ------------------------------------------------------------------------------------------------

export interface Platform {
  x0: number;
  x1: number;
  y: number;
  /** soft platforms can be jumped through from below and dropped through */
  soft: boolean;
}

export interface ArenaDef {
  /** the main deck (solid, with a grabbable ledge at each end) */
  main: Platform;
  soft: Platform[];
  blast: { left: number; right: number; top: number; bottom: number };
  /** where fighters stand at fight start, and the respawn point */
  spawns: [number, number];
  respawn: { x: number; y: number };
}

// ------------------------------------------------------------------------------------------------
// Fight state (dynamic, JSON-serialisable, everything the renderer needs each tick)
// ------------------------------------------------------------------------------------------------

export type Action =
  | 'entrance' // pre-fight pose, no control
  | 'idle' | 'walk' | 'run' | 'skid' | 'turn'
  | 'jumpsquat' | 'rise' | 'fall' | 'land'
  | 'attack' // `move` and `actionFrame` say which and where in it
  | 'charge' // holding a smash, `move` set, `charge` counts up
  | 'shield' | 'shieldstun' | 'shieldbreak' // shieldbreak = dizzy, helpless on the ground
  | 'roll' | 'spotdodge' | 'airdodge'
  | 'holding' // has grabbed the opponent, may pummel then throw
  | 'held' // is grabbed
  | 'hitstun' // flinch or launched, not actionable. `tumble` true when knockback was large
  | 'knockdown' | 'getup'
  | 'ledgehang' | 'ledgeclimb'
  | 'helpless' // after the up special, falling with drift only
  | 'respawn' // riding the respawn pad down, invulnerable
  | 'dead' // between the blast and the respawn (or out of lives)
  | 'win' | 'lose';

export interface FighterState {
  fighter: FighterId;
  x: number;
  y: number;
  vx: number;
  vy: number;
  facing: 1 | -1;
  action: Action;
  /** ticks since the action began (1 on its first tick) */
  actionFrame: number;
  /** the current move while action is attack, charge or holding (throw moves) */
  move: MoveId | null;
  /** smash charge ticks so far */
  charge: number;
  grounded: boolean;
  /** index into arena.soft, -1 = main deck, -2 = airborne */
  platform: number;
  /** -1 none, 0 left ledge, 1 right ledge */
  ledge: number;
  damage: number;
  lives: number;
  /** shield health 0..100 */
  shield: number;
  /** ticks of freeze left from a hit that just connected (both fighters get it) */
  hitlag: number;
  /** ticks of hitstun left */
  hitstun: number;
  /** true while flying from a strong hit (trail, spin, can be KO'd) */
  tumble: boolean;
  /** launch vector of the last hit taken, for trails and camera look-ahead */
  kbx: number;
  kby: number;
  /** ticks of invulnerability left */
  invuln: number;
  /** true on frames with super armour */
  armor: boolean;
  airJumpsLeft: number;
  /** true when the fast fall is on */
  fastFall: boolean;
  /** ticks left rooted by a snare (cannot move or act, can be hit); 0 or absent when free */
  rooted?: number;
  /** true while being dragged in by the opponent's tether */
  pulled?: boolean;
}

export interface Projectile {
  id: number;
  owner: Side;
  kind: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  life: number;
  /** the move that fired it (absent on old states: 'special') */
  move?: MoveId;
  /** gravity per tick (lobbed shots) */
  g?: number;
  /** lying on the floor as a hazard: `life` is the ticks it has left there; `r` is its half-width along the floor */
  floor?: boolean;
  /** what it does to who it touches: 'snare' roots, 'burn' hits repeatedly, 'pull' drags in */
  effect?: 'pull' | 'snare' | 'burn';
  /** a tether: draw a line from the owner's hand to (x, y); `drag` true while it is reeling the opponent in (the tip is on them) */
  tether?: boolean;
  drag?: boolean;
  /** ticks until a burn hazard can hit again; on a flying shot, 1 means spent (its fan already landed as many as it may: draw it fading) */
  cd?: number;
  /** on a fan's shot: how many shots of its volley have landed or been blocked so far */
  n?: number;
}

export interface FightHeader {
  /** hex, at least 32 chars */
  seed: string;
  fighters: [FighterId, FighterId];
  /** starting damage per side (the favourite's handicap) */
  handicap: [number, number];
  lives: number;
  /** ticks of regulation time before sudden death (10800 = 3 min) */
  timeLimitTicks: number;
}

export interface FightState {
  tick: number;
  phase: 'fight' | 'sudden' | 'over';
  fighters: [FighterState, FighterState];
  projectiles: Projectile[];
  /** plans in force */
  plans: [Plan, Plan];
  /** plans scheduled for a later tick */
  pending: PlanAt[];
  /** knockback multiplier, 1 in regulation, grows in sudden death */
  kbScale: number;
  winner: -1 | Side;
  /** running totals the HUD and coaches read */
  stats: [SideStats, SideStats];
  /** PRNG state and the controllers' private memory. Opaque to everything outside src/sim. */
  rng: number[];
  ctl: unknown;
}

export interface SideStats {
  damageDealt: number;
  hitsLanded: number;
  grabsLanded: number;
  shieldsHeld: number;
  kos: number;
  /** highest damage dealt in one unbroken string */
  bestCombo: number;
}

// ------------------------------------------------------------------------------------------------
// Events the sim reports per tick (the renderer and the sound hang everything on these)
// ------------------------------------------------------------------------------------------------

export type HitStrength = 'light' | 'medium' | 'heavy' | 'lethal';

export type SimEvent =
  | { t: 'hit'; tick: number; by: Side; to: Side; move: MoveId | 'projectile'; damage: number; total: number; x: number; y: number; dx: number; dy: number; kb: number; hitlag: number; strength: HitStrength; combo: number; via?: MoveId }
  | { t: 'shield_hit'; tick: number; by: Side; to: Side; move: MoveId | 'projectile'; x: number; y: number; shield: number; perfect: boolean; via?: MoveId }
  | { t: 'shield_break'; tick: number; side: Side }
  | { t: 'clank'; tick: number; x: number; y: number } // two attacks cancel
  | { t: 'grab'; tick: number; by: Side; to: Side }
  | { t: 'throw'; tick: number; by: Side; to: Side; move: MoveId }
  | { t: 'whiff'; tick: number; side: Side; move: MoveId }
  | { t: 'move'; tick: number; side: Side; move: MoveId } // a move starts (sound: the swing)
  | { t: 'projectile'; tick: number; side: Side; kind: string; x: number; y: number }
  | { t: 'jump'; tick: number; side: Side; air: boolean; x: number; y: number }
  | { t: 'land'; tick: number; side: Side; x: number; y: number; hard: boolean }
  | { t: 'dash'; tick: number; side: Side; x: number; y: number; dir: 1 | -1 }
  | { t: 'dodge'; tick: number; side: Side; kind: 'roll' | 'spot' | 'air' }
  | { t: 'ledge'; tick: number; side: Side; ledge: number }
  | { t: 'tech'; tick: number; side: Side; x: number; y: number }
  | { t: 'bounce'; tick: number; side: Side; x: number; y: number } // slammed into the deck
  | { t: 'ko'; tick: number; side: Side; by: Side; x: number; y: number; edge: 'left' | 'right' | 'top' | 'bottom'; damage: number; move: MoveId | 'projectile' | null; livesLeft: number }
  | { t: 'respawn'; tick: number; side: Side }
  | { t: 'plan'; tick: number; side: Side; plan: Plan } // a scheduled plan took effect
  | { t: 'order'; tick: number; side: Side; order: 'special' | 'kill' } // a one-time order is being carried out
  | { t: 'blink'; tick: number; side: Side; fromX: number; fromY: number; toX: number; toY: number; behind: boolean } // vanished and reappeared
  | { t: 'snare'; tick: number; by: Side; to: Side; x: number; y: number; ticks: number } // rooted in place
  | { t: 'pull'; tick: number; by: Side; to: Side; x: number; y: number } // a tether caught: the drag begins (a 'grab' event follows on arrival)
  | { t: 'hazard'; tick: number; side: Side; id: number; kind: string; x: number; y: number; r: number; state: 'placed' | 'sprung' | 'expired' | 'replaced' }
  | { t: 'sudden_death'; tick: number }
  | { t: 'end'; tick: number; winner: Side };

// ------------------------------------------------------------------------------------------------
// What a mind sees (sent to a model as compact JSON, also what mock coaches read)
// ------------------------------------------------------------------------------------------------

export interface CoachView {
  tick: number;
  secondsLeft: number;
  sudden: boolean;
  me: CoachFighterView;
  opp: CoachFighterView;
  /** horizontal gap between the fighters, metres */
  gap: number;
  /** who stands nearer the middle of the deck: 'me' | 'opp' | 'even' */
  centre: 'me' | 'opp' | 'even';
  /** what the opponent did since the last view: counts per habit */
  oppHabits: { approaches: number; retreats: number; strikes: number; grabs: number; shields: number; dodges: number; shots: number; jumps: number; recoveredHigh: number; recoveredLow: number };
  /** the stance the opponent's hands appear to be playing, inferred from oppHabits (never read from its plan) */
  oppLooksLike: Stance | 'unclear';
  /** how my current plan did since it took effect */
  since: { plan: Plan; ticks: number; dealt: number; taken: number; myHits: number; oppHits: number; myGrabs: number; oppGrabs: number; myWhiffs: number; shieldedByOpp: number };
}

export interface CoachFighterView {
  fighter: FighterId;
  damage: number;
  lives: number;
  /** 'centre' | 'left' | 'right' (which third of the deck) | 'platform' | 'ledge' | 'offstage' | 'respawning' */
  where: string;
  airborne: boolean;
}

/** A mock coach: a pure function of the view and its own small memory. */
export interface Coach {
  id: string;
  decide(view: CoachView, memory: Record<string, unknown>, rand: () => number): Plan;
}

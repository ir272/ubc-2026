// Loadouts: classes, weapons, spells, charms and the boss's tempers. Owner: sim. PURE data + helpers.
//
// A loadout is { cls, weapon, spell, charm } (ids, frozen). A fighter always has four moves:
// the class's two moves, the weapon's Strike, the spell. The numbers here are read by
// agentStats() (the per-fighter stats object, src/sim/agent.js) and temperMods() (src/sim/boss.js).
//
//   drawOffers(seedInt)                      -> { temper, offers: [ {cls:[3], weapon:[3], spell:[3], charm:[3]} x2 ] }
//                                               (the two fighters' class offers are disjoint)
//   movesFor(loadout)                        -> [ { slot, id, name, effect, kind } x4 ]
//   mockPick(slot, options, { temper, mine, rng }) -> id
//   loadoutScore(loadout, temper)            -> number (the "tape" heuristic: how good this build looks)

import { makeRng, rand, hash2 } from '../core/rng.js';

export const DEFAULT_LOADOUT = Object.freeze({ cls: 'duelist', weapon: 'sabre', spell: 'candle', charm: 'seal' });

// ---- classes ------------------------------------------------------------------------------
// hp: max health. walk: px/s. dmg: strike damage multiplier. spellPower: spell multiplier.
// charges: extra spell charges. roll: { iTo, dist, cost } added to the base roll.
// strikeSpeed: windup/recovery multiplier (<1 = faster). riposte: multiplier on the first strike
// after a clean dodge. rage: extra damage at 0 health (scales with health lost).
// errorMul: mock brain error multiplier (the Archivist has read ahead).
export const CLASSES = {
  duelist: {
    id: 'duelist', name: 'The Duelist', moves: ['roll_through', 'roll_away'],
    effect: 'Riposte: the first strike after a clean dodge hits harder.',
    hp: 100, walk: 250, dmg: 1.1, riposte: 2,
  },
  warden: {
    id: 'warden', name: 'The Warden', moves: ['guard', 'roll_toward'],
    effect: 'More health, a tall shield, slower feet.',
    hp: 125, walk: 205, dmg: 1.35, roll: { cost: 4 },
  },
  thief: {
    id: 'thief', name: 'The Bookthief', moves: ['roll_through', 'jump_back'],
    effect: 'Less health, quicker strikes, a longer dodge.',
    hp: 112, walk: 275, dmg: 1.15, strikeSpeed: 0.78, roll: { iTo: 90, dist: 20 },
  },
  hexer: {
    id: 'hexer', name: 'The Hexer', moves: ['roll_away', 'hex'],
    effect: 'One more spell charge, and every spell is stronger.',
    hp: 115, walk: 240, dmg: 1.05, spellPower: 1.5, charges: 1,
  },
  archivist: {
    id: 'archivist', name: 'The Archivist', moves: ['roll_toward', 'jump_back'],
    effect: 'Has read ahead: knows every attack; the curse barely touches him.',
    hp: 90, walk: 245, dmg: 1, errorMul: 0.75, curseTake: 0.1,
  },
  penitent: {
    id: 'penitent', name: 'The Penitent', moves: ['roll_toward', 'trade'],
    effect: 'Hits harder the closer to death he is.',
    hp: 95, walk: 230, dmg: 0.95, rage: 0.4,
  },
};

// ---- weapons ------------------------------------------------------------------------------
// strike: which attack the Strike move uses ('light' chain or one 'heavy').
// light/heavy: overrides of the base swing (src/sim/agent.js AGENT.light / AGENT.heavy).
// burn: { ms, dps } set on the boss by each hit. quillMul: x damage while it winds up or writes.
export const WEAPONS = {
  sabre: {
    id: 'sabre', name: "Fencer's Sabre", strikeName: 'Three Cuts', strike: 'light',
    effect: 'Three quick cuts.',
    light: { dmg: [12, 12, 16] }, heavy: {},
  },
  maul: {
    id: 'maul', name: "Binder's Maul", strikeName: 'Crushing Blow', strike: 'heavy',
    effect: 'One slow huge blow that breaks its stance fast.',
    light: { windup: 250, active: 100, recovery: 380, cost: 20, dmg: [13, 16], poise: [14, 18], step: 20, box: { fx0: 6, fx1: 112, y0: 0, y1: 130 } },
    heavy: { windup: 560, active: 120, recovery: 480, cost: 32, dmg: 30, poise: 38, step: 34, box: { fx0: 6, fx1: 128, y0: 0, y1: 150 } },
  },
  knives: {
    id: 'knives', name: 'Paper Knives', strikeName: 'Flurry', strike: 'light',
    effect: 'Four very fast small cuts at short reach.',
    light: { windup: 95, active: 70, recovery: 170, cost: 8, chainOpen: 25, dmg: [9, 9, 9, 14], poise: [4, 4, 4, 8], step: 22, box: { fx0: 4, fx1: 82, y0: 10, y1: 110 } },
    heavy: { windup: 360, dmg: 24, poise: 20, box: { fx0: 4, fx1: 92, y0: 0, y1: 130 } },
  },
  pole: {
    id: 'pole', name: "Lamplighter's Pole", strikeName: 'Long Thrust', strike: 'light',
    effect: 'Long reach: strikes from outside its sweep.',
    light: { windup: 185, active: 110, recovery: 290, cost: 14, dmg: [13, 16], poise: [10, 14], step: 8, box: { fx0: 30, fx1: 205, y0: 20, y1: 120 } },
    heavy: { windup: 470, dmg: 30, poise: 28, box: { fx0: 30, fx1: 215, y0: 0, y1: 140 } },
  },
  censer: {
    id: 'censer', name: 'Burning Censer', strikeName: 'Censer Swing', strike: 'light',
    effect: 'Every hit sets it burning.',
    light: { windup: 170, active: 100, recovery: 300, cost: 15, dmg: [9, 12], poise: [8, 12], box: { fx0: 6, fx1: 112, y0: 10, y1: 130 } },
    heavy: { dmg: 24 },
    burn: { ms: 3000, dps: 6 },
  },
  quill: {
    id: 'quill', name: 'Stolen Quill', strikeName: 'Nib Stab', strike: 'light',
    effect: 'Hits much harder while it winds up or writes.',
    light: { dmg: [10, 10, 14] }, heavy: { dmg: 28 },
    quillMul: 2.1,
  },
};

// ---- spells -------------------------------------------------------------------------------
// castMs: the cast's length, at: when it takes effect. charges: uses per attempt.
export const SPELLS = {
  candle: {
    id: 'candle', name: 'Candleflame', kind: 'spell', charges: 2, castMs: 380, at: 230, fire: true,
    effect: 'A bolt of fire from range that sets it burning.',
    damage: 30, speed: 1150, burn: { ms: 2500, dps: 6 },
  },
  blot: {
    id: 'blot', name: 'Blot', kind: 'spell', charges: 2, castMs: 260, at: 150,
    effect: 'An ink ward that swallows the next blow.',
    wardMs: 9000,
  },
  margin: {
    id: 'margin', name: 'Margin Step', kind: 'spell', charges: 2, castMs: 420, at: 140,
    effect: 'Blink behind it, untouchable on the way.',
  },
  knot: {
    id: 'knot', name: "Binder's Knot", kind: 'spell', charges: 1, castMs: 300, at: 190,
    effect: 'Ties it mid-attack and leaves it staggered.',
    bindMs: 2100,
  },
  mend: {
    id: 'mend', name: 'Mend', kind: 'spell', charges: 2, castMs: 420, at: 120,
    effect: 'Close your wounds.',
    heal: 70,
  },
  echo: {
    id: 'echo', name: 'Echo', kind: 'spell', charges: 2, castMs: 220, at: 150,
    effect: 'Your next strike lands twice.',
  },
};

// ---- charms -------------------------------------------------------------------------------
export const CHARMS = {
  seal: { id: 'seal', name: 'Wax Seal', effect: 'Survive one killing blow.' },
  bookmark: { id: 'bookmark', name: 'Iron Bookmark', effect: 'More health.', hp: 25 },
  ribbon: { id: 'ribbon', name: 'Silk Ribbon', effect: 'Dodges are safer: longer untouchable, cheaper.', roll: { iTo: 80, cost: -8 }, jumpCost: -6, blinkMs: 80 },
  ember: { id: 'ember', name: 'Ember Ring', effect: 'Every strike also burns.', burn: { ms: 2000, dps: 4 } },
  nib: { id: 'nib', name: 'Spite Nib', effect: 'Much more damage when badly hurt.', below: 0.45, mul: 1.6 },
  sandglass: { id: 'sandglass', name: 'Sand Glass', effect: 'The name takes one more stroke: seven exchanges.', strokes: 1 },
  lens: { id: 'lens', name: 'Reading Lens', effect: 'It stays open longer after each attack.', recoveryMul: 1.3 },
};

// ---- tempers ------------------------------------------------------------------------------
// mods are read by src/sim/boss.js (temperMods). Missing fields default to 1 / none.
//   dmgMul: its hits. recoveryMul / idleMul: its punish window / pause between attacks.
//   lightMul / heavyMul / spellMul / fireMul / backMul: damage it takes from small cuts, heavy
//   blows, spells, fire, and from behind. weights / cooldownMul: per attack. writeMul: Written
//   Name's write time. stormPhase1: page_storm unlocked from the start. noBackStrikes: its
//   attacks raise nothing behind it (the wing geysers and back waves). curseMul: the curse's
//   damage. curseHits: hits it takes, while it writes, to break the pen (default 1). curseHeal:
//   share of its max health a finished name heals. curseSure: the curse ignores a dodge's
//   untouchable frames. pageMul: damage of its pages (gust, storm).
export const TEMPERS = {
  enraged: {
    id: 'enraged', name: 'Enraged', effect: 'Hits much harder and barely pauses between attacks.',
    favours: ['hexer', 'blot', 'seal'],
    mods: { dmgMul: 1.9, idleMul: 0.65 },
  },
  ironbound: {
    id: 'ironbound', name: 'Iron-bound', effect: 'Small cuts barely scratch it; heavy blows and spells bite.',
    favours: ['maul', 'candle', 'hexer', 'penitent'],
    mods: { lightMul: 0.42, heavyMul: 1.35, spellMul: 2 },
  },
  tinder: {
    id: 'tinder', name: 'Dry as Tinder', effect: 'Fire does double.',
    favours: ['candle', 'censer', 'ember', 'warden'],
    mods: { fireMul: 2 },
  },
  slow: {
    id: 'slow', name: 'Slow to Turn', effect: 'Cannot strike behind itself, and is weak from behind.',
    favours: ['duelist', 'thief', 'margin'],
    mods: { backMul: 1.7, noBackStrikes: true, dmgMul: 1.25 },
  },
  restless: {
    id: 'restless', name: 'Restless Pages', effect: 'Throws pages and gusts far more often.',
    favours: ['thief', 'quill', 'margin', 'mend'],
    mods: { weights: { wing_gust: 4.5, page_storm: 1.5 }, cooldownMul: { wing_gust: 0.15, page_storm: 0.5 }, stormPhase1: true, pageMul: 2.6 },
  },
  counting: {
    id: 'counting', name: 'Counting Names', effect: 'Writes names often; no dodge or blow stops the pen.',
    favours: ['echo', 'quill', 'knives', 'hexer'],
    mods: { weights: { written_name: 8 }, cooldownMul: { written_name: 0.2 }, writeMul: 0.6, curseHits: 1000, curseSure: true, curseMul: 0.7 },
  },
};

export const CLASS_IDS = Object.keys(CLASSES);
export const WEAPON_IDS = Object.keys(WEAPONS);
export const SPELL_IDS = Object.keys(SPELLS);
export const CHARM_IDS = Object.keys(CHARMS);
export const TEMPER_IDS = Object.keys(TEMPERS);
export const SLOT_POOLS = { cls: CLASS_IDS, weapon: WEAPON_IDS, spell: SPELL_IDS, charm: CHARM_IDS };
export const PICK_ORDER = ['cls', 'weapon', 'spell', 'charm'];

// ---- moves --------------------------------------------------------------------------------
export const CLASS_MOVES = {
  roll_through: { id: 'roll_through', name: 'Slip Past', kind: 'evade', effect: 'Roll through it and come out at its back.' },
  roll_away: { id: 'roll_away', name: 'Fall Back', kind: 'evade', effect: 'Roll away, out of its reach.' },
  roll_toward: { id: 'roll_toward', name: 'Step In', kind: 'evade', effect: 'Roll in close, inside its reach.' },
  jump_back: { id: 'jump_back', name: 'Leap', kind: 'evade', effect: 'Jump back over anything low.' },
  guard: { id: 'guard', name: 'Brace', kind: 'guard', effect: 'Shield up through the attack, then hit back harder. Costs stamina.' },
  hex: { id: 'hex', name: 'Hex', kind: 'hex', effect: 'Mark it: it smoulders and takes more damage for a while.' },
  trade: { id: 'trade', name: 'Trade Blows', kind: 'trade', effect: 'An armoured heavy blow: take less, never stagger, hit hard.' },
};

export function normLoadout(l) {
  const L = l || DEFAULT_LOADOUT;
  return {
    cls: CLASSES[L.cls] ? L.cls : DEFAULT_LOADOUT.cls,
    weapon: WEAPONS[L.weapon] ? L.weapon : DEFAULT_LOADOUT.weapon,
    spell: SPELLS[L.spell] ? L.spell : DEFAULT_LOADOUT.spell,
    charm: CHARMS[L.charm] ? L.charm : DEFAULT_LOADOUT.charm,
  };
}

export function movesFor(loadout) {
  const L = normLoadout(loadout);
  const c = CLASSES[L.cls], wp = WEAPONS[L.weapon], sp = SPELLS[L.spell];
  const m = (slot, x) => ({ slot, id: x.id, name: x.name, effect: x.effect, kind: x.kind });
  return [
    m(0, CLASS_MOVES[c.moves[0]]),
    m(1, CLASS_MOVES[c.moves[1]]),
    { slot: 2, id: 'strike', name: wp.strikeName, effect: wp.effect, kind: 'strike', weapon: wp.id },
    { slot: 3, id: sp.id, name: sp.name, effect: sp.effect, kind: 'spell' },
  ];
}

// ---- offers -------------------------------------------------------------------------------
function draw3(rng, pool) {
  const a = pool.slice();
  for (let i = 0; i < 3; i++) {
    const j = i + Math.floor(rand(rng) * (a.length - i));
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a.slice(0, 3);
}

export function drawOffers(seedInt) {
  const rng = makeRng(hash2(seedInt >>> 0, 0x0ffe75));
  const temper = TEMPER_IDS[Math.floor(rand(rng) * TEMPER_IDS.length)];
  // classes are disjoint: shuffle the six, first three to one fighter, the rest to the other,
  // so the two contenders never fight as the same class. The rest are independent draws.
  const cls = CLASS_IDS.slice();
  for (let i = cls.length - 1; i > 0; i--) { const j = Math.floor(rand(rng) * (i + 1)); const t = cls[i]; cls[i] = cls[j]; cls[j] = t; }
  const offers = [0, 1].map((f) => ({
    cls: cls.slice(f * 3, f * 3 + 3), weapon: draw3(rng, WEAPON_IDS), spell: draw3(rng, SPELL_IDS), charm: draw3(rng, CHARM_IDS),
  }));
  return { temper, offers };
}

// ---- synergy: how good an item looks next to the temper and what is already picked ----------
// Base value per item, then pair bonuses: calibrated from mock attempts (each item's measured
// strength, overall and under each temper, x 8), plus a few hand-set item pairs. Read by
// mockPick (with noise) and by loadoutScore (the tape heuristic, no noise).
const BASE = {
  duelist: 0.5, warden: 1.3, thief: 0.4, hexer: 0.9, archivist: 1.5, penitent: 1.4,
  sabre: 1.1, maul: 1.0, knives: 1.0, pole: 0.9, censer: 0.9, quill: 1.0,
  candle: 0.7, blot: 1.5, margin: 1.2, knot: 1.5, mend: -0.0, echo: 1.1,
  seal: 1.2, bookmark: 0.9, ribbon: 0.9, ember: 1.0, nib: 1.0, sandglass: 0.8, lens: 1.3,
};
const PAIRS = [
  // temper x item (calibrated: tools/balance.mjs data, attempt strength x 8)
  ['ironbound', 'duelist', -0.3], ['ironbound', 'thief', -0.4], ['ironbound', 'hexer', 0.7], ['ironbound', 'archivist', -0.3], ['ironbound', 'penitent', 0.4], ['ironbound', 'sabre', -0.6], ['ironbound', 'maul', 1.9], ['ironbound', 'knives', -0.6], ['ironbound', 'quill', -0.6], ['ironbound', 'candle', 1.0], ['ironbound', 'margin', -0.9], ['ironbound', 'knot', 0.3], ['ironbound', 'seal', -0.3],
  ['tinder', 'duelist', -0.5], ['tinder', 'warden', 0.4], ['tinder', 'thief', -0.6], ['tinder', 'hexer', 0.9], ['tinder', 'archivist', -0.3], ['tinder', 'knives', -0.3], ['tinder', 'censer', 0.8], ['tinder', 'quill', -0.3], ['tinder', 'candle', 0.9], ['tinder', 'margin', -0.5], ['tinder', 'knot', -0.3], ['tinder', 'ember', 0.4],
  ['slow', 'duelist', 2.2], ['slow', 'warden', -1.0], ['slow', 'thief', 1.4], ['slow', 'hexer', -1.3], ['slow', 'archivist', -0.8], ['slow', 'penitent', -0.6], ['slow', 'knives', 0.6], ['slow', 'censer', -0.3], ['slow', 'quill', -0.3], ['slow', 'candle', -0.6], ['slow', 'margin', 1.7], ['slow', 'knot', -0.8], ['slow', 'seal', -0.3],
  ['restless', 'duelist', -0.6], ['restless', 'warden', 0.3], ['restless', 'thief', 0.4], ['restless', 'hexer', -0.7], ['restless', 'penitent', 0.6], ['restless', 'maul', -0.3], ['restless', 'candle', -0.3], ['restless', 'margin', 0.6],
  ['counting', 'duelist', -0.6], ['counting', 'thief', -0.6], ['counting', 'archivist', 1.5], ['counting', 'penitent', -0.7], ['counting', 'sabre', 0.6], ['counting', 'maul', -1.8], ['counting', 'knives', 0.3], ['counting', 'censer', -0.4], ['counting', 'quill', 1.3], ['counting', 'candle', -0.5], ['counting', 'blot', -0.4], ['counting', 'margin', -0.4], ['counting', 'knot', 0.4], ['counting', 'mend', 0.3], ['counting', 'echo', 0.6], ['counting', 'seal', 0.5], ['counting', 'lens', -0.4],
  ['enraged', 'maul', 0.3], ['enraged', 'candle', -0.4], ['enraged', 'blot', 0.9], ['enraged', 'margin', -0.6], ['enraged', 'knot', 0.3],
  // item x item
  ['hexer', 'candle', 0.6], ['hexer', 'mend', 0.4], ['hexer', 'knot', 0.3],
  ['thief', 'knives', 0.6], ['thief', 'quill', 0.4],
  ['penitent', 'nib', 0.8], ['penitent', 'maul', 0.5], ['penitent', 'seal', 0.4],
  ['warden', 'maul', 0.4], ['warden', 'bookmark', 0.3],
  ['duelist', 'sabre', 0.4], ['duelist', 'ribbon', 0.6],
  ['censer', 'ember', 0.4], ['candle', 'ember', 0.3], ['censer', 'candle', 0.3],
  ['maul', 'lens', 0.4], ['echo', 'maul', 0.5], ['echo', 'quill', 0.3],
  ['archivist', 'knot', 0.3], ['archivist', 'sandglass', 0.4],
];
const PAIR = {};
for (const [x, y, v] of PAIRS) { PAIR[x + '|' + y] = v; PAIR[y + '|' + x] = v; }
const pairOf = (x, y) => PAIR[x + '|' + y] || 0;

// What a mock picker sees: half the item's raw strength (it is not a perfect judge), the
// temper match (a class is picked mostly on taste: the temper counts less there) and the
// pairs with what it already holds.
export function itemSynergy(id, { temper, mine } = {}) {
  let s = 1 + ((BASE[id] || 1) - 1) * 0.5;
  if (temper) s += pairOf(temper, id) * (CLASSES[id] ? 0.4 : 1);
  if (mine) for (const k of PICK_ORDER) if (mine[k]) s += pairOf(mine[k], id) * 0.8;
  return s;
}

// The tape heuristic: how good a whole build looks against this temper.
export function loadoutScore(loadout, temper) {
  const L = normLoadout(loadout);
  let s = 0;
  const ids = [L.cls, L.weapon, L.spell, L.charm];
  for (const id of ids) s += (BASE[id] || 1) + pairOf(temper, id);
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) s += pairOf(ids[i], ids[j]) * 0.8;
  return s;
}

// Plausible but imperfect: weight by synergy, then add seeded noise so the same thing is not
// always taken. `rng` is a makeRng object (advanced in place).
export function mockPick(slot, options, { temper, mine, rng } = {}) {
  const r = rng || makeRng(1);
  let best = options[0], bestS = -1e9;
  for (const id of options) {
    const s = itemSynergy(id, { temper, mine }) + rand(r) * 2.2;
    if (s > bestS) { bestS = s; best = id; }
  }
  return best;
}

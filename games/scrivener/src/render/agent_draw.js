// The petitioner. Owner: art. Reads sim state only.
// Six bodies (duelist, warden, thief, hexer, archivist, penitent), six weapons, seven charms,
// inked like the boss: black masses carved with white folds, pale steel and bone, and one
// note of the entrant's colour on the body. The same rig draws the 90 px fighter and the
// 300 to 480 px portrait; at portrait scale the engraving switches on.
//   drawAgent(ctx, world, t)
//   drawFighterFigure(ctx, { loadout, x, y, scale, facing, pose, t, accent })
//   AGENT_COLORS[agentId]
//
// Fields read from the sim (all optional; anything absent draws nothing extra).
// The lead should reconcile these names with src/sim:
//   world.agent.loadout        { cls, weapon, spell, charm }   (missing -> duelist/sabre/candle/seal)
//   world.agent.accent         '#rrggbb', else AGENT_COLORS[id], else '#c4612f'
//   world.agent.state          idle walk roll jump light heavy hitstun dead heal
//                              + guard | cast | hex | trade | blink
//   world.agent.stateT         ms in the state
//   world.agent.combo          strike index in the chain (odd = the other hand / backhand)
//   world.agent.strikeCfg      { windup, active, recovery } for the current strike, else AGENT.light/heavy
//   world.agent.castSpell      spell id during 'cast' (else loadout.spell)
//   world.agent.castMs         length of the cast state (default 600)
//   world.agent.hexMs          length of the hex state (default 650)
//   world.agent.tradeCfg       { windup, active, recovery } for 'trade' (default 520/120/420)
//   world.agent.guardMs        unused; guard is drawn held for as long as the state lasts
//   world.agent.ward           truthy while the Blot ward is up
//   world.agent.echo           truthy while the next strike is doubled
//   world.agent.blink          { from, to, t } or world.agent.blinkFrom + blinkT (ms since)
//   world.agent.invulnT, iframes, rollDir, rollDist, facing, x, y   (as today)

import { GROUND_Y } from '../core/constants.js';
import { clamp, lerp, easeOutCubic } from '../core/math.js';
import { hashNoise } from '../core/rng.js';
import { AGENT } from '../sim/agent.js';
import { INK, PAPER, RED } from './ink.js';
import { spline, quad, ribbonPath, penPath, spikePath, contour, poly, polyPath } from './art/pen.js';
import { rig, strikeKey, restOf, WPN, CLS, ADULT, dirv, add, mix } from './fighter_parts/pose.js';
import { drawFighterBody, ribbonPts } from './fighter_parts/bodies.js';
import { weaponTip } from './fighter_parts/weapons.js';
import { ellPts, hatchIn } from './fighter_parts/engrave.js';

export const AGENT_COLORS = { claude: '#c4612f', gpt: '#2f8a78' };
export const DEFAULT_LOADOUT = { cls: 'duelist', weapon: 'sabre', spell: 'candle', charm: 'seal' };

const BONE = '#ece6d4';

function loadoutOf(a) {
  const l = a.loadout || {};
  return {
    cls: CLS[l.cls] ? l.cls : (CLS[a.cls] ? a.cls : DEFAULT_LOADOUT.cls),
    weapon: WPN[l.weapon] ? l.weapon : DEFAULT_LOADOUT.weapon,
    spell: l.spell || DEFAULT_LOADOUT.spell,
    charm: l.charm || (a.loadout ? null : DEFAULT_LOADOUT.charm),
  };
}

// ---- poses ------------------------------------------------------------------------------
function phaseOf(tt, cfg) {
  const w = cfg.windup || 1, ac = cfg.active || 1, rc = cfg.recovery || 1;
  if (tt < w) return ['wind', tt / w];
  if (tt < w + ac) return ['act', (tt - w) / ac];
  return ['rec', Math.min(1, (tt - w - ac) / rc)];
}

// spell gestures: pose keys on top of the weapon's rest, plus an `under` hook that draws
// what the hand holds (flame, cord, thread, sigil) after the body and before the weapon arm
function castPose(spell, u, weapon, S, cls) {
  const W = WPN[weapon] || WPN.sabre;
  const P = { ...restOf(cls, weapon), offBusy: true };
  const e = easeOutCubic(clamp(u * 1.6, 0, 1));
  switch (spell) {
    case 'candle':
      Object.assign(P, { offA: lerp(0.5, 1.62, e), offBend: lerp(0.9, 0.0, e), lean: 0.12 * e, crouch: 0.15 });
      P.under = (ctx, R) => { if (u < 0.75) flame(ctx, add(R.handF, [3.5, -3.5]), (0.6 + 0.6 * e) * (u < 0.6 ? 1 : 1 - (u - 0.6) / 0.15), S); };
      break;
    case 'blot':
      Object.assign(P, { offA: lerp(0.4, 1.3, e), offBend: lerp(0.5, 0.35, e), crouch: 0.25, lean: 0.05 });
      P.under = (ctx, R) => drips(ctx, R.handF, u, S);
      P.wardBuild = e;
      break;
    case 'margin':
      Object.assign(P, { offA: lerp(0.3, -0.5, e), offBend: 0.4, crouch: 0.5 * e, lean: 0.38 * e, armA: 0.9, bend: 0.4 });
      break;
    case 'knot':
      Object.assign(P, { offA: lerp(0.6, 1.55, e), offBend: lerp(0.8, 0.15, e), armA: lerp(0.6, 0.6, e), bend: lerp(0.5, 1.9, e), lean: -0.05, crouch: 0.2, noWeaponSwing: true });
      P.under = (ctx, R) => cord(ctx, R, u, S);
      break;
    case 'mend':
      Object.assign(P, { offA: 0.35, offBend: lerp(1.0, 2.5, e), lean: -0.06, crouch: 0.1 });
      P.under = (ctx, R) => stitches(ctx, R, u, S);
      break;
    case 'echo':
      Object.assign(P, { ...(W.victory || W.rest), offBusy: false, echo: true, lean: -0.05 });
      break;
    default:
      Object.assign(P, { offA: lerp(0.5, 1.6, e), offBend: lerp(0.9, 0.0, e) });
  }
  return P;
}

function hexPose(u, weapon, S, cls) {
  const e = easeOutCubic(clamp(u * 1.5, 0, 1));
  const P = { ...restOf(cls, weapon), offBusy: true, offA: lerp(0.5, 2.25, e), offBend: lerp(0.6, -0.55, e), lean: lerp(0, -0.12, e), crouch: 0.1 };
  P.under = (ctx, R) => sigil(ctx, add(R.handF, [17, -8]), clamp((u - 0.15) / 0.6, 0, 1), S, 1.5);
  return P;
}

// the pose for a sim state
function statePose(a, L, S, t) {
  const W = WPN[L.weapon];
  let P = { ...restOf(L.cls, L.weapon) };
  S.drag = 0;
  const st = a.state;
  if (st === 'walk') { P.legPh = a.stateT / 120; S.drag = 1; }
  else if (st === 'light' || st === 'heavy') {
    const cfg = a.strikeCfg || (st === 'light' ? AGENT.light : AGENT.heavy);
    const [ph, u] = phaseOf(a.stateT, cfg);
    P = strikeKey(L.weapon, ph, u, a.combo || 0, st === 'heavy', L.cls);
    P.strike = { ph, u, combo: a.combo || 0, heavy: st === 'heavy' };
    if (L.weapon === 'knives' && (a.combo || 0) % 2 === 1) P.offBusy = false;
  } else if (st === 'trade') {
    const cfg = a.tradeCfg || { windup: 520, active: 120, recovery: 420 };
    const [ph, u] = phaseOf(a.stateT, cfg);
    P = strikeKey(L.weapon, ph, u, 0, true, L.cls);
    if (ph === 'wind') Object.assign(P, { crouch: 0.45 * u + 0.1, lean: P.lean + 0.25 * u, offA: lerp(0.4, 1.95, u), offBend: lerp(0.5, 1.5, u), offBusy: true });
    S.armour = ph !== 'rec';
    P.strike = { ph, u, combo: 0, heavy: true };
  } else if (st === 'guard') {
    P = { ...(W.guard || W.rest) };
    if (L.cls === 'warden') Object.assign(P, { ...restOf(L.cls, L.weapon), shieldUp: 1, offA: 1.45, offBend: 0.9, crouch: 0.35, lean: 0.05, armA: 0.45, bend: 1.2 });
  } else if (st === 'cast' || st === 'heal') {
    const ms = a.castMs || (st === 'heal' ? AGENT.heal.ms : 600);
    P = castPose(st === 'heal' ? 'mend' : (a.castSpell || L.spell), clamp(a.stateT / ms, 0, 1), L.weapon, S, L.cls);
  } else if (st === 'hex') {
    P = hexPose(clamp(a.stateT / (a.hexMs || 650), 0, 1), L.weapon, S, L.cls);
  } else if (st === 'hitstun') {
    const thrown = { sabre: 0.4, quill: 0.45, knives: 0.5, maul: 4.25, pole: 2.95, censer: 5.6 };
    Object.assign(P, { lean: -0.55, armA: 0.2, bend: 0.2, wpnA: thrown[L.weapon] ?? 0.4, crouch: 0.2, offA: -0.5, offBend: 0.3, offBusy: true, twoHand: false });
    S.drag = -1;
  } else if (st === 'jump') {
    Object.assign(P, { crouch: 0.5, lean: 0.1, tuck: 1 });
  } else if (st === 'dead') {
    // the weapon falls along the body so nothing stands up off the floor
    Object.assign(P, { armA: 0.25, bend: 0.1, wpnA: 0.12, offA: 0.2, offBend: 0.2, crouch: 0.15, lean: 0.0, offBusy: true, twoHand: false });
    if (L.weapon === 'censer') P.wpnA = 0.05;
  } else if (st === 'blink') {
    Object.assign(P, { crouch: 0.4, lean: 0.35, offA: -0.4 });
  }
  if (st === 'idle') idleLife(P, L, t);
  else if (L.weapon === 'censer' && !P.strike) P.wpnA += Math.sin(t / 380) * 0.12 + S.drag * 0.4;
  if (a.echo) P.echo = true;
  return P;
}

// Portrait carry poses (adult units, feet at 0). In idle and ready the figure and its weapon
// stay inside a box 0.95 H wide and 1.15 H tall (H = 108 units here, the adult figure);
// victory reaches no higher than 1.3 H. The weapon is shouldered, planted or held upright.
const OFF_HANG = { offA: 0.18, offBend: 0.3 };
const CARRY = {
  idle: {
    // point down before the feet, both hands closed on the pommel
    sabre: { handTarget: [14, -52], plant: true, offTarget: [12, -54] },
    quill: { handTarget: [12, -54], plant: true, offTarget: [10, -56] },
    // the maul stood on its head before the body, both hands on the butt
    maul: { handTarget: [24, -70], wpnA: 0.02, offGripAt: 9 },
    // the pole stood up beside the body, near upright, the lamp hanging clear
    pole: { handTarget: [31, -69], wpnA: 2.985, poleGrip: 70, offGripAt: 20 },
    censer: { handTarget: [16, -52], wpnA: 0.1, ...OFF_HANG },
    knives: { handTarget: [6, -50], wpnA: 2.3, offA: 0.5, offBend: 1.2, offW: 2.0 },
  },
  ready: {
    // blade low and forward from the hip, clear of the chest and face
    sabre: { handTarget: [12, -48], wpnA: 2.5, crouch: 0.2, lean: 0.06, offA: 0.5, offBend: 0.8 },
    quill: { handTarget: [10, -48], wpnA: 2.55, crouch: 0.2, lean: 0.06, offA: 0.5, offBend: 0.8 },
    // the maul shouldered: hand at the haft before the shoulder, the head behind
    maul: { handTarget: [12, -72], wpnA: 3.95, weaponBehind: true, crouch: 0.2, offA: 0.4, offBend: 0.6 },
    pole: { handTarget: [28, -65], wpnA: 2.758, poleGrip: 70, crouch: 0.2, offGripAt: 22 },
    censer: { handTarget: [22, -56], wpnA: 0.45, crouch: 0.2, offA: 0.6, offBend: 0.9 },
    knives: { handTarget: [22, -56], wpnA: 1.95, crouch: 0.25, lean: 0.08, offTarget: [14, -62], offW: 2.15 },
  },
  guard: {
    sabre: { handTarget: [18, -66], wpnA: 2.6, crouch: 0.3, offA: 0.6, offBend: 0.9 },
    quill: { handTarget: [16, -66], wpnA: 2.65, crouch: 0.3, offA: 0.6, offBend: 0.9 },
    maul: { handTarget: [12, -74], wpnA: 3.95, weaponBehind: true, crouch: 0.3, offA: 0.9, offBend: 1.1 },
    pole: { handTarget: [30, -72], wpnA: 2.985, poleGrip: 72, crouch: 0.3, offGripAt: 22 },
    censer: { handTarget: [18, -80], wpnA: 0.1, crouch: 0.3, offA: 0.9, offBend: 1.2 },
    knives: { handTarget: [20, -66], wpnA: 2.9, crouch: 0.35, offTarget: [14, -64], offW: 3.4 },
  },
  victory: {
    // raised high and forward, never across the face, under 1.25 H
    sabre: { handTarget: [24, -74], wpnA: 2.62, offTarget: [-2, -108] },
    quill: { handTarget: [22, -74], wpnA: 2.65, offTarget: [-2, -108] },
    maul: { handTarget: [14, -72], wpnA: 3.75, weaponBehind: true, offTarget: [-4, -106] },
    pole: { handTarget: [26, -72], wpnA: 3.04, poleGrip: 72, offTarget: [-4, -106] },
    censer: { handTarget: [24, -102], wpnA: 0.05, offA: 0.3, offBend: 0.4 },
    knives: { handTarget: [18, -100], wpnA: 3.0, offTarget: [-2, -100], offW: 3.3 },
  },
};

// Idle life for the portraits and the standing fighter: a breath on ~3.1 s, and one small
// motion per class (the thief rocks on its toes; the censer swings; the rest live in the
// body code: shield, lantern, chain, fingers).
function idleLife(P, L, t) {
  P.breath = Math.sin((t / 3100) * Math.PI * 2);
  P.idleMotion = true;
  if (L.cls === 'thief') { const r = Math.sin(t / 850); P.hipX = (P.hipX || 0) + r * 1.6; P.crouch = (P.crouch || 0) + (r * 0.5 + 0.5) * 0.07; }
  if (L.weapon === 'censer') P.wpnA += Math.sin(t / 470) * 0.18;
  return P;
}

// pose by name for the portraits
function namedPose(name, L, S, t) {
  const W = WPN[L.weapon];
  let P;
  if (S.adult && CARRY[name] && CARRY[name][L.weapon]) {
    const C = CLS[L.cls];
    const ky = Math.min(1, (C.hipH + C.torso) / 72);
    let carry = CARRY[name][L.weapon];
    // the penitent drags its maul behind it, arms hanging, so the bare arms show
    if (L.cls === 'penitent' && L.weapon === 'maul' && (name === 'idle' || name === 'ready')) carry = { plantBack: true, handTarget: name === 'ready' ? [20, -44] : [15, -44], wpnA: 5.22, crouch: name === 'ready' ? 0.25 : 0, offA: 0.1, offBend: 0.25 };
    P = { ...restOf(L.cls, L.weapon), lean: 0, crouch: 0, bend: 0, ...carry, adult: true };
    if (P.handTarget) P.handTarget = [P.handTarget[0], P.handTarget[1] * ky];
    if (P.offTarget) P.offTarget = [P.offTarget[0], P.offTarget[1] * ky];
    if (P.offTarget) P.offBusy = true;
    if (L.cls === 'warden') {
      // the shield stays on the off arm: grounded beside the body, or lifted in triumph
      delete P.offTarget; delete P.offGripAt; P.offBusy = true;
      if (name === 'guard') {
        Object.assign(P, { ...CARRY.idle[L.weapon], offA: 1.45, offBend: 0.9, shieldUp: 1, crouch: 0.35 });
        delete P.offGripAt; delete P.offTarget;
        if (P.handTarget) P.handTarget = [P.handTarget[0], P.handTarget[1] * ky];
      } else Object.assign(P, name === 'victory' ? { offA: 1.0, offBend: 0.7 } : { offA: 0.85, offBend: 0.75, shieldUp: name === 'ready' ? 0.4 : 0 });
    }
    if (name === 'idle' || name === 'ready') idleLife(P, L, t);
    return P;
  }
  switch (name) {
    case 'ready': P = { ...(W.ready || W.rest) }; if (L.cls === 'warden') Object.assign(P, { offA: 1.2, offBend: 0.8, shieldUp: 0.4 }); break;
    case 'strike': P = strikeKey(L.weapon, 'act', 0.62, 0, false, L.cls); P.strike = { ph: 'act', u: 0.62, combo: 0, heavy: false }; break;
    case 'guard':
      P = { ...(W.guard || W.rest) };
      if (L.cls === 'warden') Object.assign(P, { ...restOf(L.cls, L.weapon), shieldUp: 1, offA: 1.45, offBend: 0.9, crouch: 0.35, lean: 0.05, armA: 0.45, bend: 1.2 });
      break;
    case 'cast': {
      const sp = L.spell || 'candle';
      P = castPose(sp, 0.5, L.weapon, S, L.cls);
      if (S.adult && sp !== 'knot' && sp !== 'echo') {
        // the weapon hand keeps the weapon carried while the other hand casts
        const C = CLS[L.cls], ky = Math.min(1, (C.hipH + C.torso) / 72);
        const c = L.cls === 'penitent' && L.weapon === 'maul' ? { plantBack: true, handTarget: [15, -44], wpnA: 5.22 } : CARRY.idle[L.weapon];
        P.handTarget = [c.handTarget[0], c.handTarget[1] * ky];
        if (c.wpnA != null) P.wpnA = c.wpnA; if (c.plant) P.plant = true; if (c.poleGrip) P.poleGrip = c.poleGrip; if (c.plantBack) P.plantBack = true; if (c.weaponBehind) P.weaponBehind = true;
      }
      if (sp === 'echo' && S.adult) {
        const C = CLS[L.cls], ky = Math.min(1, (C.hipH + C.torso) / 72);
        const c = CARRY.victory[L.weapon];
        P.handTarget = [c.handTarget[0], c.handTarget[1] * ky]; P.wpnA = c.wpnA; if (c.poleGrip) P.poleGrip = c.poleGrip;
      }
      break;
    }
    case 'hex': P = hexPose(0.8, L.weapon, S, L.cls); break;
    case 'victory': P = { ...(W.victory || W.rest), offA: 0.25, offBend: 0.4 }; if (L.cls === 'warden') Object.assign(P, { offA: 0.7, offBend: 0.6 }); break;
    case 'fallen':
      P = { ...restOf(L.cls, L.weapon), plant: true, kneel: true, lean: 0.55, armA: 0.35, bend: 0.25, wpnA: L.weapon === 'censer' ? 0.05 : 0.18, offA: 0.15, offBend: 0.2, offBusy: true, twoHand: false };
      if (L.weapon === 'maul') P.wpnA = 0.05;
      if (L.weapon === 'pole') P.wpnA = 2.6;
      if (L.cls === 'warden') Object.assign(P, { offA: 0.5, offBend: 0.5, shieldRot: -0.25 });
      break;
    default: P = { ...restOf(L.cls, L.weapon) };
  }
  if (name === 'idle' || name === 'ready') idleLife(P, L, t);
  if (S.adult) P.adult = true;
  return P;
}

// ---- spell gestures ---------------------------------------------------------------------
export function flame(ctx, p, k, S, color = RED) {
  if (k <= 0.02) return;
  const t = S.t || 0;
  const l1 = Math.sin(t / 70) * 0.9, l2 = Math.sin(t / 53 + 1) * 0.7, l3 = Math.sin(t / 61 + 2) * 0.7;
  const P = (x, y) => [p[0] + x * k, p[1] + y * k];
  // three tongues off a round base: a tall middle one, two shorter ones leaning out
  const outer = spline([P(-3.4, 0.4), P(-4.0, -2.8), P(-3.4, -5.6), P(-5.0 + l2 * 0.6, -9.6), P(-2.2, -7.0), P(-1.2, -9.4), P(0.4 + l1, -14.2), P(1.4, -8.4), P(2.6, -7.2), P(4.6 + l3 * 0.6, -10.4), P(3.8, -4.6), P(3.6, -1.0), P(1.8, 2.0), P(-1.8, 2.0)], 3, true);
  poly(ctx, outer, color);
  hatchIn(ctx, outer, { mode: 'shadow', color: INK, gap: S.hi ? 1.1 * S.D : 1.6 / Math.max(1, k), w: S.hi ? 0.6 * S.D : 0.55 / Math.max(1, k), angle: 1.45, lo: 0.42, seed: 211 });
  // a pale inner tongue: the hottest part is left as paper
  const inner = spline([P(-1.6, 0.6), P(-1.9, -2.6), P(-0.5 + l1 * 0.4, -7.6), P(0.9, -3.4), P(1.5, 0.2), P(0, 1.4)], 3, true);
  poly(ctx, inner, PAPER);
  contour(ctx, outer, { min: S.hi ? 0.35 : 0.45, max: S.hi ? 1.0 : 1.1, breaks: false });
}
function drips(ctx, h, u, S) {
  ctx.fillStyle = INK; ctx.beginPath();
  for (let i = 0; i < 3; i++) {
    const age = (u * 2.2 + i / 3) % 1;
    const p = [h[0] + 1 + i * 1.6, h[1] + 3 + age * 16];
    ctx.moveTo(p[0], p[1] - 2.4); ctx.quadraticCurveTo(p[0] + 1.4, p[1] + 0.4, p[0], p[1] + 1.2); ctx.quadraticCurveTo(p[0] - 1.4, p[1] + 0.4, p[0], p[1] - 2.4);
  }
  ribbonPath(ctx, [h, [h[0] + 1.5, h[1] + 5]], () => 1.6);
  ctx.fill();
}
function cord(ctx, R, u, S) {
  // a black binding cord paid out from the far hand, a knot at the near hand
  const a = R.hand, b = R.handF;
  const reach = 18 + 40 * clamp(u * 1.4, 0, 1);
  const end = add(b, [reach, -2 + Math.sin((S.t || 0) / 90) * 2]);
  const pts = spline([a, mix(a, b, 0.5), b, mix(b, end, 0.5), end], 3);
  ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, pts, (tt) => 1.5 - tt * 0.6); ctx.fill();
  // twist marks
  ctx.fillStyle = PAPER; ctx.beginPath();
  for (let i = 2; i < pts.length - 1; i += 2) { const p = pts[i]; ribbonPath(ctx, [add(p, [-0.6, -0.6]), add(p, [0.6, 0.6])], () => 0.4); }
  ctx.fill();
  // the loop at the end
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(end[0] + 3, end[1], 3.6, 2.4, 0.3, 0, Math.PI * 2); ctx.ellipse(end[0] + 3, end[1], 2.4, 1.3, 0.3, 0, Math.PI * 2, true); ctx.fill();
}
function stitches(ctx, R, u, S) {
  // thread drawn through the chest: pale cross stitches closing from the top down
  const top = mix(R.sh, R.hip, 0.15), bot = mix(R.sh, R.hip, 0.8);
  const n = 4, shown = Math.ceil(n * clamp(u * 1.3, 0, 1));
  ctx.fillStyle = PAPER; ctx.beginPath();
  for (let i = 0; i < shown; i++) {
    const c = add(mix(top, bot, (i + 0.5) / n), [4, 0]);
    ribbonPath(ctx, [add(c, [-2.6, -1.6]), add(c, [2.6, 1.6])], () => 1.0);
    ribbonPath(ctx, [add(c, [-2.6, 1.6]), add(c, [2.6, -1.6])], () => 1.0);
  }
  // the thread from the last stitch to the hand, and a needle
  const last = add(mix(top, bot, (Math.max(1, shown) - 0.5) / n), [4, 0]);
  ribbonPath(ctx, [last, mix(last, R.handF, 0.5), R.handF], () => 0.55);
  ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath();
  ribbonPath(ctx, [add(R.handF, [-1, 1]), add(R.handF, [5, -4])], (tt) => 1.0 - tt * 0.8);
  ctx.fill();
}
// the hex sigil: written on, an ink ring crossed by a hooked stroke, a red point
export function sigil(ctx, c, u, S, k = 1, color = INK) {
  if (u <= 0) return;
  const t = S.t || 0;
  ctx.fillStyle = color; ctx.beginPath();
  const ring = [];
  const span = Math.PI * 2 * clamp(u * 1.4, 0, 1);
  for (let i = 0; i <= 20; i++) { const a = -2.2 + span * (i / 20); ring.push([c[0] + Math.cos(a) * 7 * k, c[1] + Math.sin(a) * 6.4 * k]); }
  ribbonPath(ctx, ring, (tt) => (1.4 - 0.7 * tt) * k);
  if (u > 0.5) {
    const v = clamp((u - 0.5) * 2, 0, 1);
    ribbonPath(ctx, spline([[c[0] - 9 * k, c[1] + 5 * k], [c[0] - 2 * k, c[1] - 1 * k], [c[0] + 6 * k * v, c[1] - 9 * k * v], [c[0] + 9 * k * v, c[1] - 6 * k * v]], 3), (tt) => (1.6 - tt) * k);
    ribbonPath(ctx, [[c[0] - 4 * k, c[1] - 7 * k], [c[0] + 4 * k * v, c[1] + 7 * k * v]], (tt) => (1.2 - tt * 0.8) * k);
  }
  ctx.fill();
  if (u > 0.8) { ctx.fillStyle = RED; ctx.beginPath(); ctx.arc(c[0] + 0.5 * k, c[1] + 0.5 * k, 1.8 * k, 0, Math.PI * 2); ctx.fill(); }
}

// the Blot ward: a thin broken shell of ink round the body, with a few runs at the bottom
function ward(ctx, cls, S, build = 1) {
  const C = CLS[cls] || CLS.duelist;
  const H = C.hipH + C.torso + 24 + (cls === 'hexer' ? 26 : 0);
  const cx = 2, cy = -H / 2 - 2, rx = cls === 'penitent' || cls === 'warden' ? 34 : 28, ry = H / 2 + 8;
  const t = S.t || 0;
  ctx.fillStyle = INK; ctx.beginPath();
  for (let ring = 0; ring < 2; ring++) {
    const segs = 9;
    for (let s = 0; s < segs; s++) {
      if (hashNoise(301 + ring, s) < 0.18) continue;
      const a0 = -Math.PI / 2 + (s / segs) * Math.PI * 2 * build + ring * 0.2;
      const a1 = a0 + (Math.PI * 2 / segs) * build * (0.7 + 0.25 * hashNoise(303, s));
      const pts = [];
      for (let i = 0; i <= 8; i++) {
        const a = lerp(a0, a1, i / 8);
        const wob = 1 + Math.sin(a * 3 + t / 400 + ring) * 0.025;
        pts.push([cx + Math.cos(a) * rx * wob * (1 + ring * 0.07), cy + Math.sin(a) * ry * wob * (1 + ring * 0.04)]);
      }
      penPath(ctx, pts, (ring ? 0.9 : 1.6) * (S.hi ? 0.8 : 1), 0.25, 0.3);
    }
  }
  if (build >= 1) {
    for (let i = 0; i < 3; i++) {
      const x = cx - rx * 0.5 + i * rx * 0.5 + (hashNoise(305, i) - 0.5) * 6;
      const y0 = cy + ry * Math.sqrt(Math.max(0, 1 - ((x - cx) / rx) ** 2)) - 1;
      const L = 4 + hashNoise(307, i) * 5 + Math.sin(t / 500 + i) * 1;
      ribbonPath(ctx, [[x, y0], [x, y0 + L]], (tt) => 1.3 * (1 - tt * 0.5));
      ctx.moveTo(x + 1.3, y0 + L); ctx.arc(x, y0 + L, 1.3, 0, Math.PI * 2);
    }
  }
  ctx.fill();
}

// swing trail: ruled speed lines through the weapon tip's recent path
function swingTrail(ctx, cls, L, P, R, S) {
  const s = P.strike;
  if (!s || s.ph !== 'act' && !(s.ph === 'rec' && s.u < 0.25)) return;
  const u = s.ph === 'act' ? s.u : 1;
  const fade = s.ph === 'act' ? 1 : 1 - s.u * 4;
  const n = 10, tips = [];
  for (let i = 0; i <= n; i++) {
    const uu = u * (i / n);
    const k = strikeKey(L.weapon, 'act', uu, s.combo, s.heavy, cls);
    const r = rig(cls, { ...k, adult: P.adult });
    tips.push([weaponTip(L.weapon, r.hand, r.wpnA), r.sh]);
  }
  const heavy = s.heavy || L.weapon === 'maul';
  const lines = heavy ? 7 : 5;
  // at portrait scale only the last stretch of the arc, ruled finer
  const from = S.hi ? Math.floor(n * 0.45) : 0;
  const k = S.hi ? 0.45 : 1;
  ctx.fillStyle = INK; ctx.beginPath();
  for (let l = 0; l < lines; l++) {
    const f = 0.86 + l * (S.hi ? 0.035 : 0.05);
    const pts = tips.slice(from).map(([tp, sh]) => [sh[0] + (tp[0] - sh[0]) * f, sh[1] + (tp[1] - sh[1]) * f]);
    ribbonPath(ctx, pts, (tt) => (heavy ? 2.2 : 1.5) * k * fade * Math.pow(tt, 1.5) * (0.6 + 0.4 * hashNoise(11, l)));
  }
  ctx.fill();
}

// ---- the body ---------------------------------------------------------------------------
const WLEN = { sabre: 60, quill: 64, knives: 21, maul: 66, pole: 80, censer: 33 };
function figure(ctx, L, P, S) {
  const R = rig(L.cls, P);
  if (P.plantBack) {
    // drag the weapon behind: its head resting on the floor
    const c = clamp((-R.hand[1] - 13) / 64, -1, 1);
    R.wpnA = Math.PI * 2 - Math.acos(c);
  }
  if (P.plant) {
    // lean on the weapon: its point on the floor in front
    const len = WLEN[L.weapon] || 60;
    const c = clamp(-R.hand[1] / len, -1, 1);
    R.wpnA = Math.acos(c);
  }
  S.cls = L.cls; S.weapon = L.weapon; S.charm = L.charm;
  swingTrail(ctx, L.cls, L, P, R, S);
  const out = drawFighterBody(ctx, R, P, S);
  if (S.ward || P.wardBuild) ward(ctx, L.cls, S, S.ward ? 1 : P.wardBuild);
  return { R, ...out };
}

export function drawAgent(ctx, world, t) {
  const a = world.agent;
  const f = a.facing || 1;
  const accent = a.accent || AGENT_COLORS[a.id] || '#c4612f';
  const L = loadoutOf(a);
  const blinkInv = a.invulnT > 0 && a.state !== 'dead' && Math.floor(t / 50) % 2 === 0;
  // the stage may draw the fighter enlarged (1.45x): the engraving follows the size it lands at
  const m0 = ctx.getTransform();
  const dev0 = Math.sqrt(Math.abs(m0.a * m0.d - m0.b * m0.c)) || 1;
  const S = { accent, t, hi: false, lod: dev0 >= 2.2 ? 2 : dev0 >= 1.2 ? 1 : 0, D: 1 / dev0, drag: 0, sway: 0, ward: !!a.ward };

  blinkTrail(ctx, a, L, t);

  ctx.save();
  ctx.translate(a.x, GROUND_Y - (a.y || 0));

  // shadow: a flat ink slab with dry-brush tails, as wide as the body
  {
    const k = clamp(1 - (a.y || 0) / 200, 0.2, 1);
    const wide = L.cls === 'penitent' ? 1.35 : L.cls === 'warden' ? 1.2 : L.cls === 'thief' ? 0.9 : 1;
    ctx.fillStyle = INK;
    ctx.beginPath();
    ctx.ellipse(0, (a.y || 0) + 2, 18 * k * wide, 2.6 * k, 0, 0, Math.PI * 2);
    ribbonPath(ctx, [[-30 * k * wide, (a.y || 0) + 2.5], [0, (a.y || 0) + 2], [30 * k * wide, (a.y || 0) + 2.5]], (tt) => 2.2 * Math.sin(Math.PI * tt) * k);
    ctx.fill();
  }

  if (a.state === 'roll') { drawRoll(ctx, a, L, accent, t); ctx.restore(); return; }

  if (a.state === 'dead') {
    const p = clamp(a.stateT / 500, 0, 1);
    ctx.rotate(-f * Math.PI / 2 * easeOutCubic(p));
    ctx.translate(0, -4);
  }

  ctx.scale(f, 1);
  if (blinkInv) ctx.globalAlpha = 0.55;
  // a pale rim lifts the small black figure off the boss's black wings when they overlap
  if (world.boss && Math.abs(a.x - world.boss.x) < 230 && a.state !== 'dead') { ctx.shadowColor = PAPER; ctx.shadowBlur = 7; }

  S.sway = Math.sin(t / 700) * 2.2 + Math.sin(t / 290) * 0.5;
  const P = statePose(a, L, S, t);
  S.sway += S.drag * 4;
  figure(ctx, L, P, S);
  ctx.restore();
}

function drawRoll(ctx, a, L, sash, t) {
  const p = clamp(a.stateT / ((AGENT.roll && AGENT.roll.ms) || 460), 0, 1);
  const k = L.cls === 'thief' ? 0.82 : L.cls === 'penitent' ? 1.22 : L.cls === 'warden' ? 1.12 : L.cls === 'hexer' ? 1.06 : 1;
  ctx.translate(0, -22 * k);
  ctx.scale(a.rollDir || 1, 1);
  ctx.fillStyle = INK;
  ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const y = (-16 + i * 6.5) * k;
    const Ln = 26 + hashNoise(9, i) * 22;
    ribbonPath(ctx, [[-14 * k - Ln, y], [-14 * k, y]], (tt) => 1.3 * tt);
  }
  ctx.fill();
  // the sash trails the tumble, so the ball is plainly the contender and not a thing on the floor
  if (sash) {
    ctx.fillStyle = sash;
    ctx.beginPath();
    ribbonPath(ctx, [[-10 * k, -6 * k], [-34 * k, -12 * k], [-62 * k, -4 * k]], (tt) => 5.5 * (1 - tt * 0.7));
    ribbonPath(ctx, [[-10 * k, 2 * k], [-30 * k, 8 * k], [-50 * k, 4 * k]], (tt) => 4 * (1 - tt * 0.7));
    ctx.fill();
    ctx.fillStyle = INK;
  }
  const ball = spline([[-18, 2], [-12, -14], [4, -19], [17, -8], [16, 8], [2, 18], [-14, 14]].map(([x, y]) => [x * k, y * k]), 3, true);
  const ease = (u) => 1 - (1 - u) * (1 - u);
  for (let g = 2; g >= 1; g--) {
    const pg = Math.max(0, p - g * 0.11);
    const back = (ease(p) - ease(pg)) * (a.rollDist || 230);
    if (back < 6) continue;
    ctx.save();
    ctx.translate(-back, 0);
    ctx.rotate(pg * Math.PI * 2);
    ctx.globalAlpha = 0.5 / g;
    ctx.beginPath(); polyPath(ctx, ball);
    ctx.fillStyle = PAPER; ctx.fill();
    ctx.lineWidth = 1.5; ctx.strokeStyle = INK; ctx.stroke();
    ctx.restore();
  }
  ctx.rotate(p * Math.PI * 2);
  ctx.beginPath(); polyPath(ctx, ball);
  ctx.lineJoin = 'round';
  ctx.lineWidth = 11; ctx.strokeStyle = INK; ctx.stroke();
  ctx.lineWidth = 7; ctx.strokeStyle = a.iframes ? PAPER : BONE; ctx.stroke();
  poly(ctx, ball, INK);
  ctx.fillStyle = PAPER;
  ctx.beginPath();
  penPath(ctx, quad([-10 * k, -8 * k], [2 * k, -14 * k], [12 * k, -4 * k], 5), 1.4, 0.3, 0.3);
  penPath(ctx, quad([-12 * k, 6 * k], [0, 12 * k], [10 * k, 6 * k], 5), 1.1, 0.3, 0.3);
  ctx.fill();
  // what sticks out of the tumble tells the class
  ctx.fillStyle = INK; ctx.beginPath();
  if (L.cls === 'hexer') spikePath(ctx, [-4, -17 * k], [-20, -30 * k], 7, -3);
  if (L.cls === 'archivist') ribbonPath(ctx, [[-16, -15], [0, -21], [16, -14]], () => 3.2);
  ctx.fill();
  if (L.cls === 'warden') {
    ctx.fillStyle = PAPER; ctx.beginPath(); ribbonPath(ctx, spline([[14 * k, -14 * k], [21 * k, 0], [14 * k, 15 * k]], 3), () => 5); ctx.fill();
    ctx.fillStyle = INK; ctx.beginPath(); ribbonPath(ctx, spline([[17 * k, -16 * k], [25 * k, 0], [17 * k, 17 * k]], 3), () => 2); ctx.fill();
  }
  if (L.cls === 'penitent') {
    ctx.fillStyle = BONE; ctx.beginPath(); ctx.ellipse(10 * k, 10 * k, 6, 4.5, 0.6, 0, Math.PI * 2); ctx.fill();
    ctx.lineWidth = 1.2; ctx.strokeStyle = INK; ctx.stroke();
  }
  ctx.fillStyle = sash;
  ctx.beginPath(); ribbonPath(ctx, [[-6 * k, -16 * k], [-18 * k, -20 * k], [-28 * k, -14 * k]], (tt) => 4 - tt * 3); ctx.fill();
}

// Margin Step: torn-paper afterimages left where the petitioner was.
function blinkTrail(ctx, a, L, t) {
  let from = null, to = a.x, age = 0;
  if (a.blink && typeof a.blink === 'object') { from = a.blink.from; to = a.blink.to ?? a.x; age = a.blink.t || 0; }
  else if (typeof a.blinkFrom === 'number') { from = a.blinkFrom; age = a.blinkT || 0; }
  if (from == null || age > 700 || Math.abs(to - from) < 10) return;
  const fade = 1 - age / 700;
  const C = CLS[L.cls] || CLS.duelist;
  const H = C.hipH + C.torso + 20;
  ctx.save();
  for (let i = 0; i < 3; i++) {
    const x = lerp(from, to, (i + 0.5) / 3.5);
    const k = fade * (0.35 + i * 0.2);
    // a tall scrap torn to roughly the figure's outline
    const pts = [];
    const n = 16;
    for (let j = 0; j < n; j++) {
      const s = j / n;
      const ang = s * Math.PI * 2;
      const base = [Math.sin(ang) * 11, -H / 2 - Math.cos(ang) * H / 2];
      const tear = (hashNoise(401 + i, j) - 0.5) * 5;
      pts.push([x + base[0] + tear, GROUND_Y + base[1] + tear * 0.6]);
    }
    ctx.globalAlpha = k;
    ctx.fillStyle = PAPER; ctx.beginPath(); polyPath(ctx, pts); ctx.fill();
    hatchIn(ctx, pts, { mode: 'shadow', color: INK, gap: 2.2, w: 0.9, angle: 0.5, lo: 0.2, seed: 403 + i });
    contour(ctx, pts, { min: 0.5, max: 1.4, breaks: true, seed: 405 + i });
  }
  ctx.restore();
}

// ---- portraits ----------------------------------------------------------------------------
// (x, y) is the floor point between the feet. `scale` multiplies the fight-scale figure
// (scale 4 -> about 360 px tall). Poses: idle ready strike guard cast hex victory fallen.
export function drawFighterFigure(ctx, { loadout, x, y, scale = 4, facing = 1, pose = 'idle', t = 0, accent = '#c4612f', ground = true } = {}) {
  ctx.save();
  ctx.translate(x, y);
  ctx.scale(scale * (facing < 0 ? -1 : 1), scale);
  // engraving (and the adult proportions) switch on by the size the figure lands on the
  // screen, not the argument
  let m = ctx.getTransform();
  let dev = Math.sqrt(Math.abs(m.a * m.d - m.b * m.c)) || scale;
  const hi = dev >= 2.2;
  if (hi) { ctx.scale(1 / ADULT.height, 1 / ADULT.height); dev /= ADULT.height; }
  const S = { accent, t, hi, adult: hi, lod: hi ? 2 : dev >= 1.2 ? 1 : 0, D: 1 / dev, drag: 0, sway: Math.sin(t / 700) * 2.2 + Math.sin(t / 290) * 0.5 };
  if (!loadout || !loadout.cls) {
    if (ground) groundHatch(ctx, S, 1);
    unwritten(ctx, S);
    ctx.restore();
    return;
  }
  const L = { cls: CLS[loadout.cls] ? loadout.cls : 'duelist', weapon: WPN[loadout.weapon] ? loadout.weapon : 'sabre', spell: loadout.spell || null, charm: loadout.charm || null };
  const P = namedPose(pose, L, S, t);
  if (pose === 'strike') S.drag = 0.5;
  if (pose === 'fallen') S.drag = -0.3;
  if (ground) groundHatch(ctx, S, L.cls === 'penitent' || L.cls === 'warden' ? 1.25 : 1);
  figure(ctx, L, P, S);
  ctx.restore();
}

// engraved floor under the feet: ruled lines thickening toward the middle
function groundHatch(ctx, S, wide) {
  ctx.fillStyle = INK; ctx.beginPath();
  for (let i = 0; i < 6; i++) {
    const y = 1 + i * 1.6;
    const half = (34 - i * 3.5) * wide;
    const x0 = -half + (hashNoise(501, i) - 0.5) * 6;
    ribbonPath(ctx, [[x0, y], [0, y + 0.1], [half + (hashNoise(502, i) - 0.5) * 6, y]], (tt) => (i === 0 ? 1.6 : 0.9) * S.D * 2 * Math.sin(Math.PI * tt) + 0.02);
  }
  ctx.fill();
  ctx.fillStyle = INK; ctx.beginPath(); ctx.ellipse(0, 1.2, 16 * wide, 1.8, 0, 0, Math.PI * 2); ctx.fill();
}

// a fighter who has not chosen a class yet: a lay figure in broken ink, no features
function unwritten(ctx, S) {
  const R = rig('duelist', { ...WPN.sabre.rest, offA: 0.15, offBend: 0.15, armA: 0.25, bend: 0.15, adult: !!S.adult, lean: -0.05 });
  const parts = [];
  const limb = (a, b, w0, w1) => parts.push(ribbonPts([a, mix(a, b, 0.5), b], (tt) => w0 - (w0 - w1) * tt));
  limb(R.shF, R.elbowF, 5, 4); limb(R.elbowF, R.handF, 4, 3.2);
  for (let i = 0; i < 2; i++) { limb(R.hip, R.knees[i], 7, 5); limb(R.knees[i], R.feet[i], 5, 3.4); }
  parts.push(spline([add(R.sh, [-6, 2]), add(R.sh, [6, 1]), add(R.hip, [6, -4]), add(R.hip, [-6, -2])], 3, true));
  limb(R.sh, R.elbow, 5, 4); limb(R.elbow, R.hand, 4, 3.2);
  const hk = S.adult ? 0.8 : 1;
  parts.push(ellPts(R.sh[0] + 2, R.sh[1] - 10 * hk, 6.4 * hk, 7.6 * hk, 0.1, 24));
  ctx.fillStyle = INK;
  ctx.beginPath();
  const w = Math.max(0.9, 2.0 * S.D);
  const dense = (run) => { const o = [run[0]]; for (let i = 1; i < run.length; i++) for (let k = 1; k <= 4; k++) o.push(mix(run[i - 1], run[i], k / 4)); return o; };
  for (const pts of parts) {
    const loop = pts.concat([pts[0]]);
    // walk the outline, inking dashes and leaving gaps
    let acc = 0, on = true, run = [loop[0]];
    const dash = 3.4, gap = 1.8;
    for (let i = 1; i < loop.length; i++) {
      const a = loop[i - 1], b = loop[i];
      let seg = Math.hypot(b[0] - a[0], b[1] - a[1]), pos = 0;
      while (pos < seg) {
        const left = (on ? dash : gap) - acc;
        const step = Math.min(left, seg - pos);
        pos += step; acc += step;
        const p = mix(a, b, pos / seg);
        if (on) run.push(p);
        if (acc >= (on ? dash : gap) - 1e-6) {
          if (on && run.length > 1) penPath(ctx, dense(run), w, 0.25, 0.25);
          on = !on; acc = 0; run = [p];
        }
      }
    }
    if (on && run.length > 1) penPath(ctx, dense(run), w, 0.25, 0.25);
  }
  ctx.fill();
}

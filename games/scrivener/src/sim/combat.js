// Hazards, hit resolution, i-frames, poise, hit-stop. Owner: core. Pure (no DOM).
//
// Hazard = any boss-owned damaging/pushing thing in the world:
//   { id, kind: 'melee'|'page'|'shockwave'|'detonation'|'storm_page'|'gust',
//     owner, attackId, hitIndex, x0,x1,y0,y1 (world rect, y = height above floor),
//     vx, vy (px/s), age, ttl, delay (ms before it can hurt), damage, poise, kb, desc,
//     follow (melee: rect follows boss using fx0/fx1/by0/by1 + facing),
//     followAgent (detonation: centered on the agent), push/reach (gust),
//     hit (already hurt the agent), dodged (an i-frame dodge was registered) }
//
// Events emitted here: 'hit', 'dodge', 'hitstop', 'shake', 'poise.break', 'agent.death',
//   'agent.guard', 'ward.break', 'charm.proc', 'spell.hit', 'burn.tick', 'boss.hexed'
//   (+ boss.* via boss.js helpers)
//
// Agent side of a boss hit, in order: i-frames (dodge) -> Blot's ward (swallows it whole) ->
// Brace (front hits cut to a fraction for stamina; the curse column and falling pages less so;
// never a knockdown) -> Trade Blows armour (half damage, no stagger) -> Wax Seal (one killing
// blow leaves 1 hp).
// Boss side: stagger x1.5, temper (small cuts / heavy / spell / fire / from behind), Hex.

import { ARENA } from '../core/constants.js';
import { clamp, overlap } from '../core/math.js';
import { emit } from '../core/events.js';
import { AGENT, agentHurtbox, agentAttackBox, agentAttackStats } from './agent.js';
import { BOSS, staggerBoss, beginPhaseChange, killBoss, bindBoss } from './boss.js';
import { SPELLS } from './loadout.js';

export function spawnHazard(w, h) {
  h.id = w.nextId++;
  h.age = 0;
  h.hit = false;
  h.dodged = false;
  if (h.delay == null) h.delay = 0;
  if (h.follow) syncFollow(w, h);
  w.hazards.push(h);
  return h;
}

export function removeHazards(w, pred) {
  w.hazards = w.hazards.filter((h) => !pred(h));
}

function syncFollow(w, h) {
  const b = w.boss;
  if (h.facing > 0) { h.x0 = b.x + h.fx0; h.x1 = b.x + h.fx1; }
  else { h.x0 = b.x - h.fx1; h.x1 = b.x - h.fx0; }
  h.y0 = b.y + h.by0;
  h.y1 = b.y + h.by1;
}

export function bossHurtbox(b) {
  return { x0: b.x - BOSS.halfW, x1: b.x + BOSS.halfW, y0: b.y, y1: b.y + BOSS.height - 10 };
}

export function updateHazards(w, dt) {
  const s = dt / 1000;
  const a = w.agent;
  for (const h of w.hazards) {
    h.age += dt;
    if (h.follow) { syncFollow(w, h); continue; }
    if (h.followAgent) {
      const half = h.w / 2;
      h.x0 = a.x - half; h.x1 = a.x + half;
      continue;
    }
    if (h.kind === 'gust') {
      const b = w.boss;
      h.x0 = h.x1 = b.x;
      const d = a.x - b.x;
      if (!a.dead && Math.sign(d) === h.facing && Math.abs(d) <= h.reach && a.state !== 'roll') {
        a.x = clamp(a.x + h.facing * h.push * s, ARENA.left + AGENT.halfW, ARENA.right - AGENT.halfW);
      }
      continue;
    }
    h.x0 += h.vx * s; h.x1 += h.vx * s;
    h.y0 += h.vy * s; h.y1 += h.vy * s;
    if (h.y0 < 0) { // landed
      const hh = h.y1 - h.y0;
      h.y0 = 0; h.y1 = hh; h.vy = 0; h.vx = 0;
      if (!h.landed) { h.landed = true; emit(w, 'hazard.land', { kind: h.kind, x: (h.x0 + h.x1) / 2 }); }
    }
  }
  w.hazards = w.hazards.filter((h) => h.age < h.ttl && h.x1 > ARENA.left - 120 && h.x0 < ARENA.right + 120);
}

// Hit-stop / shake tuning (owner: feedback). Ten Piedad bar: ~117ms global
// freeze when the player is struck; boss hits are carried by a 200ms flash, so
// ours only take a short bite of freeze (light) or a real one (heavy).
export const FEEL = {
  agentHit: { base: 92, perDmg: 1.1, min: 110, max: 160 },
  agentShake: { mag: 5, perDmg: 0.4, ms: 220, msPerDmg: 6 },
  agentDeathStop: 320,
  bossLightStop: 58, bossHeavyStop: 110,
  bossLightShake: [3.5, 150], bossHeavyShake: [8, 280],
  killStop: 420, killShake: [16, 820],
  phaseStop: 240, phaseShake: [11, 650],
  staggerStop: 190, staggerShake: [12, 480],
};

function hitstop(w, ms) {
  w.hitstop = Math.max(w.hitstop, ms);
  emit(w, 'hitstop', { ms });
}

export function resolveCombat(w) {
  const a = w.agent, b = w.boss;

  if (!a.dead) {
    const hb = agentHurtbox(a);
    for (const h of w.hazards) {
      if (h.damage <= 0 || h.hit || h.age < h.delay) continue;
      if (!overlap(h, hb)) continue;
      if (w.probe) { if (w.probe.t == null) w.probe.t = w.t; continue; } // look-ahead: record contact only
      if (a.iframes && !(h.kind === 'detonation' && w.boss.mods.curseSure)) {
        if (!h.dodged) {
          h.dodged = true;
          w.log.dodges += 1;
          if (a.stats.riposte) a.riposte = true;
          emit(w, 'dodge', { attackId: h.attackId, kind: h.kind, x: a.x, y: a.y + 40 });
        }
        continue;
      }
      if (a.invulnT > 0) continue;
      h.hit = true;
      damageAgent(w, a, h);
      if (a.dead) break;
    }
  }

  if (b.state !== 'dead' && !b.invuln && !a.dead) {
    const box = agentAttackBox(a);
    if (box && !a.attackHitDone && overlap(box, bossHurtbox(b))) {
      a.attackHitDone = true;
      const st = agentAttackStats(w, a);
      if (st.riposte) a.riposte = false;
      damageBoss(w, st.dmg, st.poise, st.kind, { riposte: st.riposte, trade: st.trade });
      const S = a.stats;
      if (b.state !== 'dead') {
        if (S.burn) igniteBoss(w, S.burn.ms, S.burn.dps);
        if (S.emberBurn) igniteBoss(w, S.emberBurn.ms, S.emberBurn.dps);
      }
      if (a.echo > 0 && b.state !== 'dead' && !b.invuln) {
        a.echo -= 1;
        const dealt = damageBoss(w, st.dmg, Math.round(st.poise / 2), st.kind, { echo: true });
        emit(w, 'spell.hit', { spell: 'echo', damage: dealt, x: b.x });
      }
    }
  }
}

// ---- spells, bolts, burn ---------------------------------------------------------------------

// A cast reaching its effect frame this tick (agent.js sets a.castFx).
export function applyCasts(w) {
  const a = w.agent, b = w.boss;
  const id = a.castFx;
  if (!id) return;
  a.castFx = null;
  const P = a.stats.spellPower;
  if (id === 'hex') {
    b.hexMs = AGENT.hex.ms;
    emit(w, 'boss.hexed', { ms: b.hexMs, x: b.x });
    igniteBoss(w, AGENT.hex.burn.ms, AGENT.hex.burn.dps * P);
    return;
  }
  const Sp = SPELLS[id];
  if (id === 'candle') {
    const dir = Math.sign(b.x - a.x) || a.facing;
    w.bolts.push({
      id: w.nextId++, spell: 'candle', x: a.x + dir * 30, y: 110, vx: dir * Sp.speed, age: 0, ttl: 1600,
      damage: Sp.damage * P, burn: Sp.burn,
    });
  } else if (id === 'blot') {
    a.ward = Sp.wardMs;
  } else if (id === 'knot') {
    const ok = bindBoss(w, b, Sp.bindMs);
    if (ok) emit(w, 'spell.hit', { spell: 'knot', damage: 0, x: b.x });
  } else if (id === 'mend') {
    const before = a.hp;
    a.hp = Math.min(a.maxHp, a.hp + Math.round(Sp.heal * P));
    emit(w, 'spell.hit', { spell: 'mend', damage: 0, heal: a.hp - before, x: a.x });
  } else if (id === 'echo') {
    a.echo = a.stats.strike === 'heavy' ? 1 : a.stats.combos;
  }
}

export function updateBolts(w, dt) {
  if (!w.bolts.length) return;
  const b = w.boss;
  const hb = bossHurtbox(b);
  for (const o of w.bolts) {
    o.age += dt;
    o.x += o.vx * dt / 1000;
    const box = { x0: o.x - 14, x1: o.x + 14, y0: o.y - 14, y1: o.y + 14 };
    if (b.state !== 'dead' && !b.invuln && overlap(box, hb)) {
      o.ttl = 0;
      const dealt = damageBoss(w, o.damage, 12, 'spell', { fire: true });
      emit(w, 'spell.hit', { spell: o.spell, damage: dealt, x: o.x });
      if (o.burn && b.state !== 'dead') igniteBoss(w, o.burn.ms, o.burn.dps * w.agent.stats.spellPower);
    }
  }
  w.bolts = w.bolts.filter((o) => o.age < o.ttl && o.x > ARENA.left - 60 && o.x < ARENA.right + 60);
}

export function igniteBoss(w, ms, dps) {
  const b = w.boss;
  if (b.burnMs <= 0) { b.burnTickT = 0; emit(w, 'burn.start', { x: b.x, ms }); }
  b.burnMs = Math.max(b.burnMs, ms);
  b.burnDps = Math.max(b.burnMs > 0 ? b.burnDps : 0, dps);
}

const BURN_TICK = 500;
export function updateBurn(w, dt) {
  const b = w.boss;
  if (b.burnMs <= 0) return;
  b.burnMs = Math.max(0, b.burnMs - dt);
  b.burnTickT += dt;
  if (b.state === 'dead') { b.burnMs = 0; return; }
  if (b.burnTickT >= BURN_TICK || b.burnMs <= 0) {
    const secs = Math.min(b.burnTickT, BURN_TICK) / 1000;
    b.burnTickT = 0;
    if (b.invuln) return;
    b.burnAcc += b.burnDps * secs * b.mods.fireMul * (b.hexMs > 0 ? hexMul(b) : 1);
    const dmg = Math.floor(b.burnAcc);
    if (dmg <= 0) return;
    b.burnAcc -= dmg;
    applyBossHp(w, dmg);
    emit(w, 'burn.tick', { damage: dmg, x: b.x, msLeft: b.burnMs });
  }
  if (b.burnMs <= 0) b.burnDps = 0;
}

// Is the hazard in front of a guarding agent (the shield faces the boss)?
function fromFront(w, a, h) {
  if (h.kind === 'melee' || h.kind === 'gust') return Math.sign(w.boss.x - a.x) === a.facing || Math.abs(w.boss.x - a.x) < 2;
  const hc = (h.x0 + h.x1) / 2;
  return Math.sign(hc - a.x) === a.facing || Math.abs(hc - a.x) < AGENT.halfW;
}

// The Hex mark is a spell: its bonus grows with the temper's spell multiplier (Iron-bound).
export const hexMul = (b) => 1 + (AGENT.hex.mul - 1) * ((b.mods && b.mods.spellMul) || 1);

export function damageAgent(w, a, h) {
  const b = w.boss;
  const S = a.stats;
  let raw = a.godMode ? 0 : h.damage;
  let knock = true;   // a hit puts the agent in hitstun
  let guarded = false;

  // Blot: the ward swallows the whole blow
  if (a.ward > 0 && raw > 0) {
    a.ward = 0;
    a.invulnT = S.hitInvuln;
    w.log.wardBlocks = (w.log.wardBlocks || 0) + 1;
    emit(w, 'ward.break', { x: a.x, prevented: Math.round(raw), attackId: h.attackId });
    emit(w, 'spell.hit', { spell: 'blot', damage: 0, blocked: Math.round(raw), x: a.x });
    return;
  }

  let dmgF = raw;
  if (h.kind === 'detonation') dmgF *= S.curseTake;
  // Brace: front hits for a fraction and stamina, never a knockdown
  if (a.state === 'guard' && raw > 0) {
    const G = S.guard;
    let take = G.take;
    if (h.kind === 'detonation') take = G.detonation;          // the curse rises from under the shield
    else if (h.kind === 'storm_page') take = G.storm;           // pages fall from above it
    else if (!fromFront(w, a, h)) take = 1;                      // from behind: no shield there
    if (take < 1) {
      const cost = raw * G.staminaPer;
      let broken = false;
      if (a.stamina < cost) { broken = true; take = Math.min(1, take + 0.35); }
      a.stamina = Math.max(0, a.stamina - cost);
      a.staminaT = 0;
      dmgF = raw * take;
      guarded = !broken;
      if (guarded) a.riposte = true; // the shield bash back: next strike hits harder
      knock = broken;
      a.guardBlocks += 1;
      emit(w, 'agent.guard', { x: a.x, blocked: true, broken, damage: Math.round(dmgF), prevented: Math.round(raw - dmgF), attackId: h.attackId, kind: h.kind });
    }
  }
  // Trade Blows: armoured from the decision until the attack is over
  const armoured = !!(a.plan && !a.plan.done && a.plan.move === 'trade');
  if (armoured && !guarded) { dmgF *= S.trade.take; knock = false; }

  let dmg = Math.round(dmgF);
  if (raw > 0 && dmg < 1) dmg = 1;
  // Wax Seal: survive one killing blow
  if (S.seal && !a.sealUsed && dmg >= a.hp && a.hp > 0) {
    a.sealUsed = true;
    dmg = Math.max(0, a.hp - 1);
    emit(w, 'charm.proc', { charm: 'seal', x: a.x, attackId: h.attackId });
  }
  a.hp = Math.max(0, a.hp - dmg);
  if (dmg > 0 && h.owner === 'boss') b.landed = true;
  a.invulnT = S.hitInvuln;
  if (!guarded) a.riposte = false;
  w.log.damageTaken += dmg;
  if (w.current) w.current.damageTaken += dmg;
  w.log.lastHitBy = { attackId: h.attackId, kind: h.kind, hitIndex: h.hitIndex || 0, desc: h.desc || '' };

  let dir;
  if (h.kind === 'melee' || h.kind === 'detonation') dir = Math.sign(a.x - b.x) || -b.facing;
  else dir = Math.sign(h.vx) || Math.sign(a.x - b.x) || 1;

  const heavy = knock && h.poise >= 30;
  if (knock) {
    a.state = 'hitstun';
    a.stateT = 0;
    a.hitstunMs = heavy ? S.hitstun.heavy : S.hitstun.light;
    a.kbV = dir * h.kb;
    a.combo = 0;
  } else if (guarded) {
    a.x = clamp(a.x + dir * h.kb * S.guard.kbMul * 0.25, ARENA.left + AGENT.halfW, ARENA.right - AGENT.halfW);
  }

  emit(w, 'hit', {
    target: 'agent', attacker: 'boss', attackId: h.attackId, kind: h.kind, damage: dmg,
    x: a.x, y: a.y + 50, dir, heavy, guarded, armoured: armoured && !guarded,
  });
  const H = FEEL.agentHit, Sh = FEEL.agentShake;
  hitstop(w, clamp(H.base + dmg * H.perDmg, H.min, H.max));
  emit(w, 'shake', { mag: Sh.mag + dmg * Sh.perDmg, ms: Sh.ms + dmg * Sh.msPerDmg });

  if (a.hp <= 0) {
    a.dead = true;
    a.state = 'dead';
    a.stateT = 0;
    a.y = 0;
    w.outcome = 'agent_dead';
    w.log.killedBy = { ...w.log.lastHitBy };
    emit(w, 'agent.death', { x: a.x, attackId: h.attackId });
    hitstop(w, FEEL.agentDeathStop);
  }
}

// kind: 'light' | 'heavy' | 'spell'. opts: { fire, riposte, trade, echo }. Returns damage dealt.
export function damageBoss(w, amount, poiseDmg, kind, opts = {}) {
  const b = w.boss, a = w.agent;
  const M = b.mods;
  const staggered = b.state === 'stagger';
  let mul = staggered ? BOSS.staggerDmgMul : 1;
  if (kind === 'light') mul *= M.lightMul;
  else if (kind === 'heavy') mul *= M.heavyMul;
  else if (kind === 'spell') mul *= M.spellMul;
  if (opts.fire) mul *= M.fireMul;
  const behind = Math.sign(a.x - b.x) === -b.facing;
  if (behind && kind !== 'spell') mul *= M.backMul;
  if (b.hexMs > 0) mul *= hexMul(b);
  const dmg = Math.max(1, Math.round(amount * mul));
  b.poiseT = 0;
  if (!staggered) b.poise -= poiseDmg;
  if (b.writing) {
    b.curseHitsN = (b.curseHitsN || 0) + 1;
    if (b.curseHitsN >= (M.curseHits || 1)) b.curseBroken = true;
  }

  const heavy = kind === 'heavy';
  emit(w, 'hit', {
    target: 'boss', attacker: 'agent', kind, damage: dmg,
    x: b.x - Math.sign(b.x - a.x) * 40, y: 170 + b.y, dir: a.facing, heavy, staggered,
    weapon: kind === 'spell' ? null : a.loadout.weapon, fire: !!opts.fire, riposte: !!opts.riposte,
    trade: !!opts.trade, echo: !!opts.echo, behind, hexed: b.hexMs > 0,
  });
  hitstop(w, heavy ? FEEL.bossHeavyStop : FEEL.bossLightStop);
  const bs = heavy ? FEEL.bossHeavyShake : FEEL.bossLightShake;
  emit(w, 'shake', { mag: bs[0], ms: bs[1] });
  applyBossHp(w, dmg, true);
  return dmg;
}

// Take hp off the boss and run death / phase change / poise break. `struck` = a real blow
// (burn ticks never break its stance).
export function applyBossHp(w, dmg, struck = false) {
  const b = w.boss;
  b.hp = Math.max(0, b.hp - dmg);
  w.log.damageDealt += dmg;
  if (w.current) w.current.damageDealt += dmg;
  w.log.bossHpMin = Math.min(w.log.bossHpMin, b.hp / b.maxHp);
  if (b.hp <= 0) {
    killBoss(w, b);
    hitstop(w, FEEL.killStop);
    emit(w, 'shake', { mag: FEEL.killShake[0], ms: FEEL.killShake[1] });
  } else if (b.phase === 1 && b.hp <= b.maxHp * 0.5 && b.state !== 'phase_change') {
    beginPhaseChange(w, b);
    hitstop(w, FEEL.phaseStop);
    emit(w, 'shake', { mag: FEEL.phaseShake[0], ms: FEEL.phaseShake[1] });
  } else if (struck && b.poise <= 0 && b.state !== 'stagger' && b.state !== 'phase_change') {
    emit(w, 'poise.break', { x: b.x });
    staggerBoss(w, b);
    hitstop(w, FEEL.staggerStop);
    emit(w, 'shake', { mag: FEEL.staggerShake[0], ms: FEEL.staggerShake[1] });
  }
}

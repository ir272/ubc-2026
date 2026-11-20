// The fight view: the stage's own copy of the sim, replayed from the feed. Owner: lead.
//
// The channel and the stage run the same deterministic world from the same seed. The world
// freezes itself at each decision, so all the stage needs from the feed is `attempt.start`
// and each `decide.made`. `decide.open` carries the frozen world as JSON for late joiners
// and for a client whose copy has drifted.
//
// The decision moment never leaves the fight: time eases down as the tell begins, the camera
// leans in, the move menu opens beside the fighter (drawn by fight_hud.js), the answer is
// struck in, time comes back.

import { TICK_MS, GROUND_Y } from '../core/constants.js';
import { createBus } from '../core/events.js';
import { clamp, lerp, easeInOut } from '../core/math.js';
import { createWorld, stepWorld, applyDecision, moveState } from '../sim/world.js';
import { agentController } from '../ai/reflex.js';
import { ATTACKS } from '../sim/attacks.js';
import * as bossSim from '../sim/boss.js';
import { drawArena, drawArenaFront } from '../render/arena.js';
import { drawBoss, drawHazards, drawCurseMark } from '../render/boss_draw.js';
import * as agentDraw from '../render/agent_draw.js';
import { setPaperHold } from '../render/boss_pose.js';
import { offscreen } from '../render/ink.js';
import { createFx } from '../fx/index.js';
import { unpackWorld } from '../show/attempt.js';
import { T } from '../show/timing.js';

const W = 1280, H = 720;
const MENU_MIN_MS = 750;      // a menu is on screen at least this long before its answer lands
const STAMP_MS = 1300;         // the answer is held this long before time resumes
const SLOW_FLOOR = 0.22;      // time scale at the freeze point
const RESUME_MS = 380;        // ramp back to full speed
const HARD_RESYNC_MS = 7000;
export const FIGHTER_SCALE = 2.0; // render only: the body is drawn a little larger than it fights  // further behind than this: jump instead of catching up

import { drawSpellFx as spellFx } from '../render/items_draw.js';
let spellFxWarned = false;
const HOLD = { on: false, tremble: 0, creep: 0 }; // the decision hold: the wind-up strains instead of freezing

// The art reads a few names the sim spells differently. A shallow view per frame bridges them
// without touching sim state: hex and trade as their own poses, the ward and burn as flags,
// the fighter's bolts as hazards of kind 'bolt'.
function renderView(w) {
  const a = w.agent, b = w.boss;
  const va = { ...a, ward: a.ward > 0, echo: a.echo > 0, blinkT: a.state === 'blink' ? a.stateT : 1e6 };
  if (a.state === 'cast' && a.castSpell === 'hex') va.state = 'hex';
  else if (a.state === 'heavy' && a.plan && !a.plan.done && a.plan.move === 'trade') va.state = 'trade';
  const vb = { ...b, burn: b.burnMs > 0, hexed: b.hexMs > 0 };
  if (w.thinking && HOLD.on) vb.stateT = Math.max(0, b.stateT + HOLD.tremble);
  const bolts = (w.bolts || []).map((o) => ({ kind: 'bolt', id: o.id, x0: o.x - 16, x1: o.x + 16, y0: o.y - 9, y1: o.y + 9, vx: o.vx, age: o.age, ttl: o.ttl, damage: 0 }));
  return { ...w, agent: va, boss: vb, hazards: bolts.length ? w.hazards.concat(bolts) : w.hazards };
}

export function createFightView({ bus, fx, accentOf, onCue = () => {} }) {
  let world = null;
  let meta = null;            // attempt.start data (+ entrantId, n, index)
  let mode = 'idle';          // 'idle' | 'ready' | 'run' | 'think' | 'over'
  let acc = 0;
  let renderT = 0;            // render clock in ms (keeps running through freezes)
  let made = new Map();       // k -> { slot, move, name, line, source, arrived (renderT) }
  let menu = null;            // { k, strokes, attackId, moves, openedAt, made, madeAt, defaulted }
  let debt = 0;               // ms the stage is behind the channel
  let resumeAt = -1e9;        // renderT when time last resumed
  let cam = 0;                // 0..1 lean-in
  let callout = null;         // { text, tone, at }
  let lastClosed = 0;         // decisions already called out
  let strokeAt = -1e9, strokeK = 0;
  let over = null;            // { result, at, local }
  let ready = null;           // { at, entrantId, n, index } walk-on
  let diverged = 0;
  let pan = 0;                // the hall slides a little so the fighter is never cut off at a wall
  // where the hall's points land on screen this frame (camera lean, slide and pan), for anything the HUD pins to a body
  const view = { k: 1, fx: 0, fy: 0, dx: 0, sx(x) { return this.fx + (x - this.fx) * this.k + this.dx; }, sy(y) { return this.fy + (y - this.fy) * this.k; } };
  let band = null;            // the narration band: { kind: 'tell'|'answer'|'result', ... , at }
  let dodged = false;         // an i-frame dodge happened in the current exchange
  let lastResult = null;      // the last result called (kept on the band for a beat after the next tell)
  let flash = null;           // the verdict, large, over the fight for a moment: { verdict, taken, at }
  let ex = null;              // this exchange: { bossHp at its start }: one figure, on the boss bar's own scale
  let bossPop = null;         // the running share of ink this exchange has spilled, shown once, over the boss
  let pops = [];              // floating damage numbers { target, x, y, n, at }

  const info = () => ({ world, meta, mode, menu, renderT, callout, strokeAt, strokeK, over, ready, cam, debt, pops, band, lastResult, flash, view });

  function mark(w) {
    if (w && meta) w.agent.accent = accentOf(meta.entrantId);
    return w;
  }

  function reset() {
    world = null; meta = null; mode = 'idle'; acc = 0; made = new Map(); menu = null; debt = 0;
    callout = null; lastClosed = 0; strokeK = 0; over = null; ready = null; cam = 0; band = null; pops = [];
  }

  // The walk-on: the next fighter comes out while the "how far" window is open.
  function standby(turn, loadout, temper) {
    meta = { ...turn, loadout, temper, handicap: 0 };
    world = mark(createWorld({ seed: 1, agentId: turn.entrantId, loadout, temper, decisions: false }));
    if (world.boss) world.boss.aiLock = true;
    world.agent.x = 60;
    mode = 'ready';
    ready = { at: renderT, ...turn };
    over = null; menu = null; made = new Map(); callout = null; lastClosed = 0; strokeK = 0; cam = 0; debt = 0; band = null; pops = [];
    setPaperHold(1); HOLD.on = false;
    fx.reset();
  }

  function begin(start) {
    meta = { ...start };
    world = mark(createWorld({ seed: start.seed, agentId: start.entrantId, loadout: start.loadout, temper: start.temper, handicap: start.handicap || 0, decisions: true }));
    mode = 'run';
    acc = -T.bell; // the bell rings before the first tick
    made = new Map(); menu = null; over = null; ready = null; callout = null; lastClosed = 0; strokeK = 0; cam = 0; debt = 0; pops = []; band = null; dodged = false; lastResult = null; flash = null; ex = null; bossPop = null;
    setPaperHold(1); HOLD.on = false;
    fx.reset();
    bus.dispatch([{ type: 'match.attempt', agent: start.entrantId, attempt: start.index, t: 0, tick: 0 }]);
  }

  // A late joiner: pick the fight up from what the feed remembers.
  //   start: attempt.start data; decisions: [{ k, open, made }]; sinceMs(at): ms since a feed time
  function resume(start, decisions, sinceMs) {
    begin(start);
    acc = 0;
    const withWorld = decisions.filter((d) => d.open && d.open.world);
    const last = withWorld[withWorld.length - 1];
    if (last) {
      world = mark(unpackWorld(last.open.world));
      lastClosed = world.log.decisions.filter((d) => d.outcome).length;
      strokeK = last.k;
      if (last.made) {
        applyDecision(world, { slot: last.made.slot }, agentController);
        fastForward(Math.max(0, sinceMs(last.made.at) - T.decideStamp));
      } else {
        openMenu();
        menu.openedAt = renderT - sinceMs(last.open.at);
      }
    } else {
      fastForward(Math.max(0, sinceMs(start.at) - T.bell));
    }
    for (const d of decisions) if (d.made && !(last && d.k <= last.k)) made.set(d.k, { ...d.made, arrived: renderT });
  }

  function fastForward(ms) {
    let n = Math.floor(Math.min(ms, 60000) / TICK_MS);
    while (n-- > 0 && !world.thinking && !world.outcome) { stepWorld(world, TICK_MS, agentController); world.events.length = 0; }
    lastClosed = world.log.decisions.filter((d) => d.outcome).length;
    if (world.thinking) openMenu();
    if (world.outcome) { mode = 'over'; over = { result: world.outcome, at: renderT - 4000, local: true }; }
  }

  function openMenu() {
    const th = world.thinking;
    menu = { k: th.k, strokes: th.strokes, attackId: th.attackId, moves: moveState(world), openedAt: renderT, made: null, madeAt: 0 };
    mode = 'think';
    dodged = false;
    ex = { bossHp: world.boss.hp };
    bossPop = null;
    flash = null; // the last call is cleared before a new choice is put
    band = { kind: 'tell', attackId: th.attackId, at: renderT };
    onCue('think.start');
    bus.dispatch([{ type: 'think.start', agent: meta.entrantId, attackId: th.attackId, t: world.t, tick: world.tick }]);
  }

  function onMade(d) {
    if (!meta || d.index !== meta.index) return;
    made.set(d.k, { ...d, arrived: renderT });
  }

  // The channel says the attempt is over. If our copy has not got there, it is behind or has
  // drifted; either way the feed's result is the one shown.
  function onEnd(d) {
    if (!meta || d.index !== meta.index) return;
    if (!over) { over = { result: d.result === 'kill' ? 'boss_dead' : d.result === 'written' ? 'written' : 'agent_dead', at: renderT, local: false }; }
    if (world && !world.outcome && mode !== 'over') {
      // let the local world run on for a moment; if it still disagrees it is simply held
      diverged += 1;
    }
  }

  function drain() {
    if (!world.events.length) return;
    let bossHurt = false;
    for (const e of world.events) {
      if (e.type === 'name.stroke') { strokeAt = renderT; strokeK = e.k; }
      if (e.type === 'dodge') dodged = true;
      // what the fighter takes: one number on its body, in the health bar's own points
      if (e.type === 'hit' && e.target === 'agent' && e.damage > 0) {
        // one number for the whole exchange: it grows if a second blow of the same attack lands
        const lastP = pops[pops.length - 1];
        if (lastP && lastP.k === strokeK) { lastP.n += Math.round(e.damage); lastP.at = renderT; }
        else { pops.push({ target: 'agent', k: strokeK, n: Math.round(e.damage), at: renderT }); if (pops.length > 3) pops.shift(); }
      }
      if ((e.type === 'hit' && e.target === 'boss') || e.type === 'burn.tick') bossHurt = true;
      if (ex && ((e.type === 'hit' && e.target === 'boss') || e.type === 'spell.hit')) ex.struck = true;
      if (ex && e.type === 'spell.hit') ex.spellHit = true;
    }
    // what the boss loses: one running figure for the whole exchange, as a share of its ink,
    // the same scale as its bar and the ledger
    if (bossHurt && ex) {
      const pct = Math.round(((ex.bossHp - world.boss.hp) / world.boss.maxHp) * 100);
      if (pct > 0) bossPop = { pct, x: world.boss.x, at: renderT, since: bossPop ? bossPop.since : renderT };
    }
    bus.dispatch(world.events);
    world.events.length = 0;
  }

  // The result of the exchange. A hit is called on the frame it lands. A clean answer is called
  // only once the boss's attack has passed (it has left its active phase), so the call never
  // runs ahead of the blow and does not have to be taken back. One fixed sentence; only the
  // "dealt" tally beside it counts up while the punish lands.
  const directOf = (kind) => kind === 'strike' || kind === 'trade' || (kind === 'spell' && !!(ex && ex.spellHit));

  function callClosed() {
    const ds = world.log.decisions;
    const rec = world.current || ds[ds.length - 1];
    if (!rec || mode === 'think') return;
    // the answer is already costing the boss ink before its own attack has passed: count it at once
    if (band && band.kind === 'answer' && ex) {
      const d = ex.struck ? Math.max(0, Math.round(((ex.bossHp - world.boss.hp) / world.boss.maxHp) * 100)) : 0;
      if (d !== (band.dealt || 0)) { band.dealt = d; band.bump = renderT; }
      band.direct = directOf(band.moveKind);
    }
    if (band && band.kind === 'result' && band.n === rec.n && rec.outcome && ex) {
      const d = ex.struck ? Math.max(0, Math.round(((ex.bossHp - world.boss.hp) / world.boss.maxHp) * 100)) : 0;
      if (d !== band.dealt) { band.dealt = d; band.bump = renderT; }
    }
    const taken = Math.round(rec.damageTaken || 0);
    const b = world.boss;
    const dealt = ex ? Math.max(0, Math.round(((ex.bossHp - b.hp) / b.maxHp) * 100)) : 0; // all the ink the boss lost this exchange (a strike, a spell or a burn), as a share, like the bar
    const passed = !!rec.outcome || world.outcome || !(b.state === 'tell' || b.state === 'active');
    let verdict = null;
    if (world.outcome === 'boss_dead') verdict = 'KILL';
    else if (world.agent.dead && taken > 0) verdict = 'KILLED';
    else if (taken > 0 && rec.kind === 'guard') verdict = 'BRACED';
    else if (taken > 0) verdict = 'HIT';
    else if (passed && (dealt > 0 || dodged || rec.kind === 'evade' || rec.kind === 'guard')) verdict = 'CLEAN';
    // an attack or a spell that has not landed yet is not called "nothing" until the exchange is closed
    else if (rec.outcome || world.outcome) verdict = 'CLEAN';
    if (!verdict) return;
    const same = band && band.kind === 'result' && band.n === rec.n;
    if (same && band.verdict === verdict && band.taken === taken) { if (dealt !== band.dealt) { band.dealt = dealt; band.bump = renderT; } band.direct = directOf(rec.kind); return; }
    band = { kind: 'result', verdict, taken, dealt, direct: directOf(rec.kind), move: rec.name, moveKind: rec.kind, attackId: rec.attackId, n: rec.n, at: same ? band.at : renderT, bump: renderT };
    lastResult = band;
    flash = { verdict, taken, kind: rec.kind, at: renderT };
  }

  // time scale: eases down through the start of a tell so the freeze is arrived at, not hit
  function timeScale() {
    if (!world || mode !== 'run') return 1;
    let s = 1;
    const b = world.boss;
    if (b && b.state === 'tell' && world.decisions && bossSim.thinkAtMs && bossSim.attackLocalMs && ATTACKS[b.attackId]) {
      const at = bossSim.thinkAtMs(ATTACKS[b.attackId]);
      const p = clamp(bossSim.attackLocalMs(b) / Math.max(1, at), 0, 1);
      const answered = world.current && world.current.attackId === b.attackId && world.current.startT >= world.t - 4000 && !world.current.outcome;
      if (!answered) s = lerp(1, SLOW_FLOOR, easeInOut(p));
    }
    const back = clamp((renderT - resumeAt) / RESUME_MS, 0, 1);
    if (back < 1) s = Math.min(s, lerp(SLOW_FLOOR, 1, easeInOut(back)));
    return s;
  }

  function update(dt) {
    renderT += dt;
    fx.tick(dt);
    if (!world) return;

    if (mode === 'ready') {
      // the walk-on, render only: the fighter comes out, the boss turns to meet it
      const a = world.agent, b = world.boss;
      const age = renderT - ready.at;
      const p = clamp(age / 2200, 0, 1);
      a.x = lerp(40, 340, easeInOut(p));
      a.facing = 1;
      // two practice cuts while it waits for the bell
      const beat = [5200, 8600].find((t0) => age >= t0 && age < t0 + 520);
      if (p < 1) { a.state = 'walk'; a.stateT = age; }
      else if (beat != null) { a.state = 'light'; a.stateT = age - beat; a.combo = beat === 5200 ? 0 : 2; }
      else { a.state = 'idle'; a.stateT = age; }
      if (b) {
        const q = clamp(age / 3000, 0, 1);
        b.x = lerp(1010, 900, easeInOut(q));
        b.state = q < 1 ? 'walk' : 'idle';
        b.stateT = age;
        b.facing = -1;
      }
      world.t = age;
      cam = 0;
      return;
    }

    HOLD.on = mode === 'think';
    if (mode === 'think') {
      // the held wind-up strains: a small tremble through the pose, and the paper behind it thins
      const held = renderT - menu.openedAt;
      HOLD.tremble = 44 * Math.sin(held / 210) * Math.min(1, held / 500);
      HOLD.creep = Math.min(1, held / 6000);
      setPaperHold(1 - 0.72 * Math.min(1, held / 500));
      cam = Math.min(1, cam + dt / 420);
      const m = menu;
      const got = made.get(m.k);
      if (got && !m.made && renderT - m.openedAt >= MENU_MIN_MS) {
        m.made = got; m.madeAt = renderT; m.lastName = got.name;
        band = { kind: 'answer', move: got.name, moveKind: (m.moves[got.slot] || {}).kind, attackId: m.attackId, at: renderT };
        debt += Math.max(0, renderT - got.arrived - 60);
        onCue('think.made');
      }
      const hold = debt > 1500 ? 450 : STAMP_MS;
      if (m.made && renderT - m.madeAt >= hold) {
        applyDecision(world, { slot: m.made.slot, thought: m.made.line }, agentController);
        bus.dispatch([{ type: 'think.end', agent: meta.entrantId, action: m.made.move, t: world.t, tick: world.tick }]);
        mode = 'run';
        resumeAt = renderT;
        acc = 0;
        onCue('think.end');
      }
      return;
    }

    cam = Math.max(0, cam - dt / 380);
    setPaperHold(Math.min(1, 0.28 + (renderT - resumeAt) / 260));
    if (mode !== 'run' && mode !== 'over') return;

    // behind the channel: run a little fast until the debt is paid
    let speed = 1;
    if (debt > HARD_RESYNC_MS) debt = HARD_RESYNC_MS; // capped; the menu holds shrink too
    if (debt > 0) { speed = 1 + Math.min(0.6, debt / 3000); debt = Math.max(0, debt - dt * (speed - 1)); }
    acc += dt * speed * timeScale();
    let n = 0;
    while (acc >= TICK_MS && n++ < 12) {
      acc -= TICK_MS;
      if (world.thinking) break;
      stepWorld(world, TICK_MS, agentController);
      drain();
      callClosed();
      if (world.thinking) { openMenu(); break; }
      if (world.outcome && mode !== 'over') {
        mode = 'over';
        if (!over) over = { result: world.outcome, at: renderT, local: true };
        if (world.outcome === 'written') onCue('written');
      }
    }
    if (acc > TICK_MS * 12) acc = 0;
  }

  // ---- drawing -------------------------------------------------------------------------
  function drawWorld(ctx, w, f, t, { actors = true, extend = 0 } = {}) {
    const cm = ctx.getTransform();
    const sh = f.shakeOffset(Math.hypot(cm.a, cm.b) || 1);
    const covered = !w.thinking && f.covers();
    ctx.save();
    ctx.translate(sh.x, sh.y);
    if (!covered) {
      if (extend) {
        ctx.save();
        if (extend < 0) ctx.translate(2 * W, 0);
        ctx.scale(-1, 1);
        drawArena(ctx, w, t); drawArenaFront(ctx, w, t);
        ctx.restore();
      }
      drawArena(ctx, w, t);
      f.drawBehind(ctx, w, t);
      if (actors) {
        const vw = renderView(w);
        drawBoss(ctx, w.thinking && HOLD.on ? vw : w, t);
        drawHazards(ctx, w, t);
        drawFighter(ctx, vw, t);
        if (spellFx) { try { spellFx(ctx, vw, t); } catch (e) { if (!spellFxWarned) { spellFxWarned = true; console.warn('[stage] spell fx failed', e); } } }
        drawCurseMark(ctx, w, t);
      }
      f.drawFront(ctx, w, t);
      drawArenaFront(ctx, w, t);
    }
    ctx.restore();
    if (f.drawPost) f.drawPost(ctx, w, t);
  }

  // The fighter, drawn larger than it fights and lifted off whatever is behind it by a contour
  // of bare paper, the way the boss's own figure is: black on the boss's black would vanish.
  // It is drawn once into a small buffer, a paper-coloured copy is laid under it at eight
  // offsets, then the figure itself goes on top.
  const BUF = 520;
  let figBuf = null, silBuf = null;
  function drawFighter(ctx, vw, t) {
    const a = vw.agent;
    const m = ctx.getTransform();
    const dev = Math.hypot(m.a, m.b) || 1;           // device px per logical px (canvas scale and camera)
    const px = Math.ceil(BUF * Math.min(3, dev));
    if (!figBuf) { figBuf = offscreen(px, px); silBuf = offscreen(px, px); }
    if (figBuf.width !== px) { figBuf.width = figBuf.height = px; silBuf.width = silBuf.height = px; }
    const k = px / BUF;
    const g = figBuf.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.clearRect(0, 0, px, px);
    // the buffer's centre bottom is the fighter's floor point
    g.setTransform(k * FIGHTER_SCALE, 0, 0, k * FIGHTER_SCALE, k * (BUF / 2 - a.x * FIGHTER_SCALE), k * (BUF - 60 - GROUND_Y * FIGHTER_SCALE));
    agentDraw.drawAgent(g, vw, t);
    const sg = silBuf.getContext('2d');
    sg.setTransform(1, 0, 0, 1, 0, 0);
    sg.globalCompositeOperation = 'copy';
    sg.drawImage(figBuf, 0, 0);
    sg.globalCompositeOperation = 'source-in';
    sg.fillStyle = '#e7e0cc';
    sg.fillRect(0, 0, px, px);
    sg.globalCompositeOperation = 'source-over';
    const x0 = a.x - BUF / 2, y0 = GROUND_Y - (BUF - 60);
    const r = 3.2;
    for (let i = 0; i < 8; i++) {
      const an = (i / 8) * Math.PI * 2;
      ctx.drawImage(silBuf, x0 + Math.cos(an) * r, y0 + Math.sin(an) * r, BUF, BUF);
    }
    ctx.drawImage(figBuf, x0, y0, BUF, BUF);
  }

  // A plain world for when no attempt is on (first frames of the fight phase, pair breaks).
  let idleWorld = null;
  function emptyHall() {
    if (!idleWorld) { idleWorld = createWorld({ seed: 7, agentId: 'none', decisions: false }); if (idleWorld.boss) idleWorld.boss.aiLock = true; idleWorld.agent.x = -400; }
    return idleWorld;
  }

  function draw(ctx, { highlight = null } = {}) {
    const w = world || emptyHall();
    ctx.save();
    if (world && mode === 'ready' && ready) {
      // open on the boss, pull back to the hall, then drift toward the fighter until the bell
      const age = renderT - ready.at;
      const pull = easeInOut(clamp(age / 3200, 0, 1));
      const drift = clamp((age - 3200) / 9000, 0, 1);
      const k = lerp(1.16, 1, pull) + 0.05 * drift;
      const fxp = lerp(900, 640, pull) - 200 * drift;
      const fy = lerp(GROUND_Y - 220, GROUND_Y - 150, pull);
      ctx.translate(fxp, fy); ctx.scale(k, k); ctx.translate(-fxp, -fy);
    } else if (cam > 0 && world) {
      // lean in on the two of them
      const k = 1 + 0.13 * easeInOut(cam) + (mode === 'think' ? 0.04 * HOLD.creep : 0);
      const fxp = clamp(w.agent.x * 0.62 + w.boss.x * 0.38, 300, 980);
      const fy = GROUND_Y - 10;
      // the menu owns the left column while a choice is open: slide the hall so the fighter stands clear of it
      const sx = fxp + (w.agent.x - fxp) * k;
      const slide = mode === 'think' && sx < 460 ? (460 - sx) * easeInOut(cam) : 0;
      if (slide) ctx.translate(slide, 0);
      ctx.translate(fxp, fy); ctx.scale(k, k); ctx.translate(-fxp, -fy);
      view.k = k; view.fx = fxp; view.fy = fy; view.dx = slide;
    }
    if (world && meta && !w.agent.dead) {
      // whose body this is: a short stroke of its colour on the floor; the viewer's own pick gets a full ring
      ctx.save();
      ctx.strokeStyle = accentOf(meta.entrantId);
      ctx.lineWidth = 4;
      ctx.lineCap = 'round';
      if (highlight === meta.entrantId) { ctx.beginPath(); ctx.ellipse(w.agent.x, GROUND_Y + 5, 46, 10, 0, 0, Math.PI * 2); ctx.stroke(); }
      else { ctx.beginPath(); ctx.moveTo(w.agent.x - 34, GROUND_Y + 9); ctx.lineTo(w.agent.x + 34, GROUND_Y + 9); ctx.stroke(); }
      ctx.restore();
    }
    if (!(cam > 0 && world) || mode === 'ready') { view.k = 1; view.fx = 0; view.fy = 0; view.dx = 0; }
    if (world && mode !== 'ready') {
      const want = w.agent.x < 230 ? 230 - w.agent.x : w.agent.x > 1050 ? 1050 - w.agent.x : 0;
      pan += (want - pan) * 0.12;
      if (Math.abs(pan) > 0.5) { ctx.translate(pan * view.k, 0); view.dx += pan * view.k; }
    } else pan = 0;
    drawWorld(ctx, w, fx, renderT, { actors: true, extend: Math.abs(view.dx) > 0.5 ? view.dx : 0 });
    ctx.restore();
    if (cam > 0) {
      // the hall darkens at the edges while time is held
      const g = ctx.createRadialGradient(W / 2, H / 2, 260, W / 2, H / 2, 760);
      g.addColorStop(0, 'rgba(13,12,11,0)');
      g.addColorStop(1, `rgba(13,12,11,${0.5 * easeInOut(cam)})`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, W, H);
    }
  }

  // ---- the deciding moment, again (verdict) ----------------------------------------------
  const rbus = createBus();
  const rfx = createFx(rbus);
  let replay = null; // { index, w, slots, di, endTick, startTick, buf, t, hold }
  const LEAD_TICKS = 330, TAIL_MS = 2600;

  function buildReplay(rec, loadout, temper) {
    const mk = () => {
      const w = createWorld({ seed: rec.seed, agentId: rec.entrantId, loadout, temper, handicap: rec.handicap || 0, decisions: true });
      w.agent.accent = accentOf(rec.entrantId);
      return w;
    };
    const run = (w, until) => {
      let i = 0, guard = 0;
      while (!w.outcome && w.tick < until && guard++ < 40000) {
        if (w.thinking) { const slot = rec.slots[i++]; if (slot == null) break; applyDecision(w, { slot }, agentController); continue; }
        stepWorld(w, TICK_MS, agentController);
        w.events.length = 0;
      }
      return i;
    };
    const w1 = mk();
    run(w1, 1e9);
    const endTick = w1.tick;
    const w2 = mk();
    const di = run(w2, Math.max(0, endTick - LEAD_TICKS));
    return { index: rec.index, w: w2, slots: rec.slots, di, endTick, startDi: di, startTick: w2.tick, rec, loadout, temper, t: 0, acc: 0, done: 0 };
  }

  // Draws the replay into `box`. Returns false when it cannot (no data): the caller keeps a blank leaf.
  function drawReplay(ctx, box, index, age, lookup) {
    if (!replay || replay.index !== index) {
      const src = lookup && lookup(index);
      if (!src || src.rec.seed == null || !Array.isArray(src.rec.slots)) return false;
      try { replay = buildReplay(src.rec, src.loadout, src.temper); } catch (e) { console.warn('[stage] replay failed', e); replay = { index, dead: true }; }
      replay.buf = offscreen(W, H);
      replay.last = age;
      rfx.reset();
    }
    if (replay.dead) return false;
    const dt = clamp(age - replay.last, 0, 100);
    replay.last = age;
    const r = replay;
    rfx.tick(dt * 0.8);
    r.t += dt * 0.8;
    if (!r.w.outcome || r.w.endT < TAIL_MS) {
      r.acc += dt * 0.8;
      while (r.acc >= TICK_MS) {
        r.acc -= TICK_MS;
        if (r.w.thinking) { const slot = r.slots[r.di++]; applyDecision(r.w, { slot: slot == null ? 0 : slot }, agentController); continue; }
        stepWorld(r.w, TICK_MS, agentController);
        if (r.w.events.length) { rbus.dispatch(r.w.events); r.w.events.length = 0; }
      }
    } else {
      r.done += dt;
      if (r.done > 1400) { replay = null; return drawReplay(ctx, box, index, age, lookup); } // again, from the top
    }
    const g = r.buf.getContext('2d');
    g.setTransform(1, 0, 0, 1, 0, 0);
    drawWorld(g, r.w, rfx, r.t, { actors: true });
    // the replay is framed on the two of them, not on the empty hall
    const Z = 1.36, sw = W / Z, sh = H / Z;
    const mid = (r.w.agent.x + r.w.boss.x) / 2;
    const want = clamp(mid - sw / 2, 0, W - sw);
    r.cx = r.cx == null ? want : r.cx + (want - r.cx) * Math.min(1, dt / 260);
    const sy = clamp(GROUND_Y - sh * 0.86, 0, H - sh);
    ctx.drawImage(r.buf, r.cx, sy, sw, sh, box.x, box.y, box.w, box.h);
    return true;
  }

  return { info, reset, standby, begin, resume, onMade, onEnd, update, draw, drawReplay, get world() { return world; }, get meta() { return meta; } };
}

// Everything drawn over the fight that is not the world. Owner: lead.
//
// One broadcast package, thin and flat, so the engraving owns the frame:
//   top strip      ink, flush to the top: the fighter (name, health) on the left, the try's stroke
//                  count in the middle, each contender's best try so far on the right
//   bottom strip   ink, flush to the bottom: the Scrivener's bar filling with the share cut, and that share
//   menu           while a choice is open, an ink column under the top strip: the four moves and a clock
// When a try ends the furniture clears and one full card takes the frame.
// No odds, no pools, no buttons: a candle only says that predictions are open and for how long.

import {
  W, H, INK, CREAM, RED, title, text, rule, roman, caps, numf, paperGround,
  prog, ease, brushBand, clamp, lerp, measureSpaced, predictions, figure,
} from './kit.js';
import { GROUND_Y } from '../core/constants.js';
import { T } from '../show/timing.js';
import { FIGHTER_SCALE } from './fight.js';

const NTH = ['', 'first', 'second', 'last'];
// the one red: the kit's RED on paper, and this brighter oxblood where red sits on black
const LIT = '#cf3530';
const SHEET = '#f1ead7';
const NIGHT = '#0b0a09';
const HAIR = 'rgba(239,232,212,0.26)';  // hairlines and empty tracks on black
const TRACK = '#2a2520';
const STRIP_H = 72;                     // the top strip
const FOOT_Y = 662;                     // where the bottom strip begins
const lagHp = { agent: 1 };

// how tall each class stands (sim units), so marks sit just over its head
const HEAD_H = { thief: 70, penitent: 78, warden: 90, duelist: 92, archivist: 98, hexer: 108 };
// an entrant's colour lifted toward cream, so it reads as type on black
const lift = (hex, k = 0.35) => { const n = parseInt(hex.slice(1), 16); const t = [0xef, 0xe8, 0xd4]; const c = (v, i) => Math.round(v + (t[i] - v) * k).toString(16).padStart(2, '0'); return `#${c(n >> 16, 0)}${c((n >> 8) & 255, 1)}${c(n & 255, 2)}`; };
const cutOf = (w) => clamp(1 - w.boss.hp / w.boss.maxHp, 0, 1);

// ---- top strip, left: the fighter ------------------------------------------------------------------
function fighterPlate(ctx, env, f) {
  const { world: w, meta } = f;
  if (!w || !meta) return;
  const b = env.bot(meta.entrantId);
  const a = w.agent;
  ctx.fillStyle = b.accent; ctx.fillRect(0, 0, 10, STRIP_H);
  const nm = title(ctx, b.name.toUpperCase(), 26, 33, 30, { align: 'left', color: CREAM, spacing: 2, weight: 'bold', maxW: 196 });
  // the fighter's three tries as pips after the name: used, in progress (ringed), still to come (faint)
  const used = env.sh.attempts.filter((q) => q.entrantId === meta.entrantId).length;
  for (let i = 0; i < 3; i++) {
    const px = 26 + nm.width + 18 + i * 16, py = 22;
    ctx.beginPath(); ctx.arc(px, py, 4.5, 0, Math.PI * 2);
    if (i < used) { ctx.fillStyle = CREAM; ctx.fill(); }
    else if (i === meta.n - 1) { ctx.strokeStyle = lift(b.accent); ctx.lineWidth = 2.5; ctx.stroke(); }
    else { ctx.fillStyle = HAIR; ctx.fill(); }
  }

  // health: the bar in the entrant's colour, the number large beside it
  const frac = clamp(a.hp / a.maxHp, 0, 1);
  // the lost part drains in under a second and never lingers while the menu is open, so bar and number agree
  lagHp.agent = lagHp.agent < frac || f.mode === 'think' ? frac : Math.max(frac, lagHp.agent - 0.022);
  const bx = 26, by = 47, bw = 184, bh = 11;
  ctx.fillStyle = TRACK; ctx.fillRect(bx, by, bw, bh);
  if (lagHp.agent > frac) { ctx.fillStyle = 'rgba(239,228,196,0.85)'; ctx.fillRect(bx + bw * frac, by, bw * (lagHp.agent - frac), bh); }
  ctx.fillStyle = b.accent; ctx.fillRect(bx, by, bw * frac, bh);
  const hurt = a.invulnT > 0 && a.state === 'hitstun';
  text(ctx, `${Math.max(0, Math.round(a.hp))}`, bx + bw + 12, 63, numf(30, 'bold'), { color: frac < 0.34 || hurt ? LIT : CREAM });

}

// ---- top strip, centre: the try's clock -------------------------------------------------------------
function strokeClock(ctx, env, f) {
  const { world: w, meta } = f;
  if (!w || !meta) return;
  const strokes = (w.thinking && w.thinking.strokes) || w.strokes || env.sh.strokes || 6;
  const k = Math.min(f.strokeK || 0, strokes);
  // nothing before the first stroke; then the count, centred in the strip
  if (k <= 0) return;
  title(ctx, `STROKE ${k} OF ${strokes}`, 640, 43, 20, { color: CREAM, spacing: 4, weight: 'bold' });
}

// ---- top strip, right: the score bug -----------------------------------------------------------------
function scoreBug(ctx, env, f) {
  const { sh } = env;
  // from the first try on: one figure each, the best so far (the try in progress counts, ticking up)
  const cur0 = f.meta && f.mode !== 'idle' ? f.meta.entrantId : null;
  if (!sh.attempts.length && !cur0) return;
  const live = f.world && f.meta && !sh.attempts.some((q) => q.index === f.meta.index) && (f.mode === 'run' || f.mode === 'think' || f.mode === 'over');
  const ch = 26, right = W - 24;
  sh.order.forEach((id, r) => {
    const b = env.bot(id);
    const cy = r === 0 ? 8 : 39;
    const base = cy + 20;
    const cur = f.meta && f.meta.entrantId === id && f.mode !== 'idle';
    ctx.fillStyle = b.accent; ctx.fillRect(914, cy, 5, ch);
    const tw = title(ctx, b.name.toUpperCase(), 928, base, 20, { align: 'left', color: CREAM, spacing: 1.5, weight: 'bold', maxW: right - 928 - 84 });
    if (cur) { ctx.fillStyle = b.accent; ctx.fillRect(928, base + 4, tw.width, 3); }
    if (env.highlight === id) { ctx.strokeStyle = lift(b.accent); ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(928 + tw.width + 10, base - 6, 4.5, 0, Math.PI * 2); ctx.stroke(); }
    const mine = sh.attempts.filter((q) => q.entrantId === id);
    const now = cur && live ? cutOf(f.world) : 0;
    if (!mine.length && now <= 0) return;
    const kill = mine.some((q) => q.result === 'kill');
    const best = Math.max(now, ...mine.map((q) => q.score || 0));
    text(ctx, kill ? 'KILL' : `${Math.round(best * 100)}%`, right, base, kill ? caps(18, 'bold') : numf(20, 'bold'), { color: kill ? LIT : CREAM, align: 'right' });
  });
}

function topStrip(ctx, env, f) {
  ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, STRIP_H);
  fighterPlate(ctx, env, f);
  strokeClock(ctx, env, f);
  scoreBug(ctx, env, f);
}

// ---- bottom strip: the Scrivener's bar, filling with the share of its ink cut ------------------------------
// the bar, the name and the figure share one centre line in the strip
const BAR = { x: 284, y: 685, w: 852, h: 12 };
// the newest chunk of the cut: cream for a quarter second, then it settles into the fighter's colour
const bossGhost = { v: 1, t: 0, hold: 0 };
function ghostOf(frac, now) {
  const g = bossGhost;
  if (frac >= g.v || now < g.t) { g.v = frac; g.t = now; g.hold = 0; return frac; }
  if (!g.hold) g.hold = now + 250;
  const dt = clamp(now - g.t, 0, 250);
  g.t = now;
  if (now > g.hold) g.v = Math.max(frac, g.v - Math.max((g.v - frac) * dt / 60, 0.001 * dt));
  if (g.v <= frac + 0.001) { g.v = frac; g.hold = 0; }
  return g.v;
}
function footStrip(ctx, env, f) {
  const { world: w, meta } = f;
  if (!w || !w.boss) return;
  ctx.fillStyle = NIGHT; ctx.fillRect(0, FOOT_Y, W, H - FOOT_Y);
  const frac = clamp(w.boss.hp / w.boss.maxHp, 0, 1);
  const ghost = ghostOf(frac, f.renderT);
  const cut = 1 - frac, settled = 1 - ghost;
  const { x, y, w: bw, h: bh } = BAR;
  const mid = y + bh / 2;
  const accent = meta ? env.bot(meta.entrantId).accent : CREAM;

  title(ctx, 'THE SCRIVENER', 24, mid + 7, 20, { align: 'left', color: CREAM, spacing: 3 });

  // the bar: an empty track that fills from the left with the share of ink cut
  ctx.fillStyle = TRACK; ctx.fillRect(x, y, bw, bh);
  const flash = f.mode !== 'think' && settled < cut - 0.001;
  ctx.fillStyle = accent; ctx.fillRect(x, y, bw * (flash ? settled : cut), bh);
  if (flash) { ctx.fillStyle = CREAM; ctx.fillRect(x + bw * settled, y, bw * (cut - settled), bh); }
  // the quarters "how far" is measured in
  for (let i = 1; i <= 3; i++) {
    const tx = Math.round(x + bw * i / 4);
    ctx.fillStyle = NIGHT; ctx.fillRect(tx - 2, y, 4, bh);
    ctx.fillStyle = CREAM; ctx.fillRect(tx - 1, y - 5, 2, bh + 10);
  }

  if (meta && f.mode !== 'ready') {
    // the mark to beat: the rival's best try, one tick in the rival's colour
    const rivalId = env.sh.order.find((id) => id !== meta.entrantId);
    const theirs = env.sh.attempts.filter((q) => q.entrantId === rivalId);
    if (theirs.length && !theirs.some((q) => q.result === 'kill')) {
      const mx = x + bw * Math.max(...theirs.map((q) => q.score));
      ctx.fillStyle = NIGHT; ctx.fillRect(mx - 4, y - 6, 8, bh + 12);
      ctx.fillStyle = env.bot(rivalId).accent; ctx.fillRect(mx - 2.5, y - 6, 5, bh + 12);
    }
  }

  // the share cut so far, flush to the right edge
  text(ctx, `${Math.round(cut * 100)}%`, W - 24, mid + 12, numf(34, 'bold'), { color: CREAM, align: 'right' });
}

// ---- the verdict, large, over the fight, on the frame it is known ------------------------------------
function verdictFlash(ctx, env, f) {
  const fl = f.flash;
  if (!fl || !f.meta || f.mode === 'ready' || f.mode === 'think') return;
  const age = f.renderT - fl.at;
  if (age > 1500) return;
  const b = env.bot(f.meta.entrantId);
  // only the two ends of a try get the banner; the health bar, the boss bar and the red number carry the rest
  const bad = fl.verdict === 'KILLED';
  const word = fl.verdict === 'KILL' ? 'KILL' : bad ? `${b.name.toUpperCase()} FALLS` : null;
  if (!word) return;
  const inn = ease(age, 0, 150), out = prog(age, 1150, 350);
  const y = 214;
  ctx.save();
  ctx.globalAlpha = 1 - out;
  const fnt = (sz, w2) => `${w2 || ''} ${sz}px Baskerville, Palatino, Georgia, serif`.trim();
  const tw = measureSpaced(ctx, word, fnt(46, 'bold'), 7);
  const bwid = tw + 110;
  brushBand(ctx, W / 2 - bwid / 2, bwid, y, 84, { color: bad ? RED : INK, seed: 21, reveal: inn });
  if (inn > 0.5) {
    const k = 1 + 0.2 * (1 - prog(age, 100, 220));
    ctx.translate(W / 2, y + 16); ctx.scale(k, k);
    title(ctx, word, 0, 0, 46, { color: CREAM, spacing: 7, weight: 'bold', font: fnt });
  }
  ctx.restore();
}

// ---- what the fighter took this exchange: one red number on its own body --------------------------
function pops(ctx, env, f) {
  if (!f.world || !f.view || f.world.outcome === 'boss_dead') return;
  for (const p of f.pops || []) {
    const age = f.renderT - p.at;
    if (age > 1100) continue;
    const a = 1 - prog(age, 850, 250);
    const k = 1 + 0.2 * (1 - prog(age, 0, 180));
    // the hit's lettering goes up and behind the fighter, away from the boss; the number sits on the
    // other side of the head, toward the boss, so the two never share a spot
    const ag = f.world.agent;
    const side = f.world.boss && f.world.boss.x < ag.x ? -1 : 1;
    const x = clamp(f.view.sx(ag.x) + side * 64, 60, W - 60);
    const y = Math.max(STRIP_H + 60, f.view.sy(GROUND_Y - (HEAD_H[ag.cls || (ag.loadout && ag.loadout.cls)] || 92) * FIGHTER_SCALE) - 10 - 22 * ease(age, 0, 900));
    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y); ctx.scale(k, k);
    ctx.font = numf(58, 'bold');
    ctx.textAlign = 'center';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = SHEET; ctx.lineWidth = 4;
    ctx.strokeText(`${p.n}`, 0, 0);
    ctx.fillStyle = RED;
    ctx.fillText(`${p.n}`, 0, 0);
    ctx.restore();
  }
}

// ---- the walk-on: which try this is, and the candle ---------------------------------------------------
function readyCall(ctx, env, f) {
  const { ready, renderT, meta } = f;
  if (!ready || !meta) return;
  const b = env.bot(meta.entrantId);
  const age = renderT - ready.at;
  const win = env.attemptWindow;
  const inn = ease(age, 300, 420);
  // flush under the top strip, its accent bar running on from the plate's; one width for every try
  const pw = measureSpaced(ctx, 'SECOND TRY', roman(40, 'bold'), 7) + 26 + 34;
  const py = STRIP_H, ph = 68;
  ctx.save();
  ctx.globalAlpha = inn;
  ctx.translate(-(1 - inn) * 40, 0);
  ctx.fillStyle = NIGHT; ctx.fillRect(0, py, pw, ph);
  ctx.fillStyle = b.accent; ctx.fillRect(0, py, 10, ph);
  title(ctx, `${(NTH[meta.n] || 'next').toUpperCase()} TRY`, 26, py + 48, 40, { align: 'left', color: CREAM, spacing: 7, weight: 'bold', alpha: prog(age, 520, 260) });
  ctx.restore();

  // the one prediction block of the show, on a sheet of paper over the floor
  predictions(ctx, {
    x: 470, y: 548, w: 540, h: 90, backing: true, t: renderT, alpha: prog(age, 600, 400), // clear of the fighter's feet at the left
    state: win && win.state === 'open' ? 'open' : 'closed',
    left: win ? Math.max(0, win.closesAt - env.serverNow) : 0, total: T.attemptWindow,
    since: win && win.lockedAt != null ? env.serverNow - win.lockedAt : 9999,
    question: `How far does ${b.name} get?`, closedLine: 'The bell.',
  });
}

// ---- the move menu: an ink column at the left edge, under the top strip --------------------------------
// The four moves. Nothing is marked until the answer is in; then the chosen row is lit.
function moveMenu(ctx, env, f) {
  const { menu: m, world: w, renderT, meta } = f;
  if (!m || !w || f.mode !== 'think') return;
  const b = env.bot(meta.entrantId);
  const age = renderT - m.openedAt;
  const inn = ease(age, 0, 240);
  const made = m.made;
  const since = made ? renderT - m.madeAt : 0;
  const x = 0, y = STRIP_H, pad = 24, indent = 34;
  // the column is as wide as its longest move name (the names at one size, never wider than 340)
  let ms = 21;
  const widest = (s) => Math.max(...m.moves.map((mv) => measureSpaced(ctx, mv.name.toUpperCase(), caps(s, 'bold'), 1)));
  while (ms > 17 && indent + widest(ms) + pad > 340) ms -= 1;
  const colW = Math.max(240, Math.ceil(indent + widest(ms) + pad));
  const iw = colW - 2 * pad;
  const movesY = y + 16;
  const mh = 44, mg = 6;
  const ph = movesY + 4 * mh + 3 * mg + 16 - y;

  ctx.save();
  ctx.globalAlpha = inn;
  ctx.translate(-(1 - inn) * 30, 0);
  ctx.fillStyle = NIGHT; ctx.fillRect(x, y, colW, ph);

  m.moves.forEach((mv, i) => {
    const mx = x + 12, my = movesY + i * (mh + mg), mw = colW - 24;
    const chosen = made && made.slot === i;
    const off = mv.available === false;
    ctx.save();
    if (made && !chosen) ctx.globalAlpha *= lerp(1, 0.16, prog(since, 0, 250));
    const u = chosen ? ease(since, 0, 200) : 0;
    if (i < 3 || chosen) { ctx.fillStyle = HAIR; ctx.fillRect(x + pad, my + mh + mg / 2, iw, 1); }
    if (u > 0) { brushBand(ctx, mx - 14, mw + 44, my + mh / 2, mh + 4, { color: SHEET, seed: i + 3, reveal: u, streak: 'rgba(13,12,11,0.05)' }); ctx.fillStyle = b.accent; ctx.fillRect(mx - 12, my, 10, mh); }
    const ink = u > 0.5 ? INK : (off ? 'rgba(239,232,212,0.4)' : CREAM);
    const base = my + mh / 2 + ms * 0.36;
    const t = title(ctx, mv.name.toUpperCase(), x + indent, base, ms, { align: 'left', color: ink, spacing: 1, weight: 'bold', font: caps });
    // a spent spell is struck through
    if (off) { ctx.fillStyle = 'rgba(239,232,212,0.55)'; ctx.fillRect(x + indent - 6, base - ms * 0.33, t.width + 12, 2); }
    ctx.restore();
  });
  ctx.restore();
}

// ---- the end of a try: the furniture clears and one card takes the frame ----------------------------
// The fighter as the try left it, still breathing, and the one figure the try came to, counted up.
const endDelay = (over) => (over.result === 'boss_dead' ? 2300 : over.result === 'written' ? 500 : 1700);
function endCard(ctx, env, f) {
  const { over, meta, renderT } = f;
  if (!over || !meta) return false;
  const age = renderT - over.at - endDelay(over);
  if (age < 0) return false;
  const b = env.bot(meta.entrantId);
  const rec = env.sh.attempts.find((q) => q.index === meta.index);
  const a = ease(age, 0, 450);
  const score = rec ? Math.round(rec.score * 100) : Math.round(cutOf(f.world) * 100);
  const kill = over.result === 'boss_dead';
  const dead = over.result === 'agent_dead';

  ctx.save();
  ctx.globalAlpha = a;
  paperGround(ctx, 6);
  const lo = meta.loadout || (f.world && f.world.agent.loadout) || {};
  const fa = prog(age, 250, 450);
  const FX = 236, FY = 650;
  ctx.save();
  ctx.globalAlpha = a * 0.5 * fa; ctx.fillStyle = INK;
  ctx.beginPath(); ctx.ellipse(FX, FY + 6, 150, 9, 0, 0, Math.PI * 2); ctx.fill();
  ctx.restore();
  // renderT keeps running while the card is up, so the idle sway and the sash never stop
  figure(ctx, { loadout: lo, x: FX, y: FY, height: dead ? 300 : 380, facing: 1, pose: dead ? 'fallen' : kill ? 'victory' : 'idle', t: renderT, accent: b.accent, alpha: a * fa });

  // the masthead and the figure, centred as one block on the right of the page
  const CX = (480 + W - 70) / 2;
  const headY = 274, numY = 469;
  title(ctx, `${b.name.toUpperCase()}’S ${(NTH[meta.n] || 'next').toUpperCase()} TRY`, CX, headY, 38, { spacing: 9, weight: 'bold', alpha: prog(age, 200, 400), maxW: W - 70 - 480 - 20 });
  if (kill) title(ctx, 'KILL', CX, numY - 6, 170, { color: RED, spacing: 26, weight: 'bold', alpha: prog(age, 300, 250) });
  else text(ctx, `${Math.round(score * ease(age, 300, 2400))}%`, CX, numY, numf(210, 'bold'), { color: INK, align: 'center', alpha: prog(age, 300, 250) });
  ctx.restore();
  return a > 0.6;
}

// ---- between pairs: the ledger, on its own page, and the candle -------------------------------------
function pairBreak(ctx, env, f) {
  const win = env.whoWindow;
  if (!win || env.sh.phase !== 'fight') return false;
  const open = win.state === 'open';
  const since = win.lockedAt != null ? env.serverNow - win.lockedAt : 1e9;
  if (!open && !(win.state === 'locked' && since < T.pairAfterLock + 400)) return false;
  if (!env.sh.attempts.length) return false;
  const breakAge = win.openedAt != null ? env.serverNow - win.openedAt : null;
  ctx.save();
  ctx.globalAlpha = breakAge == null ? 1 : prog(breakAge, 0, 300);
  paperGround(ctx, 4);
  ctx.globalAlpha = 1;
  // title, two rows of names and figures, the candle: one block, centred on the page
  const L = 250, R = W - 250, TY = 174;
  title(ctx, 'THE LEDGER', W / 2, TY, 46, { spacing: 12, weight: 'bold', maxW: R - L - 20 });
  const colX = (i) => 640 + i * 150;
  env.sh.order.forEach((id, r) => {
    const b = env.bot(id);
    const ry = TY + 110 + r * 96;
    ctx.fillStyle = b.accent; ctx.fillRect(L, ry - 44, 10, 58);
    title(ctx, b.name.toUpperCase(), L + 28, ry, 48, { align: 'left', spacing: 3, weight: 'bold', maxW: 300 });
    const mine = env.sh.attempts.filter((q) => q.entrantId === id);
    for (let i = 0; i < 3; i++) {
      const q = mine[i];
      if (!q) continue;
      const shown = breakAge == null ? 1 : prog(breakAge, 400 + (q.index - 1) * 420, 260);
      if (shown <= 0) continue;
      const kill = q.result === 'kill';
      ctx.save();
      ctx.globalAlpha *= shown;
      ctx.translate(colX(i), ry); ctx.scale(1 + 0.3 * (1 - shown), 1 + 0.3 * (1 - shown));
      if (kill) title(ctx, 'KILL', 0, -2, 40, { color: RED, spacing: 4, weight: 'bold' });
      else text(ctx, `${Math.round(q.score * 100)}%`, 0, 0, numf(50, 'bold'), { color: INK, align: 'center' });
      ctx.restore();
    }
    rule(ctx, L, R, ry + 36, { width: 1, alpha: r === 0 ? 0.3 : 0.5, diamonds: false });
  });
  predictions(ctx, {
    x: L, y: TY + 302, w: R - L, h: 102, t: f.renderT,
    state: open ? 'open' : 'closed', left: Math.max(0, win.closesAt - env.serverNow), total: T.pairWindow,
    since: win.lockedAt != null ? env.serverNow - win.lockedAt : 9999,
    question: 'Who wins the match?', closedLine: 'Back to the fight.',
  });
  ctx.restore();
  return true;
}

export function drawFightHud(ctx, env, f) {
  if (pairBreak(ctx, env, f)) return;
  // once the end card is up it owns the frame: nothing of the fight's furniture shows through
  if (f.over && f.meta && f.renderT - f.over.at - endDelay(f.over) > 350) { endCard(ctx, env, f); return; }
  pops(ctx, env, f);
  topStrip(ctx, env, f);
  footStrip(ctx, env, f);
  if (f.mode === 'ready') readyCall(ctx, env, f);
  moveMenu(ctx, env, f);
  verdictFlash(ctx, env, f);
  endCard(ctx, env, f);
}

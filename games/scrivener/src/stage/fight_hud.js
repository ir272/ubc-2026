// Everything drawn over the fight that is not the world. Owner: lead.
//
// One broadcast package, thin and flat, so the engraving owns the frame:
//   top strip      ink, flush to the top: the fighter (name, health) on the left, the round's move
//                  count in the middle, each contender's best round so far on the right
//   bottom strip   ink, flush to the bottom: the Scrivener's name and its health bar, red, draining
//   menu           while a choice is open, an ink column under the top strip: the four moves and a clock
// When a try ends the furniture clears and one full card takes the frame.
// No odds, no pools, no buttons: a candle only says that predictions are open and for how long.

import {
  W, H, INK, CREAM, RED, title, text, rule, caps, numf, paperGround,
  prog, ease, brushBand, clamp, lerp, measureSpaced, predictions, figure, emblem,
} from './kit.js';
import { GROUND_Y } from '../core/constants.js';
import { quillBar } from '../ui/ornament.js';
import { T } from '../show/timing.js';
import { FIGHTER_SCALE } from './fight.js';

// the one red: the kit's RED on paper, and this brighter oxblood where red sits on black
const LIT = '#cf3530';
const SHEET = '#f1ead7';
const NIGHT = '#0b0a09';
const HAIR = 'rgba(239,232,212,0.26)';  // hairlines and empty tracks on black
const TRACK = '#2a2520';
const STRIP_H = 100;                    // the room the top plates take
const FOOT_Y = 662;                     // where the bottom strip begins
const lagHp = { agent: 1 };

// how tall each class stands (sim units), so marks sit just over its head
const HEAD_H = { thief: 70, penitent: 78, warden: 90, duelist: 92, archivist: 98, hexer: 108 };
// an entrant's colour lifted toward cream, so it reads as type on black
const lift = (hex, k = 0.35) => { const n = parseInt(hex.slice(1), 16); const t = [0xef, 0xe8, 0xd4]; const c = (v, i) => Math.round(v + (t[i] - v) * k).toString(16).padStart(2, '0'); return `#${c(n >> 16, 0)}${c((n >> 8) & 255, 1)}${c(n & 255, 2)}`; };
const cutOf = (w) => clamp(1 - w.boss.hp / w.boss.maxHp, 0, 1);

// ---- the plates: paper over the fight, in the manner of the older HUD -----------------------------------
// The fighter top left, the two names top right, the Scrivener's bar on its own plate at the bottom.
// (Ian chose this over a layout with both bars at the top, 2026-11-20.)
const PLATE_Y = 16, PLATE_H = 78;
const darken = (hex, k = 0.42) => { const n = parseInt(hex.slice(1), 16); const c = (v) => Math.round(v * (1 - k)).toString(16).padStart(2, '0'); return `#${c(n >> 16)}${c((n >> 8) & 255)}${c(n & 255)}`; };
function plate(ctx, x, y, w, h) {
  ctx.fillStyle = 'rgba(20,14,6,0.42)'; ctx.fillRect(x + 5, y + 6, w, h);
  ctx.fillStyle = SHEET; ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(x + 1.5, y + 1.5, w - 3, h - 3);
}
const pickRing = (ctx, x, y, accent) => { ctx.strokeStyle = accent; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.arc(x, y, 5, 0, Math.PI * 2); ctx.stroke(); };

// the fighter: name, the nib bar in its own colour, its health as a figure
function fighterPlate(ctx, env, f) {
  const { world: wd, meta } = f;
  if (!wd || !meta) return;
  const b = env.bot(meta.entrantId);
  const a = wd.agent;
  const x = 18, y = PLATE_Y, w = 430;
  plate(ctx, x, y, w, PLATE_H);
  ctx.fillStyle = b.accent; ctx.fillRect(x + 3, y + 3, 10, PLATE_H - 6);
  const nm = title(ctx, b.name.toUpperCase(), x + 28, y + 36, 30, { align: 'left', color: INK, spacing: 2, weight: 'bold', maxW: w - 150 });
  if (env.highlight === meta.entrantId) pickRing(ctx, x + 28 + nm.width + 14, y + 25, b.accent);
  const frac = clamp(a.hp / a.maxHp, 0, 1);
  // the lost part drains in under a second and never lingers while the menu is open, so bar and number agree
  lagHp.agent = lagHp.agent < frac || f.mode === 'think' ? frac : Math.max(frac, lagHp.agent - 0.022);
  quillBar(ctx, x + 32, y + 52, w - 32 - 156, 12, frac, lagHp.agent, { fill: b.accent, dark: darken(b.accent) });
  const hurt = a.invulnT > 0 && a.state === 'hitstun';
  text(ctx, `${Math.max(0, Math.round(a.hp))}`, x + w - 18, y + 68, numf(36, 'bold'), { color: frac < 0.34 || hurt ? RED : INK, align: 'right' });
}

// the two names, and a figure once a fighter's go is over: the boss's health as they left it
function scorePlate(ctx, env, f) {
  const { sh } = env;
  const cur0 = f.meta && f.mode !== 'idle' ? f.meta.entrantId : null;
  if (!sh.attempts.length && !cur0) return;
  const w = 300, x = W - 18 - w, y = PLATE_Y;
  plate(ctx, x, y, w, PLATE_H);
  sh.order.forEach((id, r) => {
    const b = env.bot(id);
    const base = y + 32 + r * 31;
    const cur = f.meta && f.meta.entrantId === id && f.mode !== 'idle';
    ctx.fillStyle = b.accent; ctx.fillRect(x + 16, base - 19, 6, 24);
    const tw = title(ctx, b.name.toUpperCase(), x + 32, base, 21, { align: 'left', color: INK, spacing: 1.5, weight: 'bold', maxW: w - 32 - 96 });
    if (cur) { ctx.fillStyle = b.accent; ctx.fillRect(x + 32, base + 4, tw.width, 3); }
    if (env.highlight === id) pickRing(ctx, x + 32 + tw.width + 12, base - 7, b.accent);
    const mine = sh.attempts.filter((q) => q.entrantId === id && !(f.meta && q.index === f.meta.index && f.mode !== 'idle'));
    if (!mine.length) return;
    const kill = mine.some((q) => q.result === 'kill');
    const left = 1 - Math.max(...mine.map((q) => q.score || 0));
    text(ctx, kill ? 'KILL' : `${Math.round(left * 100)}%`, x + w - 18, base, kill ? caps(19, 'bold') : numf(22, 'bold'), { color: kill ? RED : INK, align: 'right' });
  });
}

// the newest chunk the boss lost: paper for a quarter second, then it drains away
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
const rivalBest = (env, meta) => {
  const rivalId = env.sh.order.find((id) => id !== meta.entrantId);
  const theirs = env.sh.attempts.filter((q) => q.entrantId === rivalId);
  if (!theirs.length) return null;
  return { id: rivalId, kill: theirs.some((q) => q.result === 'kill'), left: 1 - Math.max(...theirs.map((q) => q.score)) };
};

// the Scrivener: its name, the red nib bar draining, its health left as a figure; the rival's result is a tick
function bossPlate(ctx, env, f) {
  const { world: wd, meta } = f;
  if (!wd || !wd.boss) return;
  const frac = clamp(wd.boss.hp / wd.boss.maxHp, 0, 1);
  const lag = f.mode === 'think' ? frac : ghostOf(frac, f.renderT);
  const rival = meta && f.mode !== 'ready' ? rivalBest(env, meta) : null;
  const pct = `${Math.round(frac * 100)}%`;
  // bottom centre, on its own plate
  const w = 1000, x = (W - w) / 2, h = 62, y = H - 16 - h;
  plate(ctx, x, y, w, h);
  title(ctx, 'THE SCRIVENER', x + 24, y + 40, 23, { align: 'left', color: INK, spacing: 3, weight: 'bold' });
  const bx = x + 300, bw = w - 300 - 176, by = y + 23, bh = 16;
  quillBar(ctx, bx, by, bw, bh, frac, lag, {});
  if (rival && !rival.kill) { const mx = bx + bw * rival.left; ctx.fillStyle = SHEET; ctx.fillRect(mx - 4, by - 7, 8, bh + 14); ctx.fillStyle = env.bot(rival.id).accent; ctx.fillRect(mx - 2.5, by - 7, 5, bh + 14); }
  text(ctx, pct, x + w - 20, y + 45, numf(36, 'bold'), { color: INK, align: 'right' });
}

// the fight holds its breath: a flat ink wash over the room while a choice is open (drawn under the plates)
function thinkWash(ctx, f) {
  const m = f.menu;
  if (!m || !f.world || f.mode !== 'think') return;
  const age = f.renderT - m.openedAt;
  const since = m.made ? f.renderT - m.madeAt : 0;
  ctx.save();
  ctx.globalAlpha = 0.22 * ease(age, 0, 220) * (m.made ? 1 - prog(since, 700, 400) : 1);
  ctx.fillStyle = NIGHT; ctx.fillRect(0, 0, W, H);
  ctx.restore();
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

// ---- the walk-on -------------------------------------------------------------------------------------
// Nothing is called: the fighter's plate and the boss's full bar say it. (A feed recorded before
// 2026-11-20 still carries a prediction before each go; its block is drawn for those.)
function readyCall(ctx, env, f) {
  const { ready, renderT, meta } = f;
  const win = env.attemptWindow;
  if (!ready || !meta || !win) return;
  const age = renderT - ready.at;
  predictions(ctx, {
    x: 470, y: 530, w: 540, h: 90, backing: true, // backing and shadow end at 636, clear of the boss plate at 642 t: renderT, alpha: prog(age, 600, 400),
    state: win.state === 'open' ? 'open' : 'closed',
    left: Math.max(0, win.closesAt - env.serverNow),
    since: win.lockedAt != null ? env.serverNow - win.lockedAt : 9999,
  });
}

// ---- the move menu: the question and four picture cards, two by two, under the fighter's plate -----------
// The same card as the choosing phase: a picture over a name. The weapon's strike and the spell carry the
// art of the pick itself; the class moves carry a small ink diagram drawn here. While the fighter weighs
// them each card lifts in turn; the pick is framed in the fighter's colour and the others fall back.
const GLYPH_INK = INK;
function arrow(ctx, pts, { w = 7, color = GLYPH_INK, head = 15 } = {}) {
  // a paper edge under the ink so the arrow reads over anything it crosses
  const path = () => { ctx.beginPath(); ctx.moveTo(pts[0][0], pts[0][1]); if (pts.length === 3) ctx.quadraticCurveTo(pts[1][0], pts[1][1], pts[2][0], pts[2][1]); else ctx.lineTo(pts[1][0], pts[1][1]); };
  const end = pts[pts.length - 1], prev = pts[pts.length - 2];
  const ang = Math.atan2(end[1] - prev[1], end[0] - prev[0]);
  const tip = [end[0] + Math.cos(ang) * head * 0.9, end[1] + Math.sin(ang) * head * 0.9];
  const headPath = () => { ctx.beginPath(); ctx.moveTo(tip[0], tip[1]); ctx.lineTo(end[0] + Math.cos(ang + 2.2) * head, end[1] + Math.sin(ang + 2.2) * head); ctx.lineTo(end[0] + Math.cos(ang - 2.2) * head, end[1] + Math.sin(ang - 2.2) * head); ctx.closePath(); };
  ctx.lineCap = 'round'; ctx.lineJoin = 'round';
  ctx.strokeStyle = SHEET; ctx.lineWidth = w + 6; path(); ctx.stroke(); headPath(); ctx.lineWidth = 6; ctx.stroke();
  ctx.strokeStyle = color; ctx.lineWidth = w; path(); ctx.stroke();
  ctx.fillStyle = color; headPath(); ctx.fill();
}
// the Scrivener as a mark: a tall crowned spike
function spike(ctx, x) {
  ctx.fillStyle = GLYPH_INK; ctx.beginPath();
  ctx.moveTo(x - 9, 36); ctx.lineTo(x - 6, -14); ctx.lineTo(x - 12, -30); ctx.lineTo(x - 3, -24); ctx.lineTo(x, -42); ctx.lineTo(x + 3, -24); ctx.lineTo(x + 12, -30); ctx.lineTo(x + 6, -14); ctx.lineTo(x + 9, 36);
  ctx.closePath(); ctx.fill();
}
// the fighter as a mark: a small hooded figure in its colour
function pawn(ctx, x, y, accent) {
  ctx.fillStyle = GLYPH_INK; ctx.beginPath();
  ctx.moveTo(x - 8, y + 10); ctx.lineTo(x - 5, y - 6); ctx.lineTo(x, y - 16); ctx.lineTo(x + 5, y - 6); ctx.lineTo(x + 8, y + 10); ctx.closePath(); ctx.fill();
  ctx.fillStyle = accent; ctx.fillRect(x - 7, y + 1, 14, 4);
}
function moveGlyph(ctx, id, cx, cy, size, accent) {
  ctx.save();
  ctx.translate(cx, cy);
  const k = size / 100; ctx.scale(k, k);
  // a ruled disc behind, as the picks have
  ctx.save();
  ctx.beginPath(); ctx.arc(0, 0, 44, 0, Math.PI * 2); ctx.clip();
  ctx.strokeStyle = 'rgba(13,12,11,0.3)'; ctx.lineWidth = 1;
  for (let y = -44; y <= 44; y += 5) { ctx.beginPath(); ctx.moveTo(-46, y); ctx.lineTo(46, y); ctx.stroke(); }
  ctx.restore();
  ctx.fillStyle = GLYPH_INK; ctx.fillRect(-42, 36, 84, 3); // the floor
  switch (id) {
    case 'roll_through': spike(ctx, 2); pawn(ctx, -34, 24, accent); arrow(ctx, [[-22, 24], [4, 44], [28, 22]]); break;
    case 'roll_away': spike(ctx, 30); pawn(ctx, 6, 24, accent); arrow(ctx, [[-8, 16], [-28, 16]]); break;
    case 'roll_toward': spike(ctx, 32); pawn(ctx, -34, 24, accent); arrow(ctx, [[-22, 20], [6, 20]]); break;
    case 'jump_back': spike(ctx, 32); pawn(ctx, -24, -6, accent); arrow(ctx, [[12, 20], [2, -34], [-22, -24]], { head: 0.1 }); arrow(ctx, [[-30, 8], [-32, 22]], { w: 5, head: 11 }); break;
    case 'guard': {
      ctx.fillStyle = SHEET; ctx.strokeStyle = GLYPH_INK; ctx.lineWidth = 6; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(-26, -32); ctx.lineTo(26, -32); ctx.lineTo(26, 0); ctx.quadraticCurveTo(22, 26, 0, 38); ctx.quadraticCurveTo(-22, 26, -26, 0); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = accent; ctx.fillRect(-5, -29, 10, 60);
      ctx.fillStyle = GLYPH_INK; ctx.fillRect(-23, -12, 46, 6);
      break;
    }
    case 'hex': {
      ctx.strokeStyle = GLYPH_INK; ctx.lineWidth = 5; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.arc(0, -2, 30, 0, Math.PI * 2); ctx.stroke();
      ctx.lineWidth = 3.5; ctx.beginPath();
      for (let i = 0; i <= 5; i++) { const a = -Math.PI / 2 + i * (4 * Math.PI / 5); const px = Math.cos(a) * 28, py = -2 + Math.sin(a) * 28; if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py); }
      ctx.stroke();
      ctx.fillStyle = accent; ctx.beginPath(); ctx.arc(0, -2, 6, 0, Math.PI * 2); ctx.fill();
      break;
    }
    case 'trade': {
      const blade = (sgn) => { ctx.save(); ctx.rotate(sgn * Math.PI / 4); ctx.fillStyle = GLYPH_INK; ctx.beginPath(); ctx.moveTo(-4, 30); ctx.lineTo(-4, -30); ctx.lineTo(0, -42); ctx.lineTo(4, -30); ctx.lineTo(4, 30); ctx.closePath(); ctx.fill(); ctx.fillRect(-13, 20, 26, 5); ctx.restore(); };
      blade(1); blade(-1);
      ctx.fillStyle = accent; ctx.beginPath(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4, r = i % 2 ? 4 : 13; ctx.lineTo(Math.cos(a) * r, -6 + Math.sin(a) * r); } ctx.closePath(); ctx.fill();
      break;
    }
    default: { ctx.strokeStyle = GLYPH_INK; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(0, -30); ctx.lineTo(30, 0); ctx.lineTo(0, 30); ctx.lineTo(-30, 0); ctx.closePath(); ctx.stroke(); }
  }
  ctx.restore();
}
const twoLines = (ctx, name, maxW, size) => {
  if (measureSpaced(ctx, name, caps(size, 'bold'), 1) <= maxW || !name.includes(' ')) return [name];
  const words = name.split(' ');
  let best = [name], bestW = Infinity;
  for (let i = 1; i < words.length; i++) {
    const a = words.slice(0, i).join(' '), b = words.slice(i).join(' ');
    const wd = Math.max(measureSpaced(ctx, a, caps(size, 'bold'), 1), measureSpaced(ctx, b, caps(size, 'bold'), 1));
    if (wd < bestW) { bestW = wd; best = [a, b]; }
  }
  return best;
};
function moveCard(ctx, mv, x, y, w, h, { accent, chosen, since, made, weigh, weapon }) {
  const off = mv.available === false;
  const u = chosen ? ease(since, 0, 200) : 0;
  const up = Math.max(u * 12, weigh * 9);
  ctx.save();
  if (made && !chosen) ctx.globalAlpha *= lerp(1, 0.28, prog(since, 0, 250));
  ctx.fillStyle = 'rgba(20,14,6,0.4)'; ctx.fillRect(x + 5 + up * 0.3, y + 7 + up * 0.4, w, h);
  ctx.translate(0, -up);
  ctx.fillStyle = SHEET; ctx.fillRect(x, y, w, h);
  const lw = lerp(2.6, 5, u);
  ctx.strokeStyle = u > 0 ? accent : INK; ctx.lineWidth = lw; ctx.strokeRect(x + lw / 2, y + lw / 2, w - lw, h - lw);
  if (u <= 0 && weigh > 0) { ctx.fillStyle = accent; ctx.fillRect(x, y + h - 6, w * weigh, 6); }
  // the picture
  const win = w - 46, ax = x + w / 2, ay = y + 12 + win / 2;
  ctx.save();
  if (off) ctx.globalAlpha *= 0.35;
  if (mv.kind === 'strike' || mv.id === 'strike') emblem(ctx, 'weapon', mv.weapon || weapon, ax, ay, win, { accent });
  else if (mv.kind === 'spell') emblem(ctx, 'spell', mv.id, ax, ay, win, { accent });
  else moveGlyph(ctx, mv.id, ax, ay, win, accent);
  ctx.restore();
  // the name, on one line or two
  const name = mv.name.toUpperCase();
  let sz = 18;
  let lines = twoLines(ctx, name, w - 18, sz);
  while (sz > 13 && Math.max(...lines.map((l) => measureSpaced(ctx, l, caps(sz, 'bold'), 1))) > w - 16) { sz -= 1; lines = twoLines(ctx, name, w - 18, sz); }
  const foot = y + 12 + win, room = h - 12 - win;
  const base0 = foot + room / 2 + sz * 0.36 - (lines.length - 1) * (sz + 2) / 2;
  lines.forEach((l, i) => {
    const t = title(ctx, l, x + w / 2, base0 + i * (sz + 2), sz, { color: off ? 'rgba(13,12,11,0.4)' : INK, spacing: 1, weight: 'bold', font: caps });
    if (off) { ctx.fillStyle = 'rgba(13,12,11,0.6)'; ctx.fillRect(x + w / 2 - t.width / 2 - 5, base0 + i * (sz + 2) - sz * 0.33, t.width + 10, 2.5); }
  });
  ctx.restore();
}
function moveMenu(ctx, env, f) {
  const { menu: m, world: w, renderT, meta } = f;
  if (!m || !w || f.mode !== 'think') return;
  const b = env.bot(meta.entrantId);
  const age = renderT - m.openedAt;
  const made = m.made;
  const since = made ? renderT - m.madeAt : 0;
  const weapon = (meta.loadout && meta.loadout.weapon) || (w.agent.loadout && w.agent.loadout.weapon);
  const weighOf = (i) => { if (made) return 0; const ph = (age / 460) % 4; const d = ph - i; return d >= 0 && d < 1 ? Math.sin(d * Math.PI) : 0; };
  // the question, on its own plate over the cards: "WHAT WILL LUDO DO?", the name underlined in its colour
  const gap = 12, x0 = 20, cw = 152, ch = 168, qh = 44;
  const blockW = 2 * cw + gap, qy = PLATE_Y + PLATE_H + 16, y0 = qy + qh + 10;
  const qa = ease(age, 0, 220);
  ctx.save();
  ctx.globalAlpha = qa; ctx.translate(-(1 - qa) * 30, 0);
  plate(ctx, x0, qy, blockW, qh);
  const name = b.name.toUpperCase();
  let qs = 21;
  const q = (sz) => [`WHAT WILL `, name, ` DO?`].map((t) => measureSpaced(ctx, t, caps(sz, 'bold'), 1.5));
  while (qs > 14 && q(qs).reduce((n, v) => n + v, 0) + 3 > blockW - 28) qs -= 1;
  const parts = q(qs), total = parts[0] + parts[1] + parts[2] + 3;
  let qx = x0 + (blockW - total) / 2;
  const qbase = qy + qh / 2 + qs * 0.36;
  ['WHAT WILL ', name, ' DO?'].forEach((t, i) => {
    title(ctx, t, qx, qbase, qs, { align: 'left', color: INK, spacing: 1.5, weight: 'bold', font: caps });
    if (i === 1) { ctx.fillStyle = b.accent; ctx.fillRect(qx, qbase + 4, parts[1] - 1.5, 3); }
    qx += parts[i] + 1.5;
  });
  ctx.restore();
  // the four cards, two by two
  m.moves.forEach((mv, i) => {
    const inn = ease(age, 80 + i * 70, 260);
    ctx.save(); ctx.globalAlpha = inn; ctx.translate(-(1 - inn) * 30, (1 - inn) * -10);
    moveCard(ctx, mv, x0 + (i % 2) * (cw + gap), y0 + Math.floor(i / 2) * (ch + gap), cw, ch, { accent: b.accent, chosen: !!made && made.slot === i, since, made, weigh: weighOf(i), weapon });
    ctx.restore();
  });
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

  // the name, then the Scrivener's own bar draining to where this go left it, and its health as a figure
  const L = 500, R = W - 80, CX = (L + R) / 2;
  title(ctx, b.name.toUpperCase(), CX, 262, 64, { spacing: 10, weight: 'bold', alpha: prog(age, 200, 400), maxW: R - L });
  const left = 1 - (score / 100) * ease(age, 300, 2400);
  const ba = prog(age, 300, 250);
  ctx.save();
  ctx.globalAlpha *= ba;
  const by = 330, bh = 22;
  quillBar(ctx, L, by, R - L - 70, bh, left, left, {});
  ctx.restore();
  title(ctx, 'THE SCRIVENER', L, 420, 26, { align: 'left', spacing: 4, weight: 'bold', alpha: ba });
  if (kill && left <= 0.001) title(ctx, 'KILL', R, 426, 48, { align: 'right', color: RED, spacing: 8, weight: 'bold' });
  else text(ctx, `${Math.round(left * 100)}%`, R, 432, numf(64, 'bold'), { color: INK, align: 'right', alpha: ba });
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
  title(ctx, 'SCORES', W / 2, TY, 46, { spacing: 12, weight: 'bold', maxW: R - L - 20 });
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
      else text(ctx, `${Math.round((1 - q.score) * 100)}%`, 0, 0, numf(50, 'bold'), { color: INK, align: 'center' });
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
  thinkWash(ctx, f);
  fighterPlate(ctx, env, f);
  scorePlate(ctx, env, f);
  bossPlate(ctx, env, f);
  if (f.mode === 'ready') readyCall(ctx, env, f);
  moveMenu(ctx, env, f);
  verdictFlash(ctx, env, f);
  endCard(ctx, env, f);
}

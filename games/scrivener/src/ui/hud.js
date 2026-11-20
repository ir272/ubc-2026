// HUD: challenger plate (medallion, quill bars, ink-well flasks), attempt
// folio, the Ledger scoreboard (Claude vs GPT, deaths as tally marks), the
// Scrivener's nameplate + segmented boss bar, the latest thought as a manga
// thought balloon over the challenger, intro / death / victory cards.
// Owner: ui. Reads match state only.
//
//   const hud = createHud();
//   hud.tick(dt, match)                           per sim tick (lagging bars, balloon age)
//   hud.draw(ctx, match, info, t)    info: { labels: {claude, gpt}, notices: [], intro: bool }

import { W, H, GROUND_Y, AGENT_IDS, AGENT_LABEL, MATCH } from '../core/constants.js';
import { clamp, easeOutCubic } from '../core/math.js';
import { INK, PAPER, RED } from '../render/ink.js';
import { AGENT_COLORS } from '../render/agent_draw.js';
import { FONT, spaced, measureSpaced, fitText, thoughtBalloon, letterLines } from './letter.js';
import { cached, nibFinial, portrait, inkwell, tally, quillBar } from './ornament.js';
import { drawDeathCard, drawVictoryCard, drawIntro } from './cards.js';

const BALLOON_MS = 3600;

const short = (label) => String(label || '').replace(/^[a-z-]+\//, '');

// ---- soft paper washes so ink HUD reads over the busy library ---------------
function wash(ctx, key, x, y, w, h, alpha = 0.9) {
  const c = cached(`wash:${key}:${w}:${h}`, w, h, (g) => {
    const r = g.createRadialGradient(0, 0, 0, 0, 0, w / 2);
    r.addColorStop(0, `rgba(236,230,212,${alpha})`);
    r.addColorStop(0.55, `rgba(236,230,212,${alpha * 0.82})`);
    r.addColorStop(1, 'rgba(236,230,212,0)');
    g.translate(w / 2, h / 2);
    g.scale(1, h / w);
    g.fillStyle = r;
    g.fillRect(-w / 2, -w / 2, w, w);
  });
  ctx.drawImage(c, x, y, w, h);
}

export function createHud() {
  const lag = { boss: 1, agent: 1 };
  const bubble = { text: '', age: 1e9, agent: null };
  return {
    tick(dt, match) {
      const w = match.world;
      const bf = w.boss.hp / w.boss.maxHp, af = w.agent.hp / w.agent.maxHp;
      lag.boss = lag.boss > bf ? Math.max(bf, lag.boss - dt / 1800) : bf;
      lag.agent = lag.agent > af ? Math.max(af, lag.agent - dt / 1200) : af;
      const th = match.thoughts[match.current] || '';
      if (th !== bubble.text || match.current !== bubble.agent) { bubble.text = th; bubble.agent = match.current; bubble.age = 0; }
      else if (!w.thinking) bubble.age += dt;
    },
    draw(ctx, match, info = {}, t = 0) {
      const w = match.world;
      // the thinking freeze is its own manga page (src/fx/freeze_panel.js)
      if (w.thinking && match.phase === 'fight') return;

      // ms into the death / victory card, if one is up (null: none)
      const cardD = match.phase === 'fight' && w.outcome ? w.endT
        : match.phase === 'death' ? MATCH.agentDeathHoldMs + match.phaseT
        : match.phase === 'victory' ? MATCH.bossDeathHoldMs + match.phaseT : null;
      drawPlate(ctx, match, info, lag);
      drawFolio(ctx, match);
      drawLedger(ctx, match, info);
      // (qa) the boss bar and its SECOND FOLIO tag fade out as a card comes up: the card owns
      // the bottom of the page (its countdown sat on top of the bar)
      const plateK = cardD == null ? 1 : 1 - clamp((cardD - 60) / 360, 0, 1);
      if (plateK > 0) {
        ctx.save();
        ctx.globalAlpha *= plateK;
        drawBossPlate(ctx, w, lag);
        ctx.restore();
      }
      if (match.phase === 'fight' && !w.outcome) drawBalloon(ctx, match, bubble);

      const cards = match.phase !== 'fight' || !!w.outcome;
      if (info.notices && info.notices.length && !cards) {
        ctx.save();
        ctx.font = `italic 12px ${FONT.roman}`;
        ctx.fillStyle = INK;
        ctx.lineWidth = 3;
        ctx.strokeStyle = 'rgba(231,224,204,0.8)';
        info.notices.slice(-2).forEach((n, i) => { ctx.strokeText(n, 20, H - 30 + i * 14); ctx.fillText(n, 20, H - 30 + i * 14); });
        ctx.restore();
      }
      if (info.banner) drawBanner(ctx, info.banner, info.notices && info.notices.length && !cards ? 2 : 0);

      if (info.intro !== false && match.phase === 'fight' && w.t < 1800 && !w.outcome) drawIntro(ctx, match, info, w.t);

      if (cardD == null) { /* no card */ } else if (match.phase === 'fight' && w.outcome === 'agent_dead') drawDeathCard(ctx, match, w.endT);
      else if (match.phase === 'death') drawDeathCard(ctx, match, MATCH.agentDeathHoldMs + match.phaseT);
      else if (match.phase === 'fight' && w.outcome === 'boss_dead') drawVictoryCard(ctx, match, w.endT);
      else if (match.phase === 'victory') drawVictoryCard(ctx, match, MATCH.bossDeathHoldMs + match.phaseT, info.credits);
    },
  };
}

// ---- standing notice (LLM credits gone): a black ink slip, bottom-left ---------------
// "LLM credits exhausted — agents continue on instinct (mock)" is set on two lines:
// the headline in caps, the rest in italic.
function drawBanner(ctx, text, lift = 0) {
  const [head, ...rest] = String(text).split(/\s+—\s+/);
  const sub = rest.join(' — ');
  const x = 16, w = 262, h = sub ? 46 : 30; // stays left of the boss bar (x >= 288)
  const y = H - 16 - h - lift * 14 - (lift ? 6 : 0);
  ctx.save();
  ctx.fillStyle = 'rgba(12,11,10,0.9)';
  ctx.fillRect(x, y, w, h);
  ctx.fillStyle = RED;
  ctx.fillRect(x, y, 4, h);
  ctx.restore();
  spaced(ctx, fitCaps(ctx, head.toUpperCase(), w - 30), x + 16, y + 19, { font: `12px ${FONT.caps}`, color: PAPER, spacing: 2 });
  if (sub) {
    ctx.save();
    ctx.font = `italic 13px ${FONT.roman}`;
    ctx.fillStyle = '#c9c0ab';
    ctx.fillText(sub, x + 16, y + 37, w - 26);
    ctx.restore();
  }
}
function fitCaps(ctx, s, maxW) {
  let t = s;
  while (t.length > 4 && measureSpaced(ctx, t, `12px ${FONT.caps}`, 2) > maxW) t = `${t.slice(0, -2)}…`;
  return t;
}

// ---- top-left: the challenger ------------------------------------------------
function drawPlate(ctx, match, info, lag) {
  const w = match.world;
  const a = w.agent;
  const agent = match.current;
  const color = AGENT_COLORS[agent] || INK;
  wash(ctx, 'plate', -150, -110, 760, 330, 0.93);
  portrait(ctx, 70, 72, 46, color, agent === 'claude' ? 3 : 5);

  const name = AGENT_LABEL[agent] || agent;
  const nf = `27px ${FONT.roman}`;
  spaced(ctx, name, 134, 44, { font: nf, color: INK, spacing: 5 });
  const nw = measureSpaced(ctx, name, nf, 5);
  const model = info.labels ? short(info.labels[agent]) : '';
  if (model) {
    ctx.save();
    ctx.font = `italic 14px ${FONT.roman}`;
    ctx.fillStyle = '#4a443b';
    ctx.fillText(model, 134 + nw + 14, 43);
    ctx.restore();
  }
  quillBar(ctx, 134, 56, 300, 13, a.hp / a.maxHp, lag.agent, { finial: 'right' });
  quillBar(ctx, 134, 81, 210, 5, a.stamina / a.maxStamina, 0, { fill: '#d9cfb3', dark: '#b5aa8d', finial: 'right' });
  for (let i = 0; i < a.maxFlasks; i++) inkwell(ctx, 146 + i * 24, 112, i < a.flasks, color);
  // hp numerals, small, for spectators who want the count
  ctx.save();
  ctx.font = `14px ${FONT.num}`;
  ctx.fillStyle = INK;
  ctx.fillText(`${Math.max(0, Math.ceil(a.hp))} / ${a.maxHp}`, 146 + a.maxFlasks * 24 + 6, 118);
  ctx.restore();
}

// ---- top centre: attempt folio --------------------------------------------------
function drawFolio(ctx, match) {
  const cx = W / 2;
  wash(ctx, 'folio', cx - 190, -60, 380, 160, 0.9);
  spaced(ctx, `MATCH ${match.matchNo}`, cx, 26, { font: `12px ${FONT.num}`, color: '#3d3830', spacing: 5, align: 'center' });
  const label = `ATTEMPT ${match.attempt}`;
  const f = `25px ${FONT.num}`;
  spaced(ctx, label, cx, 54, { font: f, color: INK, spacing: 7, align: 'center' });
  const lw = measureSpaced(ctx, label, f, 7);
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.fillStyle = INK;
  ctx.lineWidth = 1.4;
  for (const d of [-1, 1]) {
    const x0 = cx + d * (lw / 2 + 14), x1 = cx + d * (lw / 2 + 70);
    ctx.beginPath(); ctx.moveTo(x0, 46); ctx.lineTo(x1, 46); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(x1, 42); ctx.lineTo(x1 + d * 5, 46); ctx.lineTo(x1, 50); ctx.lineTo(x1 - d * 5, 46); ctx.closePath(); ctx.fill();
  }
  ctx.restore();
}

// ---- top-right: the Ledger ---------------------------------------------------------
// Row geometry: name baseline at ry - 1, small label baseline at ry + SUB_DY. With h = 122 the
// inner border is at y + 117.5; the last row's labels end (descenders included) near y + 113.
const ROW0 = 71, ROW_PITCH = 29, SUB_DY = 10;
function drawLedger(ctx, match, info) {
  const x = W - 334, y = 14, w = 318, h = 122;
  ctx.save();
  ctx.fillStyle = 'rgba(12,11,10,0.92)';
  ctx.fillRect(x, y, w, h);
  ctx.strokeStyle = 'rgba(231,224,204,0.55)';
  ctx.lineWidth = 1;
  ctx.strokeRect(x + 4.5, y + 4.5, w - 9, h - 9);
  // bookmark ribbon in the current challenger's colour
  ctx.fillStyle = AGENT_COLORS[match.current] || PAPER;
  ctx.beginPath();
  ctx.moveTo(x + w - 34, y); ctx.lineTo(x + w - 20, y); ctx.lineTo(x + w - 20, y + 30); ctx.lineTo(x + w - 27, y + 24); ctx.lineTo(x + w - 34, y + 30);
  ctx.closePath(); ctx.fill();
  ctx.restore();
  spaced(ctx, 'THE LEDGER', x + 18, y + 25, { font: `14px ${FONT.caps}`, color: PAPER, spacing: 5 });
  ctx.save();
  ctx.font = `9px ${FONT.caps}`;
  ctx.letterSpacing = '2px';
  ctx.fillStyle = '#9d9483';
  ctx.textAlign = 'left';
  ctx.fillText('DEATHS', x + 136, y + 44);
  ctx.textAlign = 'right';
  ctx.fillText('BEST RUN', x + 262, y + 44);
  ctx.fillText('KILLS', x + w - 12, y + 44);
  ctx.strokeStyle = 'rgba(231,224,204,0.3)';
  ctx.beginPath(); ctx.moveTo(x + 14, y + 50.5); ctx.lineTo(x + w - 14, y + 50.5); ctx.stroke();
  ctx.restore();

  AGENT_IDS.forEach((id, i) => {
    const s = match.score[id];
    // (qa3) rows sit higher and closer (pitch 29) so the second row's small labels ("mock",
    // "dealt", "won") end ~5 px above the inner border at y + h - 4.5 instead of on it
    const ry = y + ROW0 + i * ROW_PITCH;
    const cur = id === match.current;
    const ink = cur ? PAPER : '#958d7c';
    if (cur) nibFinial(ctx, x + 9, ry - 6, 1, 13, { color: PAPER, bg: INK });
    ctx.fillStyle = AGENT_COLORS[id];
    ctx.fillRect(x + 26, ry - 17, 4, 23);
    spaced(ctx, AGENT_LABEL[id], x + 38, ry - 1, { font: `17px ${FONT.roman}`, color: ink, spacing: 1 });
    const lbl = info.labels ? short(info.labels[id]) : '';
    if (lbl) {
      ctx.save();
      ctx.font = `italic 10px ${FONT.roman}`;
      ctx.fillStyle = '#7f776a';
      ctx.fillText(lbl.length > 16 ? `${lbl.slice(0, 15)}…` : lbl, x + 38, ry + SUB_DY);
      ctx.restore();
    }
    if (s.deaths) tally(ctx, x + 138, ry + 2, s.deaths, { h: 17, gap: 6, color: ink, seed: 60 + i * 9, max: 10 });
    else { ctx.save(); ctx.font = `14px ${FONT.num}`; ctx.fillStyle = '#6d665a'; ctx.fillText('—', x + 138, ry); ctx.restore(); }
    ctx.save();
    ctx.font = `18px ${FONT.num}`;
    ctx.textAlign = 'right';
    ctx.fillStyle = ink;
    // (qa2) BEST RUN is the most damage dealt in one life (higher is better), not the boss HP
    // left (a "94%" there read like a good score); the small "dealt" under it says which
    const dealt = Math.round((1 - s.bestBossPct) * 100);
    ctx.fillText(dealt > 0 ? `${dealt}%` : '—', x + 262, ry);
    if (dealt > 0) {
      ctx.save();
      ctx.font = `italic 10px ${FONT.roman}`;
      ctx.fillStyle = '#7f776a';
      ctx.fillText('dealt', x + 262, ry + SUB_DY);
      ctx.restore();
    }
    ctx.fillStyle = s.kills ? '#e2533f' : ink;
    ctx.fillText(String(s.kills), x + w - 14, ry);
    const won = match.matchesWon[id];
    if (won) { ctx.font = `10px ${FONT.num}`; ctx.fillStyle = '#c9a64a'; ctx.fillText(`${won} won`, x + w - 14, ry + SUB_DY); }
    ctx.restore();
  });
}

// ---- bottom: the Scrivener ------------------------------------------------------
function drawBossPlate(ctx, w, lag) {
  const b = w.boss;
  const bx = 330, bw = W - 660, by = 676;
  wash(ctx, 'boss', bx - 140, by - 92, bw + 280, 150, 0.92);
  const name = 'THE SCRIVENER';
  const nf = `26px ${FONT.roman}`;
  spaced(ctx, name, W / 2, by - 18, { font: nf, color: INK, spacing: 10, align: 'center' });
  const nw = measureSpaced(ctx, name, nf, 10);
  // little ornamental rules either side of the name
  ctx.save();
  ctx.strokeStyle = INK;
  ctx.lineWidth = 1.2;
  for (const d of [-1, 1]) {
    ctx.beginPath(); ctx.moveTo(W / 2 + d * (nw / 2 + 16), by - 26); ctx.lineTo(W / 2 + d * (nw / 2 + 64), by - 26); ctx.stroke();
    ctx.beginPath(); ctx.arc(W / 2 + d * (nw / 2 + 70), by - 26, 2.4, 0, Math.PI * 2); ctx.fillStyle = INK; ctx.fill();
  }
  ctx.restore();
  quillBar(ctx, bx, by, bw, 12, b.hp / b.maxHp, lag.boss, { ticks: 10, finial: 'both', clasp: 0.5 });
  if (b.phase >= 2) {
    spaced(ctx, 'SECOND FOLIO', W / 2, by + 34, { font: `11px ${FONT.caps}`, color: RED, spacing: 5, align: 'center', halo: 3, haloColor: 'rgba(231,224,204,0.85)' });
  }
}

// ---- the latest thought, as a thought balloon over the challenger --------------
function drawBalloon(ctx, match, bubble) {
  if (!bubble.text || bubble.age > BALLOON_MS) return;
  const a = match.world.agent;
  const k = Math.min(easeOutCubic(clamp(bubble.age / 180, 0, 1)), 1 - clamp((bubble.age - BALLOON_MS + 400) / 400, 0, 1));
  if (k <= 0) return;
  const text = bubble.text.toUpperCase();
  // (agents r3) a wide, flat balloon parked at the top, under the ATTEMPT folio, so it never
  // covers the clash between challenger and boss; its bubble trail points down at the challenger
  const fit = fitText(ctx, text, (s) => `bold ${s}px ${FONT.letter}`, 300, 56, [17, 16, 15, 14, 13]);
  const rx = Math.max(90, fit.w / 2 + 30), ry = Math.max(30, fit.h / 2 + 16);
  const headX = a.x, headY = GROUND_Y - a.y - 96;
  const cx = clamp(W / 2 + clamp(headX - W / 2, -120, 120), 380 + rx, 940 - rx);
  const cy = 74 + ry;
  const dx = headX - cx, dy = headY - cy, L = Math.hypot(dx, dy) || 1, reach = Math.min(L, ry + 64);
  ctx.save();
  ctx.globalAlpha *= k;
  thoughtBalloon(ctx, cx, cy, rx, ry, [cx + (dx / L) * reach, cy + (dy / L) * reach], { seed: 17 });
  letterLines(ctx, fit.lines, cx, cy + 1, fit.size, { lh: fit.lh });
  ctx.restore();
}


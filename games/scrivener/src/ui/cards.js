// Full-screen title cards: attempt intro, challenger death, Scrivener death.
// Owner: ui. Read match state only. `d` is ms since the moment (deterministic).
//
// Death:   the page floods with ink, the red seal is pressed, the challenger's
//          name is written large and struck through in red ("NOMEN SCRIPTVM EST").
// Victory: the scene bleaches to blank paper, the seal's nib snaps, a brush band
//          carries THE SCRIVENER, struck through in the victor's colour.

import { W, H, AGENT_LABEL, MATCH } from '../core/constants.js';
import { clamp, easeOutCubic, easeInOut } from '../core/math.js';
import { INK, PAPER, stroke, speedLines } from '../render/ink.js';
import { AGENT_COLORS } from '../render/agent_draw.js';
import { FONT, spaced, measureSpaced, fitText } from './letter.js';
import { nibEmblem, spray, brushBand } from './ornament.js';

const ramp = (d, a, b) => clamp((d - a) / (b - a), 0, 1);
const VERMILION = '#c3281b';
const DEEP = '#0a0908';

function strikeThrough(ctx, x0, x1, y, k, { color, width = 11, seed = 5, rise = -10 } = {}) {
  if (k <= 0) return;
  const xe = x0 + (x1 - x0) * k;
  const pts = [];
  const n = 14;
  for (let i = 0; i <= n; i++) {
    const t = i / n;
    const x = x0 + (xe - x0) * t;
    pts.push([x, y + rise * ((x - x0) / (x1 - x0)) + Math.sin(t * 5 + seed) * 1.2]);
  }
  stroke(ctx, pts, { width, taper: 0.75, seed, color, pressure: (t) => 0.55 + 0.6 * Math.sin(Math.PI * Math.min(1, t * 1.15)) });
  // flick of ink off the end of the stroke
  if (k >= 1) {
    ctx.save();
    ctx.fillStyle = color;
    for (let i = 0; i < 4; i++) {
      ctx.beginPath();
      ctx.arc(x1 + 10 + i * 9, y + rise - 3 - i * 2.5, 3.2 - i * 0.7, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }
}

function vignette(ctx, color, a0, a1) {
  const g = ctx.createRadialGradient(W / 2, H / 2, 140, W / 2, H / 2, 760);
  g.addColorStop(0, color.replace('A', a0));
  g.addColorStop(1, color.replace('A', a1));
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, W, H);
}

// ---- challenger death --------------------------------------------------------
export function drawDeathCard(ctx, match, d) {
  const w = match.world;
  const who = AGENT_LABEL[match.current] || match.current;
  const flood = easeOutCubic(ramp(d, 60, 420));
  if (flood <= 0) return;
  ctx.save();
  vignette(ctx, 'rgba(10,9,8,A)', (0.93 * flood).toFixed(3), (0.985 * flood).toFixed(3));

  // the seal is pressed
  const ek = easeOutCubic(ramp(d, 140, 440));
  if (ek > 0) {
    const s = 0.8 * (1.18 - 0.18 * ek);
    spray(ctx, W / 2, 168, 26, 190, 41, VERMILION, 0.55 * ek, ek);
    nibEmblem(ctx, W / 2, 158, s, { color: VERMILION, bg: DEEP, k: ek, drip: easeInOut(ramp(d, 420, 1300)) });
  }

  // NOMEN · SCRIPTVM · EST
  const ck = ramp(d, 220, 460);
  spaced(ctx, 'NOMEN  SCRIPTVM  EST', W / 2, 338, { font: `30px ${FONT.caps}`, color: VERMILION, spacing: 9, align: 'center', alpha: ck });

  // the name, written large, then struck
  const nk = easeOutCubic(ramp(d, 250, 520));
  const nameFont = `104px ${FONT.roman}`;
  const sp = 22;
  const nw = measureSpaced(ctx, who, nameFont, sp);
  ctx.save();
  ctx.globalAlpha *= nk;
  ctx.translate(0, (1 - nk) * 10);
  spaced(ctx, who, W / 2, 446, { font: nameFont, color: PAPER, spacing: sp, align: 'center' });
  ctx.restore();
  strikeThrough(ctx, W / 2 - nw / 2 - 34, W / 2 + nw / 2 + 30, 418, easeInOut(ramp(d, 380, 600)), { color: VERMILION, width: 13, seed: 7, rise: -8 });

  // the line beneath: what happened
  const lk = ramp(d, 480, 700);
  // (qa2) damage DEALT this life, the same measure as the ledger's BEST RUN column
  const dealt = Math.round((1 - w.boss.hp / w.boss.maxHp) * 100);
  spaced(ctx, `FELL ON ATTEMPT ${match.attempt}  ·  DEALT ${dealt}%`, W / 2, 492, { font: `19px ${FONT.num}`, color: PAPER, spacing: 6, align: 'center', alpha: lk });
  const killer = w.log.killedBy && w.log.killedBy.desc;
  if (killer) {
    ctx.save();
    ctx.globalAlpha *= lk;
    ctx.font = `italic 19px ${FONT.roman}`;
    ctx.fillStyle = 'rgba(231,224,204,0.72)';
    ctx.textAlign = 'center';
    ctx.fillText(`undone by ${killer}`, W / 2, 522);
    ctx.restore();
  }

  // margin notes: what the challenger learned (after reflection)
  const inDeathPhase = match.phase === 'death';
  if (inDeathPhase) {
    const notes = match.reflected ? match.notes[match.current] || [] : null;
    const mk = ramp(match.phaseT, 0, 400);
    rule(ctx, W / 2, 548, 300, VERMILION, mk);
    // (qa2) why the notes did not change (or only partly did): a reflection that could not be
    // used is said out loud, in a small line under the heading, never silently dropped
    const status = match.reflected && match.reflectNote ? match.reflectNote.text : null;
    const statusH = status ? 16 : 0;
    if (status) {
      ctx.save();
      ctx.globalAlpha *= mk;
      ctx.font = `italic 14px ${FONT.roman}`;
      ctx.fillStyle = 'rgba(231,224,204,0.62)';
      ctx.textAlign = 'center';
      ctx.fillText(`(${status})`, W / 2, notes && notes.length ? 594 : 616);
      ctx.restore();
    }
    if (notes && notes.length) {
      spaced(ctx, `${who}'S MARGIN NOTES`, W / 2, 574, { font: `14px ${FONT.caps}`, color: VERMILION, spacing: 5, align: 'center', alpha: mk });
      const nkk = ramp(match.phaseT, 300, 900);
      ctx.save();
      ctx.globalAlpha *= nkk;
      ctx.fillStyle = PAPER;
      ctx.textAlign = 'center';
      // fit ALL notes, whole, into the band 600..708: shrink the hand until every line fits
      const shown = notes.slice(0, 3);
      let lay = null;
      for (const size of [19, 17, 16, 15, 14, 13]) {
        ctx.font = `${size}px ${FONT.hand}`;
        const blocks = shown.map((n) => fitText(ctx, `— ${n}`, () => `${size}px ${FONT.hand}`, 860, 999, [size]).lines);
        const h = blocks.reduce((a, b) => a + b.length * (size + 4) + 4, 0);
        lay = { size, blocks };
        if (h <= 108 - statusH) break;
      }
      ctx.font = `${lay.size}px ${FONT.hand}`;
      let ly = 600 + statusH;
      for (const lines of lay.blocks) {
        for (const l of lines) { ctx.fillText(l, W / 2, ly); ly += lay.size + 4; }
        ly += 4;
      }
      ctx.restore();
    } else {
      const dots = '.'.repeat(1 + (Math.floor(match.phaseT / 320) % 3));
      ctx.save();
      ctx.globalAlpha *= mk;
      ctx.font = `21px ${FONT.hand}`;
      ctx.fillStyle = 'rgba(231,224,204,0.8)';
      ctx.textAlign = 'center';
      ctx.fillText(match.reflected ? `${who} has no margin notes yet` : `${who} writes what it learned${dots}`, W / 2, 590);
      ctx.restore();
    }
    const left = Math.max(0, Math.ceil((MATCH.deathScreenMs - match.phaseT) / 1000));
    const next = AGENT_LABEL[match.current === 'claude' ? 'gpt' : 'claude'];
    if (match.reflected) spaced(ctx, `${next} STEPS FORWARD IN ${left}`, W / 2, 704, { font: `12px ${FONT.num}`, color: 'rgba(231,224,204,0.45)', spacing: 4, align: 'center' });
  }
  ctx.restore();
}

function rule(ctx, cx, y, half, color, k) {
  if (k <= 0) return;
  ctx.save();
  ctx.globalAlpha *= k;
  ctx.strokeStyle = color;
  ctx.fillStyle = color;
  ctx.lineWidth = 1.2;
  ctx.beginPath(); ctx.moveTo(cx - half * k, y); ctx.lineTo(cx - 10, y); ctx.moveTo(cx + 10, y); ctx.lineTo(cx + half * k, y); ctx.stroke();
  ctx.beginPath(); ctx.moveTo(cx, y - 5); ctx.lineTo(cx + 5, y); ctx.lineTo(cx, y + 5); ctx.lineTo(cx - 5, y); ctx.closePath(); ctx.fill();
  ctx.restore();
}

// ---- Scrivener death -----------------------------------------------------------
// credits: optional [{head, line}] (src/ui/credits.js rollLines): the attract loop rolls the
// CC BY attributions under the stats, one at a time
export function drawVictoryCard(ctx, match, d, credits = null) {
  const who = AGENT_LABEL[match.current] || match.current;
  const color = AGENT_COLORS[match.current] || INK;
  const wash = easeOutCubic(ramp(d, 60, 480));
  if (wash <= 0) return;
  ctx.save();
  vignette(ctx, 'rgba(236,230,212,A)', (0.84 * wash).toFixed(3), (0.62 * wash).toFixed(3));
  // focus lines burst from the seal: the moment the ledger shuts
  speedLines(ctx, W / 2, 300, 360, 980, 72, 91, { alpha: 0.2 * wash, width: 4 });

  // the seal, nib snapped
  const ek = easeOutCubic(ramp(d, 140, 440));
  if (ek > 0) {
    spray(ctx, W / 2, 160, 24, 190, 77, INK, 0.75 * ek, ek);
    nibEmblem(ctx, W / 2, 150, 0.74 * (1.16 - 0.16 * ek), { color: INK, bg: PAPER, broken: true, k: ek, drip: easeInOut(ramp(d, 420, 1300)) });
  }

  spaced(ctx, 'LIBER  CLAVSVS  EST', W / 2, 328, { font: `28px ${FONT.caps}`, color: INK, spacing: 9, align: 'center', alpha: ramp(d, 220, 460) });

  // the brush band carrying the name
  const bandK = easeOutCubic(ramp(d, 240, 520));
  brushBand(ctx, 110, W - 210, 408, 118, { color: INK, seed: 23, reveal: bandK });
  const nameFont = `76px ${FONT.roman}`;
  const sp = 16;
  const label = 'THE SCRIVENER';
  const nw = measureSpaced(ctx, label, nameFont, sp);
  const nk = ramp(d, 330, 540);
  spaced(ctx, label, W / 2, 434, { font: nameFont, color: PAPER, spacing: sp, align: 'center', alpha: nk });
  strikeThrough(ctx, W / 2 - nw / 2 - 30, W / 2 + nw / 2 + 26, 412, easeInOut(ramp(d, 420, 620)), { color, width: 12, seed: 13, rise: -7 });

  // who did it
  const lk = ramp(d, 500, 720);
  ctx.save();
  ctx.globalAlpha *= lk;
  const line = `ERASED BY ${who}`;
  const f = `26px ${FONT.caps}`;
  spaced(ctx, line, W / 2, 508, { font: f, color: INK, spacing: 8, align: 'center', halo: 5, haloColor: 'rgba(236,230,212,0.9)' });
  const lw = measureSpaced(ctx, line, f, 8);
  ctx.fillStyle = color;
  ctx.fillRect(W / 2 - lw / 2, 520, lw, 3);
  spaced(ctx, `ON ATTEMPT ${match.attempt}  ·  MATCH ${match.matchNo}`, W / 2, 550, { font: `15px ${FONT.num}`, color: INK, spacing: 5, align: 'center' });
  ctx.restore();

  if (match.phase === 'victory') {
    const sk = ramp(match.phaseT, 200, 800);
    const s = match.score;
    const ids = Object.keys(s);
    const deaths = ids.reduce((n, id) => n + s[id].deaths, 0);
    const wlog = match.world.log;
    const stat = `${deaths} name${deaths === 1 ? '' : 's'} written before the ledger closed  ·  ${wlog.decisions.length} decisions  ·  ${Math.round((match.world.outcomeT ?? match.world.t) / 1000)}s`; // (qa2) frozen at the kill
    ctx.save();
    ctx.globalAlpha *= sk;
    ctx.font = `italic 19px ${FONT.num}`;
    ctx.fillStyle = INK;
    ctx.textAlign = 'center';
    ctx.fillText(stat, W / 2, 596);
    ctx.restore();
    // (qa) the countdown used to sit at y 690 on top of the boss bar; the bar now fades out
    // under the card and the bottom block is laid out as stats / credits roll / countdown
    if (credits && credits.length) drawCreditRoll(ctx, match, credits, ramp(match.phaseT, 900, 1400));
    const left = Math.max(0, Math.ceil((MATCH.victoryMs - match.phaseT) / 1000));
    spaced(ctx, `A NEW LEDGER OPENS IN ${left}`, W / 2, 676, { font: `13px ${FONT.num}`, color: 'rgba(13,12,11,0.6)', spacing: 5, align: 'center', alpha: sk });
  }
  ctx.restore();
}

// One attribution at a time (1.6 s each, cross-faded), starting where the last victory left
// off, so every CC BY credit comes round in the attract loop.
const ROLL_MS = 1600;
function drawCreditRoll(ctx, match, credits, k) {
  if (k <= 0) return;
  const t = Math.max(0, match.phaseT - 900);
  const perMatch = Math.ceil((MATCH.victoryMs - 900) / ROLL_MS);
  const i = (Math.floor(t / ROLL_MS) + (match.matchNo - 1) * perMatch) % credits.length;
  const u = (t % ROLL_MS) / ROLL_MS;
  const fade = Math.min(1, u / 0.12, (1 - u) / 0.12);
  const c = credits[i];
  ctx.save();
  ctx.globalAlpha *= k * clamp(fade, 0, 1);
  spaced(ctx, c.head, W / 2, 622, { font: `10px ${FONT.caps}`, color: 'rgba(13,12,11,0.55)', spacing: 5, align: 'center' });
  const f = fitText(ctx, c.line, (s) => `italic ${s}px ${FONT.num}`, 900, 20, [15, 14, 13, 12]);
  ctx.font = `italic ${f.size}px ${FONT.num}`;
  ctx.textAlign = 'center';
  ctx.lineJoin = 'round';
  ctx.lineWidth = 4;
  ctx.strokeStyle = 'rgba(236,230,212,0.85)';
  ctx.strokeText(f.lines.join(' '), W / 2, 642, 1000);
  ctx.fillStyle = 'rgba(13,12,11,0.82)';
  ctx.fillText(f.lines.join(' '), W / 2, 642, 1000);
  ctx.restore();
}

// ---- attempt intro ---------------------------------------------------------------
export function drawIntro(ctx, match, info, d) {
  const k = d < 350 ? easeOutCubic(d / 350) : 1 - easeInOut(clamp((d - 1350) / 450, 0, 1));
  if (k <= 0) return;
  const agent = match.current;
  const who = AGENT_LABEL[agent] || agent;
  const color = AGENT_COLORS[agent] || INK;
  ctx.save();
  ctx.globalAlpha *= k;
  vignette(ctx, 'rgba(236,230,212,A)', '0.72', '0');
  brushBand(ctx, 150, W - 300, 352, 112, { color: INK, seed: 50 + match.attempt, reveal: easeOutCubic(clamp(d / 380, 0, 1)) });
  spaced(ctx, `ATTEMPT  ${match.attempt}`, W / 2, 280, { font: `24px ${FONT.num}`, color: INK, spacing: 10, align: 'center', halo: 6, haloColor: 'rgba(231,224,204,0.92)' });
  spaced(ctx, who, W / 2, 378, { font: `72px ${FONT.roman}`, color: PAPER, spacing: 16, align: 'center' });
  const nw = measureSpaced(ctx, who, `72px ${FONT.roman}`, 16);
  ctx.fillStyle = color;
  ctx.fillRect(W / 2 - nw / 2, 392, nw * clamp((d - 150) / 400, 0, 1), 4);
  const model = info && info.labels ? info.labels[agent] : '';
  spaced(ctx, 'STEPS BEFORE THE SCRIVENER', W / 2, 438, { font: `17px ${FONT.caps}`, color: INK, spacing: 6, align: 'center', halo: 5, haloColor: 'rgba(231,224,204,0.92)' });
  if (model) {
    ctx.font = `italic 15px ${FONT.roman}`;
    ctx.textAlign = 'center';
    ctx.lineWidth = 4;
    ctx.strokeStyle = 'rgba(231,224,204,0.9)';
    ctx.strokeText(model, W / 2, 462);
    ctx.fillStyle = INK;
    ctx.fillText(model, W / 2, 462);
  }
  ctx.restore();
}


// Figures lab: sheets of the fighters, weapons and item plates for review. Owner: art.
//   /lab/figures.html?sheet=classes|portraits|weapons|icons|fight [&pose=..] [&cls=..] [&state=..] [&t=ms]

import { paper, INK, PAPER, RED } from '../src/render/ink.js';
import { GROUND_Y } from '../src/core/constants.js';
import { drawAgent, drawFighterFigure } from '../src/render/agent_draw.js';
import { drawItemIcon, drawSpellFx, ITEM_IDS } from '../src/render/items_draw.js';

const q = new URLSearchParams(location.search);
const sheet = q.get('sheet') || 'classes';
const pose = q.get('pose') || 'idle';
const T = +(q.get('t') || 1200);
const only = q.get('cls');
const stateQ = q.get('state');
// the stage draws the fighter enlarged; the fight sheets do the same (scaled about the feet)
const FK = +(q.get('fk') || 1.7);
function atScale(x, fn) { ctx.save(); ctx.translate(x, GROUND_Y); ctx.scale(FK, FK); ctx.translate(-x, -GROUND_Y); fn(); ctx.restore(); }

const c = document.getElementById('c');
const ctx = c.getContext('2d');
ctx.drawImage(paper(1280, 720, { seed: 9 }), 0, 0);

const ACC = ['#c4612f', '#2f8a78', '#3f6c9c', '#a8842a', '#c4612f', '#2f8a78'];
const SET = [
  { cls: 'duelist', weapon: 'sabre', spell: 'candle', charm: 'seal' },
  { cls: 'warden', weapon: 'quill', spell: 'blot', charm: 'bookmark' },
  { cls: 'thief', weapon: 'knives', spell: 'margin', charm: 'ribbon' },
  { cls: 'hexer', weapon: 'censer', spell: 'knot', charm: 'ember' },
  { cls: 'archivist', weapon: 'pole', spell: 'mend', charm: 'lens' },
  { cls: 'penitent', weapon: 'maul', spell: 'echo', charm: 'nib' },
];
const WEAPONS = ['sabre', 'maul', 'knives', 'pole', 'censer', 'quill'];

function label(text, x, y, size = 13) {
  ctx.save();
  ctx.font = `${size}px Cochin, Georgia, serif`;
  ctx.fillStyle = INK;
  ctx.textAlign = 'center';
  ctx.fillText(text, x, y);
  ctx.restore();
}

function fakeWorld(loadout, x, facing, state, stateT, extra = {}) {
  return {
    agent: { id: 'claude', x, y: 0, facing, state, stateT, combo: 0, loadout, invulnT: 0, rollDir: facing, rollDist: 230, ...extra },
    boss: { x: -9999, facing: -1 },
    hazards: [],
  };
}

function strikeT(weapon) {
  // a moment in the active phase of the light strike
  return 150 + 90 * 0.55;
}

if (sheet === 'classes') {
  SET.forEach((L, i) => {
    const x = 120 + i * 208;
    ctx.save(); ctx.translate(0, -300);
    atScale(x, () => drawAgent(ctx, fakeWorld(L, x, 1, stateQ || 'idle', 0, { accent: ACC[i] }), T));
    ctx.restore();
    atScale(x, () => drawAgent(ctx, fakeWorld(L, x, 1, 'light', strikeT(L.weapon), { accent: ACC[i] }), T));
    label(`${L.cls} / ${L.weapon} / ${L.charm}`, x + 10, 330);
    label('mid strike', x + 10, 640, 11);
  });
} else if (sheet === 'portraits') {
  const list = only ? SET.filter((s) => only.split(',').includes(s.cls)) : SET;
  list.forEach((L, i) => {
    const n = list.length;
    const scale = +q.get('scale') || (n === 1 ? 7.2 : 4.0);
    const x = n === 1 ? 640 : n < 6 ? (1280 / n) * (i + 0.5) : 105 + i * 205;
    const fy = n === 1 ? 690 : 640;
    const facing = q.get('facing') === '-1' ? -1 : 1;
    if (q.get('box')) {
      // the containment box the show asked for: 0.95 H wide, 1.15 H tall (H = 90 * scale px)
      const H = 90 * scale;
      ctx.save(); ctx.strokeStyle = RED; ctx.lineWidth = 1; ctx.setLineDash([4, 4]);
      ctx.strokeRect(x - 0.475 * H, fy - 1.15 * H, 0.95 * H, 1.15 * H);
      ctx.beginPath(); ctx.moveTo(x - 0.475 * H, fy - 1.25 * H); ctx.lineTo(x + 0.475 * H, fy - 1.25 * H); ctx.stroke();
      ctx.restore();
    }
    drawFighterFigure(ctx, { loadout: L, x, y: fy, scale, facing, pose, t: T, accent: ACC[i] });
    if (n > 1) label(`${L.cls} : ${pose}`, x, 700);
  });
  if (q.get('blank')) drawFighterFigure(ctx, { loadout: {}, x: 640, y: 640, scale: +q.get('scale') || 4.0, pose, t: T });
} else if (sheet === 'weapons') {
  WEAPONS.forEach((w, i) => {
    const x = 120 + i * 208;
    const L = { cls: only || 'duelist', weapon: w, spell: 'candle', charm: null };
    ctx.save(); ctx.translate(0, -460);
    drawAgent(ctx, fakeWorld(L, x, 1, stateQ || 'idle', stateQ === 'light' ? strikeT(w) : 0, { accent: ACC[i] }), T);
    ctx.restore();
    label(w, x, 175);
    drawFighterFigure(ctx, { loadout: L, x, y: 700, scale: 3.3, facing: 1, pose, t: T, accent: ACC[i] });
  });
} else if (sheet === 'icons') {
  const all = [];
  for (const kind of ['cls', 'weapon', 'spell', 'charm', 'temper']) for (const id of ITEM_IDS[kind]) all.push([kind, id]);
  const cols = 11, s = 96, gx = 112, gy = 112;
  all.forEach(([kind, id], i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = 80 + col * gx, y = 62 + row * gy;
    drawItemIcon(ctx, kind, id, x, y, s, { ink: INK, accent: kind === 'temper' || kind === 'spell' || kind === 'charm' ? RED : ACC[i % 4] });
  });
  const rowKind = q.get('row') || 'temper';
  const rowIds = ITEM_IDS[rowKind] || ITEM_IDS.temper;
  rowIds.slice(0, 6).forEach((id, i) => {
    drawItemIcon(ctx, rowKind, id, 120 + i * 208, 590, 200, { ink: INK, accent: rowKind === 'cls' || rowKind === 'weapon' ? ACC[i % 4] : RED });
  });
} else if (sheet === 'fight') {
  // a 340 px black block stands in for the boss
  const bx = 640;
  ctx.fillStyle = INK;
  ctx.fillRect(bx - 65, GROUND_Y - 340, 130, 340);
  ctx.fillStyle = '#4a443c'; ctx.fillRect(0, GROUND_Y, 1280, 2);
  const world = { agent: null, boss: { x: bx, facing: -1, burn: q.get('burn') ? 1500 : 0, bound: q.get('bound') ? 1 : 0, hexed: q.get('hexed') ? 1 : 0 }, hazards: [] };
  if (q.get('bolt')) world.hazards.push({ kind: 'bolt', owner: 'agent', x0: 440, x1: 470, y0: 60, y1: 74, vx: 600, age: 120, ttl: 900, id: 3 });
  drawSpellFx(ctx, world, T);
  SET.forEach((L, i) => {
    const left = i < 3;
    const x = left ? 105 + i * 170 : 845 + (i - 3) * 170;
    const st = stateQ || 'idle';
    const stT = st === 'light' ? strikeT(L.weapon) : +(q.get('st') || 300);
    const w = fakeWorld(L, x, left ? 1 : -1, st, stT, { accent: ACC[i], ward: !!q.get('ward'), echo: !!q.get('echo'), castSpell: q.get('spell') || L.spell });
    w.boss.x = bx;
    atScale(x, () => drawAgent(ctx, w, T));
    label(L.cls, x, 640);
  });
}

if (sheet === 'perf') {
  const out = {};
  const states = ['idle', 'walk', 'light', 'guard', 'cast', 'hitstun'];
  for (const L of SET) {
    const t0 = performance.now();
    for (let i = 0; i < 120; i++) drawAgent(ctx, fakeWorld(L, 640, 1, states[i % 6], 200, { ward: i % 2 === 0, echo: i % 3 === 0 }), i * 16);
    out[L.cls] = +((performance.now() - t0) / 120).toFixed(3);
  }
  window.__perf = out;
}
window.__ready = true;

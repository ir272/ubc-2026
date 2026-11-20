// Phase 3, the tape and the bell. A fight poster on paper: the two contenders full height at
// either side, their picks read across the middle, the temper the matchup turns on, and the
// clock while predictions are open. Betting opens only here, once every pick is public.
// Owner: lead.

import {
  W, CREAM, paperGround, title, text, underline, caps, ital, predictions,
  prog, ease, figure, itemOf, SLOTS, brushBand, measureSpaced, offscreen,
} from '../kit.js';
import { T } from '../../show/timing.js';

const proseI = (n) => `italic ${n}px Baskerville, Palatino, Georgia, serif`;
const short = (n) => String(n || '').replace(/^The /, '');

// the layout: a column for each fighter, the reading down the middle
const CX = W / 2;
const MID_L = 322, MID_R = W - 322;          // the middle column
const COL = [[10, 316], [W - 316, W - 10]];  // the fighters' columns
const FIG_TOP = 204, FIG_FLOOR = 706;         // the figure's whole drawing sits between these
const ROW_Y0 = 160, ROW_H = 68;

// ---- the figures, measured so both stand whole and at the same scale ---------------------
// A class draws taller or wider than its `height` says (a raised pole, a chain behind), so each
// build is drawn once off screen and its inked extent kept. Keyed by build; cheap after that.
const REF = 240;
const boxes = new Map();
function figureBox(lo) {
  const key = [lo.cls, lo.weapon, lo.spell, lo.charm].join('|');
  let b = boxes.get(key);
  if (b) return b;
  b = { top: -REF * 1.55, bot: 14, left: -REF * 0.5, right: REF * 0.5 };
  try {
    const cw = 960, ch = 640, ox = 480, oy = 540;
    const c = offscreen(cw, ch);
    const g = c.getContext('2d', { willReadFrequently: true });
    figure(g, { loadout: lo, x: ox, y: oy, height: REF, facing: 1, pose: 'idle', t: 0 });
    const d = g.getImageData(0, 0, cw, ch).data;
    let top = ch, bot = -1, left = cw, right = -1;
    for (let y = 0; y < ch; y++) {
      const row = y * cw * 4;
      for (let x = 0; x < cw; x++) {
        if (d[row + x * 4 + 3] > 40) {
          if (y < top) top = y;
          bot = y;
          if (x < left) left = x;
          if (x > right) right = x;
        }
      }
    }
    if (bot > top) b = { top: top - oy, bot: bot - oy, left: left - ox, right: right - ox };
  } catch { /* the guessed box stands in */ }
  boxes.set(key, b);
  return b;
}

// each as large as its column allows, and never more than a sixth larger than the other, so a
// crouching thief and a tall hexer still read as the same world; then each stands centred
function placeFigures(la, lb) {
  const bs = [figureBox(la), figureBox(lb)];
  const sp = 7; // room for the sway
  const ks = bs.map((b, i) => {
    const cw = COL[i][1] - COL[i][0] - sp * 2;
    return Math.min((FIG_FLOOR - FIG_TOP) / (b.bot - b.top), cw / (b.right - b.left), 1.9);
  });
  const kMax = Math.min(...ks) * 1.17;
  return bs.map((b, i) => {
    const k = Math.min(ks[i], kMax);
    const facing = i === 0 ? 1 : -1;
    const mid = (COL[i][0] + COL[i][1]) / 2;
    const off = ((b.left + b.right) / 2) * k * facing;
    return { x: mid - off, y: FIG_FLOOR - b.bot * k, height: REF * k, facing, top: FIG_FLOOR - (b.bot - b.top) * k };
  });
}

// name, model and the figure, which breathes, shifts its weight and slides in from its own side
function side(ctx, env, id, i, place, delay) {
  const b = env.bot(id);
  const lo = env.sh.loadouts[id] || {};
  const x = (COL[i][0] + COL[i][1]) / 2;
  const a = ease(env.age, delay, 600);
  const facing = i === 0 ? 1 : -1;

  ctx.save();
  ctx.globalAlpha = a;
  const ph = i * 2.1;
  const sway = Math.sin(env.t / 1300 + ph) * 0.016 + Math.sin(env.t / 470 + ph) * 0.004;
  const breath = 1 + Math.sin(env.t / 820 + ph) * 0.008;
  ctx.translate(-facing * (1 - a) * 80 + Math.sin(env.t / 1700 + ph) * 4, 0);
  ctx.translate(place.x, place.y);
  ctx.rotate(sway * facing);
  ctx.scale(1, breath);
  ctx.translate(-place.x, -place.y);
  figure(ctx, { loadout: lo, x: place.x, y: place.y, height: place.height, facing, pose: 'idle', t: env.t + i * 900, accent: b.accent });
  ctx.restore();

  // kept clear of the frame's edge
  const tn = title(ctx, b.name.toUpperCase(), x, 84, 64, { maxW: Math.min(COL[i][1] - COL[i][0] - 16, 2 * (Math.min(x, W - x) - 44)), spacing: 6, weight: 'bold', alpha: a });
  const nw = tn.width / 2 + 8;
  underline(ctx, x - nw, x + nw, 100, b.accent, { width: 8, seed: facing + 4, reveal: ease(env.age, delay + 300, 500) });
  text(ctx, b.scripted ? 'scripted' : b.modelLabel, x, 132, proseI(24), { align: 'center', alpha: a });
  if (env.highlight === id) {
    // the viewer's contender: a ribbon under the name, set beside the figure's head
    const ny = 158;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = b.accent;
    ctx.beginPath(); ctx.moveTo(x - 44, ny); ctx.lineTo(x + 44, ny); ctx.lineTo(x + 44, ny + 28); ctx.lineTo(x, ny + 20); ctx.lineTo(x - 44, ny + 28); ctx.closePath(); ctx.fill();
    text(ctx, 'your pick', x, ny + 18, ital(16), { color: CREAM, align: 'center' });
    ctx.restore();
  }
}

const NAME_MAX = 270, NAME_IN = 40;
const nameOf = (slot, id) => (id ? short(itemOf(slot, id).name).toUpperCase() : '');

// the one size for every pick: the largest at which the longest of the eight fits its side on one line
function rowSize(ctx, la, lb) {
  const names = SLOTS.flatMap((slot) => [nameOf(slot, la[slot]), nameOf(slot, lb[slot])]);
  let size = 28;
  while (size > 14 && Math.max(...names.map((n) => measureSpaced(ctx, n, caps(size, 'bold'), 1.2))) > NAME_MAX) size -= 1;
  return size;
}

// one slot of both builds, left and right of the centre
function buildRow(ctx, y, slot, la, lb, size) {
  const l = nameOf(slot, la[slot]), r = nameOf(slot, lb[slot]);
  title(ctx, l, CX - NAME_IN, y + 10, size, { align: 'right', spacing: 1.2, weight: 'bold', font: caps, maxW: NAME_MAX });
  title(ctx, r, CX + NAME_IN, y + 10, size, { align: 'left', spacing: 1.2, weight: 'bold', font: caps, maxW: NAME_MAX });
}

export const tapeScene = {
  ground: 'paper',
  draw(ctx, env) {
    const { age, sh, t } = env;
    const [ia, ib] = sh.order;
    paperGround(ctx, 14);
    // masthead over the middle column; the names stand either side of it
    title(ctx, 'THE TAPE', CX, 74, 38, { spacing: 11, weight: 'bold', maxW: MID_R - MID_L - 20 });
    if (!ia || !ib) return;
    const la = sh.loadouts[ia] || {}, lb = sh.loadouts[ib] || {};

    const places = placeFigures(la, lb);
    side(ctx, env, ia, 0, places[0], 200);
    side(ctx, env, ib, 1, places[1], 350);

    // the picks, row by row, all in one size
    const size = rowSize(ctx, la, lb);
    SLOTS.forEach((slot, i) => {
      ctx.save();
      ctx.globalAlpha = prog(age, 500 + i * 220, 400);
      buildRow(ctx, ROW_Y0 + i * ROW_H, slot, la, lb, size);
      ctx.restore();
    });

    // the temper: the one loud band, the thing tonight's matchup turns on, its name alone
    const tp = sh.temper ? itemOf('temper', sh.temper) : null;
    if (tp) {
      const ty = 492;
      const a3 = ease(age, 1500, 420);
      brushBand(ctx, MID_L - 8, MID_R - MID_L + 16, ty, 80, { seed: 9, reveal: a3 });
      if (a3 > 0.6) {
        const aa = prog(age, 1750, 300);
        title(ctx, tp.name.toUpperCase(), CX, ty + 14, 40, { color: CREAM, spacing: 4, weight: 'bold', alpha: aa, maxW: MID_R - MID_L - 120 });
      }
    }

    // predictions: the call to action, across the foot of the middle column
    const win = env.whoWindow;
    predictions(ctx, {
      x: MID_L, y: 582, w: MID_R - MID_L, h: 102, t, alpha: prog(age, 1200, 500),
      state: win ? (win.state === 'open' ? 'open' : 'closed') : 'soon',
      left: win ? Math.max(0, win.closesAt - env.serverNow) : 0, total: T.tapeWindow,
      since: win && win.lockedAt != null ? env.serverNow - win.lockedAt : 9999,
    });
  },
};

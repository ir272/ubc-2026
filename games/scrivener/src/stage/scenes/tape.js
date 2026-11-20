// Phase 3, the matchup. Plain paper, cards everywhere. Each fighter's name heads its side with
// the model under it, and its hand of four picture cards (class, weapon, spell, charm, each with
// its red slot word) is laid out under the name. The two figures stand large between the hands,
// facing each other across the boss's temper card, the one with a red name. The prediction clock
// sits on a plate at the head of the page. Betting opens only here, once every pick is public.
// The cards are the same cards the choosing deals, at a larger size. Owner: lead.

import {
  W, INK, RED, paperGround, title, text, underline, predictions,
  prog, ease, figure, SLOTS, offscreen, itemOf,
} from '../kit.js';
import { T } from '../../show/timing.js';
import { pickCard, fitName, SLOT_LABEL } from './choosing.js';

const SHEET = '#f1ead7';
const CX = W / 2;
const proseI = (n) => `italic ${n}px Baskerville, Palatino, Georgia, serif`;

// ---- layout ----------------------------------------------------------------------------------------
const SIDE_IN = 22;                                   // the hands' outer margin
const NAME_Y = 92;
const CARD_W = 160, CARD_H = 240, CARD_GAP = 12, CARD_TOP = 166;
const HAND_W = 2 * CARD_W + CARD_GAP;
// the clock on its plate at the head of the page, the temper card under it, the figures facing off below
const CLOCK = { x: 404, y: 16, w: 472, h: 96 };
const TEMPER = { w: 156, h: 222, y: 132 + 111 };
const FIG = { top: TEMPER.y + TEMPER.h / 2 + 14, floor: 696, regions: [[SIDE_IN + HAND_W + 14, CX - 8], [CX + 8, W - SIDE_IN - HAND_W - 14]] };

function cardAt(f, i) {
  const x0 = f === 0 ? SIDE_IN : W - SIDE_IN - HAND_W;
  return { x: x0 + (i % 2) * (CARD_W + CARD_GAP) + CARD_W / 2, y: CARD_TOP + Math.floor(i / 2) * (CARD_H + CARD_GAP) + CARD_H / 2 };
}

// ---- the figures, measured so both stand whole and at the same scale ---------------------
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
    for (const t of [0, 450, 900, 1350]) figure(g, { loadout: lo, x: ox, y: oy, height: REF, facing: 1, pose: 'idle', t });
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

// Each as large as its region allows, never more than three tenths larger than the other, with its
// leading edge on the inner side of its region so the two face each other across the temper.
function placeFigures(la, lb) {
  const bs = [figureBox(la), figureBox(lb)];
  const sp = 8; // room for the sway
  const ks = bs.map((b, i) => Math.min((FIG.floor - FIG.top) / (b.bot - b.top), (FIG.regions[i][1] - FIG.regions[i][0] - sp * 2) / (b.right - b.left), 2.2));
  const kMax = Math.min(...ks) * 1.3;
  return bs.map((b, i) => {
    const k = Math.min(ks[i], kMax);
    const facing = i === 0 ? 1 : -1;
    const x = i === 0 ? FIG.regions[0][1] - sp - b.right * k : FIG.regions[1][0] + sp + b.right * k;
    return { x, y: FIG.floor - b.bot * k, height: REF * k, facing };
  });
}

// the figure breathes, shifts its weight and slides in from its own side
function stand(ctx, env, id, i, place, delay) {
  const b = env.bot(id);
  const lo = env.sh.loadouts[id] || {};
  const a = ease(env.age, delay, 700);
  const facing = place.facing;
  ctx.save();
  ctx.globalAlpha = a;
  const ph = i * 2.1;
  const sway = Math.sin(env.t / 1300 + ph) * 0.016 + Math.sin(env.t / 470 + ph) * 0.004;
  const breath = 1 + Math.sin(env.t / 820 + ph) * 0.008;
  ctx.translate(-facing * (1 - a) * 120 + Math.sin(env.t / 1700 + ph) * 3, 0);
  ctx.translate(place.x, place.y);
  ctx.rotate(sway * facing);
  ctx.scale(1, breath);
  ctx.translate(-place.x, -place.y);
  figure(ctx, { loadout: lo, x: place.x, y: place.y, height: place.height, facing, pose: 'idle', t: env.t + i * 900, accent: b.accent });
  ctx.restore();
}

// the name, its stroke in the fighter's colour, the model, and the viewer's marker
function head(ctx, env, id, f, delay) {
  const b = env.bot(id);
  const a = ease(env.age, delay, 600);
  const align = f === 0 ? 'left' : 'right';
  const x = f === 0 ? SIDE_IN + 2 : W - SIDE_IN - 2;
  if (env.highlight === id) text(ctx, 'your pick', x, NAME_Y - 50, proseI(19), { color: b.accent, align, alpha: a });
  const tn = title(ctx, b.name.toUpperCase(), x, NAME_Y, 50, { align, maxW: HAND_W, spacing: 5, weight: 'bold', alpha: a });
  const x0 = f === 0 ? x : x - tn.width;
  underline(ctx, x0 - 4, x0 + tn.width + 4, NAME_Y + 14, b.accent, { width: 7, seed: f * 2 + 3, reveal: ease(env.age, delay + 300, 500) });
  const who = b.scripted ? 'scripted' : b.modelLabel;
  text(ctx, who, x, NAME_Y + 42, proseI(21), { align, alpha: a });
}

// a card is laid down in its own place: a short drop and a slight turn that settles
function dealt(age, at, seed) {
  const d = ease(age, at, 420);
  return { a: prog(age, at, 160), dy: -(1 - d) * 16, k: 1 + (1 - d) * 0.12, rot: (1 - d) * 0.08 * (seed % 2 ? 1 : -1) };
}
function laid(ctx, d, x, y, draw) {
  ctx.save();
  ctx.translate(x, y); ctx.scale(d.k, d.k); ctx.translate(-x, -y);
  draw();
  ctx.restore();
}
const CARD_AT = (f, i) => 500 + (i * 2 + f) * 220;   // left class, right class, left weapon, ...
const TEMPER_AT = CARD_AT(1, 3) + 420;
// once everything is down, the two hands are read slot by slot: both class cards lift together,
// then both weapons, both spells, both charms, then the temper; and round again
const READ_AT = TEMPER_AT + 1000, READ_STEP = 1400;
function readLift(age, k) {
  if (age < READ_AT) return 0;
  const u = (age - READ_AT) % (READ_STEP * 5);
  const mine = u - k * READ_STEP;
  if (mine < 0 || mine > READ_STEP) return 0;
  return prog(mine, 0, 260) * (1 - prog(mine, READ_STEP - 320, 320));
}

// one name size for all eight cards, so the hands read as a set
function handNameSize(ctx, names) {
  let s = 20;
  const maxW = CARD_W - Math.max(9, CARD_W * 0.075) * 1.2;
  for (; s > 15; s -= 0.5) if (names.every((n) => fitName(ctx, n, s, maxW, s).ok)) break;
  return s;
}

function clock(ctx, env) {
  const win = env.whoWindow;
  if (!win) return;
  const a = ease(env.age, 900, 500);
  ctx.save();
  ctx.globalAlpha = a;
  ctx.translate(0, -(1 - a) * 14);
  ctx.fillStyle = 'rgba(20,14,6,0.42)'; ctx.fillRect(CLOCK.x + 5, CLOCK.y + 6, CLOCK.w, CLOCK.h);
  ctx.fillStyle = SHEET; ctx.fillRect(CLOCK.x, CLOCK.y, CLOCK.w, CLOCK.h);
  ctx.strokeStyle = INK; ctx.lineWidth = 3; ctx.strokeRect(CLOCK.x + 1.5, CLOCK.y + 1.5, CLOCK.w - 3, CLOCK.h - 3);
  predictions(ctx, {
    x: CLOCK.x + 28, y: CLOCK.y + 4, w: CLOCK.w - 56, h: CLOCK.h - 8, t: env.t,
    state: win.state === 'open' ? 'open' : 'closed',
    left: Math.max(0, win.closesAt - env.serverNow), total: T.tapeWindow,
    since: win.lockedAt != null ? env.serverNow - win.lockedAt : 9999,
  });
  ctx.restore();
}

export const tapeScene = {
  ground: 'paper',
  draw(ctx, env) {
    const { sh, age } = env;
    const [ia, ib] = sh.order;
    paperGround(ctx, 14);
    if (!ia || !ib) return;
    const la = sh.loadouts[ia] || {}, lb = sh.loadouts[ib] || {};

    // the two fighters, facing each other across the middle
    const places = placeFigures(la, lb);
    stand(ctx, env, ia, 0, places[0], 150);
    stand(ctx, env, ib, 1, places[1], 300);
    head(ctx, env, ia, 0, 100);
    head(ctx, env, ib, 1, 250);

    // the two hands, dealt one card at a time, alternating sides
    const nameSize = handNameSize(ctx, SLOTS.flatMap((s) => [la[s], lb[s]].filter(Boolean).map((id) => cardTitle(s, id))));
    [[ia, la, 0], [ib, lb, 1]].forEach(([id, lo, f]) => {
      const accent = env.bot(id).accent;
      SLOTS.forEach((slot, i) => {
        if (!lo[slot]) return;
        const d = dealt(age, CARD_AT(f, i), i + f);
        if (d.a <= 0) return;
        const at = cardAt(f, i);
        const lift = readLift(age, i);
        laid(ctx, d, at.x, at.y, () => pickCard(ctx, slot, lo[slot], at.x, at.y + d.dy, CARD_W, CARD_H, { accent, edge: accent, label: SLOT_LABEL[slot], alpha: d.a, rot: d.rot, lift: lift * 0.6, chosen: lift * 0.5, nameSize, minName: 15 }));
      });
    });

    // the temper: the card between them, the one red name
    if (sh.temper) {
      const d = dealt(age, TEMPER_AT, 1);
      const lift = readLift(age, 4);
      laid(ctx, d, CX, TEMPER.y, () => pickCard(ctx, 'temper', sh.temper, CX, TEMPER.y + d.dy, TEMPER.w, TEMPER.h, { nameColor: RED, alpha: d.a, rot: d.rot, lift: lift * 0.6, nameSize: 21, minName: 15 }));
    }

    clock(ctx, env);
  },
};

function cardTitle(kind, id) { return String(itemOf(kind, id).name || '').replace(/^The /, '').toUpperCase(); }

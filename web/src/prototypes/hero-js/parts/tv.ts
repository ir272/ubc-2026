// The television at the far left: a 1970s wooden set on a little stand, seen slightly from the right so its
// left side and top show. A side-scroller plays on the screen and its land pours out over the bezel and down
// to the ground. Everything that never moves (cabinet, bezel, controls, grille, stand, console, the pour's
// body) is painted once into offscreen canvases; the antenna, the picture, the dials, the lamp, the plant,
// the steam, the cable, the lip of the pour, coins and sparkles are drawn live.
import { BLUE, GOLD, GREEN, GREEN_LINE, INK, ORANGE, PAPER, TV, WARM, wind } from '../engine/layout';
import type { Part, Pt } from '../engine/types';
import { GAME_BG, drawGame, nearGroundAt } from './left/game';
import {
  GREEN_LIT, GREEN_SHADE, TAU, W_DET, W_FORM, W_HAIR, W_SIL, cache, curve, disc, fillPts, line, mod, rnd, rounded, rrect, seg, shape,
  smooth, taper, tone, trace, tuft, type Ctx,
} from './left/kit';
import { FRONT_BOX, PEAK_FLANK, paintFront } from './left/land';
import { screenGlow } from './left/world';

const S = TV.screen;
// the cabinet: a front face plus a depth that recedes up and to the left
const FX0 = 142, FX1 = 650, FY0 = 178, FY1 = 536;
const DX = -16, DY = -16;
const GLASS = rrect(S.x, S.y, S.w, S.h, 34, 7);
const ring = (o: number) => rrect(S.x - o, S.y - o, S.w + 2 * o, S.h + 2 * o, 34 + o * 0.6, 7);

const wood = (k: number) => tone(WARM, k);
const DIAL: Pt = [588, 232];
const VOL: Pt = [566, 291];
const LAMP: Pt = [617, 321];
const ANT: Pt = [400, 150];
const PLANT: Pt = [584, 146];
const MUG: Pt = [236, 144];

// ---------------- the static set ----------------
function paintSet(c: Ctx) {
  // contact shadows on the ground
  disc(c, 396, 608, 262, GREEN_SHADE, null, 0, 0.55, 6);
  disc(c, 168, 606, 24, GREEN_SHADE, null, 0, 0.9, 4.5);
  disc(c, 624, 606, 24, GREEN_SHADE, null, 0, 0.9, 4.5);

  // back legs
  for (const x of [212, 584]) {
    shape(c, [[x - 6, 536], [x + 6, 536], [x + 3, 592], [x - 3, 592]], wood(0.08), wood(0.6), W_DET);
  }
  // a stretcher bar between the front legs, pegged at each end
  shape(c, [[181, 583.5], [612, 583.5], [612, 589], [181, 589]], wood(0.2), WARM, W_DET);
  seg(c, 190, 586.2, 600, 586.2, W_HAIR, WARM, 0.4);
  for (const x of [186, 606]) disc(c, x, 586.2, 1.6, GOLD);
  // shelf slung between the legs, with its receding top
  shape(c, [[182, 560], [612, 560], [624, 569], [170, 569]], wood(0.26), WARM, W_DET);
  shape(c, [[170, 569], [624, 569], [624, 578], [170, 578]], wood(0.13), WARM, W_FORM);
  for (let i = 0; i < 7; i++) seg(c, 186 + i * 62 + rnd(i) * 20, 573.5, 216 + i * 62 + rnd(i + 9) * 24, 573.5, W_HAIR, WARM, 0.4);
  // controller on the shelf, its lead running to the console
  line(c, curve([[262, 558], [276, 566], [292, 563], [304, 556]], 6), W_DET, ORANGE, 0.8);
  shape(c, rrect(220, 550, 44, 13, 5), tone(ORANGE, 0.2), ORANGE, W_DET);
  seg(c, 229, 556.5, 237, 556.5, 1.6, ORANGE);
  seg(c, 233, 552.5, 233, 560.5, 1.6, ORANGE);
  disc(c, 250, 554.5, 1.9, GOLD);
  disc(c, 256, 558.5, 1.9, GOLD);
  // the console with a cartridge standing in its slot
  shape(c, [[334, 538], [372, 538], [372, 549], [334, 549]], tone(BLUE, 0.22), BLUE, W_DET);
  shape(c, [[340, 541], [366, 541], [366, 547], [340, 547]], tone(INK, 0.3), tone(BLUE, 0.8), W_HAIR);
  shape(c, rrect(302, 547, 106, 18, 4), tone(ORANGE, 0.17), ORANGE, W_FORM);
  fillPts(c, [[304, 558], [406, 558], [406, 563], [304, 563]], tone(ORANGE, 0.08));
  seg(c, 310, 552, 400, 552, W_HAIR, ORANGE, 0.55);
  for (let i = 0; i < 6; i++) seg(c, 372 + i * 5, 556, 372 + i * 5, 562, W_HAIR, ORANGE, 0.6);
  disc(c, 314, 558, 2.2, tone(GOLD, 0.7), GOLD, 1.1);
  shape(c, rrect(322, 555.5, 14, 5, 2), tone(ORANGE, 0.35), ORANGE, W_HAIR);
  // spare cartridges, stacked
  for (let i = 0; i < 2; i++) {
    const x = 452 + i * 5, y = 556 - i * 9, col = i ? WARM : BLUE;
    shape(c, [[x, y], [x + 46, y], [x + 46, y + 9], [x, y + 9]], tone(col, 0.2), col, W_DET);
    shape(c, [[x + 8, y + 2.2], [x + 30, y + 2.2], [x + 30, y + 6.8], [x + 8, y + 6.8]], tone(INK, 0.28), tone(col, 0.8), 1);
    seg(c, x + 36, y + 2.5, x + 36, y + 6.5, 1, col, 0.7);
    seg(c, x + 40, y + 2.5, x + 40, y + 6.5, 1, col, 0.7);
  }

  // front legs: tapered, splayed, with brass ferrules
  const leg = (x: number, d: number) => {
    const top: Pt[] = [[x - 9, 536], [x + 9, 536], [x + d * 13 + 4.5, 598], [x + d * 13 - 4.5, 598]];
    shape(c, top, wood(0.17), WARM, W_FORM);
    fillPts(c, [[x - 9, 538], [x - 4, 538], [x + d * 13 - 2.5, 586], [x + d * 13 - 4.5, 586]], wood(0.3));
    seg(c, x + 2, 544, x + d * 11 + 1, 584, W_HAIR, WARM, 0.4);
    shape(c, [[x + d * 10.6 - 5.2, 586], [x + d * 10.6 + 5.2, 586], [x + d * 13 + 4.5, 598], [x + d * 13 - 4.5, 598]], tone(GOLD, 0.5), GOLD, W_DET);
    seg(c, x + d * 11.6 - 5, 590.5, x + d * 11.6 + 5, 590.5, 1, tone(GOLD, 0.2));
  };
  leg(178, -1);
  leg(614, 1);
  // apron rail under the cabinet
  shape(c, [[152, 536], [640, 536], [636, 547], [156, 547]], wood(0.08), WARM, W_FORM);
  for (let i = 0; i < 9; i++) seg(c, 166 + i * 52, 541.5, 196 + i * 52, 541.5, W_HAIR, WARM, 0.3);

  // the cabinet: left side, top, front
  const side: Pt[] = [[FX0, FY0 + 6], [FX0 + DX, FY0 + DY + 8], [FX0 + DX, FY1 + DY - 4], [FX0, FY1 - 4]];
  shape(c, side, wood(0.24), WARM, W_SIL);
  for (let i = 0; i < 6; i++) {
    const y = FY0 + 46 + i * 11;
    seg(c, FX0 - 4, y, FX0 - 12, y - 8, 2.4, PAPER, 0.9);
    seg(c, FX0 - 4, y + 1.8, FX0 - 12, y - 6.2, 1, WARM, 0.7);
  }
  seg(c, FX0 - 8, FY0 + 150, FX0 - 8, FY1 - 40, W_HAIR, WARM, 0.4);
  seg(c, FX0 - 4, FY0 + 130, FX0 - 4, FY1 - 70, W_HAIR, WARM, 0.3);
  const top: Pt[] = [[FX0 + 4, FY0], [FX1 - 4, FY0], [FX1 + DX - 6, FY0 + DY], [FX0 + DX + 6, FY0 + DY]];
  shape(c, top, wood(0.3), WARM, W_SIL);
  for (let i = 0; i < 4; i++) {
    const y = FY0 - 3 - i * 3.4, off = -i * 3.4;
    for (let k = 0, x = FX0 + 14 + off + rnd(i * 3) * 30; x < FX1 - 60 + off; k++) {
      const len = 40 + rnd(i * 7 + k) * 90;
      seg(c, x, y, Math.min(FX1 - 24 + off, x + len), y, W_HAIR, WARM, 0.32);
      x += len + 14 + rnd(i + k * 5) * 40;
    }
  }
  // vent slits on the top, toward the back
  for (let i = 0; i < 7; i++) seg(c, 452 + i * 9, FY0 - 5, 448 + i * 9, FY0 - 11, 1.6, PAPER, 0.9);
  const face = rrect(FX0, FY0, FX1 - FX0, FY1 - FY0, 10);
  shape(c, face, wood(0.16), WARM, W_SIL);
  // shade on the right edge and along the bottom band, grain in the band
  fillPts(c, [[FX1 - 9, FY0 + 8], [FX1 - 2, FY0 + 10], [FX1 - 2, FY1 - 8], [FX1 - 9, FY1 - 3]], wood(0.08));
  fillPts(c, [[FX0 + 4, FY1 - 12], [FX1 - 4, FY1 - 12], [FX1 - 6, FY1 - 2], [FX0 + 6, FY1 - 2]], wood(0.09));
  for (let i = 0; i < 3; i++) {
    for (let k = 0, x = FX0 + 10 + rnd(i * 4 + 1) * 30; x < 520; k++) {
      const len = 30 + rnd(i * 6 + k * 2) * 70;
      seg(c, x, 513 + i * 6.5, Math.min(528, x + len), 513 + i * 6.5, W_HAIR, WARM, 0.34);
      x += len + 10 + rnd(i * 2 + k) * 30;
    }
  }
  line(c, rrect(FX0 + 5, FY0 + 5, FX1 - FX0 - 10, FY1 - FY0 - 10, 7), W_HAIR, WARM, 0.45, true);
  for (const [sx, sy] of [[FX0 + 11, FY0 + 9.5], [FX1 - 11, FY0 + 9.5], [FX0 + 11, FY1 - 9.5], [FX1 - 11, FY1 - 9.5]] as Pt[]) {
    disc(c, sx, sy, 2.7, wood(0.4), WARM, 1.1);
    seg(c, sx - 1.6, sy - 1.2, sx + 1.6, sy + 1.2, 1, WARM);
  }
  // a small door flap in the lower band, with a finger pull
  shape(c, rrect(300, 512, 96, 17, 3), wood(0.2), WARM, W_HAIR);
  seg(c, 338, 520.5, 358, 520.5, W_DET, WARM, 0.9);

  // bezel: nested rings with filled bands between them
  shape(c, ring(22), wood(0.07), WARM, W_FORM);
  shape(c, ring(15.5), tone(ORANGE, 0.24), ORANGE, W_FORM);
  shape(c, ring(9), wood(0.1), WARM, W_DET);
  shape(c, ring(3.5), '#080c09', tone(INK, 0.8), 1.6);
  // light catching the top-left of the orange band, hatch in the shadow under the lip
  line(c, curve([[S.x - 12.5, S.y + 150], [S.x - 12.5, S.y + 34], [S.x + 4, S.y - 6], [S.x + 40, S.y - 12.5], [S.x + 190, S.y - 12.5]], 6), 1.3, tone(ORANGE, 0.75), 0.8);
  for (let x = S.x + 16; x < S.x + S.w - 10; x += 7 + rnd(x) * 5) seg(c, x, S.y + S.h + 16.5, x - 3.2, S.y + S.h + 21, W_HAIR, WARM, 0.5);
  for (let y = S.y + 30; y < S.y + S.h - 20; y += 8 + rnd(y) * 6) seg(c, S.x + S.w + 16.8, y, S.x + S.w + 21, y + 3.4, W_HAIR, WARM, 0.42);
  fillPts(c, GLASS, GAME_BG);

  // control column
  shape(c, rrect(538, 194, 100, 330, 8), wood(0.1), WARM, W_FORM);
  fillPts(c, [[540, 200], [636, 200], [636, 206], [540, 206]], wood(0.06));
  // channel dial: tick scale, collar, knurled knob (the pointer is live)
  for (let i = 0; i < 12; i++) {
    const a = (i / 12) * TAU, r0 = 28.5, r1 = i % 3 === 0 ? 34 : 32;
    seg(c, DIAL[0] + Math.cos(a) * r0, DIAL[1] + Math.sin(a) * r0, DIAL[0] + Math.cos(a) * r1, DIAL[1] + Math.sin(a) * r1, i % 3 === 0 ? 1.6 : 1.1, WARM, 0.9);
  }
  disc(c, DIAL[0] + 1.5, DIAL[1] + 2, 25, wood(0.05));
  disc(c, DIAL[0], DIAL[1], 24.5, wood(0.2), WARM, W_FORM);
  disc(c, DIAL[0], DIAL[1], 18, wood(0.32), WARM, W_DET);
  for (let i = 0; i < 20; i++) {
    const a = (i / 20) * TAU;
    seg(c, DIAL[0] + Math.cos(a) * 18.5, DIAL[1] + Math.sin(a) * 18.5, DIAL[0] + Math.cos(a) * 23.5, DIAL[1] + Math.sin(a) * 23.5, 1, WARM, 0.5);
  }
  c.beginPath();
  c.arc(DIAL[0], DIAL[1], 15, Math.PI * 1.05, Math.PI * 1.55);
  c.strokeStyle = tone(WARM, 0.8);
  c.lineWidth = 1.2;
  c.stroke();
  // volume dial with an arc scale, and a fine-tune dial
  c.beginPath();
  c.arc(VOL[0], VOL[1], 17.5, Math.PI * 0.85, Math.PI * 2.15);
  c.strokeStyle = WARM;
  c.globalAlpha = 0.6;
  c.lineWidth = 1.1;
  c.stroke();
  c.globalAlpha = 1;
  for (let i = 0; i < 6; i++) {
    const a = Math.PI * (0.85 + (i / 5) * 1.3);
    seg(c, VOL[0] + Math.cos(a) * 17.5, VOL[1] + Math.sin(a) * 17.5, VOL[0] + Math.cos(a) * 20, VOL[1] + Math.sin(a) * 20, 1.1, WARM, 0.8);
  }
  disc(c, VOL[0] + 1, VOL[1] + 1.5, 13.5, wood(0.05));
  disc(c, VOL[0], VOL[1], 13, wood(0.28), WARM, W_DET);
  disc(c, 611, 291, 9, wood(0.28), WARM, W_DET);
  seg(c, 611, 291, 616, 285, 1.6, WARM);
  disc(c, 611, 291, 2, WARM);
  // push buttons, the lamp's bezel, the blank brand plate
  for (const bx of [551, 577]) {
    fillPts(c, rrect(bx + 1, 317.5, 21, 10, 3), wood(0.05));
    shape(c, rrect(bx, 316, 21, 10, 3), wood(0.3), WARM, 1.5);
    seg(c, bx + 5, 319, bx + 16, 319, 1, tone(WARM, 0.75), 0.8);
  }
  disc(c, LAMP[0], LAMP[1], 5.4, wood(0.06), WARM, 1.4);
  shape(c, rrect(553, 336, 70, 11.5, 3), tone(GOLD, 0.26), GOLD, 1.4);
  seg(c, 560, 339.5, 616, 339.5, 1, tone(GOLD, 0.6), 0.7);
  disc(c, 557, 341.8, 0.9, GOLD);
  disc(c, 619, 341.8, 0.9, GOLD);
  // speaker grille: slats with a shade line under each
  shape(c, rrect(547, 355, 82, 162, 6), wood(0.05), WARM, W_DET);
  for (let i = 0; i < 17; i++) {
    const y = 363.5 + i * 9.1;
    seg(c, 553.5, y, 622.5, y, W_DET, WARM, 0.92);
    seg(c, 554.5, y + 2.6, 622.5, y + 2.6, 1, tone(WARM, 0.42));
  }

  // antenna base on the top: collar and dome (the rods are live)
  disc(c, ANT[0] + 2, 171.5, 39, wood(0.12), null, 0, 1, 7);
  disc(c, ANT[0], 169, 36, wood(0.22), WARM, W_FORM, 1, 7.5);
  c.beginPath();
  c.ellipse(ANT[0], 167, 27, 19, 0, Math.PI, TAU);
  c.closePath();
  c.fillStyle = wood(0.2);
  c.fill();
  c.strokeStyle = WARM;
  c.lineWidth = W_FORM;
  c.stroke();
  c.beginPath();
  c.ellipse(ANT[0], 167, 20, 13.5, 0, Math.PI * 1.08, Math.PI * 1.42);
  c.strokeStyle = tone(WARM, 0.85);
  c.lineWidth = 1.3;
  c.stroke();
  fillPts(c, [[ANT[0] + 12, 152], [ANT[0] + 26, 162], [ANT[0] + 26, 167], [ANT[0] + 8, 167]], wood(0.1));
  seg(c, ANT[0] - 27, 167, ANT[0] + 27, 167, 1.2, WARM, 0.7);

  // on top of the set: a mug, a pair of cartridges, a plant pot (leaves and steam are live)
  disc(c, MUG[0], 169, 15, wood(0.12), null, 0, 1, 3.4);
  c.beginPath();
  c.ellipse(MUG[0] + 11, MUG[1] + 12, 6.5, 7, 0, -Math.PI * 0.45, Math.PI * 0.45);
  c.strokeStyle = INK;
  c.lineWidth = 2.2;
  c.stroke();
  shape(c, [[MUG[0] - 10, MUG[1]], [MUG[0] + 10, MUG[1]], [MUG[0] + 8.5, MUG[1] + 24], [MUG[0] - 8.5, MUG[1] + 24]], tone(INK, 0.2), INK, W_DET);
  fillPts(c, [[MUG[0] + 3, MUG[1] + 1], [MUG[0] + 9.4, MUG[1] + 1], [MUG[0] + 8, MUG[1] + 23], [MUG[0] + 3, MUG[1] + 23]], tone(INK, 0.1));
  fillPts(c, [[MUG[0] - 9.5, MUG[1] + 9], [MUG[0] + 9.5, MUG[1] + 9], [MUG[0] + 9.2, MUG[1] + 14], [MUG[0] - 9.2, MUG[1] + 14]], tone(ORANGE, 0.6));
  disc(c, MUG[0], MUG[1], 10, tone(INK, 0.1), INK, 1.4, 1, 2.6);
  for (let i = 0; i < 2; i++) {
    const x = 276 + i * 6, y = 160 - i * 8.5, col = i ? ORANGE : BLUE;
    shape(c, [[x, y], [x + 44, y], [x + 44, y + 8.5], [x, y + 8.5]], tone(col, 0.2), col, W_DET);
    shape(c, [[x + 7, y + 2], [x + 28, y + 2], [x + 28, y + 6.5], [x + 7, y + 6.5]], tone(INK, 0.28), tone(col, 0.8), 1);
  }
  disc(c, PLANT[0], 169.5, 17, wood(0.12), null, 0, 1, 3.6);
  shape(c, [[PLANT[0] - 12, PLANT[1] + 4], [PLANT[0] + 12, PLANT[1] + 4], [PLANT[0] + 8.5, PLANT[1] + 23], [PLANT[0] - 8.5, PLANT[1] + 23]], tone(ORANGE, 0.26), ORANGE, W_DET);
  fillPts(c, [[PLANT[0] + 3, PLANT[1] + 6], [PLANT[0] + 11, PLANT[1] + 6], [PLANT[0] + 8, PLANT[1] + 22], [PLANT[0] + 3, PLANT[1] + 22]], tone(ORANGE, 0.12));
  shape(c, rrect(PLANT[0] - 14, PLANT[1], 28, 6, 2), tone(ORANGE, 0.36), ORANGE, W_DET);
  seg(c, PLANT[0] - 7, PLANT[1] + 13, PLANT[0] + 1, PLANT[1] + 13, 1, ORANGE, 0.6);
}

function rod(ctx: Ctx, t: number, a0: number, lens: readonly number[], phase: number) {
  let x = ANT[0], y = ANT[1];
  const widths = [5.2, 3.8, 2.6];
  for (let i = 0; i < lens.length; i++) {
    const tl = t - i * 0.13;
    const k = mod(tl + phase, 7.3);
    const sway = 0.05 * wind(tl, 400) * (1 + i * 0.7) + 0.045 * Math.exp(-1.9 * k) * Math.sin(k * 12) * (1 + i * 0.6);
    const a = a0 + sway;
    const nx = x + Math.sin(a) * lens[i]!, ny = y - Math.cos(a) * lens[i]!;
    seg(ctx, x, y, nx, ny, widths[i]!, WARM);
    if (i < 2) seg(ctx, x, y, nx, ny, widths[i]! - 2.4, tone(WARM, 0.3));
    if (i > 0) disc(ctx, x, y, widths[i - 1]! * 0.72, tone(WARM, 0.45), WARM, 1.2);
    x = nx;
    y = ny;
  }
  disc(ctx, x, y, 4.6, tone(GOLD, 0.5), GOLD, 1.5);
  disc(ctx, x - 1.3, y - 1.4, 1.1, tone(GOLD, 0.95));
}

export const tv: Part = {
  id: 'tv',
  z: 20,
  intro: [0.6, 2.0],
  draw(pen, f) {
    const { t } = f;
    const ctx = pen.ctx;
    const g = screenGlow(t);

    // the screen's light spreading over the set and the nearest land
    {
      const gx = S.x + S.w / 2, gy = S.y + S.h / 2;
      const gr = ctx.createRadialGradient(gx, gy, 80, gx, gy, 520);
      gr.addColorStop(0, `rgba(198,196,128,${0.15 * g})`);
      gr.addColorStop(0.5, `rgba(198,196,128,${0.05 * g})`);
      gr.addColorStop(1, 'rgba(198,196,128,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(gx - 530, gy - 530, 1060, 1060);
    }

    // the mains cable: out of the back, a slack loop, then along the grass; its end twitches in gusts
    {
      const w = wind(t - 0.2, 60);
      const pts = curve([[128, 470], [108, 498], [112, 548], [96, 582], [78, 602], [84, 618], [66, 620 + w * 1.5], [44, 628 + w * 3]], 7);
      line(ctx, pts, 3.4, tone(WARM, 0.25));
      line(ctx, pts, 1.5, WARM, 0.85);
      const e = pts[pts.length - 1]!;
      shape(ctx, [[e[0] + 2, e[1] - 4], [e[0] - 9, e[1] - 2.5], [e[0] - 10, e[1] + 4.5], [e[0] + 1, e[1] + 4]], tone(WARM, 0.3), WARM, 1.4);
      seg(ctx, e[0] - 10, e[1] - 0.8, e[0] - 15, e[1] - 0.2, 1.3, GOLD);
      seg(ctx, e[0] - 10, e[1] + 2.6, e[0] - 15, e[1] + 3.2, 1.3, GOLD);
    }

    // antenna rods behind the dome
    rod(ctx, t, -0.86, [62, 52, 44], 0);
    rod(ctx, t, 0.7, [58, 50, 40], 0.21);
    cache(ctx, 'tv-set', [56, 100, 660, 530], paintSet);
    disc(ctx, ANT[0], ANT[1] + 1, 6.5, wood(0.4), WARM, 1.5);
    disc(ctx, ANT[0], ANT[1] + 1, 2, WARM);

    // the picture, clipped to the glass
    ctx.save();
    trace(ctx, GLASS, true);
    ctx.clip();
    ctx.save();
    ctx.translate(S.x, S.y);
    drawGame(ctx, t);
    ctx.restore();
    // the game's near ground steps up into a terrace at the right of the picture and carries on out over the lip
    {
      const gy = S.y + nearGroundAt(432 - S.x, t);
      const tt: Pt[] = [[431, gy + 1], [437, 425], [444, 418], [474, 419], [505, 420], [514, 421.5]];
      fillPts(ctx, [...tt, [514, 492], [431, 492]], GREEN);
      fillPts(ctx, [[431, gy + 1], [437, 427], [447, 431], [445, gy + 9]], GREEN_SHADE);
      for (let k = 0; k < 3; k++) taper(ctx, [[436 + k * 3.4, 432 + k * 2], [437 + k * 3.6, 440 + k * 3]], 1, GREEN_LINE, 0.4, 0, 0.8);
      line(ctx, [[441, 422.5], [474, 423.5], [512, 425]], 5, GREEN_LIT, 0.9);
      ctx.fillStyle = GREEN_SHADE;
      ctx.globalAlpha = 0.6;
      ctx.fillRect(431, S.y + 252, 84, 40);
      ctx.globalAlpha = 1;
      line(ctx, [[452, 444], [470, 445.5], [486, 444.6]], 1, GREEN_LINE, 0.26);
      line(ctx, [[462, 458], [484, 459], [500, 458]], 1, GREEN_LINE, 0.26);
      line(ctx, rounded(tt, 3), 3.6, GREEN_LINE);
      for (let i = 0; i < 4; i++) {
        const x = 449 + i * 15 + rnd(i * 3.3) * 5;
        tuft(ctx, x, 419.5, 6 + rnd(i * 2.1) * 5, 3, GREEN_LINE, i * 9 + 70, wind(t, x) * 0.8, 0.9);
      }
    }
    // scanlines, a rolling band, the flicker veil and the dark rim of the tube
    ctx.beginPath();
    for (let y = S.y + 3; y < S.y + S.h; y += 6) {
      ctx.moveTo(S.x, y);
      ctx.lineTo(S.x + S.w, y);
    }
    ctx.strokeStyle = '#000';
    ctx.globalAlpha = 0.12;
    ctx.lineWidth = 1.3;
    ctx.stroke();
    const by = mod(t * 34, S.h + 120) - 60;
    const bg = ctx.createLinearGradient(0, S.y + by - 34, 0, S.y + by + 34);
    bg.addColorStop(0, 'rgba(242,239,230,0)');
    bg.addColorStop(0.5, 'rgba(242,239,230,0.07)');
    bg.addColorStop(1, 'rgba(242,239,230,0)');
    ctx.globalAlpha = 1;
    ctx.fillStyle = bg;
    ctx.fillRect(S.x, S.y + by - 34, S.w, 68);
    if (g < 0.99) fillPts(ctx, GLASS, PAPER, (1 - g) * 0.75);
    ctx.globalAlpha = 0.34;
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 12;
    trace(ctx, GLASS, true);
    ctx.stroke();
    ctx.globalAlpha = 0.16;
    ctx.lineWidth = 30;
    ctx.stroke();
    ctx.globalAlpha = 1;
    // reflections on the bulge: two streaks top-left that slide a little, a faint one on the right
    const sl = 3.5 * Math.sin(t * 0.47) + 1.5 * Math.sin(t * 1.3);
    taper(ctx, curve([[S.x + 13, S.y + 112 + sl], [S.x + 13, S.y + 62 + sl * 0.6], [S.x + 24, S.y + 30], [S.x + 54 - sl * 0.6, S.y + 14], [S.x + 96 - sl, S.y + 11]], 7), 6, INK, 0.22, 0.5, 0.5);
    taper(ctx, curve([[S.x + 23, S.y + 84 + sl], [S.x + 24, S.y + 58], [S.x + 33, S.y + 38], [S.x + 52 - sl, S.y + 26]], 6), 3, INK, 0.13, 0.5, 0.5);
    taper(ctx, curve([[S.x + S.w - 17, S.y + 96], [S.x + S.w - 14, S.y + 136], [S.x + S.w - 18, S.y + 176]], 6), 4.5, INK, 0.08, 0.5, 0.5);
    ctx.restore();
    // the picture's light on the inner bezel ring
    line(ctx, ring(6), 3, GREEN_LINE, 0.1 + 0.16 * g, true);

    // live controls: the channel dial clicks round a notch now and then, the volume drifts, the lamp blinks
    {
      const n = Math.floor(t / 5.3), u = t / 5.3 - n;
      const a = (n + smooth(0.9, 1, u) + (u > 0.9 ? 0.06 * Math.sin((u - 0.9) * 180) * (1 - u) * 10 : 0)) * (TAU / 12) - Math.PI / 2;
      seg(ctx, DIAL[0] + Math.cos(a) * 3, DIAL[1] + Math.sin(a) * 3, DIAL[0] + Math.cos(a) * 16.5, DIAL[1] + Math.sin(a) * 16.5, 2.6, WARM);
      disc(ctx, DIAL[0], DIAL[1], 4.2, wood(0.5), WARM, 1.3);
      const va = Math.PI * (1.5 + 0.35 * Math.sin(t * 0.31) + 0.12 * Math.sin(t * 0.83));
      seg(ctx, VOL[0], VOL[1], VOL[0] + Math.cos(va) * 10.5, VOL[1] + Math.sin(va) * 10.5, 2, WARM);
      disc(ctx, VOL[0], VOL[1], 2.6, WARM);
      const on = 0.35 + 0.65 * smooth(-0.2, 0.2, Math.sin(t * 2.3));
      disc(ctx, LAMP[0], LAMP[1], 9, GOLD, null, 0, 0.16 * on);
      disc(ctx, LAMP[0], LAMP[1], 3.2, GOLD, null, 0, 0.35 + 0.65 * on);
    }

    // plant leaves swaying on top of the set, steam from the mug
    {
      const w = wind(t, PLANT[0]);
      for (let i = 0; i < 7; i++) {
        const u = i / 6 - 0.5, len = 22 + rnd(i * 3.7) * 16, wl = wind(t - 0.15 - rnd(i) * 0.1, PLANT[0]);
        const bx = PLANT[0] + u * 14, tipx = bx + u * 34 + wl * 6 + Math.sin(t * 2.3 + i) * 0.8, tipy = PLANT[1] - len * (1 - Math.abs(u) * 0.5);
        const midp: Pt = [bx + u * 12 + w * 2, PLANT[1] - len * 0.55];
        const pts = curve([[bx, PLANT[1] + 1], midp, [tipx, tipy]], 6);
        taper(ctx, pts, 5.5, tone(GREEN_LINE, 0.34), 1, 0.25, 0.75);
        taper(ctx, pts, 1.5, GREEN_LINE, 0.9, 0, 0.6);
      }
      for (let i = 0; i < 2; i++) {
        const u = mod(t * 0.33 + i * 0.5, 1);
        const sx = MUG[0] - 3 + i * 6, sy = MUG[1] - 4 - u * 30;
        const pts: Pt[] = [];
        for (let k = 0; k <= 8; k++) pts.push([sx + Math.sin(k * 0.9 + t * 1.4 + i * 2) * (2 + u * 4) + wind(t, MUG[0]) * u * 6, sy - k * 2.6]);
        taper(ctx, pts, 1.6, INK, 0.5 * Math.sin(Math.PI * u), 0.4, 0.4);
      }
    }

    // the land leaving the picture. Over the bezel's corner and down in front of the cabinet it is the front
    // layer of the hills (painted again here because it lies over the set); the screen's light rims it.
    ctx.save();
    ctx.beginPath();
    ctx.rect(FRONT_BOX[0], FRONT_BOX[1], 690 - FRONT_BOX[0], 606 - FRONT_BOX[1]);
    ctx.moveTo(GLASS[0]![0], GLASS[0]![1]);
    for (let i = 1; i < GLASS.length; i++) ctx.lineTo(GLASS[i]![0], GLASS[i]![1]);
    ctx.closePath();
    ctx.clip('evenodd');
    cache(ctx, 'left-front', FRONT_BOX, paintFront);
    ctx.restore();
    line(ctx, [[505, 420], [527, 424], [531.5, 427], [539, 452]], 2, GREEN_LINE, 0.25 * g);
    line(ctx, PEAK_FLANK, 2.2, GOLD, 0.1 + 0.2 * g);
    {
      const gr = ctx.createRadialGradient(520, 432, 6, 520, 432, 120);
      gr.addColorStop(0, `rgba(233,226,184,${0.13 * g})`);
      gr.addColorStop(1, 'rgba(233,226,184,0)');
      ctx.fillStyle = gr;
      ctx.fillRect(400, 312, 240, 240);
    }
    // tufts on the lip, bending in the wind, and sparkles drifting up from where the land crosses the glass
    for (let i = 0; i < 4; i++) {
      const x = 509 + i * 6.5 + (i === 3 ? 22 : 0), y = i === 3 ? 455 : 421 + i * 1.2;
      tuft(ctx, x, y, 8 + rnd(i * 2.7) * 6, 3, GREEN_LINE, i * 5 + 40, wind(t, x) * 0.9, 0.9);
    }
    for (let i = 0; i < 8; i++) {
      const u = mod(t * (0.21 + rnd(i * 3.1) * 0.12) + rnd(i * 9.7), 1);
      const x = 452 + rnd(i * 5.3) * 120 + Math.sin(t * 1.1 + i * 2) * 6 + u * 14;
      const y = (x < 530 ? 420 : x < 558 ? 453 : 487) - 6 - u * 62;
      const r = 3.6 * Math.sin(Math.PI * u), a = 0.85 * Math.sin(Math.PI * u);
      seg(ctx, x - r, y, x + r, y, 1.2, GOLD, a);
      seg(ctx, x, y - r * 1.3, x, y + r * 1.3, 1.2, GOLD, a);
    }
  },
};

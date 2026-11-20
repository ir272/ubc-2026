// A small "Welcome" signboard on a post at SIGN.x. The whole sign wavers in the shared wind about the foot of
// its post, and the board lags the post a touch so it reads as a springy wooden thing, not a rigid sticker.
// Intro: the post draws up from the ground, then the board outline, then the word is lettered left to right.
import { INK, PAPER, SIGN, groundY, wind } from '../engine/layout';
import type { Part, Pt } from '../engine/types';

const POST_H = 150;
const BOARD = { w: 210, h: 82, y: -POST_H - 18 }; // board centre, relative to the post foot

export const sign: Part = {
  id: 'sign',
  z: 26,
  intro: [2.2, 2.9],
  draw(pen, f) {
    if (f.reveal <= 0) return;
    const t = f.t;
    const ctx = pen.ctx;
    const fx = SIGN.x;
    const fy = groundY(fx) + 4;
    const sub = (a: number, b: number) => Math.max(0, Math.min(1, (f.reveal - a) / (b - a)));

    // sway about the foot: the shared wind (sampled a little behind, the post is stiff) plus a slow creak
    const w = wind(t - 0.15, fx);
    const sway = 0.06 * w + 0.008 * Math.sin(t * 1.13 + 0.6);
    const lag = 0.03 * (wind(t - 0.45, fx) - w) + 0.006 * Math.sin(t * 2.71); // the board trails the post

    ctx.save();
    ctx.translate(fx, fy);
    ctx.rotate(sway);

    // the post: two upright lines and a cap
    const rp = sub(0, 0.45);
    const L: Pt[] = [[-7, 0], [-6, -POST_H]];
    const R: Pt[] = [[7, 0], [6, -POST_H]];
    pen.fill([[-7, 0], [-6, -POST_H * rp], [6, -POST_H * rp], [7, 0]], PAPER);
    pen.stroke(L, { width: 4.5, seed: 801, reveal: rp });
    pen.stroke(R, { width: 4.5, seed: 802, reveal: rp });

    // the board, hung on the top of the post
    const rb = sub(0.35, 0.8);
    if (rb > 0) {
      ctx.translate(0, BOARD.y);
      ctx.rotate(lag - 0.035);
      const hw = BOARD.w / 2, hh = BOARD.h / 2;
      const outline: Pt[] = [[-hw + 4, -hh], [hw - 2, -hh + 3], [hw + 2, hh - 2], [-hw, hh + 2]];
      pen.fill(outline, PAPER, Math.min(1, rb * 3));
      pen.stroke([...outline, outline[0]!], { width: 5.5, seed: 803, reveal: rb });

      // the word, lettered left to right
      const rt = sub(0.7, 1);
      if (rt > 0) {
        ctx.save();
        ctx.beginPath();
        ctx.rect(-hw, -hh - 20, BOARD.w * rt, BOARD.h + 40);
        ctx.clip();
        pen.text('Welcome', 2, 3, { size: 44, color: INK });
        ctx.restore();
      }
    }
    ctx.restore();
  },
};

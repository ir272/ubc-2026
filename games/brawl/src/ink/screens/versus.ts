// 4. Versus: the two picked fighters large, facing each other, standing on the lower rule of a wide
// strip cut from the chosen stage (or bare paper when it has no thumbnail), the crossing mark between
// them, the fighter's name large in the side tint under each and the bot's name smaller under that.
// Each figure is drawn in from its own side.

import type { InkFrame } from '../api.ts';
import { H, W } from '../api.ts';
import type { Side } from '../../sim/types.ts';
import { C, boundsAt, crossMark, draw, figBounds, fitSize, placeFigure, newInk, out, pageFrame, span, stand, text, textW, tintOf } from './kit.ts';
import { thumb, type Env } from './env.ts';

const BAND0 = 168;
const BAND1 = 492;
const FEET = BAND1;
const XS: [number, number] = [338, W - 338];

export function drawVersus(f: InkFrame, e: Env): void {
  const ctx = f.show.ctx;
  const picks = ctx?.picks;
  if (!ctx || !picks) return;
  const g = f.g;
  const ms = f.show.phaseMs;
  const ink = newInk(g);

  // the strip: the stage drawn at full width, cut to the band and washed back
  const su = out(span(ms, 150, 600));
  if (ctx.stage && su > 0) {
    g.save();
    g.beginPath();
    g.rect(34, BAND0, W - 68, BAND1 - BAND0);
    g.clip();
    const drew = thumb(f, e, ctx.stage, 0, (BAND0 + BAND1) / 2 - H / 2 - 40, W, H, su);
    if (drew) {
      g.globalAlpha = 0.5;
      g.fillStyle = C.paper;
      g.fillRect(0, BAND0, W, BAND1 - BAND0);
    }
    g.restore();
  }
  draw(ink, [[W / 2, BAND0], [20, BAND0 + 1]], out(span(ms, 0, 560)), { w: 1.6, seed: 501, taper: 0.4 });
  draw(ink, [[W / 2, BAND0], [W - 20, BAND0 - 1]], out(span(ms, 0, 560)), { w: 1.6, seed: 502, taper: 0.4 });
  draw(ink, [[W / 2, FEET], [20, FEET]], out(span(ms, 60, 560)), { w: 2.4, seed: 503, taper: 0.3 });
  draw(ink, [[W / 2, FEET], [W - 20, FEET + 1]], out(span(ms, 60, 560)), { w: 2.4, seed: 504, taper: 0.3 });
  draw(ink, [[W / 2, FEET + 8], [44, FEET + 9]], out(span(ms, 160, 560)), { w: 1, seed: 505, taper: 0.6, alpha: 0.45 });
  draw(ink, [[W / 2, FEET + 8], [W - 44, FEET + 7]], out(span(ms, 160, 560)), { w: 1, seed: 506, taper: 0.6, alpha: 0.45 });

  for (const side of [0, 1] as Side[]) {
    const id = picks[side];
    const def = f.fighterDefs[id];
    const left = side === 0;
    // one scale for both (heights compare truly), fitted to the measured drawings: each stays in
    // its own half with clear air either side of the mark, and under the page frame's top
    const bs = [figBounds(f, picks[0]), figBounds(f, picks[1])];
    const s = Math.min(1.85, ...bs.map((b) => Math.min(360 / -b.y0, (FEET - 46) / -b.y0, (W / 2 - 92 - 52) / (b.x1 - b.x0))));
    const facing: 1 | -1 = left ? 1 : -1;
    const bnd = bs[side]!;
    const x = left ? placeFigure(bnd, s, facing, XS[0], 52, W / 2 - 92) : placeFigure(bnd, s, facing, XS[1], W / 2 + 92, W - 52);
    const ab = boundsAt(bnd, s, facing);
    // the pen reveal: a slanted edge sweeps in from the figure's own side
    const t0 = 300 + side * 180;
    const r = span(ms, t0, 1000);
    const ru = out(r);
    if (ru > 0) {
      const hh = -ab.y0 + 40;
      const half = Math.max(230, (ab.x1 - ab.x0) / 2 + 40);
      const bx = x + (ab.x0 + ab.x1) / 2;
      const dx = (1 - ru) * 46 * (left ? -1 : 1);
      g.save();
      if (r < 1) {
        const edge = left ? bx - half + ru * half * 2 : bx + half - ru * half * 2;
        const slant = 60 * (left ? 1 : -1);
        g.beginPath();
        if (left) {
          g.moveTo(0, FEET + 40);
          g.lineTo(edge, FEET + 40);
          g.lineTo(edge + slant, FEET - hh);
          g.lineTo(0, FEET - hh);
        } else {
          g.moveTo(W, FEET + 40);
          g.lineTo(edge, FEET + 40);
          g.lineTo(edge + slant, FEET - hh);
          g.lineTo(W, FEET - hh);
        }
        g.closePath();
        g.clip();
      }
      stand(f, g, id, side, x + dx, FEET, s, facing, Math.max(0, ms - t0) / 1000);
      g.restore();
    }
    // names
    const tint = tintOf(f, side);
    const fname = def?.name ?? id;
    const fsize = fitSize(g, fname, 52, 650, 470);
    text(g, fname, x, FEET + 74, { size: fsize, weight: 650, color: tint, align: 'center' }, span(ms, 1050 + side * 150, 500));
    const bot = ctx.bots[side];
    if (bot) {
      const bw = textW(g, bot.name, 26, 600);
      const mw = bot.modelLabel ? textW(g, bot.modelLabel, 18, 400) + 12 : 0;
      const bx = x - (bw + mw) / 2;
      text(g, bot.name, bx, FEET + 116, { size: 26, weight: 600, color: C.ink }, span(ms, 1350 + side * 150, 450));
      if (bot.modelLabel) text(g, bot.modelLabel, bx + bw + 12, FEET + 116, { size: 18, weight: 400, color: C.dim }, span(ms, 1500 + side * 150, 450));
    }
  }
  crossMark(ink, W / 2, (BAND0 + BAND1) / 2 + 6, 96, span(ms, 650, 900), 520, [tintOf(f, 0), tintOf(f, 1)]);
  pageFrame(ink, g, 1);

  // hand over to the arena: the page fades to paper in the last moments
  const dur = f.show.phaseDurationMs;
  if (dur > 0) {
    const fade = out(span(ms, dur - 450, 420));
    if (fade > 0) {
      g.save();
      g.globalAlpha = fade;
      g.fillStyle = C.paper;
      g.fillRect(0, 0, W, H);
      g.restore();
    }
  }
}

// 7. Verdict: the fighters' own win and lose poses play for 2 s, then the picture is washed back and
// the card comes in: the winner's figure large on the winner's side, standing on a long rule, and on
// the other side a ruled plate with the title, the bot's name large in its tint, the model label and
// the fighter's name. No cover; the stage stays visible behind (post.dim is raised in prepare).

import type { InkFrame } from '../api.ts';
import { H, W } from '../api.ts';
import type { FighterId } from '../../sim/types.ts';
import { C, draw, figH, fitSize, flourish, newInk, out, ruledBox, span, stand, text, textW, tintOf } from './kit.ts';

export const VERDICT_HOLD = 2000;

export function verdictDim(f: InkFrame): number {
  return 0.6 * out(span(f.show.phaseMs, VERDICT_HOLD - 200, 600));
}

export function drawVerdict(f: InkFrame): void {
  const r = f.show.result;
  const ctx = f.show.ctx;
  if (!r || !ctx) return;
  const ms = f.show.phaseMs - VERDICT_HOLD;
  if (ms <= 0) return;
  const g = f.g;
  const ink = newInk(g);
  const side = r.winner;
  const left = side === 0;
  const tint = tintOf(f, side);

  // wash the fighters and the HUD well back, so nothing under the card fights it
  g.save();
  g.globalAlpha = 0.95 * out(ms / 520);
  g.fillStyle = C.paper;
  g.fillRect(0, 0, W, H);
  g.restore();

  // the winner, large, drawn in from its side
  const fid: FighterId = ctx.picks?.[side] ?? (r.winnerId as FighterId);
  const def = f.fighterDefs[fid];
  const fx = left ? 330 : W - 330;
  const feet = 588;
  const s = Math.min(2.05, 390 / ((def?.height ?? 2) * 100));
  const rv = span(ms, 120, 1000);
  draw(ink, left ? [[fx + 210, feet + 1], [fx - 220, feet]] : [[fx - 210, feet + 1], [fx + 220, feet]], out(span(ms, 0, 560)), { w: 2.4, seed: 1300, taper: 0.4 });
  draw(ink, left ? [[fx + 180, feet + 9], [fx - 190, feet + 9]] : [[fx - 180, feet + 9], [fx + 190, feet + 9]], out(span(ms, 100, 560)), { w: 1, seed: 1301, taper: 0.6, alpha: 0.45 });
  if (rv > 0) {
    const ru = out(rv);
    const hh = figH(f, fid, s) + 90;
    g.save();
    if (rv < 1) {
      const half = 240;
      const edge = left ? fx - half + ru * half * 2 : fx + half - ru * half * 2;
      const sl = left ? 60 : -60;
      g.beginPath();
      g.moveTo(left ? 0 : W, feet + 30);
      g.lineTo(edge, feet + 30);
      g.lineTo(edge + sl, feet - hh);
      g.lineTo(left ? 0 : W, feet - hh);
      g.closePath();
      g.clip();
    }
    stand(f, g, fid, side, fx + (1 - ru) * 40 * (left ? -1 : 1), feet, s, left ? 1 : -1, f.now / 1000);
    g.restore();
  }

  // the plate
  const cx = left ? 836 : W - 836;
  const x0 = cx - 300, x1 = cx + 300, y0 = 176, y1 = 520;
  ruledBox(ink, g, x0, y0, x1, y1, span(ms, 200, 650), { seed: 1320, w: 1.8, over: 11, mask: 1 });
  text(g, 'Winner', cx, y0 + 66, { size: 28, weight: 500, color: C.soft, align: 'center' }, span(ms, 420, 450));
  flourish(ink, cx, 80, y0 + 86, span(ms, 520, 500), 1330);
  const bot = ctx.bots[side];
  if (bot) {
    const size = fitSize(g, bot.name, 92, 700, 520);
    text(g, bot.name, cx, y0 + 196, { size, weight: 700, color: tint, align: 'center' }, span(ms, 560, 560));
    const bw = textW(g, bot.name, size, 700);
    draw(ink, [[cx - bw / 2 - 10, y0 + 216], [cx + bw / 2 + 14, y0 + 215]], out(span(ms, 760, 520)), { w: 2.2, seed: 1340, taper: 0.7, tint });
    if (bot.modelLabel) text(g, bot.modelLabel, cx, y0 + 250, { size: 21, weight: 400, color: C.dim, align: 'center' }, span(ms, 900, 450));
  }
  const fname = def?.name ?? String(fid);
  text(g, fname, cx, y0 + 304, { size: fitSize(g, fname, 34, 600, 520), weight: 600, color: C.ink, align: 'center' }, span(ms, 1000, 500));
}

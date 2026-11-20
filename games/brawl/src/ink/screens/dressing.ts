// 5. Predictions and 6. break: over the arena, only a small ruled plate under the HUD clock with a
// one-word title and the open window's clock in the pen's own numerals. No cover.

import type { InkFrame } from '../api.ts';
import { W } from '../api.ts';
import { C, clockText, draw, drawNum, newInk, numWidth, out, ruledBox, span, text, textW } from './kit.ts';

const Y0 = 88;
const Y1 = 138;

/** the plate; `ms` = time since it should start drawing in */
function plate(f: InkFrame, title: string, ms: number, msLeft: number | null): void {
  const g = f.g;
  const ink = newInk(g);
  const tw = textW(g, title, 23, 600);
  const clock = msLeft === null ? '' : clockText(msLeft);
  const nh = 26;
  // the clock's width is fixed by its widest form so the plate does not breathe as digits change
  const cw = clock ? numWidth(clock.replace(/\d/g, '0'), nh) : 0;
  const pad = 22, mid = clock ? 34 : 0;
  const wTot = pad + tw + mid + cw + pad;
  const x0 = W / 2 - wTot / 2, x1 = W / 2 + wTot / 2;
  ruledBox(ink, g, x0, Y0, x1, Y1, span(ms, 0, 600), { seed: 1200, w: 1.7, mask: 0.82 });
  text(g, title, x0 + pad, Y0 + 33, { size: 23, weight: 600 }, span(ms, 220, 450));
  if (clock) {
    const dx = x0 + pad + tw + mid / 2;
    draw(ink, [[dx, Y0 + 8], [dx + 1, Y1 - 8]], out(span(ms, 300, 400)), { w: 1, seed: 1210, taper: 0.6, tint: C.gold });
    if (ms > 380) drawNum(ink, clock, x1 - pad, Y0 + 38, nh, { align: 'right', seed: 1220, w: 2.3 });
  }
}

export function drawPredictions(f: InkFrame): void {
  const w = f.show.window;
  const open = w && w.state === 'open';
  plate(f, 'Predictions', f.show.phaseMs, open ? w.msLeft : null);
}

export function drawBreak(f: InkFrame): void {
  const w = f.show.window;
  if (!w || w.state !== 'open') return;
  const since = Math.max(0, w.durationMs - w.msLeft);
  plate(f, 'Break', since, w.msLeft);
}

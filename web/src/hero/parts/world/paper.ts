// The paper under everything: near-black with a soft vignette, a few feathered fibres (as in Ian's
// picture), irregular grain, and the still part of the night sky (dust stars, constellation lines, the moon)
// so the whole backdrop is ONE cached sheet. On top, a second very faint grain layer re-seeds about 8 times
// a second, the way hand-made animation paper does; it is barely there.
import { H, INK, PAPER, W } from '../../engine/layout';
import type { Part, Pen } from '../../engine/types';
import { paintSkyStill } from '../sky';
import { rng } from './util';

/** the bare sheet: paper colour, vignette, fibres, grain. No sky. */
export function paintSheet(p: Pen) {
  const c = p.ctx;
  c.fillStyle = PAPER;
  c.fillRect(0, 0, W, H);
  // a breath of light behind the middle of the scene, darker toward the corners
  const g = c.createRadialGradient(W * 0.5, H * 0.42, 200, W * 0.5, H * 0.42, 1750);
  g.addColorStop(0, 'rgba(242,239,230,0.022)');
  g.addColorStop(0.45, 'rgba(242,239,230,0.006)');
  g.addColorStop(0.7, 'rgba(0,0,0,0.10)');
  g.addColorStop(1, 'rgba(0,0,0,0.42)');
  c.fillStyle = g;
  c.fillRect(0, 0, W, H);

  const r = rng(90210);
  // tooth: large, very soft mottles so the sheet is not one flat value
  for (let i = 0; i < 46; i++) {
    const x = r() * W, y = r() * H, rad = 90 + r() * 260, light = r() < 0.5;
    const m = c.createRadialGradient(x, y, 0, x, y, rad);
    m.addColorStop(0, light ? 'rgba(242,239,230,0.012)' : 'rgba(0,0,0,0.07)');
    m.addColorStop(1, light ? 'rgba(242,239,230,0)' : 'rgba(0,0,0,0)');
    c.fillStyle = m;
    c.fillRect(x - rad, y - rad, rad * 2, rad * 2);
  }
  // fibres: short curved hairs lying every which way, feathered at both ends, never a ruled vertical
  c.lineCap = 'round';
  for (let i = 0; i < 520; i++) {
    const x = r() * W, y = r() * H;
    const a = r() * Math.PI, len = 10 + r() * r() * 70, bow = (r() - 0.5) * len * 0.5;
    const dx = Math.cos(a) * len, dy = Math.sin(a) * len;
    const light = r() < 0.6;
    const al = light ? 0.012 + r() * 0.018 : 0.05 + r() * 0.07;
    const gr = c.createLinearGradient(x, y, x + dx, y + dy);
    const col = light ? '242,239,230' : '0,0,0';
    gr.addColorStop(0, `rgba(${col},0)`);
    gr.addColorStop(0.3 + r() * 0.4, `rgba(${col},${al})`);
    gr.addColorStop(1, `rgba(${col},0)`);
    c.strokeStyle = gr;
    c.lineWidth = 0.8 + r() * 0.9;
    c.beginPath();
    c.moveTo(x, y);
    c.quadraticCurveTo(x + dx * 0.5 - (dy / len) * bow, y + dy * 0.5 + (dx / len) * bow, x + dx, y + dy);
    c.stroke();
  }
  // grain: specks a little lighter and a little darker than the paper, scattered without any lattice,
  // a third of them in loose drifts so the density itself is uneven
  for (let i = 0; i < 7600; i++) {
    let x = r() * W, y = r() * H;
    if (i % 3 === 0) {
      const k = Math.floor(i / 60);
      const cx = ((k * 0.61803) % 1) * W, cy = ((k * 0.41421) % 1) * H;
      x = cx + (r() + r() + r() - 1.5) * 190;
      y = cy + (r() + r() + r() - 1.5) * 120;
    }
    const light = r() < 0.6;
    c.globalAlpha = light ? 0.016 + r() * 0.034 : 0.1 + r() * 0.13;
    c.fillStyle = light ? INK : '#000';
    const s = 0.7 + r() * r() * 1.9;
    c.fillRect(x, y, s, s * (0.7 + r() * 0.6));
  }
  c.globalAlpha = 1;
}

/** the whole still backdrop: the sheet and the still sky */
export function paintPaper(p: Pen) {
  paintSheet(p);
  paintSkyStill(p);
}

// the living grain: three sets of specks, one shown at a time
const GRAIN: { x: number; y: number; s: number }[][] = [0, 1, 2].map((k) => {
  const r = rng(700 + k * 31);
  return Array.from({ length: 300 }, () => ({ x: r() * W, y: r() * H, s: 0.9 + r() * 1.2 }));
});

export const paper: Part = {
  id: 'paper',
  z: -10,
  intro: [0, 0.01],
  // the sheet and the still sky never change: the scene paints them once, under the live canvas
  still: paintPaper,
  draw(pen, f) {
    const ctx = pen.ctx;
    // the living grain: re-seeded about 8 times a second, barely there
    const set = GRAIN[Math.floor(f.t * 8) % 3]!;
    ctx.fillStyle = INK;
    ctx.globalAlpha = 0.035;
    // separate small rects on purpose: one path spanning the whole canvas is far slower to rasterise
    for (const g of set) ctx.fillRect(g.x, g.y, g.s, g.s);
  },
};

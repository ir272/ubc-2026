// The ink pen every part draws with. A stroke is filled as a ribbon of varying width, so it reads as a
// brush-pen line: a touch heavier where the pen lands and lifts and in tight corners, with a small hand
// wobble that depends ONLY on `seed` (and on the distance along the line), so it is identical every frame.
// `reveal` draws only the first part of the stroke's length and ends in a round leading tip.
import { INK } from './layout';
import type { Pen, Pt, StrokeOpts } from './types';

const STEP = 7; // resample spacing in scene units: fine enough for the wobble and the pressure, still cheap

// a tiny deterministic hash -> 0..1
function h01(n: number): number {
  const s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
  return s - Math.floor(s);
}

// scratch buffers reused between strokes (the pen is single threaded)
let XS = new Float64Array(1024);
let YS = new Float64Array(1024);
let SS = new Float64Array(1024); // arc length at each point
let CN = new Float64Array(1024); // corner weight at each point (0..1)
function ensure(n: number) {
  if (XS.length >= n) return;
  let m = XS.length;
  while (m < n) m *= 2;
  XS = new Float64Array(m);
  YS = new Float64Array(m);
  SS = new Float64Array(m);
  CN = new Float64Array(m);
}

export function makePen(ctx: CanvasRenderingContext2D): Pen {
  const stroke = (pts: readonly Pt[], o: StrokeOpts = {}) => {
    const reveal = Math.min(1, o.reveal ?? 1);
    let n0 = pts.length;
    if (n0 < 2 || reveal <= 0) return;
    const close = !!o.close && reveal >= 1 && n0 > 2;
    const src = close ? [...pts, pts[0]!] : pts;
    n0 = src.length;
    const width = o.width ?? 5;
    const seed = o.seed ?? 1;

    // 1. resample: keep every given vertex (corners stay sharp), subdivide long segments
    let cap = 1;
    for (let i = 1; i < n0; i++) {
      const d = Math.hypot(src[i]![0] - src[i - 1]![0], src[i]![1] - src[i - 1]![1]);
      cap += Math.max(1, Math.ceil(d / STEP));
    }
    ensure(cap + 2);
    let n = 0;
    XS[0] = src[0]![0];
    YS[0] = src[0]![1];
    SS[0] = 0;
    CN[0] = 0;
    n = 1;
    for (let i = 1; i < n0; i++) {
      const ax = src[i - 1]![0], ay = src[i - 1]![1], bx = src[i]![0], by = src[i]![1];
      const d = Math.hypot(bx - ax, by - ay);
      if (d < 1e-6) continue;
      const k = Math.max(1, Math.ceil(d / STEP));
      for (let j = 1; j <= k; j++) {
        const u = j / k;
        XS[n] = ax + (bx - ax) * u;
        YS[n] = ay + (by - ay) * u;
        SS[n] = SS[n - 1]! + d / k;
        CN[n] = 0;
        n++;
      }
    }
    if (n < 2) return;
    const total = SS[n - 1]!;

    // 2. corner weight: how sharply the line turns at each point
    for (let i = 1; i < n - 1; i++) {
      const ux = XS[i]! - XS[i - 1]!, uy = YS[i]! - YS[i - 1]!;
      const vx = XS[i + 1]! - XS[i]!, vy = YS[i + 1]! - YS[i]!;
      const a = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
      CN[i] = Math.min(1, Math.max(0, (a - 0.35) / 1.1));
    }
    if (close) {
      const ux = XS[n - 1]! - XS[n - 2]!, uy = YS[n - 1]! - YS[n - 2]!;
      const vx = XS[1]! - XS[0]!, vy = YS[1]! - YS[0]!;
      const a = Math.abs(Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy));
      CN[0] = CN[n - 1] = Math.min(1, Math.max(0, (a - 0.35) / 1.1));
    }

    // 3. hand wobble along the normal, a function of seed and distance only (never of time)
    const p1 = h01(seed) * 6.283, p2 = h01(seed + 7.3) * 6.283, p3 = h01(seed + 13.1) * 6.283;
    const f1 = 1 / (70 + h01(seed + 2.2) * 60), f2 = 1 / (26 + h01(seed + 4.4) * 18);
    const amp = Math.min(width * 0.32, 1.9) * Math.min(1, total / 90);
    if (amp > 0.05) {
      for (let i = 0; i < n; i++) {
        const ia = Math.max(0, i - 1), ib = Math.min(n - 1, i + 1);
        let tx = XS[ib]! - XS[ia]!, ty = YS[ib]! - YS[ia]!;
        const tl = Math.hypot(tx, ty) || 1;
        tx /= tl;
        ty /= tl;
        const s = SS[i]!;
        // fade the wobble to zero at the two ends of a closed line so the seam meets
        const seam = close ? Math.min(1, s / 40, (total - s) / 40) : 1;
        const w = amp * seam * (0.65 * Math.sin(s * f1 * 6.283 + p1) + 0.35 * Math.sin(s * f2 * 6.283 + p2));
        XS[i] = XS[i]! - ty * w;
        YS[i] = YS[i]! + tx * w;
      }
    }

    // 4. pressure: heavier where the pen lands and lifts and in corners, a slow seeded swell between
    const endLen = Math.min(22, total * 0.18);
    const half = (i: number) => {
      const s = SS[i]!;
      const ends = close ? 0 : Math.exp(-s / endLen) + Math.exp(-(total - s) / endLen);
      const swell = 0.07 * Math.sin(s * f1 * 3.1 + p3);
      return width * 0.5 * (0.86 + 0.26 * Math.min(1, ends) + 0.22 * CN[i]! + swell);
    };

    // 5. cut at the reveal length
    const lim = total * reveal;
    let m = n;
    let tipX = XS[n - 1]!, tipY = YS[n - 1]!;
    if (reveal < 1) {
      m = 1;
      while (m < n && SS[m]! <= lim) m++;
      if (m < n) {
        const a = m - 1;
        const seg = SS[m]! - SS[a]!;
        const k = seg > 0 ? (lim - SS[a]!) / seg : 0;
        tipX = XS[a]! + (XS[m]! - XS[a]!) * k;
        tipY = YS[a]! + (YS[m]! - YS[a]!) * k;
        XS[m] = tipX;
        YS[m] = tipY;
        SS[m] = lim;
        CN[m] = 0;
        m++;
      }
    }
    if (m < 2) return;

    // 6. one path: the ribbon outline plus round dots at both ends and in sharp corners, filled once
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.fillStyle = o.color ?? INK;
    ctx.beginPath();
    const LX = new Float64Array(m), LY = new Float64Array(m), RX = new Float64Array(m), RY = new Float64Array(m);
    for (let i = 0; i < m; i++) {
      let ia = Math.max(0, i - 1), ib = Math.min(m - 1, i + 1);
      if (close && reveal >= 1 && (i === 0 || i === m - 1)) {
        ia = m - 2;
        ib = 1;
      }
      const tx = XS[ib]! - XS[ia]!, ty = YS[ib]! - YS[ia]!;
      const tl = Math.hypot(tx, ty) || 1;
      const r = i === m - 1 && reveal < 1 ? half(Math.min(n - 1, i)) * 0.95 : half(Math.min(n - 1, i));
      const nx = (-ty / tl) * r, ny = (tx / tl) * r;
      LX[i] = XS[i]! + nx;
      LY[i] = YS[i]! + ny;
      RX[i] = XS[i]! - nx;
      RY[i] = YS[i]! - ny;
    }
    ctx.moveTo(LX[0]!, LY[0]!);
    for (let i = 1; i < m; i++) ctx.lineTo(LX[i]!, LY[i]!);
    for (let i = m - 1; i >= 0; i--) ctx.lineTo(RX[i]!, RY[i]!);
    ctx.closePath();
    // the dots must wind the same way as the ribbon, or the nonzero fill punches holes where they overlap
    let area = 0;
    for (let i = 0; i < m - 1; i++) area += LX[i]! * LY[i + 1]! - LX[i + 1]! * LY[i]! - (RX[i]! * RY[i + 1]! - RX[i + 1]! * RY[i]!);
    area += LX[m - 1]! * RY[m - 1]! - RX[m - 1]! * LY[m - 1]! + RX[0]! * LY[0]! - LX[0]! * RY[0]!;
    const ccw = area < 0;
    const dot = (x: number, y: number, r: number) => {
      ctx.moveTo(x + r, y);
      ctx.arc(x, y, r, 0, 6.2832, ccw);
    };
    if (!(close && reveal >= 1)) {
      dot(XS[0]!, YS[0]!, half(0));
      dot(tipX, tipY, half(Math.min(n - 1, m - 1)) * (reveal < 1 ? 0.95 : 1));
    }
    for (let i = 1; i < m - 1; i++) if (CN[i]! > 0.05) dot(XS[i]!, YS[i]!, half(i));
    if (close && reveal >= 1 && CN[0]! > 0.05) dot(XS[0]!, YS[0]!, half(0));
    ctx.fill('nonzero');
    ctx.restore();
  };

  const fill = (pts: readonly Pt[], color: string, alpha = 1) => {
    if (pts.length < 3 || alpha <= 0) return;
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(pts[0]![0], pts[0]![1]);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i]![0], pts[i]![1]);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  };

  const curve = (pts: readonly Pt[], steps = 8, closed = false): Pt[] => {
    const n = pts.length;
    if (n < 3) return pts.slice();
    const at = (i: number): Pt => (closed ? pts[((i % n) + n) % n]! : pts[Math.max(0, Math.min(n - 1, i))]!);
    const out: Pt[] = [];
    const last = closed ? n : n - 1;
    for (let i = 0; i < last; i++) {
      const p0 = at(i - 1), p1 = at(i), p2 = at(i + 1), p3 = at(i + 2);
      for (let s = 0; s < steps; s++) {
        const u = s / steps, u2 = u * u, u3 = u2 * u;
        out.push([
          0.5 * (2 * p1[0] + (-p0[0] + p2[0]) * u + (2 * p0[0] - 5 * p1[0] + 4 * p2[0] - p3[0]) * u2 + (-p0[0] + 3 * p1[0] - 3 * p2[0] + p3[0]) * u3),
          0.5 * (2 * p1[1] + (-p0[1] + p2[1]) * u + (2 * p0[1] - 5 * p1[1] + 4 * p2[1] - p3[1]) * u2 + (-p0[1] + 3 * p1[1] - 3 * p2[1] + p3[1]) * u3),
        ]);
      }
    }
    out.push(closed ? out[0]! : pts[n - 1]!);
    return out;
  };

  let family = '';
  const text: Pen['text'] = (s, x, y, o = {}) => {
    if (!family) family = getComputedStyle(ctx.canvas).fontFamily || 'sans-serif';
    ctx.save();
    ctx.globalAlpha = o.alpha ?? 1;
    ctx.translate(x, y);
    if (o.rotate) ctx.rotate(o.rotate);
    ctx.fillStyle = o.color ?? INK;
    ctx.font = `${o.size ?? 40}px ${family}`;
    ctx.textAlign = o.align ?? 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(s, 0, 0);
    ctx.restore();
  };

  return { ctx, stroke, fill, curve, text };
}

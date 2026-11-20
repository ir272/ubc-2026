// The ink pen every part draws with. A stroke is filled as a ribbon of varying width, so it reads as a
// confident pen line: a hair heavier where the pen lands and in tight corners, with a drift so small it is
// felt rather than seen (at most 0.8 scene units; it depends ONLY on `seed` and the distance along the line,
// so it is identical every frame). `taper` thins the ends to a point where a hand would lift.
// Also: hatch and stipple textures, the glow recipe, and an offscreen cache for static detail.
import { INK } from './layout';
import type { Box, HatchOpts, Pen, Pt, StippleOpts, StrokeOpts } from './types';

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
    const f1 = 1 / (130 + h01(seed + 2.2) * 110), f2 = 1 / (52 + h01(seed + 4.4) * 30);
    // hairlines do not drift at all; nothing drifts more than 0.8 units unless the caller asks for it
    const amp = (width < 1.5 && o.wobble == null ? 0 : Math.min(width * 0.2, 0.8)) * (o.wobble ?? 1) * Math.min(1, total / 120);
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
    const endLen = Math.min(16, total * 0.15);
    const tp = o.taper;
    const t0 = close || tp == null ? 0 : (typeof tp === 'number' ? tp : tp[0]) * total;
    const t1 = close || tp == null ? 0 : (typeof tp === 'number' ? tp : tp[1]) * total;
    const half = (i: number) => {
      const s = SS[i]!;
      const ends = close || tp != null ? 0 : Math.exp(-s / endLen) + Math.exp(-(total - s) / endLen);
      const swell = 0.045 * Math.sin(s * f1 * 3.1 + p3);
      let k = 0.93 + 0.1 * Math.min(1, ends) + 0.1 * CN[i]! + swell;
      if (t0 > 0 && s < t0) k *= 0.04 + 0.96 * (s / t0) ** 0.75;
      if (t1 > 0 && total - s < t1) k *= 0.04 + 0.96 * ((total - s) / t1) ** 0.75;
      return width * 0.5 * k;
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

  // the halo is four soft passes, so it reads as light falling off, never as bands beside the line
  const glow = (pts: readonly Pt[], o: StrokeOpts = {}) => {
    const w = o.width ?? 4.8, a = o.alpha ?? 1;
    stroke(pts, { ...o, width: w * 3.5, alpha: a * 0.045, taper: undefined });
    stroke(pts, { ...o, width: w * 2.6, alpha: a * 0.06, taper: undefined });
    stroke(pts, { ...o, width: w * 1.8, alpha: a * 0.09, taper: undefined });
    stroke(pts, o);
  };

  const clipTo = (clip: readonly Pt[]) => {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    ctx.beginPath();
    for (let i = 0; i < clip.length; i++) {
      const [x, y] = clip[i]!;
      if (i) ctx.lineTo(x, y);
      else ctx.moveTo(x, y);
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
    ctx.closePath();
    ctx.clip();
    return { x0, y0, x1, y1 };
  };

  const hatch = (clip: readonly Pt[], o: HatchOpts = {}) => {
    if (clip.length < 3) return;
    const angle = o.angle ?? -0.9, gap = o.gap ?? 9, seed = o.seed ?? 1, breakup = o.breakup ?? 0.35;
    ctx.save();
    const b = clipTo(clip);
    const cx = (b.x0 + b.x1) / 2, cy = (b.y0 + b.y1) / 2;
    const R = Math.hypot(b.x1 - b.x0, b.y1 - b.y0) / 2 + 2;
    const dx = Math.cos(angle), dy = Math.sin(angle);
    ctx.globalAlpha = o.alpha ?? 0.45;
    ctx.strokeStyle = o.color ?? INK;
    ctx.lineWidth = o.width ?? 1.2;
    ctx.lineCap = 'round';
    ctx.beginPath();
    let k = 0;
    for (let v = -R; v <= R; v += gap * (0.72 + 0.56 * h01(seed + k * 1.7)), k++) {
      const ox = cx - dy * v, oy = cy + dx * v;
      let u = -R + h01(seed + k * 3.3) * 24, j = 0;
      while (u < R) {
        const len = 16 + h01(seed + k * 5.1 + j * 2.3) * 44;
        if (h01(seed + k * 7.7 + j * 4.9) >= breakup) {
          ctx.moveTo(ox + dx * u, oy + dy * u);
          ctx.lineTo(ox + dx * (u + len), oy + dy * (u + len));
        }
        u += len + 5 + h01(seed + k * 9.1 + j * 6.1) * 12;
        j++;
      }
    }
    ctx.stroke();
    ctx.restore();
  };

  const stipple = (clip: readonly Pt[], o: StippleOpts = {}) => {
    if (clip.length < 3) return;
    const count = o.count ?? 40, r = o.r ?? 1.2, seed = o.seed ?? 1;
    ctx.save();
    const b = clipTo(clip);
    ctx.globalAlpha = o.alpha ?? 0.45;
    ctx.fillStyle = o.color ?? INK;
    ctx.beginPath();
    for (let i = 0; i < count; i++) {
      const x = b.x0 + h01(seed + i * 2.71) * (b.x1 - b.x0), y = b.y0 + h01(seed + i * 4.13 + 9) * (b.y1 - b.y0);
      const rr = r * (0.6 + 0.8 * h01(seed + i * 6.37));
      ctx.moveTo(x + rr, y);
      ctx.arc(x, y, rr, 0, 6.2832);
    }
    ctx.fill();
    ctx.restore();
  };

  // offscreen layers, repainted only when the device scale changes
  const layers = new Map<string, { cv: HTMLCanvasElement; s: number }>();
  const layer = (key: string, box: Box, paint: (pen: Pen) => void) => {
    const m = ctx.getTransform();
    let s = Math.hypot(m.a, m.b);
    if (!(s > 0)) return null;
    s = Math.min(s, 4096 / box.w, 4096 / box.h);
    let L = layers.get(key);
    if (!L || Math.abs(L.s - s) > 1e-4) {
      const cv = L?.cv ?? document.createElement('canvas');
      cv.width = Math.max(1, Math.ceil(box.w * s));
      cv.height = Math.max(1, Math.ceil(box.h * s));
      const c2 = cv.getContext('2d');
      if (!c2) return null;
      c2.setTransform(s, 0, 0, s, -box.x * s, -box.y * s);
      c2.clearRect(box.x, box.y, box.w + 1, box.h + 1);
      paint(makePen(c2));
      L = { cv, s };
      layers.set(key, L);
    }
    return L;
  };
  const cache = (key: string, box: Box, paint: (pen: Pen) => void) => {
    const L = layer(key, box, paint);
    if (L) ctx.drawImage(L.cv, box.x, box.y, L.cv.width / L.s, L.cv.height / L.s);
  };

  return { ctx, stroke, fill, curve, text, hatch, stipple, glow, cache, layer };
}

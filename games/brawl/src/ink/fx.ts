// Ink hit effects from fight.events. Everything is a few pen strokes that live for a few frames:
//   hit        tapered strokes fanning along the launch direction at the hit point, by strength
//   launch     drawn lines trailing a tumbling fighter
//   land/dash  two or three short strokes at the feet
//   knockout   long strokes flying inward from the blast edge, a flash, a shake
//   blink      (Mist Step) drifting strokes of mist where he vanished and where he re-forms
//   tell       the first frames of a special: a flourish around the caster in its own colour, so
//              the eye goes there before the effect (the Count's cloak flaring, the Wolf's crouch)
//   pointer    a fighter past the widest view (about to be knocked out): a small drawn arrowhead at
//              the picture's edge in the side tint, pointing at him
// Heavy and lethal hits raise post.dim and push the camera in; every hit flashes the fighter hit.

import type { CameraRig2D, InkFrame, InkModule } from './api.ts';
import type { Side, SimEvent } from '../sim/types.ts';
import { W, H } from './api.ts';
import { makeInk, type Pt } from './pen.ts';
import { fighterBox } from './camera.ts';

interface Mark {
  kind: 'burst' | 'dust' | 'ko' | 'mist' | 'tell';
  /** tell: whose, and which */
  side?: Side;
  move?: string;
  who?: string;
  /** world point and unit direction (y up) */
  x: number;
  y: number;
  dx: number;
  dy: number;
  /** seconds lived, seconds to live */
  age: number;
  life: number;
  k: number;
  seed: number;
  tint: string;
  /** dust: strokes to both sides (a landing) instead of trailing along dx */
  both?: boolean;
}

const STRENGTH = { light: 0.35, medium: 0.6, heavy: 0.85, lethal: 1 } as const;

export function createFx(cam: CameraRig2D): InkModule {
  const marks: Mark[] = [];
  let seed = 1;
  /** time left on the hit flash per side, and the dim and flash envelopes */
  const hot: [number, number] = [0, 0];
  let dimT = 0;
  let dimAmt = 0;
  let flashT = 0;
  /** trail points per side, world (newest last) */
  const trail: [Pt[], Pt[]] = [[], []];

  function add(m: Omit<Mark, 'age' | 'seed'>): void {
    marks.push({ ...m, age: 0, seed: (seed = (seed * 7 + 13) % 997) });
    if (marks.length > 60) marks.splice(0, marks.length - 60);
  }

  function onEvent(f: InkFrame, e: SimEvent): void {
    // the blink event is new in sim2 (not in the SimEvent union this stage compiles against yet)
    const b = e as unknown as { t: string; fromX: number; fromY: number; toX: number; toY: number };
    if (b.t === 'blink') {
      add({ kind: 'mist', x: b.fromX, y: b.fromY + 1.0, dx: 0, dy: 1, life: 0.6, k: 1.2, tint: 'red' });
      add({ kind: 'mist', x: b.toX, y: b.toY + 1.0, dx: 0, dy: 1, life: 0.55, k: 1, tint: 'red' });
      return;
    }
    switch (e.t) {
      case 'move': {
        if (e.move !== 'special' && e.move !== 'special2') break;
        const s = f.fight?.state.fighters[e.side];
        if (!s) break;
        add({ kind: 'tell', x: s.x, y: s.y, dx: s.facing, dy: 0, life: 0.42, k: 1, tint: s.fighter === 'gantry' ? 'red' : f.sideTints[e.side], side: e.side, move: e.move, who: s.fighter });
        break;
      }
      case 'hit': {
        const k = STRENGTH[e.strength] ?? 0.5;
        const l = Math.hypot(e.dx, e.dy) || 1;
        add({ kind: 'burst', x: e.x, y: e.y, dx: e.dx / l, dy: e.dy / l, life: 0.16 + 0.18 * k, k, tint: e.strength === 'lethal' ? 'red' : 'ink' });
        hot[e.to] = Math.max(hot[e.to], Math.max(0.08, e.hitlag / 60));
        if (e.strength === 'heavy' || e.strength === 'lethal') {
          const lethal = e.strength === 'lethal';
          dimAmt = Math.max(dimAmt, lethal ? 0.55 : 0.28);
          dimT = Math.max(dimT, lethal ? 0.7 : 0.22);
          cam.punch(e.x, e.y, lethal ? 1 : 0.45, lethal ? 420 : 120);
          cam.shake(lethal ? 0.75 : 0.45, e.dx / l, e.dy / l);
        } else cam.shake(0.18 * k, e.dx / l, e.dy / l);
        break;
      }
      case 'shield_hit':
        add({ kind: 'dust', x: e.x, y: e.y, dx: e.by === 0 ? 1 : -1, dy: 0.2, life: 0.18, k: 0.5, tint: f.sideTints[e.to] });
        break;
      case 'land':
        add({ kind: 'dust', x: e.x, y: e.y, dx: 1, dy: 0, life: e.hard ? 0.26 : 0.2, k: e.hard ? 0.7 : 0.45, tint: 'ink', both: true });
        break;
      case 'dash':
        add({ kind: 'dust', x: e.x, y: e.y, dx: -e.dir, dy: 0, life: 0.22, k: 0.5, tint: 'ink' });
        break;
      case 'bounce':
      case 'tech':
        add({ kind: 'dust', x: e.x, y: e.y, dx: 1, dy: 0, life: 0.26, k: 0.8, tint: 'ink', both: true });
        break;
      case 'ko': {
        // inward: from the edge it went through toward the middle of the arena
        const dx = e.edge === 'left' ? 1 : e.edge === 'right' ? -1 : 0;
        const dy = e.edge === 'top' ? -1 : e.edge === 'bottom' ? 1 : 0;
        const a = f.arena.blast;
        const x = Math.max(a.left + 0.5, Math.min(a.right - 0.5, e.x));
        const y = Math.max(a.bottom + 0.5, Math.min(a.top - 0.5, e.y));
        add({ kind: 'ko', x, y, dx, dy, life: 0.85, k: 1, tint: f.sideTints[e.side] });
        flashT = Math.max(flashT, 0.1);
        cam.shake(0.9, dx, dy);
        break;
      }
      default:
        break;
    }
  }

  /** the first frames of a special: a flourish around the caster, following him */
  function drawTell(f: InkFrame, m: Mark, p: number): void {
    const fig = m.side === undefined ? null : f.figures[m.side];
    if (!fig) return;
    const ink = makeInk(f.g, 'line');
    const h = (f.fighterDefs[fig.id]?.height ?? 2) * 100 * fig.s;
    const u = Math.max(0.7, fig.s);
    const grow = Math.min(1, p / 0.3);
    const ease = 1 - (1 - grow) * (1 - grow);
    const a = p < 0.55 ? 1 : 1 - (p - 0.55) / 0.45;
    const fx = fig.facing;
    const tint = m.tint;
    const cx = fig.x, cy = fig.y - h * 0.62;
    if (m.who === 'gantry' && m.move === 'special') {
      // Bat Swarm: the cloak flares, strokes sweeping up and out from the shoulders
      for (let i = 0; i < 6; i++) {
        const side = i % 2 ? 1 : -1;
        const ang = -Math.PI / 2 + side * (0.45 + 0.28 * Math.floor(i / 2));
        const r0 = h * 0.3, r1 = r0 + h * (0.3 + 0.1 * (i % 3)) * ease;
        const c = Math.cos(ang), s = Math.sin(ang);
        const bend = side * 0.25;
        const mid = (r0 + r1) / 2;
        ink.line([[cx + c * r0, cy + s * r0], [cx + Math.cos(ang + bend) * mid, cy + Math.sin(ang + bend) * mid], [cx + Math.cos(ang + bend * 1.6) * r1, cy + Math.sin(ang + bend * 1.6) * r1]], { w: 6 * u, taper: 0.9, tint: i % 3 === 2 ? 'ink' : tint, alpha: a, seed: m.seed + i });
      }
    } else if (m.who === 'gantry') {
      // Mist Step: wisps drawn in toward the body from both sides
      for (let i = 0; i < 6; i++) {
        const side = i % 2 ? 1 : -1;
        const y = cy - h * 0.35 + (i * h * 0.75) / 5;
        const out = h * (0.75 - 0.4 * ease);
        const l = h * 0.35;
        const pts: Pt[] = [];
        for (let j = 0; j <= 4; j++) pts.push([cx + side * (out - (l * j) / 4), y + Math.sin(j * 1.5 + i) * 4 * u]);
        ink.line(pts, { w: 3.6 * u, taper: 0.85, tint: i % 3 === 2 ? 'ink' : tint, alpha: a * 0.9, seed: m.seed + i });
      }
    } else if (m.move === 'special') {
      // Pounce: a burst of short strokes kicked back off the feet as he crouches
      for (let i = 0; i < 7; i++) {
        // back and up off the heels, low to steep
        const ang = Math.PI + 0.12 + i * 0.16;
        const r0 = h * 0.1, r1 = r0 + h * (0.3 + 0.14 * (i % 3)) * ease;
        const c = Math.cos(ang) * fx, s = Math.sin(ang);
        const ox = fig.x - fx * h * 0.18, oy = fig.y - 3;
        ink.line([[ox + c * r0, oy + s * r0], [ox + c * r1, oy + s * r1]], { w: (i % 2 ? 4 : 6) * u, taper: 0.9, tint: i % 3 === 1 ? 'ink' : tint, alpha: a, seed: m.seed + i });
      }
      ink.line([[fig.x - fx * h * 0.1, fig.y + 2], [fig.x + fx * h * (0.2 + 0.5 * ease), fig.y + 2]], { w: 4 * u, taper: 0.8, tint, alpha: a, seed: m.seed + 9 });
    } else {
      // Howl: the hackles rise, short upright strokes along the back and head
      for (let i = 0; i < 6; i++) {
        const t = i / 5;
        const bx = fig.x - fx * h * (0.3 - 0.55 * t);
        const by = fig.y - h * (0.62 + 0.28 * Math.sin(t * Math.PI));
        const l = h * (0.16 + 0.1 * Math.sin(t * Math.PI)) * ease;
        ink.line([[bx, by], [bx - fx * l * 0.25, by - l]], { w: 5.5 * u, taper: 0.9, tint: i % 2 ? 'ink' : tint, alpha: a, seed: m.seed + i });
      }
    }
  }

  /** a fighter past the widest view: a small arrowhead at the picture's edge pointing at him */
  function drawPointers(f: InkFrame): void {
    const fight = f.fight;
    if (!fight) return;
    const ink = makeInk(f.g, 'line');
    const b = f.arena.blast;
    for (const side of [0, 1] as Side[]) {
      const s = fight.state.fighters[side];
      if (s.action === 'dead' || s.x < b.left || s.x > b.right || s.y < b.bottom || s.y > b.top) continue;
      const bx = fighterBox(f, s);
      const v = f.view;
      const sx0 = v.x(bx.x0), sx1 = v.x(bx.x1), sy0 = v.y(bx.y1), sy1 = v.y(bx.y0);
      if (sx1 > 0 && sx0 < W && sy1 > 0 && sy0 < H) continue;
      const tx = (sx0 + sx1) / 2, ty = (sy0 + sy1) / 2;
      const m = 30;
      let px = Math.max(m, Math.min(W - m, tx));
      let py = Math.max(m, Math.min(H - m, ty));
      if ((px < 480 || px > W - 480) && py > H - 124) py = H - 124;
      const dx = tx - px, dy = ty - py;
      const l = Math.hypot(dx, dy) || 1;
      const ux = dx / l, uy = dy / l;
      const S = 17;
      const tip: Pt = [px + ux * S * 0.6, py + uy * S * 0.6];
      const back: Pt = [px - ux * S * 0.6, py - uy * S * 0.6];
      const tri: Pt[] = [tip, [back[0] - uy * S * 0.55, back[1] + ux * S * 0.55], [back[0] + ux * 4, back[1] + uy * 4], [back[0] + uy * S * 0.55, back[1] - ux * S * 0.55]];
      ink.form(tri, { tint: f.sideTints[side], w: 1.6, seed: 880 + side });
      ink.line([[back[0] - ux * 4, back[1] - uy * 4], [back[0] - ux * 18, back[1] - uy * 18]], { tint: f.sideTints[side], w: 3, taper: 0.8, seed: 890 + side });
    }
  }

  return {
    prepare(f: InkFrame) {
      const dt = Math.max(0, Math.min(0.25, f.dt));
      for (const m of marks) m.age += dt;
      for (let i = marks.length - 1; i >= 0; i--) if (marks[i]!.age > marks[i]!.life) marks.splice(i, 1);
      const fight = f.fight;
      if (fight) for (const e of fight.events) onEvent(f, e);
      // envelopes
      for (const side of [0, 1] as Side[]) {
        if (hot[side] > 0) f.post.fighterFlash[side] = Math.max(f.post.fighterFlash[side], Math.min(1, 0.4 + hot[side] * 8));
        hot[side] = Math.max(0, hot[side] - dt);
      }
      if (dimT > 0) {
        f.post.dim = Math.max(f.post.dim, dimAmt * Math.min(1, dimT / 0.15));
        dimT = Math.max(0, dimT - dt);
      } else dimAmt = 0;
      if (flashT > 0) {
        f.post.flash = Math.max(f.post.flash, Math.min(0.45, flashT * 5));
        flashT = Math.max(0, flashT - dt);
      }
      // trails: tumbling fighters leave a short drawn trail
      for (const side of [0, 1] as Side[]) {
        const s = fight?.state.fighters[side];
        const tr = trail[side];
        if (!s || !s.tumble || s.action !== 'hitstun' || fight!.mode === 'frozen') {
          tr.length = 0;
          continue;
        }
        const h = (f.fighterDefs[s.fighter]?.height ?? 2) * 0.5;
        const last = tr[tr.length - 1];
        if (!last || Math.hypot(last[0] - s.x, last[1] - s.y - h) > 0.05) tr.push([s.x, s.y + h]);
        if (tr.length > 9) tr.splice(0, tr.length - 9);
      }
    },
    draw(f: InkFrame) {
      const g = f.g;
      const v = f.view;
      const u = v.scale / 100; // px per figure unit: strokes scale with the picture
      const ink = makeInk(g, 'line');
      for (const m of marks) {
        const p = m.age / m.life;
        let cx = v.x(m.x);
        let cy = v.y(m.y);
        // a knockout drives in from the edge of the picture nearest where it went out
        if (m.kind === 'ko') {
          cx = Math.max(-20, Math.min(W + 20, cx));
          cy = Math.max(-20, Math.min(H + 20, cy));
        }
        const ux = m.dx, uy = -m.dy; // screen direction
        if (m.kind === 'burst') {
          const n = 3 + Math.round(m.k * 4);
          for (let i = 0; i < n; i++) {
            const spread = ((i / Math.max(1, n - 1)) - 0.5) * (0.9 + 0.3 * m.k) + Math.sin(m.seed + i * 2.3) * 0.12;
            const c = Math.cos(spread), s = Math.sin(spread);
            const dx = ux * c - uy * s, dy = ux * s + uy * c;
            const len = (40 + 70 * m.k) * u * (i % 2 ? 0.7 : 1);
            const r0 = (10 + 60 * p * (0.6 + m.k)) * u;
            const r1 = r0 + len * (1 - p * 0.7);
            ink.line([[cx + dx * r0, cy + dy * r0], [cx + dx * r1, cy + dy * r1]], { w: (2 + 3.5 * m.k) * Math.max(0.6, u) * (1 - p * 0.5), seed: m.seed + i, taper: 0.9, tint: m.tint, alpha: 1 - p * p });
          }
          // a short counter stroke back toward the attacker
          const bl = (24 + 30 * m.k) * u * (1 - p);
          ink.line([[cx, cy], [cx - ux * bl, cy - uy * bl]], { w: 2 * Math.max(0.6, u), seed: m.seed + 40, taper: 0.9, alpha: 0.7 * (1 - p) });
        } else if (m.kind === 'dust') {
          const w = 1.8 * Math.max(0.6, u);
          const a = 0.85 * (1 - p);
          const dirs = m.both ? [-1, 1] : [m.dx, m.dx];
          for (let i = 0; i < dirs.length; i++) {
            const dir = dirs[i]!;
            const off = (16 + 46 * p) * u * m.k + (m.both ? 0 : i * 10 * u);
            const l = (30 - 8 * i) * u * m.k * (1 - p * 0.5);
            const yy = cy - (3 + (m.both ? 0 : i * 7) + p * 10 * m.k) * u;
            ink.line([[cx + dir * off, yy], [cx + dir * (off + l), yy - l * 0.22]], { w, seed: m.seed + i, taper: 0.9, tint: m.tint, alpha: a });
          }
          // a small upward flick
          const l = 16 * u * m.k;
          const sx = m.both ? 0 : m.dx * 6 * u;
          ink.line([[cx + sx, cy - 4 * u], [cx + sx + (m.both ? 0.3 : m.dx) * l * 0.5, cy - 4 * u - l * (0.5 + p)]], { w: w * 0.85, seed: m.seed + 7, taper: 0.9, tint: m.tint, alpha: a * 0.8 });
        } else if (m.kind === 'mist') {
          // wavering strokes over the body's height, rising and spreading as they fade
          const sc = v.scale;
          const n = 9;
          for (let i = 0; i < n; i++) {
            const r1 = Math.sin(m.seed * 1.7 + i * 2.3), r2 = Math.sin(m.seed * 0.9 + i * 3.7);
            const ox = (r1 * 0.5 + (i % 2 ? 0.14 : -0.14)) * (1 + p * 0.9) * sc;
            const oy = ((i / (n - 1)) * 1.8 - 0.9 - p * 0.5) * sc;
            const l = (0.42 + 0.16 * r2) * sc * m.k * (1 + p * 0.6);
            const x0 = cx + ox - l * 0.5, y0 = cy - oy;
            const pts: Pt[] = [];
            for (let j = 0; j <= 5; j++) pts.push([x0 + (l * j) / 5, y0 + Math.sin(j * 1.4 + i + p * 6) * 0.05 * sc]);
            const fade = p < 0.5 ? 1 : 1 - (p - 0.5) * 2;
            ink.line(pts, { w: 3.8 * Math.max(0.7, u) * (1 - p * 0.4), seed: m.seed + i, taper: 0.85, tint: i % 3 === 1 ? 'ink' : 'red', alpha: (i % 3 === 1 ? 0.6 : 0.85) * fade });
          }
        } else if (m.kind === 'tell') {
          drawTell(f, m, p);
        } else {
          // knockout: long strokes driving in from the edge
          const n = 9;
          for (let i = 0; i < n; i++) {
            const lane = (i - (n - 1) / 2) * 30;
            const px = -uy, py = ux; // across the travel
            const head = (60 + 900 * Math.min(1, p * 1.6)) * (0.8 + 0.3 * Math.sin(m.seed + i * 1.7));
            const len = 220 + 160 * Math.sin(m.seed * 0.3 + i);
            const tail = Math.max(0, head - len * (1 - p));
            const bx = cx + px * lane, by = cy + py * lane;
            const mid = Math.abs(i - (n - 1) / 2) < 1.5;
            ink.line([[bx + ux * tail, by + uy * tail], [bx + ux * head, by + uy * head]], { w: 4 + 7 * (1 - Math.abs(lane) / 150), seed: m.seed + i, taper: 0.85, tint: mid && i % 2 ? m.tint : 'ink', alpha: 1 - p * p });
          }
        }
      }
      // trails
      for (const side of [0, 1] as Side[]) {
        const tr = trail[side];
        if (tr.length < 3) continue;
        const pts: Pt[] = tr.map(([x, y]) => [v.x(x), v.y(y)]);
        const a = pts[pts.length - 1]!;
        const b = pts[0]!;
        const l = Math.hypot(a[0] - b[0], a[1] - b[1]) || 1;
        const nx = -(a[1] - b[1]) / l, ny = (a[0] - b[0]) / l;
        for (let i = -1; i <= 1; i++) {
          const o = i * 16 * u;
          const shift = Math.abs(i) * 0.25;
          const sub = pts.slice(Math.floor(pts.length * shift), pts.length - 1).map(([x, y]): Pt => [x + nx * o, y + ny * o]);
          if (sub.length < 2) continue;
          ink.line(sub, { w: (i === 0 ? 3 : 2) * Math.max(0.6, u), seed: 500 + side * 9 + i, taper: 0.95, tint: f.sideTints[side], alpha: i === 0 ? 0.9 : 0.6 });
        }
      }
      drawPointers(f);
    },
    dispose() {
      marks.length = 0;
    },
  };
}

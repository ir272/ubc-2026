// The two fighters: each posed figure drawn by its CharacterDef in the frame's ink mode, spun about
// the hip, red-hot while post.fighterFlash is up, blinking while invulnerable, hidden while dead.
// Also the projectiles (the owner's drawProjectile, or a short dart) and the shield (an arc of pen
// strokes in front of the fighter that thins and breaks as the shield wears).
//
// The helpers at the top (standState, extraFor, makeFigure, drawFigure) are shared with the
// screens and the pose sheet.

import type { CharacterDef, Figure, FigureExtra, InkFrame, InkModule, Joints } from './api.ts';
import { UNITS_PER_M } from './api.ts';
import type { FighterDef, FighterId, FighterState, Side } from '../sim/types.ts';
import { makeInk, TINTS, type InkMode, type Pt } from './pen.ts';

export function standState(fighter: FighterId, over: Partial<FighterState> = {}): FighterState {
  return {
    fighter, x: 0, y: 0, vx: 0, vy: 0, facing: 1, action: 'idle', actionFrame: 1, move: null, charge: 0,
    grounded: true, platform: -1, ledge: -1, damage: 0, lives: 3, shield: 100, hitlag: 0, hitstun: 0,
    tumble: false, kbx: 0, kby: 0, invuln: 0, armor: false, airJumpsLeft: 1, fastFall: false, ...over,
  };
}

export function extraFor(s: FighterState, def: FighterDef | undefined, t: number, sideTint: string): FigureExtra {
  let moveT = 0;
  let movePart: FigureExtra['movePart'] = null;
  const m = s.move && def ? def.moves[s.move] : null;
  if (m && (s.action === 'attack' || s.action === 'charge' || s.action === 'holding')) {
    const total = Math.max(1, m.startup + m.active + m.recovery);
    const f = s.action === 'charge' ? Math.min(m.startup, s.actionFrame) : s.actionFrame;
    moveT = Math.max(0, Math.min(1, (f - 1) / Math.max(1, total - 1)));
    movePart = f <= m.startup ? 'startup' : f <= m.startup + m.active ? 'active' : 'recovery';
  }
  return { t, state: s, moveT, movePart, sideTint, drag: s.vx * 60 * UNITS_PER_M, armor: s.armor ? 1 : 0 };
}

/** local figure units -> stage px, with the spin about the hip and the facing flip */
function toStage(fig: { x: number; y: number; s: number; facing: 1 | -1; joints: Joints }, p: Pt): Pt {
  const J = fig.joints;
  let lx = p[0];
  let ly = p[1];
  if (J.spin) {
    const c = Math.cos(J.spin), sn = Math.sin(J.spin);
    const dx = lx - J.hip[0], dy = ly - J.hip[1];
    lx = J.hip[0] + dx * c - dy * sn;
    ly = J.hip[1] + dx * sn + dy * c;
  }
  return [fig.x + lx * fig.s * fig.facing, fig.y + ly * fig.s];
}

export function makeFigure(side: Side, s: FighterState, joints: Joints, x: number, y: number, scale: number): Figure {
  const fig: Figure = {
    side,
    id: s.fighter,
    state: s,
    joints,
    x,
    y,
    s: scale,
    facing: s.facing,
    point(name: string): Pt {
      const p = (joints as unknown as Record<string, Pt>)[name];
      return toStage(fig, Array.isArray(p) ? p : joints.chest);
    },
  };
  return fig;
}

/** draw one posed figure with its CharacterDef at stage px (x, y), px per unit s, facing */
export function drawFigure(g: CanvasRenderingContext2D, ch: CharacterDef, J: Joints, x: FigureExtra, px: number, py: number, s: number, facing: number, mode: InkMode): void {
  g.save();
  g.translate(px, py);
  g.scale(facing * s, s);
  if (J.spin) {
    g.translate(J.hip[0], J.hip[1]);
    g.rotate(J.spin);
    g.translate(-J.hip[0], -J.hip[1]);
  }
  // a fresh pen per figure: the automatic seeds start over, so the lines hold still frame to frame
  const ink = makeInk(g, mode);
  ch.draw(ink, J, x);
  if (ch.drawMove) ch.drawMove(makeInk(g, mode), J, x);
  g.restore();
}

export function createFigures(): InkModule {
  let off: HTMLCanvasElement | null = null;
  let og: CanvasRenderingContext2D | null = null;

  function drawOne(f: InkFrame, fig: Figure): void {
    const s = fig.state;
    if (s.action === 'dead') return;
    const ch = f.cast[s.fighter];
    if (!ch) return;
    const g = f.g;
    const t = f.now / 1000;
    const x = extraFor(s, f.fighterDefs[s.fighter], t, f.sideTints[fig.side]);
    // invulnerable: a quick blink (one short faint beat in three), not a long grey ghost; dodges,
    // ledge options and moves with their own look (Mist Step) are drawn solid
    const dodge = s.action === 'airdodge' || s.action === 'roll' || s.action === 'spotdodge' || s.action === 'getup' ||
      s.action === 'ledgeclimb' || s.action === 'ledgehang' || s.action === 'attack';
    const blink = s.invuln > 0 && !dodge && Math.floor(f.now / 55) % 3 === 0;
    g.globalAlpha = blink ? 0.4 : 1;
    drawFigure(g, ch, fig.joints, x, fig.x, fig.y, fig.s, fig.facing, f.mode);
    g.globalAlpha = 1;
    if (s.action === 'shield' || s.action === 'shieldstun') drawShield(f, fig);
    if ((s.rooted ?? 0) > 0) drawStagger(f, fig);
    const hot = f.post.fighterFlash[fig.side];
    if (hot > 0.01) drawHot(f, fig, ch, x, hot);
  }

  /** the figure again in flat red, over itself */
  function drawHot(f: InkFrame, fig: Figure, ch: CharacterDef, x: FigureExtra, amount: number): void {
    const cw = f.g.canvas.width;
    const chh = f.g.canvas.height;
    if (!off) {
      off = document.createElement('canvas');
      og = off.getContext('2d');
    }
    if (!off || !og) return;
    if (off.width !== cw || off.height !== chh) {
      off.width = cw;
      off.height = chh;
    }
    // the figure's box only
    const r = (fig.joints && f.fighterDefs[fig.id]?.height ? f.fighterDefs[fig.id]!.height : 2) * UNITS_PER_M * fig.s * 1.6;
    const k = cw / 1280;
    const bx = Math.max(0, Math.floor((fig.x - r) * k));
    const by = Math.max(0, Math.floor((fig.y - r * 1.4) * k));
    const bw = Math.min(cw - bx, Math.ceil(r * 2 * k));
    const bh = Math.min(chh - by, Math.ceil(r * 2 * k));
    if (bw <= 0 || bh <= 0) return;
    og.setTransform(1, 0, 0, 1, 0, 0);
    og.globalCompositeOperation = 'source-over';
    og.clearRect(bx, by, bw, bh);
    og.setTransform(k, 0, 0, k, 0, 0);
    drawFigure(og, ch, fig.joints, x, fig.x, fig.y, fig.s, fig.facing, f.mode);
    og.setTransform(1, 0, 0, 1, 0, 0);
    og.globalCompositeOperation = 'source-in';
    og.fillStyle = TINTS.red!;
    og.fillRect(bx, by, bw, bh);
    og.globalCompositeOperation = 'source-over';
    const g = f.g;
    g.save();
    g.setTransform(1, 0, 0, 1, 0, 0);
    g.globalAlpha = Math.min(1, amount);
    g.drawImage(off, bx, by, bw, bh, bx, by, bw, bh);
    g.restore();
  }

  /** the guard: a short bowed wall of upright pen strokes in front of the fighter, in the side tint;
   *  four heavy strokes when the shield is full, fewer, thinner and broken as it wears, pushed out
   *  with a flick for the first frames of a block */
  function drawShield(f: InkFrame, fig: Figure): void {
    const s = fig.state;
    const def = f.fighterDefs[s.fighter];
    const h = (def?.height ?? 2) * UNITS_PER_M;
    const hw = (def?.width ?? 1) * UNITS_PER_M * 0.5;
    const hp = Math.max(0, Math.min(1, s.shield / 100));
    const stun = s.action === 'shieldstun' ? Math.max(0, 1 - (s.actionFrame - 1) / 8) : 0;
    const g = f.g;
    g.save();
    g.translate(fig.x, fig.y);
    g.scale(fig.facing * fig.s, fig.s);
    const ink = makeInk(g, 'line');
    const tint = f.sideTints[fig.side];
    const n = hp > 0.7 ? 4 : hp > 0.35 ? 3 : 2;
    const front = hw + 22 + stun * 14;
    const cy = -h * 0.5;
    const bow = h * 0.11;
    const pieces = hp > 0.6 ? 1 : hp > 0.3 ? 2 : 3;
    for (let i = 0; i < n; i++) {
      const c = i - (n - 1) / 2;
      const span = h * (0.78 - 0.1 * Math.abs(c)) * (0.75 + 0.25 * hp);
      const x0 = front + c * 9;
      const pts: Pt[] = [];
      for (let j = 0; j <= 8; j++) {
        const t = j / 8 - 0.5;
        pts.push([x0 + bow * (1 - 4 * t * t) - stun * 10 * (1 - 4 * t * t) * (i % 2 ? 0.6 : 1), cy + t * span]);
      }
      // broken into pieces as the shield wears: drop a short gap between them
      for (let k = 0; k < pieces; k++) {
        const g0 = Math.floor((k * 9) / pieces) + (k ? 1 : 0);
        const g1 = Math.floor(((k + 1) * 9) / pieces) - (k < pieces - 1 ? 1 : 0);
        const seg = pts.slice(g0, Math.max(g0 + 2, g1 + 1));
        if (seg.length < 2) continue;
        ink.line(seg, { w: 1.6 + hp * 3.4 - Math.abs(c) * 0.6, tint, seed: 900 + i * 7 + k + fig.side * 40, taper: 0.7, alpha: 0.6 + 0.4 * hp });
      }
    }
    // the hit: a quick flick off the top and the bottom of the wall
    if (stun > 0) {
      const tx = front + bow * 0.4 + 8;
      const l = 26 * stun + 8;
      ink.line([[tx, cy - h * 0.3], [tx + l, cy - h * 0.3 - l * 0.6]], { w: 2.4, tint, seed: 960 + fig.side, taper: 0.9, alpha: stun });
      ink.line([[tx, cy + h * 0.28], [tx + l * 0.8, cy + h * 0.28 + l * 0.5]], { w: 2, tint, seed: 970 + fig.side, taper: 0.9, alpha: stun });
    }
    g.restore();
  }

  /** staggered (rooted by the Howl): three wavering upright strokes over the head, in the howler's
   *  tint, for as long as it lasts */
  function drawStagger(f: InkFrame, fig: Figure): void {
    const s = fig.state;
    const h = (f.fighterDefs[s.fighter]?.height ?? 2) * UNITS_PER_M * fig.s;
    const head = fig.point('head');
    const ink = makeInk(f.g, 'line');
    const tint = f.sideTints[fig.side === 0 ? 1 : 0];
    const t = f.now / 1000;
    const u = Math.max(0.7, fig.s);
    const top = Math.min(head[1], fig.y - h * 0.95) - h * 0.12;
    for (let i = 0; i < 3; i++) {
      const c = i - 1;
      const bx = head[0] + c * h * 0.16;
      const l = h * (0.24 - 0.04 * Math.abs(c));
      const pts: Pt[] = [];
      for (let j = 0; j <= 6; j++) {
        const y = top - (l * j) / 6 - Math.abs(c) * h * 0.02;
        pts.push([bx + Math.sin(t * 11 + j * 1.25 + i * 2) * h * 0.035 + c * j * 1.2 * u, y]);
      }
      ink.line(pts, { w: 4 * u, taper: 0.7, tint: i === 1 ? 'ink' : tint, seed: 940 + i + fig.side * 5 });
    }
  }

  function drawProjectiles(f: InkFrame): void {
    const fight = f.fight;
    if (!fight) return;
    const g = f.g;
    const t = f.now / 1000;
    for (const p of fight.state.projectiles) {
      const ownerId = fight.state.fighters[p.owner]?.fighter;
      const ch = ownerId ? f.cast[ownerId] : undefined;
      const s = f.view.scale / UNITS_PER_M;
      g.save();
      g.translate(f.view.x(p.x), f.view.y(p.y));
      g.scale(s, s);
      g.rotate(Math.atan2(-p.vy, p.vx));
      const ink = makeInk(g, f.mode);
      if (ch?.drawProjectile) ch.drawProjectile(ink, p, t);
      else {
        const r = Math.max(14, p.r * UNITS_PER_M);
        ink.line([[-r * 2.2, 0], [r * 0.6, 0]], { w: 3, seed: 700 + (p.id % 50), taper: 0.6, tint: f.sideTints[p.owner] });
        ink.line([[r * 0.6, 0], [-r * 0.2, -r * 0.5]], { w: 2.4, seed: 760 + (p.id % 50), taper: 0.5 });
        ink.line([[r * 0.6, 0], [-r * 0.2, r * 0.5]], { w: 2.4, seed: 820 + (p.id % 50), taper: 0.5 });
      }
      g.restore();
    }
  }

  return {
    draw(f: InkFrame) {
      // the one in the middle of an attack is drawn on top
      const [a, b] = f.figures;
      const order = a && b && (b.state.action === 'attack' || b.state.action === 'holding') && a.state.action !== 'attack' ? [a, b] : [b, a];
      for (const fig of order) if (fig) drawOne(f, fig);
      drawProjectiles(f);
    },
    dispose() {
      if (off) {
        off.width = 0;
        off.height = 0;
      }
      off = null;
      og = null;
    },
  };
}

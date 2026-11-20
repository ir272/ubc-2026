// Ringout fight HUD (ARCH "HUD"), cut to the owner's clean-look rule.
//
// Each bottom corner is one calm object on one angled plate with one ink shadow: the robot's
// portrait on a side-colour chip (who is who, which side), the damage percent (the hero, one
// outline, one shadow), the lives as side-colour pips, and one line under the number: the coach's
// stance mark, the bot's name and its model label (nothing at all when the label is empty), small.
// Side 1 is the mirror. The stance mark is the only trace of the coach on the stage: when the
// stance changes it pulses once, from the frame the new mark is drawn (a late joiner's first stance
// only sets the mark).
// Owner's rule (Nov 19, 15:12): no coach read line, no stance word. Do not put them back.
// The fight clock hangs top centre. Over the robots: the name tag only for 2 s at fight start,
// after a respawn and when the viewer's pick is set; otherwise a small side-colour pointer with no
// text, and only while the two robots are close. The off-screen marker sits at the frame edge, and
// the viewer's pick gets a quiet ring on the ground.
//
// Laid out for 1280x720 in ctx.ui. Per frame only transforms, opacity and clip-path are written
// (text and fills only when they change).

import * as THREE from 'three';
import type { CreateHud, Frame, StageCtx, StageModule } from './api.ts';
import { LAYER } from './api.ts';
import type { FighterId, FighterState, Plan, Side, Stance } from '../sim/types.ts';
import { FONTS, PALETTE, el } from './style.ts';
import { DamageNumber } from './hud/number.ts';
import { headMark, stanceMark } from './hud/marks.ts';
import { renderPortrait } from './hud/portrait.ts';
import { EdgeMarker } from './hud/offscreen.ts';

const NS = 'http://www.w3.org/2000/svg';
const INK = PALETTE.ink;

function svg(parent: Element, attrs: Record<string, string | number>, tag = 'svg'): SVGElement {
  const e = document.createElementNS(NS, tag) as SVGElement;
  for (const k in attrs) e.setAttribute(k, String(attrs[k]));
  parent.appendChild(e);
  return e;
}

// ---- geometry, side 0 (bottom left), in the scorebug's own box; side 1 is the mirror ----
// Every cut edge leans the same way: x = a - y * LEAN.
const BOX_W = 380;
const BOX_H = 112;
const BOX_LEFT: [number, number] = [18, 1280 - 18 - BOX_W];
const BOX_TOP = 720 - 16 - BOX_H;
const LEAN = 0.24;
const lean = (a: number) => (y: number) => a - y * LEAN;
/** the plate */
const BODY = { y0: 14, y1: BOX_H };
const bodyLeft = lean(26);
const inner = lean(372);
/** the portrait chip: a tilted side-colour card behind the robot, breaking out of the plate top */
const CHIP = { y0: -10, y1: BOX_H - 4 };
const chipL = lean(30);
const chipR = lean(128);
/** the portrait canvas (drawn at 2x), shown at this size; clipped at the chip's foot and lean */
const PORT = { x: -6, y: -40, size: 148 };
const NUM = { size: 66, baselineY: 78 };
const LIVES = { r: 11, gap: 27, right: 342, y: 57 };
/** the name line */
const ROW = { y0: 86, h: 24 };
/** the stance mark's one pulse when the stance changes (ms) */
const PULSE_MS = 420;
/** the sudden-death call (screens/predictions.ts) holds this long; the clock stays away meanwhile */
const SUDDEN_CALL_MS = 1500;
const TAG_FONT = `700 17px ${FONTS.text}`;
const PLATE_FILL = '#0f1a28';
const TAG_MS = 2000;

let mctx: CanvasRenderingContext2D | null = null;
function textW(s: string, font: string): number {
  if (!mctx) mctx = document.createElement('canvas').getContext('2d');
  if (!mctx) return s.length * 9;
  mctx.font = font;
  return mctx.measureText(s).width;
}

interface PlateUi {
  side: Side;
  X: (x: number) => number;
  root: HTMLElement;
  body: HTMLElement;
  // portrait
  port: HTMLElement;
  portCanvas: HTMLCanvasElement;
  portSvg: SVGElement;
  headG: SVGElement;
  fighterId: string;
  pickOutline: SVGElement;
  // the name line
  mark: SVGElement;
  name: HTMLElement;
  model: HTMLElement;
  nameKey: string;
  stanceKey: string;
  // number
  num: DamageNumber;
  // lives
  livesG: SVGElement;
  pips: { fill: SVGElement; sock: SVGElement; lostT: number }[];
  livesShown: number;
  out: boolean;
  /** the stance last seen and the show-clock ms it really changed (drives the mark's pulse) */
  planKey: string;
  changedAt: number;
  markScale: number;
  // entrance
  inT: number;
  // over the robot
  tag: { root: HTMLElement; label: HTMLElement; arrow: HTMLElement; alpha: number; mode: string; key: string; w: number };
  respawnTick: number;
  hlAt: number;
  edge: EdgeMarker;
  ring: THREE.Mesh;
  ringAlpha: number;
  ringY: number;
}

export const createHud: CreateHud = (ctx: StageCtx): StageModule => {
  const layer = el('div', ctx.ui, { position: 'absolute', inset: '0', pointerEvents: 'none', display: 'none', zIndex: '2' });
  const tagLayer = el('div', layer, { position: 'absolute', inset: '0' });

  // ---------------------------------------------------------------- clock
  const clockRoot = el('div', layer, { position: 'absolute', left: '560px', top: '0', width: '160px', height: '64px', willChange: 'transform', transformOrigin: '80px 0' });
  const clockSvg = svg(clockRoot, { width: 160, height: 64, viewBox: '0 0 160 64', style: 'position:absolute;left:0;top:0;overflow:visible' });
  const pts = (p: number[][]) => p.map((q) => q.join(',')).join(' ');
  svg(clockSvg, { points: pts([[6, 0], [166, 0], [150, 60], [22, 60]]), fill: INK }, 'polygon');
  const clockPlate = svg(clockSvg, { points: pts([[0, 0], [160, 0], [145, 56], [15, 56]]), fill: PALETTE.navy }, 'polygon');
  const clockText = svg(clockSvg, {
    x: 80, y: 45, 'text-anchor': 'middle', 'font-family': FONTS.display, 'font-weight': 900, 'font-size': 46,
    fill: PALETTE.white, 'letter-spacing': '0.5',
  }, 'text');
  const suddenText = svg(clockSvg, {
    x: 80, y: 38, 'text-anchor': 'middle', 'font-family': FONTS.display, 'font-weight': 900, 'font-size': 28,
    fill: PALETTE.white, 'letter-spacing': '1', display: 'none',
  }, 'text');
  suddenText.textContent = 'Sudden death';
  let clockStr = '';
  let clockSec = -1;
  let clockPulse = 0;
  let clockMode = '';

  // ---------------------------------------------------------------- plates
  const plates: PlateUi[] = ([0, 1] as Side[]).map((side) => buildPlate(side));

  function buildPlate(side: Side): PlateUi {
    const sideCol = ctx.sideColors[side];
    const X = (x: number) => (side === 0 ? x : BOX_W - x);
    const P = (p: number[][]) => p.map(([x, y]) => `${X(x).toFixed(1)},${y.toFixed(1)}`).join(' ');
    const poly = (parent: Element, p: number[][], fill: string, extra: Record<string, string | number> = {}) =>
      svg(parent, { points: P(p), fill, ...extra }, 'polygon');
    const quad = (l: (y: number) => number, r: (y: number) => number, y0: number, y1: number) => [[l(y0), y0], [r(y0), y0], [r(y1), y1], [l(y1), y1]];
    const root = el('div', layer, {
      position: 'absolute', left: `${BOX_LEFT[side]}px`, top: `${BOX_TOP}px`, width: `${BOX_W}px`, height: `${BOX_H}px`, willChange: 'transform',
    });

    // ---- the plate ----
    const body = el('div', root, { position: 'absolute', left: '0', top: '0', width: `${BOX_W}px`, height: `${BOX_H}px`, willChange: 'transform, opacity' });
    const back = svg(body, { width: BOX_W, height: BOX_H, viewBox: `0 0 ${BOX_W} ${BOX_H}`, style: 'position:absolute;left:0;top:0;overflow:visible' });
    const plate = quad(bodyLeft, inner, BODY.y0, BODY.y1);
    poly(back, plate.map(([x, y]) => [x + 6, y + 6]), INK);
    poly(back, plate, PLATE_FILL);
    const chip = quad(chipL, chipR, CHIP.y0, CHIP.y1);
    poly(back, chip.map(([x, y]) => [x + 5, y + 5]), INK);
    poly(back, chip, sideCol);
    const pickOutline = poly(back, chip, 'none', { stroke: PALETTE.white, 'stroke-width': 4, 'stroke-linejoin': 'miter', opacity: 0 });

    // the portrait: a sticker standing on the chip, cut only by the chip's foot and its inner lean
    const clip = [[-60, -80], [chipR(-80) + 4, -80], [chipR(CHIP.y1) + 4, CHIP.y1], [-60, CHIP.y1]];
    const port = el('div', body, {
      position: 'absolute', left: '0', top: '0', width: `${BOX_W}px`, height: `${BOX_H}px`,
      clipPath: `polygon(${clip.map(([x, y]) => `${X(x).toFixed(1)}px ${y}px`).join(', ')})`,
    });
    const portCanvas = el('canvas', port, {
      position: 'absolute',
      left: `${side === 0 ? PORT.x : BOX_W - PORT.x - PORT.size}px`,
      top: `${PORT.y}px`, width: `${PORT.size}px`, height: `${PORT.size}px`, display: 'none',
      transform: side === 1 ? 'scaleX(-1)' : '',
    });
    const portSvg = svg(port, { width: BOX_W, height: BOX_H, viewBox: `0 0 ${BOX_W} ${BOX_H}`, style: 'position:absolute;left:0;top:0;overflow:visible' });
    const headG = svg(portSvg, { transform: `translate(${side === 0 ? 14 : BOX_W - 14 - 1.5 * 64} 4) scale(1.5)` }, 'g');

    // the name line: stance mark, bot name, model label
    const rowX = chipR(ROW.y0 + ROW.h) + 16;
    const row = el('div', body, {
      position: 'absolute', top: `${ROW.y0}px`, height: `${ROW.h}px`, width: `${inner(ROW.y0) - rowX - 18}px`,
      display: 'flex', alignItems: 'center', gap: '8px', whiteSpace: 'nowrap', overflow: 'hidden',
      ...(side === 0 ? { left: `${rowX}px`, flexDirection: 'row' } : { right: `${rowX}px`, flexDirection: 'row-reverse' }),
    });
    const mark = svg(row, { width: 18, height: 18, viewBox: '0 0 20 20', style: `flex:0 0 auto;color:${PALETTE.white};transform-origin:50% 50%${side === 1 ? ';transform:scaleX(-1)' : ''}` });
    const name = el('div', row, {
      fontFamily: FONTS.display, fontWeight: '800', fontSize: '24px', lineHeight: `${ROW.h}px`, letterSpacing: '1px',
      textTransform: 'uppercase', color: PALETTE.white, flex: '0 0 auto',
    });
    const model = el('div', row, {
      fontFamily: FONTS.text, fontWeight: '600', fontSize: '16px', lineHeight: `${ROW.h}px`,
      color: 'rgba(244,248,255,0.78)', overflow: 'hidden', textOverflow: 'ellipsis',
    });

    // the number and the lives
    const front = svg(body, { width: BOX_W, height: BOX_H, viewBox: `0 0 ${BOX_W} ${BOX_H}`, style: 'position:absolute;left:0;top:0;overflow:visible' });
    const livesG = svg(front, {}, 'g');
    const num = new DamageNumber(front, { anchorX: X(numberEdge(2)), baselineY: NUM.baselineY, size: NUM.size, align: side === 0 ? 'right' : 'left' });
    num.set(0);

    // ---- over the robot: the name tag (briefly) or a pointer (when close) ----
    const tagRoot = el('div', tagLayer, { position: 'absolute', left: '0', top: '0', willChange: 'transform, opacity', opacity: '0' });
    const label = el('div', tagRoot, {
      position: 'absolute', left: '0', bottom: '14px', transform: 'translateX(-50%)', padding: '0 11px', height: '24px',
      background: sideCol, boxShadow: `3px 3px 0 ${INK}`,
      fontFamily: FONTS.text, fontWeight: '700', fontSize: '17px', lineHeight: '24px', color: PALETTE.white, whiteSpace: 'nowrap',
    });
    const arrow = el('div', tagRoot, { position: 'absolute', left: '-9px', bottom: '0', width: '18px', height: '14px' });
    el('div', arrow, { position: 'absolute', inset: '0', background: INK, clipPath: 'polygon(0 0, 100% 0, 50% 100%)', transform: 'translate(2px, 2px)' });
    el('div', arrow, { position: 'absolute', inset: '0', background: sideCol, clipPath: 'polygon(0 0, 100% 0, 50% 100%)' });

    const edge = new EdgeMarker(tagLayer, sideCol);

    // the viewer's pick: one flat ring on the ground, side colour
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.62, 0.72, 48),
      new THREE.MeshBasicMaterial({ color: new THREE.Color(sideCol), transparent: true, opacity: 0, depthWrite: false, side: THREE.DoubleSide }),
    );
    ring.rotation.x = -Math.PI / 2;
    ring.layers.set(LAYER.FX);
    ring.visible = false;
    ctx.scene.add(ring);

    return {
      side, X, root, body,
      port, portCanvas, portSvg, headG, fighterId: '', pickOutline,
      mark, name, model, nameKey: '', stanceKey: '',
      num, livesG, pips: [], livesShown: -1, out: false,
      planKey: '', changedAt: -1e9, markScale: 1,
      inT: 0,
      tag: { root: tagRoot, label, arrow, alpha: 0, mode: '', key: '', w: 80 },
      respawnTick: -9999, hlAt: -1e9,
      edge, ring, ringAlpha: 0, ringY: 0,
    };
  }

  /** side-0 x of the number's fixed edge for a number of lives (the lives sit at its inner end) */
  function numberEdge(lives: number): number {
    return LIVES.right - (Math.max(1, lives) - 1) * LIVES.gap - LIVES.r - 12;
  }

  function hexPath(r: number): string {
    const p: string[] = [];
    for (let i = 0; i < 6; i++) {
      const a = (Math.PI / 3) * i + Math.PI / 6;
      p.push(`${(Math.cos(a) * r).toFixed(2)} ${(Math.sin(a) * r).toFixed(2)}`);
    }
    return `M${p.join(' L')} Z`;
  }

  function setLives(p: PlateUi, total: number, have: number): void {
    if (p.pips.length !== total) {
      p.livesG.textContent = '';
      p.pips = [];
      const d = hexPath(LIVES.r);
      for (let i = 0; i < total; i++) {
        // the first life sits nearest the number; lives are lost from the inner end
        const x = p.X(LIVES.right - (total - 1 - i) * LIVES.gap);
        const g = svg(p.livesG, { transform: `translate(${x.toFixed(1)} ${LIVES.y})` }, 'g');
        // the empty socket: a dark recess with a faint rim
        const sock = svg(g, { d, fill: '#020509', stroke: 'rgba(244,248,255,0.4)', 'stroke-width': 2, 'stroke-linejoin': 'miter', opacity: 0 }, 'path');
        const fill = svg(g, { d, fill: ctx.sideColors[p.side], stroke: INK, 'stroke-width': 3.5, 'stroke-linejoin': 'miter', 'paint-order': 'stroke' }, 'path');
        p.pips.push({ fill, sock, lostT: i < have ? -1 : 99 });
      }
      p.num.setAnchor(p.X(numberEdge(total)));
    }
    for (let i = 0; i < p.pips.length; i++) {
      const pip = p.pips[i];
      const alive = i < have;
      if (alive && pip.lostT >= 0) {
        pip.lostT = -1;
        pip.fill.setAttribute('opacity', '1');
        pip.fill.setAttribute('fill', ctx.sideColors[p.side]);
        pip.sock.setAttribute('opacity', '0');
      } else if (!alive && pip.lostT < 0) {
        pip.lostT = p.livesShown >= 0 ? 0 : 99;
      }
    }
    p.livesShown = have;
  }

  /** a lost pip: two white frames, then the dark socket. Nothing moves. */
  function animPips(p: PlateUi, dt: number): void {
    for (const pip of p.pips) {
      if (pip.lostT < 0) continue;
      if (pip.lostT < 99) pip.lostT += dt * 60;
      const white = pip.lostT < 5;
      pip.fill.setAttribute('opacity', white ? '1' : '0');
      if (white) pip.fill.setAttribute('fill', PALETTE.white);
      pip.sock.setAttribute('opacity', white ? '0' : '1');
      if (pip.lostT >= 5 && pip.lostT < 99) pip.lostT = 99;
    }
  }

  // ---------------------------------------------------------------- the coach's call
  function setStance(p: PlateUi, plan: Plan | null): void {
    const k = plan ? plan.stance : '';
    if (k === p.stanceKey) return;
    p.stanceKey = k;
    p.mark.innerHTML = plan ? stanceMark(plan.stance as Stance) : '';
    // no stance yet (predictions, a late join before the first plan): no mark and no gap for it
    p.mark.style.display = plan ? '' : 'none';
  }

  function setFighter(p: PlateUi, id: FighterId, alt: boolean): void {
    const key = `${id}|${alt ? 1 : 0}`;
    if (p.fighterId === key) return;
    p.fighterId = key;
    let ok = false;
    try {
      ok = renderPortrait(ctx, id, p.side, alt, p.portCanvas);
    } catch {
      ok = false;
    }
    p.portCanvas.style.display = ok ? 'block' : 'none';
    p.portSvg.style.display = ok ? 'none' : 'block';
    p.headG.innerHTML = ok ? '' : headMark(id);
    p.edge.setPortrait(ok ? p.portCanvas : null, p.side === 1);
  }

  // ---------------------------------------------------------------- state
  let on = false;
  let wasOn = false;
  let lastMatch = -1;
  let lastHl: Side | null = null;
  let busyHold = 0; // seconds the tags keep out of the way (the knockout call)
  let suddenTick = -1; // the tick sudden death began this match (-1 before)
  const v3 = new THREE.Vector3();
  const headV = new THREE.Vector3();
  const tagPos: [number, number, number, number] = [0, 0, 0, 0];

  function hardReset(): void {
    for (const p of plates) {
      p.livesShown = -1;
      p.pips = [];
      p.livesG.textContent = '';
      p.out = false;
      p.respawnTick = -9999;
      p.planKey = '';
      p.changedAt = -1e9;
      p.markScale = 1;
      p.num.set(0);
      p.num.setHidden(false);
      p.port.style.filter = '';
      p.body.style.opacity = '1';
    }
  }

  function toScreen(x: number, y: number): [number, number, boolean] {
    v3.set(x, y, 0).project(ctx.camera);
    return [((v3.x + 1) / 2) * 1280, ((1 - v3.y) / 2) * 720, v3.z < 1];
  }

  function groundBelow(x: number, y: number): number | null {
    const a = ctx.arena;
    let best: number | null = null;
    for (const pl of [a.main, ...a.soft]) {
      if (x >= pl.x0 - 0.1 && x <= pl.x1 + 0.1 && pl.y <= y + 0.05 && (best === null || pl.y > best)) best = pl.y;
    }
    return best;
  }

  return {
    update(frame: Frame) {
      const { show, fight } = frame;
      const dt = frame.dt;
      const phase = show.phase;
      on = !!fight && !!show.ctx && (phase === 'predictions' || phase === 'fight' || phase === 'break');
      const matchNo = show.ctx?.matchNo ?? -1;
      if (matchNo !== lastMatch) {
        lastMatch = matchNo;
        suddenTick = -1;
        hardReset();
      }
      if (on && !wasOn) {
        layer.style.display = 'block';
        // the plates rise in at the start of predictions; a late joiner gets them in place
        const entering = phase === 'predictions' && show.phaseMs < 600;
        for (const p of plates) p.inT = entering ? 0 : 0.5;
      }
      // the exit: plates drop out of frame, then the layer hides
      if (!on && wasOn) for (const p of plates) p.inT = -0.0001;
      wasOn = on;
      if (!on) {
        let any = false;
        for (const p of plates) {
          if (p.inT < 0 && p.inT > -0.3) {
            p.inT -= dt;
            const u = Math.min(1, -p.inT / 0.22);
            p.root.style.transform = `translate3d(0, ${(u * u * 180).toFixed(1)}px, 0)`;
            any = true;
          }
          p.ring.visible = false;
        }
        if (!any) layer.style.display = 'none';
        return;
      }
      if (!fight || !show.ctx) return;
      const c = show.ctx;
      const st = fight.state;
      const live = fight.mode !== 'replay';
      const startLives = c.header?.lives ?? 2;

      // ---- events (live only: a replay re-runs old hits) ----
      if (fight.mode === 'live') {
        for (const ev of fight.events) {
          if (ev.t === 'hit') {
            const base = ev.strength === 'lethal' ? 1 : ev.strength === 'heavy' ? 0.82 : ev.strength === 'medium' ? 0.58 : 0.3;
            plates[ev.to].num.pop(Math.min(1, base + Math.min(0.12, ev.damage / 140)));
          } else if (ev.t === 'ko') {
            busyHold = Math.max(busyHold, 1.7);
          }
        }
      }
      if (fight.mode === 'live' && fight.speed === 0) busyHold = Math.max(busyHold, 0.25);
      busyHold = Math.max(0, busyHold - dt);
      if (show.highlight !== lastHl) {
        if (show.highlight !== null) plates[show.highlight].hlAt = frame.now;
        lastHl = show.highlight;
      }

      // ---- clock ----
      // sudden death is said once: while the big call is up the clock stays away, then it carries it
      if (fight.mode === 'live') for (const ev of fight.events) if (ev.t === 'sudden_death') suddenTick = ev.tick;
      if (st.phase === 'sudden' && suddenTick < 0) suddenTick = c.header?.timeLimitTicks ?? st.tick;
      const suddenCall = st.phase === 'sudden' && suddenTick >= 0 && ((st.tick - suddenTick) * 1000) / 60 < SUDDEN_CALL_MS;
      const showClock = phase === 'fight' && !(fight.mode === 'live' && suddenCall);
      clockRoot.style.display = showClock ? 'block' : 'none';
      if (showClock) {
        const sudden = st.phase === 'sudden' || (fight.ticksLeft <= 0 && st.tick > 0);
        if (sudden) {
          if (clockMode !== 'sudden') {
            clockMode = 'sudden';
            clockPlate.setAttribute('fill', PALETTE.red);
            clockText.setAttribute('display', 'none');
            suddenText.setAttribute('display', 'inline');
            clockPulse = 1;
          }
        } else {
          if (clockMode !== 'reg') {
            clockMode = 'reg';
            clockPlate.setAttribute('fill', PALETTE.navy);
            clockText.removeAttribute('display');
            suddenText.setAttribute('display', 'none');
          }
          const secs = Math.max(0, Math.ceil(fight.ticksLeft / 60));
          const s = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
          if (s !== clockStr) {
            clockStr = s;
            clockText.textContent = s;
          }
          const low = secs <= 10 && secs > 0;
          if (secs !== clockSec) {
            if (low && clockSec !== -1) clockPulse = 1;
            clockSec = secs;
            clockText.setAttribute('fill', low ? PALETTE.red : PALETTE.white);
          }
        }
        clockPulse = Math.max(0, clockPulse - dt * 4.5);
        const sc = 1 + 0.16 * clockPulse * clockPulse;
        clockRoot.style.transform = `scale(${sc.toFixed(3)})`;
      }

      // ---- plates ----
      for (const p of plates) {
        const side = p.side;
        const fs = st.fighters[side];
        const prevF = fight.prev.fighters[side];
        const bot = c.bots[side];
        setFighter(p, fs.fighter, side === 1 && st.fighters[0].fighter === fs.fighter);
        const nk = `${bot.name}|${bot.modelLabel}`;
        if (nk !== p.nameKey) {
          p.nameKey = nk;
          p.name.textContent = bot.name;
          // an empty label draws nothing, and its gap closes with it
          p.model.textContent = bot.modelLabel;
          p.model.style.display = bot.modelLabel ? '' : 'none';
        }

        // lives and damage come from the live fight only (a replay shows old numbers). In the break
        // the reducer's ctx.lives is the truth: the stage may cut to the replay before the live
        // knockout is drawn, so the plate takes the blow from whichever says it first.
        let lives = live ? Math.max(0, fs.lives) : p.livesShown;
        // (while the lethal launch still plays live, wait for the blast itself)
        if (phase === 'break' && c.lives && !(fight.mode === 'live' && fs.action !== 'dead')) lives = Math.max(0, c.lives[side]);
        if (lives >= 0) {
          const lost = p.livesShown >= 0 && lives < p.livesShown;
          setLives(p, Math.max(startLives, lives), lives);
          if (lost) {
            busyHold = Math.max(busyHold, 1.7);
            p.num.set(0);
            if (lives > 0) p.num.reset();
          }
          if (lives <= 0) p.out = true;
        }
        if (live && !p.out) p.num.set(fs.action === 'dead' ? 0 : fs.damage);
        p.num.setHidden(p.out);
        p.num.update(dt);
        animPips(p, dt);
        const outLook = p.out ? 'grayscale(0.85) brightness(0.7)' : '';
        if (p.port.style.filter !== outLook) p.port.style.filter = outLook;
        p.body.style.opacity = p.out ? '0.6' : '1';

        // ---- entrance ----
        let ty = 0;
        if (p.inT >= 0 && p.inT < 0.5) {
          p.inT += dt;
          const t = Math.max(0, p.inT - side * 0.06);
          const f = t * 60;
          ty = f < 1 ? 180 : f < 6 ? 180 * Math.pow(1 - f / 6, 2.2) : 0;
        }
        p.root.style.transform = ty ? `translate3d(0, ${ty.toFixed(1)}px, 0)` : '';

        // ---- the coach: the stance mark by the name, one pulse when the stance changes ----
        const plan = show.plans[side];
        setStance(p, plan);
        // the reducer stamps every plan message (one per side every 3 s); only a new stance counts
        const pk = plan ? plan.stance : '';
        if (pk !== p.planKey) {
          // the first stance seen (the fight's opening plan, or a late join) only sets the mark. The
          // plan message lands ahead of its tick (planChangedAt is its arrival), so the pulse is
          // timed from the frame the new mark is drawn.
          p.changedAt = p.planKey ? frame.now : -1e9;
          p.planKey = pk;
        }
        const since = frame.now - p.changedAt;
        let ms = 1;
        if (since >= 0 && since < PULSE_MS) {
          const u = since / PULSE_MS;
          ms = 1 + 0.4 * (u < 0.25 ? u / 0.25 : Math.pow(1 - (u - 0.25) / 0.75, 2));
        }
        if (Math.abs(ms - p.markScale) > 0.001) {
          p.markScale = ms;
          p.mark.style.transform = `${side === 1 ? 'scaleX(-1) ' : ''}scale(${ms.toFixed(3)})`;
        }

        // ---- highlight: plate mark and ground ring ----
        const picked = show.highlight === side;
        if (picked !== (p.pickOutline.getAttribute('opacity') === '1')) p.pickOutline.setAttribute('opacity', picked ? '1' : '0');
        const ringWant = picked && fs.action !== 'dead' && fs.action !== 'respawn' && fight.mode !== 'replay' ? 1 : 0;
        const x = prevF.x + (fs.x - prevF.x) * fight.alpha;
        const y = prevF.y + (fs.y - prevF.y) * fight.alpha;
        const gy = groundBelow(x, y);
        const ringTarget = gy === null ? 0 : ringWant * Math.max(0, 1 - (y - gy) / 6);
        p.ringAlpha += (ringTarget - p.ringAlpha) * Math.min(1, dt * 12);
        if (gy !== null) p.ringY = gy;
        p.ring.visible = p.ringAlpha > 0.01;
        if (p.ring.visible) {
          const def = ctx.fighterDefs[fs.fighter];
          const w = Math.max(1, (def?.width ?? 1) * 1.25);
          p.ring.position.set(x, p.ringY + 0.025, 0);
          p.ring.scale.set(w, w * 0.85, 1);
          (p.ring.material as THREE.MeshBasicMaterial).opacity = 0.85 * p.ringAlpha;
        }

        // ---- name tag / pointer and the off-screen marker ----
        const def = ctx.fighterDefs[fs.fighter];
        const hgt = def?.height ?? 2;
        let topY = y + hgt + 0.12;
        const fv = ctx.fighters[side];
        if (fv && fight.mode === 'live' && fs.action !== 'dead') {
          try {
            fv.point('head', headV);
            if (Number.isFinite(headV.y)) topY = Math.max(topY, headV.y + 0.55);
          } catch {
            /* the robot is being rebuilt; keep the sim height */
          }
        }
        const [sx, sy, front] = toScreen(x, topY);
        const [, footY] = toScreen(x, y);
        const [mx, my] = toScreen(x, y + hgt / 2);
        const [ex] = toScreen(x + (def?.width ?? 1) * 0.5, y + hgt / 2);
        const hw = Math.abs(ex - mx);
        const offscreen = front && fs.action !== 'dead' && (mx + hw < 0 || mx - hw > 1280 || sy > 724 || footY < -4);
        const edgeOn = offscreen && phase === 'fight' && fight.mode === 'live' && busyHold <= 0;
        p.edge.update(dt, edgeOn, mx, my);

        if (fs.action === 'respawn') p.respawnTick = st.tick;
        const other = st.fighters[side === 0 ? 1 : 0];
        const close = Math.abs(other.x - fs.x) < 2.4 && Math.abs(other.y - fs.y) < 2.4;
        const startTag = fight.countdownMs <= 0 && st.tick < 120;
        const respawnTag = st.tick - p.respawnTick < 120 && st.tick >= p.respawnTick;
        const hlTag = picked && frame.now - p.hlAt < TAG_MS;
        const can = fs.action !== 'dead' && front && !offscreen && fight.mode === 'live' && busyHold <= 0 && phase === 'fight';
        const mode = !can ? '' : startTag || respawnTag || hlTag ? 'name' : close ? 'pointer' : '';
        if (mode !== p.tag.mode) {
          if (mode) {
            p.tag.label.style.display = mode === 'name' ? 'block' : 'none';
            if (!p.tag.mode) p.tag.alpha = 0;
          }
          p.tag.mode = mode;
        }
        if (!mode && (offscreen || fs.action === 'dead')) p.tag.alpha = 0;
        else p.tag.alpha += ((mode ? 1 : 0) - p.tag.alpha) * Math.min(1, dt * 16);
        if (bot.name !== p.tag.key) {
          p.tag.key = bot.name;
          p.tag.label.textContent = bot.name;
          p.tag.w = textW(bot.name, TAG_FONT) + 22;
        }
        const tw = p.tag.mode === 'name' ? p.tag.w : 18;
        tagPos[side * 2] = Math.max(16 + tw / 2, Math.min(1264 - tw / 2, sx));
        tagPos[side * 2 + 1] = Math.max(40, Math.min(536, sy));
      }

      // tags: never under the clock (slide beside it), never on top of each other
      const tw = (p: PlateUi) => (p.tag.mode === 'name' ? p.tag.w : 18);
      const [w0, w1] = [tw(plates[0]), tw(plates[1])];
      if (Math.abs(tagPos[0] - tagPos[2]) < (w0 + w1) / 2 + 4 && Math.abs(tagPos[1] - tagPos[3]) < 30) {
        const hi = tagPos[1] <= tagPos[3] ? 0 : 1;
        tagPos[hi * 2 + 1] = tagPos[(1 - hi) * 2 + 1] - 30;
      }
      for (const p of plates) {
        const i = p.side * 2;
        let tx = tagPos[i];
        const ty = Math.max(40, tagPos[i + 1]);
        const half = tw(p) / 2;
        if (showClock && ty - 40 < 66 && tx + half > 554 && tx - half < 726) tx = tx < 640 ? 554 - half : 726 + half;
        p.tag.root.style.transform = `translate3d(${tx.toFixed(1)}px, ${ty.toFixed(1)}px, 0)`;
        const a = p.tag.alpha;
        p.tag.root.style.opacity = (a < 0.02 ? 0 : a).toFixed(3);
      }
    },
    dispose() {
      for (const p of plates) {
        ctx.scene.remove(p.ring);
        p.ring.geometry.dispose();
        (p.ring.material as THREE.Material).dispose();
      }
      layer.remove();
    },
  };
};

export type { FighterState };

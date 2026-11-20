// The select screen: two AI models each choose one of four robots, blind.
//
// One short header, four bays (the robot itself, its name, three captioned stat bars), and a panel
// per side with the bot's name and its model label (nothing when the label is empty). A panel is an
// empty slot (dark, side-colour edge) while its bot thinks and fills with the side colour when it
// locks. The clock between the panels counts down to the reveal. At the reveal both picks flip
// together on a white hit: the chosen bays pop forward in the side colour with the bot's name
// across their top; the rest drop back and go dark. A mirror match puts both robots in one split
// bay.
// Clean-look pass (Nov 19): the explanatory sentence, the match plate, the records, the roles, the
// blurbs, the weight and grab bars, the cursors and hover tints, the face-down cards, the panel
// chips, the time bars, the VS mark, the hazard strip and every hatch, emblem and wear texture are
// gone.
// Owner's rule (Nov 19, 15:12): "Mirror match", "Thinking" and "Locked in" are gone (the split bay
// and the filled slot say them). Do not put them back.
// Everything is a function of phaseMs, so a viewer joining mid-phase lands on the right moment.

import * as THREE from 'three';
import type { CreateScreen, Frame, StageCtx, StageModule } from '../api.ts';
import type { Ctx, FighterCard } from '../../show/events.ts';
import { TIMING } from '../../show/events.ts';
import type { FighterId, Side } from '../../sim/types.ts';
import { FONTS, PALETTE, el } from '../style.ts';
import { ScreenSpace, makeRobot, placeRobot, type ScreenRobot, type CanvasPlate, clamp01, easeOutBack, easeOutCubic, span, hash01, poly, lerp } from './shared.ts';

const STATS: [keyof FighterCard['stats'], string][] = [
  ['power', 'Power'],
  ['speed', 'Speed'],
  ['reach', 'Reach'],
];

// ---- layout (UI px, 1280x720) ----
const BAY_Y = 92;
const BAY_W = 300;
const BAY_H = 430;
const BAY_GAP = 12;
const BAY_X0 = (1280 - (BAY_W * 4 + BAY_GAP * 3)) / 2;
const FLOOR = 256; // robot feet, bay-relative
const PX_PER_M = 104;
/** the bays lean: the top edge sits this far right of the bottom edge */
const SLANT = 30;
const lean = (y: number) => SLANT * (1 - y / BAY_H);
const TAG_H = 44;
const PANEL_Y = 572;
const PANEL_H = 128;
const PANEL_W = 452;
const INK = PALETTE.ink;
const POP = 1.1;
const DROP = 0.93;

const SIDE_COL = [PALETTE.red, PALETTE.cobalt];
const SIDE_MID = ['#9c1a13', '#1a3fae'];
const BAY_FILL = '#16212f';

type BayState = 'idle' | 'pick0' | 'pick1' | 'mirror';

interface Bay {
  id: FighterId;
  card: FighterCard;
  x: number;
  group: THREE.Group;
  plate: CanvasPlate;
  drawn: BayState | '';
  dom: HTMLElement;
  dim: HTMLElement;
  tags: [HTMLElement, HTMLElement];
  robot: ScreenRobot;
  colored: (ScreenRobot | null)[];
}

const ms2clock = (ms: number) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `0:${s < 10 ? '0' : ''}${s}`;
};

export const createScreen: CreateScreen = (ctx: StageCtx): StageModule => {
  const space = new ScreenSpace(ctx);
  const layer = el('div', ctx.ui, { position: 'absolute', inset: '0', display: 'none', pointerEvents: 'none', overflow: 'hidden' });

  // the full-screen backdrop (3D, under the robots): plain navy
  const back = space.plate(0, 0, 1280, 720);
  back.g.fillStyle = PALETTE.navy;
  back.g.fillRect(0, 0, 1280, 720);
  back.commit();

  let built = '';
  let bays: Bay[] = [];
  let dom: ReturnType<typeof buildChrome> | null = null;
  let panels: { group: THREE.Group; plate: CanvasPlate; lit: boolean | null; color: string }[] = [];
  let lockAt: [number, number] = [0, 0];
  let revealSeen = -1;
  let lastPhaseMs = -1;
  let shown = false;

  function teardown(): void {
    for (const b of bays) {
      b.robot.dispose();
      for (const r of b.colored) r?.dispose();
      b.group.removeFromParent();
      b.dom.remove();
    }
    for (const p of panels) p.group.removeFromParent();
    bays = [];
    panels = [];
    dom?.root.remove();
    dom = null;
    built = '';
  }

  function build(c: Ctx): void {
    teardown();
    dom = buildChrome(layer, c);
    panels = ([0, 1] as Side[]).map((side) => {
      const left = side === 0 ? 24 : 1280 - 24 - PANEL_W;
      const plate = space.plate(left - 4, PANEL_Y - 4, PANEL_W + 16, PANEL_H + 16);
      const color = c.bots[side].color || SIDE_COL[side];
      drawPanel(plate, side, color, false);
      return { group: plate.group, plate, lit: false, color };
    });
    bays = c.roster.slice(0, 4).map((card, i) => {
      const x = BAY_X0 + i * (BAY_W + BAY_GAP);
      const plate = space.plate(-BAY_W / 2, -BAY_H / 2, BAY_W, BAY_H, undefined, 1.5);
      const group = plate.group;
      group.position.set(x + BAY_W / 2, BAY_Y + BAY_H / 2, 0);
      const robot = makeRobot(ctx, group, card.id, 0, PALETTE.steelLight, false, 1);
      const bdom = buildBayDom(layer, card, x, c);
      return { id: card.id, card, x, group, plate, drawn: '' as const, ...bdom, robot, colored: [null, null, null] };
    });
    // each side locks at a deterministic moment between 55% and 85% of the way to the reveal
    const R = revealAtEstimate();
    for (const side of [0, 1] as Side[]) lockAt[side] = Math.min(R - 600, R * (0.55 + hash01(c.matchNo, side, 'lock') * 0.3));
    if (Math.abs(lockAt[0] - lockAt[1]) < 700) lockAt[1] = Math.min(R - 400, lockAt[0] + 900);
  }

  let lastDuration = 0;
  function revealAtEstimate(durationMs = 0): number {
    const d = durationMs || lastDuration || TIMING.select;
    return Math.round((d * TIMING.selectReveal) / TIMING.select);
  }

  function setBayState(b: Bay, st: BayState): void {
    if (b.drawn === st) return;
    b.drawn = st;
    drawBay(b.plate, st);
  }

  /** the robot in a side's livery: slot 0 red, 1 blue, 2 blue alt (the mirror) */
  function colored(b: Bay, slot: number): ScreenRobot {
    let r = b.colored[slot];
    if (!r) {
      const side: Side = slot === 0 ? 0 : 1;
      r = makeRobot(ctx, b.group, b.id, side, ctx.sideColors[side], slot === 2, side === 0 ? 1 : -1);
      r.holder.visible = false;
      b.colored[slot] = r;
    }
    return r;
  }
  /** build the coloured robots ahead of the reveal, one every few frames, so the hit never stalls */
  let warmFrame = 0;
  function warm(ms: number): void {
    if (ms < 1200 || ++warmFrame % 4 !== 0) return;
    for (const b of bays) {
      for (let slot = 0; slot < 3; slot++) {
        if (!b.colored[slot]) {
          colored(b, slot);
          return;
        }
      }
    }
  }

  return {
    update(frame: Frame) {
      const s = frame.show;
      const on = s.phase === 'select' && !!s.ctx;
      if (on !== shown) {
        shown = on;
        layer.style.display = on ? 'block' : 'none';
        space.setVisible(on);
        if (!on) {
          teardown();
          revealSeen = -1;
          lastPhaseMs = -1;
        }
      }
      if (!on) return;
      const c = s.ctx!;
      lastDuration = s.phaseDurationMs || TIMING.select;
      space.sync();
      const key = `${c.matchNo}|${c.roster.map((r) => r.id).join()}|${c.bots[0].id}|${c.bots[1].id}`;
      if (key !== built) {
        build(c);
        built = key;
      }
      const D = dom!;
      const ms = s.phaseMs;
      if (ms < lastPhaseMs - 1000) revealSeen = -1; // a new select phase
      lastPhaseMs = ms;
      warm(ms);

      // ---- the reveal time: the planned point, or when the picks really arrived ----
      const est = revealAtEstimate(s.phaseDurationMs);
      const picks = s.picksRevealed && c.picks ? c.picks : null;
      if (picks && revealSeen < 0) revealSeen = ms;
      let R = est;
      if (picks) {
        const d = revealSeen - est;
        R = d < -60 ? revealSeen : d > 600 ? est : d > 60 ? revealSeen : est;
      }
      const after = picks ? ms - R : -1; // ms since the reveal
      const revealed = !!picks && after >= 0;
      const mirror = !!picks && picks[0] === picks[1];

      // ---- entrance: header, bays, panels (first 900 ms) ----
      const hdr = easeOutCubic(span(ms, 0, 180));
      // the header leaves on the reveal: the chosen bays carry the bots' names up there
      const hdrOut = revealed ? easeOutCubic(span(after, 0, 120)) : 0;
      D.header.style.transform = `translateY(${((1 - hdr + hdrOut) * -90).toFixed(1)}px)`;
      const popK = revealed ? easeOutBack(span(after, 0, 200), 2.6) : 0;
      for (let i = 0; i < bays.length; i++) {
        const b = bays[i];
        const e = easeOutCubic(span(ms, 90 + i * 70, 240));
        const dy = (1 - e) * 640;
        const chosenBy: Side[] = picks ? ([0, 1] as Side[]).filter((sd) => picks[sd] === b.id) : [];
        const chosen = revealed && chosenBy.length > 0;
        let pop = 1;
        let inward = 0;
        let lift = 0;
        if (revealed) {
          pop = chosen ? lerp(1, POP, popK) : lerp(1, DROP, clamp01(after / 120));
          if (chosen) {
            inward = (i === 0 ? 20 : i === bays.length - 1 ? -20 : 0) * popK;
            lift = 4 * popK;
          } else lift = 14 * clamp01(after / 120);
        }
        const cx = b.x + BAY_W / 2 + inward;
        const cy = BAY_Y + BAY_H / 2 + dy + lift - ((pop - 1) * BAY_H) / 2;
        b.group.position.set(cx, cy, 0);
        b.group.scale.set(pop, pop, 1);
        b.plate.mesh.renderOrder = chosen ? 6000 + i * 4 : 5100 + i * 4;
        b.dom.style.transform = `translate(${inward.toFixed(1)}px, ${(dy + lift - ((pop - 1) * BAY_H) / 2).toFixed(1)}px) scale(${pop.toFixed(4)})`;
        b.dom.style.zIndex = chosen ? '3' : '1';

        // bay state and robots
        const st: BayState = !chosen ? 'idle' : mirror ? 'mirror' : chosenBy[0] === 0 ? 'pick0' : 'pick1';
        setBayState(b, st);
        const t = ms / 1000 + i * 1.7;
        const h = ctx.fighterDefs[b.id].height * PX_PER_M;
        const flash = revealed ? 1 - clamp01(after / 160) : 0;
        for (const r of b.colored) if (r) r.holder.visible = false;
        if (chosen) {
          b.robot.holder.visible = false;
          if (mirror) {
            const r0 = colored(b, 0);
            const r1 = colored(b, 2);
            r0.holder.visible = true;
            r1.holder.visible = true;
            placeRobot(r0, ctx, -BAY_W / 2 + BAY_W * 0.3, -BAY_H / 2 + FLOOR, h * 0.86);
            placeRobot(r1, ctx, -BAY_W / 2 + BAY_W * 0.7, -BAY_H / 2 + FLOOR, h * 0.86);
            r0.view.showPose('versus', after / 1000);
            r1.view.showPose('versus', after / 1000);
            r0.view.setFlash(flash, PALETTE.white);
            r1.view.setFlash(flash, PALETTE.white);
          } else {
            const r = colored(b, chosenBy[0]);
            r.holder.visible = true;
            placeRobot(r, ctx, 0, -BAY_H / 2 + FLOOR, h);
            r.view.showPose('versus', after / 1000);
            r.view.setFlash(flash, PALETTE.white);
          }
        } else {
          b.robot.holder.visible = true;
          placeRobot(b.robot, ctx, 0, -BAY_H / 2 + FLOOR, h);
          b.robot.view.showPose('select', t);
          b.robot.view.setFlash(0, PALETTE.white);
        }

        // the bays nobody chose drop back and go dark on the hit
        b.dim.style.opacity = revealed && !chosen ? (0.72 * clamp01(after / 50)).toFixed(3) : '0';
        // the bot's name across the top of the chosen bay
        for (const sd of [0, 1] as Side[]) {
          const tag = b.tags[sd];
          const show = chosen && chosenBy.includes(sd) && after > 40;
          tag.style.display = show ? 'block' : 'none';
          if (show) {
            const k = easeOutCubic(span(after, 40 + sd * 40, 120));
            const half = (BAY_W - SLANT) / 2;
            if (mirror) {
              tag.style.left = sd === 0 ? `${lean(0)}px` : `${lean(0) + half}px`;
              tag.style.width = `${half}px`;
              tag.style.fontSize = '27px';
            } else {
              tag.style.left = `${lean(0)}px`;
              tag.style.width = `${BAY_W - SLANT}px`;
              tag.style.fontSize = '34px';
            }
            tag.style.transform = `translateY(${((1 - k) * -TAG_H).toFixed(1)}px)`;
          }
        }
      }

      // ---- panels: name and model; an empty slot until the bot locks, then filled ----
      for (const side of [0, 1] as Side[]) {
        const P = D.panels[side];
        const pn = panels[side];
        const e = easeOutCubic(span(ms, 300 + side * 80, 260));
        const slide = (1 - e) * (side === 0 ? -540 : 540);
        const locked = ms >= lockAt[side] || !!picks;
        if (locked !== pn.lit) {
          pn.lit = locked;
          drawPanel(pn.plate, side, pn.color, locked);
        }
        // the lock lands with a small pop of the whole panel
        const lk = locked && !picks ? span(ms, lockAt[side], 140) : 1;
        const pop = lk < 1 ? 1.06 - 0.06 * easeOutCubic(lk) : 1;
        P.root.style.transform = `translateX(${slide}px) scale(${pop.toFixed(4)})`;
        pn.group.position.x = (side === 0 ? 24 : 1280 - 24 - PANEL_W) - 4 + (PANEL_W + 16) / 2 + slide;
        pn.group.scale.set(pop, pop, 1);
      }

      // ---- centre: time to the reveal ----
      const ce = easeOutCubic(span(ms, 420, 220));
      D.clock.style.transform = `translateY(${((1 - ce) * 200).toFixed(1)}px)`;
      D.clock.style.display = revealed ? 'none' : 'block';
      const left = R - ms;
      if (!revealed) {
        const clk = ms2clock(Math.max(0, left));
        if (D.clockNum.textContent !== clk) D.clockNum.textContent = clk;
        // the last three seconds: the numerals kick on each second
        const pulse = left < 3200 && left > 0 ? 1 + 0.18 * (1 - clamp01(((3200 - left) % 1000) / 160)) : 1;
        D.clockNum.style.transform = `scale(${pulse.toFixed(3)})`;
        D.clockNum.style.color = left < 3200 ? PALETTE.hazard : PALETTE.white;
      }

      // ---- the reveal hit: two white frames, then straight back to full contrast ----
      const fl = revealed && after < 30 ? 1 : 0;
      D.flash.style.opacity = String(fl);
      D.flash.style.display = fl > 0 ? 'block' : 'none';
      // a kick of the whole screen on the hit
      const kick = revealed && after < 220 ? Math.sin(after * 0.09) * 9 * (1 - after / 220) : 0;
      layer.style.transform = kick ? `translate(${kick.toFixed(1)}px, ${(-kick * 0.5).toFixed(1)}px)` : '';
      space.px.position.x += kick * space.px.scale.x;
      space.px.position.y -= kick * 0.5 * space.px.scale.x;
    },
    dispose() {
      teardown();
      space.dispose();
      layer.remove();
    },
  };
};

// ------------------------------------------------------------------------------------------------
// DOM

function buildChrome(layer: HTMLElement, c: Ctx) {
  const root = el('div', layer, { position: 'absolute', inset: '0' });
  // the header: what is happening, in two words
  const header = el('div', root, {
    position: 'absolute', left: '0', right: '0', top: '20px', textAlign: 'center',
    fontFamily: FONTS.display, fontWeight: '900', fontSize: '50px', lineHeight: '56px', color: PALETTE.white,
    textTransform: 'uppercase', letterSpacing: '1px', textShadow: `3px 3px 0 ${INK}`,
  }, 'Blind pick');

  const panels = ([0, 1] as Side[]).map((side) => buildPanel(root, c, side));

  // centre: the clock to the reveal
  const clock = el('div', root, {
    position: 'absolute', left: `${24 + PANEL_W}px`, right: `${24 + PANEL_W}px`, top: `${PANEL_Y}px`, height: `${PANEL_H}px`,
  });
  const clockNum = el('div', clock, {
    position: 'absolute', left: '0', right: '0', top: '10px', textAlign: 'center', fontFamily: FONTS.display, fontWeight: '900',
    fontSize: '96px', lineHeight: '104px', color: PALETTE.white, fontStyle: 'italic', transformOrigin: '50% 60%', textShadow: `4px 4px 0 ${INK}`,
  }, '0:16');

  const flash = el('div', root, { position: 'absolute', inset: '-20px', background: PALETTE.white, display: 'none', zIndex: '9' });
  return { root, header, panels, clock, clockNum, flash };
}

function buildPanel(root: HTMLElement, c: Ctx, side: Side) {
  const bot = c.bots[side];
  const left = side === 0 ? 24 : 1280 - 24 - PANEL_W;
  // the plate itself is 3D (drawPanel); this holds the type
  const P = el('div', root, { position: 'absolute', left: `${left}px`, top: `${PANEL_Y}px`, width: `${PANEL_W}px`, height: `${PANEL_H}px` });
  const txtSide = side === 0 ? { left: '28px' } : { right: '28px', textAlign: 'right' as const };
  // no model label: the name sits in the middle of the panel, with no hole under it
  el('div', P, {
    position: 'absolute', top: bot.modelLabel ? '6px' : `${(PANEL_H - 68) / 2}px`, ...txtSide, fontFamily: FONTS.display, fontWeight: '900', fontSize: '62px', lineHeight: '68px',
    color: PALETTE.white, textShadow: `4px 4px 0 ${INK}`, textTransform: 'uppercase', whiteSpace: 'nowrap', maxWidth: '390px', overflow: 'hidden',
  }, bot.name);
  if (bot.modelLabel) {
    el('div', P, {
      position: 'absolute', top: '78px', ...txtSide, fontFamily: FONTS.text, fontWeight: '700', fontSize: '22px', lineHeight: '28px',
      color: PALETTE.white, whiteSpace: 'nowrap',
    }, bot.modelLabel);
  }
  return { root: P };
}

function buildBayDom(layer: HTMLElement, card: FighterCard, x: number, c: Ctx) {
  const dom = el('div', layer, {
    position: 'absolute', left: `${x}px`, top: `${BAY_Y}px`, width: `${BAY_W}px`, height: `${BAY_H}px`, transformOrigin: '50% 50%',
    willChange: 'transform',
  });
  el('div', dom, {
    position: 'absolute', left: `${14 + lean(FLOOR + 30)}px`, top: `${FLOOR + 8}px`, fontFamily: FONTS.display, fontWeight: '900', fontSize: '64px',
    lineHeight: '62px', color: PALETTE.white, textShadow: `4px 4px 0 ${INK}`, textTransform: 'uppercase', fontStyle: 'italic',
  }, card.name);
  const stats = el('div', dom, { position: 'absolute', left: `${18 + lean(FLOOR + 120)}px`, top: `${FLOOR + 84}px`, width: `${BAY_W - 40}px` });
  for (const [k, label] of STATS) {
    const row = el('div', stats, { display: 'flex', alignItems: 'center', height: '24px' });
    el('div', row, { width: '72px', fontFamily: FONTS.text, fontWeight: '700', fontSize: '18px', color: '#dbe4ee', lineHeight: '24px' }, label);
    const v = Math.max(0, Math.min(5, Math.round(card.stats[k])));
    for (let n = 1; n <= 5; n++) {
      el('div', row, {
        width: '32px', height: '12px', marginRight: '4px', transform: 'skewX(-18deg)',
        background: n <= v ? PALETTE.white : 'rgba(5,9,15,0.75)',
      });
    }
  }
  // the bot's name across the top of the bay once it is chosen
  const tags = ([0, 1] as Side[]).map((side) => {
    const wrap = el('div', dom, {
      position: 'absolute', left: `${lean(0)}px`, top: '0', width: `${BAY_W - SLANT}px`, height: `${TAG_H}px`, overflow: 'hidden',
      display: 'none', zIndex: '4', fontSize: '34px',
    });
    el('div', wrap, {
      position: 'absolute', inset: '0', background: c.bots[side].color || SIDE_COL[side], textAlign: 'center',
      fontFamily: FONTS.display, fontWeight: '900', fontSize: 'inherit', lineHeight: `${TAG_H}px`, color: PALETTE.white,
      textTransform: 'uppercase', textShadow: `3px 3px 0 ${INK}`, whiteSpace: 'nowrap',
    }, c.bots[side].name);
    return wrap;
  }) as unknown as [HTMLElement, HTMLElement];
  const dim = el('div', dom, {
    position: 'absolute', inset: '0', background: PALETTE.ink, opacity: '0', zIndex: '5',
    clipPath: `polygon(${SLANT}px 0, 100% 0, calc(100% - ${SLANT}px) 100%, 0 100%)`,
  });
  return { dom, tags, dim };
}

// ------------------------------------------------------------------------------------------------
// Canvas plates (3D, under the robots)

function drawBay(p: CanvasPlate, st: BayState): void {
  const g = p.g;
  const w = BAY_W;
  const h = BAY_H;
  g.clearRect(0, 0, w, h);
  // one leaning plate: steel at rest, the chooser's colour once picked
  const shape: [number, number][] = [[SLANT, 0], [w, 0], [w - SLANT, h], [0, h]];
  g.save();
  poly(g, shape);
  g.clip();
  g.fillStyle = st === 'pick0' ? SIDE_MID[0] : st === 'pick1' ? SIDE_MID[1] : BAY_FILL;
  g.fillRect(0, 0, w, h);
  if (st === 'mirror') {
    poly(g, [[0, 0], [w * 0.5 + SLANT / 2, 0], [w * 0.5 - SLANT / 2, h], [0, h]]);
    g.fillStyle = SIDE_MID[0];
    g.fill();
    poly(g, [[w * 0.5 + SLANT / 2, 0], [w, 0], [w, h], [w * 0.5 - SLANT / 2, h]]);
    g.fillStyle = SIDE_MID[1];
    g.fill();
  }
  g.restore();
  if (st !== 'idle') {
    poly(g, shape);
    g.lineWidth = 8;
    g.strokeStyle = PALETTE.white;
    g.stroke();
  }
  p.commit();
}

/** the panel: an empty slot (dark fill, side-colour edge) until the bot locks, then filled */
function drawPanel(p: CanvasPlate, side: Side, color: string, lit: boolean): void {
  const g = p.g;
  const W = PANEL_W;
  const H = PANEL_H;
  const clip: [number, number][] = side === 0 ? [[0, 0], [W, 0], [W - 26, H], [0, H]] : [[0, 0], [W, 0], [W, H], [26, H]];
  g.clearRect(0, 0, p.canvas.width, p.canvas.height);
  g.save();
  g.translate(4, 4);
  g.save();
  g.translate(6, 6);
  poly(g, clip);
  g.fillStyle = INK;
  g.fill();
  g.restore();
  poly(g, clip);
  g.fillStyle = lit ? color : BAY_FILL;
  g.fill();
  if (!lit) {
    g.save();
    poly(g, clip);
    g.clip();
    poly(g, clip);
    g.lineWidth = 10;
    g.strokeStyle = color;
    g.stroke();
    g.restore();
  }
  g.restore();
  p.commit();
}

// The versus screen: the two chosen robots face each other across a hard diagonal split in their
// side colours, framed as big three-quarter busts in their signature poses.
//
// Beats (ms from the phase start): a white cut, both halves slam in together with the robots as
// black silhouettes on flat colour fields, a white hit at FLASH and the robots come up in full
// colour, the names slam in, the mark hits at MARK. The last moments cut out hard: the halves fly
// apart onto the arena.
// On screen: the two robots, each bot's name and model label (top, nothing when the label is
// empty), each robot's name (bottom corner), and the one mark between them.
// Clean-look pass (Nov 19): role tags, records, the name bands and their stripes, the eye glints,
// the emblems, light shafts, seam stripes, speed lines, wear, the mirror tag, the taunt plates'
// wedges and strips, and the mark's wedges and inner outline are gone.
// Owner's rule (Nov 19, 15:12): the taunt lines are gone; the stage ignores the taunt event. Do not
// put them back.
// Everything is a function of phaseMs, so a joiner lands right.

import type { CreateScreen, Frame, StageCtx, StageModule } from '../api.ts';
import type { Ctx } from '../../show/events.ts';
import type { FighterId, Side } from '../../sim/types.ts';
import * as THREE from 'three';
import { FONTS, PALETTE, el } from '../style.ts';
import {
  ScreenSpace, makeRobot, type ScreenRobot, type CanvasPlate,
  clamp01, easeInCubic, easeOutBack, easeOutCubic, span, poly, lerp, buildMark, bustFrame,
} from './shared.ts';

const INK = PALETTE.ink;
const SIDE_FIELD = ['#a81a14', '#1a41b4'];
/** the seam: x at the top and at the bottom of the frame */
const SEAM_TOP = 752;
const SEAM_BOT = 528;
const seamX = (y: number) => SEAM_TOP + (SEAM_BOT - SEAM_TOP) * (y / 720);
/** bust framing: the head point lands here, and sits this many px above the feet */
const HEAD_X = [318, 962];
const HEAD_Y = 272;
const HEAD_ABOVE_FEET = 680;
const MAX_W = 600;
/** robots are flattened along the view axis so a frame-filling bust keeps its proportions */
const FLAT = 0.34;

// beats (ms from the phase start)
const SLAM = 150;
const IN1 = 0;
const FLASH = 820;
const NAMES = FLASH + 40;
const MARK = 1120;

interface Half {
  group: THREE.Group;
  plate: CanvasPlate;
  robot: ScreenRobot | null;
  robotKey: string;
  robotX: number;
  robotY: number;
  robotK: number;
  dom: HTMLElement;
  top: HTMLElement;
  fighterBox: HTMLElement;
  fighter: HTMLElement;
  name: HTMLElement;
  model: HTMLElement;
  drawn: string;
}

export const createScreen: CreateScreen = (ctx: StageCtx): StageModule => {
  const space = new ScreenSpace(ctx);
  const layer = el('div', ctx.ui, { position: 'absolute', inset: '0', display: 'none', pointerEvents: 'none', overflow: 'hidden' });
  const back = space.plate(0, 0, 1280, 720);
  back.g.fillStyle = INK;
  back.g.fillRect(0, 0, 1280, 720);
  back.commit();

  const halves: Half[] = ([0, 1] as Side[]).map((side) => buildHalf(space, layer, side));
  const mark = buildMark(layer);
  mark.root.style.zIndex = '6';
  const flash = el('div', layer, { position: 'absolute', inset: '-20px', background: PALETTE.white, display: 'none', zIndex: '9' });

  let shown = false;
  let ctxKey = '';
  const head = new THREE.Vector3();
  const ui = { x: 0, y: 0 };

  /** frame a robot as a bust: head point at (HEAD_X, HEAD_Y), as big as its half allows */
  function frameRobot(h: Half, side: Side): void {
    const f = bustFrame(h.robot!, space.root, 'versus', HEAD_X[side], HEAD_Y, HEAD_ABOVE_FEET, MAX_W, FLAT);
    h.robotK = f.k;
    h.robotX = f.x;
    h.robotY = f.y;
  }

  function setup(c: Ctx): void {
    space.root.updateMatrixWorld(true);
    for (const side of [0, 1] as Side[]) {
      const h = halves[side];
      const bot = c.bots[side];
      const pick = c.picks?.[side];
      const card = pick ? c.roster.find((r) => r.id === pick) : undefined;
      h.fighter.textContent = card?.name ?? pick ?? '';
      h.name.textContent = bot.name;
      h.model.textContent = bot.modelLabel;
      h.model.style.display = bot.modelLabel ? '' : 'none';
      if (h.drawn !== 'drawn') {
        drawHalf(h.plate, side);
        h.drawn = 'drawn';
      }
      const key = pick ? `${pick}|${c.picks![0] === c.picks![1]}` : '';
      if (key !== h.robotKey) {
        h.robot?.dispose();
        h.robot = null;
        h.robotKey = key;
        if (pick) {
          const mirror = c.picks![0] === c.picks![1];
          h.robot = makeRobot(ctx, h.group, pick as FighterId, side, ctx.sideColors[side], side === 1 && mirror, side === 0 ? 1 : -1);
          frameRobot(h, side);
        }
      }
    }
  }

  function teardown(): void {
    for (const h of halves) {
      h.robot?.dispose();
      h.robot = null;
      h.robotKey = '';
    }
    ctxKey = '';
  }

  return {
    update(frame: Frame) {
      const s = frame.show;
      const on = s.phase === 'versus' && !!s.ctx;
      if (on !== shown) {
        shown = on;
        layer.style.display = on ? 'block' : 'none';
        space.setVisible(on);
        if (!on) teardown();
      }
      if (!on) return;
      const c = s.ctx!;
      space.sync();
      const key = `${c.matchNo}|${c.bots[0].id}|${c.bots[1].id}|${c.picks?.join() ?? ''}`;
      if (key !== ctxKey) {
        setup(c);
        ctxKey = key;
      }
      const ms = s.phaseMs;
      const dur = s.phaseDurationMs || 16000;

      // exit: hold, the mark burns white, then the halves fly apart onto the arena
      const exitT0 = dur - 230;
      const out = easeInCubic(span(ms, exitT0 + 17, 150));
      const gone = ms >= exitT0 + 167;
      back.setOpacity(ms >= exitT0 + 20 ? 0 : 1);

      // white: the cut in, the colour hit, a touch on the mark, the cut out
      let fl = 0;
      if (ms < 34) fl = 1;
      const sf = ms - FLASH;
      if (sf >= 0) fl = Math.max(fl, sf < 34 ? 1 : sf < 50 ? 0.6 : sf < 67 ? 0.25 : 0);
      const sm = ms - MARK;
      if (sm >= 0 && sm < 17) fl = Math.max(fl, 0.25);
      const sinceExit = ms - exitT0;
      if (sinceExit >= 0 && sinceExit < 20) fl = Math.max(fl, 0.9);
      flash.style.opacity = String(fl);
      flash.style.display = fl > 0 ? 'block' : 'none';
      const kick = sm >= 0 && sm < 260 ? Math.sin(sm * 0.08) * 12 * (1 - sm / 260) : 0;
      const colour = ms >= FLASH + 34;

      for (const side of [0, 1] as Side[]) {
        const h = halves[side];
        const dir = side === 0 ? -1 : 1;
        const t0 = side === 0 ? 0 : IN1;
        const inK = easeOutBack(span(ms, t0, SLAM), 1.0);
        let dx = (1 - inK) * 900 * dir;
        dx += out * 1000 * dir;
        const kx = kick * (side === 0 ? -1 : 1);
        const dy = kick * (side === 0 ? 1 : -1) * 0.5;
        h.group.position.set(dx + kx, dy, 0);
        h.group.visible = !gone;
        h.dom.style.transform = `translate(${(dx + kx).toFixed(1)}px, ${dy.toFixed(1)}px)`;
        h.dom.style.display = h.group.visible ? 'block' : 'none';

        // the robot: a slow push in; a black silhouette until the hit, then colour up from white
        if (h.robot) {
          const push = 1 + 0.045 * easeOutCubic(span(ms, 0, dur));
          const k = h.robotK * push;
          const hx = HEAD_X[side];
          h.robot.holder.position.set(hx + (h.robotX - hx) * push, HEAD_Y + (h.robotY - HEAD_Y) * push, 0);
          h.robot.holder.scale.set(k, k, k * FLAT);
          // the pose builds from the colour hit, so the silhouette already stands in it
          h.robot.view.showPose('versus', colour ? 0.5 + (ms - FLASH) / 1000 : 0.5 + ms / 4000);
          if (!colour) h.robot.view.setFlash(1, '#020407');
          else h.robot.view.setFlash(1 - clamp01((ms - FLASH - 34) / 140), PALETTE.white);
        }
        // type: the bot's name drops in with the halves, the fighter name slams at the colour hit
        const nk = easeOutCubic(span(ms, t0 + 60, 140));
        h.top.style.transform = `translateY(${((1 - nk) * -130).toFixed(1)}px)`;
        const fk = easeOutCubic(span(ms, NAMES + side * 60, 110));
        h.fighterBox.style.transform = `translateX(${((1 - fk) * 260 * dir).toFixed(1)}px)`;
        h.fighterBox.style.opacity = fk > 0 ? '1' : '0';
      }

      // the mark: slams down from big, breathes, kicks once before the cut
      const mk = span(ms, MARK, 110);
      const mScale = ms < MARK ? 0 : lerp(3.0, 1, easeOutCubic(mk)) * (1 - out);
      const kickT = ms - (dur - 900);
      const breathe = (ms > MARK + 400 ? 1 + 0.015 * Math.sin((ms - MARK) / 380) : 1) + (kickT >= 0 && kickT < 220 ? 0.2 * (1 - kickT / 220) : 0);
      const my = 380;
      mark.root.style.transform = `translate(${seamX(my).toFixed(1)}px, ${my}px) scale(${(mScale * breathe).toFixed(3)})`;
      mark.root.style.display = mScale > 0.01 && !gone ? 'block' : 'none';
    },
    dispose() {
      teardown();
      for (const h of halves) h.dom.remove();
      space.dispose();
      layer.remove();
    },
  };
};

// ------------------------------------------------------------------------------------------------

function buildHalf(space: ScreenSpace, layer: HTMLElement, side: Side): Half {
  const group = new THREE.Group();
  space.px.add(group);
  const plate = space.plate(0, 0, 1280, 720, group);
  const dom = el('div', layer, { position: 'absolute', inset: '0', willChange: 'transform', zIndex: side === 0 ? '2' : '3' });

  // top: the bot's name and its model label, straight on the colour field
  const top = el('div', dom, { position: 'absolute', inset: '0', willChange: 'transform' });
  const row = el('div', top, {
    position: 'absolute', top: '22px', display: 'flex', alignItems: 'baseline', gap: '18px', whiteSpace: 'nowrap',
    ...(side === 0 ? { left: '30px' } : { right: '30px', flexDirection: 'row-reverse' }),
  });
  const name = el('div', row, {
    fontFamily: FONTS.display, fontWeight: '900', fontSize: '92px', lineHeight: '96px', color: PALETTE.white,
    textTransform: 'uppercase', fontStyle: 'italic', letterSpacing: '-1px', textShadow: `5px 5px 0 ${INK}`,
  });
  const model = el('div', row, {
    color: PALETTE.white, fontFamily: FONTS.text, fontWeight: '700', fontSize: '26px', lineHeight: '32px', textShadow: `2px 2px 0 ${INK}`,
  });

  // the fighter: its name huge in the outer bottom corner
  const fighterBox = el('div', dom, {
    position: 'absolute', bottom: '22px', willChange: 'transform', zIndex: '2',
    ...(side === 0 ? { left: '28px' } : { right: '28px', textAlign: 'right' as const }),
  });
  const fighter = el('div', fighterBox, {
    fontFamily: FONTS.display, fontWeight: '900', fontSize: '150px', lineHeight: '132px', color: PALETTE.white,
    textShadow: `7px 7px 0 ${INK}`, textTransform: 'uppercase', fontStyle: 'italic', letterSpacing: '-2px',
    WebkitTextStroke: `3px ${INK}`,
  } as Partial<CSSStyleDeclaration>);

  return {
    group, plate, robot: null, robotKey: '', robotX: 0, robotY: 0, robotK: 1, dom, top, fighterBox, fighter, name, model,
    drawn: '',
  };
}

/** a half: one flat side-colour field cut by the seam */
function drawHalf(p: CanvasPlate, side: Side): void {
  const g = p.g;
  g.clearRect(0, 0, 1280, 720);
  const shape: [number, number][] = side === 0
    ? [[0, 0], [SEAM_TOP, 0], [SEAM_BOT, 720], [0, 720]]
    : [[SEAM_TOP, 0], [1280, 0], [1280, 720], [SEAM_BOT, 720]];
  poly(g, shape);
  g.fillStyle = SIDE_FIELD[side];
  g.fill();
  p.commit();
}

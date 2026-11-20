// Pose inspection page: the pose engine on the stand-in, judged by eye.
//   ?id=kiln|tick|gantry|vise  &mode=line|mass
//   &sheet=actions            one cell per action, labelled
//   &sheet=moves [&part=1..3] each move as 7 frames over startup / active / recovery, active
//                             hitboxes drawn faintly, the prop tip or hand marked on strike frames
//   &strip=<moveId|action>&n=12   n evenly spaced frames across one move or action, large
// Labels are fine here: an inspection page, not the game.
import type { FighterState, MoveId, Action, FighterId } from '../src/sim/types.ts';
import { MOVE_IDS } from '../src/sim/types.ts';
import { FIGHTERS } from '../src/sim/fighters.ts';
import { LEDGE_X } from '../src/sim/arena.ts';
import type { CharacterDef, FigureExtra, Joints } from '../src/ink/api.ts';
import { makeInk, BG, INK, TINTS, type InkMode, type Pt } from '../src/ink/pen.ts';
import { pose, moveAnimOf } from '../src/ink/pose.ts';
import { CAST, overrideCast } from '../src/ink/cast/index.ts';

const q = new URLSearchParams(location.search);
overrideCast(q.get('cast'));
const id = (q.get('id') || 'kiln') as FighterId;
const other = (q.get('other') || id) as FighterId;
const mode = (q.get('mode') || 'line') as InkMode;
const sheet = q.get('sheet') || (q.get('strip') ? '' : 'actions');
const strip = q.get('strip') || '';
const def = FIGHTERS[id];
const ch: CharacterDef = CAST[id];
const T0 = 1.3; // a fixed show time so captures repeat

const cv = document.getElementById('c') as HTMLCanvasElement;
const W = innerWidth, H = innerHeight, dpr = devicePixelRatio || 1;
cv.width = W * dpr; cv.height = H * dpr;
const g = cv.getContext('2d')!;
g.scale(dpr, dpr);
g.fillStyle = BG; g.fillRect(0, 0, W, H);

function mk(o: Partial<FighterState> = {}, fid: FighterId = id): FighterState {
  return {
    fighter: fid, x: 0, y: 0, vx: 0, vy: 0, facing: 1, action: 'idle', actionFrame: 1, move: null, charge: 0, grounded: true,
    platform: -1, ledge: -1, damage: 0, lives: 3, shield: 100, hitlag: 0, hitstun: 0, tumble: false, kbx: 0, kby: 0, invuln: 0,
    armor: false, airJumpsLeft: FIGHTERS[fid].airJumps, fastFall: false, ...o,
  };
}

function extraFor(s: FighterState): FigureExtra {
  let moveT = 0, movePart: FigureExtra['movePart'] = null;
  if (s.move && (s.action === 'attack')) {
    const m = FIGHTERS[s.fighter].moves[s.move];
    const tot = m.startup + m.active + m.recovery;
    moveT = Math.min(1, s.actionFrame / tot);
    movePart = s.actionFrame <= m.startup ? 'startup' : s.actionFrame <= m.startup + m.active ? 'active' : 'recovery';
  }
  return { t: T0, state: s, moveT, movePart, sideTint: s.fighter === id ? 'coral' : 'blue', drag: s.vx * 60 * 100, armor: s.armor ? 1 : 0 };
}

/** local units -> page px, with the spin about the hip and the facing */
function toPx(J: Joints, p: Pt, px: number, py: number, sc: number, facing: number): Pt {
  let lx = p[0], ly = p[1];
  if (J.spin) {
    const c = Math.cos(J.spin), sn = Math.sin(J.spin);
    const dx = lx - J.hip[0], dy = ly - J.hip[1];
    lx = J.hip[0] + dx * c - dy * sn; ly = J.hip[1] + dx * sn + dy * c;
  }
  return [px + lx * sc * facing, py + ly * sc];
}

function draw(s: FighterState, o: FighterState, c: CharacterDef, px: number, py: number, sc: number): Joints {
  const J = pose(s, s, 1, o, FIGHTERS[s.fighter], c, T0, 1 / 60);
  g.save();
  g.translate(px, py);
  g.scale(s.facing * sc, sc);
  if (J.spin) { g.translate(J.hip[0], J.hip[1]); g.rotate(J.spin); g.translate(-J.hip[0], -J.hip[1]); }
  c.draw(makeInk(g, mode), J, extraFor(s));
  g.restore();
  return J;
}

function label(text: string, x: number, y: number, size = 13, color = '#8d8a84', align: CanvasTextAlign = 'center'): void {
  g.font = `${size}px ui-monospace, Menlo, monospace`;
  g.fillStyle = color; g.textAlign = align; g.fillText(text, x, y);
}
function floor(x0: number, x1: number, y: number, dashed = false): void {
  g.strokeStyle = 'rgba(230,228,222,0.25)'; g.lineWidth = 1;
  g.setLineDash(dashed ? [4, 5] : []);
  g.beginPath(); g.moveTo(x0, y); g.lineTo(x1, y); g.stroke();
  g.setLineDash([]);
}

/** faint hitbox circles active on this move frame, and a mark on the strike point */
function hitboxes(s: FighterState, J: Joints, px: number, py: number, sc: number): void {
  if (!s.move) return;
  const md = FIGHTERS[s.fighter].moves[s.move];
  const fr = s.actionFrame;
  let any = false;
  for (const h of md.hitboxes) {
    if (fr < h.from || fr > h.to) continue;
    any = true;
    g.strokeStyle = 'rgba(196,96,74,0.85)'; g.fillStyle = 'rgba(196,96,74,0.10)'; g.lineWidth = 1.2;
    g.beginPath(); g.arc(px + h.x * 100 * sc * s.facing, py - h.y * 100 * sc, h.r * 100 * sc, 0, Math.PI * 2); g.fill(); g.stroke();
  }
  if (md.projectile && fr === md.projectile.frame) {
    const d = FIGHTERS[s.fighter];
    const sx = px + (d.width * 0.5 + 0.4) * 100 * sc * s.facing, sy = py - d.height * 62 * sc;
    g.strokeStyle = 'rgba(197,165,89,0.9)'; g.lineWidth = 1.5;
    g.beginPath(); g.arc(sx, sy, md.projectile.r * 100 * sc, 0, Math.PI * 2); g.stroke();
    any = true;
  }
  if (!any) return;
  // the strike points: hand, prop tip, feet
  const b = ch.build;
  const pts: Pt[] = [J.handF, J.handB, J.footF, J.footB];
  if (b.propLen > 0) pts.push([J.handF[0] + Math.cos(J.prop) * b.propLen, J.handF[1] + Math.sin(J.prop) * b.propLen]);
  g.fillStyle = TINTS.yellow;
  for (const p of pts) { const q2 = toPx(J, p, px, py, sc, s.facing); g.beginPath(); g.arc(q2[0], q2[1], 2.4, 0, Math.PI * 2); g.fill(); }
}

// ---- actions ----

interface Cell { name: string; s: FighterState; o?: FighterState; ledge?: boolean; pair?: boolean }

function heldPair(f: number, move: MoveId | null, act: Action = 'holding'): Cell[] {
  const gap = (FIGHTERS[id].width * 0.5 + FIGHTERS[other].width * 0.5 + 0.05);
  const h = mk({ action: act, actionFrame: f, move });
  const t = mk({ action: 'held', actionFrame: f, x: gap, facing: -1 }, other);
  return [{ name: move ? `${move} ${f}` : `holding ${f}`, s: h, o: t, pair: true }];
}

function ledgeState(u: number, f: number): FighterState {
  const lx = LEDGE_X[1], o = 1;
  const x = lx + o * (def.width * 0.5 + 0.1) * (1 - u) - o * 0.55 * u;
  return mk({ action: u <= 0 ? 'ledgehang' : 'ledgeclimb', actionFrame: f, ledge: 1, x, y: -def.height * 0.85 * (1 - u), facing: -1, grounded: false });
}

function actionCells(): Cell[] {
  const air = { grounded: false, platform: -2 };
  const L: Cell[] = [
    { name: 'entrance 6', s: mk({ action: 'entrance', actionFrame: 6 }) },
    { name: 'entrance 14', s: mk({ action: 'entrance', actionFrame: 14 }) },
    { name: 'idle', s: mk({ action: 'idle', actionFrame: 40 }) },
    { name: 'walk a', s: mk({ action: 'walk', actionFrame: 20, x: 0.1, vx: 0.08 }) },
    { name: 'walk b', s: mk({ action: 'walk', actionFrame: 20, x: 0.55, vx: 0.08 }) },
    { name: 'run a', s: mk({ action: 'run', actionFrame: 20, x: 0.2, vx: 0.18 }) },
    { name: 'run b', s: mk({ action: 'run', actionFrame: 20, x: 0.9, vx: 0.18 }) },
    { name: 'run start', s: mk({ action: 'run', actionFrame: 3, x: 0.0, vx: 0.08 }) },
    { name: 'skid', s: mk({ action: 'skid', actionFrame: 4, vx: 0.1 }) },
    { name: 'turn', s: mk({ action: 'turn', actionFrame: 3 }) },
    { name: 'jumpsquat', s: mk({ action: 'jumpsquat', actionFrame: def.jumpsquat }) },
    { name: 'rise', s: mk({ action: 'rise', actionFrame: 4, vy: def.jumpSpeed * 0.8, ...air }) },
    { name: 'air jump flip', s: mk({ action: 'rise', actionFrame: 7, vy: 0.2, airJumpsLeft: 0, ...air }) },
    { name: 'fall', s: mk({ action: 'fall', actionFrame: 14, vy: -def.fallSpeed, ...air }) },
    { name: 'fast fall', s: mk({ action: 'fall', actionFrame: 14, vy: -def.fastFallSpeed, fastFall: true, ...air }) },
    { name: 'land 2', s: mk({ action: 'land', actionFrame: 2 }) },
    { name: 'charge smash', s: mk({ action: 'charge', actionFrame: 30, move: 'smash', charge: 30 }) },
    { name: 'shield', s: mk({ action: 'shield', actionFrame: 20 }) },
    { name: 'shieldstun', s: mk({ action: 'shieldstun', actionFrame: 2 }) },
    { name: 'shieldbreak', s: mk({ action: 'shieldbreak', actionFrame: 40 }) },
    { name: 'roll 10', s: mk({ action: 'roll', actionFrame: 10, vx: 0.11 }) },
    { name: 'spotdodge', s: mk({ action: 'spotdodge', actionFrame: 6 }) },
    { name: 'airdodge', s: mk({ action: 'airdodge', actionFrame: 8, ...air }) },
    { name: 'flinch (hitlag)', s: mk({ action: 'hitstun', actionFrame: 1, hitlag: 5, hitstun: 12, kbx: -0.1, kby: 0.03 }) },
    { name: 'flinch 4', s: mk({ action: 'hitstun', actionFrame: 4, hitstun: 10, kbx: -0.1, kby: 0.03 }) },
    { name: 'tumble 6', s: mk({ action: 'hitstun', actionFrame: 6, tumble: true, hitstun: 30, kbx: -0.25, kby: 0.18, vx: -0.22, vy: 0.15, ...air }) },
    { name: 'tumble 14', s: mk({ action: 'hitstun', actionFrame: 14, tumble: true, hitstun: 30, kbx: -0.25, kby: 0.18, vx: -0.18, vy: 0.05, ...air }) },
    { name: 'knockdown', s: mk({ action: 'knockdown', actionFrame: 20 }) },
    { name: 'getup 10', s: mk({ action: 'getup', actionFrame: 10 }) },
    { name: 'getup 18', s: mk({ action: 'getup', actionFrame: 18 }) },
    { name: 'ledgehang', s: ledgeState(0, 30), ledge: true },
    { name: 'ledgeclimb .3', s: ledgeState(0.3, 6), ledge: true },
    { name: 'ledgeclimb .6', s: ledgeState(0.6, 12), ledge: true },
    { name: 'ledgeclimb .9', s: ledgeState(0.9, 20), ledge: true },
    { name: 'helpless', s: mk({ action: 'helpless', actionFrame: 20, vy: -0.1, ...air }) },
    { name: 'respawn', s: mk({ action: 'respawn', actionFrame: 30, ...air }) },
    { name: 'win', s: mk({ action: 'win', actionFrame: 40 }) },
    { name: 'lose', s: mk({ action: 'lose', actionFrame: 40 }) },
  ];
  return L.concat(heldPair(20, null));
}

// ---- layout and drawing of a grid of cells ----

function grid(cells: Cell[], cols: number, top: number, unitsH: number): void {
  const rows = Math.ceil(cells.length / cols);
  const cw = W / cols, rh = (H - top) / rows;
  const sc = Math.min((rh - 22) / unitsH, cw / 260);
  cells.forEach((c, i) => {
    const cx = (i % cols) * cw, cy = top + Math.floor(i / cols) * rh;
    const fy = cy + rh - 26;
    const fx = cx + cw * (c.pair ? 0.3 : 0.5);
    g.save();
    g.beginPath(); g.rect(cx, cy, cw, rh); g.clip();
    if (c.ledge) {
      // the deck corner: the ledge is world (LEDGE_X[1], 0)
      const lx = cx + cw * 0.5, ly = cy + rh * 0.42;
      g.fillStyle = '#26242c'; g.fillRect(lx - cw, ly, cw, rh);
      g.strokeStyle = 'rgba(230,228,222,0.5)'; g.beginPath(); g.moveTo(lx - cw, ly); g.lineTo(lx, ly); g.lineTo(lx, ly + rh); g.stroke();
      draw(c.s, c.o ?? mk({}, other), ch, lx + (c.s.x - LEDGE_X[1]) * 100 * sc, ly - c.s.y * 100 * sc, sc);
    } else {
      floor(cx + 8, cx + cw - 8, fy, !c.s.grounded);
      const o = c.o ?? mk({ x: 3 }, other);
      if (c.pair && c.o) {
        draw(c.o, c.s, CAST[other], fx + c.o.x * 100 * sc, fy, sc);
      }
      draw(c.s, o, ch, fx, fy, sc);
    }
    g.restore();
    label(c.name, cx + cw / 2, cy + rh - 8);
  });
}

function actionsSheet(): void {
  label(`${id} actions (${mode})`, 12, 22, 15, INK, 'left');
  const cells = actionCells();
  grid(cells, 10, 30, ch.build.height * 1.25);
}

// ---- moves ----

function framesFor(m: MoveId, n: number): number[] {
  const md = def.moves[m];
  const S = md.startup, A = md.active, tot = S + A + md.recovery;
  if (n === 7) {
    return [1, Math.max(1, Math.round(S / 2)), S, S + 1, S + A, S + A + Math.round(md.recovery * 0.35), tot];
  }
  const out: number[] = [];
  for (let i = 0; i < n; i++) out.push(Math.max(1, Math.round(1 + ((tot - 1) * i) / (n - 1))));
  return out;
}

function moveState(m: MoveId, f: number): FighterState {
  const md = def.moves[m];
  const airMove = ['nair', 'fair', 'bair', 'uair', 'dair', 'recover'].indexOf(m) >= 0;
  return mk({ action: 'attack', move: m, actionFrame: f, grounded: !airMove, platform: airMove ? -2 : -1, vy: m === 'recover' ? 0.2 : 0 });
  void md;
}

function moveRow(m: MoveId, frames: number[], x0: number, y0: number, w: number, h: number, sc: number, big = false): void {
  const cw = w / frames.length;
  const md = def.moves[m];
  frames.forEach((f, i) => {
    const s = moveState(m, f);
    const cx = x0 + i * cw;
    const fx = cx + cw * 0.38, fy = y0 + h - 24;
    g.save(); g.beginPath(); g.rect(cx, y0, cw, h); g.clip();
    floor(cx + 4, cx + cw - 4, fy, !s.grounded);
    let o: FighterState = mk({ x: 4 }, other);
    if (md.kind === 'throw') {
      const gap = (FIGHTERS[id].width * 0.5 + FIGHTERS[other].width * 0.5 + 0.05);
      const fr = md.hitboxes[0]?.from ?? 99;
      if (f < fr) {
        o = mk({ action: 'held', actionFrame: f, x: gap, facing: -1 }, other);
        draw(o, s, CAST[other], fx + gap * 100 * sc, fy, sc);
      }
    }
    const J = draw(s, o, ch, fx, fy, sc);
    hitboxes(s, J, fx, fy, sc);
    g.restore();
    const part = f <= md.startup ? 'wind' : f <= md.startup + md.active ? 'HIT' : 'rec';
    label(`${f} ${part}`, cx + cw / 2, y0 + h - 6, big ? 14 : 11, part === 'HIT' ? TINTS.coral : '#8d8a84');
  });
}

function movesSheet(): void {
  const part = Number(q.get('part') || 0);
  let ids = MOVE_IDS.slice();
  const per = Number(q.get('per') || 6);
  if (part > 0) ids = ids.slice((part - 1) * per, part * per);
  const top = 28;
  const rh = (H - top) / ids.length;
  // the vertical room: figure height and the highest hitbox
  let up = ch.build.height * 1.1, fwd = 200, back = 120;
  for (const m of ids) for (const hb of def.moves[m].hitboxes) { up = Math.max(up, (hb.y + hb.r) * 100 + 10); fwd = Math.max(fwd, (hb.x + hb.r) * 100); back = Math.max(back, -(hb.x - hb.r) * 100); }
  const labelW = 120;
  const cw = (W - labelW) / 7;
  const sc = Math.min((rh - 26) / (up + 30), cw / (fwd / 0.62 + 10), cw / (back / 0.38 + 10));
  label(`${id} moves (${mode})${part ? ' part ' + part : ''}`, 12, 20, 15, INK, 'left');
  ids.forEach((m, i) => {
    const y0 = top + i * rh;
    label(m, 10, y0 + rh / 2, 14, INK, 'left');
    label(moveAnimOf(ch, m), 10, y0 + rh / 2 + 16, 11, '#8d8a84', 'left');
    moveRow(m, framesFor(m, 7), labelW, y0, W - labelW, rh, sc);
    g.strokeStyle = 'rgba(230,228,222,0.08)'; g.beginPath(); g.moveTo(0, y0 + rh); g.lineTo(W, y0 + rh); g.stroke();
  });
}

// ---- strips ----

function actionStrip(a: string, n: number): Cell[] {
  const out: Cell[] = [];
  const air = { grounded: false, platform: -2 };
  for (let i = 0; i < n; i++) {
    const u = i / Math.max(1, n - 1);
    let c: Cell;
    switch (a) {
      case 'walk': c = { name: `x ${(u * 2.6).toFixed(2)}`, s: mk({ action: 'walk', actionFrame: 30, x: u * 2.6 * (legM()), vx: 0.08 }) }; break;
      case 'run': c = { name: `x ${(u * 4.4).toFixed(2)}`, s: mk({ action: 'run', actionFrame: 30, x: u * 2.5 * 2 * legM() * (1 - 1 / n), vx: 0.18 }) }; break;
      case 'tumble': { const f = 1 + Math.round(u * 40); c = { name: `f ${f}`, s: mk({ action: 'hitstun', actionFrame: f, tumble: true, hitstun: 40, kbx: -0.25, kby: 0.2, vx: -0.25 + u * 0.1, vy: 0.2 - u * 0.35, ...air }) }; break; }
      case 'ledgeclimb': c = { name: `u ${u.toFixed(2)}`, s: ledgeState(u, 1 + Math.round(u * 25)), ledge: true }; break;
      case 'ledgehang': c = { name: `f ${1 + i * 4}`, s: ledgeState(0, 1 + i * 4), ledge: true }; break;
      case 'held': case 'holding': {
        const f = 1 + i * 8;
        c = heldPair(f, null)[0];
        break;
      }
      default: {
        const dur: Record<string, number> = { getup: 26, roll: 26, spotdodge: 22, airdodge: 34, land: 12, jumpsquat: def.jumpsquat, entrance: 24, win: 40, lose: 40, shieldbreak: 60, knockdown: 20, rise: 20, fall: 20, skid: 6, turn: 8, hitstun: 14, helpless: 40, idle: 120, shieldstun: 8 };
        const f = 1 + Math.round(u * ((dur[a] ?? 30) - 1));
        const extra: Partial<FighterState> = a === 'rise' ? { vy: def.jumpSpeed * (1 - u), ...air } : a === 'fall' ? { vy: -def.fallSpeed * u, ...air } : a === 'airdodge' || a === 'helpless' ? air : a === 'hitstun' ? { hitstun: 14 - f, kbx: -0.1, kby: 0.02 } : a === 'roll' ? { vx: 0.11 } : {};
        c = { name: `f ${f}`, s: mk({ action: a as Action, actionFrame: f, ...extra }) };
      }
    }
    out.push(c);
  }
  return out;
}
function legM(): number { return (ch.build.leg[0] + ch.build.leg[1]) / 100; }

function stripSheet(): void {
  const n = Number(q.get('n') || 12);
  const isMove = (MOVE_IDS as string[]).indexOf(strip) >= 0;
  label(`${id} ${strip}${isMove ? ' (' + moveAnimOf(ch, strip as MoveId) + ')' : ''} (${mode})`, 12, 22, 16, INK, 'left');
  if (isMove) {
    const m = strip as MoveId;
    const frames = framesFor(m, n);
    const rows = n > 8 ? 2 : 1;
    const per = Math.ceil(n / rows);
    const rh = (H - 34) / rows;
    let up = ch.build.height * 1.1, fwd = 200, back = 120;
    for (const hb of def.moves[m].hitboxes) { up = Math.max(up, (hb.y + hb.r) * 100 + 10); fwd = Math.max(fwd, (hb.x + hb.r) * 100); back = Math.max(back, -(hb.x - hb.r) * 100); }
    const cw = W / per;
    const sc = Math.min((rh - 30) / (up + 30), cw / (fwd / 0.62 + 10), cw / (back / 0.38 + 10));
    for (let r = 0; r < rows; r++) moveRow(m, frames.slice(r * per, (r + 1) * per), 0, 34 + r * rh, W, rh, sc, true);
  } else {
    const cells = actionStrip(strip, n);
    grid(cells, n > 8 ? Math.ceil(n / 2) : n, 34, ch.build.height * (strip.startsWith('ledge') ? 1.9 : 1.3));
  }
}

if (sheet === 'moves') movesSheet();
else if (strip) stripSheet();
else actionsSheet();
(window as unknown as { __posesReady: boolean }).__posesReady = true;

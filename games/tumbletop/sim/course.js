// "Attic Dash": the Tumbletop course, as plain data.
//
// Coordinates: metres, +z forward along the course, +y up, x lateral (x=0 is the centre line).
// Everything a renderer needs to build meshes lives here; nothing here depends on time or a seed.
//
// surfaces[]  walkable floors. kind 'box' (flat) or 'ramp' (top rises linearly from y0 at z0 to
//             y1 at z1). Footprint: x in [x - width/2, x + width/2], z in [z0, z1]. The slab hangs
//             `thickness` metres below its top.
// walls[]     static rails / back walls: axis-aligned boxes {min:{x,y,z}, max:{x,y,z}}.
// obstacles[] definitions; the sim turns each into a live pose every tick (sim.state.obstacles).
//   spinner   spinning top (style 'top') or giant pencil sweeper (style 'pencil'). Base centre
//             (x, y, z) on the floor; `arms` paddles of length `radius` sweep a horizontal disc
//             between y+armBottom and y+armTop. Arm k points along angle (angle + k*2PI/arms) in
//             the x-z plane, measured from +x toward +z. Live rot.y = -angle. Central body is a solid
//             cylinder of radius postRadius and height `height`.
//   marble    rolls down the Bookshelf Climb in lane x. Live pos = centre; `active` false when it
//             has dropped into the toy bin at the bottom (render nothing). rot.x = rolling angle.
//   seesaw    ruler plank. Pivot line runs along z at (x, y) = top-surface centre line; plank spans
//             z0..z1, `width` across x, `thickness` below the top. Live rot.z = roll (radians);
//             positive roll lifts the +x edge (top height = y + (px - x) * tan(roll)).
//   pendulum  metronome weight hanging from pivot {x, y, z} on a rod of `length`; bob is a
//             cylinder (axis along z) of radius bobRadius and half-length bobHalfZ. Live
//             pos = bob centre, rot.z = theta (bob = pivot + length*(sin theta, -cos theta)).
//   block     static alphabet block (wall). pos = box centre, size = full extents.
//   slider    alphabet block that slides along x. pos = live box centre, size = full extents.
// checkpoints[] respawn points, reached when a bot passes z. spawn = rectangle to drop bots into.
// sections[]  named stretches with AI hints.
// decor[]     decorative anchors for set dressing (kind, pos, rotY, scale). Not collidable. pos.y is
//             where the prop's base sits; the renderer supports it (course surface, the attic floor
//             at floorY, or a stack of books from the floor) so nothing hangs in mid-air.

export const BOT_RADIUS = 0.5;
export const BOT_HEIGHT = 1.15;

// Key z positions (metres). Everything below is derived from these.
export const L = {
  padZ0: -1, startZ: 12, padZ1: 22,
  topsZ0: 22, topsZ1: 80, topsFunnelZ: 72,
  rampZ0: 80, rampZ1: 146, rampY1: 9,
  platZ1: 156,
  plank1Z0: 156, plank1Z1: 174,
  islandZ1: 180,
  plank2Z0: 180, plank2Z1: 198,
  landingZ1: 208,
  bridgeZ0: 208, bridgeZ1: 268,
  mazeZ0: 268, mazeZ1: 318,
  finalRampZ1: 326, finalY: 11,
  sweeperZ: 337, finishZ: 350, endZ: 362,
  highY: 9,
};

const sections = [
  { index: 0, key: 'start', name: 'Game Board Start', z0: L.padZ0, z1: L.padZ1 },
  { index: 1, key: 'tops', name: 'Spinning Top Field', z0: L.topsZ0, z1: L.topsZ1 },
  { index: 2, key: 'ramp', name: 'Bookshelf Climb', z0: L.rampZ0, z1: L.platZ1 },
  { index: 3, key: 'seesaws', name: 'Ruler Seesaws', z0: L.plank1Z0, z1: L.landingZ1 },
  { index: 4, key: 'bridges', name: 'Metronome Bridges', z0: L.bridgeZ0, z1: L.bridgeZ1 },
  { index: 5, key: 'maze', name: 'Alphabet Block Maze', z0: L.mazeZ0, z1: L.mazeZ1 },
  { index: 6, key: 'final', name: 'Final Dash', z0: L.mazeZ1, z1: L.endZ + 1 },
];

const surfaces = [];
const walls = [];
const obstacles = [];

function addBox(material, x, width, z0, z1, y, thickness, section) {
  const s = { id: 's' + surfaces.length, kind: 'box', material, x, width, z0, z1, y0: y, y1: y, thickness, section };
  surfaces.push(s);
  return s;
}
function addRamp(material, x, width, z0, z1, y0, y1, thickness, section) {
  const s = { id: 's' + surfaces.length, kind: 'ramp', material, x, width, z0, z1, y0, y1, thickness, section };
  surfaces.push(s);
  return s;
}
function addWall(material, x0, x1, y0, y1, z0, z1) {
  walls.push({ id: 'w' + walls.length, kind: 'rail', material, min: { x: x0, y: y0, z: z0 }, max: { x: x1, y: y1, z: z1 } });
}

const H = L.highY;

// ---------------------------------------------------------------- 0. Game Board Start
addBox('boardTile', 0, 30, L.padZ0, L.padZ1, 0, 1.2, 0);
addWall('boardEdge', -15.6, -15, -0.5, 1.4, L.padZ0, L.padZ1);
addWall('boardEdge', 15, 15.6, -0.5, 1.4, L.padZ0, L.padZ1);
addWall('boardEdge', -15.6, 15.6, -0.5, 1.4, L.padZ0 - 0.6, L.padZ0);

// ---------------------------------------------------------------- 1. Spinning Top Field
const TOPS_HALF = 14;
addBox('feltMat', 0, TOPS_HALF * 2, L.topsZ0, L.topsZ1, 0, 1.0, 1);
const topRows = [
  { z: 30, xs: [-6, 6], radius: 3.8, arms: 2, omega: 1.7 },
  { z: 40, xs: [-11, 0, 11], radius: 3.6, arms: 2, omega: -1.9 },
  { z: 50, xs: [-7.5, 7.5], radius: 3.7, arms: 3, omega: 1.45 },
  { z: 60, xs: [-11, 0, 11], radius: 3.7, arms: 2, omega: 2.0 },
  { z: 68, xs: [-6.5, 6.5], radius: 3.1, arms: 3, omega: -1.35 },
];
const topLanes = [];
topRows.forEach((row, ri) => {
  const discs = [];
  row.xs.forEach((x, k) => {
    const dir = (k % 2 === 0 ? 1 : -1) * Math.sign(row.omega);
    const omega = dir * (Math.abs(row.omega) + 0.12 * ((k * 7 + ri * 3) % 4));
    const radius = row.radius + 0.1 * ((k + ri) % 3);
    discs.push({ x, radius });
    obstacles.push({
      id: `top-${ri}-${k}`, type: 'spinner', style: 'top', section: 1,
      x, y: 0, z: row.z,
      radius, arms: row.arms,
      armBottom: 0.2, armTop: 1.05, armHalfWidth: 0.48,
      postRadius: 1.2, height: 4.2,
      omega, phase: (ri * 1.3 + k * 2.1) % (Math.PI * 2),
      knock: 9.5,
      colorIndex: (ri + k) % 5,
    });
  });
  // free lanes between the discs (within the safe part of the floor)
  const lim = 12.5;
  const free = [];
  let x0 = -lim;
  const sorted = discs.slice().sort((a, b) => a.x - b.x);
  for (const d of sorted) {
    const a = d.x - d.radius - 0.7, b = d.x + d.radius + 0.7;
    if (a > x0 + 0.4) free.push({ x0, x1: Math.min(a, lim) });
    x0 = Math.max(x0, b);
  }
  if (x0 < lim - 0.4) free.push({ x0, x1: lim });
  topLanes.push({ z: row.z, posts: row.xs, discs, free: free.filter((f) => f.x1 - f.x0 > 0.4) });
});

// ---------------------------------------------------------------- 2. Bookshelf Climb
const RAMP = { z0: L.rampZ0, z1: L.rampZ1, y0: 0, y1: H, width: 16 };
addRamp('bookSpines', 0, RAMP.width, RAMP.z0, RAMP.z1, RAMP.y0, RAMP.y1, 1.2, 2);
addBox('bookTop', 0, 22, L.rampZ1, L.platZ1, H, 1.6, 2);
// A trio of lanes of giant marbles (about 3.5 Gumbles tall). One shared period, and the releases
// step left, centre, right, left ... at even intervals, so the ramp always shows a readable
// staircase of balls: each lane has its own ball and its own beat, and the gap you dodge into
// is the lane whose ball has just gone by.
const MARBLE_R = 2.05;
const marbleLanes = [
  { x: -4.7, count: 2 },
  { x: 0, count: 2 },
  { x: 4.7, count: 2 },
];
const MARBLE_SPEED = 8.4;
const MARBLE_PERIOD = (RAMP.z1 - RAMP.z0) / MARBLE_SPEED + 1.2;
marbleLanes.forEach((lane, li) => {
  const period = MARBLE_PERIOD;
  const slot = period / (lane.count * marbleLanes.length);
  for (let k = 0; k < lane.count; k++) {
    obstacles.push({
      id: `marble-${li}-${k}`, type: 'marble', section: 2,
      lane: lane.x, r: MARBLE_R, speed: MARBLE_SPEED, period,
      phase: (period * k) / lane.count + slot * [0, 2, 1][li],
      zTop: RAMP.z1 - MARBLE_R, zBottom: RAMP.z0 - 1.0,
      ramp: { z0: RAMP.z0, z1: RAMP.z1, y0: RAMP.y0, y1: RAMP.y1 },
      wobble: 0.22 + 0.06 * ((li + k) % 3), wobbleRate: 0.21 + 0.05 * k,
      x: lane.x, z: (RAMP.z0 + RAMP.z1) / 2,
      colorIndex: (li * 2 + k * 3) % 6,
    });
  }
});

// ---------------------------------------------------------------- 3. Ruler Seesaws
const plankRows = [
  { z0: L.plank1Z0, z1: L.plank1Z1, xs: [-7, 0, 7], width: 2.8, amp: 0.38, periods: [3.7, 4.3, 3.9], phases: [0.2, 1.9, 3.4] },
  { z0: L.plank2Z0, z1: L.plank2Z1, xs: [-4.5, 4.5], width: 3.0, amp: 0.36, periods: [3.4, 3.8], phases: [0.9, 2.6] },
];
plankRows.forEach((row, ri) => {
  row.xs.forEach((x, k) => {
    obstacles.push({
      id: `ruler-${ri}-${k}`, type: 'seesaw', section: 3,
      x, y: H, z: (row.z0 + row.z1) / 2, z0: row.z0, z1: row.z1,
      width: row.width, thickness: 0.35, amp: row.amp,
      period: row.periods[k], phase: row.phases[k], flick: 1.7,
    });
  });
});
// Swinging pencils: a giant pencil hangs point-up from a gantry over the mouth of every ruler and
// swings its fat candy eraser across the plank and out over the drop, so stepping onto a ruler is
// a timing call (wait on the solid deck for the swing, then dash under it onto the tipping
// plank). Each row swings in unison, like a row of metronomes, so neighbours never meet.
const SWING = { length: 4.3, bobRadius: 0.9, bobHalfZ: 0.9, clear: 0.12, inset: 1.7 };
const swingRows = [
  { z: L.plank1Z0 + SWING.inset, xs: plankRows[0].xs, amp: 0.86, period: 3.0, phase: 0.6 },
  { z: L.plank2Z0 + SWING.inset, xs: plankRows[1].xs, amp: 0.86, period: 2.8, phase: 2.3 },
];
swingRows.forEach((row, ri) => {
  row.xs.forEach((x, k) => {
    obstacles.push({
      id: `swing-${ri}-${k}`, type: 'pendulum', style: 'pencil', section: 3,
      pivot: { x, y: H + SWING.bobRadius + SWING.clear + SWING.length, z: row.z }, x, z: row.z,
      length: SWING.length, amp: row.amp, period: row.period, phase: row.phase,
      bobRadius: SWING.bobRadius, bobHalfZ: SWING.bobHalfZ, knock: 8.5,
      colorIndex: (ri * 3 + k) % 4,
    });
  });
});
addBox('eraser', 0, 22, L.plank1Z1, L.islandZ1, H, 1.4, 3);
addBox('bookTop', 0, 20, L.plank2Z1, L.landingZ1, H, 1.6, 3);

// ---------------------------------------------------------------- 4. Metronome Bridges
const BRIDGES = { z0: L.bridgeZ0, z1: L.bridgeZ1, xs: [-4.5, 4.5], width: 3.6, y: H };
BRIDGES.xs.forEach((x, k) => addBox(k === 0 ? 'crayonBlue' : 'crayonRed', x, BRIDGES.width, BRIDGES.z0, BRIDGES.z1, H, 0.9, 4));
const pendZ = [0, 1].map((k) => [0, 1, 2, 3, 4].map((j) => L.bridgeZ0 + 7 + k * 5 + j * 9.5));
// Metronome weights: fat candy drums about 3 Gumbles across that skim the deck at the bottom of
// the swing and sweep clean across the crayon, out past its edge, and back.
const PEND = { length: 9.0, bobRadius: 1.65, bobHalfZ: 0.85, clear: 0.15, amp: 0.5 };
BRIDGES.xs.forEach((bx, k) => {
  pendZ[k].forEach((z, j) => {
    const length = PEND.length;
    obstacles.push({
      id: `metronome-${k}-${j}`, type: 'pendulum', section: 4,
      pivot: { x: bx, y: H + PEND.bobRadius + PEND.clear + length, z }, x: bx, z,
      length, amp: PEND.amp, period: 2.9 + 0.25 * ((j + 2 * k) % 3), phase: (j * 1.9 + k * 0.8 + 5.98) % (Math.PI * 2),
      bobRadius: PEND.bobRadius, bobHalfZ: PEND.bobHalfZ, knock: 12.5,
      colorIndex: (j + k) % 4,
    });
  });
});

// ---------------------------------------------------------------- 5. Alphabet Block Maze
const MAZE = { z0: L.mazeZ0, z1: L.mazeZ1, y: H, halfWidth: 13 };
addBox('foamMat', 0, MAZE.halfWidth * 2, MAZE.z0, MAZE.z1, H, 1.4, 5);
addWall('woodRail', -13.6, -13, H - 0.5, H + 1.4, MAZE.z0, MAZE.z1);
addWall('woodRail', 13, 13.6, H - 0.5, H + 1.4, MAZE.z0, MAZE.z1);
const LETTERS = 'TUMBLETOPGUMBLEATTICDASHWOBBLEHOPSKIP';
// Every row has open gaps; some gaps hold a RAM block (shoves across the gap after a rock-back
// tell), and several corridors between rows carry giant TUMBLE blocks that cartwheel across
// the maze one face at a time, so crossing a corridor is a timing call.
const mazeRowDefs = [
  { z: L.mazeZ0 + 8, missing: [1, 2, 6, 10, 11], sliders: [] },
  { z: L.mazeZ0 + 16, missing: [3, 4, 5, 9], sliders: [{ cells: [3, 5], rest: 1.25, dash: 0.55, phase: 0.3 }] },
  { z: L.mazeZ0 + 24, missing: [0, 5, 6, 7, 12], sliders: [{ cells: [5, 7], rest: 1.1, dash: 0.5, phase: 2.2 }] },
  { z: L.mazeZ0 + 32, missing: [2, 3, 4, 8, 9, 10], sliders: [{ cells: [2, 4], rest: 1.2, dash: 0.5, phase: 1.4 }, { cells: [8, 10], rest: 1.35, dash: 0.55, phase: 2.9 }] },
  { z: L.mazeZ0 + 40, missing: [1, 6, 11], sliders: [] },
];
// corridor tumblers: centre z, x span of the block centre [xa, xb] (a whole number of block
// widths, so the block lands square on every step), timing. Every corridor carries one, so the
// maze always has a giant block cartwheeling across the lane ahead of the pack.
const TUMBLE = 4; // giant block edge (m): about 3.5 Gumbles tall
const mazeTumblers = [
  // the entrance gauntlet: right where the crayon bridges land, a giant block cartwheels across
  // each bridge exit, tight against the first wall row
  { z: L.mazeZ0 + 5, xa: -10, xb: -2, rest: 0.8, phase: 0.4 },
  { z: L.mazeZ0 + 5, xa: 2, xb: 10, rest: 0.8, phase: 1.5 },
  { z: L.mazeZ0 + 12, xa: -10, xb: 10, rest: 0.9, phase: 3.1 },
  { z: L.mazeZ0 + 20, xa: -10, xb: -2, rest: 1.0, phase: 0.0 },
  { z: L.mazeZ0 + 20, xa: 2, xb: 10, rest: 1.0, phase: 1.7 },
  { z: L.mazeZ0 + 28, xa: -10, xb: 10, rest: 0.9, phase: 2.6 },
  { z: L.mazeZ0 + 36, xa: -10, xb: -2, rest: 1.1, phase: 0.6 },
  { z: L.mazeZ0 + 36, xa: 2, xb: 10, rest: 1.1, phase: 2.2 },
];
const cellX = (i) => -12 + 2 * i;
const mazeRows = [];
let letterIdx = 0;
mazeRowDefs.forEach((row, ri) => {
  for (let i = 0; i <= 12; i++) {
    if (row.missing.includes(i)) continue;
    // low single-block walls in the field (the pack and the giant tumblers read over them), taller
    // stacks only at the rails
    const edge = i === 0 || i === 12;
    const h = edge ? 4 : 2;
    obstacles.push({
      id: `block-${ri}-${i}`, type: 'block', section: 5,
      pos: { x: cellX(i), y: MAZE.y + h / 2, z: row.z }, size: { x: 2, y: h, z: 2 },
      x: cellX(i), z: row.z,
      letter: LETTERS[letterIdx++ % LETTERS.length], colorIndex: (i + ri * 2) % 6,
    });
  }
  const gaps = [];
  let run = null;
  for (let i = 0; i <= 13; i++) {
    const miss = i <= 12 && row.missing.includes(i);
    if (miss && !run) run = { a: i, b: i };
    else if (miss) run.b = i;
    else if (run) {
      const x0 = cellX(run.a) - 1, x1 = cellX(run.b) + 1;
      const slider = row.sliders.some((s) => s.cells[0] === run.a && s.cells[1] === run.b);
      gaps.push({ x: (x0 + x1) / 2, halfWidth: (x1 - x0) / 2, slider });
      run = null;
    }
  }
  row.sliders.forEach((s, si) => {
    const xa = cellX(s.cells[0]), xb = cellX(s.cells[1]);
    obstacles.push({
      id: `slider-${ri}-${si}`, type: 'slider', mode: 'ram', section: 5,
      x: (xa + xb) / 2, z: row.z, travel: (xb - xa) / 2,
      y: MAZE.y, size: { x: 2, y: 2, z: 2 },
      rest: s.rest, dash: s.dash, phase: s.phase,
      letter: LETTERS[letterIdx++ % LETTERS.length], colorIndex: (ri + si) % 6,
    });
  });
  mazeRows.push({ z: row.z, z0: row.z - 1, z1: row.z + 1, gaps });
});
mazeTumblers.forEach((tb, ti) => {
  obstacles.push({
    id: `tumbler-${ti}`, type: 'slider', mode: 'tumble', section: 5,
    x: (tb.xa + tb.xb) / 2, z: tb.z, travel: (tb.xb - tb.xa) / 2,
    y: MAZE.y, size: { x: TUMBLE, y: TUMBLE, z: TUMBLE },
    flip: 0.52, pause: 0.16, rest: tb.rest, phase: tb.phase,
    letter: LETTERS[(ti * 5 + 3) % LETTERS.length], colorIndex: (ti * 2 + 1) % 6,
  });
});

// ---------------------------------------------------------------- 6. Final Dash
const FY = L.finalY;
addRamp('playMat', 0, 24, L.mazeZ1, L.finalRampZ1, H, FY, 1.4, 6);
addBox('playMat', 0, 24, L.finalRampZ1, L.endZ, FY, 1.4, 6);
addWall('woodRail', -12.6, -12, H - 0.5, FY + 1.4, L.mazeZ1, L.endZ);
addWall('woodRail', 12, 12.6, H - 0.5, FY + 1.4, L.mazeZ1, L.endZ);
addWall('woodRail', -12.6, 12.6, FY - 0.5, FY + 1.6, L.endZ, L.endZ + 0.6);
// Two giant pencils crossed on a heavy hub: four chest-high arms, so a pencil is always
// sweeping through the half of the disc the pack is running into.
obstacles.push({
  id: 'pencil-sweeper', type: 'spinner', style: 'pencil', section: 6,
  x: 0, y: FY, z: L.sweeperZ, radius: 11.2, arms: 4,
  armBottom: 0.3, armTop: 1.3, armHalfWidth: 0.58,
  postRadius: 1.9, height: 3.0,
  omega: 1.4, phase: 2.94, knock: 10.5, colorIndex: 0,
});

const FINISH_Z = L.finishZ;
const START_Z = L.startZ;

// Drop-in points, in course order. A faller comes back at the last one it passed, so a fall
// costs a few seconds and some ground, not the round. `spawns` (when a point sits on separate
// decks) lists one rectangle per deck; the faller gets the one nearest to where it went off.
const rampYAt = (z) => (H * (z - L.rampZ0)) / (L.rampZ1 - L.rampZ0);
const checkpoints = [
  { id: 'start', z: START_Z, y: 0, section: 0, spawn: { x0: -10, x1: 10, z0: 13, z1: 19 } },
  { id: 'tops-mid', z: 44.2, y: 0, section: 1, spawn: { x0: -10, x1: 10, z0: 44.4, z1: 45.6 } },
  { id: 'tops-end', z: L.topsZ1 - 4, y: 0, section: 1, spawn: { x0: -5.5, x1: 5.5, z0: L.topsZ1 - 4.5, z1: L.topsZ1 - 1 } },
  { id: 'ramp-mid', z: 112, y: rampYAt(112), section: 2, spawn: { x0: -6, x1: 6, z0: 112.5, z1: 115 } },
  { id: 'ramp-top', z: L.rampZ1 + 2, y: H, section: 2, spawn: { x0: -8, x1: 8, z0: L.rampZ1 + 3, z1: L.platZ1 - 2 } },
  { id: 'island', z: L.plank1Z1 + 0.8, y: H, section: 3, spawn: { x0: -8, x1: 8, z0: L.plank1Z1 + 1.2, z1: L.islandZ1 - 1.6 } },
  { id: 'landing', z: L.plank2Z1 + 2, y: H, section: 3, spawn: { x0: -7, x1: 7, z0: L.plank2Z1 + 2, z1: L.landingZ1 - 2 } },
  {
    id: 'bridge-mid', z: L.bridgeZ0 + 28.5, y: H, section: 4, spawn: { x0: -5.6, x1: -3.4, z0: L.bridgeZ0 + 29, z1: L.bridgeZ0 + 32 },
    spawns: [
      { x0: -5.6, x1: -3.4, z0: L.bridgeZ0 + 29, z1: L.bridgeZ0 + 32 },
      { x0: 3.4, x1: 5.6, z0: L.bridgeZ0 + 24.5, z1: L.bridgeZ0 + 27.5 },
    ],
  },
  { id: 'maze-start', z: L.mazeZ0 + 1, y: H, section: 4, spawn: { x0: -9, x1: 9, z0: L.mazeZ0 + 0.4, z1: L.mazeZ0 + 2.4 } },
  { id: 'maze-end', z: L.mazeZ1 + 2, y: H + 0.4, section: 5, spawn: { x0: -9, x1: 9, z0: L.mazeZ1 + 1, z1: L.mazeZ1 + 4 } },
];
checkpoints.forEach((c, i) => { c.index = i; });

// AI hints
sections[1].lanes = topLanes;
sections[2].ramp = RAMP;
sections[3].rows = plankRows.map((r) => ({ z0: r.z0, z1: r.z1, xs: r.xs, width: r.width }));
sections[4].bridges = BRIDGES;
sections[5].rows = mazeRows;

// Showcase anchors (camera/capture hints only; the sim never reads them): the signature hazard of
// each section, as {z, y} plus the span [z - back, z + fwd] in which Gumbles count as "at" it, and
// how far before it (near..far metres) the followed Gumble should be so the hazard fills the shot.
sections[1].showcase = { z: 50, y: 0, back: 14, fwd: 2, near: 4, far: 11 };
sections[2].showcase = { z: 112, y: 0, back: 26, fwd: 4, near: 1, far: 11 };
sections[3].showcase = { z: L.plank1Z0 + 1.7, y: H, back: 12, fwd: 4, near: -1.5, far: 1.5 };
sections[4].showcase = { z: L.bridgeZ0 + 21.5, y: H, back: 20, fwd: 6, near: -0.6, far: 0.8, x: 4.5, xr: 2 };
sections[5].showcase = { z: L.mazeZ0 + 5, y: H, back: 12, fwd: 2, near: 4, far: 9 };
sections[6].showcase = { z: L.sweeperZ, y: L.finalY, back: 12, fwd: 2, near: 5, far: 10, x: 0, xr: 5, maxQualified: 20 };

// ---------------------------------------------------------------- decor (non-colliding)
const decor = [
  { kind: 'boardGameBox', pos: { x: -24, y: -1, z: 4 }, rotY: 0.3, scale: 1.4 },
  { kind: 'diceStack', pos: { x: 22, y: -1, z: 10 }, rotY: -0.5, scale: 1.2 },
  { kind: 'teddyBear', pos: { x: -26, y: -2, z: 42 }, rotY: 0.9, scale: 2.2 },
  { kind: 'spinningTopPile', pos: { x: 24, y: -2, z: 55 }, rotY: 0, scale: 1.3 },
  { kind: 'bookStack', pos: { x: 17, y: -2, z: 98 }, rotY: -0.25, scale: 2.0 },
  { kind: 'bookStack', pos: { x: -16, y: -2, z: 118 }, rotY: 0.15, scale: 2.4 },
  { kind: 'marbleJar', pos: { x: 15, y: H - 4, z: L.rampZ1 + 4 }, rotY: -0.4, scale: 2.0 },
  { kind: 'pencilCup', pos: { x: -25, y: H - 6, z: L.plank1Z0 + 8 }, rotY: 0.2, scale: 2.2 },
  { kind: 'deskLamp', pos: { x: 36, y: -2, z: 112 }, rotY: -2.2, scale: 2.8 },
  { kind: 'crayonBox', pos: { x: -17, y: H - 6, z: L.bridgeZ0 + 12 }, rotY: 0.4, scale: 2.4 },
  { kind: 'metronomeCase', pos: { x: -30, y: H - 6, z: L.bridgeZ0 - 4 }, rotY: -0.6, scale: 2.0 },
  { kind: 'toyTrain', pos: { x: -22, y: H - 4, z: L.mazeZ0 + 14 }, rotY: 1.57, scale: 1.8 },
  { kind: 'blockTower', pos: { x: 20, y: H - 2, z: L.mazeZ0 + 30 }, rotY: 0.3, scale: 1.6 },
  { kind: 'globe', pos: { x: -27, y: H - 2, z: L.finalRampZ1 - 4 }, rotY: 0, scale: 2.0 },
  { kind: 'trophyShelf', pos: { x: 0, y: L.finalY, z: L.endZ + 6 }, rotY: 3.14159, scale: 2.6 },
  { kind: 'atticWindow', pos: { x: 45, y: 25, z: 180 }, rotY: -1.57, scale: 4.0 },
  { kind: 'atticWindow', pos: { x: -45, y: 25, z: 90 }, rotY: 1.57, scale: 4.0 },
  { kind: 'atticWindow', pos: { x: 45, y: 25, z: 300 }, rotY: -1.57, scale: 4.0 },
  { kind: 'roofBeam', pos: { x: 0, y: 48, z: 60 }, rotY: 0, scale: 1 },
  { kind: 'roofBeam', pos: { x: 0, y: 48, z: 170 }, rotY: 0, scale: 1 },
  { kind: 'roofBeam', pos: { x: 0, y: 48, z: 280 }, rotY: 0, scale: 1 },
];

export const COURSE = {
  name: 'Attic Dash',
  length: FINISH_Z - START_Z,
  startZ: START_Z,
  finish: { z: FINISH_Z, y: L.finalY, x: 0, width: 24, archHeight: 6 },
  start: { z: START_Z, y: 0, x: 0, width: 30 },
  killY: -10,
  floorY: -14, // the attic floorboards far below the course (set dressing rests on it)
  bounds: { minX: -16, maxX: 16, minZ: -2, maxZ: L.endZ + 4 },
  layout: L,
  sections,
  surfaces,
  walls,
  obstacles,
  checkpoints,
  decor,
};

/** Index of the drop-in point with this id. */
export function checkpointIndex(id) {
  const i = checkpoints.findIndex((c) => c.id === id);
  if (i < 0) throw new Error(`unknown checkpoint ${id}`);
  return i;
}

/** Section index containing z. */
export function sectionAt(z) {
  for (let i = sections.length - 1; i >= 0; i--) if (z >= sections[i].z0) return i;
  return 0;
}

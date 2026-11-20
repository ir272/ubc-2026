// Gumble motion feel: procedural poses, squash and stretch, jelly follow-through, floppy tumbles
// and get-ups, driven only by the sampled sim state (anim, animTime, velocity, grounded).
// Also detects the visual "moments" (landings, bounces, hits, bumps, get-up pops, footsteps)
// and hands them to the fx layer (puffs, hit bursts, dizzy stars).
// No allocations per frame: every per-bot value lives in a typed array.
// Same order as sim ANIMS / gumble.js ANIM_INDEX (fixed by SPEC).
import { GETUP_TICKS } from '../../../sim/physics.js';

const A = { idle: 0, run: 1, jump: 2, fall: 3, dive: 4, getup: 5, stumble: 6, tumble: 7, grab: 8, celebrate: 9, sad: 10 };

const TAU = Math.PI * 2;
const HALF_PI = Math.PI / 2;
const GETUP_S = GETUP_TICKS / 60; // sim TICK_RATE
const RECOVER_S = 0.8; // woozy scramble after a get-up

function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }
function wrapPi(a) { return a - TAU * Math.floor((a + Math.PI) / TAU); }
function smooth(t) { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function easeOutBack(t) { t = clamp(t, 0, 1); const c = 1.9; const u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; }
function hash01(i, k) { const s = Math.sin(i * 127.1 + k * 311.7) * 43758.5453; return s - Math.floor(s); }

/**
 * Pose output (shared, overwritten per bot):
 *  lift (m), pitch/roll/yawOff (rad), sy (vertical scale, volume preserved by the caller),
 *  armUpL/R (elevation, + up, rad), armSwingL/R (fore/aft about x), armFwdL/R (yaw toward front),
 *  foot{L,R}{y,z}, footSpread, feetOnBody (feet ride the body, for tumbles and get-ups),
 *  sproutX/sproutZ (sprout lag), sad, blink, mouthOpen (0..1), dizzy (0..1).
 */
export function createMotion(N, fx) {
  const P = {
    lift: 0, pitch: 0, roll: 0, yawOff: 0, sy: 1,
    armUpL: 0, armUpR: 0, armSwingL: 0, armSwingR: 0, armFwdL: 0, armFwdR: 0,
    footLy: 0, footLz: 0, footRy: 0, footRz: 0, footSpread: 0.2, feetOnBody: 0,
    sproutX: 0, sproutZ: 0, sad: 0, blink: 1, mouthOpen: 0, dizzy: 0,
    // world-space deformation (applied outside the body's own rotation, so a Gumble lying on its
    // back still flattens against the floor): wsq = vertical scale about the floor (volume kept),
    // (ax, ay, az, ak) = scale ak along a world axis about the body centre (stretch along the
    // flight path, squash along a hit). ox/oy/oz: world offset (hit-stop hold at the hit point).
    wsq: 1, ax: 0, ay: 1, az: 0, ak: 1, ox: 0, oy: 0, oz: 0,
  };
  const phase = new Float32Array(N);
  const stepIdx = new Int32Array(N);
  const prevAnim = new Uint8Array(N).fill(255);
  const prevGrounded = new Uint8Array(N).fill(1);
  const prevV = new Float32Array(N * 3);
  const prevX = new Float32Array(N * 3);
  const seen = new Uint8Array(N);
  // springs: vertical squash (x, v), pitch lag (x, v), roll lag (x, v)
  const sqX = new Float32Array(N), sqV = new Float32Array(N);
  const lpX = new Float32Array(N), lpV = new Float32Array(N);
  const lrX = new Float32Array(N), lrV = new Float32Array(N);
  // tumble: pitch angle + rate, roll angle, entry anim, get-up start angle and length
  const tAng = new Float32Array(N), tAngV = new Float32Array(N), tRoll = new Float32Array(N);
  const lieAng = new Float32Array(N), getupLen = new Float32Array(N).fill(0.5);
  const popDone = new Uint8Array(N), landDone = new Uint8Array(N);
  const trailT = new Float32Array(N);
  const splatT = new Float32Array(N); // a beat of pancake-flat hold after a tumbling landing
  const dizzyAmt = new Float32Array(N);
  const recT = new Float32Array(N); // woozy recovery left after a get-up / stumble (s)
  const recLen = new Float32Array(N).fill(RECOVER_S);
  const blinkSeed = new Float32Array(N);
  // hit-stop: hold time left, hit axis (horizontal, world), held position, launch stretch boost
  const holdT = new Float32Array(N), holdLen = new Float32Array(N).fill(0.1), holdK = new Float32Array(N);
  const hitAx = new Float32Array(N), hitAz = new Float32Array(N);
  const holdP = new Float32Array(N * 3), offP = new Float32Array(N * 3);
  const launchK = new Float32Array(N);
  const bounceN = new Uint8Array(N); // floor contacts since the hit (first one is the big splat)
  const lieT = new Float32Array(N); // time spent on the floor in this tumble
  // floor pin: a splatted body stays pancaked ON the floor for a beat while the sim body already
  // rebounds, then the jelly snaps up after it (the BOING); hang: the cartoon "uh-oh" beat when a
  // Gumble runs off a ledge (held at the ledge height, legs still running, before the drop)
  const pinT = new Float32Array(N), pinY = new Float32Array(N);
  const hangT = new Float32Array(N), hangY = new Float32Array(N);
  const walkT = new Float32Array(N); // time since it ran off a ledge (-1: not a walk-off)
  const landK = new Float32Array(N); // follow-through after a hard landing: arms flung, knees out
  // world yaw a splatted Gumble lies along (+-90 deg: across the course, so the chase camera sees
  // it side-on, flat on its back, not end-on where a lying body reads as standing); NaN = free
  const lieW = new Float32Array(N).fill(NaN);
  const yawLk = new Float32Array(N); // last plunge yaw offset (so the splat turn starts from it)
  walkT.fill(-1);
  // idle personality: bounce period, hop height, glance rhythm, gag rhythm (fixed per bot)
  const idleT = new Float32Array(N), idleHop = new Float32Array(N), idleOff = new Float32Array(N);
  const glanceT = new Float32Array(N), gagT = new Float32Array(N), gagOff = new Float32Array(N);
  const idleSeg = new Int32Array(N).fill(-1);
  for (let i = 0; i < N; i++) {
    blinkSeed[i] = (i * 0.6180339) % 1; phase[i] = i * 1.7;
    idleT[i] = 0.82 + 0.42 * hash01(i, 1);
    idleHop[i] = 0.05 + 0.14 * hash01(i, 2);
    idleOff[i] = hash01(i, 3);
    glanceT[i] = 1.2 + 1.3 * hash01(i, 4);
    gagT[i] = 4.6 + 4.2 * hash01(i, 5);
    gagOff[i] = hash01(i, 6) * 9;
  }

  function resetBot(i, vx, vy, vz, x, y, z, anim, grounded) {
    sqX[i] = 0; sqV[i] = 0; lpX[i] = 0; lpV[i] = 0; lrX[i] = 0; lrV[i] = 0;
    tAng[i] = 0; tAngV[i] = 0; tRoll[i] = 0; dizzyAmt[i] = 0; recT[i] = 0;
    holdT[i] = 0; launchK[i] = 0; splatT[i] = 0; offP[i * 3] = offP[i * 3 + 1] = offP[i * 3 + 2] = 0;
    pinT[i] = 0; hangT[i] = 0; walkT[i] = -1; landK[i] = 0; bounceN[i] = 1; lieW[i] = NaN;
    prevV[i * 3] = vx; prevV[i * 3 + 1] = vy; prevV[i * 3 + 2] = vz;
    prevX[i * 3] = x; prevX[i * 3 + 1] = y; prevX[i * 3 + 2] = z;
    prevAnim[i] = anim; prevGrounded[i] = grounded ? 1 : 0;
    if (anim === A.tumble) { tAng[i] = -HALF_PI; }
    if (anim === A.getup) { lieAng[i] = -HALF_PI; getupLen[i] = GETUP_S; }
    seen[i] = 1;
  }

  /**
   * Idle: every Gumble bounces to its own beat (squash on the down-beat for a couple of frames,
   * stretch on the rise, a little hop for the bouncy ones), sways, glances around with quick
   * head-turns and holds, and every few seconds pulls a gag: a hop-spin, a wobbly "whoa" or a
   * double-hop cheer. Pure function of the render clock and the bot index, so it is staggered.
   */
  function idlePose(i, clock, h, x, y, z) {
    const T = idleT[i];
    const ph = clock / T + idleOff[i];
    const u = ph - Math.floor(ph);
    // beat: 0..0.12 squash (down-beat), 0.12..0.56 up and over (stretch on the rise),
    // 0.56..0.7 land squash, then settle and gather for the next one
    let lift = 0, sy = 1;
    if (u < 0.12) { const a = u / 0.12; sy = 1 - 0.16 * Math.sin(a * Math.PI * 0.5 + Math.PI * 0.5); }
    else if (u < 0.56) {
      const a = (u - 0.12) / 0.44;
      lift = Math.sin(a * Math.PI) * idleHop[i];
      sy = 1 + 0.14 * Math.sin(a * Math.PI * 0.5 + 0.35) * (1 - a * 0.8);
    } else if (u < 0.7) { const a = (u - 0.56) / 0.14; sy = 1 - 0.18 * Math.sin(a * Math.PI); }
    else { const a = (u - 0.7) / 0.3; sy = 1 + 0.03 * Math.sin(a * Math.PI) - 0.16 * a * a; }
    P.lift = lift;
    P.sy = sy;
    P.footLy = P.footRy = lift; // feet leave the floor with the hop
    // glances: hold a look, then snap the head round to the next one
    const gp = clock / glanceT[i] + idleOff[i] * 3;
    const seg = Math.floor(gp), gu = gp - seg;
    const g0 = (hash01(i, seg) - 0.5) * 1.5, g1 = (hash01(i, seg + 1) - 0.5) * 1.5;
    const gk = smooth(gu / 0.16);
    P.yawOff = g0 + (g1 - g0) * gk + Math.sin(gu / 0.16 * Math.PI) * 0.12 * (gu < 0.16 ? 1 : 0) * Math.sign(g1 - g0);
    // sway on the beat, lean into the glance
    P.roll = Math.sin(ph * TAU * 0.5) * 0.07 + P.yawOff * 0.05;
    P.pitch = -0.05 + 0.06 * Math.sin(ph * TAU);
    // arms bob with the beat and swing out on the hop
    const ab = Math.sin(ph * TAU);
    P.armUpL = -0.55 + 0.3 * ab + lift * 3; P.armUpR = -0.55 + 0.3 * Math.sin(ph * TAU + 0.6) + lift * 3;
    P.armSwingL = 0.15 * Math.sin(ph * TAU * 0.5); P.armSwingR = -P.armSwingL;
    P.footSpread = 0.21;

    // gag beat
    const gq = (clock + gagOff[i]) / gagT[i];
    const gi = Math.floor(gq);
    const gt = (gq - gi) * gagT[i]; // seconds into this gag cycle
    if (gt < 0.95) {
      const kind = Math.floor(hash01(i, gi * 3.1 + 7) * 3);
      if (kind === 0 && gt < 0.72) { // hop-spin
        const a = gt / 0.72;
        if (a < 0.18) { const b = a / 0.18; P.sy = 1 - 0.22 * Math.sin(b * HALF_PI); P.lift = 0; P.footLy = P.footRy = 0; P.armUpL = P.armUpR = -0.9; }
        else if (a < 0.82) {
          const b = (a - 0.18) / 0.64;
          P.lift = Math.sin(b * Math.PI) * 0.5; P.footLy = P.footRy = P.lift;
          P.sy = 1 + 0.2 * (1 - b) * Math.sin(b * Math.PI + 0.4);
          P.yawOff += smooth(b) * TAU * (hash01(i, gi) < 0.5 ? 1 : -1);
          P.armUpL = P.armUpR = 1.4; P.mouthOpen = 1;
        } else { const b = (a - 0.82) / 0.18; P.sy = 1 - 0.24 * Math.sin(b * Math.PI); P.lift = 0; P.footLy = P.footRy = 0; P.armUpL = P.armUpR = 1.4 - 1.6 * b; }
      } else if (kind === 1) { // "whoa!": loses balance, windmills, catches it
        const a = gt / 0.95, d = 1 - a;
        const sgn = hash01(i, gi + 0.5) < 0.5 ? 1 : -1;
        P.pitch = sgn * (0.55 * Math.sin(a * Math.PI * 2.5) * d);
        P.roll = Math.sin(a * Math.PI * 3) * 0.25 * d;
        P.armUpL = 1.1 + Math.sin(gt * 22) * 0.8; P.armUpR = 1.1 - Math.sin(gt * 22) * 0.8;
        P.armSwingL = Math.sin(gt * 16) * 1.0; P.armSwingR = -P.armSwingL;
        P.footLy = Math.max(0, Math.sin(gt * 20)) * 0.12; P.footRy = Math.max(0, -Math.sin(gt * 20)) * 0.12;
        P.lift = 0.04; P.sy = 1 + 0.06 * Math.sin(gt * 20);
        P.mouthOpen = 1;
      } else if (kind === 2) { // double-hop cheer
        const b = (gt / 0.95) * 2, bb = b - Math.floor(b);
        P.lift = Math.sin(bb * Math.PI) * 0.3; P.footLy = P.footRy = P.lift;
        P.sy = bb < 0.1 || bb > 0.9 ? 0.82 : 1 + 0.15 * Math.sin(bb * Math.PI) * (1 - bb);
        P.armUpL = 1.5 + Math.sin(gt * 24) * 0.3; P.armUpR = 1.5 - Math.sin(gt * 24) * 0.3;
        P.yawOff *= 0.3;
        P.mouthOpen = 1;
      }
    }
  }

  /**
   * Ran off a ledge: a cartoon "uh-oh" beat (leans back from the drop, arms windmilling, legs
   * still running on thin air, held at the ledge height), then the drop: drawn out long, arms
   * straight up and flailing, legs dangling and pedalling. t = seconds since it left the floor.
   */
  function walkOffPose(i, t, vy) {
    if (t < 0.18) {
      const k = smooth(t / 0.06), w = Math.sin(t * 30), w2 = Math.cos(t * 30), r = Math.sin(t * 38);
      P.pitch = -0.5 * k; P.roll = Math.sin(t * 22) * 0.15;
      P.armUpL = 1.1 + w * 0.9; P.armUpR = 1.1 - w * 0.9;
      P.armSwingL = w2 * 1.3; P.armSwingR = -w2 * 1.3;
      P.footLz = r * 0.26; P.footRz = -r * 0.26;
      P.footLy = Math.max(0, r) * 0.18; P.footRy = Math.max(0, -r) * 0.18;
      P.sy = 1.06;
    } else {
      const u = t - 0.18, w = Math.sin(u * 26), r = Math.sin(u * 24);
      P.pitch = -0.25 + Math.sin(u * 9) * 0.1; P.roll = Math.sin(u * 7) * 0.2;
      P.armUpL = 1.45 + w * 0.35; P.armUpR = 1.45 - w * 0.35;
      P.armSwingL = Math.sin(u * 17) * 0.6; P.armSwingR = -P.armSwingL;
      P.footLy = 0.02 + Math.max(0, r) * 0.12; P.footRy = 0.02 + Math.max(0, -r) * 0.12;
      P.footLz = r * 0.15; P.footRz = -r * 0.15;
      P.sy = 1.1 + clamp(-vy * 0.01, 0, 0.12);
    }
    P.footSpread = 0.24;
    P.mouthOpen = 1;
  }

  /** Advance bot i's visual state by dt and write its pose into P. */
  function pose(i, anim, at, vx, vy, vz, yaw, grounded, x, y, z, dt, clock, focus = false) {
    if (!seen[i]) resetBot(i, vx, vy, vz, x, y, z, anim, grounded);
    // a seek / respawn / replay jump: re-seat the springs, no effects
    {
      const dx = x - prevX[i * 3], dy = y - prevX[i * 3 + 1], dz = z - prevX[i * 3 + 2];
      if (dx * dx + dy * dy + dz * dz > 9 || dt > 0.25 || dt < 0) resetBot(i, vx, vy, vz, x, y, z, anim, grounded);
    }
    const h = dt > 0 ? Math.min(dt, 0.05) : 0;
    const pvx = prevV[i * 3], pvy = prevV[i * 3 + 1], pvz = prevV[i * 3 + 2];
    const speed = Math.sqrt(vx * vx + vz * vz);
    const sp = Math.min(speed / 9, 1.25);
    const sY = Math.sin(yaw), cY = Math.cos(yaw);
    const pa = prevAnim[i];
    const entered = pa !== anim;
    if (entered && h > 0) {
      if (pa === A.getup && anim !== A.tumble) { recT[i] = RECOVER_S; recLen[i] = RECOVER_S; }
      else if (pa === A.stumble && anim !== A.tumble && anim !== A.getup) { recT[i] = 0.45; recLen[i] = 0.45; }
      else if (anim === A.tumble || anim === A.fall) recT[i] = 0;
    }
    if (recT[i] > 0) recT[i] = Math.max(0, recT[i] - h);
    if (entered && anim !== A.tumble && anim !== A.getup) lieW[i] = NaN;

    // ------------------------------------------------ moments (fx + spring kicks)
    // Effects are budgeted: only real impacts make puffs, and the watched Gumble (focus) gets the
    // full treatment while the crowd gets a small version, so the hit frame stands out.
    if (h > 0) {
      // landing / bounce: a hard downward speed that stopped or flipped
      const impact = -pvy;
      const landed = impact > 3.2 && vy > pvy + 3 && vy > -1.5;
      if (landed) {
        const tumbling = anim === A.tumble || anim === A.dive;
        const k = clamp((impact - 3) / 9, 0, 1);
        if (tumbling) {
          // jelly splat: pancake flat against the floor (limbs splayed), held there for a beat
          // while the sim body already rebounds, then it snaps up after it, stretched tall
          const first = bounceN[i] === 0;
          if (bounceN[i] < 255) bounceN[i]++;
          sqX[i] = first ? -0.56 - 0.08 * k : -0.36 - 0.08 * k; sqV[i] = 0;
          splatT[i] = first ? 0.13 : 0.085;
          pinT[i] = splatT[i]; pinY[i] = Math.min(y, prevX[i * 3 + 1]);
          if (anim === A.tumble) {
            // lands flat on its back whatever the spin was (the squash hides the snap), and the
            // floor knocks the spin back: a weighted wobble, not a top
            tAng[i] = -HALF_PI + TAU * Math.round((tAng[i] + HALF_PI) / TAU);
            if (first) { const w = wrapPi(yaw + yawLk[i]); lieW[i] = w >= 0 ? HALF_PI : -HALF_PI; }
            tAngV[i] = (first ? 3.5 : 2) * (hash01(i, bounceN[i]) < 0.5 ? 1 : -1);
          }
          if (fx) {
            if (first) {
              fx.ring(x, y, z, focus ? 0.62 + 0.2 * k : 0.3, focus ? 7 : 3, speed);
              if (focus) { fx.wave(x, y, z, 1.9, 0.32); if (anim === A.tumble) fx.burst(x, y + 0.25, z, 0.95); }
            } else if (focus) fx.ring(x, y, z, 0.36, 5, speed);
          }
        } else {
          // feet-first landing: the harder it lands the flatter it squashes, with a short held
          // splat on a real drop, arms flung up as follow-through
          if (impact > 7) {
            sqX[i] = -0.26 - 0.26 * k; sqV[i] = 0; splatT[i] = 0.035 + 0.06 * k;
            landK[i] = 0.6 + 0.4 * k;
          } else sqV[i] -= 3 + 5.5 * k;
          if (fx && impact > 7.5) {
            fx.ring(x, y, z, focus ? 0.4 + 0.25 * k : 0.26, focus ? 6 : 2, speed);
            if (focus && impact > 10) fx.wave(x, y, z, 1.4, 0.28);
          }
        }
        walkT[i] = -1; hangT[i] = 0;
      }
      // ran off a ledge (airborne without a jump impulse): the "uh-oh" beat
      if (anim === A.jump && entered && vy < 1.2 && (pa === A.run || pa === A.idle || pa === A.stumble)) {
        walkT[i] = 0; hangT[i] = 0.13; hangY[i] = y;
      }
      if (walkT[i] >= 0) { walkT[i] += h; if (grounded || (anim !== A.jump && anim !== A.fall)) walkT[i] = -1; }
      // a dive: launched stretched long, and its belly-flop is a full first splat
      if (anim === A.dive && entered) { launchK[i] = 0.2; bounceN[i] = 0; sqV[i] += 3; }
      // takeoff: stretch
      if (anim === A.jump && entered && pa !== A.fall) sqV[i] += 4.6;
      // a hit: the bot was just knocked into a tumble. HIT-STOP: the body freezes at the hit point
      // for a beat, squashed flat along the blow (arms flung, eyes squeezed), then is flung off
      // stretched long along its flight path.
      if (anim === A.tumble && entered) {
        const dvx = vx - pvx, dvz = vz - pvz;
        const dvh = Math.sqrt(dvx * dvx + dvz * dvz);
        const hit = dvh + Math.max(0, vy - pvy);
        const big = hit > 5;
        holdLen[i] = big ? 0.11 : 0.06; holdT[i] = holdLen[i]; holdK[i] = big ? 0.42 : 0.26;
        if (dvh > 0.3) { hitAx[i] = dvx / dvh; hitAz[i] = dvz / dvh; } else { hitAx[i] = sY; hitAz[i] = cY; }
        holdP[i * 3] = prevX[i * 3]; holdP[i * 3 + 1] = prevX[i * 3 + 1]; holdP[i * 3 + 2] = prevX[i * 3 + 2];
        launchK[i] = big ? 0.22 : 0.1;
        bounceN[i] = 0; lieT[i] = 0; lieW[i] = NaN; yawLk[i] = 0;
        sqX[i] = 0; sqV[i] = 0;
        tAng[i] = 0;
        trailT[i] = 0.02;
        // knocked backwards most of the time (face to the sky), sometimes face first
        const fwd = vx * sY + vz * cY;
        const dir = fwd > 1.5 && hash01(i, clock) < 0.4 ? 1 : -1;
        tAngV[i] = dir * (8 + 4 * hash01(i, Math.floor(clock * 7)));
        tRoll[i] = (hash01(i, 3.3 + clock) - 0.5) * 1.2;
        if (fx && big) {
          // one burst at the contact side (where the blow came from), not over the victim's face
          const cx = x - hitAx[i] * 0.45, cz = z - hitAz[i] * 0.45;
          fx.burst(cx, y + 0.5, cz, focus ? 1.2 + clamp(hit / 14, 0, 0.6) : 0.6);
          if (focus) fx.wave(x, y, z, 1.6, 0.3);
        }
      }
      // a bump: a sudden horizontal shove on the ground that isn't the bot's own doing
      if (grounded && prevGrounded[i] && anim !== A.tumble && anim !== A.getup && anim !== A.dive && !entered) {
        const dvx = vx - pvx, dvz = vz - pvz;
        const dv2 = dvx * dvx + dvz * dvz;
        if (dv2 > 3.2 * 3.2) {
          const dvl = Math.sqrt(dv2);
          // local frame: + forward, + right
          const af = (dvx * sY + dvz * cY), ar = (dvx * cY - dvz * sY);
          lpV[i] -= af * 0.9; lrV[i] += ar * 0.9;
          sqV[i] -= 1.6;
          // a short squash along the shove (no particles: the body sells it)
          if (holdT[i] <= 0) {
            holdLen[i] = 0.07; holdT[i] = 0.07; holdK[i] = clamp(dvl * 0.035, 0.14, 0.3);
            hitAx[i] = dvx / dvl; hitAz[i] = dvz / dvl;
            holdP[i * 3] = x; holdP[i * 3 + 1] = y; holdP[i * 3 + 2] = z;
            offP[i * 3] = 0; offP[i * 3 + 1] = 0; offP[i * 3 + 2] = 0;
            launchK[i] = 0;
          }
        }
      }
      // stumble from a barge: squash along the shove too
      if (anim === A.stumble && entered && holdT[i] <= 0) {
        const dvx = vx - pvx, dvz = vz - pvz;
        const dvl = Math.sqrt(dvx * dvx + dvz * dvz);
        holdLen[i] = 0.08; holdT[i] = 0.08; holdK[i] = 0.3;
        if (dvl > 0.3) { hitAx[i] = dvx / dvl; hitAz[i] = dvz / dvl; } else { hitAx[i] = sY; hitAz[i] = cY; }
        holdP[i * 3] = x; holdP[i * 3 + 1] = y; holdP[i * 3 + 2] = z;
        launchK[i] = 0;
      }
    }
    // hit-stop bookkeeping: hold at the hit point (tumbles only), then let go fast
    let hold = 0; // 1 at the start of the hold, 0 once released
    if (holdT[i] > 0) {
      hold = holdT[i] / holdLen[i];
      holdT[i] = Math.max(0, holdT[i] - h);
    }
    const holding = hold > 0;
    if (splatT[i] > 0) splatT[i] = Math.max(0, splatT[i] - h);
    if (holding && anim === A.tumble) {
      offP[i * 3] = holdP[i * 3] - x; offP[i * 3 + 1] = holdP[i * 3 + 1] - y; offP[i * 3 + 2] = holdP[i * 3 + 2] - z;
    } else {
      const kk = Math.exp(-h * 45);
      offP[i * 3] *= kk; offP[i * 3 + 2] *= kk;
      if (pinT[i] > 0) {
        pinT[i] = Math.max(0, pinT[i] - h);
        offP[i * 3 + 1] = Math.min(0, pinY[i] - y); // stay flat on the floor while the sim rebounds
      } else if (hangT[i] > 0) {
        hangT[i] = Math.max(0, hangT[i] - h);
        offP[i * 3 + 1] = clamp(hangY[i] - y, 0, 0.4); // hangs in the air for a beat, then drops
      } else offP[i * 3 + 1] *= Math.exp(-h * 32);
    }
    if (landK[i] > 0) landK[i] = Math.max(0, landK[i] - h * 3.2);

    // ------------------------------------------------ base pose per anim
    P.lift = 0; P.pitch = 0; P.roll = 0; P.yawOff = 0; P.sy = 1;
    P.armUpL = -0.55; P.armUpR = -0.55; P.armSwingL = 0; P.armSwingR = 0; P.armFwdL = 0; P.armFwdR = 0;
    P.footLy = 0; P.footLz = 0; P.footRy = 0; P.footRz = 0; P.footSpread = 0.2; P.feetOnBody = 0;
    P.sad = 0; P.mouthOpen = 0; P.dizzy = 0;
    P.wsq = 1; P.ax = 0; P.ay = 1; P.az = 0; P.ak = 1;
    let wBase = 1; // world-vertical base squash for this pose (springs ride on top)
    let flight = 0; // 0..1: stretch along the velocity (airborne tumbles, dives, falls)
    let follow = 1; // how much the jelly lag springs show
    let dizzyTarget = 0;
    let yawLock = 0; // tumble plunge: turns the body to face along its flight
    let plunge = 0;

    switch (anim) {
      case A.run: {
        // waddle-hop: every step is a little bounce with a squash at the plant
        const prevPh = phase[i];
        phase[i] += h * (4.5 + speed * 1.25);
        const ph = phase[i], sn = Math.sin(ph), cs = Math.cos(ph);
        const u = Math.abs(sn); // 0 at a foot plant, 1 mid-stride
        const s = sp;
        // bouncy waddle-hop: the body leaves the floor every stride, squashes flat at the plant
        // (a short, sharp squash) and stretches tall on the push-off
        const hop = u * u * (3 - 2 * u);
        P.lift = hop * 0.3 * s;
        const plant = 1 - Math.min(1, u * 3.2); // 1 right at the plant, gone a third into the stride
        P.sy = 1 + s * (0.15 * hop - 0.2 * plant * plant);
        P.pitch = 0.3 * s - 0.08 * plant * s;
        P.roll = sn * 0.27 * s; // waddle: rocks foot to foot, readable from the chase camera
        P.yawOff = -sn * 0.2 * s;
        P.footLz = cs * 0.26 * s; P.footLy = Math.max(0, sn) * 0.2 * s;
        P.footRz = -cs * 0.26 * s; P.footRy = Math.max(0, -sn) * 0.2 * s;
        // arms pump wide and high, alternating, so the stride reads even from straight behind
        P.armUpL = -0.2 + 0.45 * s + sn * 0.38 * s; P.armUpR = -0.2 + 0.45 * s - sn * 0.38 * s;
        P.armSwingL = cs * 1.45 * s; P.armSwingR = -cs * 1.45 * s;
        P.mouthOpen = s > 1 ? 0.35 : 0;
        // woozy scramble right after a get-up: weaving, flailing, still seeing stars
        if (recT[i] > 0) {
          const w = recT[i] / recLen[i], ww = w * w * (3 - 2 * w);
          const ra = (recLen[i] - recT[i]);
          P.roll += Math.sin(ra * 12 + i) * 0.38 * ww;
          P.yawOff += Math.sin(ra * 8.5 + i * 0.7) * 0.42 * ww;
          P.pitch += 0.12 * ww;
          P.armUpL += (1.5 + Math.sin(ra * 19) * 0.7 - P.armUpL) * ww;
          P.armUpR += (1.5 + Math.sin(ra * 19 + 2.2) * 0.7 - P.armUpR) * ww;
          P.armSwingL += Math.sin(ra * 15) * 0.9 * ww; P.armSwingR += Math.cos(ra * 15) * 0.9 * ww;
          P.mouthOpen = Math.max(P.mouthOpen, 0.8 * ww);
          if (focus) dizzyTarget = Math.max(dizzyTarget, 0.75 * ww);
        }
        const st = Math.floor(ph / Math.PI);
        if (st !== Math.floor(prevPh / Math.PI)) stepIdx[i]++;
        break;
      }
      case A.jump: {
        if (walkT[i] >= 0) { walkOffPose(i, walkT[i], vy); flight = clamp((-vy - 3) / 7, 0, 1); follow = 0.3; break; }
        const rising = vy > 0;
        // takeoff tuck, then reach
        P.sy = 1 + clamp(vy * 0.012, -0.06, 0.1);
        const k = smooth(at / 0.22);
        P.armUpL = P.armUpR = -0.9 + 2.3 * k + Math.sin(at * 20) * 0.15 * (1 - k);
        P.armSwingL = P.armSwingR = -0.4 * k;
        if (rising) { P.footLy = P.footRy = 0.16 * k; P.footLz = 0.1; P.footRz = -0.06; }
        else { P.footLy = 0.04; P.footRy = 0.1; P.footLz = 0.12; P.footRz = -0.08; P.armUpL += Math.sin(at * 26) * 0.35; P.armUpR -= Math.sin(at * 26) * 0.35; }
        P.pitch = rising ? 0.18 : -0.05;
        P.mouthOpen = 0.6;
        follow = 0.6;
        if (!rising) flight = clamp((-vy - 5) / 8, 0, 0.7); // dropping fast: drawn out long
        break;
      }
      case A.fall: {
        if (walkT[i] >= 0 && walkT[i] < 0.5) { walkOffPose(i, walkT[i], vy); flight = 1; follow = 0.3; break; }
        // panic: windmill arms, bicycle legs, stretched with the drop
        const w = Math.sin(at * 24), w2 = Math.cos(at * 21);
        P.armUpL = 1.25 + w * 0.5; P.armUpR = 1.25 - w * 0.5;
        P.armSwingL = Math.sin(at * 17) * 0.8; P.armSwingR = -Math.sin(at * 17) * 0.8;
        P.footLy = 0.1 + Math.max(0, w2) * 0.16; P.footRy = 0.1 + Math.max(0, -w2) * 0.16;
        P.footLz = w * 0.18; P.footRz = -w * 0.18;
        P.sy = 1.12; P.roll = Math.sin(at * 7) * 0.25; P.pitch = -0.2;
        P.mouthOpen = 1;
        follow = 0.3;
        flight = 1;
        break;
      }
      case A.dive: {
        // belly flop, arms out front superhero style, then a sliding belly skid
        const k = smooth(at / 0.16);
        P.pitch = 1.45 * k + (grounded ? Math.sin(at * 30) * 0.05 * (1 - smooth(at / 0.6)) : 0);
        P.lift = 0.14 * k;
        if (grounded) wBase = 0.86; else flight = 0.8;
        P.armUpL = P.armUpR = 0.1 * k;
        P.armFwdL = P.armFwdR = 1.45 * k;
        P.footLy = P.footRy = 0.22 * k; P.footLz = -0.22 * k; P.footRz = -0.26 * k;
        P.feetOnBody = 1;
        P.mouthOpen = 1;
        follow = 0.2;
        if (focus && grounded && speed > 3.5 && fx) {
          trailT[i] -= h;
          if (trailT[i] <= 0) { trailT[i] = 0.14; fx.puff(x - sY * 0.4, y + 0.08, z - cY * 0.4, 0.16 + 0.05 * sp, 0, 0.6, 0, 0.4); }
        }
        break;
      }
      case A.tumble: {
        // floppy rag-doll: hit-stop squash -> flung off stretched along the arc, limbs and sprout
        // trailing the spin -> pancake splat on every floor contact (the spin is knocked back, so it
        // wobbles to rest instead of rolling like a top) -> skids on its back, rebounds, rocks and
        // settles like an upturned beetle, legs bicycling, until the get-up
        const air = !grounded || vy > 0.5;
        P.mouthOpen = 1;
        if (holding) {
          // frozen on the hit: flattened along the blow, arms flung back, feet off the floor
          const sgn = tAngV[i] < 0 ? -1 : 1;
          P.pitch = -sgn * 0.28 * hold;
          P.armUpL = P.armUpR = 1.25; P.armSwingL = P.armSwingR = -sgn * 0.9;
          P.footLy = 0.1; P.footRy = 0.16; P.footLz = 0.1; P.footRz = -0.08;
          P.lift = 0.05;
          follow = 0;
          break;
        }
        if (air) {
          lieT[i] = 0;
          tAng[i] += tAngV[i] * h;
          tAngV[i] *= Math.exp(-1.1 * h); // the spin dies off: weighted, not a spinning top
          tRoll[i] += (Math.sin(at * 6.5 + i) * 0.5 - tRoll[i]) * Math.min(1, h * 4);
          flight = 1;
          if (bounceN[i] > 0) {
            // the rebound after a splat: rocks about lying on its back, never stands up mid-air
            const restA = -HALF_PI + TAU * Math.round((tAng[i] + HALF_PI) / TAU);
            tAngV[i] += ((restA - tAng[i]) * 70 - tAngV[i] * 4) * h;
          }
          if (bounceN[i] === 0 && vy < -2) {
            // coming down from the big arc: the spin gives way to a head-first plunge, the body
            // lined up with (and stretched along) its path, arms out ahead, so the splat reads
            const dive = smooth((-vy - 2) / 6);
            const hs = Math.sqrt(vx * vx + vz * vz);
            const th = Math.atan2(hs, vy);
            const tgt = th + TAU * Math.round((tAng[i] - th) / TAU);
            const kk = Math.min(1, h * 16 * dive);
            tAng[i] += (tgt - tAng[i]) * kk;
            tAngV[i] *= 1 - kk;
            tRoll[i] *= 1 - kk;
            if (hs > 0.5) yawLock = wrapPi(Math.atan2(vx, vz) - yaw) * dive;
            yawLk[i] = yawLock;
            plunge = dive;
          }
          if (bounceN[i] === 0 && focus && fx && !holding) {
            // whoosh: a dotted cloud trail draws the arc it was flung along
            trailT[i] -= h;
            if (trailT[i] <= 0) { trailT[i] = 0.04; fx.puff(x, y + 0.45, z, 0.12, 0, 0.15, 0, 0.42); }
          }
        } else {
          lieT[i] += h;
          // on the floor: slide on the back / belly, settling with a weighted overshoot
          const restA = Math.round((tAng[i] - HALF_PI) / Math.PI) * Math.PI + HALF_PI;
          tAngV[i] += ((restA - tAng[i]) * 85 - tAngV[i] * 7) * h;
          tAng[i] += tAngV[i] * h;
          tRoll[i] *= Math.exp(-4 * h);
          const still = clamp(1 - speed / 3.2, 0, 1);
          // upturned beetle: bobs on its jelly (world-vertical, so it really flattens)
          wBase = 0.84 + Math.sin(lieT[i] * 17) * 0.07 * (0.3 + 0.7 * still);
          if (focus && fx && speed > 3.5) {
            trailT[i] -= h;
            if (trailT[i] <= 0) { trailT[i] = 0.16; fx.puff(x - vx * 0.05, y + 0.08, z - vz * 0.05, 0.14 + 0.08 * Math.min(1, speed / 8), -vx * 0.04, 0.5, -vz * 0.04, 0.34); }
          }
          P.roll = Math.sin(lieT[i] * 8.5 + i) * 0.3 * still;
        }
        // seeing stars from the first splat on (the watched Gumble), not only once it is upright
        if (bounceN[i] > 0 && focus) dizzyTarget = 1;
        P.pitch = tAng[i];
        P.roll += tRoll[i];
        P.yawOff = bounceN[i] > 0 && lieW[i] === lieW[i] ? wrapPi(lieW[i] - yaw) : yawLock;
        P.lift = 0.1 * Math.abs(Math.sin(tAng[i])) + 0.05;
        if (splatT[i] > 0 || pinT[i] > 0) {
          // SPLAT: starfish, limbs flung flat out on the floor, feet wide, mouth wide
          const sk = Math.max(splatT[i], pinT[i]) > 0.05 ? 1 : 0.6;
          P.armUpL = P.armUpR = 0.15 * sk + 0.5 * (1 - sk);
          P.armSwingL = 0.35; P.armSwingR = -0.35; P.armFwdL = P.armFwdR = -0.3;
          P.footSpread = 0.38; P.footLy = P.footRy = 0.04; P.footLz = 0.16; P.footRz = -0.16;
          P.feetOnBody = 1;
          P.lift = 0.02;
          flight = 0;
          follow = 0;
          break;
        }
        // limbs trail the spin in the air (follow-through), flail and bicycle on the floor
        const spinLag = clamp(-tAngV[i] * 0.08, -1.1, 1.1);
        const fl = grounded ? 1 : 1.0;
        const fq = grounded ? 24 : 19;
        P.armUpL = 1.05 + Math.sin(at * fq) * 0.75 * fl; P.armUpR = 1.05 + Math.sin(at * fq + 2) * 0.75 * fl;
        P.armSwingL = spinLag + Math.sin(at * 15) * 0.85 * fl; P.armSwingR = spinLag - Math.sin(at * 15 + 1) * 0.85 * fl;
        P.footSpread = 0.3;
        const kick = Math.sin(at * (grounded ? 26 : 21));
        const ka = grounded ? 0.3 : 0.26;
        P.footLy = 0.14 + Math.max(0, kick) * ka; P.footRy = 0.14 + Math.max(0, -kick) * ka;
        P.footLz = kick * 0.2 - spinLag * 0.12; P.footRz = -kick * 0.2 - spinLag * 0.12;
        if (plunge > 0) {
          // arms thrown out ahead into the plunge, legs trailing and kicking
          const pw = Math.sin(at * 30) * 0.25;
          P.armUpL += (1.45 + pw - P.armUpL) * plunge; P.armUpR += (1.45 - pw - P.armUpR) * plunge;
          P.armSwingL *= 1 - plunge * 0.7; P.armSwingR *= 1 - plunge * 0.7;
        }
        P.feetOnBody = 1;
        follow = 0;
        break;
      }
      case A.getup: {
        // anticipation: rock on the floor and squash flat to load the jelly -> BOING: kip-up
        // into the air stretched tall, flipping upright with a pirouette and arms flung up ->
        // splat landing (squash, puffs, floor ring) -> shake it off, still seeing stars
        dizzyTarget = focus ? 1 : 0;
        if (entered) {
          const from = pa === A.dive ? 1.4 : tAng[i];
          let L = wrapPi(from);
          if (Math.abs(L) < 0.6) L = L < 0 ? -HALF_PI : HALF_PI;
          lieAng[i] = L;
          getupLen[i] = pa === A.dive ? 0.27 : GETUP_S;
          popDone[i] = 0; landDone[i] = 0;
        }
        const D = getupLen[i];
        const big = D > 0.4 ? 1 : 0.45; // a dive's quick scramble is a smaller version
        const k = at / D;
        const L = lieAng[i];
        const sgn = L >= 0 ? 1 : -1;
        const kA = big > 0.5 ? 0.3 : 0.25, kP = big > 0.5 ? 0.64 : 0.62; // anticipation end, hop end
        if (k < kA) {
          const a = k / kA, sa = smooth(a);
          const rock = Math.sin(a * Math.PI * 2.5) * 0.3 * (0.35 + 0.65 * a) * big;
          P.pitch = L * (1 - 0.12 * sa) + sgn * rock;
          if (lieW[i] === lieW[i]) P.yawOff = wrapPi(lieW[i] - yaw);
          wBase = 1 - 0.46 * sa * big; // load the jelly: squash flat against the floor
          P.lift = 0.1 * Math.abs(Math.sin(L)) + 0.03;
          P.armUpL = 0.3 + Math.sin(a * 19) * 0.7; P.armUpR = 0.3 + Math.sin(a * 19 + 1.5) * 0.7;
          P.armSwingL = P.armSwingR = sgn * -1.0 * sa;
          const kk = Math.sin(at * 31);
          P.footLy = 0.1 + Math.max(0, kk) * 0.16; P.footRy = 0.1 + Math.max(0, -kk) * 0.16;
          P.footLz = P.footRz = 0.12 * sa;
          P.footSpread = 0.26;
          P.feetOnBody = 1;
          P.mouthOpen = 0.5;
        } else if (k < kP) {
          const a = (k - kA) / (kP - kA);
          if (!popDone[i]) { popDone[i] = 1; sqX[i] = -0.42 * big; sqV[i] = 9 * big; }
          const arc = Math.sin(a * Math.PI);
          const fl = easeOutBack(Math.min(1, a * 1.35));
          P.pitch = L * (1 - fl);
          P.lift = arc * 0.85 * big + 0.1 * Math.abs(Math.sin(P.pitch));
          // BOING: shot up tall and thin (arms straight up, legs tucked), round at the top, a
          // touch long again dropping in
          P.sy = 1 + big * (0.3 * (1 - a) * (1 - a) * smooth(a * 6) + 0.08 * smooth((a - 0.6) / 0.4));
          if (big > 0.5) P.yawOff = Math.sin(a * Math.PI) * 0.6 * (hash01(i, 9) < 0.5 ? 1 : -1);
          // untwists from lying across the course back to its heading as it flips upright
          if (lieW[i] === lieW[i]) P.yawOff += wrapPi(lieW[i] - yaw) * (1 - smooth(a * 1.6));
          P.armUpL = P.armUpR = -0.9 + 2.6 * smooth(a * 2.2);
          P.armSwingL = P.armSwingR = -0.3 * arc;
          P.footLy = P.footRy = 0.2 * arc; P.footLz = 0.12 * arc; P.footRz = -0.12 * arc;
          P.footSpread = 0.24;
          P.feetOnBody = 1;
          P.mouthOpen = 1;
        } else {
          const a = clamp((k - kP) / (1 - kP), 0, 1);
          if (!landDone[i]) {
            landDone[i] = 1; sqX[i] = -0.4 * big - 0.06; sqV[i] = 0; splatT[i] = 0.065 * big;
            if (fx && focus && big > 0.5) fx.ring(x, y, z, 0.42, 6, 0);
          }
          const d = 1 - a;
          P.pitch = -sgn * 0.18 * d * Math.cos(a * 9);
          P.yawOff = Math.sin(a * 26) * 0.5 * d * big; // shake it off
          P.roll = Math.sin(a * 19 + 1) * 0.24 * d * big;
          // ta-da: arms stay flung up and out on the landing, then flop down with a wobble
          P.armUpL = 1.55 - 1.7 * smooth(a * 1.2) + Math.sin(a * 26) * 0.45 * d;
          P.armUpR = 1.55 - 1.7 * smooth(a * 1.2) - Math.sin(a * 26) * 0.45 * d;
          P.footSpread = 0.3 * d + 0.22 * a;
          P.armSwingL = Math.sin(a * 18) * 0.45 * d; P.armSwingR = -P.armSwingL;
          P.mouthOpen = 0.7 * d;
        }
        follow = 0;
        break;
      }
      case A.stumble: {
        if (entered) sqV[i] -= 3.2;
        const d = Math.exp(-at * 2.2);
        P.roll = Math.sin(at * 13) * 0.55 * d; P.pitch = 0.5 * d + 0.12 - Math.sin(at * 9) * 0.2 * d; P.yawOff = Math.sin(at * 9) * 0.45 * d;
        P.armUpL = 1.0 + Math.sin(at * 19) * 0.8; P.armUpR = 1.0 - Math.sin(at * 19) * 0.8;
        P.armSwingL = Math.sin(at * 13) * 1.1; P.armSwingR = Math.cos(at * 13) * 1.1;
        phase[i] += h * 13;
        P.footLz = Math.sin(phase[i]) * 0.22; P.footRz = -P.footLz;
        P.footLy = Math.max(0, Math.sin(phase[i])) * 0.16; P.footRy = Math.max(0, -Math.sin(phase[i])) * 0.16;
        P.lift = Math.abs(Math.sin(phase[i])) * 0.12;
        P.mouthOpen = 0.7;
        dizzyTarget = focus ? 0.35 : 0;
        break;
      }
      case A.grab: {
        const tug = Math.sin(at * 9);
        P.pitch = -0.3 - tug * 0.08; P.armUpL = P.armUpR = 0.25; P.armFwdL = P.armFwdR = 1.3; P.sy = 1.05 + tug * 0.04;
        P.footLz = -0.12 + tug * 0.06; P.footRz = 0.1 - tug * 0.06;
        P.mouthOpen = 0.4;
        break;
      }
      case A.celebrate: {
        const hp = Math.abs(Math.sin(at * 6.5));
        P.lift = hp * 0.4; P.sy = 1 + (hp - 0.45) * 0.26;
        P.armUpL = 1.35 + Math.sin(at * 13) * 0.3; P.armUpR = 1.35 - Math.sin(at * 13) * 0.3;
        P.armSwingL = Math.sin(at * 13) * 0.3; P.armSwingR = -P.armSwingL;
        P.yawOff = Math.sin(at * 2.2) * 0.6; P.footLy = P.footRy = hp * 0.06;
        P.mouthOpen = 1;
        break;
      }
      case A.sad: {
        P.sy = 0.86; P.pitch = 0.25; P.roll = Math.sin(at * 1.4) * 0.08; P.sad = 1;
        P.armUpL = P.armUpR = -1.15; P.lift = 0;
        break;
      }
      default: { // idle: a staggered bouncy loop, glances around, sways, and now and then a gag
        idlePose(i, clock, h, x, y, z);
      }
    }

    // follow-through after a hard feet-first landing: arms flung up, knees out, mouth open
    if (landK[i] > 0 && (anim === A.run || anim === A.idle || anim === A.jump || anim === A.stumble)) {
      const lk = landK[i] * landK[i];
      P.armUpL += (1.4 - P.armUpL) * lk; P.armUpR += (1.4 - P.armUpR) * lk;
      P.armSwingL *= 1 - lk; P.armSwingR *= 1 - lk;
      P.footSpread += 0.1 * lk;
      P.mouthOpen = Math.max(P.mouthOpen, lk);
    }

    // ------------------------------------------------ jelly springs
    if (h > 0) {
      // body lag from acceleration (top trails behind when speeding up, swings ahead when braking)
      const ax = (vx - pvx) / Math.max(h, 1e-3), az = (vz - pvz) / Math.max(h, 1e-3);
      const af = clamp(ax * sY + az * cY, -60, 60), ar = clamp(ax * cY - az * sY, -60, 60);
      const tgtP = grounded ? -af * 0.012 : 0, tgtR = grounded ? ar * 0.01 : 0;
      const steps = Math.ceil(h / (1 / 120));
      const hh = h / steps;
      for (let s = 0; s < steps; s++) {
        if (splatT[i] <= 0) { sqV[i] += (-300 * sqX[i] - 10 * sqV[i]) * hh; sqX[i] += sqV[i] * hh; }
        lpV[i] += (180 * (tgtP - lpX[i]) - 9 * lpV[i]) * hh; lpX[i] += lpV[i] * hh;
        lrV[i] += (180 * (tgtR - lrX[i]) - 9 * lrV[i]) * hh; lrX[i] += lrV[i] * hh;
      }
      lpX[i] = clamp(lpX[i], -0.45, 0.45); lrX[i] = clamp(lrX[i], -0.4, 0.4);
      dizzyAmt[i] += (dizzyTarget - dizzyAmt[i]) * Math.min(1, h * (dizzyTarget > dizzyAmt[i] ? 8 : 2.2));
    }
    // impact squash rides on world-vertical (about the floor), so it flattens a Gumble whichever
    // way up it is lying
    {
      const sq = clamp(sqX[i], anim === A.tumble || anim === A.dive ? -0.62 : anim === A.getup ? -0.52 : -0.48, 0.4);
      if (sq > 0 && (anim === A.tumble || anim === A.dive)) {
        // a body lying down rebounds LONG (along itself), not tall: a vertical stretch of a body
        // on its back would read as it standing up
        const lying = Math.abs(Math.sin(P.pitch));
        P.wsq = wBase * (1 + sq * (1 - 0.8 * lying));
        P.sy *= 1 + sq * 0.9 * lying;
      } else P.wsq = wBase * (1 + sq);
    }
    // a Gumble stays a gumdrop: stretch never turns it into a tall egg
    if (P.sy > 1.28) P.sy = 1.28;
    if (P.sy * P.wsq > 1.28) P.wsq = 1.28 / P.sy;
    // squash along the blow during a hit-stop; stretch along the flight path in the air
    if (holding) {
      P.ax = hitAx[i]; P.ay = 0; P.az = hitAz[i]; P.ak = 1 - holdK[i];
    } else {
      if (h > 0) launchK[i] *= Math.exp(-h * 4.5);
      const v3 = Math.sqrt(vx * vx + vy * vy + vz * vz);
      if (flight > 0 && v3 > 1) {
        P.ax = vx / v3; P.ay = vy / v3; P.az = vz / v3;
        P.ak = 1 + flight * (clamp((v3 - 2) * 0.032, 0, 0.34) + launchK[i]);
        if (P.ak > 1.45) P.ak = 1.45;
        // a jelly rebound already stretching tall does not stretch twice along a vertical path
        if (P.wsq > 1) P.ak = Math.max(1, P.ak - (P.wsq - 1) * Math.abs(P.ay) * 1.5);
      }
    }
    P.ox = offP[i * 3]; P.oy = offP[i * 3 + 1]; P.oz = offP[i * 3 + 2];
    P.pitch += lpX[i] * follow;
    P.roll += lrX[i] * follow;
    P.sproutX = -lpX[i] * 1.6 - clamp(vy * 0.03, -0.3, 0.3) + Math.sin(clock * 3 + i) * 0.08 - sqX[i] * 0.8;
    P.sproutZ = -lrX[i] * 1.6 + Math.cos(clock * 2.6 + i) * 0.07;
    P.dizzy = dizzyAmt[i] > 0.02 ? dizzyAmt[i] : 0;

    // blink every few seconds (eyes squeeze shut on hard squashes)
    const bt = (clock * 0.31 + blinkSeed[i] * 7) % 3.7;
    P.blink = bt < 0.12 ? 0.12 : sqX[i] < -0.22 ? 0.35 : 1;

    if (h > 0) {
      prevV[i * 3] = vx; prevV[i * 3 + 1] = vy; prevV[i * 3 + 2] = vz;
      prevX[i * 3] = x; prevX[i * 3 + 1] = y; prevX[i * 3 + 2] = z;
      prevGrounded[i] = grounded ? 1 : 0;
      prevAnim[i] = anim;
    }
  }

  /**
   * Writes the world-space deformation for the pose just computed into a column-major 4x4 `e`
   * (THREE.Matrix4.elements), expressed in the bot's root frame (rootYaw = yaw + yawOff):
   * Sfloor(wsq, volume kept) * Saxis(ak along the world axis, volume kept). The caller places
   * it as mRoot * T(0, (lift + pivot) * wsq, 0) * e * R(pitch, roll) * ..., which equals squashing
   * about the floor (Sfloor * T) followed by the axis stretch about the body pivot.
   */
  function deform(e, rootYaw) {
    const f = P.wsq, b = 1 / Math.sqrt(f);
    const k = P.ak, a = 1 / Math.sqrt(k), d = k - a;
    const c = Math.cos(rootYaw), sn = Math.sin(rootYaw);
    const nx = P.ax * c - P.az * sn, ny = P.ay, nz = P.ax * sn + P.az * c;
    // Saxis = a I + d n n^T ; row r scaled by Sfloor[r] = (b, f, b)
    e[0] = b * (a + d * nx * nx); e[4] = b * d * nx * ny; e[8] = b * d * nx * nz; e[12] = 0;
    e[1] = f * d * ny * nx; e[5] = f * (a + d * ny * ny); e[9] = f * d * ny * nz; e[13] = 0;
    e[2] = b * d * nz * nx; e[6] = b * d * nz * ny; e[10] = b * (a + d * nz * nz); e[14] = 0;
    e[3] = 0; e[7] = 0; e[11] = 0; e[15] = 1;
  }

  return { P, pose, deform };
}

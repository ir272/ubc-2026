// Camera rig: one PerspectiveCamera, many shot types, frame-rate independent smoothing.
// Modes: follow, leader, overview (drone), track (trackside cinematic), plus flow/replay shots
// (intro flyover, start grid, finish, replay orbit). The director and round flow choose shots;
// this module only frames them.
import * as THREE from 'three';
import { COURSE } from '../../../sim/course.js';
import { ANIM_INDEX } from '../characters/gumble.js';
import { createSightlines } from './sightlines.js';
import { createBroadcast } from './broadcast.js';

const A_TUMBLE = ANIM_INDEX.tumble, A_STUMBLE = ANIM_INDEX.stumble;

export const USER_MODES = ['follow', 'leader', 'overview', 'track', 'director'];

const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);

export function createCameras(camera, info) {
  const pos = new THREE.Vector3(0, 30, -30);
  const look = new THREE.Vector3(0, 0, 20);
  let fov = 50;
  const dPos = new THREE.Vector3(), dLook = new THREE.Vector3();
  let dFov = 50;
  const heading = new THREE.Vector2(0, 1); // smoothed forward direction for follow cam
  const tmp = new THREE.Vector3(), tmp2 = new THREE.Vector3(), bp = new THREE.Vector3();
  const pack = new THREE.Vector3();
  let snap = true;
  let lastKey = '';
  let trackIdx = -1;
  let shotTime = 0;
  let orbit = 0;
  const S = { posLambda: 5, lookLambda: 9, fovLambda: 4 };
  const sight = createSightlines();
  const bc = createBroadcast(camera, info, sight);
  const bcOut = { pos: new THREE.Vector3(), look: new THREE.Vector3(), fov: 50, posLambda: 5, lookLambda: 9, recut: false };

  function botPos(view, id, out) {
    return out.set(view.botPos[id * 3], view.botPos[id * 3 + 1], view.botPos[id * 3 + 2]);
  }

  // ------------------------------------------------------------ shot framings
  // Follow cam: a chase boom on a smoothed pivot, the way a third-person game camera works.
  // Framing (1280x720): the subject is centred, its body ~13% of frame height at ~57% from the
  // top; the lens looks down ~16 deg, so the far end of the attic sits in the top quarter and the
  // course ahead fills the middle of the frame. The boom is about 6.6 m back and 3 m up (about
  // 7 body heights back, 3 up): high enough to see over the pack, low enough that the subject
  // reads as a body with arms and feet, not a top-down blob.
  //  - Distance never breathes: the pivot is stiff along the run (it lags under half a metre at a
  //    sprint) and soft only sideways, so a sidestep does not whip the lens. At speed the lens
  //    widens and the boom shortens to match (a dolly-zoom speed kick: the attic streams past
  //    faster while the subject keeps its size).
  //  - Yaw eases toward the run direction over ~1 s and is rate limited; there is never any roll.
  //  - On ramps the whole rig tips with the slope (the lens drops by the climb and pitches up
  //    with it), so a climb reads like flat ground with the top of the ramp in view.
  //  - Collision: at the marble dispenser the boom draws in to ~4 m and the lens ducks just under
  //    the tube bank with the subject (the tubes stay a band across the top of the frame), then
  //    lets out gently while the lens keeps moving (it never parks and lets the subject run
  //    away); over tall toys and the maze's cartwheeling blocks it climbs; it slides a little to
  //    keep the pack, posts and rolling marbles off the sight line and out of the lens. Gumbles
  //    looming near the lens or cut by the bottom edge fade out (see clearance()).
  const FOL = {
    back: 6.6, up: 3.0,   // boom, metres behind / above the subject's feet (flat ground)
    aimY: 0.5,            // subject body centre above the feet
    lowNdc: 0.14,         // subject sits this far below frame centre (NDC): ~57% from the top
    fov: 56, fovFast: 6,  // vertical FOV, plus up to this much at full sprint
    pivotZT: 0.05,        // pivot spring smoothing time along the course (s): stiff, distance holds
    pivotXT: 0.1,         // ... and across it (s): softer, sidesteps do not jerk the lens
    yawLambda: 1.3,       // heading easing (1/s)
    yawRate: 0.7,         // max heading turn rate (rad/s)
    runYaw: 0.22,         // how much of the heading comes from the subject's run direction
    centrePull: 0.12,     // the boom slides this share of the subject's offset back toward the centre-line
    slopeDrop: 0.8,       // share of the climb under the boom the lens drops by on a ramp
    slopeTilt: 0.2,       // extra share of the ramp angle the lens pitches with
  };
  const TAN0 = Math.tan(THREE.MathUtils.degToRad(FOL.fov) / 2);
  const fPivot = new THREE.Vector3(), fPivotV = new THREE.Vector3(), fPrevBp = new THREE.Vector3();
  const fVel = new THREE.Vector2();
  let fAimY = 0, fAimV = 0, fYaw = 0;
  let fGroundY = 0, fSlope = 0, fSpeed = 0, fLift = 0, fLiftT = 0, fSide = 0, fSideT = 0, fEval = 0, fBest = 0, fHold = 0, fLastId = -1;
  let fShake = 0, fPrevAnim = -1, fReach = 1, fReachT = 1, fCentre = 0, fClr = 0, fCapY = 1e3, fPitchOff = 0, fTuck = 1, fLowNdc = 0;
  // critically damped spring toward target (Unity-style SmoothDamp), per axis
  function spring(cur, vel, tgt, T, dt, axis) {
    const w = 2 / T, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
    const ch = cur[axis] - tgt, tmpV = (vel[axis] + w * ch) * dt;
    vel[axis] = (vel[axis] - w * tmpV) * e;
    cur[axis] = tgt + (ch + tmpV) * e;
  }
  function follow(view, id, dt) {
    botPos(view, id, bp);
    const vx = view.botVel[id * 3], vz = view.botVel[id * 3 + 2];
    const sp = Math.hypot(vx, vz);
    const grounded = view.botGrounded ? view.botGrounded[id] === 1 : true;
    const surf = info.surfaceY(bp.z);
    // a cut, a new subject or a respawn teleport (a jump of metres in one frame): rebuild the rig
    const teleport = fPrevBp.distanceToSquared(bp) > 16;
    fPrevBp.copy(bp);
    const fresh = snap || id !== fLastId || teleport;
    fLastId = id;
    if (fresh) {
      fPivot.copy(bp); fPivotV.set(0, 0, 0);
      fGroundY = grounded ? bp.y : Math.min(bp.y, Math.max(surf, bp.y - 1));
      fAimY = bp.y; fAimV = 0;
      fSlope = (info.surfaceY(bp.z + 3) - info.surfaceY(bp.z - 3)) / 6;
      fSpeed = sp; fShake = 0; fVel.set(vx, vz); fCapY = 1e3;
    }
    // Heading: anchored to the course direction, leaning a little toward where the subject runs
    // (its velocity, eased over ~0.3 s) and in toward the centre-line when it hugs an edge.
    // Eased and rate limited, so a swerve never swings the view. Never looks back.
    const kv = fresh ? 1 : damp(3.2, dt);
    fVel.x += (vx - fVel.x) * kv; fVel.y += (vz - fVel.y) * kv;
    const fsp = Math.hypot(fVel.x, fVel.y);
    // (On a ramp, yawing across the slope banks the deck in frame and reads as a rolled horizon:
    // there the lens keeps square to the climb.)
    const wv = FOL.runYaw * THREE.MathUtils.clamp((fsp - 1) / 2.5, 0, 1) * (grounded ? 1 : 0.6)
      * THREE.MathUtils.clamp(1 - Math.abs(fSlope) * 5.5, 0.2, 1);
    let rx0 = 0, rz0 = 1;
    if (wv > 0) { rx0 = fVel.x / fsp; rz0 = Math.max(0.85, fVel.y / fsp); const rl = Math.hypot(rx0, rz0); rx0 /= rl; rz0 /= rl; }
    let hx = rx0 * wv, hz = (1 - wv) + rz0 * wv;
    if (grounded) hx -= THREE.MathUtils.clamp((bp.x - info.centerX(bp.z)) / Math.max(4, info.halfWidth(bp.z)), -1, 1) * 0.1;
    const yawT = Math.atan2(hx, hz);
    if (fresh) fYaw = yawT;
    else {
      const dy = THREE.MathUtils.clamp((yawT - fYaw) * damp(FOL.yawLambda, dt), -FOL.yawRate * dt, FOL.yawRate * dt);
      fYaw += dy;
    }
    heading.set(Math.sin(fYaw), Math.cos(fYaw));
    // Heights: hops and dives barely move the lens (no bobbing). A fall off the course does not
    // drag the boom into the void: it stays near course level and tilts down to watch the drop.
    if (grounded) fGroundY = bp.y;
    const aimT = bp.y > fGroundY ? fGroundY + (bp.y - fGroundY) * 0.3 : bp.y;
    const boomT = Math.max(aimT, fGroundY - 2.5);
    if (!fresh) {
      // stiff along the course (the subject's size holds), soft across it
      spring(fPivot, fPivotV, bp.x, FOL.pivotXT, dt, 'x');
      spring(fPivot, fPivotV, bp.z, FOL.pivotZT, dt, 'z');
      spring(fPivot, fPivotV, boomT, 0.2, dt, 'y');
      const w = 2 / 0.12, x = w * dt, e = 1 / (1 + x + 0.48 * x * x + 0.235 * x * x * x);
      const ch = fAimY - aimT, tv = (fAimV + w * ch) * dt;
      fAimV = (fAimV - w * tv) * e; fAimY = aimT + (ch + tv) * e;
    }
    // Near an edge the boom slides part of the way back toward the centre-line: the lens rides
    // over the course, not over the props beside it. (Not while airborne: a Gumble going over the
    // edge is followed square on.)
    const cTgt = grounded ? THREE.MathUtils.clamp(-(bp.x - info.centerX(bp.z)) * FOL.centrePull, -1.0, 1.0) : 0;
    fCentre += (cTgt - fCentre) * (fresh ? 1 : damp(1.0, dt));
    // Speed (eased) widens the lens; the boom shortens to match, so the subject keeps its size
    // while the course streams past faster. Slope (eased) tips the whole rig.
    fSpeed += (sp - fSpeed) * (fresh ? 1 : damp(2.2, dt));
    const fast = THREE.MathUtils.clamp((fSpeed - 3) / 5, 0, 1);
    const fovNow = FOL.fov + FOL.fovFast * fast * fast * (3 - 2 * fast);
    const tanH = Math.tan(THREE.MathUtils.degToRad(fovNow) / 2);
    const slope = (info.surfaceY(fPivot.z + 3) - info.surfaceY(fPivot.z - 3)) / 6;
    fSlope += (slope - fSlope) * (fresh ? 1 : damp(2, dt));
    const back = FOL.back * TAN0 / tanH;
    // Boom placement: climb and/or slide a little so neither the pack, a tall toy nor a passing
    // marble or metronome weight hides the subject or parks in front of the lens. Candidates are
    // scored ~6x a second, now and 0.4 / 0.9 s ahead; the boom eases between them (climbing and
    // dodging quicker than it settles back, and only after the way has been clear for a while).
    fEval -= dt; fHold -= dt;
    if (fresh || fEval <= 0) {
      fEval = 0.16;
      let best = Infinity;
      for (let j = 0; j < BOOMS.length; j++) {
        const sd = BOOMS[j][0], lf = BOOMS[j][1], bm = back * BOOMS[j][2];
        const pen = boomPenalty(view, id, fPivot.x, fPivot.y, fPivot.z, bm, sd, lf, 0)
          + boomPenalty(view, id, fPivot.x + vx * 0.4, fPivot.y, fPivot.z + vz * 0.4, bm, sd, lf, 0.4) * 0.7
          + boomPenalty(view, id, fPivot.x + vx * 0.9, fPivot.y, fPivot.z + vz * 0.9, bm, sd, lf, 0.9) * 0.4;
        const score = pen + lf * 1.3 + Math.abs(sd) * 1.6 + (1 - BOOMS[j][2]) * 6
          + (sd === fSideT && lf === fLiftT && BOOMS[j][2] === fReachT ? -1.0 : 0);
        if (score < best) { best = score; fBest = j; }
      }
      const nl = BOOMS[fBest][1], ns = BOOMS[fBest][0], nr = BOOMS[fBest][2];
      if (fresh || nl > fLiftT || Math.abs(ns) > Math.abs(fSideT) || nr < fReachT || fHold <= 0) {
        if (nl > fLiftT + 0.05 || Math.abs(ns) > Math.abs(fSideT) + 0.05 || nr < fReachT - 0.05) fHold = 1.0;
        fSideT = ns; fLiftT = nl; fReachT = nr;
      }
      if (fresh) { fSide = fSideT; fLift = fLiftT; fReach = fReachT; }
    }
    fLift += (fLiftT - fLift) * damp(fLiftT > fLift ? 2.6 : 1.4, dt);
    fSide += (fSideT - fSide) * damp(Math.abs(fSideT) > Math.abs(fSide) ? 1.8 : 1.0, dt);
    fReach += (fReachT - fReach) * damp(fReachT < fReach ? 2.2 : 1.2, dt);
    // Under the marble dispenser's tube bank the boom draws in (to ~4 m), so the lens slips under
    // the tube mouths with the subject instead of staring into them from the front with the
    // subject squeezed into the slit beneath; past the bank it lets out again gently.
    const tuckT = gantryZone(fPivot.x, fPivot.z) ? GC_TUCK / back : 1;
    fTuck += (tuckT - fTuck) * (fresh ? 1 : damp(tuckT < fTuck ? 3 : 0.9, dt));
    let bk = back * Math.min(fReach, fTuck) + fLift * 0.3;
    // On a ramp the rig tips with the slope: the lens drops by (most of) the climb under the boom,
    // so it sits as high above the deck behind the subject as it would on the flat.
    let up = FOL.up + fLift - fSlope * bk * FOL.slopeDrop;
    // Over a row of cartwheeling giant blocks the boom rides above their reach (a block tipping up
    // on its edge right under a low lens fills the whole frame), and pulls back a little so the
    // view tips down less.
    const clrT = Math.max(0, clearAt(fPivot.z - heading.y * bk) - (fPivot.y + up));
    fClr += (clrT - fClr) * (fresh ? 1 : damp(clrT > fClr ? 3 : 1.2, dt));
    up += fClr; bk += fClr * 0.35;
    const rx = heading.y, rz = -heading.x; // lens-right on the ground plane
    const side = fSide + fCentre;
    dPos.set(fPivot.x - heading.x * bk + rx * side, fPivot.y + up, fPivot.z - heading.y * bk + rz * side);
    // Never let a slope or a dip put the lens near the deck behind the subject.
    const deck = info.surfaceY(dPos.z) + 1.6;
    if (dPos.y < deck && Math.abs(dPos.x - info.centerX(dPos.z)) < info.halfWidth(dPos.z) + 1) dPos.y = deck;
    // Overhangs (the marble dispenser's tubes): the lens keeps its full boom length and ducks
    // just under them, starting a moment before it reaches them (the cap looks ahead along the
    // lens's own travel), then rises straight back out. Eased: down fast, up gently.
    const capT = gantryCap(dPos.x, dPos.z - 0.15, dPos.z + 1.5 + Math.max(0, vz) * 0.45);
    if (fresh) fCapY = capT;
    else {
      fCapY = Math.min(fCapY, dPos.y + 0.3); // ease from where the lens is, not from the sky
      fCapY += (capT - fCapY) * damp(capT < fCapY ? 6 : 3.2, dt);
    }
    if (dPos.y > fCapY) dPos.y = Math.max(fCapY, info.surfaceY(dPos.z) + 1.2);
    const capHard = gantryCap(dPos.x, dPos.z - 0.05, dPos.z + 0.05);
    if (dPos.y > capHard) dPos.y = capHard;
    // Aim: through the subject's body centre, then tilt up so it sits under frame centre with the
    // course ahead above it. A boom slid sideways (dodging, or pulled toward the centre-line) does
    // not swing the whole view round to stare across the course: the aim slides a third as far.
    // (Across the course the aim follows the subject itself more than the soft pivot, so a
    // sidestep keeps it centred instead of sliding it off to one side.)
    const tx = fPivot.x + (bp.x - fPivot.x) * 0.5, tz = fPivot.z;
    const ax = tx + rx * side * 0.3 - dPos.x, az = tz + rz * side * 0.3 - dPos.z, hd = Math.hypot(ax, az) || 1;
    const toSubj = Math.atan2(fAimY + FOL.aimY - dPos.y, hd);
    // (a climbing boom lets the subject sit a little lower instead of tipping the whole view down)
    // An overhang ahead (the dispenser's tube bank) stays in the top fifth of the frame: the lens
    // tips down (the subject rides a little higher, never above the top quarter) instead of
    // staring into the tube mouths.
    const edgeE = gantryEdge(dPos.x, dPos.y, dPos.z);
    // A lens forced low (ducking under an overhang) lets the subject sit lower in frame, so the
    // view ahead fills the frame instead of the deck at the subject's feet.
    const lowT = edgeE > 0.55 ? THREE.MathUtils.clamp((2.3 - (dPos.y - fAimY)) / 0.9, 0, 1) * 0.12 : 0;
    fLowNdc += (lowT - fLowNdc) * (fresh ? 1 : damp(2, dt));
    let pitch = Math.max(-1.15, toSubj + Math.atan((FOL.lowNdc + fLowNdc + Math.min(fLift + fClr, 2.5) * 0.04) * tanH) + Math.atan(fSlope) * FOL.slopeTilt);
    const offT = Math.max(-0.09, Math.min(0, Math.max(toSubj - Math.atan(0.3 * tanH), edgeE - Math.atan(0.62 * tanH)) - pitch));
    fPitchOff += (offT - fPitchOff) * (fresh ? 1 : damp(2.5, dt));
    pitch += fPitchOff;
    const reach = 12, hy = Math.cos(pitch) * reach / hd;
    dLook.set(dPos.x + ax * hy, dPos.y + Math.sin(pitch) * reach, dPos.z + az * hy);
    // A hard knock on the subject gives the lens a short, small jolt.
    const anim = view.botAnim ? view.botAnim[id] : 0;
    if (!fresh && anim !== fPrevAnim && (anim === A_TUMBLE || anim === A_STUMBLE)) fShake = anim === A_TUMBLE ? 1 : 0.5;
    fPrevAnim = anim;
    if (fShake > 0.01) {
      fShake *= Math.exp(-7 * dt);
      const a = fShake * 0.08;
      dPos.x += Math.sin(shotTime * 53) * a; dPos.y += Math.sin(shotTime * 61 + 1.3) * a * 0.7;
    }
    dFov = fovNow;
    // The rig is already smoothed: hand it to the lens 1:1 (no second, lagging ease).
    S.posLambda = 1e4; S.lookLambda = 1e4; S.fovLambda = 4;
  }

  // Tall static toys a follow lens must see over: alphabet blocks / sliders, spinning-top posts.
  // Padded AABBs [minX, minY, minZ, maxX, maxY, maxZ, bulky], from the course data (static, read
  // once). Bulky ones (blocks) also keep the lens at a distance; thin posts only must not hide the
  // subject.
  const tall = [];
  for (const o of COURSE?.obstacles || []) {
    if ((o.type === 'block' || (o.type === 'slider' && o.mode !== 'tumble')) && o.size) {
      const cy = o.pos?.y ?? o.y ?? 0, cx = o.pos?.x ?? o.x, cz = o.pos?.z ?? o.z;
      const lo = o.type === 'slider' ? cy : cy - o.size.y / 2, hi = lo + o.size.y;
      const px = o.size.x / 2 + 0.35 + (o.type === 'slider' ? (o.travel ?? 0) : 0), pz = o.size.z / 2 + 0.35;
      tall.push([cx - px, lo, cz - pz, cx + px, hi + 0.45, cz + pz, 1]);
    } else if (o.type === 'spinner' && o.postRadius) {
      const r = o.postRadius + 0.3, b = o.y ?? 0;
      tall.push([o.x - r, b, o.z - r, o.x + r, b + (o.height ?? 2.4) + 0.4, o.z + r, 0]);
    }
  }
  // Big set-dressing props beside the course (book stacks, jars, lamps...): their anchors are
  // course data; footprint half-size / height per kind are rough unscaled sizes of the props the
  // environment builds (rotation ignored: conservative), unknown kinds get a generic box. The
  // lens keeps a wide berth from them so none fills a third of the frame.
  const PROP_SIZE = { boardGameBox: [4.1, 2.1], diceStack: [1.4, 5.6], teddyBear: [2.2, 5.7], spinningTopPile: [3, 3],
    marbleJar: [2.3, 5.6], bookStack: [3.5, 5.3], pencilCup: [1.5, 7.4], deskLamp: [3, 5.4], crayonBox: [2, 4.6],
    metronomeCase: [1.8, 5], toyTrain: [2.6, 4.4], blockTower: [1.4, 9.6], globe: [2.2, 6.6], trophyShelf: [8, 3] };
  // Spinning-top arm sweeps [x, z, reach, armTopY]: a lens riding low over one has the arm swing
  // through the bottom of the frame every half turn.
  const sweeps = [];
  for (const o of COURSE?.obstacles || []) {
    if (o.type === 'spinner' && o.radius) sweeps.push([o.x, o.z, o.radius + 0.7, (o.y ?? 0) + (o.armTop ?? 1)]);
  }
  const props = [];
  for (const d of COURSE?.decor || []) {
    if (!d.pos || d.kind === 'atticWindow' || d.kind === 'roofBeam') continue;
    const sc = d.scale ?? 1, [hr, ht] = PROP_SIZE[d.kind] || [3, 5], r = hr * sc + 0.8;
    props.push([d.pos.x - r, d.pos.z - r, d.pos.x + r, d.pos.z + r, d.pos.y + ht * sc]);
  }
  const segHits = (ax, ay, az, bx, by, bz) => {
    const minZ = Math.min(az, bz) - 2, maxZ = Math.max(az, bz) + 2;
    for (let i = 0; i < tall.length; i++) {
      const b = tall[i];
      if (b[5] < minZ || b[2] > maxZ) continue;
      // slab test on the segment a->b
      let t0 = 0, t1 = 1, ok = true;
      for (let k = 0; k < 3 && ok; k++) {
        const o = k === 0 ? ax : k === 1 ? ay : az, d = (k === 0 ? bx : k === 1 ? by : bz) - o;
        if (Math.abs(d) < 1e-6) { if (o < b[k] || o > b[k + 3]) ok = false; continue; }
        let u0 = (b[k] - o) / d, u1 = (b[k + 3] - o) / d;
        if (u0 > u1) { const s = u0; u0 = u1; u1 = s; }
        if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1;
        if (t0 > t1) ok = false;
      }
      if (ok) return b[6] ? 2 : 1;
    }
    return 0;
  };
  // How far the lens at (cx,cy,cz) sinks into the 'keep clear' shell around tall toys
  // (2 m around, 1.2 m above): 0 when clear. Inside it a block fills the lower frame. (Wider and a
  // maze corridor is never clear: the lens would crane up out of every corridor.)
  const SHELL_R = 2.0, SHELL_UP = 1.2, PROP_R = 5.5;
  function lensCrowd(cx, cy, cz) {
    let pen = 0;
    for (let i = 0; i < tall.length; i++) {
      const b = tall[i];
      if (!b[6]) continue;
      if (b[5] < cz - SHELL_R || b[2] > cz + SHELL_R || b[3] < cx - SHELL_R || b[0] > cx + SHELL_R) continue;
      const dx = Math.max(b[0] - cx, 0, cx - b[3]), dz = Math.max(b[2] - cz, 0, cz - b[5]);
      if (dx * dx + dz * dz > SHELL_R * SHELL_R) continue;
      const under = b[4] + SHELL_UP - cy;
      if (under > 0) pen = Math.max(pen, 2 + under * 1.5);
    }
    for (let i = 0; i < props.length; i++) {
      const b = props[i];
      if (b[3] < cz - PROP_R || b[1] > cz + PROP_R || b[2] < cx - PROP_R || b[0] > cx + PROP_R || cy > b[4] + 6) continue;
      const dx = Math.max(b[0] - cx, 0, cx - b[2]), dz = Math.max(b[1] - cz, 0, cz - b[3]);
      const h = Math.sqrt(dx * dx + dz * dz);
      if (h < PROP_R) pen = Math.max(pen, 2 + (PROP_R - h) * 1.8);
    }
    for (let i = 0; i < sweeps.length; i++) {
      const w = sweeps[i], dx = cx - w[0], dz = cz - w[1];
      if (dx * dx + dz * dz < w[2] * w[2] && cy < w[3] + 2.4) pen = Math.max(pen, 0.9);
    }
    return pen;
  }
  // Moving toys big enough to fill the frame if they pass the lens: rolling marbles and metronome
  // weights. Indices into view.obsPos (same order as the course data), with a radius and a
  // forward speed for marbles (they roll back down the ramp toward the lens), a lens margin and
  // how much hiding the subject behind one costs.
  const movers = [];
  (COURSE?.obstacles || []).forEach((o, j) => {
    if (o.type === 'marble') movers.push([j, (o.r ?? 1) + 0.2, o.speed ?? 0, 2.6, 1]); // a big ball close beside the lens fills a third of the frame
    else if (o.type === 'pendulum') movers.push([j, Math.max(o.bobRadius ?? 1, o.bobHalfZ ?? 1) + 0.35, 0, 2.4, 1]);
    else if (o.type === 'slider' && o.mode === 'tumble' && o.size) movers.push([j, o.size.x * 0.8, 0, 2.6, 4]); // cartwheeling maze blocks: a whole wall
  });
  // Lowest lens y over the course, by z: above the reach of the maze's cartwheeling 4 m blocks
  // (their sweep rows, with a margin), spread and softened along z so the boom eases up once
  // for the whole maze instead of bobbing row by row. Sampled every half metre from the data.
  const CLR_Z0 = -40, CLR_N = 1000;
  const clr = new Float32Array(CLR_N).fill(-1e3);
  {
    const raw = new Float32Array(CLR_N).fill(-1e3);
    for (const o of COURSE?.obstacles || []) {
      if (o.type !== 'slider' || o.mode !== 'tumble' || !o.size) continue;
      const top = (o.y ?? 0) + Math.max(o.size.x, o.size.y) * 1.42 + 0.9, hz = o.size.z / 2 + 2.6;
      for (let k = Math.max(0, Math.floor((o.z - hz - CLR_Z0) * 2)); k <= Math.min(CLR_N - 1, Math.ceil((o.z + hz - CLR_Z0) * 2)); k++) raw[k] = Math.max(raw[k], top);
    }
    const W = 8; // +-4 m: bridge the gaps between rows
    for (let k = 0; k < CLR_N; k++) {
      let m = -1e3;
      for (let j = Math.max(0, k - W); j <= Math.min(CLR_N - 1, k + W); j++) m = Math.max(m, raw[j]);
      clr[k] = m;
    }
  }
  const clearAt = (z) => clr[Math.max(0, Math.min(CLR_N - 1, Math.round((z - CLR_Z0) * 2)))];
  // Overhangs the subject runs under: the marble dispenser's spout tubes and beam at the top of
  // the ramp, modelled from the same marble data the course view builds them from. GC holds the
  // highest lens y under them per quarter metre of z (their underside, with a lens margin) over
  // the x span of the tube bank; elsewhere the sky is the limit.
  const GC = { z0: 0, n: 0, xr: -1, cap: null, edge: [] };
  {
    const ms = (COURSE?.obstacles || []).filter((o) => o.type === 'marble' && o.ramp);
    if (ms.length) {
      const rp = ms[0].ramp, r = ms[0].r ?? 1, tilt = 0.85, tr = r + 0.28, tubeL = 3.6;
      const lanes = ms.map((o) => Math.abs(o.lane ?? o.x ?? 0));
      const my = rp.y1 + r + 0.15 + tr * Math.sin(tilt) * 0.2 + 1.25, mz = rp.z1 - r * 0.2;
      const az = Math.sin(tilt), ay = Math.cos(tilt), nz = Math.cos(tilt), ny = -Math.sin(tilt);
      // underside of the tube bank in the yz plane: mouth rim top -> rim bottom -> back end bottom
      const p0z = mz - nz * tr, p0y = my - ny * tr, p1z = mz + nz * tr, p1y = my + ny * tr;
      const p2z = p1z + az * tubeL, p2y = p1y + ay * tubeL;
      const gz = rp.z1 + 0.6, beamLo = rp.y1 + 2 * r + 3.4 - 0.5;
      const under = (z) => {
        let u = 1e3;
        if (z >= p0z && z <= p1z) u = p0y + (p1y - p0y) * (z - p0z) / (p1z - p0z);
        else if (z > p1z && z <= p2z) u = p1y + (p2y - p1y) * (z - p1z) / (p2z - p1z);
        if (z > gz - 0.65 && z < gz + 0.65) u = Math.min(u, beamLo);
        return u;
      };
      const M = 0.4; // lens margin (m)
      GC.z0 = p0z - 2; GC.n = Math.ceil((p2z - p0z + 4) * 4) + 1; GC.xr = Math.max(...lanes) + tr + 0.7;
      GC.cap = new Float32Array(GC.n);
      GC.edge = [p0z, p0y, p1z, p1y, p2z, p2y]; // underside polyline (z, y pairs)
      for (let k = 0; k < GC.n; k++) {
        const z = GC.z0 + k * 0.25;
        let m = 1e3;
        for (let q = -M; q <= M + 1e-6; q += 0.1) m = Math.min(m, under(z + q));
        GC.cap[k] = m - M;
      }
    }
  }
  // Is a subject at (x, z) passing under the tube bank (from just before it to just past it)?
  const GC_TUCK = 4.0;
  const gantryZone = (x, z) => GC.cap !== null && Math.abs(x) < GC.xr && z > GC.edge[0] - 1.5 && z < GC.edge[4] + 2.0;
  // Lowest elevation angle (rad) from a lens at (x, y, z) to the underside of an overhang ahead of
  // it; Infinity when there is none in view.
  function gantryEdge(x, y, z) {
    if (!GC.cap || Math.abs(x) > GC.xr) return Infinity;
    const e = GC.edge;
    let m = Infinity;
    for (let k = 0; k < e.length; k += 2) {
      const dz = e[k] - z;
      if (dz > 0.3) m = Math.min(m, Math.atan2(e[k + 1] - y, dz));
    }
    return m;
  }
  // Highest lens y anywhere along z in [zA, zB] at x.
  function gantryCap(x, zA, zB) {
    if (!GC.cap || Math.abs(x) > GC.xr) return 1e3;
    const k0 = Math.max(0, Math.floor((zA - GC.z0) * 4)), k1 = Math.min(GC.n - 1, Math.ceil((zB - GC.z0) * 4));
    let cap = 1e3;
    for (let k = k0; k <= k1; k++) if (GC.cap[k] < cap) cap = GC.cap[k];
    return cap;
  }
  // [sideways, climb, reach] boom offsets (metres, metres, boom-length factor); the first is the
  // home framing. Climbs stay modest (a big climb tips the view into a top-down crane shot and
  // the course ahead leaves the frame), slides stay small (a big slide swings the view), and the
  // boom never tucks in far (the subject would balloon in size).
  const BOOMS = [[0, 0, 1], [0, 0.5, 1], [0, 1.0, 1.03], [0.9, 0.2, 1], [-0.9, 0.2, 1], [1.6, 0.4, 1], [-1.6, 0.4, 1],
    [0, 0.5, 0.86], [0, 1.0, 0.8], [0.9, 0.8, 0.82], [-0.9, 0.8, 0.82], [0, 1.8, 0.92]];
  function boomPenalty(view, id, px, py, pz, back, sd, lf, ahead) {
    const bk = back + lf * 0.3;
    const so = sd + fCentre, cx = px - heading.x * bk + heading.y * so, cz = pz - heading.y * bk - heading.x * so, cy = py + FOL.up + lf - fSlope * bk * FOL.slopeDrop;
    // pack: bodies on the sight lines to the subject's centre and its crown
    let pen = Math.min(4, occlusion(view, id, cx, cy, cz, px, py + 0.55, pz, 1.2, 0.8) * 2.2 + occlusion(view, id, cx, cy, cz, px, py + 0.95, pz, 1.2, 0.7) * 0.8);
    // tall toys: the subject's crown and body centre must both be in clear view
    // (a thin post only briefly clipping the view costs little; a solid block wall costs a lot)
    if (tall.length) {
      const hit = Math.max(segHits(cx, cy, cz, px, py + 1.0, pz), segHits(cx, cy, cz, px, py + 0.4, pz));
      if (hit) pen += hit === 2 ? 30 : 2.5;
    }
    // and the lens itself rides well clear of them, or a block beside it fills half the frame
    pen += lensCrowd(cx, cy, cz);
    // marbles / metronome weights: not on the sight line, and never right in front of the lens
    const sx = px - cx, sy = py + 0.55 - cy, sz = pz - cz, len2 = sx * sx + sy * sy + sz * sz || 1;
    for (let i = 0; i < movers.length; i++) {
      const m = movers[i], j = m[0], r = m[1];
      const ox = view.obsPos[j * 3] - cx, oy = view.obsPos[j * 3 + 1] - cy, oz = view.obsPos[j * 3 + 2] - cz - m[2] * ahead;
      if (oz > 26 || oz < -6 || ox > 12 || ox < -12) continue;
      const dc = Math.sqrt(ox * ox + oy * oy + oz * oz);
      if (dc < r + m[3]) pen += 3 + (r + m[3] - dc) * 2;
      const t = (ox * sx + oy * sy + oz * sz) / len2;
      if (t > 0 && t < 1) {
        const dx = ox - sx * t, dy = oy - sy * t, dz = oz - sz * t;
        const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
        if (d < r + 0.35) pen += (2.5 + (1 - t) * 2) * m[4];
      }
    }
    return pen;
  }

  // How badly other Gumbles block the line from (cx,cy,cz) to the subject at (tx,ty,tz).
  function occlusion(view, selfId, cx, cy, cz, tx, ty, tz, nearR = 1.8, lineR = 1.1) {
    const sx = tx - cx, sy = ty - cy, sz = tz - cz;
    const len2 = sx * sx + sy * sy + sz * sz || 1;
    let pen = 0;
    const N = view.botStatus.length;
    for (let i = 0; i < N; i++) {
      if (i === selfId || view.botHidden[i]) continue;
      const ox = view.botPos[i * 3] - cx, oy = view.botPos[i * 3 + 1] + 0.6 - cy, oz = view.botPos[i * 3 + 2] - cz;
      const dc = Math.sqrt(ox * ox + oy * oy + oz * oz);
      const t = (ox * sx + oy * sy + oz * sz) / len2;
      if (dc < nearR && t > -0.05) pen += 1.5 + (nearR - dc); // right in front of the lens: fills the frame
      if (t < 0 || t > 0.92) continue;
      const dx = ox - sx * t, dy = oy - sy * t, dz = oz - sz * t;
      const d = Math.sqrt(dx * dx + dy * dy + dz * dz);
      if (d < lineR) pen += 1 + (lineR - d);
    }
    return pen;
  }

  // Close-up: low 3/4 FRONT view relative to where the subject faces, so its face is always in
  // shot. The angle (within the front arc only) is chosen so no other Gumble stands between the
  // lens and the subject; anything that still does is faded by clearance().
  let closeA = 0.5, closeTargetA = 0.5, closeEval = 0, closeYaw = 0;
  const CLOSE_ANGLES = [0.5, 0.2, 0.85, -0.2, -0.55, 1.1];
  const wrapPi = (a) => Math.atan2(Math.sin(a), Math.cos(a));
  function closeup(view, id, dt) {
    botPos(view, id, bp);
    const yaw = view.botYaw[id];
    if (snap) closeYaw = yaw; else closeYaw += wrapPi(yaw - closeYaw) * damp(1.4, dt);
    const r = 3.4, h = 1.2;
    closeEval -= dt;
    if (snap || closeEval <= 0) {
      closeEval = 0.35;
      let best = closeTargetA, bestScore = Infinity;
      for (let k = 0; k < CLOSE_ANGLES.length; k++) {
        const a = CLOSE_ANGLES[k];
        const w = closeYaw + a;
        const pen = occlusion(view, id, bp.x + Math.sin(w) * r, bp.y + h, bp.z + Math.cos(w) * r, bp.x, bp.y + 0.6, bp.z, 2.4, 0.95);
        const score = pen * 10 + Math.abs(a - 0.5) * 0.6 + (a === closeTargetA ? -0.8 : 0);
        if (score < bestScore) { bestScore = score; best = a; }
      }
      closeTargetA = best;
      if (snap) closeA = best;
    }
    closeA += (closeTargetA - closeA) * damp(2.2, dt);
    const w = closeYaw + closeA + Math.sin(shotTime * 0.25) * 0.08;
    // lead the lens by the subject's velocity over the easing time constant, so a Gumble running
    // toward the camera does not close the distance (eased position lags by ~v / posLambda)
    const lead = 1 / 5;
    dPos.set(bp.x + Math.sin(w) * r + view.botVel[id * 3] * lead, bp.y + h, bp.z + Math.cos(w) * r + view.botVel[id * 3 + 2] * lead);
    dLook.set(bp.x, bp.y + 0.6, bp.z);
    dFov = 44;
    S.posLambda = 5; S.lookLambda = 10;
  }

  // Leader, drone and trackside shots are broadcast framings planned against the course's sight
  // lines (see broadcast.js / sightlines.js).
  function broadcastShot(mode, view, id, dt, shot) {
    bcOut.recut = false;
    if (mode === 'leader') bc.leader(view, id, dt, snap, shotTime, bcOut);
    else if (mode === 'track') bc.track(view, id, dt, snap, shotTime, bcOut);
    else if (mode === 'cutline') bc.cutline(view, shot.members || [], id, dt, snap, bcOut);
    else if (mode === 'sideline') bc.sideline(view, shot.members || [], dt, snap, bcOut, shot);
    else if (mode === 'zone') bc.zone(view, shot, dt, snap, bcOut);
    else bc.overview(view, id, dt, snap, shotTime, bcOut, shot.scope);
    if (bcOut.recut) snap = true;
    dPos.copy(bcOut.pos); dLook.copy(bcOut.look); dFov = bcOut.fov;
    S.posLambda = bcOut.posLambda; S.lookLambda = bcOut.lookLambda;
  }

  // Highest y a lens may occupy at (x, z): under the attic roof and tie beams. Without a shell
  // (tools that build a bare course) the sky is the limit.
  const ceilingAt = (x, z) => (info.interior ? info.interior.ceilingY(x, z) : Infinity);

  function section(view, idx, dt) {
    const pts = info.trackPoints;
    const p = pts[Math.max(0, Math.min(pts.length - 1, idx))];
    dPos.set(p.x, p.y + 4, p.z + 2);
    dLook.set(p.lookX ?? 0, info.surfaceY(p.z - 12), p.z - 14);
    dFov = 50;
    S.posLambda = 30; S.lookLambda = 30;
  }

  function intro(view, t) {
    // t in 0..1: sweeping flyover from the finish back toward the start line.
    const z0 = info.finishZ + 18, z1 = info.startZ + 22;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    const z = z0 + (z1 - z0) * e;
    const h = 34 - 24 * e;
    const x = Math.sin(t * Math.PI * 1.5) * 16;
    dPos.set(info.centerX(z) + x, info.surfaceY(z) + h, z);
    const lz = z - 26 - 10 * (1 - e);
    dLook.set(info.centerX(lz) + x * 0.2, info.surfaceY(lz), lz);
    dFov = 55;
    S.posLambda = 30; S.lookLambda = 30;
  }

  function startGrid(view, t) {
    // In front of the grid looking back at the lined-up Gumbles, slow push-in.
    const g = info.gridCenter;
    dPos.set(g.x + 4 - t * 3, g.y + 4.2 - t * 1.4, g.z + 14 - t * 5);
    dLook.set(g.x, g.y + 0.6, g.z - 1);
    dFov = 50;
    S.posLambda = 30; S.lookLambda = 30;
  }

  function finish(view, t) {
    const f = info.finishPos;
    const a = 0.6 + t * 0.05;
    dPos.set(f.x + Math.sin(a) * 15, f.y + 6.5, f.z + 10 + Math.cos(a) * 8);
    dLook.set(f.x, f.y + 0.5, f.z + 3);
    dFov = 48;
    S.posLambda = 2; S.lookLambda = 3;
  }

  // Finish-line camera: past the line, looking back at the last ten metres with the line across
  // the lower part of the picture. `shot.high` puts it well above the line looking down (the stage
  // lifts the banner out for that); otherwise it sits low, under the banner. A slow drift.
  function finishLine(view, shot) {
    const f = info.finishPos;
    const side = shot.side ?? 1;
    const drift = Math.sin(shotTime * 0.4) * 0.8;
    if (shot.line) {
      // beside the line, a little above head height, looking back down the course: it stands
      // still and pans with whoever is taking the place, who grows in the frame all the way in
      const lim = Math.max(1, info.halfWidth(f.z) - 2.5); // inside the arch's posts
      dPos.set(Math.max(-lim, Math.min(lim, shot.camX ?? f.x)), f.y + 3.6, f.z + 7.0);
      dLook.set(shot.xAim ?? f.x, f.y + 0.5, Math.max(f.z - 14, Math.min(f.z - 1.2, (shot.zAim ?? f.z) + 0.3)));
      dFov = 42;
      S.posLambda = 30; S.lookLambda = shotTime < 0.05 ? 30 : 7;
      return;
    }
    if (shot.high) {
      dPos.set(f.x + side * (2.6 + drift), f.y + (shot.height ?? 8.6), f.z + (shot.back ?? 6.2));
      dLook.set(f.x, f.y + 0.3, f.z - (shot.ahead ?? 3.6));
      dFov = shot.fov ?? 48;
    } else {
      dPos.set(f.x + side * (3.0 + drift), f.y + 4.5, f.z + 7.8);
      dLook.set(f.x, f.y + 0.7, f.z - 3.0);
      dFov = 50;
    }
    S.posLambda = 3; S.lookLambda = 4;
  }

  // The grid from above and in front, at the lock and through the 3 2 1: every starter in one
  // frame, looking down past their heads, pushing in slowly. `t` runs 0..1.
  function gridTop(view, shot) {
    const g = info.grid || { minX: -8, maxX: 8, frontZ: info.gridCenter.z, backZ: info.gridCenter.z, y: info.gridCenter.y };
    const cx = (g.minX + g.maxX) / 2, w = Math.max(6, g.maxX - g.minX + 3);
    const t = shot.t ?? 0;
    const dist = w * 0.62 + 3.5 - t * 1.6 + (shot.pull ?? 0); // fits the row's width at this lens; `pull` starts it further out
    const pitch = shot.pitch ?? 0.95;      // radians down from level
    const midZ = (g.frontZ + g.backZ) / 2;
    dPos.set(cx + (shot.side ?? 0) * 1.5, g.y + 0.6 + Math.sin(pitch) * dist, midZ + Math.cos(pitch) * dist);
    dLook.set(cx, g.y + 0.6, midZ + dist * 0.16); // aim a little short, so the grid sits in the upper half of the frame
    dFov = 56;
    S.posLambda = 30; S.lookLambda = 30;
  }

  // Grid walk (the line-up while bets are open): a slow dolly along the start grid in front of
  // the field, facing it, close enough to see two or three Gumbles at a time. It never stands
  // still: the walk across is a sine and the push in / pull out runs out of phase with it, so at
  // each end of the walk the lens is still moving in depth. `t` = seconds into the line-up.
  function gridWalk(view, t, shot = {}) {
    const g = info.grid || { minX: -8, maxX: 8, frontZ: info.gridCenter.z, backZ: info.gridCenter.z, y: info.gridCenter.y };
    const cx = (g.minX + g.maxX) / 2;
    const half = Math.max(0.8, (g.maxX - g.minX) / 2 - 1.0);
    const period = Math.max(16, (4 * half) / 0.8); // about 0.8 m/s on average along the line
    const w = (2 * Math.PI * t) / period;
    // `dwell`: linger at each end of the walk and cross the middle quickly (two groups with a gap between)
    const sw = shot.dwell ? Math.tanh(shot.dwell * Math.sin(w)) / Math.tanh(shot.dwell) : Math.sin(w);
    const x = cx + half * sw;
    const depth = (shot.depth ?? 7.0) + 0.5 * Math.sin(2 * w);
    const midZ = (g.frontZ + g.backZ) / 2;
    dPos.set(x, g.y + (shot.height ?? 2.1) + 0.15 * Math.sin(w * 0.5), g.frontZ + depth);
    dLook.set(x + 0.5 * Math.cos(w), g.y + (shot.lookY ?? 1.25), midZ);
    dFov = shot.fov ?? 38;
    S.posLambda = 30; S.lookLambda = 30;
  }

  // Slow orbit for the recap and the result: around a Gumble (shot.botId >= 0) or a point
  // (shot.focus). shot.radius / height / rate / a0 / sweep shape it; with `sweep` the lens swings
  // back and forth across an arc of +-sweep radians instead of going all the way round.
  function orbitShot(view, shot) {
    if (shot.botId != null && shot.botId >= 0) botPos(view, shot.botId, bp); else bp.copy(shot.focus || tmp2.set(0, 0, 0));
    const r = shot.radius ?? 14, h = shot.height ?? 6, rate = shot.rate ?? 0.08;
    const face = shot.faceYaw && shot.botId != null && shot.botId >= 0 ? view.botYaw[shot.botId] : 0; // a0 = 0 is then straight in front of its face
    const a = face + (shot.a0 ?? 0) + (shot.sweep ? shot.sweep * Math.sin(shotTime * rate) : shotTime * rate);
    dPos.set(bp.x + Math.sin(a) * r, bp.y + h, bp.z + Math.cos(a) * r);
    dLook.set(bp.x, bp.y + (shot.lookY ?? 0.6), bp.z);
    dFov = shot.fov ?? 45;
    S.posLambda = 3; S.lookLambda = 4;
  }

  // Replay orbit: the base angle is picked so no other Gumble blocks the subject or sits in front
  // of the lens, re-checked a few times a second over where the orbit is heading, eased between.
  let rpBase = 1.9, rpTarget = 1.9, rpEval = 0;
  const RP_OFFS = [0, 0.5, -0.5, 1.0, -1.0, 1.6, -1.6, 2.4, -2.4, Math.PI];
  function replayOrbit(view, id, focus, dt) {
    // Low cinematic orbit around the replay subject: a different angle from live play.
    if (id >= 0) botPos(view, id, bp); else bp.copy(focus);
    const r = 6.2;
    const gy = Math.max(bp.y, info.surfaceY(bp.z)) + 1.7;
    rpEval -= dt;
    if (snap || rpEval <= 0) {
      rpEval = 0.3;
      let best = rpTarget, bestScore = Infinity;
      for (let k = 0; k < RP_OFFS.length; k++) {
        const base = (snap ? 1.9 : rpTarget) + RP_OFFS[k];
        let pen = 0;
        for (const ahead of [0, 0.35, 0.7]) { // where the orbit will be over the next ~3 s
          const a = base + orbit + ahead;
          pen += occlusion(view, id, bp.x + Math.sin(a) * r, gy, bp.z + Math.cos(a) * r, bp.x, bp.y + 0.7, bp.z, 3.2, 1.35);
        }
        const score = pen * 10 + Math.abs(RP_OFFS[k]) * 0.4;
        if (score < bestScore) { bestScore = score; best = base; }
      }
      rpTarget = best;
      if (snap) rpBase = best;
    }
    rpBase += (rpTarget - rpBase) * damp(2.5, dt);
    orbit += dt * 0.22;
    const a = rpBase + orbit;
    dPos.set(bp.x + Math.sin(a) * r, gy, bp.z + Math.cos(a) * r);
    dLook.set(bp.x, bp.y + 0.7, bp.z);
    dFov = 42;
    S.posLambda = 4; S.lookLambda = 9;
  }

  /**
   * Lens clearance: target visibility (0 or 1) per Gumble for the frame just framed. Faded out:
   * bodies right in front of the lens (they would fill the frame out of focus); with a subject
   * (subjectId >= 0), bodies on the line between lens and subject, and bodies in the foreground
   * slab (well in front of the subject and within FG_SHOW of the lens) so neighbours never loom,
   * and foreground bodies whose feet drop into the bottom HUD band (progress strip, watching card)
   * so nothing in front of the subject is left cropped behind the HUD.
   */
  const LENS_HIDE = 1.6, LENS_SHOW = 2.8, OCC_R0 = 0.72, OCC_R1 = 1.05;
  const FG_HIDE = 4.2, FG_SHOW = 5.2, FG_MARGIN = 1.5;
  const BAND_NDC = -0.62, BAND_SOFT = 0.16, BAND_MARGIN = 0.5; // bottom ~19% of the frame
  const FOL_FG_HIDE = 4.6, FOL_FG_SHOW = 5.6, FOL_FG_MARGIN = 1.5, FOL_EDGE_NDC = -0.5; // follow: near lens / bottom ~18%
  const fwd = new THREE.Vector3(), pj = new THREE.Vector3();
  // Targets are all-or-nothing with hysteresis (a steady half-dither reads as noise); the
  // renderer eases between them, so a fade still takes ~0.15 s.
  let cleared = new Uint8Array(64);
  function clearance(view, subjectId, out) {
    const cx = pos.x, cy = pos.y, cz = pos.z;
    fwd.subVectors(look, pos).normalize();
    camera.updateMatrixWorld();
    const N = view.botStatus.length;
    if (cleared.length < N) cleared = new Uint8Array(N);
    const has = subjectId >= 0 && subjectId < N && !view.botHidden[subjectId];
    let sx = 0, sy = 0, sz = 0, len = 1, subjDepth = 0;
    if (has) {
      sx = view.botPos[subjectId * 3] - cx; sy = view.botPos[subjectId * 3 + 1] + 0.55 - cy; sz = view.botPos[subjectId * 3 + 2] - cz;
      subjDepth = sx * fwd.x + sy * fwd.y + sz * fwd.z;
      len = Math.sqrt(sx * sx + sy * sy + sz * sz) || 1;
      sx /= len; sy /= len; sz /= len;
    }
    for (let i = 0; i < N; i++) {
      out[i] = 1;
      if (i === subjectId || view.botHidden[i]) { cleared[i] = 0; continue; }
      const ox = view.botPos[i * 3] - cx, oy = view.botPos[i * 3 + 1] + 0.55 - cy, oz = view.botPos[i * 3 + 2] - cz;
      const dc = Math.sqrt(ox * ox + oy * oy + oz * oz);
      let v = 1;
      if (dc < LENS_SHOW) v = Math.max(0, (dc - LENS_HIDE) / (LENS_SHOW - LENS_HIDE));
      if (has) {
        const t = ox * sx + oy * sy + oz * sz; // metres along the lens->subject line
        if (t > 0 && t < len - 0.6) {
          const px = ox - sx * t, py = oy - sy * t, pz = oz - sz * t;
          const perp = Math.sqrt(px * px + py * py + pz * pz);
          if (perp < OCC_R1) v = Math.min(v, Math.max(0, (perp - OCC_R0) / (OCC_R1 - OCC_R0)));
        }
        const depth = ox * fwd.x + oy * fwd.y + oz * fwd.z;
        if (curMode === 'follow') {
          // Follow: bodies well in front of the subject and close to the lens would loom over it,
          // and bodies whose middle drops toward the bottom edge would be cut in half by it: both
          // fade, so the watched Gumble is the nearest whole body in shot.
          if (depth < subjDepth - FOL_FG_MARGIN) {
            if (dc < FOL_FG_SHOW) v = Math.min(v, Math.max(0, (dc - FOL_FG_HIDE) / (FOL_FG_SHOW - FOL_FG_HIDE)));
            if (v > 0 && depth > 0.3) {
              pj.set(view.botPos[i * 3], view.botPos[i * 3 + 1] + 0.45, view.botPos[i * 3 + 2]).project(camera);
              if (Math.abs(pj.x) < 1.15) v = Math.min(v, Math.max(0, (pj.y - (FOL_EDGE_NDC - BAND_SOFT)) / BAND_SOFT));
            }
          }
        } else if (depth < subjDepth - FG_MARGIN && dc < FG_SHOW) v = Math.min(v, Math.max(0, (dc - FG_HIDE) / (FG_SHOW - FG_HIDE)));
        if (curMode !== 'follow' && depth < subjDepth - BAND_MARGIN) {
          if (v > 0 && depth > 0.3) {
            pj.set(view.botPos[i * 3], view.botPos[i * 3 + 1], view.botPos[i * 3 + 2]).project(camera);
            if (Math.abs(pj.x) < 1.1) v = Math.min(v, Math.max(0, (pj.y - (BAND_NDC - BAND_SOFT)) / BAND_SOFT));
          }
        }
      }
      if (didCut) cleared[i] = v < 0.5 ? 1 : 0;
      else if (cleared[i]) { if (v > 0.8) cleared[i] = 0; } else if (v < 0.2) cleared[i] = 1;
      out[i] = cleared[i] ? 0 : 1;
    }
    return out;
  }

  /**
   * shot: { mode, botId, t, focus (Vector3), key }  — key changes => hard cut.
   */
  let didCut = false, curMode = '';
  function update(dt, view, shot) {
    curMode = shot.mode;
    const key = shot.key ?? `${shot.mode}:${shot.botId}`;
    if (key !== lastKey) { snap = true; lastKey = key; shotTime = 0; orbit = 0; trackIdx = -1; }
    shotTime += dt;
    const id = shot.botId ?? 0;
    switch (shot.mode) {
      case 'follow': follow(view, id, dt); break;
      case 'closeup': closeup(view, id, dt); break;
      case 'leader': case 'overview': case 'track': case 'cutline': case 'sideline': case 'zone': broadcastShot(shot.mode, view, id, dt, shot); break;
      case 'finishline': finishLine(view, shot); break;
      case 'section': section(view, shot.section ?? 0, dt); break;
      case 'intro': intro(view, shot.t ?? 0); break;
      case 'start': startGrid(view, shot.t ?? 0); break;
      case 'finish': finish(view, shot.t ?? 0); break;
      case 'gridwalk': gridWalk(view, shot.t ?? 0, shot); break;
      case 'gridtop': gridTop(view, shot); break;
      case 'orbit': orbitShot(view, shot); break;
      case 'board': dPos.set(shot.px, shot.py, shot.pz); dLook.set(shot.lx, shot.ly, shot.lz); dFov = shot.fov ?? 30; S.posLambda = 30; S.lookLambda = 30; break; // a set position (the roster shelf)
      case 'replay': replayOrbit(view, id, shot.focus || tmp2.set(0, 0, 0), dt); break;
      default: follow(view, id, dt);
    }
    didCut = snap;
    if (snap) {
      pos.copy(dPos); look.copy(dLook); fov = dFov; snap = false;
    } else {
      pos.lerp(dPos, damp(S.posLambda, dt));
      look.lerp(dLook, damp(S.lookLambda, dt));
      fov += (dFov - fov) * damp(S.fovLambda, dt);
    }
    // Never dip under the course surface, never rise through the attic roof / tie beams.
    const floor = info.surfaceY(pos.z) + 0.6;
    if (pos.y < floor && Math.abs(pos.x - info.centerX(pos.z)) < info.halfWidth(pos.z) + 1) pos.y = floor;
    const ceil = ceilingAt(pos.x, pos.z);
    if (pos.y > ceil) pos.y = ceil;
    camera.position.copy(pos);
    camera.lookAt(look);
    if (Math.abs(camera.fov - fov) > 1e-3) { camera.fov = fov; camera.updateProjectionMatrix(); }
  }

  return {
    update,
    clearance,
    /** true when the last update() was a hard cut (no easing) */
    get didCut() { return didCut; },
    cut() { snap = true; },
    get focus() { return look; },
    get position() { return pos; },
  };
}

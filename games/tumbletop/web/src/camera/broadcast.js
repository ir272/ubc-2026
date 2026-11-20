// Broadcast shots: the non-follow camera modes (leader, drone/overview, trackside), framed like a
// sports broadcast. Every shot is planned against the sight-line model so the subject is never
// behind a floor, a stack of books, a block or a swinging metronome weight, and the lens is fitted
// so the subject reads at a useful size with whoever it is racing in the same frame.
//
//   leader    — "lead car" shot: a 3/4 front view travelling ahead of the leader, looking back
//               at its face with the chasers behind it, lens fitted to leader + chasers.
//   overview  — drone. scope 'group' (director): a high 3/4 view of the subject's own cluster,
//               slowly drifting; scope 'field' (default, user key 3): the whole field.
//   track     — trackside: a lens planted ahead of the subject beside the course on a slow dolly,
//               telephoto, so the subject runs toward it with the course and rivals behind.
//
// All functions write the desired lens into `out` ({ pos, look, fov, posLambda, lookLambda }).
// No allocation per frame.
import * as THREE from 'three';

const damp = (lambda, dt) => 1 - Math.exp(-lambda * dt);
const DEG = 180 / Math.PI;

export function createBroadcast(camera, info, sight) {
  const bp = new THREE.Vector3();
  const tmp = new THREE.Vector3();
  const comp = new Int16Array(8); // companion ids for the current frame
  let nComp = 0;

  function botPos(view, id, out) {
    return out.set(view.botPos[id * 3], view.botPos[id * 3 + 1], view.botPos[id * 3 + 2]);
  }
  const usable = (view, i) => !view.botHidden[i] && view.botStatus[i] !== 2 && view.botStatus[i] !== 3;

  // Nearest usable bots to `id` within radius r (optionally only behind it, for chasers).
  const cd = new Float32Array(8);
  function companions(view, id, r, max, behindOnly = false) {
    nComp = 0;
    const x = view.botPos[id * 3], y = view.botPos[id * 3 + 1], z = view.botPos[id * 3 + 2];
    const N = view.botStatus.length;
    for (let i = 0; i < N; i++) {
      if (i === id || !usable(view, i)) continue;
      const dx = view.botPos[i * 3] - x, dy = view.botPos[i * 3 + 1] - y, dz = view.botPos[i * 3 + 2] - z;
      if (behindOnly && dz > 1) continue;
      if (Math.abs(dy) > 3) continue;
      const d = dx * dx + dz * dz;
      if (d > r * r) continue;
      let k = nComp < max ? nComp++ : max;
      if (k === max) { if (d >= cd[max - 1]) continue; k = max - 1; }
      while (k > 0 && cd[k - 1] > d) { cd[k] = cd[k - 1]; comp[k] = comp[k - 1]; k--; }
      cd[k] = d; comp[k] = i;
    }
    return nComp;
  }

  // How much other Gumbles crowd the line from the lens to (tx, ty, tz).
  function crowding(view, selfId, cx, cy, cz, tx, ty, tz) {
    const sx = tx - cx, sy = ty - cy, sz = tz - cz;
    const len2 = sx * sx + sy * sy + sz * sz || 1;
    let pen = 0;
    const N = view.botStatus.length;
    for (let i = 0; i < N; i++) {
      if (i === selfId || view.botHidden[i]) continue;
      const ox = view.botPos[i * 3] - cx, oy = view.botPos[i * 3 + 1] + 0.6 - cy, oz = view.botPos[i * 3 + 2] - cz;
      const t = (ox * sx + oy * sy + oz * sz) / len2;
      if (t < 0 || t > 0.9) continue;
      const dx = ox - sx * t, dy = oy - sy * t, dz = oz - sz * t;
      const d2 = dx * dx + dy * dy + dz * dz;
      if (d2 < 0.8) pen += 1;
    }
    return pen;
  }

  // Lens basis for fitting points into the frame.
  const fF = new THREE.Vector3(), fR = new THREE.Vector3(), fU = new THREE.Vector3(), fV = new THREE.Vector3();
  const UP = new THREE.Vector3(0, 1, 0);
  let fitNeed = 0;
  function fitBegin(pos, look) {
    fF.subVectors(look, pos).normalize();
    fR.crossVectors(fF, UP).normalize();
    fU.crossVectors(fR, fF);
    fitNeed = 0;
  }
  function fitPoint(pos, x, y, z) {
    fV.set(x - pos.x, y - pos.y, z - pos.z);
    const f = fV.dot(fF);
    if (f < 0.5) return;
    const aspect = camera.aspect || 16 / 9;
    const t = Math.max(Math.abs(fV.dot(fU)) / f, Math.abs(fV.dot(fR)) / (f * aspect));
    if (t > fitNeed) fitNeed = t;
  }
  const fovFor = (tanHalf, margin) => 2 * Math.atan(tanHalf * margin) * DEG;

  // Line of sight from a lens to a bot's body and head (0 = clear, 1 = fully blocked).
  function sightTo(view, cx, cy, cz, x, y, z) {
    const a = sight.blocked(cx, cy, cz, x, y + 0.55, z, view);
    const b = sight.blocked(cx, cy, cz, x, y + 1.05, z, view);
    return Math.min(a, b) * 0.6 + Math.max(a, b) * 0.4;
  }

  // ======================================================================== LEADER
  // Offsets relative to the leader: ahead (+z), side (x), height. Re-planned twice a second.
  const LD_OPTS = [];
  for (const side of [1, -1]) for (const ahead of [6.2, 8.4]) for (const h of [1.9, 3.1, 4.6, 6.4]) LD_OPTS.push([side, ahead, h]);
  const ld = { side: 1, ahead: 6.2, h: 1.9, tSide: 1, tAhead: 6.2, tH: 1.9, eval: 0, pref: 1 };
  function leader(view, id, dt, snap, shotTime, out) {
    botPos(view, id, bp);
    const ground = Math.max(bp.y, info.surfaceY(bp.z));
    companions(view, id, 12, 3, true);
    // chaser centroid (or a point behind the leader when alone)
    let chx = bp.x, chz = bp.z - 5, nch = 0;
    if (nComp) {
      chx = 0; chz = 0;
      for (let k = 0; k < nComp; k++) { chx += view.botPos[comp[k] * 3]; chz += view.botPos[comp[k] * 3 + 2]; nch++; }
      chx /= nch; chz /= nch;
    }
    ld.eval -= dt;
    if (snap || ld.eval <= 0) {
      ld.eval = 0.5;
      let best = -1, bestS = Infinity;
      for (let j = 0; j < LD_OPTS.length; j++) {
        const [side, ahead, h] = LD_OPTS[j];
        const cx = bp.x + side * 2.6, cz = bp.z + ahead, cy = Math.max(ground, info.surfaceY(cz)) + h;
        if (sight.solidAt(cx, cy, cz, view, 0.9)) continue;
        let s = sightTo(view, cx, cy, cz, bp.x, bp.y, bp.z) * 12;
        if (sight.solidAt(cx, cy, cz, view, 2.0)) s += 2.5; // a block right by the lens fills the frame
        s += crowding(view, id, cx, cy, cz, bp.x, bp.y + 0.6, bp.z) * 2.5;
        for (let k = 0; k < nComp; k++) s += sightTo(view, cx, cy, cz, view.botPos[comp[k] * 3], view.botPos[comp[k] * 3 + 1], view.botPos[comp[k] * 3 + 2]) * 1.5;
        s += Math.abs(h - 1.9) * 0.25 + (ahead - 6.2) * 0.1 + (side === ld.pref ? 0 : 0.3);
        if (!snap && side === ld.tSide && ahead === ld.tAhead && h === ld.tH) s -= 0.9; // hysteresis
        if (s < bestS) { bestS = s; best = j; }
      }
      if (best >= 0) { ld.tSide = LD_OPTS[best][0]; ld.tAhead = LD_OPTS[best][1]; ld.tH = LD_OPTS[best][2]; }
      if (snap) { ld.side = ld.tSide; ld.ahead = ld.tAhead; ld.h = ld.tH; }
    }
    const k = damp(1.4, dt);
    ld.side += (ld.tSide - ld.side) * k; ld.ahead += (ld.tAhead - ld.ahead) * k; ld.h += (ld.tH - ld.h) * k;
    const sway = Math.sin(shotTime * 0.35) * 0.5;
    const cz = bp.z + ld.ahead;
    out.pos.set(bp.x + ld.side * 2.6 + sway, Math.max(ground, info.surfaceY(cz)) + ld.h, cz);
    // aim between the leader and the chasers, weighted to the leader (it is the subject)
    const w = nch ? 0.3 : 0.15;
    out.look.set(bp.x + (chx - bp.x) * w, bp.y + 0.55, bp.z + (chz - bp.z) * w);
    fitBegin(out.pos, out.look);
    fitPoint(out.pos, bp.x, bp.y + 1.3, bp.z); fitPoint(out.pos, bp.x, bp.y - 0.1, bp.z);
    for (let i = 0; i < nComp; i++) { const c = comp[i]; fitPoint(out.pos, view.botPos[c * 3], view.botPos[c * 3 + 1] + 1.2, view.botPos[c * 3 + 2]); fitPoint(out.pos, view.botPos[c * 3], view.botPos[c * 3 + 1], view.botPos[c * 3 + 2]); }
    const dist = out.pos.distanceTo(bp);
    const minF = 2 * Math.atan(2.4 / dist) * DEG; // never tighter than ~4.8 m of frame at the leader
    out.fov = THREE.MathUtils.clamp(Math.max(fovFor(fitNeed, 1.25), minF), 30, 58);
    out.look.y += 0.12 * dist * Math.tan(out.fov / DEG / 2);
    out.posLambda = 7; out.lookLambda = 9;
  }

  // ======================================================================== TRACKSIDE
  const TR_OPTS = [];
  for (const ahead of [11, 8, 15]) for (const lat of [4.5, 7]) for (const h of [1.6, 2.8, 4.4, 6.2]) TR_OPTS.push([ahead, lat, h]);
  const tr = { x: 0, y: 0, z: 0, h: 2, side: 1, pref: 1, eval: 0, badT: 0, lastPlan: 0, planned: false };
  function planTrack(view, id, avoidSide) {
    botPos(view, id, bp);
    const vx = view.botVel[id * 3], vz = Math.max(1.5, view.botVel[id * 3 + 2]);
    const ground = Math.max(bp.y, info.surfaceY(bp.z));
    let best = null, bestS = Infinity;
    for (let s = 0; s < 2; s++) {
      const side = s === 0 ? tr.pref : -tr.pref;
      for (let j = 0; j < TR_OPTS.length; j++) {
        const [ahead, lat, h] = TR_OPTS[j];
        const cz = bp.z + ahead;
        // stay over the course footprint (off it, the attic's set dressing can wall off the lens)
        const hw = Math.max(1.5, info.halfWidth(cz) - 0.4);
        const cx = THREE.MathUtils.clamp(bp.x + side * lat, -hw, hw);
        // height is measured from the subject's footing (on a ramp the lens must not tower over
        // it), with at least 1.3 m of air over whatever is under the lens
        const under = Math.max(info.surfaceY(cz), sight.topAt(cx, cz));
        const cy = Math.max(ground + h, under + 1.3);
        if (sight.solidAt(cx, cy, cz, view, 1.0)) continue;
        // big toys right beside the lens would wall off half the frame
        let sc = sight.solidAt(cx, cy, cz, view, 2.2) ? 3 : 0;
        // where the subject will be over the next ~2.5 s (the camera dollies at ~half its pace)
        for (let q = 0; q < 3; q++) {
          const t = q * 1.2;
          const pz = bp.z + vz * t, px = bp.x + vx * t * 0.5, py = q ? Math.max(bp.y, info.surfaceY(pz)) : bp.y;
          const camZ = cz + vz * t * 0.5;
          if (camZ - pz < 2.5) break;
          sc += sightTo(view, cx, cy, camZ, px, py, pz) * (q ? 5 : 14);
        }
        sc += crowding(view, id, cx, cy, cz, bp.x, bp.y + 0.6, bp.z) * 2;
        sc += Math.abs(h - 1.6) * 0.45 + Math.abs(ahead - 11) * 0.06 + (lat - 4.5) * 0.1;
        if (side === avoidSide) sc += 0.6;
        if (sc < bestS) { bestS = sc; best = [cx, cy, cz, h, side]; }
      }
    }
    if (!best) { // nothing clean: high and ahead
      best = [bp.x * 0.5, ground + 6, bp.z + 8, 6, 1];
    }
    tr.x = best[0]; tr.y = best[1]; tr.z = best[2]; tr.h = best[1] - ground; tr.side = best[4];
    tr.pref = -tr.side; // next trackside shot comes from the other side of the course
    tr.planned = true; tr.badT = 0;
  }
  function track(view, id, dt, snap, shotTime, out) {
    if (snap || !tr.planned) { planTrack(view, id, 0); tr.lastPlan = shotTime; }
    botPos(view, id, bp);
    const vz = view.botVel[id * 3 + 2];
    // slow dolly: the lens creeps forward at ~45% of the runner's pace so the subject grows in
    // frame; it never lets the subject get closer than ~3.5 m ahead of it
    // (the dolly never drives the lens into a block, a gantry or a toy: it stops short of it)
    let nz = tr.z + Math.max(0, vz) * 0.45 * dt;
    let pushed = false;
    if (nz < bp.z + 3.5) { nz = bp.z + 3.5; pushed = true; }
    if (nz !== tr.z) {
      if (!sight.solidAt(tr.x, tr.y, nz, view, 1.0)) tr.z = nz;
      else if (pushed && shotTime - tr.lastPlan > 0.6) { planTrack(view, id, tr.side); tr.lastPlan = shotTime; out.recut = true; }
    }
    const foot = Math.min(bp.y, info.surfaceY(bp.z) + 0.3);
    const ty = Math.max(foot + tr.h, Math.max(info.surfaceY(tr.z), sight.topAt(tr.x, tr.z)) + 1.3);
    tr.y += (ty - tr.y) * damp(3, dt);
    // keep checking the sight line; if the subject stays hidden, re-plan (a hard cut to a clean angle)
    tr.eval -= dt;
    if (tr.eval <= 0) {
      tr.eval = 0.25;
      const b = sightTo(view, tr.x, tr.y, tr.z, bp.x, bp.y, bp.z);
      const lensHit = sight.solidAt(tr.x, tr.y, tr.z, view, 1.0); // e.g. a marble about to roll through the lens
      tr.badT = b > 0.5 || lensHit ? tr.badT + (lensHit ? 0.5 : 0.25) : 0;
      if (tr.badT >= 0.5 && shotTime - tr.lastPlan > 1.2) { planTrack(view, id, tr.side); tr.lastPlan = shotTime; out.recut = true; }
    }
    out.pos.set(tr.x, tr.y, tr.z);
    // companions in the same frame: the lens widens to hold the subject with its nearest rivals
    companions(view, id, 6, 3);
    out.look.set(bp.x + view.botVel[id * 3] * 0.15, bp.y + 0.6, bp.z + vz * 0.15);
    let cxs = 0, cn = 0;
    for (let i = 0; i < nComp; i++) { cxs += view.botPos[comp[i] * 3 + 2] - bp.z; cn++; }
    if (cn) out.look.z += (cxs / cn) * 0.2;
    const dist = Math.max(2, out.pos.distanceTo(out.look));
    fitBegin(out.pos, out.look);
    fitPoint(out.pos, bp.x, bp.y + 1.3, bp.z); fitPoint(out.pos, bp.x, bp.y - 0.1, bp.z);
    for (let i = 0; i < nComp; i++) { const c = comp[i]; fitPoint(out.pos, view.botPos[c * 3], view.botPos[c * 3 + 1] + 1.2, view.botPos[c * 3 + 2]); }
    const tight = 2 * Math.atan(2.7 / dist) * DEG, loose = 2 * Math.atan(5.5 / dist) * DEG;
    out.fov = THREE.MathUtils.clamp(Math.min(Math.max(fovFor(fitNeed, 1.25), tight), loose), 14, 56);
    // compose: the subject sits in the lower-middle of the frame, the course and rivals behind it
    // fill the top (instead of a band of empty floor between the lens and the subject)
    out.look.y += 0.3 * dist * Math.tan(out.fov / DEG / 2);
    out.posLambda = 30; out.lookLambda = 7;
  }

  // ======================================================================== DRONE
  const pack = new THREE.Vector3();
  let framed = new Uint8Array(64);
  const dr = { side: 1, pref: -1, eval: 0, drift: 0 };
  function overview(view, id, dt, snap, shotTime, out, scope) {
    const N = view.botStatus.length;
    if (framed.length < N) framed = new Uint8Array(N);
    botPos(view, id >= 0 ? id : 0, bp);
    const group = scope === 'group' && id >= 0 && usable(view, id);
    let n = 0, minZ = 1e9, maxZ = -1e9, minX = 1e9, maxX = -1e9;
    pack.set(0, 0, 0);
    for (let i = 0; i < N; i++) {
      framed[i] = 0;
      if (!usable(view, i)) continue;
      if (view.botStatus[i] === 1 && (group || n > 3)) continue;
      const x = view.botPos[i * 3], y = view.botPos[i * 3 + 1], z = view.botPos[i * 3 + 2];
      if (y < info.surfaceY(z) - 1.5) continue; // falling off: not part of the shot
      if (group && (Math.abs(z - bp.z) > 11 || Math.abs(y - bp.y) > 4)) continue;
      framed[i] = 1;
      pack.x += x; pack.y += y; pack.z += z; n++;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; if (x < minX) minX = x; if (x > maxX) maxX = x;
    }
    if (!n) { pack.copy(bp); minZ = maxZ = bp.z; minX = maxX = bp.x; } else pack.multiplyScalar(1 / n);
    if (group) {
      // centre on the subject's cluster but keep the subject well inside the frame
      pack.x = pack.x * 0.6 + bp.x * 0.4; pack.z = pack.z * 0.6 + bp.z * 0.4;
      const spread = Math.min(Math.max(maxZ - minZ, (maxX - minX) * 0.8, 8), 24);
      const d = spread * 0.75 + 9;
      dr.eval -= dt;
      if (snap || dr.eval <= 0) {
        dr.eval = 0.6;
        let best = dr.side, bestS = Infinity;
        for (const side of [dr.pref, -dr.pref]) {
          const cx = pack.x + side * d * 0.42, cz = pack.z - d * 0.78, cy = pack.y + d * 0.62;
          let s = sight.solidAt(cx, cy, cz, view, 1) ? 50 : 0;
          s += sightTo(view, cx, cy, cz, bp.x, bp.y, bp.z) * 10;
          if (!snap && side === dr.side) s -= 0.5;
          if (s < bestS) { bestS = s; best = side; }
        }
        dr.side = best;
        if (snap) { dr.drift = 0; dr.pref = -best; }
      }
      dr.drift += dt * 0.05;
      const a = dr.side * (0.5 + dr.drift);
      out.pos.set(pack.x + Math.sin(a) * d * 0.85, pack.y + d * 0.62, pack.z - Math.cos(a) * d * 0.85);
      out.look.set(pack.x, pack.y + 0.3, pack.z + 2.5);
      fitBegin(out.pos, out.look);
      for (let i = 0; i < N; i++) {
        if (!framed[i]) continue;
        fitPoint(out.pos, view.botPos[i * 3], view.botPos[i * 3 + 1] + 1.3, view.botPos[i * 3 + 2]);
        fitPoint(out.pos, view.botPos[i * 3], view.botPos[i * 3 + 1], view.botPos[i * 3 + 2]);
      }
      fitPoint(out.pos, bp.x, bp.y + 1.6, bp.z);
      const dist = out.pos.distanceTo(bp);
      const loose = 2 * Math.atan(9 / dist) * DEG; // the subject never shrinks below ~6% of frame height
      out.fov = THREE.MathUtils.clamp(Math.min(fovFor(fitNeed, 1.18), loose), 30, 62);
      out.posLambda = snap ? 30 : 2.2; out.lookLambda = 3;
      return;
    }
    // whole field: 3/4 drone from behind-left, fitted to every racing Gumble
    const spread = Math.min(Math.max(maxZ - minZ, maxX - minX, 14), 90);
    const midZ = (minZ + maxZ) * 0.5;
    const d = spread * 0.95 + 10;
    let cx = pack.x - d * 0.55, cz = midZ - d * 0.55;
    let cy = pack.y + d * 0.62 + 6;
    const ceilingAt = (x, z) => (info.interior ? info.interior.ceilingY(x, z) : Infinity);
    const ceil = ceilingAt(cx, cz);
    if (cy > ceil) {
      const lost = cy - ceil;
      cx = pack.x - Math.max(d * 0.3, d * 0.55 - lost * 0.6);
      cz -= lost * 0.5;
      cy = Math.min(cy, ceilingAt(cx, cz));
    }
    out.look.set(pack.x * 0.5, pack.y, midZ + spread * 0.08);
    const MAX_T = Math.tan(66 / DEG / 2) / 1.16;
    for (let iter = 0; iter < 6; iter++) {
      out.pos.set(cx, cy, cz);
      fitBegin(out.pos, out.look);
      fitNeed = Math.tan(38 / DEG / 2);
      for (let i = 0; i < N; i++) {
        if (!framed[i]) continue;
        fitPoint(out.pos, view.botPos[i * 3], view.botPos[i * 3 + 1] + 1.8, view.botPos[i * 3 + 2]);
        fitPoint(out.pos, view.botPos[i * 3], view.botPos[i * 3 + 1], view.botPos[i * 3 + 2]);
      }
      if (n) for (const zz of [minZ, maxZ]) { const hw = info.halfWidth(zz); fitPoint(out.pos, -hw, info.surfaceY(zz), zz); fitPoint(out.pos, hw, info.surfaceY(zz), zz); }
      if (fitNeed <= MAX_T) break;
      cz -= 10; cx -= 3;
      cy = Math.min(cy, ceilingAt(cx, cz));
    }
    out.fov = THREE.MathUtils.clamp(fovFor(fitNeed, 1.16), 38, 80);
    out.posLambda = 1.6; out.lookLambda = 2.4;
  }

  // ======================================================================== CUT LINE
  // The show's home shot: the Gumbles fighting over the last qualifying place, from behind and
  // above, running away from the lens so "further up the frame" always means "further ahead".
  // `ids` are the members (two to four). The centre and the spread are eased, so the shot glides
  // when the group changes instead of jumping; it swings to the other side of the course only when
  // something solid comes between the lens and the group.
  const cl = { cx: 0, cy: 0, cz: 0, span: 8, side: 1, sideNow: 1, up: 0, upNow: 0, eval: 0 };
  function cutline(view, ids, anchorId, dt, snap, out) {
    let n = 0, minZ = 1e9, maxZ = -1e9, minX = 1e9, maxX = -1e9, sx = 0, sy = 0, sz = 0;
    for (let k = 0; k < ids.length; k++) {
      const i = ids[k];
      if (i < 0 || view.botHidden[i]) continue;
      const x = view.botPos[i * 3], y = view.botPos[i * 3 + 1], z = view.botPos[i * 3 + 2];
      if (y < info.surfaceY(z) - 2.5) continue; // gone over the edge: not part of the shot
      sx += x; sy += y; sz += z; n++;
      if (z < minZ) minZ = z; if (z > maxZ) maxZ = z; if (x < minX) minX = x; if (x > maxX) maxX = x;
    }
    if (!n) { botPos(view, Math.max(0, anchorId), bp); sx = bp.x; sy = bp.y; sz = bp.z; n = 1; minZ = maxZ = bp.z; minX = maxX = bp.x; }
    const cx = sx / n, cy = sy / n, cz = (minZ + maxZ) / 2;
    const span = Math.min(Math.max(maxZ - minZ, (maxX - minX) * 0.7, 6.5), 26);
    const k = snap ? 1 : damp(3.2, dt), ks = snap ? 1 : damp(1.6, dt);
    cl.cx += (cx - cl.cx) * k; cl.cy += (cy - cl.cy) * k; cl.cz += (cz - cl.cz) * k;
    cl.span += (span - cl.span) * ks;
    const d = cl.span * 0.9 + 11; // a long lens from well back: the foreground stays small, the group fills the frame
    cl.eval -= dt;
    if (snap || cl.eval <= 0) {
      cl.eval = 0.7;
      // candidates: either side of the course, at the usual height or high (to see over tall blocks)
      let best = cl.side, bestUp = cl.up, bestS = Infinity;
      for (const side of [cl.side, -cl.side]) {
        for (const up of [0, 1]) {
          const px = cl.cx + side * d * 0.36, py = cl.cy + d * (0.6 + 0.36 * up), pz = cl.cz - d * (0.76 - 0.2 * up);
          let s = sight.solidAt(px, py, pz, view, 1) ? 50 : 0;
          for (let q = 0; q < ids.length; q++) {
            const i = ids[q];
            if (i < 0 || view.botHidden[i]) continue;
            s += sightTo(view, px, py, pz, view.botPos[i * 3], view.botPos[i * 3 + 1], view.botPos[i * 3 + 2]) * 10;
          }
          s += Math.abs(px) > info.halfWidth(pz) + 6 ? 2 : 0; // prefer a lens over or near the course
          s += up * 1.2;                                        // the low angle reads better when it is clear
          if (side === cl.side) s -= 1.5;                       // do not flip sides for nothing
          if (up === cl.up) s -= 0.6;
          if (s < bestS) { bestS = s; best = side; bestUp = up; }
        }
      }
      cl.side = best; cl.up = bestUp;
      if (snap) { cl.sideNow = best; cl.upNow = bestUp; }
    }
    cl.sideNow += (cl.side - cl.sideNow) * (snap ? 1 : damp(1.4, dt));
    cl.upNow += (cl.up - cl.upNow) * (snap ? 1 : damp(1.6, dt));
    out.pos.set(cl.cx + cl.sideNow * d * 0.36, cl.cy + d * (0.6 + 0.36 * cl.upNow), cl.cz - d * (0.76 - 0.2 * cl.upNow));
    out.look.set(cl.cx, cl.cy + 0.5, cl.cz + 1.2 + cl.span * 0.12);
    fitBegin(out.pos, out.look);
    for (let q = 0; q < ids.length; q++) {
      const i = ids[q];
      if (i < 0 || view.botHidden[i]) continue;
      const x = view.botPos[i * 3], y = view.botPos[i * 3 + 1], z = view.botPos[i * 3 + 2];
      if (y < info.surfaceY(z) - 2.5) continue;
      fitPoint(out.pos, x, y + 2.4, z); // room for the name tag
      fitPoint(out.pos, x, y - 0.2, z);
    }
    out.fov = THREE.MathUtils.clamp(fovFor(fitNeed, 1.3), 22, 52);
    out.posLambda = snap ? 30 : 3.4; out.lookLambda = snap ? 30 : 4.2;
  }

  // ======================================================================== ZONE
  // The show's home shot: one steady rig that rides along the course with the cut line. It does
  // not frame individuals. It frames a fixed stretch of course (about 20 m long, the full width)
  // around the point where the last qualifying place is being fought over, from behind and above,
  // so further up the picture is always further ahead. The rig's height, distance and lens never
  // change with who is in the fight; only where it is on the course does, on a damped spring that
  // tracks a moving target without lagging behind it. It runs all the way to the finish and stops
  // short of the line, so the last place is taken in the same unbroken shot.
  const zn = { z: 0, v: 0, x: 0, vs: 0, raw: 0, lift: 0, liftT: 0, eval: 0, steep: 0, plift: 0 };
  function zone(view, shot, dt, snap, out) {
    const zMax = shot.zMax ?? 1e9;
    const raw = Math.min(shot.zRaw, zMax);
    const jump = Math.abs(raw - zn.raw) > 26; // the fight moved a long way down the course: cut, do not fly there
    const prof = shot.profile ? shot.profile(snap || jump ? raw : zn.z) : null;
    if (snap || jump) { zn.z = raw; zn.v = 0; zn.x = (shot.xRaw ?? 0) * 0.3; zn.vs = shot.speed ?? 6; zn.raw = raw; zn.lift = 0; zn.liftT = 0; zn.steep = prof?.steep ?? 0; zn.plift = prof?.lift ?? 0; }
    // the target's own pace, smoothed, lets the spring lead by exactly its steady-state lag
    const inst = dt > 0 ? Math.max(0, Math.min(11, (raw - zn.raw) / dt)) : zn.vs;
    zn.vs += (inst - zn.vs) * damp(1.0, dt);
    zn.raw = raw;
    const W = 2.4, goal = Math.min(raw + zn.vs * (2 / W), zMax);
    if (dt > 0) { zn.v += (W * W * (goal - zn.z) - 2 * W * zn.v) * dt; zn.z += zn.v * dt; }
    zn.x += ((shot.xRaw ?? 0) * 0.3 - zn.x) * damp(0.8, dt);
    // how the rig stands depends on where it is on the course (the stage knows what stands there):
    // steeper among tall things, lifted over gantries and chutes, eased so it never steps
    zn.steep += ((prof?.steep ?? 0) - zn.steep) * damp(1.4, dt);
    zn.plift += ((prof?.lift ?? 0) - zn.plift) * damp(1.4, dt);
    // closing on the line it pushes in, so the last place is taken large in the frame
    const close = Math.max(0, Math.min(1, (zn.z - (zMax - 11)) / 11));
    const back = (12.5 - 7 * zn.steep) * (1 - 0.34 * close), up = (11 + 10 * zn.steep) * (1 - 0.4 * close) + zn.plift * (1 - close);
    const gy = info.surfaceY(zn.z);
    // never sit inside scenery: if the lens would, lift it, and come back down gently once clear
    zn.eval -= dt;
    if (snap || zn.eval <= 0) {
      zn.eval = 0.25;
      let need = 0;
      for (const add of [0, 3, 6, 9]) { if (!sight.solidAt(zn.x, gy + up + add, zn.z - back, view, 1.2)) { need = add; break; } need = add + 3; }
      zn.liftT = need;
      if (snap) zn.lift = need;
    }
    zn.lift += (zn.liftT - zn.lift) * damp(zn.liftT > zn.lift ? 5 : 0.8, dt);
    out.pos.set(zn.x, gy + up + zn.lift, zn.z - back);
    // (at the line the look point runs on to it, so the line lies across the middle of the picture)
    const lead = 3.2 - 2.4 * zn.steep;
    out.look.set(zn.x * 0.8, gy + 0.4, zn.z + lead + (3.4 - lead) * close);
    out.fov = 44;
    out.posLambda = 30; out.lookLambda = 30; // the spring above is the only easing
    out.recut = jump && !snap;
  }

  // ======================================================================== SIDE LINE
  // The final in the block maze: a side-on tracking shot from above the rail, like the camera that
  // runs alongside a horse race. The course runs left to right across the frame, so further right
  // is further ahead, every racer is in the picture, and the blocks are seen over, not through.
  const sl = { cz: 0, cy: 0, cx: 0, wide: 8, span: 12, side: -1, eval: 0 }; // from the -x side the course runs left to right
  function sideline(view, ids, dt, snap, out, shot) {
    let n = 0, maxZ = -1e9;
    for (let k = 0; k < ids.length; k++) { const i = ids[k]; if (i >= 0 && !view.botHidden[i]) maxZ = Math.max(maxZ, view.botPos[i * 3 + 2]); }
    if (maxZ < -1e8) return;
    // the picture is the fight for the lead: the two in front, and anyone else within 8 m of the
    // leader. Whoever is further back than that is in the standings, not in this picture
    let second = -1e9;
    for (let k = 0; k < ids.length; k++) { const i = ids[k]; if (i < 0 || view.botHidden[i]) continue; const z = view.botPos[i * 3 + 2]; if (z < maxZ && z > second) second = z; }
    const reach = shot?.reachAll ? 30 : Math.min(16, Math.max(8, maxZ - second + 0.01));
    let minZ = 1e9, minX = 1e9, maxX = -1e9, sy = 0;
    for (let k = 0; k < ids.length; k++) {
      const i = ids[k];
      if (i < 0 || view.botHidden[i]) continue;
      const z = view.botPos[i * 3 + 2];
      if (maxZ - z > reach) continue;
      const x = view.botPos[i * 3];
      sy += view.botPos[i * 3 + 1]; n++;
      if (z < minZ) minZ = z; if (x < minX) minX = x; if (x > maxX) maxX = x;
    }
    // coming to the line, the line is in the picture before the leader reaches it
    const fz = shot?.finishZ ?? 1e9;
    const front = fz - maxZ < 10 && maxZ < fz + 1 ? fz + 1.5 : maxZ;
    const cz = (minZ + front) / 2 + (front > maxZ ? 0 : 1.2), span = Math.max(9, front - minZ + 5);
    const cx = (minX + maxX) / 2, wide = Math.max(7, maxX - minX + 6);
    const k = snap ? 1 : damp(2.6, dt), ks = snap ? 1 : damp(1.2, dt);
    sl.cz += (cz - sl.cz) * k; sl.cy += (sy / n - sl.cy) * k; sl.span += (span - sl.span) * (snap ? 1 : damp(span < sl.span ? 2.2 : 1.2, dt)); // (closing in is quicker than opening out)
    sl.cx = snap ? cx : sl.cx + (cx - sl.cx) * k; sl.wide = snap ? wide : sl.wide + (wide - sl.wide) * (wide > sl.wide ? k : ks);
    if (snap) sl.side = -1; // always from the same side: the course runs left to right all the way
    const hw = info.halfWidth(sl.cz);
    // outside the rail, about 35 degrees down: low enough that who is ahead reads left to right,
    // not near to far (a block in the way goes see-through)
    const dist = hw + 9 + sl.span * 0.3;
    // (spread across the course, the lens goes higher: a map of the four, left to right)
    const rise = 0.62 + 0.55 * Math.max(0, Math.min(1, (sl.wide - 9) / 12));
    out.pos.set(sl.side * dist, sl.cy + 3 + (dist + sl.cx * -sl.side) * rise, sl.cz);
    out.look.set(sl.cx, sl.cy + 0.5, sl.cz);
    fitBegin(out.pos, out.look);
    const x0 = sl.cx - sl.wide / 2, x1 = sl.cx + sl.wide / 2;
    fitPoint(out.pos, x0, sl.cy, sl.cz - sl.span / 2); fitPoint(out.pos, x0, sl.cy, sl.cz + sl.span / 2);
    fitPoint(out.pos, x1, sl.cy + 1.6, sl.cz - sl.span / 2); fitPoint(out.pos, x1, sl.cy + 1.6, sl.cz + sl.span / 2);
    out.fov = THREE.MathUtils.clamp(fovFor(fitNeed, 1.2), 16, 52);
    out.posLambda = snap ? 30 : 3; out.lookLambda = snap ? 30 : 3.6;
  }

  /** Would a lens at (x,y,z) see bot `id` clearly? (used by the director to vet shots) */
  function canSee(view, x, y, z, id) {
    botPos(view, id, tmp);
    return sightTo(view, x, y, z, tmp.x, tmp.y, tmp.z) < 0.3;
  }

  return { leader, track, overview, cutline, sideline, zone, canSee, companions };
}

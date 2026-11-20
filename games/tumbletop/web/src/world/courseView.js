// Course + obstacle meshes, built from sim/course.js data (never from hard-coded layout).
// Static pieces are merged per material; moving obstacles are instanced and posed each frame
// from the sampled sim state (view.obsPos / obsQuat / obsActive).
import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { sliderPose, pendulumTheta, marblePose, rampY } from '../../../sim/obstacles.js';
import { disposeTree } from './dispose.js';

const SIM_DT = 1 / 60;

const TOY = ['#ff5a7a', '#ffc93c', '#3dc6ff', '#7c5cff', '#40d98a', '#ff8a3d'];
// spinning-top bodies: deep, saturated lacquer colours that contrast with the pink hazard arms
const TOP_COLS = ['#2f7bff', '#8a4dff', '#0fb59c', '#ff7a1a', '#ffb000'];
const MAT_DEF = {
  boardTile: { tex: 'boardTile', scale: 6, rough: 0.55 },
  feltMat: { tex: 'feltMat', scale: 7, rough: 0.95 },
  bookSpines: { tex: 'bookSpines', scale: 5, rough: 0.6 },
  bookTop: { tex: 'bookTop', scale: 6, rough: 0.8 },
  eraser: { tex: 'eraser', scale: 3, rough: 0.9, bevel: 0.45 },
  crayonBlue: { tex: 'crayon', scale: 4, rough: 0.5, color: '#3d7dff', bevel: 0.32 },
  crayonRed: { tex: 'crayon', scale: 4, rough: 0.5, color: '#8a5cff', bevel: 0.32 },
  woodBoard: { tex: 'woodBoard', scale: 10, rough: 0.7 },
  foamMat: { tex: 'foamMat', scale: 8, rough: 0.85 },
  paperRunway: { tex: 'paperRunway', scale: 6, rough: 0.85 },
  playMat: { tex: 'playMat', scale: 8, rough: 0.8 },
  boardEdge: { tex: 'boardEdge', scale: 2, rough: 0.5 },
  woodRail: { tex: 'woodRail', scale: 3, rough: 0.6 },
};

// Softly bevelled box with world-scaled UVs (texture tiles at `scale` metres per repeat on every
// face). The bevel catches a rim of light on every edge, so slabs read as chunky toy pieces.
function worldBox(sx, sy, sz, scale, radius = 0.2) {
  const g = new RoundedBoxGeometry(sx, sy, sz, 2, Math.min(radius, sx / 2.2, sy / 2.2, sz / 2.2));
  const uv = g.attributes.uv;
  // face order: +x, -x, +y, -y, +z, -z (equal vertex chunks)
  const dims = [[sz, sy], [sz, sy], [sx, sz], [sx, sz], [sx, sy], [sx, sy]];
  const per = uv.count / 6;
  for (let i = 0; i < uv.count; i++) {
    const f = Math.min(5, Math.floor(i / per));
    uv.setXY(i, (uv.getX(i) * dims[f][0]) / scale, (uv.getY(i) * dims[f][1]) / scale);
  }
  return g;
}

function paint(g, color) {
  const c = new THREE.Color(color);
  const n = g.attributes.position.count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
  g.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return g;
}
function clean(g) {
  // strip to position/normal/color so heterogeneous primitives merge
  const out = g.index ? g.toNonIndexed() : g;
  for (const k of Object.keys(out.attributes)) if (!['position', 'normal', 'color'].includes(k)) out.deleteAttribute(k);
  return out;
}

// Chevron arrowhead pointing +y, centred on the origin.
function chevron(w, h, t) {
  const s = new THREE.Shape();
  s.moveTo(-w / 2, -h / 2); s.lineTo(0, h / 2 - t); s.lineTo(w / 2, -h / 2); s.lineTo(w / 2, -h / 2 + t);
  s.lineTo(0, h / 2); s.lineTo(-w / 2, -h / 2 + t); s.closePath();
  return s;
}
// Flat decal geometry lying on y, pointing along (tx, tz) in the x-z plane.
function flatChevron(cx, y, cz, tx, tz, w, h, t, color) {
  const g = new THREE.ShapeGeometry(chevron(w, h, t));
  g.rotateX(-Math.PI / 2);
  g.rotateY(Math.atan2(-tx, -tz));
  g.translate(cx, y, cz);
  return clean(paint(g, color));
}
// Sweep telegraph: dashed pink/cream ring at the arm tips + chevrons showing spin direction.
// Sim convention: arm angle is measured from +x toward +z, so +spin moves along (-sin, cos).
function sweepDecal(out, cx, y, cz, rI, rO, n, spin, radii, counts, sc, lim, chevColor = '#fff3e2') {
  const yy = y + 0.025;
  for (let k = 0; k < n; k++) {
    const a0 = (k / n) * Math.PI * 2, am = a0 + Math.PI / n;
    if (Math.abs(cx + rO * Math.cos(am)) > lim) continue;
    const g = new THREE.RingGeometry(rI, rO, 3, 1, a0, (Math.PI * 2) / n);
    g.rotateX(-Math.PI / 2); g.translate(cx, yy, cz);
    out.push(clean(paint(g, k % 2 ? '#fff3e2' : '#ff2f7a')));
  }
  radii.forEach((r, i) => {
    const cnt = counts[i];
    for (let k = 0; k < cnt; k++) {
      const phi = ((k + 0.5 * i) / cnt) * Math.PI * 2;
      const x = cx + r * Math.cos(phi), z = cz + r * Math.sin(phi);
      if (Math.abs(x) > lim - 0.6) continue;
      out.push(flatChevron(x, yy + 0.004, z, -Math.sin(phi) * spin, Math.cos(phi) * spin, 0.95 * sc, 0.62 * sc, 0.27 * sc, chevColor));
    }
  });
}
// Flat rectangle decal (x-z plane) centred at (cx, y, cz), rotated by yaw about +y.
function flatRect(cx, y, cz, w, d, color, yaw = 0) {
  const g = new THREE.PlaneGeometry(w, d); g.rotateX(-Math.PI / 2);
  if (yaw) g.rotateY(yaw);
  g.translate(cx, y, cz);
  return clean(paint(g, color));
}
// Danger lane under a moving alphabet block: the whole travel fenced by hot-pink / cream striped
// borders, a hot-pink landing pad (outlined square with an X) on every spot
// where the block will land, and chevrons at both stops pointing the way it goes. The lane reads
// from far away as "something big moves along here", with no dark patches that look like holes.
function wearTrack(out, d) {
  const a = d.size.x / 2, hz = d.size.z / 2 + 0.3;
  const hw = d.travel + a + 0.35;
  const cx = d.x, cz = d.z, y = d.y + 0.02;
  // striped warning borders
  const n = Math.max(4, Math.round((hw * 2) / 0.8));
  const dl = (hw * 2) / n;
  for (const s of [-1, 1]) {
    for (let k = 0; k < n; k++) {
      out.push(flatRect(cx - hw + (k + 0.5) * dl, y + 0.006, cz + s * (hz - 0.16), dl * 0.98, 0.32, k % 2 ? '#fff6ea' : '#ff2f7a'));
    }
  }
  const steps = d.mode === 'tumble' ? Math.max(1, Math.round((2 * d.travel) / d.size.x)) : 1;
  const stride = (2 * d.travel) / steps;
  for (let k = 0; k <= steps; k++) {
    // landing pad: a hot-pink outlined square (a little smaller than the block)
    const x = cx - d.travel + k * stride, e = a * 0.9, t = Math.max(0.26, a * 0.16);
    // dark plum underlay so the pink pad pops on any floor
    out.push(flatRect(x, y + 0.007, cz, 2 * e + 0.2, 2 * e + 0.2, '#2a1458'));
    out.push(flatRect(x, y + 0.0075, cz, 2 * e - 2 * t, 2 * e - 2 * t, '#ffd6e4'));
    for (const [ox, oz, w, dd] of [[0, e - t / 2, 2 * e, t], [0, -e + t / 2, 2 * e, t], [e - t / 2, 0, t, 2 * e], [-e + t / 2, 0, t, 2 * e]]) out.push(flatRect(x + ox, y + 0.008, cz + oz, w, dd, '#ff2f7a'));
    // a fat cross in the middle of each pad (the "X marks where it lands")
    for (const yaw of [Math.PI / 4, -Math.PI / 4]) out.push(flatRect(x, y + 0.009, cz, (e - t) * 2.4, t * 1.25, '#ff2f7a', yaw));
  }
  // ram lanes: chevrons between the two stops, pointing both ways (it shoves there and back)
  if (d.mode !== 'tumble') for (let k = 0; k < steps; k++) {
    const x = cx - d.travel + (k + 0.5) * stride;
    for (const s of [-1, 1]) out.push(flatChevron(x + s * 0.35, y + 0.008, cz, s, 0, Math.min(1.6, a * 0.9), 0.55, 0.22, '#ff2f7a'));
  }
  for (const s of [-1, 1]) {
    for (let k = 0; k < 2; k++) out.push(flatChevron(cx + s * (hw + 0.55 + k * 0.7), y + 0.006, cz, s, 0, 1.3, 0.55, 0.22, '#ff2f7a'));
  }
}
// Vertex colours with alpha (vec4) for translucent smears.
function paintAlpha(g, color, alphaOf) {
  const c = new THREE.Color(color);
  const pos = g.attributes.position, n = pos.count;
  const col = new Float32Array(n * 4);
  for (let i = 0; i < n; i++) { col[i * 4] = c.r; col[i * 4 + 1] = c.g; col[i * 4 + 2] = c.b; col[i * 4 + 3] = alphaOf(pos.getX(i), pos.getY(i), pos.getZ(i)); }
  g.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return g;
}
// Motion smear trailing a sweeper arm: a flat fan behind arm direction +x (local), spanning
// `span` radians back against the spin, from radius r0 to r1, fading out away from the arm.
// spin > 0 means the arm moves from +x toward +z, so the smear lies on the -z side.
function smearFan(r0, r1, span, spin, color, peak) {
  const g = new THREE.RingGeometry(r0, r1, 20, 1, spin > 0 ? 0 : -span, span);
  g.rotateX(-Math.PI / 2); // ring angle phi -> (cos phi, 0, -sin phi)
  return paintAlpha(g, color, (x, y, z) => {
    const f = Math.min(1, Math.abs(Math.atan2(-z, x)) / span);
    const rr = Math.hypot(x, z);
    const radial = Math.min(1, (rr - r0) / Math.max(0.01, (r1 - r0) * 0.35));
    return peak * Math.pow(1 - f, 1.6) * (0.35 + 0.65 * radial);
  });
}
// Giant pencil standing on its point (support stilt), from y0 (graphite tip) up to y1 (eraser).
function upright(out, x, z, y0, y1, r, color) {
  const lead = 0.4, tipL = 1.5, ferL = 0.55, erL = 0.6, bodyL = y1 - y0 - lead - tipL - ferL - erL;
  if (bodyL <= 0.5) return;
  const parts = [
    [new THREE.CylinderGeometry(0.15, 0.0, lead, 6), '#2e2838', y0 + lead / 2],
    [new THREE.CylinderGeometry(r, 0.15, tipL, 6), '#f4cf98', y0 + lead + tipL / 2],
    [new THREE.CylinderGeometry(r, r, bodyL, 6), color, y0 + lead + tipL + bodyL / 2],
    [new THREE.CylinderGeometry(r * 1.06, r * 1.06, ferL, 14), '#d4d9e2', y1 - erL - ferL / 2],
    [new THREE.CylinderGeometry(r, r, erL, 14), '#ff7fa8', y1 - erL / 2],
  ];
  for (const [g, c, y] of parts) { g.translate(x, y, z); out.push(clean(paint(g, c))); }
}
// Lens fade: a hazard that swings, spins or rolls right past the chase lens turns to glass instead
// of filling the frame and hiding the subject. The opaque draw keeps only the fragments more than
// FAR metres from the lens; a second, blended draw of the same instances (sharing the instance
// buffers, so it costs one extra draw call and no CPU work) shows the nearer fragments as a
// fading ghost. Shadows still come from the full opaque shape.
const FADE_NEAR = 2.4, FADE_FAR = 5.6;
function fadeInject(sh, ghost, near, far) {
  sh.vertexShader = sh.vertexShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vTTW;')
    .replace('#include <project_vertex>', `#include <project_vertex>
      {
        vec4 ttw = vec4(transformed, 1.0);
        #ifdef USE_INSTANCING
        ttw = instanceMatrix * ttw;
        #endif
        vTTW = (modelMatrix * ttw).xyz;
      }`);
  sh.fragmentShader = sh.fragmentShader
    .replace('#include <common>', '#include <common>\nvarying vec3 vTTW;')
    .replace('#include <clipping_planes_fragment>', `#include <clipping_planes_fragment>
      float ttFade = smoothstep(${near.toFixed(2)}, ${far.toFixed(2)}, distance(vTTW, cameraPosition));
      ${ghost ? 'if (ttFade > 0.995) discard;' : 'if (ttFade <= 0.995) discard;'}`)
    .replace('#include <alphatest_fragment>', `${ghost ? 'diffuseColor.a *= 0.5 * ttFade * ttFade * ttFade; if (diffuseColor.a < 0.02) discard;' : ''}\n#include <alphatest_fragment>`);
}
function lensFade(mesh, near = FADE_NEAR, far = FADE_FAR) {
  const mat = mesh.material;
  const base = mat.onBeforeCompile;
  const key = mat.customProgramCacheKey() + `|lens${near}-${far}`;
  const gm = mat.clone();
  mat.onBeforeCompile = (sh, r) => { base.call(mat, sh, r); fadeInject(sh, false, near, far); };
  mat.customProgramCacheKey = () => key + 'o';
  gm.onBeforeCompile = (sh, r) => { base.call(mat, sh, r); fadeInject(sh, true, near, far); };
  gm.customProgramCacheKey = () => key + 'g';
  gm.transparent = true; gm.depthWrite = false;
  let ghost;
  if (mesh.isInstancedMesh) {
    ghost = new THREE.InstancedMesh(mesh.geometry, gm, mesh.count);
    ghost.instanceMatrix = mesh.instanceMatrix;
    if (mesh.instanceColor) ghost.instanceColor = mesh.instanceColor;
    ghost.frustumCulled = false;
  } else ghost = new THREE.Mesh(mesh.geometry, gm);
  ghost.castShadow = false; ghost.receiveShadow = true;
  ghost.name = (mesh.name || 'hazard') + ':ghost';
  mesh.add(ghost);
  return ghost;
}
// Fall-edge trim: a dashed hot-pink / cream curb painted along every open side of a walkable
// deck (inside the bevel, so it sits flat on the top face), so the edge you can be knocked off
// reads as an edge from any distance.
function edgeTrims(out, course) {
  const covered = (s, sx) => (course.walls || []).some((w) => w.min.z <= s.z0 + 0.5 && w.max.z >= s.z1 - 0.5
    && (sx < 0 ? w.max.x >= s.x - s.width / 2 - 0.05 && w.min.x <= s.x - s.width / 2 + 0.7 : w.min.x <= s.x + s.width / 2 + 0.05 && w.max.x >= s.x + s.width / 2 - 0.7));
  for (const s of course.surfaces) {
    const bevel = (MAT_DEF[s.material]?.bevel ?? 0.2);
    const dz = s.z1 - s.z0, dy = (s.y1 ?? s.y0) - s.y0, L = Math.hypot(dz, dy), ang = Math.atan2(dy, dz);
    const w = s.width < 5 ? 0.26 : 0.36;
    const local = [];
    for (const sx of [-1, 1]) {
      if (covered(s, sx)) continue;
      const xc = (s.x ?? 0) + sx * (s.width / 2 - bevel - w / 2 - 0.02);
      const n = Math.max(2, Math.round((L - 2 * bevel) / 1.1));
      const dl = (L - 2 * bevel) / n;
      for (let k = 0; k < n; k++) local.push(flatRect(xc, 0.022, bevel + (k + 0.5) * dl, w, dl * 0.985, k % 2 ? '#fff3e2' : '#ff2f7a'));
    }
    if (!local.length) continue;
    const m = new THREE.Matrix4().makeRotationX(-ang).premultiply(new THREE.Matrix4().makeTranslation(0, s.y0, s.z0));
    for (const g of local) { g.applyMatrix4(m); out.push(g); }
  }
}
// Padded course rail: a row of plump quilted cushions (two calm tones, a seam between each) under a
// gold piping, instead of a plain plank: soft-play padding that reads as "bumper", not "fence".
function paddedRail(out, w) {
  const sx = w.max.x - w.min.x, sy = w.max.y - w.min.y, sz = w.max.z - w.min.z;
  const alongZ = sz >= sx, len = alongZ ? sz : sx, thick = alongZ ? sx : sz;
  const n = Math.max(1, Math.round(len / 1.6)), seg = len / n;
  for (let k = 0; k < n; k++) {
    const c = new RoundedBoxGeometry(alongZ ? thick + 0.08 : seg - 0.06, sy - 0.16, alongZ ? seg - 0.06 : thick + 0.08, 3, 0.26);
    const o = -len / 2 + (k + 0.5) * seg;
    c.translate((w.min.x + w.max.x) / 2 + (alongZ ? 0 : o), w.min.y + (sy - 0.16) / 2, (w.min.z + w.max.z) / 2 + (alongZ ? o : 0));
    out.push(clean(paint(c, k % 2 ? '#2fd3b5' : '#5fe6cb')));
  }
  const pipe = new RoundedBoxGeometry(alongZ ? thick * 0.7 : len, 0.22, alongZ ? len : thick * 0.7, 2, 0.1);
  pipe.translate((w.min.x + w.max.x) / 2, w.max.y - 0.09, (w.min.z + w.max.z) / 2);
  out.push(clean(paint(pipe, '#ffc21a')));
}
function canvasTexture(w, h, draw) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d'), w, h);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}
// Ruler face: bright lacquered yellow, steel edge, crisp graduations and big numbers. The bottom
// strip is the plain edge colour that the ruler's side faces sample.
function rulerTexture() {
  return canvasTexture(256, 2048, (g, w, h) => {
    const strip = 28, H = h - strip;
    // bottom strip: candy bands that the ruler's long side faces sample along their length, so the
    // tipping edge of every seesaw wears the moving-hazard stripes
    for (let i = 0; i < 12; i++) { g.fillStyle = i % 2 ? '#fff3e2' : '#ff2f7a'; g.fillRect((i * w) / 12, H, w / 12 + 1, strip); }
    g.fillStyle = '#ffd23a'; g.fillRect(0, 0, w, H);
    for (let i = 0; i < 48; i++) { g.fillStyle = `rgba(222,140,16,${0.05 + (i % 5) * 0.014})`; g.fillRect((i * 37) % w, 0, 2 + (i % 3), H); }
    g.fillStyle = '#c3cad4'; g.fillRect(0, 0, 18, H);
    g.fillStyle = '#f2f5fa'; g.fillRect(4, 0, 4, H);
    const units = 18, step = H / units;
    g.fillStyle = '#2b1d0e';
    for (let i = 0; i <= units * 10; i++) {
      const y = (i * step) / 10;
      const len = i % 10 === 0 ? 72 : i % 5 === 0 ? 48 : 26, wd = i % 10 === 0 ? 6 : 3;
      g.fillRect(18, y - wd / 2, len, wd);
      g.fillRect(w - len, y - wd / 2, len, wd);
    }
    g.font = 'bold 66px "Arial Rounded MT Bold", "Arial Black", sans-serif';
    g.textAlign = 'center'; g.textBaseline = 'middle';
    for (let i = 1; i < units; i++) { g.save(); g.translate(w / 2 + 6, i * step); g.rotate(Math.PI / 2); g.fillText(String(i), 0, 0); g.restore(); }
    // strike band: where the swinging pencil's eraser crosses the plank (z0 + 0.7 .. z0 + 2.7 m),
    // a bold hot-pink / cream hazard band in a dark plum frame, so the hit zone reads at a glance
    const y0 = (0.7 / units) * H, y1 = (2.7 / units) * H;
    g.fillStyle = '#2a1458'; g.fillRect(0, y0 - 14, w, y1 - y0 + 28);
    g.save(); g.beginPath(); g.rect(0, y0, w, y1 - y0); g.clip();
    for (let k = -8; k < 16; k++) { g.fillStyle = k % 2 ? '#fff3e2' : '#ff2f7a'; g.beginPath(); g.moveTo(k * 40, y0); g.lineTo(k * 40 + 40, y0); g.lineTo(k * 40 + 40 + (y1 - y0), y1); g.lineTo(k * 40 + (y1 - y0), y1); g.closePath(); g.fill(); }
    g.restore();
  });
}

// Book-spine ramp in two calm mint tones with cream title bands: a quiet ground, so the dark
// marble lanes, the hot-pink runways and the Gumbles carry all the colour on the climb.
function bookSpinesTexture() {
  const t = canvasTexture(256, 256, (g, w, h) => {
    const cols = ['#5fd9c4', '#48c8b4', '#6fe0cd', '#3fbcaa'];
    let y = 0, k = 0;
    while (y < h) {
      const bh = [40, 30, 46, 36, 34, 42][k % 6];
      g.fillStyle = cols[k % cols.length]; g.fillRect(0, y, w, bh);
      g.fillStyle = 'rgba(255,248,232,0.75)'; g.fillRect(0, y + 6, w, 3); g.fillRect(0, y + bh - 10, w, 3);
      g.fillStyle = 'rgba(20,60,70,0.22)'; g.fillRect(0, y + bh - 2, w, 2);
      y += bh; k++;
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}
// Foam puzzle play-mat: big interlocking tiles in two calm azure tones with jigsaw tabs. One
// repeat = 2x2 tiles. Flat colour with a pale seam, so Gumbles, their shadows and the hot-pink
// hazards read crisply on top of it.
function foamMatTexture() {
  const t = canvasTexture(512, 512, (g, w) => {
    const n = 2, c = w / n, tab = c * 0.12;
    const cols = ['#45bdf2', '#6fd0fa'];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = cols[(x + y) % 2]; g.fillRect(x * c, y * c, c, c); }
    // jigsaw tabs: each tile pushes a round tab into its right and lower neighbours, two per edge
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      g.fillStyle = cols[(x + y) % 2];
      for (const f of [0.3, 0.7]) {
        g.beginPath(); g.arc(((x + 1) % n) * c, y * c + f * c, tab, -Math.PI / 2, Math.PI / 2); g.fill();
        g.beginPath(); g.arc(x * c + f * c, ((y + 1) % n) * c, tab, 0, Math.PI); g.fill();
      }
    }
    // seams + tab outlines
    g.strokeStyle = 'rgba(255,255,255,0.55)'; g.lineWidth = 3;
    for (let i = 0; i <= n; i++) {
      g.beginPath(); g.moveTo(i * c, 0); g.lineTo(i * c, w); g.stroke();
      g.beginPath(); g.moveTo(0, i * c); g.lineTo(w, i * c); g.stroke();
    }
    // foam texture: very faint pores
    for (let i = 0; i < 2600; i++) {
      const x = (Math.sin(i * 91.7) * 0.5 + 0.5) * w, y = (Math.sin(i * 47.3 + 1.1) * 0.5 + 0.5) * w;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.08)' : 'rgba(10,60,120,0.06)';
      g.fillRect(x, y, 2, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Final Dash play mat: a big lilac board-game mat in two flat tones with a stitched seam and a
// small star in the corner of every square. Flat colour, so the aqua spinner wheel, the
// candy pencils and the Gumbles carry the frame.
function playMatTexture() {
  const t = canvasTexture(512, 512, (g, w) => {
    const n = 2, c = w / n;
    const cols = ['#8f7df5', '#a293fa'];
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { g.fillStyle = cols[(x + y) % 2]; g.fillRect(x * c, y * c, c, c); }
    g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = 4; g.setLineDash([14, 10]);
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) g.strokeRect(x * c + 12, y * c + 12, c - 24, c - 24);
    g.setLineDash([]);
    g.fillStyle = 'rgba(255,255,255,0.22)';
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
      const cx = x * c + 40, cy = y * c + 40;
      g.beginPath();
      for (let k = 0; k < 10; k++) { const r = k % 2 ? 7 : 16, a = (k / 10) * Math.PI * 2 - Math.PI / 2; g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); }
      g.closePath(); g.fill();
    }
    for (let i = 0; i < 2400; i++) {
      const x = (Math.sin(i * 63.7) * 0.5 + 0.5) * w, y = (Math.sin(i * 29.1 + 0.7) * 0.5 + 0.5) * w;
      g.fillStyle = i % 2 ? 'rgba(255,255,255,0.06)' : 'rgba(40,20,120,0.05)';
      g.fillRect(x, y, 2, 2);
    }
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

// Felt play mat for the spinning-top field: a soft sage-mint felt (calmer than a pure green, so
// the tops, their pink sweepers and the Gumbles carry the colour), faint fibre speckle and a
// stitched border on every repeat.
function feltMatTexture() {
  const t = canvasTexture(256, 256, (g, w, h) => {
    g.fillStyle = '#67c99f'; g.fillRect(0, 0, w, h);
    for (let i = 0; i < 5000; i++) {
      const x = (Math.sin(i * 12.9898) * 0.5 + 0.5) * w, y = (Math.sin(i * 78.233 + 2.1) * 0.5 + 0.5) * h;
      g.fillStyle = i % 3 ? 'rgba(255,255,255,0.07)' : 'rgba(20,80,50,0.08)';
      g.fillRect(x, y, 1 + (i % 2), 1);
    }
    g.strokeStyle = 'rgba(255,255,255,0.16)'; g.setLineDash([10, 8]); g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
  });
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  return t;
}

export function createCourseView(scene, course, T) {
  const group = new THREE.Group();
  group.name = 'course';
  scene.add(group);
  const startZ = course.startZ ?? course.start?.z ?? 0;
  const finishZ = course.finish?.z ?? startZ + (course.length ?? 300);

  // ------------------------------------------------------------ static surfaces + walls
  T = { ...T, foamMat: foamMatTexture(), feltMat: feltMatTexture(), playMat: playMatTexture(), bookSpines: bookSpinesTexture() };
  const byMat = new Map();
  const add = (mat, geom) => { if (!byMat.has(mat)) byMat.set(mat, []); byMat.get(mat).push(geom); };
  const m4 = new THREE.Matrix4(), q = new THREE.Quaternion(), v = new THREE.Vector3(), s1 = new THREE.Vector3(1, 1, 1);
  for (const s of course.surfaces) {
    const def = MAT_DEF[s.material] || { scale: 5 };
    const th = s.thickness ?? 1;
    const dz = s.z1 - s.z0, dy = (s.y1 ?? s.y0) - s.y0;
    const L = Math.hypot(dz, dy);
    const g = worldBox(s.width, th, L, def.scale, def.bevel ?? 0.2);
    const ang = Math.atan2(dy, dz);
    q.setFromAxisAngle(v.set(1, 0, 0), -ang);
    // centre = midpoint of top line, pushed down along the slab normal
    const ny = Math.cos(ang), nz = -Math.sin(ang);
    v.set(s.x ?? 0, (s.y0 + (s.y1 ?? s.y0)) / 2 - ny * th / 2, (s.z0 + s.z1) / 2 - nz * th / 2);
    m4.compose(v, q, s1);
    g.applyMatrix4(m4);
    add(s.material, g);
  }
  const padded = [];
  for (const w of course.walls || []) {
    if (w.material === 'woodRail') { paddedRail(padded, w); continue; }
    const def = MAT_DEF[w.material] || { scale: 3 };
    const sx = w.max.x - w.min.x, sy = w.max.y - w.min.y, sz = w.max.z - w.min.z;
    if (sx <= 0 || sy <= 0 || sz <= 0) continue;
    const g = worldBox(sx, sy, sz, def.scale, 0.12);
    g.translate((w.min.x + w.max.x) / 2, (w.min.y + w.max.y) / 2, (w.min.z + w.max.z) / 2);
    add(w.material, g);
  }
  const staticMeshes = [];
  for (const [mat, list] of byMat) {
    const def = MAT_DEF[mat] || {};
    const geom = mergeGeometries(list, false);
    const material = new THREE.MeshStandardMaterial({
      map: def.tex ? T[def.tex] : null, color: def.color ?? 0xffffff, roughness: def.rough ?? 0.7, metalness: 0,
    });
    const mesh = new THREE.Mesh(geom, material);
    mesh.receiveShadow = true; mesh.castShadow = true;
    mesh.name = `surface:${mat}`;
    group.add(mesh);
    staticMeshes.push(mesh);
  }

  // ------------------------------------------------------------ start + finish dressing
  // Each round of a show runs its own stretch of the course, so the start line and the finish
  // arch (posts, caps, banner, chequered line) live in one small group that setRound() rebuilds
  // at the round's start and finish. Built here for the course's own start and finish.
  const sharedTex = new Set(Object.values(T).filter((t) => t && t.isTexture)); // kept when the dressing moves
  let dressing = null;
  function buildDressing(st, f) {
    const g = new THREE.Group();
    g.name = 'startFinish';
    const deco = [];
    const line = new THREE.BoxGeometry(st.width ?? 30, 0.04, 0.5); line.translate(st.x ?? 0, (st.y ?? 0) + 0.02, st.z);
    deco.push(paint(line, '#ffffff'));
    const fw = f.width ?? 24, fh = f.archHeight ?? 6, fy = f.y ?? 0;
    const posts = [];
    for (const sx of [-1, 1]) {
      const post = new THREE.CylinderGeometry(0.55, 0.65, fh + 0.6, 16);
      post.translate((f.x ?? 0) + sx * (fw / 2 - 0.2), fy + (fh + 0.6) / 2, f.z);
      posts.push(paint(post, '#ff5a7a'));
      const cap = new THREE.SphereGeometry(0.85, 16, 12); cap.translate((f.x ?? 0) + sx * (fw / 2 - 0.2), fy + fh + 0.9, f.z);
      posts.push(paint(cap, '#ffd23f'));
    }
    // (the arch's posts are their own mesh: they step out with the banner for the line camera)
    for (const [list, name] of [[deco, 'startLine'], [posts, 'finishPosts']]) {
      const parts = list.map(clean);
      const m = new THREE.Mesh(mergeGeometries(parts, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.45 }));
      for (const p of parts) p.dispose();
      m.castShadow = true; m.receiveShadow = true; m.name = name;
      g.add(m);
    }
    const banner = new THREE.Mesh(new THREE.BoxGeometry(fw, 1.6, 0.25), new THREE.MeshStandardMaterial({ map: T.finishBanner, roughness: 0.6 }));
    banner.position.set(f.x ?? 0, fy + fh, f.z);
    banner.castShadow = true;
    banner.name = 'finishBanner';
    g.add(banner);
    const ftex = T.checker.clone(); ftex.needsUpdate = true; ftex.repeat.set(fw / 1.0, 1);
    const fline = new THREE.Mesh(new THREE.PlaneGeometry(fw, 1.0), new THREE.MeshStandardMaterial({ map: ftex, roughness: 0.6 }));
    fline.rotation.x = -Math.PI / 2; fline.position.set(f.x ?? 0, fy + 0.02, f.z); fline.receiveShadow = true;
    g.add(fline);
    return g;
  }
  function placeDressing(st, f) {
    if (dressing) { group.remove(dressing); disposeTree(dressing, { keep: sharedTex }); }
    dressing = buildDressing(st, f);
    group.add(dressing);
  }
  placeDressing(course.start || { z: startZ, y: 0, width: 30 }, course.finish || { z: finishZ, y: 0, width: 24, archHeight: 6 });

  // ------------------------------------------------------------ obstacles
  // One hazard language for the whole course: anything that can HIT a Gumble wears hot-pink /
  // cream candy stripes, and every sweeping or sliding hazard paints its reach on the floor
  // (dashed sweep ring + spin chevrons, striped slide tracks), so danger reads before contact.
  const defs = course.obstacles;
  const kinds = { top: [], pencil: [], marble: [], seesaw: [], pendulum: [], swing: [], cube: [] };
  defs.forEach((d, j) => {
    if (d.type === 'spinner') (d.style === 'pencil' ? kinds.pencil : kinds.top).push(j);
    else if (d.type === 'marble') kinds.marble.push(j);
    else if (d.type === 'seesaw') kinds.seesaw.push(j);
    else if (d.type === 'pendulum') (d.style === 'pencil' ? kinds.swing : kinds.pendulum).push(j);
    else if (d.type === 'block' || d.type === 'slider') kinds.cube.push(j);
  });
  const updaters = [];
  const cutters = []; // (cameraPosition, view, dt, on): scenery that steps aside for the lens
  const tmpC = new THREE.Color();
  const mA = new THREE.Matrix4(), mB = new THREE.Matrix4(), qA = new THREE.Quaternion(), vA = new THREE.Vector3(), sA = new THREE.Vector3();
  const zero = new THREE.Matrix4().makeScale(0, 0, 0);
  const readQ = (view, j, out) => out.set(view.obsQuat[j * 4], view.obsQuat[j * 4 + 1], view.obsQuat[j * 4 + 2], view.obsQuat[j * 4 + 3]);
  const floorY = course.floorY ?? (course.killY ?? -10) - 4;
  const floorHalf = (z, y) => {
    let hw = 0;
    for (const s of course.surfaces) if (z >= s.z0 && z <= s.z1 && Math.abs(s.y0 - y) < 0.3 && Math.abs((s.y1 ?? s.y0) - y) < 0.3) hw = Math.max(hw, Math.abs(s.x ?? 0) + s.width / 2);
    return hw || 12;
  };
  const smearMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true, depthWrite: false, side: THREE.DoubleSide, toneMapped: false });
  const decals = []; // flat floor telegraphs (merged once, one draw call)
  const pulse = []; // hazard telegraphs that breathe (emissive pulse; merged once, one draw call)
  const props = []; // static vertex-coloured obstacle furniture (merged once, one draw call)
  props.push(...padded);
  edgeTrims(decals, course);
  const instanced = (geo, mat, n) => {
    const m = new THREE.InstancedMesh(geo, mat, n);
    m.castShadow = true; m.receiveShadow = true; m.frustumCulled = false; m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(m);
    return m;
  };

  // Spinning tops: lathe body with spin chevrons + spiral candy stripes, padded candy-cane
  // sweeper arms with gold bumper knobs, and a dashed sweep ring painted on the felt.
  if (kinds.top.length) {
    const nT = kinds.top.length;
    // profile in units of (postRadius, height): chevron hub drum, flared belly, gold handle
    const prof = [[0, 0], [0.64, 0], [0.7, 0.015], [0.72, 0.04], [0.72, 0.27], [0.68, 0.3], [0.76, 0.33], [0.93, 0.42],
      [1.0, 0.49], [1.0, 0.515], [0.93, 0.575], [0.78, 0.62], [0.55, 0.655], [0.33, 0.68], [0.22, 0.705], [0.19, 0.74],
      [0.19, 0.86], [0.26, 0.875], [0.31, 0.91], [0.3, 0.955], [0.2, 0.99], [0, 1]];
    const body = new THREE.LatheGeometry(prof.map(([r, y]) => new THREE.Vector2(r, y)), 40);
    const spin = new Float32Array(nT);
    kinds.top.forEach((j, k) => { spin[k] = Math.sign(defs[j].omega) || 1; });
    body.setAttribute('aSpin', new THREE.InstancedBufferAttribute(spin, 1));
    const topMat = new THREE.MeshStandardMaterial({ roughness: 0.32, metalness: 0 });
    topMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aSpin; varying float vSpin; varying vec3 vObj;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvSpin = aSpin; vObj = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vSpin; varying vec3 vObj;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 base = diffuseColor.rgb;
            vec3 cream = vec3(1.0, 0.95, 0.86);
            vec3 gold = vec3(1.0, 0.74, 0.16);
            float ang = atan(vObj.z, vObj.x) * 0.15915494;
            float y = vObj.y;
            // hub: chevrons whose points lead the spin; belly: spiral stripes that visibly turn
            float f = y < 0.3 ? ang * 12.0 + vSpin * abs(y - 0.155) * 16.0 : ang * 6.0 - vSpin * y * 4.0;
            float sw = sin(f * 6.2831853);
            float st = clamp(0.5 + sw / (fwidth(sw) * 1.6 + 1e-4), 0.0, 1.0);
            vec3 c = mix(base, cream, st);
            float band = smoothstep(0.012, 0.004, abs(y - 0.5025));
            c = mix(c, gold, band);
            c *= 1.0 - 0.45 * smoothstep(0.012, 0.0, abs(y - 0.3)); // seam under the belly
            if (y > 0.705) c = y > 0.868 ? base : gold;
            diffuseColor.rgb = c;
          }`);
    };
    topMat.customProgramCacheKey = () => 'tt-top-v3';
    const bodies = instanced(body, topMat, nT);
    let armCount = 0;
    for (const j of kinds.top) armCount += defs[j].arms;
    const armGeo = new THREE.CylinderGeometry(1, 1, 1, 20, 1, false);
    armGeo.rotateZ(-Math.PI / 2); armGeo.translate(0.5, 0, 0);
    const armMat = new THREE.MeshStandardMaterial({ roughness: 0.38 });
    armMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            // ink-indigo lacquer (dark against the felt, the ring and every Gumble) wound with a
            // narrow hot-pink helix that shows the spin
            float f = vObj.x * 5.0 + atan(vObj.z, vObj.y) * 0.15915494;
            float sw = sin(f * 6.2831853);
            float st = clamp(0.5 + (sw - 0.3) / (fwidth(sw) * 1.6 + 1e-4), 0.0, 1.0);
            diffuseColor.rgb = mix(vec3(0.026, 0.018, 0.15), vec3(1.0, 0.13, 0.42), st);
          }`);
    };
    armMat.customProgramCacheKey = () => 'tt-arm-v2';
    const arms = instanced(armGeo, armMat, armCount);
    const knobs = instanced(new THREE.SphereGeometry(1, 16, 10), new THREE.MeshStandardMaterial({ color: 0xffc21a, roughness: 0.25 }), armCount);
    // motion smears trailing every arm (unit fan, scaled per top; mirrored for reverse spin)
    const trails = new THREE.InstancedMesh(smearFan(0.28, 1.04, 0.85, 1, '#ffffff', 0.5), smearMat, armCount);
    trails.frustumCulled = false; trails.renderOrder = 2; trails.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(trails);
    const mTr = new THREE.Matrix4();
    kinds.top.forEach((j, k) => { tmpC.set(TOP_COLS[(defs[j].colorIndex + k) % TOP_COLS.length]); bodies.setColorAt(k, tmpC); });
    lensFade(bodies, 2.0, 4.8); lensFade(arms, 2.0, 4.8); lensFade(knobs, 2.0, 4.8);
    const mArm = new THREE.Matrix4(), qArm = new THREE.Quaternion(), up = new THREE.Vector3(0, 1, 0);
    updaters.push((view) => {
      let ai = 0;
      for (let k = 0; k < kinds.top.length; k++) {
        const j = kinds.top[k], d = defs[j];
        vA.set(view.obsPos[j * 3], view.obsPos[j * 3 + 1], view.obsPos[j * 3 + 2]);
        readQ(view, j, qA);
        mA.compose(vA, qA, sA.set(d.postRadius, d.height, d.postRadius));
        bodies.setMatrixAt(k, mA);
        mA.compose(vA, qA, sA.set(1, 1, 1));
        const rad = d.armHalfWidth * 0.95, knobR = d.armHalfWidth * 1.3, mid = (d.armBottom + d.armTop) / 2;
        const r0 = d.postRadius * 0.55, len = d.radius - knobR - r0;
        for (let n = 0; n < d.arms; n++) {
          qArm.setFromAxisAngle(up, (-n * Math.PI * 2) / d.arms);
          mArm.compose(vA.set(0, 0, 0), qArm, sA.set(1, 1, 1));
          mB.multiplyMatrices(mA, mArm);
          mArm.compose(vA.set(r0, mid, 0), qArm.identity(), sA.set(len, rad, rad));
          mArm.premultiply(mB);
          arms.setMatrixAt(ai, mArm);
          mArm.compose(vA.set(d.radius - knobR, mid, 0), qArm, sA.set(knobR, knobR, knobR));
          mArm.premultiply(mB);
          knobs.setMatrixAt(ai, mArm);
          mTr.compose(vA.set(0, mid + 0.05, 0), qArm, sA.set(d.radius, 1, d.radius * (d.omega < 0 ? -1 : 1)));
          mTr.premultiply(mB);
          trails.setMatrixAt(ai++, mTr);
        }
      }
      bodies.instanceMatrix.needsUpdate = true; arms.instanceMatrix.needsUpdate = true; knobs.instanceMatrix.needsUpdate = true; trails.instanceMatrix.needsUpdate = true;
    });
    for (const j of kinds.top) {
      const d = defs[j];
      sweepDecal(pulse, d.x, d.y, d.z, d.radius + 0.05, d.radius + 0.7, 40, Math.sign(d.omega) || 1, [d.radius - 1.0], [4], 0.95, floorHalf(d.z, d.y) - 0.15);
    }
  }

  // Pencil sweeper(s): giant candy-banded pencils plugged into a heavy sharpener hub, swinging at
  // chest height a hand's breadth over the play mat (so the bar floats on its own shadow), a pink
  // motion smear trailing every arm, and the whole hit disc painted as a board-game spinner wheel
  // with a dashed candy rim and spin arrows.
  for (const j of kinds.pencil) {
    const d = defs[j];
    const parts = [];
    const nA = d.arms || 2, step = (Math.PI * 2) / nA;
    const r0 = d.postRadius, len = d.radius - r0 + 0.1, mid = (d.armBottom + d.armTop) / 2;
    const rad = Math.max(d.armHalfWidth * 1.05, (d.armTop - d.armBottom) / 2);
    for (let k = 0; k < nA; k++) {
      const yaw = -k * step;
      const eraserL = 1.1, ferruleL = 0.7, tipL = 2.0, bodyL = len - eraserL - ferruleL - tipL;
      const pieces = [
        [new THREE.CylinderGeometry(rad * 0.98, rad * 0.98, eraserL, 24), '#ff7fa8', r0 - 0.2 + eraserL / 2],
        [new THREE.CylinderGeometry(rad * 1.08, rad * 1.08, ferruleL, 24), '#d4d9e2', r0 - 0.2 + eraserL + ferruleL / 2],
        [new THREE.CylinderGeometry(rad * 1.12, rad * 1.12, 0.09, 24), '#9aa2ae', r0 - 0.2 + eraserL + 0.16],
        [new THREE.CylinderGeometry(rad * 1.12, rad * 1.12, 0.09, 24), '#9aa2ae', r0 - 0.2 + eraserL + ferruleL - 0.16],
        [new THREE.CylinderGeometry(0.12, rad, tipL, 6), '#f4cf98', r0 - 0.2 + eraserL + ferruleL + bodyL + tipL / 2],
        [new THREE.CylinderGeometry(0.0, 0.22, 0.6, 6), '#2e2838', r0 - 0.2 + len - 0.25],
      ];
      // hexagonal body in deep ink-indigo lacquer (no Gumble wears it, and it sits dark on the
      // pale spinner wheel), ringed by narrow hot-pink / cream warning bands
      const nb = Math.max(3, Math.round(bodyL / 1.7));
      const bl = bodyL / nb, x0b = r0 - 0.2 + eraserL + ferruleL;
      pieces.push([new THREE.CylinderGeometry(rad, rad, bodyL, 6), '#2a2266', x0b + bodyL / 2]);
      for (let b = 1; b < nb; b++) {
        pieces.push([new THREE.CylinderGeometry(rad * 1.03, rad * 1.03, 0.34, 6), '#ff2f7a', x0b + b * bl - 0.2]);
        pieces.push([new THREE.CylinderGeometry(rad * 1.03, rad * 1.03, 0.14, 6), '#fff3e2', x0b + b * bl + 0.05]);
      }
      // padded bumper strapped round the pencil (a fat cream pillow with a hot-pink belt)
      {
        const px = x0b + bodyL * 0.62, pr = Math.min(rad * 1.25, mid - 0.05), pl = 1.5;
        pieces.push([new THREE.CapsuleGeometry(pr, pl - pr, 6, 20), '#fff3e2', px]);
        pieces.push([new THREE.CylinderGeometry(pr * 1.03, pr * 1.03, 0.3, 20), '#ff2f7a', px]);
      }
      for (const [g, c, x] of pieces) {
        g.rotateZ(-Math.PI / 2); g.translate(x, mid, 0); g.rotateY(yaw);
        parts.push(clean(paint(g, c)));
      }
    }
    // heavy hub: a squat sharpener drum on a wide gold flange, chevron bands that lead the spin,
    // a fat purple bumper collar where the pencils plug in, and a domed gold crown
    const spin = Math.sign(d.omega) || 1;
    const H = d.height;
    const flange = new THREE.CylinderGeometry(r0 * 1.22, r0 * 1.3, 0.32, 40); flange.translate(0, 0.16, 0);
    parts.push(clean(paint(flange, '#ffc21a')));
    const nSeg = 16;
    for (let b = 0; b < nSeg; b++) {
      const seg = new THREE.CylinderGeometry(r0, r0 * 1.04, H - 0.32, 4, 1, false, (b * Math.PI * 2) / nSeg, (Math.PI * 2) / nSeg);
      seg.translate(0, 0.32 + (H - 0.32) / 2, 0);
      parts.push(clean(paint(seg, b % 2 ? '#fff3e2' : '#2a2266')));
    }
    const collar = new THREE.TorusGeometry(r0 * 1.02, 0.42, 14, 40); collar.rotateX(Math.PI / 2); collar.translate(0, mid, 0);
    parts.push(clean(paint(collar, '#ff2f7a')));
    const band = new THREE.TorusGeometry(r0 * 1.03, 0.16, 10, 40); band.rotateX(Math.PI / 2); band.translate(0, H - 0.1, 0);
    parts.push(clean(paint(band, '#ffc21a')));
    const crown = new THREE.SphereGeometry(r0 * 1.0, 32, 12, 0, Math.PI * 2, 0, Math.PI / 2); crown.scale(1, 0.45, 1); crown.translate(0, H, 0);
    parts.push(clean(paint(crown, '#ffc21a')));
    for (let b = 0; b < 8; b++) { // chevron fins on the crown pointing the spin
      const a = (b / 8) * Math.PI * 2;
      const fin = new THREE.BoxGeometry(0.18, 0.5, r0 * 0.7); fin.translate(0, H + 0.15, r0 * 0.45); fin.rotateY(a);
      parts.push(clean(paint(fin, '#ff2f7a')));
    }
    // short barber mast + ball and pennants: marks the pivot above the crowd and shows the spin
    const mastH = 4.2, mastR = 0.3, nm = 7, mastY = H + r0 * 0.4;
    for (let b = 0; b < nm; b++) {
      const seg = new THREE.CylinderGeometry(mastR, mastR, mastH / nm, 14); seg.translate(0, mastY + (b + 0.5) * (mastH / nm), 0);
      parts.push(clean(paint(seg, b % 2 ? '#fff3e2' : '#2a2266')));
    }
    const ball = new THREE.SphereGeometry(0.62, 20, 14); ball.translate(0, mastY + mastH + 0.4, 0);
    parts.push(clean(paint(ball, '#ffc21a')));
    for (const dir of [0, Math.PI]) {
      const fs = new THREE.Shape();
      fs.moveTo(0, 0); fs.lineTo(2.6, -0.65); fs.lineTo(0, -1.3); fs.closePath();
      const flag = new THREE.ExtrudeGeometry(fs, { depth: 0.08, bevelEnabled: false });
      flag.translate(mastR, mastY + mastH - 0.1, -0.04);
      flag.rotateY(dir);
      parts.push(clean(paint(flag, dir ? '#40d98a' : '#ff2f7a')));
    }
    const mesh = new THREE.Mesh(mergeGeometries(parts, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.36 }));
    mesh.castShadow = true; mesh.receiveShadow = true;
    group.add(mesh);
    lensFade(mesh);
    const smear = mergeGeometries(Array.from({ length: nA }, (_, k) => {
      const g = smearFan(r0 + 0.3, d.radius + 0.25, Math.min(0.75, step * 0.55), spin, '#ff3d86', 0.5);
      g.rotateY(-k * step); g.translate(0, mid + rad * 0.2, 0);
      return g;
    }), false);
    const smearMesh = new THREE.Mesh(smear, smearMat);
    smearMesh.renderOrder = 2;
    mesh.add(smearMesh);
    // strike wedge: a hot-pink glow painted on the floor just AHEAD of every arm (it turns with
    // the arm), so where the bar is about to sweep reads before it gets there
    const lead = mergeGeometries(Array.from({ length: nA }, (_, k) => {
      const g = smearFan(r0 + 0.4, d.radius + 0.15, Math.min(0.6, step * 0.4), -spin, '#ff1f6a', 0.62);
      g.rotateY(-k * step); g.translate(0, 0.045, 0);
      return g;
    }), false);
    const leadMesh = new THREE.Mesh(lead, smearMat);
    leadMesh.renderOrder = 1;
    mesh.add(leadMesh);
    updaters.push((view) => {
      mesh.position.set(view.obsPos[j * 3], view.obsPos[j * 3 + 1], view.obsPos[j * 3 + 2]);
      readQ(view, j, mesh.quaternion);
    });
    // floor: a board-game spinner wheel over the whole hit disc (alternating deep / light wedges
    // with cream spokes), a dashed candy rim, and big spin arrows
    const lim = floorHalf(d.z, d.y) - 0.15;
    const clampX = (g) => { const pos = g.attributes.position; for (let i = 0; i < pos.count; i++) pos.setX(i, d.x + Math.max(-lim, Math.min(lim, pos.getX(i) - d.x))); return g; };
    const nW = 12, wa = (Math.PI * 2) / nW;
    for (let k = 0; k < nW; k++) {
      const g = new THREE.RingGeometry(r0 + 0.2, d.radius + 0.1, 6, 1, k * wa, wa);
      g.rotateX(-Math.PI / 2); g.translate(d.x, d.y + 0.016, d.z);
      decals.push(clean(paint(clampX(g), k % 2 ? '#7fe3e6' : '#1f9fb4')));
      const spoke = new THREE.RingGeometry(r0 + 0.2, d.radius + 0.1, 1, 1, k * wa - 0.012, 0.024);
      spoke.rotateX(-Math.PI / 2); spoke.translate(d.x, d.y + 0.019, d.z);
      decals.push(clean(paint(clampX(spoke), '#fff3e2')));
    }
    const inner = new THREE.RingGeometry(r0 + 0.2, r0 + 0.75, 40, 1); inner.rotateX(-Math.PI / 2); inner.translate(d.x, d.y + 0.02, d.z);
    decals.push(clean(paint(inner, '#ffc21a')));
    sweepDecal(pulse, d.x, d.y, d.z, d.radius + 0.15, d.radius + 1.0, 96, spin, [d.radius - 1.6, d.radius - 5.2], [10, 6], 1.5, lim, '#fff3e2');
  }

  // Marbles: glossy glass-toy spheres with a two-tone swirl.
  if (kinds.marble.length) {
    const r = defs[kinds.marble[0]].r ?? 0.6;
    const g = new THREE.SphereGeometry(r, 48, 32);
    const marbleMat = new THREE.MeshPhysicalMaterial({ roughness: 0.12, clearcoat: 1, clearcoatRoughness: 0.06, metalness: 0 });
    marbleMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvObj = position;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          {
            vec3 n = normalize(vObj);
            float f = atan(n.z, n.x) * 0.31830989 + n.y * 1.2;
            float sw = sin(f * 6.2831853);
            float st = clamp(0.5 + sw / (fwidth(sw) * 1.6 + 1e-4), 0.0, 1.0);
            diffuseColor.rgb = mix(diffuseColor.rgb, vec3(1.0, 0.96, 0.9), st * 0.9);
          }`);
    };
    marbleMat.customProgramCacheKey = () => 'tt-marble-v2';
    const marbles = instanced(g, marbleMat, kinds.marble.length);
    kinds.marble.forEach((j, k) => { tmpC.set(TOY[(defs[j].colorIndex ?? k) % TOY.length]); marbles.setColorAt(k, tmpC); });
    lensFade(marbles, 1.2, 2.6); // opaque and huge at the frame edge as it ploughs past; only fades if the lens is inside it
    updaters.push((view) => {
      for (let k = 0; k < kinds.marble.length; k++) {
        const j = kinds.marble[k];
        if (!view.obsActive[j]) { marbles.setMatrixAt(k, zero); continue; }
        vA.set(view.obsPos[j * 3], view.obsPos[j * 3 + 1], view.obsPos[j * 3 + 2]);
        readQ(view, j, qA);
        mA.compose(vA, qA, sA.set(1, 1, 1));
        marbles.setMatrixAt(k, mA);
      }
      marbles.instanceMatrix.needsUpdate = true;
    });
    // contact shadow: a tight dark pool pressed into the ramp under every ball (tilted with the
    // slope), so each marble sits heavy on the books instead of floating over them
    {
      const d0 = defs[kinds.marble[0]], rp = d0.ramp;
      const slope = Math.atan2(rp.y1 - rp.y0, rp.z1 - rp.z0);
      const cg = new THREE.CircleGeometry(1, 32); cg.rotateX(-Math.PI / 2); cg.rotateX(-slope);
      paintAlpha(cg, '#1a0b33', (x, y, z) => { const rr = Math.hypot(x, z); return 0.8 * Math.pow(1 - Math.min(1, rr), 0.7); });
      const contact = new THREE.InstancedMesh(cg, smearMat, kinds.marble.length);
      contact.frustumCulled = false; contact.renderOrder = 1; contact.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(contact);
      updaters.push((view) => {
        for (let k = 0; k < kinds.marble.length; k++) {
          const j = kinds.marble[k], d = defs[j];
          if (!view.obsActive[j]) { contact.setMatrixAt(k, zero); continue; }
          const z = view.obsPos[j * 3 + 2];
          if (z < rp.z0 + 0.5) { contact.setMatrixAt(k, zero); continue; }
          mA.compose(vA.set(view.obsPos[j * 3], rampY(rp, z) + 0.05, z), qA.identity(), sA.set(d.r * 0.95, 1, d.r * 1.05));
          contact.setMatrixAt(k, mA);
        }
        contact.instanceMatrix.needsUpdate = true;
      });
    }
    // strike runway: a hot-pink glow with chevrons painted down the lane just AHEAD of every ball
    // (downhill), fading out over ~8 m, so the path the marble is about to plough reads before it
    // gets there and a Gumble standing in it is visibly in the line of fire
    {
      const d0 = defs[kinds.marble[0]], rp = d0.ramp;
      const slope = Math.atan2(rp.y1 - rp.y0, rp.z1 - rp.z0);
      const tex = canvasTexture(64, 256, (g, w, h) => {
        const gr = g.createLinearGradient(0, h, 0, 0);
        gr.addColorStop(0, 'rgba(255,36,104,0.95)'); gr.addColorStop(0.6, 'rgba(255,36,104,0.62)'); gr.addColorStop(1, 'rgba(255,36,104,0)');
        g.fillStyle = gr; g.fillRect(6, 0, w - 12, h);
        for (let k = 0; k < 4; k++) {
          const yb = h - 30 - k * 58, a = 0.95 - k * 0.24;
          g.fillStyle = `rgba(255,246,236,${a})`;
          g.beginPath(); g.moveTo(10, yb); g.lineTo(w / 2, yb - 26); g.lineTo(w - 10, yb); g.lineTo(w - 10, yb + 12); g.lineTo(w / 2, yb - 14); g.lineTo(10, yb + 12); g.closePath(); g.fill();
        }
      });
      tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
      const rg = new THREE.PlaneGeometry(1, 1); rg.rotateX(-Math.PI / 2); rg.translate(0, 0, -0.5); rg.rotateX(-slope);
      const runMat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, toneMapped: false, polygonOffset: true, polygonOffsetFactor: -3, polygonOffsetUnits: -3 });
      const runway = new THREE.InstancedMesh(rg, runMat, kinds.marble.length);
      runway.frustumCulled = false; runway.renderOrder = 1; runway.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(runway);
      const RUN = 10, laneW = (d0.r ?? 1) * 1.7;
      updaters.push((view) => {
        for (let k = 0; k < kinds.marble.length; k++) {
          const j = kinds.marble[k], d = defs[j];
          if (!view.obsActive[j]) { runway.setMatrixAt(k, zero); continue; }
          const z = view.obsPos[j * 3 + 2] - d.r * 0.55;
          const len = Math.min(RUN, z - rp.z0 - 0.2);
          if (len < 0.6 || z > rp.z1) { runway.setMatrixAt(k, zero); continue; }
          mA.compose(vA.set(view.obsPos[j * 3], rampY(rp, z) + 0.06, z), qA.identity(), sA.set(laneW, 1, len));
          runway.setMatrixAt(k, mA);
        }
        runway.instanceMatrix.needsUpdate = true;
        runMat.opacity = 0.78 + 0.22 * uPulse.value / 0.52;
      });
    }
    // dust wake: puffs kicked up where each ball meets the books, left behind in place as it
    // ploughs downhill (world-stationary, so they read as a trail, not a halo)
    const K = 5, SP = 0.62;
    const nM = kinds.marble.length;
    const dustMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 1, emissive: 0xfff2f6, emissiveIntensity: 0.35, transparent: true, opacity: 0.9, depthWrite: false });
    dustMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vLens;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLens = smoothstep(3.0, 6.5, distance((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, cameraPosition));');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLens;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vLens;\nif (diffuseColor.a < 0.03) discard;');
    };
    dustMat.customProgramCacheKey = () => 'tt-dust-v1';
    const dust = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 2), dustMat, nM * K);
    dust.frustumCulled = false; dust.renderOrder = 2; dust.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(dust);
    const mp = { x: 0, y: 0, z: 0, active: false, s: 0 };
    updaters.push((view) => {
      const t = view.tick * SIM_DT;
      for (let k = 0; k < nM; k++) {
        const d = defs[kinds.marble[k]];
        marblePose(d, t, mp);
        const base = Math.floor(mp.s / SP), frac = mp.s / SP - base;
        for (let i = 0; i < K; i++) {
          const dist = (i + frac) * SP;
          if (!mp.active || dist > mp.s - 0.5) { dust.setMatrixAt(k * K + i, zero); continue; }
          const u = dist / (K * SP);
          const idx = base - i;
          const side = (((idx * 7) % 5) - 2) * 0.22 * d.r;
          const sc = (0.3 + 0.75 * u) * Math.sqrt(1 - u) * (0.75 + 0.25 * ((idx * 3) % 2));
          const z = mp.z + dist + d.r * 0.3;
          vA.set(mp.x + side + (idx % 2 ? 1 : -1) * u * d.r * 0.5, rampY(d.ramp, z) + sc * 0.55, z);
          mA.compose(vA, qA.identity(), sA.set(sc * 1.15, sc * 0.8, sc));
          dust.setMatrixAt(k * K + i, mA);
        }
      }
      dust.instanceMatrix.needsUpdate = true;
    });
  }

  // Marble run telegraphs: every marble lane is a dark groove down the book-spine ramp with
  // cream chevrons pointing downhill, and the marbles drop out of a dispenser gantry at the top:
  // angled candy tubes whose dark mouths aim straight down their lanes, under a giant marble jar.
  if (kinds.marble.length) {
    const d0 = defs[kinds.marble[0]];
    const rp = d0.ramp, r = d0.r ?? 1;
    const lanes = [...new Set(kinds.marble.map((j) => defs[j].lane))].sort((a, b) => a - b);
    const ang = Math.atan2(rp.y1 - rp.y0, rp.z1 - rp.z0), Lr = Math.hypot(rp.z1 - rp.z0, rp.y1 - rp.y0);
    const local = [];
    lanes.forEach((x, li) => {
      local.push(flatRect(x, 0.03, Lr / 2, r * 1.75, Lr - 0.6, '#3a2560'));
      local.push(flatRect(x - r * 0.875, 0.034, Lr / 2, 0.16, Lr - 0.6, '#ff2f7a'));
      local.push(flatRect(x + r * 0.875, 0.034, Lr / 2, 0.16, Lr - 0.6, '#ff2f7a'));
      for (let zz = 4 + (li % 2) * 2.5; zz < Lr - 2; zz += 5) local.push(flatChevron(x, 0.038, zz, 0, -1, r * 1.3, 0.7, 0.26, '#fff3e2'));
    });
    const rot = new THREE.Matrix4().makeRotationX(-ang).premultiply(new THREE.Matrix4().makeTranslation(0, rp.y0, rp.z0));
    for (const g of local) { g.applyMatrix4(rot); decals.push(g); }
    // dispenser gantry
    const topY = rp.y1, gz = rp.z1 + 0.6, beamY = topY + 2 * r + 3.4;
    const span = Math.max(...lanes.map(Math.abs)) + 3.2;
    const beam = new RoundedBoxGeometry(span * 2, 1.0, 1.3, 2, 0.3); beam.translate(0, beamY, gz);
    props.push(clean(paint(beam, '#7c5cff')));
    for (const sx of [-1, 1]) {
      const post = new RoundedBoxGeometry(1.0, beamY + 0.5 - floorY, 1.0, 2, 0.3); post.translate(sx * span, (beamY + 0.5 + floorY) / 2, gz);
      props.push(clean(paint(post, '#5a3fd0')));
      const foot = new THREE.CylinderGeometry(0.9, 0.9, 0.5, 20); foot.translate(sx * span, beamY + 0.75, gz);
      props.push(clean(paint(foot, '#ffc21a')));
    }
    // jar on the beam, a heap of spare marbles showing through its open top
    const jar = new THREE.CylinderGeometry(3.2, 3.0, 3.4, 32, 1, true); jar.translate(0, beamY + 2.2, gz + 0.3);
    props.push(clean(paint(jar, '#9fe3ff')));
    const lid = new THREE.TorusGeometry(3.2, 0.28, 10, 32); lid.rotateX(Math.PI / 2); lid.translate(0, beamY + 3.9, gz + 0.3);
    props.push(clean(paint(lid, '#ffc21a')));
    const jarBase = new THREE.CylinderGeometry(3.0, 3.0, 0.3, 32); jarBase.translate(0, beamY + 0.65, gz + 0.3);
    props.push(clean(paint(jarBase, '#9fe3ff')));
    for (let k = 0; k < 7; k++) {
      const mb = new THREE.SphereGeometry(0.95, 16, 12);
      mb.translate(Math.cos(k * 2.4) * 1.7 * (k ? 1 : 0), beamY + 3.4 + (k % 2) * 0.35, gz + 0.3 + Math.sin(k * 2.4) * 1.7 * (k ? 1 : 0));
      props.push(clean(paint(mb, TOY[k % TOY.length])));
    }
    lanes.forEach((x, li) => {
      // spout: tube tilted toward -z so its mouth faces down the lane
      const tilt = 0.85, tubeL = 3.6, tr = r + 0.28;
      const mouth = new THREE.Vector3(x, topY + r + 0.15 + tr * Math.sin(tilt) * 0.2 + 1.25, rp.z1 - r * 0.2);
      const axis = new THREE.Vector3(0, Math.cos(tilt), Math.sin(tilt)); // from mouth up/back into the gantry
      const qT = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), axis);
      const place = (g, along) => { g.applyQuaternion(qT); g.translate(mouth.x + axis.x * along, mouth.y + axis.y * along, mouth.z + axis.z * along); return g; };
      const tube = new THREE.CylinderGeometry(tr, tr, tubeL, 28, 1, true);
      props.push(clean(paint(place(tube, tubeL / 2), TOY[(li + 2) % TOY.length])));
      const inner = new THREE.CylinderGeometry(tr * 0.92, tr * 0.92, tubeL * 0.98, 28, 1, true);
      inner.scale(-1, 1, 1); // inside faces
      props.push(clean(paint(place(inner, tubeL / 2), '#2a1b3d')));
      const rim = new THREE.TorusGeometry(tr, 0.2, 10, 28); rim.rotateX(Math.PI / 2);
      props.push(clean(paint(place(rim, 0), '#ffc21a')));
      const back = new THREE.CircleGeometry(tr * 0.92, 28); back.rotateX(Math.PI / 2);
      props.push(clean(paint(place(back, tubeL * 0.7), '#140c22')));
      const band = new THREE.TorusGeometry(tr + 0.02, 0.12, 8, 28); band.rotateX(Math.PI / 2);
      props.push(clean(paint(place(band, tubeL * 0.45), '#fff3e2')));
    });
  }

  // Ruler seesaws: thick wooden rulers (crisp graduations, numbers, steel edge) rocking on
  // rounded coral fulcrum wedges, held up over the drop by giant upright pencils.
  if (kinds.seesaw.length) {
    const VIS_T = 0.6;
    // real-size bevelled plank (instances only rescale width by a few %), ruler face on top only
    const RW = defs[kinds.seesaw[0]].width, RL = defs[kinds.seesaw[0]].z1 - defs[kinds.seesaw[0]].z0;
    const g = new RoundedBoxGeometry(RW, VIS_T, RL, 2, 0.1);
    const uv = g.attributes.uv, per = uv.count / 6;
    for (let i = 0; i < uv.count; i++) {
      const f = Math.floor(i / per);
      if (f === 0 || f === 1) uv.setXY(i, uv.getX(i), 0.006); // long sides: bands along the length
      else if (f !== 2) uv.setXY(i, 0.5 / 12, 0.006);
    }
    const rulers = instanced(g, new THREE.MeshStandardMaterial({ map: rulerTexture(), roughness: 0.45 }), kinds.seesaw.length);
    for (const j of kinds.seesaw) {
      const d = defs[j];
      const len = d.z1 - d.z0, depth = len * 0.78, top = d.y - VIS_T - 0.05;
      const sh = new THREE.Shape();
      sh.moveTo(-0.9, 0); sh.lineTo(0.9, 0); sh.lineTo(0.2, 1.32); sh.quadraticCurveTo(0, 1.5, -0.2, 1.32); sh.closePath();
      const wedge = new THREE.ExtrudeGeometry(sh, { depth, bevelEnabled: true, bevelThickness: 0.14, bevelSize: 0.14, bevelSegments: 3, curveSegments: 6 });
      wedge.translate(0, -1.64, -depth / 2);
      wedge.translate(d.x, top, d.z);
      props.push(clean(paint(wedge, '#7d6cf2'))); // cool fulcrum: sits back so the striped ruler edge carries the warning
      const band = new THREE.BoxGeometry(1.45, 0.28, depth + 0.32); band.translate(d.x, top - 1.3, d.z);
      props.push(clean(paint(band, '#fff3e2')));
      const baseY = top - 1.64 - 0.14;
      [-0.32, 0.32].forEach((fz, s) => upright(props, d.x, d.z + fz * len, floorY, baseY, 0.45, s ? '#3d8bff' : '#7c5cff'));
    }
    updaters.push((view) => {
      for (let k = 0; k < kinds.seesaw.length; k++) {
        const j = kinds.seesaw[k], d = defs[j];
        readQ(view, j, qA);
        mA.compose(vA.set(d.x, d.y, d.z), qA, sA.set(1, 1, 1));
        mB.compose(vA.set(0, -VIS_T / 2, 0), qA.identity(), sA.set(d.width / RW, 1, (d.z1 - d.z0) / RL));
        mA.multiply(mB);
        rulers.setMatrixAt(k, mA);
      }
      rulers.instanceMatrix.needsUpdate = true;
    });
  }

  // Metronome pendulums: chrome rod + a fat candy-striped drum weight with gold rims, under
  // wooden gantries.
  if (kinds.pendulum.length) {
    const n = kinds.pendulum.length;
    const rodG = new THREE.CylinderGeometry(0.11, 0.11, 1, 10); rodG.translate(0, -0.5, 0);
    const rodMat = new THREE.MeshStandardMaterial({ color: 0xdfe4ec, roughness: 0.22, metalness: 0.85, transparent: true });
    rodMat.onBeforeCompile = (sh) => {
      sh.fragmentShader = sh.fragmentShader.replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= mix(0.1, 1.0, smoothstep(2.5, 6.5, length(vViewPosition)));');
    };
    rodMat.customProgramCacheKey = () => 'tt-rod-v1';
    const rods = instanced(rodG, rodMat, n);
    const bobG = new THREE.CylinderGeometry(1, 1, 2, 40, 1); bobG.rotateX(Math.PI / 2);
    const bobMat = new THREE.MeshStandardMaterial({ roughness: 0.3 });
    bobMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vObjN; varying float vLens;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          vObj = position; vObjN = normal;
          vLens = smoothstep(LENS_NEAR, LENS_FAR, distance((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, cameraPosition));`);
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying vec3 vObj; varying vec3 vObjN; varying float vLens;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          diffuseColor.a *= vLens;
          if (diffuseColor.a < 0.03) discard;
          {
            vec3 pink = vec3(1.0, 0.13, 0.42), cream = vec3(1.0, 0.95, 0.88), gold = vec3(1.0, 0.74, 0.16);
            float ang = atan(vObj.y, vObj.x) * 0.15915494;
            float rr = length(vObj.xy);
            vec3 c;
            if (abs(vObjN.z) > 0.5) {
              float sw = sin((ang * 8.0 + rr * 0.6) * 6.2831853);
              float st = clamp(0.5 + sw / (fwidth(sw) * 1.6 + 1e-4), 0.0, 1.0);
              c = mix(pink, cream, st);
              c = mix(c, gold, smoothstep(0.84, 0.86, rr));
              c = mix(c, diffuseColor.rgb, smoothstep(0.24, 0.22, rr));
            } else {
              c = abs(vObj.z) > 0.78 ? gold : diffuseColor.rgb;
              float sw = sin((ang * 12.0) * 6.2831853);
              float st = clamp(0.5 + sw / (fwidth(sw) * 1.6 + 1e-4), 0.0, 1.0);
              if (abs(vObj.z) < 0.18) c = mix(pink, cream, st);
            }
            diffuseColor.rgb = c;
          }`);
    };
    bobMat.customProgramCacheKey = () => 'tt-bob-v2';
    bobMat.defines = { LENS_NEAR: '2.0', LENS_FAR: '3.4' };
    bobMat.transparent = true;
    const bobs = instanced(bobG, bobMat, n);
    kinds.pendulum.forEach((j, k) => { tmpC.set(TOY[(defs[j].colorIndex + 3) % TOY.length]); bobs.setColorAt(k, tmpC); });
    // gantry: each bridge's weights hang from one long overhead pencil running down the bridge,
    // carried by a single frame at each end (posts well out to the sides), so nothing stands
    // between the chase camera and the swing
    const byX = new Map();
    for (const j of kinds.pendulum) {
      const d = defs[j], p = d.pivot;
      const hub = new THREE.CylinderGeometry(0.5, 0.5, 1.1, 18); hub.rotateX(Math.PI / 2); hub.translate(p.x, p.y, p.z);
      props.push(clean(paint(hub, '#ffc21a')));
      const e = byX.get(p.x) ?? { z0: 1e9, z1: -1e9, y: p.y };
      e.z0 = Math.min(e.z0, p.z); e.z1 = Math.max(e.z1, p.z); e.y = Math.max(e.y, p.y);
      byX.set(p.x, e);
    }
    let fy = 0;
    for (const [x, e] of byX) {
      const z0 = e.z0 - 3, z1 = e.z1 + 3, L = z1 - z0, y = e.y + 0.75, r = 0.7;
      const body = new THREE.CylinderGeometry(r, r, L - 1.6, 6); body.rotateX(Math.PI / 2); body.rotateZ(Math.PI / 6); body.translate(x, y, (z0 + z1) / 2 + 0.8);
      props.push(clean(paint(body, x < 0 ? '#3d7dff' : '#8a5cff')));
      const tip = new THREE.CylinderGeometry(r, 0.05, 1.6, 6); tip.rotateX(Math.PI / 2); tip.rotateZ(Math.PI / 6); tip.translate(x, y, z0 + 0.8);
      props.push(clean(paint(tip, '#f4cf98')));
      fy = Math.max(fy, y);
    }
    // the overhead pencils hang from the rafters on thin cords (no posts in the chase camera's view)
    for (const [x, e] of byX) {
      for (const z of [e.z0 - 1.5, (e.z0 + e.z1) / 2, e.z1 + 1.5]) {
        const cord = new THREE.CylinderGeometry(0.06, 0.06, 30, 5); cord.translate(x, fy + 15.5, z);
        props.push(clean(paint(cord, '#f3ece2')));
        const clip = new THREE.CylinderGeometry(0.3, 0.3, 0.5, 10); clip.translate(x, fy + 0.85, z);
        props.push(clean(paint(clip, '#ffc21a')));
      }
    }
    // swing-zone crossings: candy stripes across the bridge under every weight, edged in gold,
    // with chevrons either side showing the swing
    for (const j of kinds.pendulum) {
      const d = defs[j];
      let top = null;
      for (const sf of course.surfaces) if (d.z >= sf.z0 && d.z <= sf.z1 && Math.abs((sf.x ?? 0) - d.pivot.x) < sf.width / 2 && (!top || sf.y0 > top.y0)) top = sf;
      if (!top) continue;
      const w = top.width - 0.25, x0 = (top.x ?? 0) - w / 2, y = top.y0 + 0.025, hz = d.bobHalfZ + 0.35;
      const ns = 7;
      for (let k = 0; k < ns; k++) pulse.push(flatRect(x0 + (k + 0.5) * (w / ns), y, d.z, (w / ns) * 0.99, hz * 2, k % 2 ? '#fff3e2' : '#ff2f7a'));
      for (const sz of [-1, 1]) {
        pulse.push(flatRect(top.x ?? 0, y + 0.002, d.z + sz * (hz + 0.2), w, 0.4, '#2a1458'));
        pulse.push(flatRect(top.x ?? 0, y + 0.003, d.z + sz * (hz + 0.2), w, 0.12, '#ffc21a'));
      }
    }
    // speed smear: two fading ghosts of each weight trailing its swing
    const ghostMat = new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.28, depthWrite: false, toneMapped: false });
    ghostMat.onBeforeCompile = (sh) => {
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nvarying float vLens;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLens = smoothstep(4.0, 8.0, distance((modelMatrix * instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz, cameraPosition));');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nvarying float vLens;')
        .replace('#include <color_fragment>', '#include <color_fragment>\ndiffuseColor.a *= vLens;');
    };
    ghostMat.customProgramCacheKey = () => 'tt-ghost-v1';
    const ghosts = new THREE.InstancedMesh(bobG, ghostMat, n * 2);
    ghosts.frustumCulled = false; ghosts.renderOrder = 2; ghosts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(ghosts);
    kinds.pendulum.forEach((j, k) => {
      tmpC.set(TOY[(defs[j].colorIndex + 3) % TOY.length]).lerp(new THREE.Color('#ffffff'), 0.45);
      ghosts.setColorAt(k * 2, tmpC); ghosts.setColorAt(k * 2 + 1, tmpC.lerp(new THREE.Color('#ffffff'), 0.4));
    });
    // timing shadow: a soft dark pool on the deck under every weight that slides across with the
    // swing and tightens as the drum comes down to skim the crayon (clipped to the deck)
    const shG = new THREE.CircleGeometry(1, 40); shG.rotateX(-Math.PI / 2);
    paintAlpha(shG, '#2a1458', (x, y, z) => { const r = Math.hypot(x, z); return 0.75 * (1 - Math.max(0, Math.min(1, (r - 0.5) / 0.5))); });
    const shadows = new THREE.InstancedMesh(shG, smearMat, n);
    shadows.frustumCulled = false; shadows.renderOrder = 1; shadows.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(shadows);
    const deck = kinds.pendulum.map((j) => {
      const d = defs[j];
      let top = null;
      for (const sf of course.surfaces) if (d.z >= sf.z0 && d.z <= sf.z1 && Math.abs((sf.x ?? 0) - d.pivot.x) < sf.width / 2 && (!top || sf.y0 > top.y0)) top = sf;
      return top ? { x: top.x ?? 0, hw: top.width / 2 - 0.08, y: top.y0 + 0.045 } : { x: d.pivot.x, hw: 1.5, y: d.pivot.y - d.length - d.bobRadius };
    });
    const qG = new THREE.Quaternion(), zAx = new THREE.Vector3(0, 0, 1);
    updaters.push((view) => {
      const t = view.tick * SIM_DT;
      for (let k = 0; k < kinds.pendulum.length; k++) {
        const j = kinds.pendulum[k], d = defs[j];
        readQ(view, j, qA);
        mA.compose(vA.set(d.pivot.x, d.pivot.y, d.pivot.z), qA, sA.set(1, d.length, 1));
        rods.setMatrixAt(k, mA);
        mA.compose(vA.set(d.pivot.x, d.pivot.y, d.pivot.z), qA, sA.set(1, 1, 1));
        mB.compose(vA.set(0, -d.length, 0), qA.identity(), sA.set(d.bobRadius, d.bobRadius, d.bobHalfZ));
        mA.multiply(mB);
        bobs.setMatrixAt(k, mA);
        const th = pendulumTheta(d, t);
        for (let g = 0; g < 2; g++) {
          const thg = pendulumTheta(d, t - 0.045 * (g + 1));
          // ghosts only when swinging fast (otherwise hide inside the weight)
          const sc = Math.abs(th - thg) > 0.02 ? 0.97 - 0.05 * g : 0;
          qG.setFromAxisAngle(zAx, thg);
          mA.compose(vA.set(d.pivot.x, d.pivot.y, d.pivot.z), qG, sA.set(1, 1, 1));
          mB.compose(vA.set(0, -d.length, 0), qA.identity(), sA.set(d.bobRadius * sc, d.bobRadius * sc, d.bobHalfZ * sc));
          mA.multiply(mB);
          ghosts.setMatrixAt(k * 2 + g, mA);
        }
      }
      for (let k = 0; k < kinds.pendulum.length; k++) {
        const j = kinds.pendulum[k], d = defs[j], dk = deck[k];
        const bx = view.obsPos[j * 3], by = view.obsPos[j * 3 + 1];
        const hgt = Math.max(0, by - d.bobRadius - dk.y);
        const f = 1 - 0.32 * Math.min(1, hgt / 2.2);
        const rx = d.bobRadius * 1.05 * f, rz = (d.bobHalfZ + 0.25) * f;
        const a0 = Math.max(bx - rx, dk.x - dk.hw), a1 = Math.min(bx + rx, dk.x + dk.hw);
        if (a1 - a0 < 0.05) { shadows.setMatrixAt(k, zero); continue; }
        mA.compose(vA.set((a0 + a1) / 2, dk.y, d.pivot.z), qA.identity(), sA.set((a1 - a0) / 2, 1, rz));
        shadows.setMatrixAt(k, mA);
      }
      shadows.instanceMatrix.needsUpdate = true;
      rods.instanceMatrix.needsUpdate = true; bobs.instanceMatrix.needsUpdate = true; ghosts.instanceMatrix.needsUpdate = true;
    });
  }

  // Swinging pencils over the ruler mouths: a giant cobalt pencil hangs point-up from a striped
  // gantry and swings a fat candy eraser-topper (the part that hits) across the ruler. One merged,
  // vertex-coloured instance per pencil (pivot at the origin, hanging down -y) and two fading
  // ghosts of the eraser trailing every fast swing.
  if (kinds.swing.length) {
    const d0 = defs[kinds.swing[0]];
    const Ls = d0.length, R = d0.bobRadius, br = 0.46;
    const parts = [];
    const put = (g, c, y) => { g.translate(0, y, 0); parts.push(clean(paint(g, c))); };
    // pivot hub (axle along z) + graphite point + sharpened wood cone
    { const hub = new THREE.CylinderGeometry(0.42, 0.42, 1.0, 18); hub.rotateX(Math.PI / 2); parts.push(clean(paint(hub, '#ffc21a'))); }
    put(new THREE.CylinderGeometry(0.0, 0.17, 0.5, 6), '#2e2838', -0.3);
    put(new THREE.CylinderGeometry(0.17, br, 1.25, 6), '#f4cf98', -0.55 - 0.625);
    const ferL = 0.5, bodyTop = -1.18, bodyBot = -Ls + R * 1.05 + ferL;
    const bodyL = bodyTop - bodyBot;
    put(new THREE.CylinderGeometry(br, br, bodyL, 6), '#3d7dff', (bodyTop + bodyBot) / 2);
    // a lacquer stripe down every other facet edge and a gold maker's band near the cone
    put(new THREE.CylinderGeometry(br * 1.02, br * 1.02, 0.22, 6), '#ffc21a', bodyTop - 0.35);
    put(new THREE.CylinderGeometry(br * 1.02, br * 1.02, 0.1, 6), '#fff3e2', bodyTop - 0.6);
    // ferrule (crimped silver) into the eraser topper
    put(new THREE.CylinderGeometry(br * 1.12, br * 1.12, ferL, 20), '#d4d9e2', bodyBot - ferL / 2);
    for (const f of [0.25, 0.75]) put(new THREE.CylinderGeometry(br * 1.18, br * 1.18, 0.08, 20), '#9aa2ae', bodyBot - ferL * f);
    // eraser topper: a plump barrel in hot-pink / cream candy wedges, gold rims, rounded foot
    const eH = R * 1.5, eY = -Ls + R * 0.25; // barrel centre (a little above the bob centre)
    const nW = 12;
    for (let k = 0; k < nW; k++) {
      const g = new THREE.CylinderGeometry(R, R, eH, 4, 1, false, (k / nW) * Math.PI * 2, (Math.PI * 2) / nW);
      put(g, k % 2 ? '#fff3e2' : '#ff2f7a', eY);
    }
    for (const sy of [-1, 1]) { const rim = new THREE.TorusGeometry(R * 0.98, 0.12, 8, 32); rim.rotateX(Math.PI / 2); put(rim, '#ffc21a', eY + sy * eH / 2); }
    { const cap = new THREE.SphereGeometry(R, 24, 10, 0, Math.PI * 2, Math.PI / 2, Math.PI / 2); cap.scale(1, 0.55, 1); put(cap, '#ff2f7a', eY - eH / 2); }
    { const top = new THREE.CylinderGeometry(br * 1.2, R * 0.98, 0.2, 24); put(top, '#ff2f7a', eY + eH / 2 + 0.1); }
    const pencilGeo = mergeGeometries(parts, false);
    const pencils = instanced(pencilGeo, new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.34 }), kinds.swing.length);
    pencils.name = 'swingPencils';
    // ghosts of the eraser trailing each swing
    const gG = new THREE.CylinderGeometry(R, R, eH, 24); gG.translate(0, eY, 0);
    const swGhostMat = new THREE.MeshBasicMaterial({ color: 0xffd0e2, transparent: true, opacity: 0.3, depthWrite: false, toneMapped: false });
    const swGhosts = new THREE.InstancedMesh(gG, swGhostMat, kinds.swing.length * 2);
    swGhosts.frustumCulled = false; swGhosts.renderOrder = 2; swGhosts.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
    group.add(swGhosts);
    const qS = new THREE.Quaternion(), zS = new THREE.Vector3(0, 0, 1);
    updaters.push((view) => {
      const t = view.tick * SIM_DT;
      for (let k = 0; k < kinds.swing.length; k++) {
        const j = kinds.swing[k], d = defs[j];
        readQ(view, j, qA);
        mA.compose(vA.set(d.pivot.x, d.pivot.y, d.pivot.z), qA, sA.set(1, 1, 1));
        pencils.setMatrixAt(k, mA);
        const th = pendulumTheta(d, t);
        for (let g = 0; g < 2; g++) {
          const thg = pendulumTheta(d, t - 0.05 * (g + 1));
          const sc = Math.abs(th - thg) > 0.025 ? 0.96 - 0.06 * g : 0;
          qS.setFromAxisAngle(zS, thg);
          mA.compose(vA.set(d.pivot.x, d.pivot.y, d.pivot.z), qS, sA.set(sc, sc || 1e-4, sc));
          swGhosts.setMatrixAt(k * 2 + g, mA);
        }
      }
      pencils.instanceMatrix.needsUpdate = true; swGhosts.instanceMatrix.needsUpdate = true;
    });
    lensFade(pencils, 1.4, 3.4);
    // gantry per row: a fat striped crossbeam a little above the pivots on two tall candy legs
    // standing out past the swing, with gold pivot brackets: the row reads as a gate from afar
    const rows = new Map();
    for (const j of kinds.swing) {
      const d = defs[j], key = d.pivot.z.toFixed(2);
      const e = rows.get(key) ?? { z: d.pivot.z, y: d.pivot.y, x0: 1e9, x1: -1e9, reach: 0 };
      e.x0 = Math.min(e.x0, d.pivot.x); e.x1 = Math.max(e.x1, d.pivot.x);
      e.reach = Math.max(e.reach, d.length * Math.sin(d.amp) + d.bobRadius);
      rows.set(key, e);
      const br2 = new RoundedBoxGeometry(0.5, 0.9, 1.3, 2, 0.12); br2.translate(d.pivot.x, d.pivot.y + 0.35, d.pivot.z);
      props.push(clean(paint(br2, '#ffc21a')));
    }
    for (const e of rows.values()) {
      const xl = e.x0 - e.reach - 1.8, xr = e.x1 + e.reach + 1.8, by = e.y + 1.05;
      const nb = Math.max(6, Math.round((xr - xl) / 1.3));
      for (let b = 0; b < nb; b++) {
        const seg = new THREE.BoxGeometry((xr - xl) / nb + 0.002, 0.9, 0.9);
        seg.translate(xl + (b + 0.5) * ((xr - xl) / nb), by, e.z);
        props.push(clean(paint(seg, b % 2 ? '#fff3e2' : '#7c5cff')));
      }
      for (const x of [xl, xr]) {
        // a slim candy pole (purple / cream bands) from the attic floor, with a gold ball finial
        const y0 = floorY, y1 = by + 0.5, nb2 = Math.max(4, Math.round((y1 - y0) / 1.4));
        for (let b = 0; b < nb2; b++) {
          const pole = new THREE.CylinderGeometry(0.34, 0.34, (y1 - y0) / nb2 + 0.002, 14);
          pole.translate(x, y0 + (b + 0.5) * ((y1 - y0) / nb2), e.z);
          props.push(clean(paint(pole, b % 2 ? '#fff3e2' : '#7c5cff')));
        }
        const cap = new THREE.SphereGeometry(0.62, 18, 12); cap.translate(x, by + 0.85, e.z);
        props.push(clean(paint(cap, '#ffc21a')));
      }
    }
  }

  // Alphabet blocks: instanced rounded cubes with embossed letter faces. The active ones (ram
  // blocks that shove across a gap, giant tumble blocks that cartwheel along a corridor) swap
  // the wooden frame for hot-pink/cream hazard stripes, run on a scuffed wear track with striped
  // borders and landing dents, and give a tell before every move: they rock back, shudder and
  // their stripes flash hot.
  if (kinds.cube.length) {
    const cubes = []; // { j, dy, letter, color, dynamic, scale }
    for (const j of kinds.cube) {
      const d = defs[j];
      const l0 = (d.letter || 'A').charCodeAt(0) - 65;
      if (d.type === 'slider') {
        cubes.push({ j, dy: 0, letter: l0 % 26, color: d.colorIndex % TOY.length, dynamic: true, scale: d.size.x / 2 });
        wearTrack(pulse, d);
        continue;
      }
      const h = d.size?.y ?? 2;
      const stack = Math.max(1, Math.round(h / 2));
      for (let s = 0; s < stack; s++) cubes.push({ j, dy: -h / 2 + 1 + s * 2, letter: (l0 + s * 11 + (s ? j : 0)) % 26, color: (d.colorIndex + s * 2) % TOY.length, dynamic: false, scale: 1 });
    }
    const g = new RoundedBoxGeometry(2, 2, 2, 3, 0.2);
    const letterA = new Float32Array(cubes.length), kindA = new Float32Array(cubes.length), glowA = new Float32Array(cubes.length);
    cubes.forEach((c, i) => { letterA[i] = Math.max(0, Math.min(25, c.letter)); kindA[i] = c.dynamic ? 1 : 0; });
    g.setAttribute('aLetter', new THREE.InstancedBufferAttribute(letterA, 1));
    g.setAttribute('aKind', new THREE.InstancedBufferAttribute(kindA, 1));
    const glowAttr = new THREE.InstancedBufferAttribute(glowA, 1);
    glowAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aGlow', glowAttr);
    // cut-away: a block standing between the lens and a racer is drawn as a see-through screen
    const cutA = new Float32Array(cubes.length);
    const cutAttr = new THREE.InstancedBufferAttribute(cutA, 1);
    cutAttr.setUsage(THREE.DynamicDrawUsage);
    g.setAttribute('aCut', cutAttr);
    const mat = new THREE.MeshStandardMaterial({ roughness: 0.48 });
    mat.onBeforeCompile = (sh) => {
      sh.uniforms.uAtlas = { value: T.letters };
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aLetter; attribute float aKind; attribute float aGlow; attribute float aCut; varying float vLetter; varying float vKind; varying float vGlow; varying float vCut; varying vec3 vLP; varying vec3 vLN;')
        .replace('#include <begin_vertex>', '#include <begin_vertex>\nvLetter = aLetter; vKind = aKind; vGlow = aGlow; vCut = aCut; vLP = position; vLN = normal;');
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform sampler2D uAtlas; varying float vLetter; varying float vKind; varying float vGlow; varying float vCut; varying vec3 vLP; varying vec3 vLN; float gHot = 0.0;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          if (vCut > 0.02) {
            // a fine screen: most of the block's pixels are dropped, its outline and colour stay
            vec2 fc = floor(gl_FragCoord.xy);
            float n = fract(52.9829189 * fract(0.06711056 * fc.x + 0.00583715 * fc.y));
            if (n < vCut * 0.82) discard;
          }
          {
            // per-face planar UVs from the local position so every letter reads upright
            vec3 an = abs(vLN); vec2 fp;
            if (an.x > an.y && an.x > an.z) fp = vec2(-vLP.z * sign(vLN.x), vLP.y);
            else if (an.z > an.y) fp = vec2(vLP.x * sign(vLN.z), vLP.y);
            else fp = vec2(vLP.x, -vLP.z * sign(vLN.y));
            vec2 uv = clamp(fp * 0.5 + 0.5, 0.0, 1.0);
            float edge = min(min(uv.x, 1.0 - uv.x), min(uv.y, 1.0 - uv.y));
            float fw = vKind > 0.5 ? 0.13 : 0.1;
            float frame = 1.0 - smoothstep(fw, fw + 0.015, edge);
            float lip = smoothstep(fw, fw + 0.03, edge) * (1.0 - smoothstep(fw + 0.03, fw + 0.06, edge));
            vec2 cell = vec2(mod(vLetter, 8.0), floor(vLetter / 8.0));
            // atlas is a flipY canvas: cell row r spans v in [1-(r+1)/4, 1-r/4], glyph top at the top
            vec2 auv = vec2((cell.x + 0.1 + uv.x * 0.8) / 8.0, 1.0 - (cell.y + 0.1 + (1.0 - uv.y) * 0.8) / 4.0);
            // threshold the glyph's soft alpha into a crisp edge, so the giant 4 m tumblers'
            // letters stay sharp under magnification
            float la = texture2D(uAtlas, auv).a, lw = fwidth(la) * 0.7 + 0.015;
            float letter = smoothstep(0.5 - lw, 0.5 + lw, la) * (1.0 - frame);
            float sa = texture2D(uAtlas, auv + vec2(-0.0035, 0.007)).a;
            float shadow = smoothstep(0.5 - lw, 0.5 + lw, sa) * (1.0 - frame);
            // static maze blocks are calm scenery: pale tinted faces, a coloured letter, plain
            // wood frame. Moving blocks are THE hazard: solid hot-pink faces, a cream letter and a
            // candy-striped frame that flashes hot white-gold during the wind-up tell.
            vec3 tint = diffuseColor.rgb;
            vec3 cream = vec3(1.0, 0.96, 0.9);
            vec3 face = mix(tint, cream, 0.6);
            vec3 ink = tint * 0.92;
            vec3 wood = vec3(0.9, 0.76, 0.56);
            if (vKind > 0.5) {
              float sw = sin((uv.x + uv.y) * 4.5 * 6.2831853);
              float st = clamp(0.5 + sw / (fwidth(sw) * 1.6 + 1e-4), 0.0, 1.0);
              wood = mix(vec3(1.0, 0.13, 0.42), cream, st);
              face = vec3(1.0, 0.16, 0.45);
              ink = cream;
              gHot = frame * (1.0 - st * 0.4) * vGlow;
            }
            vec3 c = mix(face, wood, frame);
            c *= 1.0 - 0.28 * lip;
            c = mix(c, c * 0.62, shadow * (1.0 - letter));
            c = mix(c, ink, letter);
            diffuseColor.rgb = c;
          }`)
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += vec3(1.0, 0.86, 0.45) * gHot * 0.8;');
    };
    mat.customProgramCacheKey = () => 'alpha-block-v7';
    const im = instanced(g, mat, cubes.length);
    cubes.forEach((c, i) => { tmpC.set(TOY[c.color]); im.setColorAt(i, tmpC); });
    lensFade(im, 2.0, 4.8);
    const yaw = new THREE.Quaternion();
    const pose = { x: 0, y: 0, roll: 0, windup: 0, dir: 1, moving: false };
    const place = (view) => {
      const t = view ? view.tick * SIM_DT : 0;
      for (let i = 0; i < cubes.length; i++) {
        const c = cubes[i], d = defs[c.j];
        if (view && !c.dynamic) continue;
        let x, y, z;
        if (c.dynamic) {
          if (view) { x = view.obsPos[c.j * 3]; y = view.obsPos[c.j * 3 + 1]; z = view.obsPos[c.j * 3 + 2]; readQ(view, c.j, yaw); }
          else { sliderPose(d, 0, pose); x = pose.x; y = pose.y; z = d.z; yaw.identity(); }
          sliderPose(d, t, pose);
          const w = pose.windup;
          // tell: flashing stripes + a shudder during the wind-up; a softer glow while it moves
          glowA[i] = w > 0 ? (0.45 + 0.55 * (0.5 + 0.5 * Math.cos(w * Math.PI * 7))) * Math.min(1, w * 4) : pose.moving ? 0.3 : 0;
          if (w > 0) { x += Math.sin(t * 97) * 0.045 * w; z += Math.sin(t * 83 + 1.3) * 0.03 * w; }
        } else {
          x = d.pos?.x ?? d.x; y = d.pos?.y ?? (d.y + (d.size?.y ?? 2) / 2); z = d.pos?.z ?? d.z;
          yaw.setFromAxisAngle(vA.set(0, 1, 0), (((c.j * 7 + Math.round(c.dy)) % 5) - 2) * 0.035);
        }
        mA.compose(vA.set(x, y + c.dy, z), yaw, sA.set(c.scale, c.scale, c.scale));
        im.setMatrixAt(i, mA);
      }
      im.instanceMatrix.needsUpdate = true;
      glowAttr.needsUpdate = true;
    };
    place(null);
    updaters.push(place);

    // Which blocks hide a racer from this lens? Segment from the lens to each racer against each
    // block's box (grown a little, so a racer at the block's edge counts too).
    const hitBox = (ax, ay, az, bx, by, bz, cx, cy, cz, hx, hy, hz) => {
      let t0 = 0, t1 = 0.97; // stop just short of the racer: a block the racer leans on is not in front of it
      const o = [ax - cx, ay - cy, az - cz], d = [bx - ax, by - ay, bz - az], h = [hx, hy, hz];
      for (let k = 0; k < 3; k++) {
        if (Math.abs(d[k]) < 1e-6) { if (Math.abs(o[k]) > h[k]) return false; continue; }
        let u0 = (-h[k] - o[k]) / d[k], u1 = (h[k] - o[k]) / d[k];
        if (u0 > u1) { const q = u0; u0 = u1; u1 = q; }
        if (u0 > t0) t0 = u0; if (u1 < t1) t1 = u1;
        if (t0 > t1) return false;
      }
      return true;
    };
    cutters.push((cam, view, dt, on) => {
      const k = dt > 0 ? 1 - Math.exp(-10 * dt) : 1; // (a first frame, or a viewer who has just joined: no ease)
      let dirty = false;
      for (let i = 0; i < cubes.length; i++) {
        const c = cubes[i], d = defs[c.j];
        let want = 0;
        if (on) {
          let cx, cy, cz, hx, hy, hz;
          if (c.dynamic) { cx = view.obsPos[c.j * 3]; cy = view.obsPos[c.j * 3 + 1]; cz = view.obsPos[c.j * 3 + 2]; hx = hy = hz = d.size.x / 2 * 1.15; }
          else { cx = d.pos?.x ?? d.x; cy = (d.pos?.y ?? (d.y + (d.size?.y ?? 2) / 2)) + c.dy; cz = d.pos?.z ?? d.z; hx = hy = hz = 1; }
          const grow = 0.45;
          for (let b = 0; b < view.botHidden.length && !want; b++) {
            if (view.botHidden[b]) continue;
            const bx = view.botPos[b * 3], by = view.botPos[b * 3 + 1] + 0.55, bz = view.botPos[b * 3 + 2];
            if (Math.abs(bz - cz) > 14 && Math.abs(cam.z - cz) > 14) continue;
            if (hitBox(cam.x, cam.y, cam.z, bx, by, bz, cx, cy, cz, hx + grow, hy + grow, hz + grow)) want = 1;
          }
        }
        const v = cutA[i] + (want - cutA[i]) * k;
        if (Math.abs(v - cutA[i]) > 1e-4) { cutA[i] = v < 0.003 ? 0 : v; dirty = true; }
      }
      if (dirty) cutAttr.needsUpdate = true;
    });

    // Landing slams: every time a giant tumble block falls flat onto its next face it hits the
    // foam hard: a white shock ring races out from under it and a skirt of dust puffs bursts from
    // its foot, so the cartwheel reads as heavy, step by step, even in a still.
    const tumblers = kinds.cube.filter((j) => defs[j].type === 'slider' && defs[j].mode === 'tumble');
    if (tumblers.length) {
      const NT = tumblers.length, NP = 8;
      const fxMat = new THREE.ShaderMaterial({
        transparent: true, depthWrite: false,
        vertexShader: `attribute float aA; varying float vA; varying float vR; varying float vN;
          void main() { vA = aA; vR = length(position.xz); vN = normal.y;
            gl_Position = projectionMatrix * modelViewMatrix * instanceMatrix * vec4(position, 1.0); }`,
        fragmentShader: `uniform float uRing; varying float vA; varying float vR; varying float vN;
          void main() {
            float a = vA;
            if (uRing > 0.5) a *= smoothstep(0.62, 0.8, vR) * (1.0 - smoothstep(0.86, 1.0, vR));
            vec3 c = mix(vec3(0.86, 0.84, 0.95), vec3(1.0), uRing > 0.5 ? 1.0 : clamp(vN * 0.5 + 0.6, 0.0, 1.0));
            if (a < 0.01) discard;
            gl_FragColor = vec4(c, a);
          }`,
        uniforms: { uRing: { value: 1 } },
      });
      const ringG = new THREE.CircleGeometry(1, 40); ringG.rotateX(-Math.PI / 2);
      const ringA = new THREE.InstancedBufferAttribute(new Float32Array(NT), 1); ringA.setUsage(THREE.DynamicDrawUsage);
      ringG.setAttribute('aA', ringA);
      const rings = new THREE.InstancedMesh(ringG, fxMat, NT);
      rings.frustumCulled = false; rings.renderOrder = 2; rings.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(rings);
      const puffMat = fxMat.clone(); puffMat.uniforms = { uRing: { value: 0 } };
      const puffG = new THREE.IcosahedronGeometry(1, 2);
      const puffA = new THREE.InstancedBufferAttribute(new Float32Array(NT * NP), 1); puffA.setUsage(THREE.DynamicDrawUsage);
      puffG.setAttribute('aA', puffA);
      const puffs = new THREE.InstancedMesh(puffG, puffMat, NT * NP);
      puffs.frustumCulled = false; puffs.renderOrder = 2; puffs.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      group.add(puffs);
      const LIFE = 0.5;
      updaters.push((view) => {
        const t = view.tick * SIM_DT;
        for (let k = 0; k < NT; k++) {
          const d = defs[tumblers[k]], a = d.size.x / 2;
          const n = Math.max(1, Math.round((2 * d.travel) / d.size.x)), stp = d.flip + d.pause;
          const half = d.rest + n * stp, per = 2 * half;
          let tau = (t + d.phase) % per; if (tau < 0) tau += per;
          let best = 1e9, bx = d.x, bdir = 1;
          for (let L = 0; L < 2; L++) {
            const dir = L === 0 ? 1 : -1, start = d.x - dir * d.travel;
            for (let s = 0; s < n; s++) {
              let dt = tau - (L * half + d.rest + s * stp + d.flip);
              if (dt < 0) dt += per;
              if (dt < best) { best = dt; bx = start + dir * 2 * a * (s + 1); bdir = dir; }
            }
          }
          const live = best < LIFE;
          const u = live ? best / LIFE : 1;
          const e = 1 - (1 - u) * (1 - u);
          ringA.array[k] = live ? 0.85 * (1 - u) : 0;
          mA.compose(vA.set(bx, d.y + 0.05, d.z), qA.identity(), live ? sA.set(a * (1.15 + 1.1 * e), 1, a * (1.15 + 1.1 * e)) : sA.set(0, 0, 0));
          rings.setMatrixAt(k, mA);
          for (let p = 0; p < NP; p++) {
            const i = k * NP + p;
            if (!live) { puffA.array[i] = 0; puffs.setMatrixAt(i, zero); continue; }
            // puffs burst from the two long feet of the block (front/back in z) and the leading
            // edge, drifting outward and up
            const side = p < 3 ? -1 : p < 6 ? 1 : 0;
            const f = p < 6 ? ((p % 3) - 1) * 0.75 : (p === 6 ? -0.5 : 0.5);
            const ox = side ? f * a : bdir * (a + 0.2 + e * 0.9);
            const oz = side ? side * (a + 0.15 + e * 1.0) : f * a;
            const sc = (0.35 + 0.55 * Math.sqrt(u)) * (1 - 0.35 * u) * (0.8 + 0.2 * ((p * 7) % 3));
            puffA.array[i] = 0.9 * (1 - u * u);
            mA.compose(vA.set(bx + ox, d.y + 0.2 + e * 0.55, d.z + oz), qA.identity(), sA.set(sc * 1.2, sc * 0.8, sc * 1.2));
            puffs.setMatrixAt(i, mA);
          }
        }
        ringA.needsUpdate = true; puffA.needsUpdate = true;
        rings.instanceMatrix.needsUpdate = true; puffs.instanceMatrix.needsUpdate = true;
      });
    }
  }

  // Alphabet maze: painted route chevrons on the boards in front of every open gap.
  for (const sec of course.sections || []) {
    if (!sec.rows || !sec.rows[0]?.gaps) continue;
    for (const row of sec.rows) {
      for (const gp of row.gaps) {
        if (gp.slider) continue;
        let y = -1e9;
        for (const sf of course.surfaces) if (row.z0 - 2 >= sf.z0 && row.z0 - 2 <= sf.z1 && sf.y0 === (sf.y1 ?? sf.y0)) y = Math.max(y, sf.y0);
        if (y < -1e8) continue;
        const n = Math.max(1, Math.min(3, Math.floor(gp.halfWidth)));
        for (let k = 0; k < n; k++) {
          const x = gp.x + (k - (n - 1) / 2) * 1.6;
          for (let r = 0; r < 2; r++) decals.push(flatChevron(x, y + 0.03, row.z0 - 1.4 - r * 0.9, 0, 1, 1.4, 0.7, 0.3, '#19c3b1'));
        }
      }
    }
  }
  // Seesaw rows: chevrons on the landing in front of every ruler point the way on.
  for (const sec of course.sections || []) {
    if (!sec.rows || !sec.rows[0]?.xs) continue;
    for (const row of sec.rows) {
      for (const x of row.xs) {
        for (let r = 0; r < 3; r++) {
          const z = row.z0 - 1.2 - r * 1.0;
          let top = null;
          for (const sf of course.surfaces) if (z >= sf.z0 && z <= sf.z1 && sf.y0 === (sf.y1 ?? sf.y0) && (!top || sf.y0 > top.y0)) top = sf;
          if (!top) continue;
          decals.push(flatChevron(x, top.y0 + 0.03, z, 0, 1, Math.min(2.2, row.width * 0.75), 0.9, 0.36, top.material === 'eraser' ? '#ffffff' : '#ff2f7a'));
        }
      }
    }
  }
  // Eraser islands: a printed card sleeve around one end so the slab reads as a giant eraser.
  for (const sf of course.surfaces) {
    if (sf.material !== 'eraser') continue;
    const x0 = sf.x - sf.width / 2, x1 = sf.x + sf.width / 2, th = sf.thickness ?? 1, e = 0.035;
    const sx0 = x0 + sf.width * 0.32;
    const sleeve = new RoundedBoxGeometry(x1 + e - sx0, th + 2 * e, sf.z1 - sf.z0 + 2 * e, 2, (MAT_DEF.eraser.bevel ?? 0.2) + e);
    sleeve.translate((sx0 + x1 + e) / 2, sf.y0 - th / 2, (sf.z0 + sf.z1) / 2);
    props.push(clean(paint(sleeve, '#2f6bff')));
    for (const fx of [0.08, 0.13, 0.9]) {
      const band = new RoundedBoxGeometry(fx > 0.5 ? 0.6 : 0.22, th + 2 * e + 0.01, sf.z1 - sf.z0 + 2 * e + 0.01, 2, Math.min(0.1, (MAT_DEF.eraser.bevel ?? 0.2) + e));
      band.translate(sx0 + (x1 - sx0) * fx, sf.y0 - th / 2, (sf.z0 + sf.z1) / 2);
      props.push(clean(paint(band, fx > 0.5 ? '#ffc21a' : '#fff3e2')));
    }
  }

  // merged static furniture + floor telegraphs
  if (props.length) {
    const pm = new THREE.Mesh(mergeGeometries(props, false), new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.5 }));
    pm.castShadow = true; pm.receiveShadow = true; pm.name = 'obstacleProps';
    group.add(pm);
  }
  if (decals.length) {
    const dm = new THREE.Mesh(mergeGeometries(decals, false), new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.55, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    }));
    dm.receiveShadow = true; dm.name = 'hazardDecals';
    group.add(dm);
  }

  const uPulse = { value: 0 };
  if (pulse.length) {
    const pmat = new THREE.MeshStandardMaterial({
      vertexColors: true, roughness: 0.5, polygonOffset: true, polygonOffsetFactor: -2, polygonOffsetUnits: -2,
    });
    pmat.onBeforeCompile = (sh) => {
      sh.uniforms.uPulse = uPulse;
      sh.fragmentShader = sh.fragmentShader
        .replace('#include <common>', '#include <common>\nuniform float uPulse;')
        .replace('#include <emissivemap_fragment>', '#include <emissivemap_fragment>\ntotalEmissiveRadiance += diffuseColor.rgb * uPulse;');
    };
    pmat.customProgramCacheKey = () => 'tt-pulse-v1';
    const pm = new THREE.Mesh(mergeGeometries(pulse, false), pmat);
    pm.receiveShadow = true; pm.name = 'hazardPulse';
    group.add(pm);
    updaters.push((view) => {
      const ph = 0.5 + 0.5 * Math.sin(view.tick * SIM_DT * Math.PI * 2 * 1.1);
      uPulse.value = 0.1 + 0.42 * ph * ph;
    });
  }

  // ------------------------------------------------------------ course info for cameras / HUD
  const STEP = 0.5;
  const zMin = (course.bounds?.minZ ?? startZ - 5) - 10, zMax = (course.bounds?.maxZ ?? finishZ + 10) + 10;
  const nS = Math.ceil((zMax - zMin) / STEP) + 1;
  const topY = new Float32Array(nS).fill(-1e9), halfW = new Float32Array(nS).fill(0);
  for (let i = 0; i < nS; i++) {
    const z = zMin + i * STEP;
    for (const s of course.surfaces) {
      if (z < s.z0 || z > s.z1) continue;
      const y = s.y0 + (((s.y1 ?? s.y0) - s.y0) * (z - s.z0)) / Math.max(1e-6, s.z1 - s.z0);
      if (y > topY[i]) topY[i] = y;
      const hw = Math.abs(s.x ?? 0) + s.width / 2;
      if (hw > halfW[i]) halfW[i] = hw;
    }
  }
  // fill gaps (between surfaces) from neighbours
  let last = 0;
  for (let i = 0; i < nS; i++) { if (topY[i] > -1e8) last = topY[i]; else topY[i] = last; if (!halfW[i]) halfW[i] = 10; }
  const idx = (z) => Math.max(0, Math.min(nS - 1, Math.round((z - zMin) / STEP)));
  const info = {
    startZ, finishZ, length: course.length ?? finishZ - startZ,
    surfaceY: (z) => topY[idx(z)],
    halfWidth: (z) => halfW[idx(z)],
    centerX: () => 0,
    trackPoints: [],
    gridCenter: (() => {
      const sp = course.checkpoints?.[0]?.spawn;
      return sp ? { x: (sp.x0 + sp.x1) / 2, y: course.checkpoints[0].y ?? 0, z: (sp.z0 + sp.z1) / 2 } : { x: 0, y: 0, z: startZ + 4 };
    })(),
    finishPos: { x: course.finish?.x ?? 0, y: course.finish?.y ?? 0, z: finishZ },
  };
  // the start grid's extent across the course (setRound fills it from the sim's start positions)
  info.grid = { minX: -10.5, maxX: 10.5, frontZ: info.gridCenter.z, backZ: info.gridCenter.z, y: info.gridCenter.y, rows: 1 };
  function placeTrackPoints() {
    info.trackPoints.length = 0;
    let side = 1;
    for (let z = info.startZ + 16; z < info.finishZ + 12; z += 21) {
      info.trackPoints.push({ x: side * Math.min(info.halfWidth(z) + 3.5, 12.5), y: info.surfaceY(z) + 6, z, lookX: 0 });
      side = -side;
    }
    if (!info.trackPoints.length) info.trackPoints.push({ x: 12, y: info.surfaceY(info.startZ) + 6, z: info.startZ + 8, lookX: 0 });
  }
  placeTrackPoints();

  /**
   * Move the start line and the finish arch to one round's stretch and re-point the camera info
   * (startZ, finishZ, length, gridCenter, finishPos, trackPoints) at it, so the intro, start and
   * finish shots frame the current round.
   *   roundCourse  sim.course of the round: { startZ, finish: { z, y, x, width, archHeight } }
   *   starts       the field's start positions [{ x, y, z }] (the sim's bots at tick 0)
   */
  /** The finish-line camera looks through where the banner hangs: it is lifted out for those shots. */
  function setBannerVisible(on) {
    const b = dressing && dressing.getObjectByName('finishBanner');
    if (b && b.visible !== on) b.visible = on;
    const p = dressing && dressing.getObjectByName('finishPosts');
    if (p) p.visible = on || !postsHide;
  }
  let postsHide = false;
  /** The line camera stands between the arch's posts: they go with the banner while it is on. */
  function setPostsHide(on) {
    postsHide = on;
  }

  function setRound(roundCourse, starts = []) {
    const sZ = roundCourse.startZ, f = roundCourse.finish;
    const sy = info.surfaceY(sZ);
    placeDressing({ z: sZ, y: sy, x: 0, width: Math.max(6, info.halfWidth(sZ) * 2 - 0.6) }, f);
    info.startZ = sZ; info.finishZ = f.z; info.length = f.z - sZ;
    info.finishPos = { x: f.x ?? 0, y: f.y ?? 0, z: f.z };
    if (starts.length) {
      let x0 = Infinity, x1 = -Infinity, z0 = Infinity, z1 = -Infinity, sx = 0, sy2 = 0, szz = 0;
      for (const p of starts) {
        x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); z0 = Math.min(z0, p.z); z1 = Math.max(z1, p.z);
        sx += p.x; sy2 += p.y; szz += p.z;
      }
      const n = starts.length;
      info.gridCenter = { x: sx / n, y: sy2 / n, z: szz / n };
      const rows = new Set(starts.map((p) => Math.round(p.z * 2))).size;
      info.grid = { minX: x0, maxX: x1, frontZ: z1, backZ: z0, y: sy2 / n, rows };
    } else {
      info.gridCenter = { x: 0, y: sy, z: sZ - 2 };
      info.grid = { minX: -8, maxX: 8, frontZ: sZ - 1.5, backZ: sZ - 1.5, y: sy, rows: 1 };
    }
    placeTrackPoints();
  }

  function update(view) {
    for (let k = 0; k < updaters.length; k++) updaters[k](view);
  }
  /** Scenery that would hide a racer from this lens goes see-through (the maze's blocks). */
  function cutaway(cameraPosition, view, dt, on = true) {
    for (let k = 0; k < cutters.length; k++) cutters[k](cameraPosition, view, dt, on);
  }

  /** Remove the course from the scene and free its geometry, materials and its own textures. */
  function dispose() {
    group.parent?.remove(group);
    disposeTree(group);
    for (const t of sharedTex) t.dispose();
  }

  return { group, update, cutaway, setRound, setBannerVisible, setPostsHide, dispose, info };
}

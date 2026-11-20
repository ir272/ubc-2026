// The roster shelf: after each round the show cuts to a toy shelf hung in the attic with one cubby
// per starter. Everyone who is still in stands in their cubby; a slatted shutter drops over each
// Gumble knocked out this round, one by one, and the shutters of earlier rounds are already down.
// The stage owns the timing and puts the Gumbles in (slotFeet gives each cubby's floor); this
// module only builds the shelf and moves the shutters.
import * as THREE from 'three';
import { disposeTree } from './dispose.js';

const COLS = 8, ROWS = 2;
const CW = 1.8, CH = 1.95;          // one cubby, metres
const LIP = 0.42;                   // the shelf edge under a row, where the name plate sits
const DEPTH = 1.5;
export const BOARD_AT = { x: 0, y: 34, z: -50 };    // above and behind the start, in front of the gable window
const WOOD = '#f2d3a2', WOOD_DARK = '#d9a96a', INK = '#141318', PAPER = '#e6e4de';
const BACKS = ['#7fd6e8', '#ffd166', '#ff9fb2', '#9be7a8', '#c3a6ff', '#ffb37a'];

const rowY = (r) => BOARD_AT.y + (ROWS - 1 - r) * (CH + LIP);
const colX = (c) => BOARD_AT.x + (c - (COLS - 1) / 2) * CW;

/** Where Gumble `i` (0..15, in the show's entrant order) stands: the floor of its cubby. */
export function slotFeet(i) {
  const r = Math.floor(i / COLS), c = i % COLS;
  return { x: colX(c), y: rowY(r) + 0.06, z: BOARD_AT.z + 0.15 };
}
/** The shelf's centre and size, for framing it. */
export const BOARD_FRAME = {
  cx: BOARD_AT.x, cy: BOARD_AT.y + (ROWS * (CH + LIP)) / 2 - LIP / 2, z: BOARD_AT.z,
  width: COLS * CW + 0.5, height: ROWS * (CH + LIP) + 0.3,
};

function slatTexture() {
  const c = document.createElement('canvas'); c.width = 128; c.height = 128;
  const g = c.getContext('2d');
  // pale wooden slats, like a toy shop's roller shutter
  g.fillStyle = '#c9a06a'; g.fillRect(0, 0, 128, 128);
  for (let y = 0; y < 128; y += 16) { g.fillStyle = '#e2bd88'; g.fillRect(0, y, 128, 11); g.fillStyle = '#9c7646'; g.fillRect(0, y + 12, 128, 2); }
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(1, 1.5);
  return t;
}

function plateTexture(name) {
  const c = document.createElement('canvas'); c.width = 384; c.height = 80;
  const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 4;
  const draw = () => {
    const g = c.getContext('2d');
    g.fillStyle = INK; g.fillRect(0, 0, c.width, c.height);
    g.fillStyle = PAPER; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = '600 46px "TT Shantell", "Shantell Sans Variable", "Avenir Next", sans-serif';
    g.fillText(name, c.width / 2, c.height / 2 + 3, c.width - 24);
    t.needsUpdate = true;
  };
  draw();
  // the web font may arrive after the first build: draw again when it has
  if (typeof document !== 'undefined' && document.fonts?.load) document.fonts.load('600 46px "TT Shantell"').then(draw).catch(() => {});
  return t;
}

export function createRosterBoard(scene) {
  const group = new THREE.Group();
  group.name = 'rosterBoard';
  const wood = new THREE.MeshStandardMaterial({ color: WOOD, roughness: 0.7 });
  const woodDark = new THREE.MeshStandardMaterial({ color: WOOD_DARK, roughness: 0.75 });
  const box = (w, h, d, mat, x, y, z) => { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat); m.position.set(x, y, z); group.add(m); return m; };

  const W = COLS * CW, top = rowY(0) + CH, bottom = rowY(ROWS - 1) - LIP;
  const zBack = BOARD_AT.z - DEPTH / 2;
  // the case: back, sides, top, and a shelf under each row
  box(W + 0.5, top - bottom + 0.3, 0.2, woodDark, BOARD_AT.x, (top + bottom) / 2, zBack - 0.6);
  for (const sx of [-1, 1]) box(0.25, top - bottom + 0.3, DEPTH + 0.5, wood, BOARD_AT.x + sx * (W / 2 + 0.125), (top + bottom) / 2, zBack + 0.15);
  box(W + 0.5, 0.3, DEPTH + 0.5, wood, BOARD_AT.x, top + 0.15, zBack + 0.15);
  for (let r = 0; r < ROWS; r++) box(W + 0.5, LIP, DEPTH + 0.5, wood, BOARD_AT.x, rowY(r) - LIP / 2, zBack + 0.15);
  for (let r = 0; r < ROWS; r++) for (let c = 1; c < COLS; c++) box(0.1, CH, DEPTH, wood, colX(c) - CW / 2, rowY(r) + CH / 2, zBack + 0.1);
  // two ropes up into the rafters
  for (const sx of [-1, 1]) { const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 40, 8), new THREE.MeshStandardMaterial({ color: '#b98b5a', roughness: 1 })); rope.position.set(BOARD_AT.x + sx * (W / 2 - 0.6), top + 20, zBack + 0.1); group.add(rope); }

  // per cubby: a bright back (unlit, so the Gumble always reads against it), a shutter, a name plate
  const slat = slatTexture();
  const shutMat = new THREE.MeshStandardMaterial({ map: slat, roughness: 0.8 });
  const shutOld = new THREE.MeshStandardMaterial({ map: slat, roughness: 0.9, color: '#b9b2a8' });
  const shutGeo = new THREE.BoxGeometry(CW - 0.01, CH - 0.02, 0.08); shutGeo.translate(0, -(CH - 0.04) / 2, 0); // hangs from its top edge
  const plateGeo = new THREE.PlaneGeometry(CW - 0.3, LIP - 0.12);
  const cells = [];
  for (let i = 0; i < COLS * ROWS; i++) {
    const r = Math.floor(i / COLS), c = i % COLS, x = colX(c), y = rowY(r);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(CW - 0.1, CH), new THREE.MeshBasicMaterial({ color: BACKS[(c + r * 3) % BACKS.length] }));
    back.position.set(x, y + CH / 2, zBack - 0.45); group.add(back);
    const shut = new THREE.Mesh(shutGeo, shutMat);
    shut.position.set(x, y + CH, zBack + DEPTH + 0.05); shut.scale.y = 0.001; shut.visible = false; group.add(shut);
    const plateMat = new THREE.MeshBasicMaterial({ color: '#ffffff' });
    const plate = new THREE.Mesh(plateGeo, plateMat);
    plate.position.set(x, y - LIP / 2, zBack + DEPTH + 0.41); group.add(plate);
    cells.push({ back, shut, plate, plateMat, tex: null, amt: 0, old: false });
  }
  // the viewer's pick: a gold frame round its cubby (it stays when the shutter is down)
  const pickFrame = new THREE.Group();
  const pm = new THREE.MeshBasicMaterial({ color: '#c5a559' }); // gold, as the pick is everywhere else
  for (const [w, h, x, y] of [[CW, 0.09, 0, CH / 2], [CW, 0.09, 0, -CH / 2], [0.09, CH, -CW / 2, 0], [0.09, CH, CW / 2, 0]]) { const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, 0.06), pm); m.position.set(x, y, 0); pickFrame.add(m); }
  pickFrame.visible = false; group.add(pickFrame);

  for (const m of group.children) if (m.isMesh) { m.castShadow = false; m.receiveShadow = false; }
  group.visible = false;
  scene.add(group);

  return {
    group,
    /** The names under the cubbies, in the show's entrant order. */
    setNames(names) {
      cells.forEach((cell, i) => {
        if (cell.tex) cell.tex.dispose();
        cell.tex = names[i] ? plateTexture(names[i]) : null;
        cell.plateMat.map = cell.tex; cell.plateMat.needsUpdate = true;
        cell.plate.visible = !!names[i]; cell.back.visible = !!names[i];
      });
    },
    /** Shutter `i`: `amt` 0 (open) to 1 (down); `old` = it came down in an earlier round. */
    setShutter(i, amt, old = false) {
      const cell = cells[i];
      if (!cell) return;
      cell.shut.visible = amt > 0.002;
      cell.shut.scale.y = Math.max(0.001, amt);
      cell.shut.material = old ? shutOld : shutMat;
      const dim = old ? 0.45 : 1 - 0.5 * amt;
      cell.plateMat.color.setScalar(dim);
    },
    setPick(i) {
      if (i == null || i < 0 || !cells[i]) { pickFrame.visible = false; return; }
      const r = Math.floor(i / COLS), c = i % COLS;
      pickFrame.position.set(colX(c), rowY(r) + CH / 2, zBack + DEPTH + 0.12);
      pickFrame.visible = true;
    },
    setVisible(on) { group.visible = !!on; },
    dispose() {
      for (const cell of cells) cell.tex?.dispose();
      slat.dispose();
      group.parent?.remove(group);
      disposeTree(group);
    },
  };
}

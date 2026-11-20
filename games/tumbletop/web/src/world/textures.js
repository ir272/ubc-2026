// Procedural canvas textures for the toy-attic materials. Generated once at load.
import * as THREE from 'three';

function canvasTex(w, h, draw, { repeat = true, srgb = true, aniso = 8 } = {}) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  const g = c.getContext('2d');
  draw(g, w, h);
  const t = new THREE.CanvasTexture(c);
  if (repeat) t.wrapS = t.wrapT = THREE.RepeatWrapping;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = aniso;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  return t;
}

// Deterministic tiny PRNG for texture noise (visual only).
function prng(seed) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}

function speckle(g, w, h, n, alpha, seed, light = true) {
  const r = prng(seed);
  for (let i = 0; i < n; i++) {
    g.fillStyle = light ? `rgba(255,255,255,${alpha * r()})` : `rgba(0,0,0,${alpha * r()})`;
    g.fillRect(r() * w, r() * h, 1 + r() * 2, 1 + r() * 2);
  }
}

export function makeTextures() {
  const T = {};
  // Board-game start: big two-tone squares (1 tile = 3 m when repeat set per metre/3)
  T.boardTile = canvasTex(256, 256, (g, w, h) => {
    const cols = ['#ffcf4a', '#ff8a5c'];
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = cols[(x + y) % 2]; g.fillRect(x * 128, y * 128, 128, 128); }
    g.strokeStyle = 'rgba(120,50,20,0.35)'; g.lineWidth = 4;
    for (let i = 0; i <= 2; i++) { g.beginPath(); g.moveTo(i * 128, 0); g.lineTo(i * 128, h); g.stroke(); g.beginPath(); g.moveTo(0, i * 128); g.lineTo(w, i * 128); g.stroke(); }
    g.fillStyle = 'rgba(255,255,255,0.35)';
    for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.beginPath(); g.arc(x * 128 + 64, y * 128 + 64, 14, 0, Math.PI * 2); g.fill(); }
    speckle(g, w, h, 900, 0.12, 1);
  });
  // Green felt play mat
  T.feltMat = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#4cc27a'; g.fillRect(0, 0, w, h);
    speckle(g, w, h, 5000, 0.12, 2); speckle(g, w, h, 4000, 0.1, 3, false);
    g.strokeStyle = 'rgba(255,255,255,0.18)'; g.setLineDash([10, 8]); g.lineWidth = 3; g.strokeRect(6, 6, w - 12, h - 12);
  });
  // Book spines laid as a ramp (stripes across z)
  T.bookSpines = canvasTex(256, 256, (g, w, h) => {
    const cols = ['#e2456f', '#3d8bfd', '#ffb340', '#6c5ce7', '#2ec4b6', '#ff7f50', '#f15bb5', '#8ac926'];
    const r = prng(4);
    let y = 0;
    while (y < h) {
      const bh = 22 + Math.floor(r() * 26);
      g.fillStyle = cols[Math.floor(r() * cols.length)];
      g.fillRect(0, y, w, bh);
      g.fillStyle = 'rgba(255,255,255,0.35)'; g.fillRect(0, y + 5, w, 3); g.fillRect(0, y + bh - 8, w, 3);
      g.fillStyle = 'rgba(0,0,0,0.18)'; g.fillRect(0, y + bh - 2, w, 2);
      y += bh;
    }
    speckle(g, w, h, 1500, 0.1, 5);
  });
  T.bookTop = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#f4ead2'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(160,130,90,0.25)'; g.lineWidth = 1;
    for (let y = 4; y < h; y += 5) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.fillStyle = '#c73a5a'; g.fillRect(0, 0, w, 14); g.fillRect(0, h - 14, w, 14);
  });
  T.ruler = canvasTex(64, 512, (g, w, h) => {
    g.fillStyle = '#ffd84a'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#4a3410';
    for (let i = 0; i < 64; i++) { const len = i % 8 === 0 ? 26 : i % 4 === 0 ? 18 : 10; g.fillRect(0, i * 8, len, 2); g.fillRect(w - len, i * 8, len, 2); }
    speckle(g, w, h, 400, 0.12, 6);
  });
  T.eraser = canvasTex(128, 128, (g, w, h) => { g.fillStyle = '#ff9fb6'; g.fillRect(0, 0, w, h); speckle(g, w, h, 1200, 0.15, 7); speckle(g, w, h, 800, 0.08, 8, false); });
  T.crayon = canvasTex(256, 64, (g, w, h) => {
    g.fillStyle = '#ffffff'; g.fillRect(0, 0, w, h);
    g.fillStyle = 'rgba(0,0,0,0.25)'; for (let x = 0; x < w; x += 32) { g.fillRect(x, 0, 3, h); }
    g.strokeStyle = 'rgba(0,0,0,0.25)'; g.lineWidth = 3;
    for (let x = 0; x < w; x += 64) { g.beginPath(); for (let y = 0; y <= h; y += 4) g.lineTo(x + 16 + Math.sin(y * 0.3) * 6, y); g.stroke(); }
  });
  T.woodBoard = canvasTex(512, 512, (g, w, h) => {
    g.fillStyle = '#d9a066'; g.fillRect(0, 0, w, h);
    const r = prng(9);
    for (let p = 0; p < 4; p++) {
      g.fillStyle = `rgba(${150 + r() * 40},${90 + r() * 30},${40 + r() * 20},0.25)`; g.fillRect(p * 128, 0, 128, h);
      g.fillStyle = 'rgba(80,40,10,0.35)'; g.fillRect(p * 128, 0, 3, h);
    }
    g.strokeStyle = 'rgba(110,60,20,0.2)'; g.lineWidth = 2;
    for (let i = 0; i < 60; i++) { const x = r() * w; g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 10, h * 0.3, x - 10, h * 0.6, x + 4, h); g.stroke(); }
  });
  T.paperRunway = canvasTex(256, 256, (g, w, h) => {
    g.fillStyle = '#fbf7ec'; g.fillRect(0, 0, w, h);
    g.strokeStyle = 'rgba(80,140,230,0.45)'; g.lineWidth = 2;
    for (let y = 16; y < h; y += 32) { g.beginPath(); g.moveTo(0, y); g.lineTo(w, y); g.stroke(); }
    g.strokeStyle = 'rgba(230,80,100,0.5)'; g.beginPath(); g.moveTo(40, 0); g.lineTo(40, h); g.stroke();
    speckle(g, w, h, 600, 0.08, 10, false);
  });
  T.boardEdge = canvasTex(64, 64, (g, w, h) => { g.fillStyle = '#7a3fbf'; g.fillRect(0, 0, w, h); g.fillStyle = '#9c63e0'; g.fillRect(0, 0, w, 10); });
  T.woodRail = canvasTex(128, 32, (g, w, h) => { g.fillStyle = '#c27a3e'; g.fillRect(0, 0, w, h); g.fillStyle = 'rgba(255,255,255,0.2)'; g.fillRect(0, 2, w, 4); speckle(g, w, h, 300, 0.12, 11, false); });
  T.floorboards = canvasTex(512, 512, (g, w, h) => {
    const r = prng(12);
    for (let p = 0; p < 8; p++) {
      const l = 150 + r() * 30;
      g.fillStyle = `rgb(${l},${l * 0.68},${l * 0.42})`; g.fillRect(p * 64, 0, 64, h);
      g.fillStyle = 'rgba(60,30,10,0.45)'; g.fillRect(p * 64, 0, 2, h);
      const cut = r() * h; g.fillRect(p * 64, cut, 64, 2);
    }
    speckle(g, w, h, 3000, 0.08, 13, false);
  });
  // Alphabet-block letter atlas: 8x4 cells, letters A-Z (+ blanks)
  T.letters = canvasTex(1024, 512, (g, w, h) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = '#fff'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.font = 'bold 96px "Arial Rounded MT Bold", "Arial Black", sans-serif';
    for (let i = 0; i < 26; i++) {
      const cx = (i % 8) * 128 + 64, cy = Math.floor(i / 8) * 128 + 68;
      g.fillText(String.fromCharCode(65 + i), cx, cy);
    }
  }, { repeat: false, srgb: false });
  // Finish banner
  T.finishBanner = canvasTex(1024, 128, (g, w, h) => {
    for (let y = 0; y < 2; y++) for (let x = 0; x < 32; x++) { g.fillStyle = (x + y) % 2 ? '#1d1428' : '#ffffff'; g.fillRect(x * 32, y * 32, 32, 32); }
    g.fillStyle = '#ffd23f'; g.fillRect(0, 64, w, 64);
    g.fillStyle = '#2a1838'; g.font = 'bold 54px "Arial Rounded MT Bold", sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText('FINISH  ★  FINISH  ★  FINISH', w / 2, 98);
  }, { repeat: false });
  T.checker = canvasTex(64, 64, (g) => { for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) { g.fillStyle = (x + y) % 2 ? '#1d1428' : '#fff'; g.fillRect(x * 32, y * 32, 32, 32); } });
  return T;
}

// Small image toolkit with no npm dependencies.
// ffmpeg decodes and scales any image or video frame to raw RGB; layout and text
// happen here on plain RGB buffers; PNG encoding is done in node (zlib).
// This ffmpeg build has no drawtext, so labels use the 5x7 bitmap font below.
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import { spawnSync, spawn } from 'node:child_process';

export const FFMPEG = fs.existsSync('/opt/homebrew/bin/ffmpeg') ? '/opt/homebrew/bin/ffmpeg' : 'ffmpeg';
export const FFPROBE = fs.existsSync('/opt/homebrew/bin/ffprobe') ? '/opt/homebrew/bin/ffprobe' : 'ffprobe';

// ---------- canvas ----------
export function canvas(w, h, rgb = [0, 0, 0]) {
  const data = Buffer.alloc(w * h * 3);
  for (let i = 0; i < w * h; i++) { data[i * 3] = rgb[0]; data[i * 3 + 1] = rgb[1]; data[i * 3 + 2] = rgb[2]; }
  return { w, h, data };
}

export function fillRect(c, x, y, w, h, rgb) {
  const x0 = Math.max(0, x | 0), y0 = Math.max(0, y | 0);
  const x1 = Math.min(c.w, (x + w) | 0), y1 = Math.min(c.h, (y + h) | 0);
  for (let yy = y0; yy < y1; yy++) {
    let o = (yy * c.w + x0) * 3;
    for (let xx = x0; xx < x1; xx++, o += 3) { c.data[o] = rgb[0]; c.data[o + 1] = rgb[1]; c.data[o + 2] = rgb[2]; }
  }
}

export function blit(dst, src, dx, dy) {
  for (let y = 0; y < src.h; y++) {
    const ty = dy + y;
    if (ty < 0 || ty >= dst.h) continue;
    const sx0 = Math.max(0, -dx), sx1 = Math.min(src.w, dst.w - dx);
    if (sx1 <= sx0) continue;
    src.data.copy(dst.data, (ty * dst.w + dx + sx0) * 3, (y * src.w + sx0) * 3, (y * src.w + sx1) * 3);
  }
}

// ---------- 5x7 bitmap font (rows top to bottom, 5 bits each, MSB left) ----------
const G = {
  '0': [14, 17, 19, 21, 25, 17, 14], '1': [4, 12, 4, 4, 4, 4, 14], '2': [14, 17, 1, 2, 4, 8, 31],
  '3': [31, 2, 4, 2, 1, 17, 14], '4': [2, 6, 10, 18, 31, 2, 2], '5': [31, 16, 30, 1, 1, 17, 14],
  '6': [6, 8, 16, 30, 17, 17, 14], '7': [31, 1, 2, 4, 8, 8, 8], '8': [14, 17, 17, 14, 17, 17, 14],
  '9': [14, 17, 17, 15, 1, 2, 12],
  A: [14, 17, 17, 31, 17, 17, 17], B: [30, 17, 17, 30, 17, 17, 30], C: [14, 17, 16, 16, 16, 17, 14],
  D: [28, 18, 17, 17, 17, 18, 28], E: [31, 16, 16, 30, 16, 16, 31], F: [31, 16, 16, 30, 16, 16, 16],
  G: [14, 17, 16, 23, 17, 17, 15], H: [17, 17, 17, 31, 17, 17, 17], I: [14, 4, 4, 4, 4, 4, 14],
  J: [7, 2, 2, 2, 2, 18, 12], K: [17, 18, 20, 24, 20, 18, 17], L: [16, 16, 16, 16, 16, 16, 31],
  M: [17, 27, 21, 21, 17, 17, 17], N: [17, 17, 25, 21, 19, 17, 17], O: [14, 17, 17, 17, 17, 17, 14],
  P: [30, 17, 17, 30, 16, 16, 16], Q: [14, 17, 17, 17, 21, 18, 13], R: [30, 17, 17, 30, 20, 18, 17],
  S: [15, 16, 16, 14, 1, 1, 30], T: [31, 4, 4, 4, 4, 4, 4], U: [17, 17, 17, 17, 17, 17, 14],
  V: [17, 17, 17, 17, 17, 10, 4], W: [17, 17, 17, 21, 21, 21, 10], X: [17, 17, 10, 4, 10, 17, 17],
  Y: [17, 17, 17, 10, 4, 4, 4], Z: [31, 1, 2, 4, 8, 16, 31],
  ':': [0, 12, 12, 0, 12, 12, 0], '.': [0, 0, 0, 0, 0, 12, 12], '-': [0, 0, 0, 31, 0, 0, 0],
  '_': [0, 0, 0, 0, 0, 0, 31], '/': [1, 1, 2, 4, 8, 16, 16], '+': [0, 4, 4, 31, 4, 4, 0],
  '%': [24, 25, 2, 4, 8, 19, 3], '(': [2, 4, 8, 8, 8, 4, 2], ')': [8, 4, 2, 2, 2, 4, 8],
  '#': [10, 10, 31, 10, 31, 10, 10], ',': [0, 0, 0, 0, 12, 4, 8], ' ': [0, 0, 0, 0, 0, 0, 0],
  '=': [0, 0, 31, 0, 31, 0, 0], 'x': [0, 0, 17, 10, 4, 10, 17],
};

export function textSize(str, scale) {
  return { w: str.length * 6 * scale - scale, h: 7 * scale };
}

/** Draw text with its top-left at (x, y). Lower case letters draw as capitals (except x). */
export function drawText(c, str, x, y, scale = 2, rgb = [255, 255, 255]) {
  let cx = x;
  for (const ch0 of String(str)) {
    const ch = G[ch0] ? ch0 : ch0.toUpperCase();
    const rows = G[ch] || G[' '];
    for (let r = 0; r < 7; r++) {
      for (let b = 0; b < 5; b++) {
        if (rows[r] & (16 >> b)) fillRect(c, cx + b * scale, y + r * scale, scale, scale, rgb);
      }
    }
    cx += 6 * scale;
  }
}

/** Text on a solid plate; corner is 'tl' | 'tr' | 'bl' | 'br' inside the box (bx,by,bw,bh). */
export function labelPlate(c, str, bx, by, bw, bh, { scale = 2, corner = 'tl', fg = [255, 255, 255], bg = [11, 21, 34], pad } = {}) {
  const p = pad ?? scale * 2;
  const { w, h } = textSize(str, scale);
  const pw = w + p * 2, ph = h + p * 2;
  const x = corner.includes('r') ? bx + bw - pw : bx;
  const y = corner.includes('b') ? by + bh - ph : by;
  fillRect(c, x, y, pw, ph, bg);
  drawText(c, str, x + p, y + p, scale, fg);
  return { w: pw, h: ph };
}

// ---------- PNG ----------
export function encodePng(c) {
  const { w, h, data } = c;
  const raw = Buffer.alloc((w * 3 + 1) * h);
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    data.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const chunk = (type, body) => {
    const len = Buffer.alloc(4); len.writeUInt32BE(body.length);
    const tb = Buffer.concat([Buffer.from(type, 'ascii'), body]);
    const crc = Buffer.alloc(4); crc.writeUInt32BE(zlib.crc32(tb) >>> 0);
    return Buffer.concat([len, tb, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2; ihdr[10] = 0; ihdr[11] = 0; ihdr[12] = 0;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 6 })),
    chunk('IEND', Buffer.alloc(0)),
  ]);
}

export function writePng(c, file) {
  fs.mkdirSync(path.dirname(path.resolve(file)), { recursive: true });
  fs.writeFileSync(file, encodePng(c));
  return file;
}

// ---------- decoding ----------
/** Width and height of an image or video file (PNG header fast path, else ffprobe). */
export function imageSize(file) {
  const fd = fs.openSync(file, 'r');
  const head = Buffer.alloc(24);
  fs.readSync(fd, head, 0, 24, 0);
  fs.closeSync(fd);
  if (head.readUInt32BE(0) === 0x89504e47) return { w: head.readUInt32BE(16), h: head.readUInt32BE(20) };
  const r = spawnSync(FFPROBE, ['-v', 'error', '-select_streams', 'v:0', '-show_entries', 'stream=width,height', '-of', 'csv=p=0', file], { encoding: 'utf8' });
  const [w, h] = r.stdout.trim().split(',').map(Number);
  if (!w || !h) throw new Error(`cannot read image size of ${file}: ${r.stderr.trim()}`);
  return { w, h };
}

/** Decode an image to an RGB canvas, scaled to exactly w x h (area filter). */
export function loadImage(file, w, h) {
  if (!w || !h) ({ w, h } = imageSize(file));
  const r = spawnSync(FFMPEG, ['-v', 'error', '-i', file, '-frames:v', '1',
    '-vf', `scale=${w}:${h}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
  { maxBuffer: w * h * 3 + 1024 * 1024 });
  if (r.status !== 0 || r.stdout.length < w * h * 3) {
    throw new Error(`ffmpeg could not decode ${file}: ${String(r.stderr).trim()}`);
  }
  return { w, h, data: r.stdout.subarray(0, w * h * 3) };
}

/** Fit (sw, sh) inside (bw, bh) keeping aspect. */
export function fit(sw, sh, bw, bh) {
  const s = Math.min(bw / sw, bh / sh);
  return { w: Math.max(1, Math.round(sw * s)), h: Math.max(1, Math.round(sh * s)) };
}

/** Decode a stream of equally sized raw frames from an ffmpeg command (for scans). */
export function streamFrames(args, w, h, onFrame) {
  return new Promise((resolve, reject) => {
    const p = spawn(FFMPEG, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const size = w * h * 3;
    let buf = Buffer.alloc(0);
    let n = 0;
    let err = '';
    p.stderr.on('data', (d) => { err += d; if (err.length > 20000) err = err.slice(-10000); });
    p.stdout.on('data', (d) => {
      buf = buf.length ? Buffer.concat([buf, d]) : d;
      while (buf.length >= size) {
        onFrame({ w, h, data: Buffer.from(buf.subarray(0, size)) }, n++);
        buf = buf.subarray(size);
      }
    });
    p.on('close', (code) => (code === 0 ? resolve(n) : reject(new Error(`ffmpeg failed (${code}): ${err.trim().split('\n').slice(-5).join('\n')}`))));
  });
}

// ---------- contact sheets ----------
export const SHEET_BG = [11, 21, 34];

/**
 * Build a contact sheet. items: [{ file } | { canvas }] with optional label.
 * Cells are scaled so the sheet is at most maxWidth wide. Returns the canvas.
 */
export function contactSheet(items, { cols, maxWidth = 2000, gap = 6, labels = true, labelCorner = 'tl', cellW: forceCellW } = {}) {
  if (!items.length) throw new Error('contact sheet: no images');
  const first = items[0].canvas ? { w: items[0].canvas.w, h: items[0].canvas.h } : imageSize(items[0].file);
  const n = items.length;
  cols = cols || (n <= 4 ? n : Math.min(6, Math.ceil(Math.sqrt(n))));
  cols = Math.max(1, Math.min(cols, n));
  const rows = Math.ceil(n / cols);
  let cellW = forceCellW || Math.min(first.w, Math.floor((maxWidth - gap * (cols + 1)) / cols));
  cellW = Math.max(16, cellW);
  const cellH = Math.round(cellW * first.h / first.w);
  const W = cols * cellW + gap * (cols + 1);
  const H = rows * cellH + gap * (rows + 1);
  const sheet = canvas(W, H, SHEET_BG);
  // Label size: about 2.2% of the cell width, at least 2 px per font pixel.
  const scale = Math.max(2, Math.round(cellW / 160));
  items.forEach((it, i) => {
    const col = i % cols, row = Math.floor(i / cols);
    const x = gap + col * (cellW + gap), y = gap + row * (cellH + gap);
    let src;
    if (it.canvas) {
      src = (it.canvas.w === cellW && it.canvas.h === cellH) ? it.canvas : null;
    }
    if (!src) {
      const s = it.canvas ? { w: it.canvas.w, h: it.canvas.h } : imageSize(it.file);
      const f = fit(s.w, s.h, cellW, cellH);
      src = it.canvas ? scaleCanvas(it.canvas, f.w, f.h) : loadImage(it.file, f.w, f.h);
    }
    fillRect(sheet, x, y, cellW, cellH, [0, 0, 0]);
    blit(sheet, src, x + ((cellW - src.w) >> 1), y + ((cellH - src.h) >> 1));
    if (labels) {
      const text = it.label ?? String(i + 1);
      labelPlate(sheet, text, x, y, cellW, cellH, { scale, corner: labelCorner });
    }
  });
  return sheet;
}

/** Scale a canvas through ffmpeg (area filter). */
export function scaleCanvas(c, w, h) {
  if (c.w === w && c.h === h) return c;
  const r = spawnSync(FFMPEG, ['-v', 'error', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-s', `${c.w}x${c.h}`, '-i', '-',
    '-vf', `scale=${w}:${h}:flags=area`, '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-'],
  { input: c.data, maxBuffer: w * h * 3 + 1024 * 1024 });
  if (r.status !== 0) throw new Error('ffmpeg scale failed: ' + String(r.stderr));
  return { w, h, data: r.stdout.subarray(0, w * h * 3) };
}

/** Image files in a directory in name order (f-0001.png ...), skipping sheets and pairs. */
export function framesInDir(dir) {
  const skip = /^(sheet|pair|scan)[-.\d]/i;
  return fs.readdirSync(dir)
    .filter((f) => /\.(png|jpe?g|webp)$/i.test(f) && !skip.test(f))
    .sort((a, b) => a.localeCompare(b, 'en', { numeric: true }))
    .map((f) => path.join(dir, f));
}

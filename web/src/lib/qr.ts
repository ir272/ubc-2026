// A small QR code maker for one job: a wallet address (up to 53 bytes of text). It always makes a version 3 code
// (29 x 29 modules) with error correction level L, which is one Reed-Solomon block, so there is no interleaving.
// Written from the QR standard (ISO/IEC 18004); checked in Chrome by scanning the drawn code back to its text.

const SIZE = 29; // version 3
const DATA_CODEWORDS = 55; // version 3, level L
const EC_CODEWORDS = 15;
const MASK = 0; // (x + y) % 2 === 0

/** Multiplication in GF(2^8) with the QR polynomial x^8 + x^4 + x^3 + x^2 + 1. */
function mul(x: number, y: number): number {
  let z = 0;
  for (let i = 7; i >= 0; i--) {
    z = (z << 1) ^ ((z >>> 7) * 0x11d);
    z ^= ((y >>> i) & 1) * x;
  }
  return z & 0xff;
}

function errorCorrection(data: number[]): number[] {
  // generator polynomial of degree EC_CODEWORDS, highest coefficient dropped
  const gen = new Array<number>(EC_CODEWORDS).fill(0);
  gen[EC_CODEWORDS - 1] = 1;
  let root = 1;
  for (let i = 0; i < EC_CODEWORDS; i++) {
    for (let j = 0; j < EC_CODEWORDS; j++) {
      gen[j] = mul(gen[j]!, root);
      if (j + 1 < EC_CODEWORDS) gen[j] = gen[j]! ^ gen[j + 1]!;
    }
    root = mul(root, 2);
  }
  const rem = new Array<number>(EC_CODEWORDS).fill(0);
  for (const b of data) {
    const factor = b ^ rem.shift()!;
    rem.push(0);
    for (let i = 0; i < EC_CODEWORDS; i++) rem[i] = rem[i]! ^ mul(gen[i]!, factor);
  }
  return rem;
}

/** The text as the code's data codewords: byte mode, length, the bytes, then padding. */
function codewords(text: string): number[] {
  const bytes = [...new TextEncoder().encode(text)];
  if (bytes.length > 53) throw new Error('qr: text too long');
  const bits: number[] = [];
  const push = (value: number, length: number) => {
    for (let i = length - 1; i >= 0; i--) bits.push((value >>> i) & 1);
  };
  push(0b0100, 4); // byte mode
  push(bytes.length, 8);
  for (const b of bytes) push(b, 8);
  const capacity = DATA_CODEWORDS * 8;
  push(0, Math.min(4, capacity - bits.length)); // terminator
  while (bits.length % 8) bits.push(0);
  const out: number[] = [];
  for (let i = 0; i < bits.length; i += 8) out.push(bits.slice(i, i + 8).reduce((a, b) => (a << 1) | b, 0));
  for (let pad = 0xec; out.length < DATA_CODEWORDS; pad ^= 0xec ^ 0x11) out.push(pad);
  return out;
}

/** The code as rows of modules, true = dark. Index as [y][x]. */
export function qrModules(text: string): boolean[][] {
  const dark: boolean[][] = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
  const fixed: boolean[][] = Array.from({ length: SIZE }, () => new Array<boolean>(SIZE).fill(false));
  const set = (x: number, y: number, on: boolean) => {
    dark[y]![x] = on;
    fixed[y]![x] = true;
  };

  // timing patterns
  for (let i = 0; i < SIZE; i++) {
    set(6, i, i % 2 === 0);
    set(i, 6, i % 2 === 0);
  }
  // finder patterns with their light border
  for (const [cx, cy] of [[3, 3], [SIZE - 4, 3], [3, SIZE - 4]] as const) {
    for (let dy = -4; dy <= 4; dy++) {
      for (let dx = -4; dx <= 4; dx++) {
        const x = cx + dx;
        const y = cy + dy;
        if (x < 0 || y < 0 || x >= SIZE || y >= SIZE) continue;
        const d = Math.max(Math.abs(dx), Math.abs(dy));
        set(x, y, d !== 2 && d !== 4);
      }
    }
  }
  // the one alignment pattern of version 3
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(22 + dx, 22 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);

  // format information: level L and the mask, protected by a BCH code, written twice
  const format = (1 << 3) | MASK;
  let rem = format;
  for (let i = 0; i < 10; i++) rem = (rem << 1) ^ ((rem >>> 9) * 0x537);
  const fbits = ((format << 10) | rem) ^ 0x5412;
  const fbit = (i: number) => ((fbits >>> i) & 1) === 1;
  for (let i = 0; i <= 5; i++) set(8, i, fbit(i));
  set(8, 7, fbit(6));
  set(8, 8, fbit(7));
  set(7, 8, fbit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, fbit(i));
  for (let i = 0; i < 8; i++) set(SIZE - 1 - i, 8, fbit(i));
  for (let i = 8; i < 15; i++) set(8, SIZE - 15 + i, fbit(i));
  set(8, SIZE - 8, true);

  // data and error correction, in the zigzag from the bottom right, then the mask
  const data = codewords(text);
  const all = [...data, ...errorCorrection(data)];
  let i = 0;
  for (let right = SIZE - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vert = 0; vert < SIZE; vert++) {
      for (let j = 0; j < 2; j++) {
        const x = right - j;
        const upward = ((right + 1) & 2) === 0;
        const y = upward ? SIZE - 1 - vert : vert;
        if (fixed[y]![x]) continue;
        const bit = i < all.length * 8 ? ((all[i >>> 3]! >>> (7 - (i & 7))) & 1) === 1 : false;
        i++;
        dark[y]![x] = bit !== ((x + y) % 2 === 0);
      }
    }
  }
  return dark;
}

/** One SVG path that fills every dark module, on a grid of 1 unit per module. */
export function qrPath(text: string): { d: string; size: number } {
  const m = qrModules(text);
  let d = '';
  for (let y = 0; y < SIZE; y++) {
    for (let x = 0; x < SIZE; x++) {
      if (!m[y]![x]) continue;
      let run = 1;
      while (x + run < SIZE && m[y]![x + run]) run++;
      d += `M${x} ${y}h${run}v1h-${run}z`;
      x += run - 1;
    }
  }
  return { d, size: SIZE };
}

import { createHash, randomBytes } from 'node:crypto';

const ALPHABET = '123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';
const MAP: Record<string, number> = {};
for (let i = 0; i < ALPHABET.length; i++) MAP[ALPHABET[i]!] = i;

export function b58encode(bytes: Uint8Array): string {
  let n = 0n;
  for (const b of bytes) n = (n << 8n) | BigInt(b);
  let out = '';
  while (n > 0n) {
    out = ALPHABET[Number(n % 58n)] + out;
    n /= 58n;
  }
  for (const b of bytes) {
    if (b !== 0) break;
    out = '1' + out;
  }
  return out;
}

export function b58decode(s: string): Uint8Array {
  let n = 0n;
  for (const c of s) {
    const v = MAP[c];
    if (v === undefined) throw new Error('invalid base58');
    n = n * 58n + BigInt(v);
  }
  const bytes: number[] = [];
  while (n > 0n) {
    bytes.unshift(Number(n & 0xffn));
    n >>= 8n;
  }
  for (const c of s) {
    if (c !== '1') break;
    bytes.unshift(0);
  }
  return Uint8Array.from(bytes);
}

/** True for a base58 string that decodes to exactly 32 bytes (a Solana pubkey). */
export function isPubkey(s: unknown): s is string {
  if (typeof s !== 'string' || s.length < 32 || s.length > 44) return false;
  try {
    return b58decode(s).length === 32;
  } catch {
    return false;
  }
}

export const hex = (b: Uint8Array) => Buffer.from(b).toString('hex');
export const unhex = (s: string) => Uint8Array.from(Buffer.from(s, 'hex'));

export function sha256(...parts: Uint8Array[]): Uint8Array {
  const h = createHash('sha256');
  for (const p of parts) h.update(p);
  return Uint8Array.from(h.digest());
}

export const random32 = () => Uint8Array.from(randomBytes(32));

export function randomPubkey(): string {
  return b58encode(random32());
}

/** Random u63 market id (fits u64, never collides in practice). */
export function randomMarketId(): bigint {
  const b = randomBytes(8);
  b[0]! &= 0x7f;
  return b.readBigUInt64BE(0);
}

/**
 * seed = sha256(secret ‖ entropy ‖ market_pubkey), hex. CONTRACT.md "Seed for seeded windows".
 * `market` is the base58 market address (32 bytes once decoded).
 */
export function computeSeed(secret: Uint8Array, entropy: Uint8Array, market: string): string {
  return hex(sha256(secret, entropy, b58decode(market)));
}

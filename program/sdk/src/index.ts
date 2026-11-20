/**
 * @arena/sdk: client for the Arena program (pooled / parimutuel PLAY markets).
 *
 * Units: every `amount`, pool and balance is in PLAY base units (bigint, 6 decimals),
 * i.e. 1 PLAY = 1_000_000n. Use `toBase(1.5)` / `fromBase(1_500_000n)` to convert.
 * Keys: anywhere a key is accepted, a PublicKey or a base58 string works.
 * Instruction builders are synchronous and return a web3.js TransactionInstruction.
 */
import { Buffer } from 'buffer';
import {
  Connection,
  PublicKey,
  SYSVAR_RENT_PUBKEY,
  SYSVAR_SLOT_HASHES_PUBKEY,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  type Signer,
} from '@solana/web3.js';
import {
  ASSOCIATED_TOKEN_PROGRAM_ID,
  TOKEN_PROGRAM_ID,
  createAssociatedTokenAccountIdempotentInstruction,
  createMintToInstruction,
  getAssociatedTokenAddressSync,
} from '@solana/spl-token';
import { sha256 } from '@noble/hashes/sha256';
import { IDL } from './idl';
import { DEPLOYED } from './deployed';

export { IDL, DEPLOYED };
export type { ArenaIdl } from './idl';

export const PLAY_DECIMALS = 6;
export const MAX_OUTCOMES = 16;
export const DEFAULT_PROGRAM_ID = new PublicKey(DEPLOYED?.programId ?? IDL.address);

export type Key = PublicKey | string;
export type Bytes = Uint8Array | string; // Uint8Array or hex string
export type MarketState = 'Open' | 'Locked' | 'Settled' | 'Void';

export interface Market {
  address: PublicKey;
  id: bigint;
  /** channel bytes decoded as utf8 with trailing zeros stripped */
  channel: string;
  channelBytes: Uint8Array;
  outcomeCount: number;
  /** one entry per outcome (length = outcomeCount), base units */
  pools: bigint[];
  totalPool: bigint;
  state: MarketState;
  closeSlot: bigint;
  settleDeadlineSlot: bigint;
  commitment: Uint8Array;
  entropy: Uint8Array;
  /** slot whose hash became `entropy` (0 until locked) */
  entropySlot: bigint;
  secret: Uint8Array;
  simHash: Uint8Array;
  winner: number;
  /** Position accounts on this market that still exist (close_market needs 0) */
  positions: number;
}

export interface Position {
  address: PublicKey;
  market: PublicKey;
  owner: PublicKey;
  /** one entry per outcome (length 16), base units */
  amounts: bigint[];
  claimed: boolean;
}

export interface Config {
  address: PublicKey;
  admin: PublicKey;
  mint: PublicKey;
  vault: PublicKey;
}

// ------------------------------------------------------------------ helpers

export const toKey = (k: Key): PublicKey =>
  typeof k === 'string' ? new PublicKey(k) : new PublicKey(k.toBase58()); // normalise across web3.js copies

export const toBase = (play: number): bigint => BigInt(Math.round(play * 10 ** PLAY_DECIMALS));
export const fromBase = (base: bigint | number): number => Number(base) / 10 ** PLAY_DECIMALS;

export function hexToBytes(hex: string): Uint8Array {
  const h = hex.startsWith('0x') ? hex.slice(2) : hex;
  if (h.length % 2 || /[^0-9a-fA-F]/.test(h)) throw new Error(`bad hex: ${hex}`);
  const out = new Uint8Array(h.length / 2);
  for (let i = 0; i < out.length; i++) out[i] = parseInt(h.slice(i * 2, i * 2 + 2), 16);
  return out;
}
export const bytesToHex = (b: Uint8Array): string =>
  Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');

function bytes32(b: Bytes | undefined, what: string): Uint8Array {
  if (b === undefined) return new Uint8Array(32);
  const out = typeof b === 'string' ? hexToBytes(b) : b;
  if (out.length !== 32) throw new Error(`${what} must be 32 bytes, got ${out.length}`);
  return out;
}

/** utf8 channel name -> 16 bytes (truncated / zero padded). */
export function channelBytes(channel: string | Uint8Array): Uint8Array {
  const src = typeof channel === 'string' ? new TextEncoder().encode(channel) : channel;
  const out = new Uint8Array(16);
  out.set(src.subarray(0, 16));
  return out;
}

/** sha256(secret): the commitment to pass to createMarketIx for a seeded window. */
export const commitmentFor = (secret: Bytes): Uint8Array => sha256(bytes32(secret, 'secret'));

/** 32 random bytes from WebCrypto (node >= 19 and browsers). */
export function randomSecret(): Uint8Array {
  const b = new Uint8Array(32);
  globalThis.crypto.getRandomValues(b);
  return b;
}

/** seed = sha256(secret ‖ entropy ‖ market_pubkey), hex. */
export function computeSeed(secret: Bytes, entropy: Bytes, market: Key): string {
  const buf = new Uint8Array(96);
  buf.set(bytes32(secret, 'secret'), 0);
  buf.set(bytes32(entropy, 'entropy'), 32);
  buf.set(toKey(market).toBytes(), 64);
  return bytesToHex(sha256(buf));
}

const disc = (kind: 'instructions' | 'accounts', name: string): Uint8Array => {
  const item = (IDL[kind] as readonly { name: string; discriminator: readonly number[] }[]).find(
    (x) => x.name === name,
  );
  if (!item) throw new Error(`IDL has no ${kind} ${name}`);
  return Uint8Array.from(item.discriminator);
};

class Writer {
  private parts: number[] = [];
  bytes(b: Uint8Array | readonly number[]) {
    for (const x of b) this.parts.push(x);
    return this;
  }
  u8(v: number) {
    if (!Number.isInteger(v) || v < 0 || v > 255) throw new Error(`u8 out of range: ${v}`);
    this.parts.push(v);
    return this;
  }
  u64(v: bigint | number) {
    let x = BigInt(v);
    if (x < 0n || x >= 1n << 64n) throw new Error(`u64 out of range: ${v}`);
    for (let i = 0; i < 8; i++) {
      this.parts.push(Number(x & 0xffn));
      x >>= 8n;
    }
    return this;
  }
  done() {
    return Buffer.from(this.parts);
  }
}

const u64le = (v: bigint | number) => new Writer().u64(v).done();

class Reader {
  private dv: DataView;
  constructor(private b: Uint8Array, public o = 8) {
    this.dv = new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  u8() {
    return this.b[this.o++];
  }
  u64() {
    const v = this.dv.getBigUint64(this.o, true);
    this.o += 8;
    return v;
  }
  bytes(n: number) {
    const v = this.b.slice(this.o, this.o + n);
    this.o += n;
    return v;
  }
  key() {
    return new PublicKey(this.bytes(32));
  }
}

const sameDisc = (data: Uint8Array, d: Uint8Array) => d.every((x, i) => data[i] === x);
const STATES: MarketState[] = ['Open', 'Locked', 'Settled', 'Void'];

export const MARKET_SIZE = 8 + 8 + 16 + 1 + 128 + 1 + 8 + 8 + 32 * 4 + 1 + 8 + 1 + 4; // 320
/** Size of a Market created before `positions` was added (cannot be closed by the program). */
export const LEGACY_MARKET_SIZE = 316;
export const POSITION_SIZE = 8 + 32 + 32 + 128 + 1 + 1; // 202

export function decodeMarket(address: Key, data: Uint8Array): Market {
  if (!sameDisc(data, disc('accounts', 'Market'))) throw new Error('not a Market account');
  const r = new Reader(data);
  const id = r.u64();
  const channelB = r.bytes(16);
  const outcomeCount = r.u8();
  const allPools = Array.from({ length: 16 }, () => r.u64());
  const state = STATES[r.u8()];
  const closeSlot = r.u64();
  const settleDeadlineSlot = r.u64();
  const commitment = r.bytes(32);
  const entropy = r.bytes(32);
  const secret = r.bytes(32);
  const simHash = r.bytes(32);
  const winner = r.u8();
  const entropySlot = r.u64();
  r.u8(); // bump
  const positions = data.length >= MARKET_SIZE ? new DataView(data.buffer, data.byteOffset + r.o, 4).getUint32(0, true) : 0;
  const end = channelB.indexOf(0);
  const pools = allPools.slice(0, outcomeCount);
  return {
    address: toKey(address),
    id,
    channel: new TextDecoder().decode(end < 0 ? channelB : channelB.subarray(0, end)),
    channelBytes: channelB,
    outcomeCount,
    pools,
    totalPool: pools.reduce((a, b) => a + b, 0n),
    state,
    closeSlot,
    settleDeadlineSlot,
    commitment,
    entropy,
    entropySlot,
    secret,
    simHash,
    winner,
    positions,
  };
}

export function decodePosition(address: Key, data: Uint8Array): Position {
  if (!sameDisc(data, disc('accounts', 'Position'))) throw new Error('not a Position account');
  const r = new Reader(data);
  const market = r.key();
  const owner = r.key();
  const amounts = Array.from({ length: 16 }, () => r.u64());
  const claimed = r.u8() === 1;
  return { address: toKey(address), market, owner, amounts, claimed };
}

export function decodeConfig(address: Key, data: Uint8Array): Config {
  if (!sameDisc(data, disc('accounts', 'Config'))) throw new Error('not a Config account');
  const r = new Reader(data);
  return { address: toKey(address), admin: r.key(), mint: r.key(), vault: r.key() };
}

/** What a payout would be for this position (mirrors the program's claim math). */
export function expectedPayout(market: Market, position: Position): bigint {
  const staked = position.amounts.reduce((a, b) => a + b, 0n);
  if (market.state === 'Void') return staked;
  if (market.state !== 'Settled') return 0n;
  const poolW = market.pools[market.winner] ?? 0n;
  if (poolW === 0n) return staked;
  return (position.amounts[market.winner] * market.totalPool) / poolW;
}

// ------------------------------------------------------------------ client

export interface ClientOptions {
  connection: Connection;
  /** defaults to DEPLOYED.programId (or the IDL address) */
  programId?: Key;
  /** default admin key for admin-signed instructions (createMarket, settle, void, grant, close*) */
  admin?: Key;
}

export interface CreateMarketArgs {
  id: bigint | number;
  /** channel id, utf8, max 16 bytes */
  channel: string | Uint8Array;
  outcomeCount: number;
  closeSlot: bigint | number;
  settleDeadlineSlot: bigint | number;
  /** sha256(secret) for seeded windows; omit / zeros for live ones */
  commitment?: Bytes;
  /** 32 bytes or 64-char hex; omit for zeros */
  simHash?: Bytes;
  admin?: Key;
}

export interface PlaceBetArgs {
  market: Key;
  owner: Key;
  outcome: number;
  /** base units */
  amount: bigint | number;
  /** pays the Position rent on the first bet: set this to the relayer's fee payer.
   *  Defaults to `owner` (only works if the owner holds SOL). */
  payer?: Key;
}

export function createClient(opts: ClientOptions) {
  const { connection } = opts;
  const programId = opts.programId ? toKey(opts.programId) : DEFAULT_PROGRAM_ID;
  const defaultAdmin = opts.admin ? toKey(opts.admin) : undefined;
  const needAdmin = (a?: Key) => {
    if (a) return toKey(a);
    if (defaultAdmin) return defaultAdmin;
    throw new Error('admin key required: pass `admin` to createClient or to this call');
  };

  const pda = (...seeds: (Uint8Array | Buffer)[]) =>
    PublicKey.findProgramAddressSync(seeds.map((s) => Buffer.from(s)), programId)[0];
  const configPda = () => pda(Buffer.from('config'));
  const mintPda = () => pda(Buffer.from('mint'));
  const vaultPda = () => pda(Buffer.from('vault'));
  const marketPda = (id: bigint | number) => pda(Buffer.from('market'), u64le(id));
  const positionPda = (market: Key, owner: Key) =>
    pda(Buffer.from('pos'), toKey(market).toBytes(), toKey(owner).toBytes());
  const playAta = (owner: Key) => getAssociatedTokenAddressSync(mintPda(), toKey(owner), true);

  const ix = (name: string, keys: [PublicKey, boolean, boolean][], data: Buffer = Buffer.alloc(0)) =>
    new TransactionInstruction({
      programId,
      keys: keys.map(([pubkey, isSigner, isWritable]) => ({ pubkey, isSigner, isWritable })),
      data: Buffer.concat([Buffer.from(disc('instructions', name)), data]),
    });

  // -------------------------------------------------------------- instructions

  /** One-time setup: creates config, the PLAY mint (authority = admin) and the vault. */
  const initializeIx = (admin?: Key) =>
    ix('initialize', [
      [needAdmin(admin), true, true],
      [configPda(), false, true],
      [mintPda(), false, true],
      [vaultPda(), false, true],
      [TOKEN_PROGRAM_ID, false, false],
      [SystemProgram.programId, false, false],
      [SYSVAR_RENT_PUBKEY, false, false],
    ]);

  const createMarketIx = (a: CreateMarketArgs) => {
    if (a.outcomeCount < 2 || a.outcomeCount > MAX_OUTCOMES) throw new Error('outcomeCount must be 2..16');
    const data = new Writer()
      .u64(a.id)
      .bytes(channelBytes(a.channel))
      .u8(a.outcomeCount)
      .u64(a.closeSlot)
      .u64(a.settleDeadlineSlot)
      .bytes(bytes32(a.commitment, 'commitment'))
      .bytes(bytes32(a.simHash, 'simHash'))
      .done();
    return ix(
      'create_market',
      [
        [needAdmin(a.admin), true, true],
        [configPda(), false, false],
        [marketPda(a.id), false, true],
        [SystemProgram.programId, false, false],
      ],
      data,
    );
  };

  const placeBetIx = (a: PlaceBetArgs) => {
    const market = toKey(a.market);
    const owner = toKey(a.owner);
    const payer = a.payer ? toKey(a.payer) : owner;
    const keys: [PublicKey, boolean, boolean][] = [
      [owner, true, false],
      [payer, true, true],
      [configPda(), false, false],
      [market, false, true],
      [positionPda(market, owner), false, true],
      [playAta(owner), false, true],
      [vaultPda(), false, true],
      [TOKEN_PROGRAM_ID, false, false],
      [SystemProgram.programId, false, false],
    ];
    if (payer.equals(owner)) keys[0][2] = true; // same account listed twice: keep flags consistent
    return ix('place_bet', keys, new Writer().u8(a.outcome).u64(a.amount).done());
  };

  /** Permissionless once close_slot has passed. */
  const lockIx = (market: Key) =>
    ix('lock', [
      [toKey(market), false, true],
      [SYSVAR_SLOT_HASHES_PUBKEY, false, false],
    ]);

  const settleIx = (market: Key, a: { secret?: Bytes; winner: number; admin?: Key }) =>
    ix(
      'settle',
      [
        [needAdmin(a.admin), true, false],
        [configPda(), false, false],
        [toKey(market), false, true],
      ],
      new Writer().bytes(bytes32(a.secret, 'secret')).u8(a.winner).done(),
    );

  /** `authority` = admin (any time before settle) or anyone after settle_deadline_slot. */
  const voidIx = (market: Key, authority?: Key) =>
    ix('void', [
      [needAdmin(authority), true, false],
      [configPda(), false, false],
      [toKey(market), false, true],
    ]);

  /** Permissionless: pays `owner`'s PLAY associated token account (must exist; it does if they bet). */
  const claimIx = (market: Key, owner: Key) => {
    const m = toKey(market);
    const o = toKey(owner);
    return ix('claim', [
      [configPda(), false, false],
      [m, false, false],
      [o, false, false],
      [positionPda(m, o), false, true],
      [playAta(o), false, true],
      [vaultPda(), false, true],
      [TOKEN_PROGRAM_ID, false, false],
    ]);
  };

  /**
   * Admin: closes `owner`'s Position on `market` (must be claimed); the rent goes to the admin.
   * Several fit in one transaction (about 16 with the market close).
   */
  const closePositionIx = (market: Key, owner: Key, admin?: Key) => {
    const m = toKey(market);
    return ix('close_position', [
      [needAdmin(admin), true, true],
      [configPda(), false, false],
      [m, false, true],
      [positionPda(m, owner), false, true],
    ]);
  };

  /** Admin: closes a Settled or Void market once all its positions are closed; the rent goes to the admin. */
  const closeMarketIx = (market: Key, admin?: Key) =>
    ix('close_market', [
      [needAdmin(admin), true, true],
      [configPda(), false, false],
      [toKey(market), false, true],
    ]);

  /** Faucet: create owner's PLAY ATA if missing (paid by `payer`, default admin) + mint `amount` base units. */
  const grantIxs = (a: { owner: Key; amount: bigint | number; admin?: Key; payer?: Key }) => {
    const admin = needAdmin(a.admin);
    const payer = a.payer ? toKey(a.payer) : admin;
    const owner = toKey(a.owner);
    const ata = playAta(owner);
    return [
      createAssociatedTokenAccountIdempotentInstruction(payer, ata, owner, mintPda(), TOKEN_PROGRAM_ID, ASSOCIATED_TOKEN_PROGRAM_ID),
      createMintToInstruction(mintPda(), ata, admin, BigInt(a.amount)),
    ];
  };
  /** Same as grantIxs, wrapped in a Transaction (fee payer = payer ?? admin). Sign with admin (+ payer). */
  const grantTx = (a: { owner: Key; amount: bigint | number; admin?: Key; payer?: Key }) => {
    const tx = new Transaction().add(...grantIxs(a));
    tx.feePayer = a.payer ? toKey(a.payer) : needAdmin(a.admin);
    return tx;
  };

  /**
   * Browser side of a relayed bet: builds the place_bet tx with `feePayer` as fee payer and
   * Position rent payer, signs it with the bettor, returns base64 for POST /relay.
   */
  const placeBetTx = (a: Omit<PlaceBetArgs, 'owner' | 'payer'> & { owner: Signer; feePayer: Key; recentBlockhash: string }) => {
    const tx = new Transaction();
    tx.feePayer = toKey(a.feePayer);
    tx.recentBlockhash = a.recentBlockhash;
    tx.add(placeBetIx({ market: a.market, owner: a.owner.publicKey, outcome: a.outcome, amount: a.amount, payer: a.feePayer }));
    tx.partialSign(a.owner);
    return Buffer.from(tx.serialize({ requireAllSignatures: false, verifySignatures: true })).toString('base64');
  };

  /**
   * Relay-side guard. Throws unless every instruction is place_bet / lock / claim of this program
   * and `feePayer` is the transaction fee payer. Admin-only instructions are always refused, so the
   * relayer key can never be used to settle/void/create even if it happens to be the admin.
   * Returns the Transaction so the caller can partialSign(feePayer) and send it.
   */
  const checkRelayTx = (txBase64: string, feePayer: Key) => {
    const tx = Transaction.from(Buffer.from(txBase64, 'base64'));
    const fp = toKey(feePayer);
    if (!tx.feePayer || !tx.feePayer.equals(fp)) throw new Error('relay: fee payer mismatch');
    if (tx.instructions.length === 0) throw new Error('relay: empty tx');
    const allowed = ['place_bet', 'lock', 'claim'].map((n) => disc('instructions', n));
    for (const i of tx.instructions) {
      if (!i.programId.equals(programId)) throw new Error(`relay: foreign program ${i.programId.toBase58()}`);
      if (!allowed.some((d) => sameDisc(i.data, d))) throw new Error('relay: instruction not allowed');
      // the fee payer may only appear as place_bet's rent payer (index 1)
      i.keys.forEach((k, idx) => {
        const isPlaceBetPayer = sameDisc(i.data, disc('instructions', 'place_bet')) && idx === 1;
        if (k.pubkey.equals(fp) && !isPlaceBetPayer) throw new Error('relay: fee payer used as a non-payer account');
      });
    }
    return tx;
  };

  // -------------------------------------------------------------- reads

  const fetchConfig = async (): Promise<Config | null> => {
    const a = configPda();
    const info = await connection.getAccountInfo(a);
    return info ? decodeConfig(a, info.data) : null;
  };
  const fetchMarket = async (market: Key): Promise<Market | null> => {
    const info = await connection.getAccountInfo(toKey(market));
    return info ? decodeMarket(market, info.data) : null;
  };
  const fetchPosition = async (market: Key, owner: Key): Promise<Position | null> => {
    const a = positionPda(market, owner);
    const info = await connection.getAccountInfo(a);
    return info ? decodePosition(a, info.data) : null;
  };
  const fetchPositions = async (market: Key): Promise<Position[]> => {
    const accs = await connection.getProgramAccounts(programId, {
      filters: [{ dataSize: POSITION_SIZE }, { memcmp: { offset: 8, bytes: toKey(market).toBase58() } }],
    });
    return accs.map((a) => decodePosition(a.pubkey, a.account.data));
  };
  /** Every (current-layout) Market of the program. Heavy: one getProgramAccounts call. */
  const fetchMarkets = async (): Promise<Market[]> => {
    const accs = await connection.getProgramAccounts(programId, { filters: [{ dataSize: MARKET_SIZE }] });
    return accs.map((a) => decodeMarket(a.pubkey, a.account.data));
  };
  /** PLAY balance of owner's associated token account, base units (0n if it does not exist). */
  const fetchPlayBalance = async (owner: Key): Promise<bigint> => {
    const info = await connection.getAccountInfo(playAta(owner));
    if (!info || info.data.length < 72) return 0n;
    return new DataView(info.data.buffer, info.data.byteOffset + 64, 8).getBigUint64(0, true);
  };

  return {
    connection,
    programId,
    // PDAs
    configPda,
    mintPda,
    vaultPda,
    marketPda,
    positionPda,
    playAta,
    // instructions
    initializeIx,
    createMarketIx,
    placeBetIx,
    lockIx,
    settleIx,
    voidIx,
    claimIx,
    closePositionIx,
    closeMarketIx,
    grantIxs,
    grantTx,
    placeBetTx,
    checkRelayTx,
    // reads
    fetchConfig,
    fetchMarket,
    fetchPosition,
    fetchPositions,
    fetchMarkets,
    fetchPlayBalance,
    // misc
    computeSeed,
    expectedPayout,
  };
}

export type ArenaClient = ReturnType<typeof createClient>;

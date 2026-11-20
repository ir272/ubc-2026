// Solana mode only (loaded lazily so memory mode never ships web3.js to the browser).
// Builds place_bet with @arena/sdk, fee payer = the runner's feePayer, signs with the silent key,
// hands it to POST /relay which adds the fee-payer signature and submits.
import { createClient, toKey } from '@arena/sdk';
import { api, type Config } from './api';
import { SOLANA_RPC } from './env';

export const CLUSTERS: Record<string, string> = {
  devnet: 'https://api.devnet.solana.com',
  testnet: 'https://api.testnet.solana.com',
  'mainnet-beta': 'https://api.mainnet-beta.solana.com',
  localnet: 'http://127.0.0.1:8899',
  localhost: 'http://127.0.0.1:8899',
};

/**
 * A recent blockhash to sign with. The runner's own RPC first (the public devnet RPC turns requests away now
 * and then, which used to show as "Lost connection"), then the public RPC once as a fallback.
 */
export async function blockhashFor(cluster: string | undefined): Promise<string> {
  try {
    return (await api.blockhash()).blockhash;
  } catch {
    return latestBlockhash(SOLANA_RPC || CLUSTERS[cluster ?? 'devnet'] || CLUSTERS.devnet!);
  }
}

export async function latestBlockhash(rpc: string): Promise<string> {
  const r = await fetch(rpc, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] }),
  });
  const j = await r.json();
  const bh = j?.result?.value?.blockhash;
  if (!bh) throw new Error('network: no blockhash');
  return bh;
}

/** Builds and signs the transaction (exported separately so it can be checked without a network). */
export function buildPlaceBetTx(a: {
  seed: Uint8Array; owner: string; market: string; outcome: number; amount: number;
  programId?: string; feePayer: string; recentBlockhash: string;
}): string {
  const client = createClient({ connection: {} as never, programId: a.programId });
  const publicKey = toKey(a.owner);
  const secretKey = new Uint8Array(64);
  secretKey.set(a.seed, 0);
  secretKey.set(publicKey.toBytes(), 32);
  return client.placeBetTx({
    market: a.market,
    owner: { publicKey, secretKey },
    outcome: a.outcome,
    amount: BigInt(a.amount),
    feePayer: a.feePayer,
    recentBlockhash: a.recentBlockhash,
  });
}

export async function placeBetSolana(a: {
  seed: Uint8Array; owner: string; market: string; outcome: number; amount: number; cfg: Config;
  /** the viewer's chat name, shown with the bet in the game's chat */
  name?: string;
}): Promise<string> {
  if (!a.cfg.feePayer) throw new Error('runner has no fee payer');
  const recentBlockhash = await blockhashFor(a.cfg.cluster);
  const tx = buildPlaceBetTx({ ...a, programId: a.cfg.programId, feePayer: a.cfg.feePayer, recentBlockhash });
  const { signature } = await api.relay(tx, a.name ? { name: a.name, owner: a.owner } : undefined);
  return signature;
}

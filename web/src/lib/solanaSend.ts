// Solana mode only, loaded on demand: sends Souls from the viewer's silent wallet to another address.
// The transaction is exactly what the runner's POST /relay accepts for a transfer: the runner's fee payer pays,
// an idempotent "create the recipient's token account" (paid by the fee payer), then one checked transfer signed
// by the viewer's key. The runner adds the fee payer's signature and submits.
import './bufferGlobal'; // first: the token library expects a global Buffer
import { createAssociatedTokenAccountIdempotentInstruction, createTransferCheckedInstruction, getAssociatedTokenAddressSync } from '@solana/spl-token';
import { Keypair, PublicKey, Transaction } from '@solana/web3.js';
import { api, type Config } from './api';
import { SOLANA_RPC } from './env';
import { CLUSTERS, latestBlockhash } from './solanaBet';

const PLAY_DECIMALS = 6;

/** Builds and signs the transfer (separate from sending, so it can be checked without a network). */
export function buildSendTx(a: {
  seed: Uint8Array; owner: string; to: string; amount: number; mint: string; feePayer: string; recentBlockhash: string;
}): string {
  const owner = new PublicKey(a.owner);
  const to = new PublicKey(a.to);
  const mint = new PublicKey(a.mint);
  const feePayer = new PublicKey(a.feePayer);
  const from = getAssociatedTokenAddressSync(mint, owner, true);
  const dest = getAssociatedTokenAddressSync(mint, to, true);
  const tx = new Transaction();
  tx.feePayer = feePayer;
  tx.recentBlockhash = a.recentBlockhash;
  tx.add(createAssociatedTokenAccountIdempotentInstruction(feePayer, dest, to, mint));
  tx.add(createTransferCheckedInstruction(from, mint, dest, owner, BigInt(a.amount), PLAY_DECIMALS));
  tx.partialSign(Keypair.fromSeed(a.seed));
  const raw = tx.serialize({ requireAllSignatures: false, verifySignatures: true });
  let bin = '';
  for (const b of raw) bin += String.fromCharCode(b);
  return btoa(bin);
}

export async function sendPlaySolana(a: { seed: Uint8Array; owner: string; to: string; amount: number; cfg: Config }): Promise<string> {
  if (!a.cfg.feePayer || !a.cfg.mint) throw new Error('runner has no fee payer');
  const rpc = SOLANA_RPC || CLUSTERS[a.cfg.cluster ?? 'devnet'] || CLUSTERS.devnet!;
  const recentBlockhash = await latestBlockhash(rpc);
  const tx = buildSendTx({ seed: a.seed, owner: a.owner, to: a.to, amount: a.amount, mint: a.cfg.mint, feePayer: a.cfg.feePayer, recentBlockhash });
  const { signature } = await api.relay(tx);
  return signature;
}

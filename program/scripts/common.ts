import { readFileSync } from 'node:fs';
import { Connection, Keypair, Transaction, TransactionInstruction, sendAndConfirmTransaction } from '@solana/web3.js';

export const ROOT = new URL('..', import.meta.url).pathname;
export const CLUSTER = process.env.CLUSTER ?? 'devnet';
export const RPC_URL =
  process.env.RPC_URL ?? (CLUSTER === 'localnet' ? 'http://127.0.0.1:8899' : 'https://api.devnet.solana.com');
if (CLUSTER === 'mainnet-beta' || /mainnet/.test(RPC_URL)) throw new Error('refusing to touch mainnet');

export const conn = new Connection(RPC_URL, 'confirmed');
export const loadKey = (rel: string) =>
  Keypair.fromSecretKey(Uint8Array.from(JSON.parse(readFileSync(ROOT + rel, 'utf8'))));
export const admin = loadKey('.keys/admin.json');
export const programKey = loadKey('.keys/program.json');
export const deployedPath = ROOT + (CLUSTER === 'devnet' ? 'DEPLOYED.json' : `DEPLOYED.${CLUSTER}.json`);

export async function send(ixs: TransactionInstruction[], signers: Keypair[]) {
  const tx = new Transaction().add(...ixs);
  tx.feePayer = signers[0].publicKey;
  return sendAndConfirmTransaction(conn, tx, signers, { commitment: 'confirmed' });
}

export const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

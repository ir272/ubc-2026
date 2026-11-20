import type { ChainAdapter } from '../types.ts';
import { MemoryChain } from './memory.ts';

export async function makeChain(kind = process.env.CHAIN ?? 'memory'): Promise<ChainAdapter> {
  if (kind === 'memory') return new MemoryChain();
  if (kind === 'solana') {
    // Dynamic import: the memory runner never loads @solana/web3.js or @arena/sdk.
    const { SolanaChain } = await import('./solana.ts');
    return SolanaChain.fromEnv();
  }
  throw new Error(`unknown CHAIN=${kind} (use memory or solana)`);
}

// The Solana token library reads a global Buffer, which browsers do not have. Imported before it.
import { Buffer } from 'buffer';

const g = globalThis as { Buffer?: typeof Buffer };
g.Buffer ??= Buffer;

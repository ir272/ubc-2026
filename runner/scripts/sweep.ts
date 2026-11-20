// Closes every finished market (and its claimed positions) the admin can find for the program, and
// returns the rent to the admin. For cleaning up after a crash or after the runner gave up on a
// market; the running runner already does this for every window it finishes.
//
//   CHAIN env as for the runner (ADMIN_KEYPAIR, DEPLOYED_PATH, SOLANA_RPC); then from runner/:
//   node scripts/sweep.ts [--dry-run] [--void-stale]
//
//   --dry-run     only count what is there
//   --void-stale  also void Open/Locked markets past their settle_deadline_slot (anyone may void
//                 those anyway; a live runner never has one), refund them and close them
// Markets created before the program had close_market (old 316-byte layout) cannot be closed.
import { SolanaChain } from '../src/chain/solana.ts';

const args = new Set(process.argv.slice(2));
const chain = await SolanaChain.fromEnv();
const sol = (l: number) => (l / 1e9).toFixed(6);
const before = await chain.adminLamports();
console.log(`admin balance before: ${sol(before)} SOL`);
const r = await chain.sweep({ dryRun: args.has('--dry-run'), voidStale: args.has('--void-stale'), say: (s) => console.log(s) });
const after = await chain.adminLamports();
console.log(
  `voided ${r.voided}, closed ${r.markets} market(s) and ${r.positions} position(s), ${r.failed} failed; ` +
    `admin balance after: ${sol(after)} SOL (${after >= before ? '+' : ''}${sol(after - before)})`,
);
process.exit(r.failed ? 1 : 0);

// One real round trip: create market -> two bets from fresh SOL-less keypairs through a separate
// fee payer (relay flow) -> lock -> settle -> claim. Records signatures in DEVNET_E2E.md.
import { readFileSync, writeFileSync } from 'node:fs';
import { Keypair, LAMPORTS_PER_SOL, PublicKey, SystemProgram } from '@solana/web3.js';
import { createClient, commitmentFor, randomSecret, toBase, fromBase, bytesToHex } from '@arena/sdk';
import { CLUSTER, ROOT, admin, conn, deployedPath, send, sleep } from './common.ts';

const dep = JSON.parse(readFileSync(deployedPath, 'utf8'));
const c = createClient({ connection: conn, programId: dep.programId, admin: admin.publicKey });
const log: [string, string][] = [];
const step = (name: string, sig: string) => {
  log.push([name, sig]);
  console.log(name.padEnd(28), sig);
};

const relayer = Keypair.generate();
step('fund relayer 0.05 SOL', await send([SystemProgram.transfer({ fromPubkey: admin.publicKey, toPubkey: relayer.publicKey, lamports: 0.05 * LAMPORTS_PER_SOL })], [admin]));

const A = Keypair.generate();
const B = Keypair.generate();
step('grant A 1000 PLAY', await send(c.grantIxs({ owner: A.publicKey, amount: toBase(1000), payer: relayer.publicKey }), [relayer, admin]));
step('grant B 1000 PLAY', await send(c.grantIxs({ owner: B.publicKey, amount: toBase(1000), payer: relayer.publicKey }), [relayer, admin]));

const secret = randomSecret();
const id = BigInt(Date.now());
const slot = BigInt(await conn.getSlot('confirmed'));
const closeSlot = slot + 40n; // ~16 s
const market = c.marketPda(id);
step('create_market', await send([c.createMarketIx({ id, channel: 'coinflip', outcomeCount: 2, closeSlot, settleDeadlineSlot: closeSlot + 9000n, commitment: commitmentFor(secret) })], [admin]));

async function relayBet(owner: Keypair, outcome: number, play: number) {
  const { blockhash, lastValidBlockHeight } = await conn.getLatestBlockhash();
  const b64 = c.placeBetTx({ market, owner, outcome, amount: toBase(play), feePayer: relayer.publicKey, recentBlockhash: blockhash });
  const tx = c.checkRelayTx(b64, relayer.publicKey); // what the server's /relay does
  tx.partialSign(relayer);
  const sig = await conn.sendRawTransaction(tx.serialize());
  await conn.confirmTransaction({ signature: sig, blockhash, lastValidBlockHeight }, 'confirmed');
  return sig;
}
step('place_bet A 100 on 0', await relayBet(A, 0, 100));
step('place_bet B 300 on 1', await relayBet(B, 1, 300));
console.log('A,B SOL balance', await conn.getBalance(A.publicKey), await conn.getBalance(B.publicKey));

while (BigInt(await conn.getSlot('confirmed')) <= closeSlot) await sleep(1000);
await sleep(1500);
step('lock', await send([c.lockIx(market)], [relayer]));
const locked = (await c.fetchMarket(market))!;
step('settle (winner 0)', await send([c.settleIx(market, { secret, winner: 0 })], [admin]));
step('claim A', await send([c.claimIx(market, A.publicKey)], [relayer]));
step('claim B', await send([c.claimIx(market, B.publicKey)], [relayer]));

const m = (await c.fetchMarket(market))!;
const balA = await c.fetchPlayBalance(A.publicKey);
const balB = await c.fetchPlayBalance(B.publicKey);
const seed = c.computeSeed(m.secret, m.entropy, market);
console.log({ state: m.state, balA: fromBase(balA), balB: fromBase(balB), seed });
if (m.state !== 'Settled' || balA !== toBase(1300) || balB !== toBase(700)) throw new Error('unexpected end state');

const explorer = (s: string) => `https://explorer.solana.com/tx/${s}?cluster=${CLUSTER}`;
const md = `# Devnet end-to-end run

Run: \`npm run e2e:devnet\` (scripts/e2e-devnet.ts), ${new Date().toISOString()}

- Program: \`${dep.programId}\`
- Mint (PLAY): \`${dep.mint}\`
- Market: \`${market.toBase58()}\` (id ${id}, close_slot ${closeSlot}, entropy from slot ${locked.entropySlot})
- Relayer / fee payer: \`${relayer.publicKey.toBase58()}\`; bettors A \`${A.publicKey.toBase58()}\`, B \`${B.publicKey.toBase58()}\` hold 0 SOL
- Result: winner 0, A 1000 -> ${fromBase(balA)} PLAY, B 1000 -> ${fromBase(balB)} PLAY
- Seed sha256(secret ‖ entropy ‖ market): \`${seed}\` (secret \`${bytesToHex(m.secret)}\`)

| Step | Signature |
|---|---|
${log.map(([n, s]) => `| ${n} | [\`${s}\`](${explorer(s)}) |`).join('\n')}
`;
writeFileSync(ROOT + (CLUSTER === 'devnet' ? 'DEVNET_E2E.md' : `E2E.${CLUSTER}.md`), md);
console.log('ok');

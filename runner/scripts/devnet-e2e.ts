// End-to-end check of the runner in Solana mode, the way the website does it:
// two fresh wallets with no SOL get play money from /faucet, each signs a place_bet and hands it
// to /relay, the runner locks, settles and pays, and the balances are checked.
//
//   PORT=8790 CHAIN=solana CHANNELS=coinflip npm start      (in another terminal)
//   node scripts/devnet-e2e.ts [http://127.0.0.1:8790]
import { Keypair } from '@solana/web3.js';

const BASE = process.argv[2] ?? 'http://127.0.0.1:8790';
const CHANNEL = process.env.CHANNEL ?? 'coinflip';
const sdkName = '@arena/sdk';
const { createClient } = await import(sdkName);

const j = async (path: string, body?: unknown) => {
  const r = await fetch(BASE + path, body ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : undefined);
  const text = await r.text();
  if (!r.ok) throw new Error(`${path} → ${r.status} ${text}`);
  return JSON.parse(text);
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const play = (n: number) => (n / 1e6).toFixed(2);

const cfg = await j('/config');
if (cfg.chain !== 'solana') throw new Error(`runner is in ${cfg.chain} mode`);
const rpc = process.env.SOLANA_RPC ?? `https://api.${cfg.cluster}.solana.com`;
const blockhash = async () => {
  const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getLatestBlockhash', params: [{ commitment: 'confirmed' }] }) });
  return (await r.json()).result.value.blockhash as string;
};
const solBalance = async (owner: string) => {
  const r = await fetch(rpc, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method: 'getBalance', params: [owner] }) });
  return (await r.json()).result.value as number;
};
const client = createClient({ connection: {} as never, programId: cfg.programId });

const A = Keypair.generate();
const B = Keypair.generate();
console.log('cluster', cfg.cluster, 'program', cfg.programId, 'feePayer', cfg.feePayer);
for (const [name, k] of [['A', A], ['B', B]] as const) {
  const f = await j('/faucet', { owner: k.publicKey.toBase58() });
  console.log(`${name} ${k.publicKey.toBase58()} granted ${play(f.granted)} → balance ${play(f.balance)}`);
}

// wait for a window with enough time left to land two transactions
let win: any;
for (;;) {
  const snap = await j(`/channels/${CHANNEL}`);
  win = (snap.windows ?? []).find((w: any) => w.state === 'open' && w.closesAt - Date.now() > 14_000);
  if (win) break;
  await sleep(1000);
}
console.log(`window ${win.windowId} market ${win.market}: "${win.question}" closes in ${Math.round((win.closesAt - Date.now()) / 1000)} s`);

const bet = async (name: string, k: Keypair, outcome: number, amount: number) => {
  const tx = client.placeBetTx({
    market: win.market,
    owner: { publicKey: k.publicKey, secretKey: k.secretKey },
    outcome,
    amount: BigInt(amount),
    feePayer: cfg.feePayer,
    recentBlockhash: await blockhash(),
  });
  const t0 = Date.now();
  const { signature } = await j('/relay', { tx });
  console.log(`${name} bet ${play(amount)} on "${win.outcomes[outcome].label}" in ${Date.now() - t0} ms: ${signature}`);
};
await bet('A', A, 0, 300_000_000);
await bet('B', B, 1, 100_000_000);

// follow the window to its end
let last = '';
let final: any;
for (;;) {
  const snap = await j(`/channels/${CHANNEL}`);
  const w = (snap.windows ?? []).find((x: any) => x.windowId === win.windowId);
  if (!w) { console.log('window left the snapshot before we saw it settle'); break; }
  if (w.state !== last) { console.log(`state: ${w.state} pools ${w.pools.map(play).join(' / ')}`); last = w.state; }
  if (w.state === 'settled' || w.state === 'void') { final = w; break; }
  await sleep(1000);
}
await sleep(1500);
const meA = await j(`/me/${A.publicKey.toBase58()}`);
const meB = await j(`/me/${B.publicKey.toBase58()}`);
const winnerIdx = final ? final.outcomes.findIndex((o: any) => o.id === final.winnerOutcomeId) : -1;
console.log(`winner: ${final?.winnerOutcomeId} (outcome ${winnerIdx})  seed ${final?.seed?.slice(0, 16)}…  secret revealed: ${!!final?.secret}`);
console.log(`A balance ${play(meA.balance)}  B balance ${play(meB.balance)}  SOL held: A ${await solBalance(A.publicKey.toBase58())}  B ${await solBalance(B.publicKey.toBase58())}`);
const expectA = winnerIdx === 0 ? 1100 : 700;
const expectB = winnerIdx === 1 ? 1300 : 900;
const ok = final?.state === 'settled' && Math.abs(meA.balance / 1e6 - expectA) < 0.01 && Math.abs(meB.balance / 1e6 - expectB) < 0.01;
console.log(ok ? `PASS: expected A ${expectA}, B ${expectB}` : `FAIL: expected A ${expectA}, B ${expectB}`);
process.exit(ok ? 0 : 1);

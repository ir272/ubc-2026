// Idempotent: initializes config + PLAY mint + vault and writes DEPLOYED.json.
import { writeFileSync } from 'node:fs';
import { createClient } from '@arena/sdk';
import { CLUSTER, admin, conn, deployedPath, programKey, send } from './common.ts';

const c = createClient({ connection: conn, programId: programKey.publicKey, admin: admin.publicKey });
if (!(await c.fetchConfig())) {
  const sig = await send([c.initializeIx()], [admin]);
  console.log('initialize', sig);
} else console.log('already initialized');
const cfg = (await c.fetchConfig())!;
const out = {
  cluster: CLUSTER,
  programId: programKey.publicKey.toBase58(),
  mint: cfg.mint.toBase58(),
  config: cfg.address.toBase58(),
};
writeFileSync(deployedPath, JSON.stringify(out, null, 2) + '\n');
console.log(deployedPath, out);

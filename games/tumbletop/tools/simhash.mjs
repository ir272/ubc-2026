#!/usr/bin/env node
// SIM_HASH = sha256 over the simulation's source files (sim/*.js except the CLI), in name order.
//   node tools/simhash.mjs           print it
//   node tools/simhash.mjs --write   also write show/simHash.js (what the browser bundle exports)
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export function computeSimHash() {
  const dir = fileURLToPath(new URL('../sim/', import.meta.url));
  const h = createHash('sha256');
  for (const f of readdirSync(dir).filter((x) => x.endsWith('.js') && x !== 'cli.js').sort()) {
    h.update(f + '\n');
    h.update(readFileSync(dir + f));
    h.update('\n');
  }
  return h.digest('hex');
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const hash = computeSimHash();
  if (process.argv.includes('--write')) {
    writeFileSync(new URL('../show/simHash.js', import.meta.url), `// Written by tools/simhash.mjs. sha256 of the files in sim/ (see that tool).\nexport const SIM_HASH = '${hash}';\n`);
  }
  console.log(hash);
}

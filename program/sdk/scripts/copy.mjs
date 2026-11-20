import { copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DEPLOYED } from '../dist/index.js';
const here = dirname(fileURLToPath(import.meta.url));
copyFileSync(join(here, '../src/idl.json'), join(here, '../dist/idl.json'));
writeFileSync(join(here, '../dist/deployed.json'), JSON.stringify(DEPLOYED, null, 2) + '\n');

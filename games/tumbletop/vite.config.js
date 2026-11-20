// Vite serves the browser renderer from web/ and lets it import the pure simulation from ../sim.
// '@sim' is always the real sim/ directory: there is deliberately no override, so the browser can
// never run a different simulation from `node sim/cli.js`.
import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';
import { dirname, resolve } from 'node:path';

const root = dirname(fileURLToPath(import.meta.url));
const simDir = resolve(root, 'sim');

export default defineConfig({
  root: resolve(root, 'web'),
  publicDir: false,
  resolve: { alias: { '@sim': simDir } },
  server: {
    port: 5201,
    strictPort: true,
    fs: { allow: [root] },
  },
  build: { outDir: resolve(root, 'dist'), emptyOutDir: true, target: 'es2022' },
  clearScreen: false,
  logLevel: process.env.TT_VITE_QUIET ? 'warn' : 'info',
});

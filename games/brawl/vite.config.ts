import { defineConfig } from 'vite';
import { fileURLToPath } from 'node:url';

// Root is games/brawl, so the harness is at http://localhost:5202/harness/index.html.
// fs.allow includes the repo root so type-only imports from runner/ resolve.
const here = fileURLToPath(new URL('.', import.meta.url));
const repoRoot = fileURLToPath(new URL('../..', import.meta.url));

export default defineConfig({
  root: here,
  server: {
    port: 5202,
    strictPort: true,
    open: false,
    fs: { allow: [repoRoot] },
  },
  build: {
    target: 'es2022',
    outDir: 'dist',
    rollupOptions: { input: { harness: fileURLToPath(new URL('./harness/index.html', import.meta.url)) } },
  },
});

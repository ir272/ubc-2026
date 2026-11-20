import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      // Real games live in the repo's games/<id>/ folder; register them in src/games/registry.ts.
      '@games': fileURLToPath(new URL('../games', import.meta.url)),
    },
  },
  server: { port: 5190, strictPort: true, fs: { allow: [root] } },
  preview: { port: 5190 },
  optimizeDeps: { include: ['@arena/sdk'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  define: { global: 'globalThis' },
});

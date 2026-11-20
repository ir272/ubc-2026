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
      // The SDK's own copies, so sending play dollars (src/lib/solanaSend.ts) builds its transaction with the
      // same libraries the SDK uses and the site installs no second copy.
      '@solana/web3.js': fileURLToPath(new URL('../program/sdk/node_modules/@solana/web3.js', import.meta.url)),
      '@solana/spl-token': fileURLToPath(new URL('../program/sdk/node_modules/@solana/spl-token', import.meta.url)),
      buffer: fileURLToPath(new URL('../program/sdk/node_modules/buffer', import.meta.url)),
    },
  },
  server: { port: 5190, strictPort: true, fs: { allow: [root] } },
  preview: { port: 5190 },
  optimizeDeps: { include: ['@arena/sdk'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  define: { global: 'globalThis' },
});

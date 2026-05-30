import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';

const sharedSrc = fileURLToPath(new URL('../shared/src/index.ts', import.meta.url));

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Compile the shared types package from source (no build step).
    alias: { '@gap/shared': sharedSrc },
  },
  server: {
    port: 5173,
    proxy: {
      // In dev, forward API calls to the Express backend.
      '/api': 'http://localhost:3000',
    },
  },
});

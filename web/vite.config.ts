import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5180,
    proxy: {
      // Same-origin proxy to the casino backend (its own company, port 4100).
      '/api': { target: 'http://localhost:4100', changeOrigin: true },
    },
  },
});

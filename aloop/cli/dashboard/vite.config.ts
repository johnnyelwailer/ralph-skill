import path from 'node:path';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 4040,
    proxy: {
      '/api': 'http://localhost:4041',
      '/events': {
        target: 'http://localhost:4041',
        headers: { Connection: 'keep-alive' },
      },
    },
  },
});

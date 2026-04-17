import path from 'node:path';
import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./src/test-setup.ts'],
    exclude: ['**/node_modules/**', '**/dist/**', '**/e2e/**', '**/test-results/**'],
    coverage: {
      provider: 'istanbul',
      reportsDirectory: './coverage',
      include: [
        'src/App.tsx',
        'src/AppView.tsx',
        'src/hooks/useIsTouchDevice.ts',
        'src/components/ui/tooltip.tsx',
        'src/components/ui/hover-card.tsx',
      ],
      reporter: ['text', 'json-summary'],
    },
  },
});

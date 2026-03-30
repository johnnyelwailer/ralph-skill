import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/story-screenshots.spec.ts',
  timeout: 60_000,
  use: {
    baseURL: 'http://127.0.0.1:6006',
    headless: true,
  },
  webServer: {
    command: 'npx storybook dev -p 6006 --ci --no-open',
    url: 'http://127.0.0.1:6006',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

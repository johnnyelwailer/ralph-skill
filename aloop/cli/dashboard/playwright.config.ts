import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from '@playwright/test';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const fixturesRoot = path.resolve(currentDir, 'e2e', 'fixtures');
const homeDir = path.join(fixturesRoot, 'home');

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  use: {
    baseURL: 'http://127.0.0.1:4173',
    headless: true,
  },
  webServer: {
    command:
      'npm --prefix .. run build && node ..\\dist\\index.js dashboard --port 4173 --session-dir .\\e2e\\fixtures\\session --workdir .\\e2e\\fixtures\\workdir --assets-dir ..\\dist\\dashboard',
    url: 'http://127.0.0.1:4173',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      ...process.env,
      HOME: homeDir,
      USERPROFILE: homeDir,
    },
  },
});

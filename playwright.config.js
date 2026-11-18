import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './tests/browser',
  timeout: 45000,
  expect: { timeout: 10000 },
  fullyParallel: false,
  workers: 1,
  reporter: [['list'], ['json', { outputFile: 'artifacts/browser-results.json' }]],
  outputDir: 'artifacts/browser',
  use: { baseURL: process.env.TEST_BASE_URL || 'http://127.0.0.1:5173', channel: process.env.BROWSER_CHANNEL || 'msedge', headless: true, viewport: { width: 1440, height: 1000 }, screenshot: 'only-on-failure', trace: 'retain-on-failure' },
  webServer: { command: 'node server/index.js', url: 'http://127.0.0.1:5173', reuseExistingServer: true, timeout: 15000 }
});

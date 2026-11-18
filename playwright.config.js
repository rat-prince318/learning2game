import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';
const localPython = process.platform === 'win32' ? '.venv/Scripts/python.exe' : '.venv/bin/python';
const python =
  process.env.EDUGAME_TEST_PYTHON || (existsSync(localPython) ? localPython : 'python');
const baseURL = process.env.TEST_BASE_URL || 'http://127.0.0.1:5187';
export default defineConfig({
  testDir: './tests/browser',
  timeout: 60000,
  workers: 1,
  reporter: 'list',
  outputDir: 'artifacts/browser',
  use: {
    baseURL,
    channel: process.env.BROWSER_CHANNEL || (process.platform === 'win32' ? 'msedge' : undefined),
    headless: true,
    viewport: { width: 1360, height: 900 },
    screenshot: 'only-on-failure',
    trace: 'retain-on-failure',
  },
  webServer: process.env.TEST_BASE_URL
    ? undefined
    : {
        command: '"' + python + '" -m uvicorn backend.main:app --host 127.0.0.1 --port 5187',
        env: {
          EDUGAME_MODE: 'offline',
          EDUGAME_DEMO: '0',
          EDUGAME_SERVICE_FACTORY: '',
          EDUGAME_DATA_DIR: '.local/browser-test',
        },
        url: baseURL + '/health',
        reuseExistingServer: false,
        timeout: 30000,
      },
});

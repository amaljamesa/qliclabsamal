import { defineConfig, devices } from '@playwright/test';

/**
 * E2E config: drives the Angular UI in a real browser against a real Django
 * backend. Assumes the Django dev server is already running on :8000 —
 * Playwright only manages the Angular dev server (:4200).
 */
export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  retries: 0,
  reporter: [['html', { open: 'never' }], ['list']],
  use: {
    baseURL: 'http://localhost:4200',
    trace: 'on',
    screenshot: 'on',
    video: 'on'
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: {
    command: 'npx ng serve',
    url: 'http://localhost:4200',
    reuseExistingServer: true,
    timeout: 120_000
  }
});

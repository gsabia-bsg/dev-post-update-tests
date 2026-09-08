import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  fullyParallel: false,
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI
    ? [['html', { open: 'never' }], ['github']]
    : [['list']],
  use: {
    baseURL: 'https://dev.bsg.it',
    ignoreHTTPSErrors: true,
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    userAgent: 'BSG-PostUpdate-Tests (Playwright)',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'unit',
      testMatch: /tests[\\/]unit[\\/].*\.spec\.ts/,
    },
    {
      name: 'site',
      testMatch: /tests[\\/]site[\\/].*\.spec\.ts/,
      use: { ...devices['Desktop Chrome'] },
    },
  ],
});

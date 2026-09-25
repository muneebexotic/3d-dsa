import { defineConfig, devices } from '@playwright/test';

// End-to-end tests run against a production build (with test hooks switched on)
// served by `vite preview`, which sends the same security headers as Vercel.
const PORT = 4173;
const CI = !!process.env.CI;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: CI,
  retries: 0,
  // Software WebGL is multi-threaded; two browsers at once oversubscribe a 4-core CI runner and stall page loads.
  workers: CI ? 1 : undefined,
  reporter: CI ? [['github'], ['html', { open: 'never' }]] : [['list']],
  // WebGL runs in software on CI machines, at a few frames a second, so give pages time.
  timeout: 60_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
    // Set PW_CHROMIUM_EXECUTABLE to use an already-installed Chromium instead of `npx playwright install`.
    launchOptions: { executablePath: process.env.PW_CHROMIUM_EXECUTABLE || undefined },
  },
  // In CI, WebGL runs in software and every device pixel costs CPU time, so the
  // phone renders at 1 device pixel per CSS pixel. The CSS layout is unchanged.
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /phone\.spec/ },
    { name: 'phone', use: { ...devices['Pixel 7'], deviceScaleFactor: 1 }, testMatch: /(pages|phone)\.spec/ },
  ],
  webServer: {
    command: `npm run build:e2e && npm run preview:e2e -- --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: !CI,
    timeout: 180_000,
  },
});

import { defineConfig, devices } from '@playwright/test';

const PORT = 4173;

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  // No {projectName}: the svelte port is compared against the legacy baselines
  snapshotPathTemplate: '{testDir}/__screenshots__/{testFilePath}/{arg}-{platform}{ext}',
  expect: { toHaveScreenshot: { maxDiffPixelRatio: 0.01 } },
  use: {
    ...devices['Desktop Chrome'],
    viewport: { width: 1280, height: 900 },
    trace: 'retain-on-failure',
  },
  projects: [
    { name: 'legacy', use: { baseURL: `http://localhost:${PORT}/legacy/` } },
    { name: 'svelte', use: { baseURL: `http://localhost:${PORT}/svelte/` } },
  ],
  webServer: {
    command: 'node tests/e2e/serve.mjs',
    url: `http://localhost:${PORT}/legacy/tasks-dashboard.html`,
    env: { PORT: String(PORT) },
    reuseExistingServer: !process.env.CI,
  },
});

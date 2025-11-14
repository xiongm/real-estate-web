import { defineConfig, devices } from '@playwright/test';

const resolvedPort = process.env.PLAYWRIGHT_PORT ?? process.env.PORT ?? '3100';
const PORT = Number(resolvedPort);
const host = process.env.PLAYWRIGHT_BASE_URL ?? `http://127.0.0.1:${PORT}`;

export default defineConfig({
  testDir: './tests',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: host,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    video: 'retry-with-video'
  },
  webServer: {
    command: 'npm run dev',
    url: host,
    timeout: 120_000,
    reuseExistingServer: !process.env.CI,
    stdout: 'pipe',
    stderr: 'pipe',
    env: {
      ...process.env,
      PORT: PORT.toString()
    }
  },
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'firefox',
      use: { ...devices['Desktop Firefox'] }
    },
    {
      name: 'webkit',
      use: { ...devices['Desktop Safari'] }
    }
  ]
});

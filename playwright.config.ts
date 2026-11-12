import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:4317',
    // Software WebGL so the tests run on machines without a GPU.
    launchOptions: { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 800 } } },
    { name: 'tablet', use: { ...devices['Desktop Chrome'], viewport: { width: 1180, height: 820 }, hasTouch: true } },
  ],
  webServer: {
    command: 'npm run build && npx vite preview --port 4317 --strictPort',
    url: 'http://localhost:4317',
    reuseExistingServer: true,
    timeout: 120_000,
  },
});

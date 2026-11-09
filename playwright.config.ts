import { defineConfig, devices } from '@playwright/test';

// 本番ビルド（vite preview）に対して、iPhone と Pixel のエミュレーションで E2E を行う（SPEC §9）
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['list'], ['html', { open: 'never' }]] : 'list',
  use: {
    baseURL: `http://localhost:${PORT}/biyoushi-kakomon/`,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    { name: 'iPhone', use: { ...devices['iPhone 15'] } },
    { name: 'Pixel', use: { ...devices['Pixel 7'] } },
  ],
  webServer: {
    command: 'npm run build && npm run preview',
    url: `http://localhost:${PORT}/biyoushi-kakomon/`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
});

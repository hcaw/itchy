import { defineConfig, devices } from '@playwright/test';

// End-to-end checks against the production build (`vite preview`), in Chromium and WebKit, with a
// mouse and with touch. Locally, PW_CHROMIUM_PATH can point at a Chromium that is already installed.
const chromium = process.env['PW_CHROMIUM_PATH'] ? { executablePath: process.env['PW_CHROMIUM_PATH'] } : {};
const audio = ['--autoplay-policy=no-user-gesture-required'];

export default defineConfig({
  testDir: 'tests/e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 1 : 0,
  reporter: process.env['CI'] ? 'github' : 'list',
  use: { baseURL: 'http://localhost:4173', trace: 'off' },
  webServer: {
    command: 'npm run build && npm run preview -- --port 4173 --strictPort',
    url: 'http://localhost:4173',
    reuseExistingServer: !process.env['CI'],
    timeout: 120_000,
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'], launchOptions: { ...chromium, args: audio } } },
    { name: 'chromium-touch', use: { ...devices['Pixel 7'], launchOptions: { ...chromium, args: audio } } },
    { name: 'webkit', use: { ...devices['Desktop Safari'] } },
    { name: 'webkit-ipad', use: { ...devices['iPad (gen 7) landscape'] } },
  ],
});

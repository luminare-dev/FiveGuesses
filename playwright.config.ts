import { defineConfig } from '@playwright/test';
import { existsSync } from 'node:fs';

// Outside CI, a Chromium at PW_CHROMIUM_PATH (default /opt/pw-browsers/chromium) is used when that
// file exists; otherwise, and in CI, the build that `npx playwright install chromium` installs for
// the pinned @playwright/test.
const localChromium = process.env.PW_CHROMIUM_PATH ?? '/opt/pw-browsers/chromium';

export default defineConfig({
  testDir: 'e2e',
  timeout: 45_000,
  expect: { timeout: 10_000 },
  retries: 0,
  workers: 2,
  reporter: process.env.CI ? [['github'], ['list']] : [['list']],
  use: {
    baseURL: 'http://127.0.0.1:4173',
    timezoneId: 'Europe/Vienna',
    locale: 'en-GB',
    viewport: { width: 390, height: 844 },
    permissions: ['clipboard-read', 'clipboard-write'],
    launchOptions:
      !process.env.CI && existsSync(localChromium)
        ? { executablePath: localChromium, args: ['--autoplay-policy=no-user-gesture-required'] }
        : { args: ['--autoplay-policy=no-user-gesture-required'] },
    trace: 'retain-on-failure',
  },
  webServer: {
    command: 'python3 -m http.server 4173 --bind 127.0.0.1 --directory web-build',
    url: 'http://127.0.0.1:4173/index.html',
    reuseExistingServer: !process.env.CI,
    timeout: 30_000,
  },
});

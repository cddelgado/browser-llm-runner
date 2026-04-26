const { defineConfig } = require('@playwright/test');

function normalizeBasePath(value = '/') {
  const trimmed = String(value || '/').trim();
  if (!trimmed || trimmed === '/') {
    return '/';
  }
  return `/${trimmed.replace(/^\/+|\/+$/g, '')}/`;
}

const basePath = normalizeBasePath(process.env.PLAYWRIGHT_BASE_PATH || '/');
const previewPort = Number(process.env.PLAYWRIGHT_PORT || '4173');
const baseURL = `http://127.0.0.1:${previewPort}${basePath === '/' ? '/' : basePath}`;

module.exports = defineConfig({
  testDir: './tests/e2e',
  timeout: 45000,
  expect: {
    timeout: 10000,
  },
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  use: {
    baseURL,
    trace: 'retain-on-failure',
    serviceWorkers: 'block',
  },
  projects: [
    {
      name: 'desktop-chromium',
      testIgnore: /.*mobile.*\.spec\.js/,
    },
    {
      name: 'mobile-chromium',
      testMatch: /.*mobile.*\.spec\.js/,
      use: {
        viewport: { width: 390, height: 844 },
        hasTouch: true,
        isMobile: true,
      },
    },
  ],
  webServer: {
    command: `pnpm exec vite build && node tests/e2e/helpers/serve-dist.js`,
    env: {
      ...process.env,
      VITE_BASE_PATH: basePath,
      PLAYWRIGHT_BASE_PATH: basePath,
      PLAYWRIGHT_PORT: String(previewPort),
    },
    url: baseURL,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});

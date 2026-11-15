import { defineConfig } from '@playwright/test'

const URL = 'http://localhost:4173'

/** One WebKit project at an iPhone-like 375px viewport; CI builds first, then `vite preview` serves dist. */
export default defineConfig({
  testDir: 'e2e',
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? 'github' : 'list',
  use: { baseURL: URL },
  projects: [
    {
      name: 'webkit-375',
      use: { browserName: 'webkit', viewport: { width: 375, height: 812 }, isMobile: true, hasTouch: true, deviceScaleFactor: 3 },
    },
  ],
  webServer: { command: 'npx vite preview --port 4173 --strictPort', url: URL, reuseExistingServer: !process.env.CI },
})

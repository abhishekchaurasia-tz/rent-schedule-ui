import { defineConfig, devices } from '@playwright/test';

const UI_BASE_URL = process.env['UI_BASE_URL'] ?? 'http://localhost:4300';
const API_BASE_URL = process.env['API_BASE_URL'] ?? 'http://localhost:5169';

export default defineConfig({
  testDir: './e2e',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  reporter: 'html',
  // Headed runs open real browser windows — one worker keeps them from stacking on top of
  // each other so you can actually watch each test play out.
  workers: process.env['PW_HEADLESS'] === '1' ? undefined : 1,
  projects: [
    {
      name: 'ui',
      testDir: './e2e/ui',
      use: {
        ...devices['Desktop Chrome'],
        baseURL: UI_BASE_URL,
        trace: 'on-first-retry',
        // Captures a PNG of the page at the moment a UI test fails — dropped alongside the trace
        // under test-results/<test>/test-failed-1.png and embedded in the HTML report.
        screenshot: 'only-on-failure',
        // Local app under test — run headed by default so interactions are visible; set
        // PW_HEADLESS=1 to fall back to headless (e.g. in CI).
        headless: process.env['PW_HEADLESS'] === '1',
        launchOptions: {
          slowMo: process.env['PW_HEADLESS'] === '1' ? 0 : 300
        }
      }
    },
    {
      name: 'api',
      testDir: './e2e/api',
      use: {
        baseURL: API_BASE_URL
      }
    }
  ],
  webServer: {
    command: 'npx ng serve --port 4300',
    url: UI_BASE_URL,
    reuseExistingServer: true,
    timeout: 120_000
  }
});

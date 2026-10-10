import { defineConfig, devices } from "@playwright/test";

const PORT = Number(process.env.E2E_PORT ?? 3100);
const live = process.env.E2E_LIVE === "1";

export default defineConfig({
  testDir: "e2e",
  testIgnore: live ? undefined : ["live.spec.ts"],
  // Generous: a cold `next dev` compiles each route on first hit.
  timeout: 90_000,
  fullyParallel: false,
  workers: 1,
  retries: process.env.CI ? 1 : 0,
  use: { baseURL: `http://localhost:${PORT}`, trace: "retain-on-failure" },
  projects: [
    { name: "chromium", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
  ],
  webServer: {
    // CI tests the production build (fast, realistic); locally, dev mode for quick iteration.
    command: process.env.CI ? `npx next build && npx next start -p ${PORT}` : `npx next dev -p ${PORT}`,
    port: PORT,
    reuseExistingServer: !process.env.CI,
    timeout: 300_000,
    env: { NEXT_PUBLIC_API_MODE: live ? "live" : "mock" },
  },
});

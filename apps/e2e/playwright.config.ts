import { defineConfig, devices } from "@playwright/test";

// A port of its own, so the scenario never reuses a `mise run dev` server (with demo data)
// and always starts from an empty in-memory store.
const PORT = 3100;
const isCI = Boolean(process.env.CI);
// Set it to run the scenario against an already running service, e.g. the deployed one:
// E2E_BASE_URL=https://example.onrender.com mise run e2e
const externalBaseUrl = process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./tests",
  fullyParallel: false,
  workers: 1,
  forbidOnly: isCI,
  retries: 0,
  reporter: isCI ? [["list"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: externalBaseUrl ?? `http://127.0.0.1:${PORT}`,
    locale: "ru-RU",
    // Not the owner's Europe/Moscow, so the scenario also checks the time zone conversion.
    timezoneId: "Asia/Yekaterinburg",
    trace: "retain-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  // The production process, as in the Docker image: one server for the API and the built pages,
  // started without --demo-data.
  webServer: externalBaseUrl
    ? undefined
    : {
        command: "pnpm --filter @calls-booking/web exec vite build && node ../api/src/server.ts",
        env: { PORT: String(PORT), WEB_ROOT: "../web/dist" },
        url: `http://127.0.0.1:${PORT}/api/health`,
        reuseExistingServer: false,
        timeout: 120_000,
      },
});

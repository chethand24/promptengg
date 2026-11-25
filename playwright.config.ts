import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  outputDir: "test-results/playwright",
  fullyParallel: false,
  workers: 1,
  timeout: 45_000,
  reporter: "list",
  use: {
    ...devices["Desktop Chrome"],
    channel: process.env.PLAYWRIGHT_CHROMIUM_CHANNEL || (process.platform === "win32" ? "chrome" : undefined),
    baseURL: "http://127.0.0.1:4310",
    trace: "retain-on-failure",
  },
  webServer: {
    command: "node node_modules/next/dist/bin/next start --hostname 127.0.0.1 --port 4310",
    url: "http://127.0.0.1:4310",
    reuseExistingServer: false,
    timeout: 60_000,
    env: {
      OPENAI_API_KEY: "",
      NEXT_TELEMETRY_DISABLED: "1",
      STEPWISE_SESSION_KEY: Buffer.alloc(32, 17).toString("base64url"),
      STEPWISE_TRUST_PROXY: "1",
    },
    stderr: "pipe",
  },
});

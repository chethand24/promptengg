import { afterEach, expect, it, vi } from "vitest";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { refreshConfiguration } from "../backend/src/services/configuration.js";
import { providerStatus } from "../backend/src/services/provider.js";

const dirs: string[] = [];
afterEach(() => {
  vi.unstubAllEnvs();
  for (const dir of dirs.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
it("loads a saved key without restarting and supports clearing it", () => {
  vi.stubEnv("LLM_PROVIDER", "claude");
  vi.stubEnv("ANTHROPIC_API_KEY", "");
  vi.stubEnv("LLM_MODEL", "test-model");
  vi.stubEnv("PORT", "3001");
  const dir = mkdtempSync(join(tmpdir(), "stepwise-config-"));
  dirs.push(dir);
  const file = join(dir, ".env");
  writeFileSync(file, "ANTHROPIC_API_KEY=test-only-placeholder\nPORT=9999\n");
  refreshConfiguration(file);
  expect(providerStatus().customCodeReady).toBe(true);
  expect(process.env.PORT).toBe("3001");
  expect(JSON.stringify(providerStatus())).not.toContain(
    "test-only-placeholder",
  );
  writeFileSync(file, "ANTHROPIC_API_KEY=\n");
  refreshConfiguration(file);
  expect(providerStatus().customCodeReady).toBe(false);
});
it("preserves environment-based configuration when no file exists", () => {
  vi.stubEnv("LLM_PROVIDER", "claude");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-placeholder");
  const dir = mkdtempSync(join(tmpdir(), "stepwise-config-"));
  dirs.push(dir);
  refreshConfiguration(join(dir, "missing.env"));
  expect(process.env.ANTHROPIC_API_KEY).toBe("test-only-placeholder");
});

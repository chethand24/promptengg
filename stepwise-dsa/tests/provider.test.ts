import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import { examples } from "../shared/examples.js";
import { inputSchema, type Input } from "../shared/schema.js";
import {
  providerFor,
  providerStatus,
} from "../backend/src/services/provider.js";
import { call } from "../backend/src/services/llm.js";

const { create } = vi.hoisted(() => ({ create: vi.fn() }));
vi.mock("@anthropic-ai/sdk", () => ({
  default: class {
    messages = { create };
  },
}));
const base: Input = {
  problem: examples[0].problem,
  code: examples[0].code,
  language: "python",
  level: "Beginner",
  mode: "Full Breakdown",
};
beforeEach(() => {
  vi.stubEnv("MOCK_LLM", "true");
  vi.stubEnv("LLM_PROVIDER", "claude");
  vi.stubEnv("ANTHROPIC_API_KEY", "test-only-placeholder");
  vi.stubEnv("LLM_MODEL", "test-model");
  create.mockReset();
  create.mockResolvedValue({
    content: [{ type: "text", text: '{"answer":"custom result"}' }],
  });
});
afterEach(() => vi.unstubAllEnvs());
describe("custom code provider routing", () => {
  it("keeps exact demo fixtures offline", () =>
    expect(providerFor(base)).toBe("mock"));
  it("routes edited code and edited problems to Claude", () => {
    expect(providerFor({ ...base, code: base.code + "\n# revised" })).toBe(
      "claude",
    );
    expect(
      providerFor({ ...base, problem: "A different problem statement" }),
    ).toBe("claude");
  });
  it.each([
    ["java", "class Solution { public int solve(int x) { return x + 1; } }"],
    ["cpp", "int solve(int x) { return x + 1; }"],
    ["javascript", "const solve = x => x + 1;"],
    ["python", "def solve(x):\n    return x + 1"],
  ] as const)(
    "sends custom %s to the live adapter even with demos enabled",
    async (language, code) => {
      const input = inputSchema.parse({ ...base, language, code });
      const result = await call("stage0", z.object({ answer: z.string() }), {
        input,
      });
      expect(result.answer).toBe("custom result");
      expect(create).toHaveBeenCalledOnce();
      expect(create.mock.calls[0][0].messages[0].content).toContain(
        JSON.stringify(code).slice(1, -1),
      );
    },
  );
  it("reports configuration accurately and never sends a request without a key", async () => {
    vi.stubEnv("LLM_PROVIDER", "claude");
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    expect(providerStatus().customCodeReady).toBe(false);
    expect(JSON.stringify(providerStatus())).not.toContain("ANTHROPIC_API_KEY");
    await expect(
      call("stage0", z.object({ answer: z.string() }), {
        input: { ...base, code: "print(42)" },
      }),
    ).rejects.toThrow("add ANTHROPIC_API_KEY");
    expect(create).not.toHaveBeenCalled();
  });
  it("preserves the provider of an existing guided session", async () => {
    vi.stubEnv("MOCK_LLM", "false");
    const result = await call("hint", z.object({ hint: z.string() }), {
      input: base,
      provider: "mock",
      step: {
        answer: "reference",
        explanation: "explanation",
        hints: ["clue", "stronger clue"],
      },
      level: 1,
    });
    expect(result.hint).toBe("clue");
    expect(create).not.toHaveBeenCalled();
  });
  it.each(["print(1)", "x = 42", "solve();"])(
    "accepts short code: %s",
    (code) => {
      expect(inputSchema.safeParse({ ...base, code }).success).toBe(true);
    },
  );
});

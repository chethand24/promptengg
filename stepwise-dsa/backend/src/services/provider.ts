import { examples } from "../../../shared/examples.js";
import type { Input } from "../../../shared/schema.js";

export function isDemo(input: Input): boolean {
  return (
    input.language === "python" &&
    examples.some(
      (example) =>
        example.code.trim() === input.code.trim() &&
        example.problem === input.problem,
    )
  );
}

export type ProviderName = "gemini" | "claude" | "openrouter";

export function configuredProvider(): ProviderName {
  const value = process.env.LLM_PROVIDER ?? "gemini";
  if (value !== "gemini" && value !== "claude" && value !== "openrouter")
    throw new Error("LLM_PROVIDER must be gemini, openrouter, or claude.");
  return value;
}
export function providerFor(input: Input): "mock" | ProviderName {
  // The demo toggle only controls authored examples, never custom submissions.
  return process.env.MOCK_LLM !== "false" && isDemo(input)
    ? "mock"
    : configuredProvider();
}

export function providerStatus() {
  const provider = configuredProvider();
  const key =
    provider === "gemini"
      ? process.env.GEMINI_API_KEY?.trim()
      : provider === "openrouter"
        ? process.env.OPENROUTER_API_KEY?.trim()
        : process.env.ANTHROPIC_API_KEY?.trim();
  return {
    provider,
    customCodeReady: Boolean(key && process.env.LLM_MODEL?.trim()),
    demoAvailable: process.env.MOCK_LLM !== "false",
    languages: ["python", "java", "cpp", "javascript"] as const,
  };
}

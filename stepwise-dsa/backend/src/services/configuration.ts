import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { parse } from "dotenv";

// Refresh only provider settings. Never return or log configuration values.
export function refreshConfiguration(path = resolve(".env")): void {
  let values: Record<string, string>;
  try {
    values = parse(readFileSync(path));
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return;
    throw new Error("Unable to read the server configuration file.");
  }
  for (const name of [
    "ANTHROPIC_API_KEY",
    "GEMINI_API_KEY",
    "OPENROUTER_API_KEY",
    "LLM_PROVIDER",
    "LLM_MODEL",
    "MOCK_LLM",
  ]) {
    if (Object.hasOwn(values, name)) process.env[name] = values[name].trim();
  }
}

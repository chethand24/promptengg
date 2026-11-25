import Anthropic from "@anthropic-ai/sdk";
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { z } from "zod";
import { mock } from "./mock.js";
import { providerFor, configuredProvider } from "./provider.js";
import { generateGemini } from "./gemini.js";
import { generateOpenRouter } from "./openrouter.js";
import type { Input } from "../../../shared/schema.js";
export const outputBudgets: Record<string, number> = {
  stage0: 2048,
  stage1: 3072,
  stage2: 2048,
  stage3: 10000,
  hint: 768,
  evaluation: 1024,
  remedial: 2048,
};
export type Call = <T>(
  name: string,
  schema: z.ZodType<T>,
  context: Record<string, unknown>,
) => Promise<T>;
export async function validatedJSON<T>(
  schema: z.ZodType<T>,
  generate: (repair: string) => Promise<string>,
): Promise<T> {
  let repair = "";
  for (let attempt = 0; attempt < 3; attempt++) {
    const raw = await generate(repair);
    try {
      return schema.parse(JSON.parse(raw));
    } catch (error) {
      const template = await readFile(
        resolve("backend/src/prompts/repair.v1.txt"),
        "utf8",
      );
      repair =
        "\n" +
        template.replace(
          "{{errors}}",
          String(error).slice(0, 2500).replaceAll("<", "\\u003c"),
        );
    }
  }
  throw new Error(
    "The tutor returned invalid JSON after two repair attempts. Please retry.",
  );
}
export const call: Call = async (name, schema, context) => {
  const provider = context.provider ?? providerFor(context.input as Input);
  if (provider === "mock") return schema.parse(mock(name, context));
  if (provider !== configuredProvider())
    throw new Error(
      "This session uses a different AI provider. Start a new analysis with the selected provider; no paid fallback was used.",
    );
  if (
    provider === "claude" &&
    (!process.env.ANTHROPIC_API_KEY?.trim() || !process.env.LLM_MODEL?.trim())
  )
    throw new Error(
      "Custom code is supported in Python, Java, C++, and JavaScript. To enable its AI analysis, add ANTHROPIC_API_KEY and LLM_MODEL to stepwise-dsa/.env, then click Check connection. Your code has been kept in the editor.",
    );
  const template = await readFile(
    resolve("backend/src/prompts", `${name}.v1.txt`),
    "utf8",
  );
  const prompt = template
    .replace(
      "{{level}}",
      String((context.input as { level?: string })?.level ?? "Beginner"),
    )
    .replace("{{context}}", JSON.stringify(context).replaceAll("<", "\\u003c"))
    .replace("{{schema}}", JSON.stringify(z.toJSONSchema(schema)));
  if (provider === "gemini")
    return validatedJSON(schema, (repair) =>
      generateGemini(prompt + repair, undefined, outputBudgets[name] ?? 4096),
    );
  if (provider === "openrouter")
    return validatedJSON(schema, (repair) =>
      generateOpenRouter(
        prompt + repair,
        undefined,
        outputBudgets[name] ?? 4096,
      ),
    );
  const client = new Anthropic({ timeout: 90000, maxRetries: 1 });
  return validatedJSON(schema, async (repair) => {
    const response = await client.messages.create({
      model: process.env.LLM_MODEL!,
      max_tokens: 12000,
      messages: [{ role: "user", content: prompt + repair }],
    });
    return response.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");
  });
};

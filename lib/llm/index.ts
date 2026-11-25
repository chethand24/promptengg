import type { ZodType } from "zod";
export { MockProvider } from "./mock";

interface Provider {
  complete(prompt: string, input: unknown): Promise<string>;
}

export class OpenAIProvider implements Provider {
  constructor(private key: string, private model: string) {}

  async complete(prompt: string, input: unknown) {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: { Authorization: "Bearer " + this.key, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: this.model, temperature: 0.2, response_format: { type: "json_object" },
        messages: [{ role: "system", content: prompt }, { role: "user", content: JSON.stringify(input) }],
      }),
      signal: AbortSignal.timeout(18000),
    });
    if (!response.ok) throw new Error("Model request failed");
    const data = await response.json();
    return data.choices?.[0]?.message?.content ?? "";
  }
}

export async function modelOutput<T>(schema: ZodType<T>, prompt: string, input: unknown): Promise<T | undefined> {
  const key = process.env.OPENAI_API_KEY?.trim();
  if (!key) return;
  const provider = new OpenAIProvider(key, process.env.LLM_MODEL?.trim() || "gpt-4o-mini");
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const instruction = attempt === 0 ? prompt : prompt + " The previous response was invalid. Follow the JSON schema exactly.";
      const output = await provider.complete(instruction, input);
      const fenced = output.trim().match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
      const parsed = schema.safeParse(JSON.parse(fenced?.[1] ?? output));
      if (parsed.success) return parsed.data;
    } catch {
      // The caller uses a safe fallback if both requests fail.
    }
  }
}


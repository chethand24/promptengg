import { z } from "zod";

const responseSchema = z.object({
  choices: z
    .array(
      z.object({
        finish_reason: z.string().nullable().optional(),
        message: z
          .object({
            content: z.string().nullable().optional(),
          })
          .optional(),
      }),
    )
    .optional(),
});

export async function generateOpenRouter(
  prompt: string,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxOutputTokens = 4096,
): Promise<string> {
  // Free-tier reasoning models (Nemotron, Ernie, etc.) consume most of the
  // token budget on internal chain-of-thought.  Multiply the caller's content
  // budget so the visible JSON still fits after reasoning overhead.
  const tokenBudget = Math.min(maxOutputTokens * 5, 16384);
  const key = process.env.OPENROUTER_API_KEY?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!key || !model)
    throw new Error(
      "Add OPENROUTER_API_KEY and LLM_MODEL to stepwise-dsa/.env, then click Check connection.",
    );

  let response: Response | undefined;
  const deadline = Date.now() + 180000;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch("https://openrouter.ai/api/v1/chat/completions", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${key}`,
          "HTTP-Referer": process.env.CORS_ORIGIN ?? "http://localhost:5173",
          "X-Title": "StepWise Tutor DSA",
        },
        body: JSON.stringify({
          model,
          response_format: { type: "json_object" },
          max_tokens: tokenBudget,
          messages: [{ role: "user", content: prompt }],
        }),
        signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
        redirect: "error",
      });
    } catch {
      throw new Error(
        "Could not reach OpenRouter or the request timed out. Please retry later.",
      );
    }
    if (![502, 503, 504].includes(response.status) || attempt === 2) break;
    const header = response.headers.get("retry-after");
    const seconds = header === null ? NaN : Number(header);
    const requested = Number.isFinite(seconds)
      ? seconds * 1000
      : header
        ? Date.parse(header) - Date.now()
        : 0;
    const delay = Math.max(
      1000 * 2 ** attempt,
      Number.isFinite(requested) ? requested : 0,
    );
    // Long outages are left to the user, never retried indefinitely.
    if (delay > 10000 || Date.now() + delay >= deadline) break;
    await response.body?.cancel();
    await wait(delay);
  }

  if (!response)
    throw new Error("OpenRouter did not return a response. Please retry later.");

  // Do not expose raw provider errors, request headers, or credentials.
  if (!response.ok) {
    if (response.status === 429)
      throw new Error(
        "OpenRouter rate limit or free-tier quota was reached. Wait and retry later.",
      );
    if ([400, 401, 402, 403].includes(response.status))
      throw new Error(
        "OpenRouter rejected the request. Check your OPENROUTER_API_KEY and selected LLM_MODEL.",
      );
    if (response.status === 404)
      throw new Error(
        "The selected OpenRouter model is unavailable. Set LLM_MODEL to an available free model such as openrouter/free.",
      );
    if ([502, 503, 504].includes(response.status))
      throw new Error(
        "OpenRouter is temporarily unavailable after bounded retries. Please try again shortly.",
      );
    throw new Error(
      `OpenRouter is unavailable (HTTP ${response.status}). Please retry later.`,
    );
  }

  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new Error("OpenRouter returned an unexpected response. Please retry.");

  const choice = parsed.data.choices?.[0];
  if (!choice)
    throw new Error(
      "OpenRouter returned no response. Please retry.",
    );
  // Accept "stop", "end_turn", and "length" — the caller's Zod validation
  // will reject truly truncated JSON.  Only block clearly failed reasons.
  const blocked = ["content_filter", "error", "tool_calls"];
  if (choice.finish_reason && blocked.includes(choice.finish_reason))
    throw new Error(
      "OpenRouter could not complete the response (blocked by content filter). Try rephrasing the problem.",
    );

  const raw = choice.message?.content?.trim() ?? "";
  const fenced = raw.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  const text = (fenced?.[1] ?? raw).trim();
  if (!text)
    throw new Error(
      "OpenRouter returned no explanation. Please retry with a smaller problem.",
    );
  return text;
}


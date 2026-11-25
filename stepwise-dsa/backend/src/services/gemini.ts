import { z } from "zod";

const responseSchema = z.object({
  candidates: z
    .array(
      z.object({
        finishReason: z.string().optional(),
        content: z
          .object({
            parts: z.array(
              z.object({
                text: z.string().optional(),
                thought: z.boolean().optional(),
              }),
            ),
          })
          .optional(),
      }),
    )
    .optional(),
});

export async function generateGemini(
  prompt: string,
  wait: (milliseconds: number) => Promise<void> = (milliseconds) =>
    new Promise((resolve) => setTimeout(resolve, milliseconds)),
  maxOutputTokens = 4096,
): Promise<string> {
  const key = process.env.GEMINI_API_KEY?.trim();
  const model = process.env.LLM_MODEL?.trim();
  if (!key || !model)
    throw new Error(
      "Add GEMINI_API_KEY from Google AI Studio to stepwise-dsa/.env, then click Check connection. Use a project on the Free tier without enabling billing.",
    );
  let response: Response | undefined;
  const deadline = Date.now() + 90000;
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "x-goog-api-key": key,
          },
          body: JSON.stringify({
            contents: [{ role: "user", parts: [{ text: prompt }] }],
            generationConfig: {
              responseMimeType: "application/json",
              maxOutputTokens,
            },
          }),
          signal: AbortSignal.timeout(Math.max(1, deadline - Date.now())),
          redirect: "error",
        },
      );
    } catch {
      throw new Error(
        "Could not reach Gemini or the request timed out. Please retry later.",
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
    throw new Error("Gemini did not return a response. Please retry later.");
  // Do not expose raw provider errors, request headers, or credentials.
  if (!response.ok) {
    if (response.status === 429)
      throw new Error(
        "Gemini's free-tier quota or rate limit was reached. Wait and retry later. No paid provider was used; check your quota in Google AI Studio.",
      );
    if ([400, 401, 403].includes(response.status))
      throw new Error(
        "Gemini rejected the request. Check your GEMINI_API_KEY, project eligibility, and selected model in Google AI Studio. No paid fallback was used.",
      );
    if (response.status === 404)
      throw new Error(
        "The selected Gemini model is unavailable. Set LLM_MODEL to a supported free-tier model.",
      );
    if ([502, 503, 504].includes(response.status))
      throw new Error(
        "Gemini is temporarily unavailable after bounded retries. Please try again in a few minutes. Your code is still in the editor; no provider or billing settings were changed.",
      );
    throw new Error(
      `Gemini is unavailable (HTTP ${response.status}). Please retry later. No paid fallback was used.`,
    );
  }
  const parsed = responseSchema.safeParse(await response.json());
  if (!parsed.success)
    throw new Error("Gemini returned an unexpected response. Please retry.");
  const candidate = parsed.data.candidates?.[0];
  if (
    !candidate ||
    (candidate.finishReason && candidate.finishReason !== "STOP")
  )
    throw new Error(
      "Gemini could not complete the response (blocked or output limit reached). Try a smaller problem.",
    );
  const text = candidate.content?.parts
    .filter((p) => !p.thought)
    .map((p) => p.text ?? "")
    .join("");
  if (!text)
    throw new Error(
      "Gemini returned no explanation. Please retry with a smaller problem.",
    );
  return text;
}

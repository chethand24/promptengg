import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { z } from "zod";
import { call } from "../backend/src/services/llm.js";
import {
  providerFor,
  providerStatus,
} from "../backend/src/services/provider.js";
import { generateGemini } from "../backend/src/services/gemini.js";
import { inputSchema } from "../shared/schema.js";

const fetchMock = vi.fn();
const input = inputSchema.parse({
  problem: "Return the square of the input integer.",
  code: "def square(x):\n    return x*x",
  language: "python",
  level: "Beginner",
  mode: "Full Breakdown",
});
const response = (text: string) =>
  new Response(
    JSON.stringify({
      candidates: [{ finishReason: "STOP", content: { parts: [{ text }] } }],
    }),
  );
beforeEach(() => {
  vi.stubEnv("LLM_PROVIDER", "gemini");
  vi.stubEnv("GEMINI_API_KEY", "test-secret-not-real");
  vi.stubEnv("LLM_MODEL", "test-model");
  vi.stubEnv("ANTHROPIC_API_KEY", "unused-test-key");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});
afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});
it("routes custom code through Gemini and validates repaired JSON", async () => {
  expect(providerFor(input)).toBe("gemini");
  fetchMock
    .mockResolvedValueOnce(response("bad JSON"))
    .mockResolvedValueOnce(response('{"answer":"square"}'));
  expect(
    await call("stage0", z.object({ answer: z.string() }), { input }),
  ).toEqual({ answer: "square" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe(
    "https://generativelanguage.googleapis.com/v1beta/models/test-model:generateContent",
  );
  expect(url).not.toContain("test-secret");
  expect(request.headers["x-goog-api-key"]).toBe("test-secret-not-real");
  expect(JSON.parse(request.body).generationConfig.responseMimeType).toBe(
    "application/json",
  );
  expect(JSON.parse(request.body).generationConfig.maxOutputTokens).toBe(2048);
});
it("does not use Anthropic when the Gemini key is missing", async () => {
  vi.stubEnv("GEMINI_API_KEY", "");
  expect(providerStatus().customCodeReady).toBe(false);
  await expect(
    call("stage0", z.object({ answer: z.string() }), { input }),
  ).rejects.toThrow("GEMINI_API_KEY");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("blocks resumed Claude sessions when Gemini is selected", async () => {
  await expect(
    call("hint", z.object({ hint: z.string() }), { input, provider: "claude" }),
  ).rejects.toThrow("different AI provider");
  expect(fetchMock).not.toHaveBeenCalled();
});
it("stops at free-tier rate limits without retry or paid fallback", async () => {
  fetchMock.mockResolvedValue(
    new Response("private provider details", { status: 429 }),
  );
  await expect(
    call("stage0", z.object({ answer: z.string() }), { input }),
  ).rejects.toThrow("free-tier quota");
  expect(fetchMock).toHaveBeenCalledOnce();
});
it.each([401, 403, 404, 500])(
  "returns safe errors for HTTP %i",
  async (status) => {
    fetchMock.mockResolvedValue(
      new Response("test-secret-not-real", { status }),
    );
    const error = await generateGemini("hello").catch((e) => e);
    expect(error).toBeInstanceOf(Error);
    expect(error.message).not.toContain("test-secret-not-real");
  },
);
it("rejects truncated answers", async () => {
  fetchMock.mockResolvedValue(
    new Response(
      JSON.stringify({
        candidates: [
          {
            finishReason: "MAX_TOKENS",
            content: { parts: [{ text: '{"answer":' }] },
          },
        ],
      }),
    ),
  );
  await expect(generateGemini("hello")).rejects.toThrow("output limit");
});

it("recovers from temporary 503 failures on the same model", async () => {
  const wait = vi.fn().mockResolvedValue(undefined);
  fetchMock
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
    .mockResolvedValueOnce(response('{"answer":"ok"}'));
  expect(await generateGemini("hello", wait)).toBe('{"answer":"ok"}');
  expect(wait.mock.calls).toEqual([[1000], [2000]]);
  expect(new Set(fetchMock.mock.calls.map((c) => c[0])).size).toBe(1);
});
it("stops after three requests during a continuing outage", async () => {
  fetchMock.mockImplementation(
    async () => new Response("unavailable", { status: 503 }),
  );
  const wait = vi.fn().mockResolvedValue(undefined);
  await expect(generateGemini("hello", wait)).rejects.toThrow(
    "temporarily unavailable",
  );
  expect(fetchMock).toHaveBeenCalledTimes(3);
  expect(wait).toHaveBeenCalledTimes(2);
});
it("honors short Retry-After values and avoids retrying long outages", async () => {
  const wait = vi.fn().mockResolvedValue(undefined);
  fetchMock
    .mockResolvedValueOnce(
      new Response("unavailable", {
        status: 503,
        headers: { "Retry-After": "4" },
      }),
    )
    .mockResolvedValueOnce(response("{}"));
  await generateGemini("hello", wait);
  expect(wait).toHaveBeenCalledWith(4000);
  fetchMock.mockReset().mockResolvedValue(
    new Response("unavailable", {
      status: 503,
      headers: { "Retry-After": "120" },
    }),
  );
  await expect(generateGemini("hello", wait)).rejects.toThrow(
    "temporarily unavailable",
  );
  expect(fetchMock).toHaveBeenCalledOnce();
});

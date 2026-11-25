import { beforeEach, afterEach, it, expect, vi } from "vitest";
import { z } from "zod";
import { call } from "../backend/src/services/llm.js";
import {
  providerFor,
  providerStatus,
} from "../backend/src/services/provider.js";
import { generateOpenRouter } from "../backend/src/services/openrouter.js";
import { inputSchema } from "../shared/schema.js";

const fetchMock = vi.fn();
const input = inputSchema.parse({
  problem: "Return the square of the input integer.",
  code: "def square(x):\n    return x*x",
  language: "python",
  level: "Beginner",
  mode: "Full Breakdown",
});
const response = (content: string, finishReason = "stop") =>
  new Response(
    JSON.stringify({
      choices: [{ finish_reason: finishReason, message: { content } }],
    }),
  );

beforeEach(() => {
  vi.stubEnv("LLM_PROVIDER", "openrouter");
  vi.stubEnv("OPENROUTER_API_KEY", "test-or-secret-not-real");
  vi.stubEnv("LLM_MODEL", "openrouter/free");
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
});

it("routes custom code through OpenRouter and strips fenced repaired JSON", async () => {
  expect(providerFor(input)).toBe("openrouter");
  fetchMock
    .mockResolvedValueOnce(response("bad JSON"))
    .mockResolvedValueOnce(response('```json\n{"answer":"square"}\n```'));
  expect(
    await call("stage0", z.object({ answer: z.string() }), { input }),
  ).toEqual({ answer: "square" });
  expect(fetchMock).toHaveBeenCalledTimes(2);
  const [url, request] = fetchMock.mock.calls[0];
  expect(url).toBe("https://openrouter.ai/api/v1/chat/completions");
  expect(request.headers.Authorization).toBe("Bearer test-or-secret-not-real");
  expect(JSON.parse(request.body).response_format).toEqual({
    type: "json_object",
  });
});

it("reports missing OpenRouter key without calling fetch", async () => {
  vi.stubEnv("OPENROUTER_API_KEY", "");
  expect(providerStatus().customCodeReady).toBe(false);
  await expect(
    call("stage0", z.object({ answer: z.string() }), { input }),
  ).rejects.toThrow("OPENROUTER_API_KEY");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("blocks resumed sessions from a different provider", async () => {
  await expect(
    call("hint", z.object({ hint: z.string() }), { input, provider: "gemini" }),
  ).rejects.toThrow("different AI provider");
  expect(fetchMock).not.toHaveBeenCalled();
});

it("stops on HTTP 429 and masks raw secret in error paths", async () => {
  fetchMock.mockResolvedValue(
    new Response("test-or-secret-not-real", { status: 429 }),
  );
  const error = await call("stage0", z.object({ answer: z.string() }), {
    input,
  }).catch((e) => e);
  expect(error).toBeInstanceOf(Error);
  expect(error.message).toContain("rate limit");
  expect(error.message).not.toContain("test-or-secret-not-real");
  expect(fetchMock).toHaveBeenCalledOnce();
});

it("rejects truncated responses", async () => {
  fetchMock.mockResolvedValue(response('{"answer":', "length"));
  await expect(generateOpenRouter("hello")).rejects.toThrow("output limit");
});

it("retries temporary 503 failures and honors short Retry-After", async () => {
  const wait = vi.fn().mockResolvedValue(undefined);
  fetchMock
    .mockResolvedValueOnce(
      new Response("unavailable", {
        status: 503,
        headers: { "Retry-After": "2" },
      }),
    )
    .mockResolvedValueOnce(response('{"answer":"ok"}'));
  expect(await generateOpenRouter("hello", wait)).toBe('{"answer":"ok"}');
  expect(wait).toHaveBeenCalledWith(2000);
});


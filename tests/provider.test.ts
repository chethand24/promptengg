import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { modelOutput } from "@/lib/llm";
import { HINT } from "@/lib/prompts";
import { textSchema } from "@/lib/schema";
import { dispatch } from "@/lib/server";

const envelope = (content: string) => Response.json({ choices: [{ message: { content } }] });
const serialized = (data: unknown) => envelope(JSON.stringify(data));
const problem = { text: "Find the missing cost after two equal payments and a fee." };
const draft = {
  title: "First task", question: "Describe which inputs matter.", concept: "Input selection",
  expectedAnswerHint: "The equal payments and the fee.", verifier: { kind: "llm", payload: "Identify payments and fee." },
};
const plan = { steps: [{ ...draft, prerequisites: [] }, { ...draft, title: "Second task", prerequisites: [0] }] };
const request = (name: string, body: object) => dispatch(new Request("http://localhost/api/" + name, {
  method: "POST", body: JSON.stringify(body),
}), name);

beforeEach(() => vi.stubEnv("OPENAI_API_KEY", "test-stub-key"));
afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });

describe("OpenAI adapter against a fetch stub", () => {
  it.each(['{"text":"Try again."}', '```json\n{"text":"Try again."}\n```'])("accepts structured content %s", async content => {
    const stub = vi.fn().mockResolvedValueOnce(envelope(content));
    vi.stubGlobal("fetch", stub);
    await expect(modelOutput(textSchema, HINT, {})).resolves.toEqual({ text: "Try again." });
    expect(stub).toHaveBeenCalledTimes(1);
    expect(stub.mock.calls[0][0]).toBe("https://api.openai.com/v1/chat/completions");
    const options = stub.mock.calls[0][1];
    expect(options.headers.Authorization).toBe("Bearer test-stub-key");
    expect(options.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(options.body)).toMatchObject({ response_format: { type: "json_object" }, temperature: 0.2 });
  });

  it.each(["not-json", '{"text":8}', '{"text":"ok","extra":true}', "{}"])("retries invalid output %s, then accepts valid output", async invalid => {
    const stub = vi.fn().mockResolvedValueOnce(envelope(invalid)).mockResolvedValueOnce(serialized({ text: "Look at the given quantities." }));
    vi.stubGlobal("fetch", stub);
    await expect(modelOutput(textSchema, HINT, {})).resolves.toEqual({ text: "Look at the given quantities." });
    expect(stub).toHaveBeenCalledTimes(2);
  });

  it.each([429, 500, "timeout", "malformed"] as const)("falls back after two %s failures", async failure => {
    const stub = vi.fn().mockImplementation(async () => {
      if (failure === "timeout") throw new DOMException("timeout", "TimeoutError");
      if (failure === "malformed") return envelope("{");
      return new Response(null, { status: failure });
    });
    vi.stubGlobal("fetch", stub);
    const result = await request("decompose", problem);
    expect(result.status).toBe(200);
    expect((await result.json()).session.mode).toBe("practice");
    expect(stub).toHaveBeenCalledTimes(2);
  });

  it("keeps low confidence unverified and handles accepted judgment, feedback, hint and remedial output", async () => {
    const stub = vi.fn()
      .mockResolvedValueOnce(serialized(plan))
      .mockResolvedValueOnce(serialized({ result: "correct", confidence: 0.79 }))
      .mockResolvedValueOnce(serialized({ text: "Look for the costs that repeat." }))
      .mockResolvedValueOnce(serialized({ result: "incorrect", confidence: 0.8 }))
      .mockResolvedValueOnce(serialized({ feedback: "Separate fixed and repeated inputs.", misconception: "Fixed versus repeated inputs" }))
      .mockResolvedValueOnce(serialized({ ...draft, title: "Practice inputs", verifier: { kind: "exact", payload: "pencil" } }));
    vi.stubGlobal("fetch", stub);
    const initial = await (await request("decompose", problem)).json();
    expect(initial.session.mode).toBe("ai");
    const key = { sessionId: initial.session.problem.id, stepId: initial.session.subproblems[0].id };
    let result = await (await request("check", { ...key, revision: 0, answer: "both prices" })).json();
    expect(result.session.attempts[0]).toMatchObject({ result: "uncertain", confidence: 0.79 });
    expect(result.session.trace[0].type).toBe("flagged_uncertain");
    result = await (await request("hint", { ...key, revision: 1, level: 1 })).json();
    expect(result.session.hints[0].text).toBe("Look for the costs that repeat.");
    result = await (await request("check", { ...key, revision: 2, answer: "neither" })).json();
    expect(result.session.attempts[1]).toMatchObject({ result: "incorrect", confidence: 0.8, misconception: "Fixed versus repeated inputs" });
    result = await (await request("remedial", { ...key, revision: 3 })).json();
    expect(result.session.subproblems[0]).toMatchObject({ title: "Practice inputs", type: "remedial", status: "active" });
    expect(JSON.stringify(result)).not.toMatch(/expectedAnswerHint|verifier|pencil/);
  });

  it("replaces a literal answer disclosed in an AI clue", async () => {
    const numeric = { ...draft, expectedAnswerHint: "Value is 12345.", verifier: { kind: "exact", payload: "12345" } };
    const stub = vi.fn().mockResolvedValueOnce(serialized({ steps: [{ ...numeric, prerequisites: [] }, { ...draft, prerequisites: [0] }] }))
      .mockResolvedValueOnce(serialized({ text: "The answer is 12345." }));
    vi.stubGlobal("fetch", stub);
    const { session } = await (await request("decompose", problem)).json();
    const result = await request("hint", { sessionId: session.problem.id, stepId: session.subproblems[0].id, revision: 0, level: 1 });
    expect(result.status).toBe(200);
    expect(JSON.stringify((await result.json()).session)).not.toContain("12345");
  });

  it("handles an unavailable judge, hints, and remedial provider on an active AI lesson", async () => {
    const failing = () => Promise.resolve(new Response(null, { status: 500 }));
    const stub = vi.fn(failing).mockResolvedValueOnce(serialized(plan));
    vi.stubGlobal("fetch", stub);
    const initial = await (await request("decompose", problem)).json();
    const sessionId = initial.session.problem.id;
    const key = { sessionId, stepId: initial.session.subproblems[0].id };
    const unverified = await (await request("check", { ...key, revision: 0, answer: "some costs" })).json();
    expect(unverified.session.attempts[0]).toMatchObject({ result: "uncertain", confidence: 0 });
    expect(unverified.session.subproblems[0].status).toBe("active");
    const guided = await (await request("hint", { ...key, revision: 1, level: 1 })).json();
    expect(guided.session.hints[0].text).toMatch(/identify the information/i);

    stub.mockResolvedValueOnce(serialized({ result: "incorrect", confidence: 0.93 }));
    const incorrect = await (await request("check", { ...key, revision: 2, answer: "no cost" })).json();
    expect(incorrect.session.attempts[1]).toMatchObject({ result: "incorrect", misconception: draft.concept });
    const remedial = await (await request("remedial", { ...key, revision: 3 })).json();
    expect(remedial.session.subproblems[0]).toMatchObject({ status: "active", type: "remedial" });

    const beforeResume = stub.mock.calls.length;
    expect((await request("resume", { sessionId, checkpoint: remedial.checkpoint })).status).toBe(200);
    expect(stub.mock.calls).toHaveLength(beforeResume);
  });

  it("returns a safe guided comparison when both model calls are unavailable", async () => {
    const stub = vi.fn(async () => new Response(null, { status: 429 }));
    vi.stubGlobal("fetch", stub);
    const result = await request("compare", problem);
    expect(result.status).toBe(200);
    const packet = await result.json();
    expect(packet.conventional).toBeNull();
    expect(packet.session.mode).toBe("practice");
    expect(JSON.stringify(packet.session)).not.toMatch(/verifier|expectedAnswerHint/);
    expect(stub).toHaveBeenCalledTimes(4);
  });

  it("advances a verified semantic response at exactly the confidence threshold", async () => {
    const stub = vi.fn().mockResolvedValueOnce(serialized(plan))
      .mockResolvedValueOnce(serialized({ result: "correct", confidence: 0.8 }));
    vi.stubGlobal("fetch", stub);
    const { session } = await (await request("decompose", problem)).json();
    const result = await request("check", { sessionId: session.problem.id, stepId: session.subproblems[0].id, revision: 0, answer: "The fixed fee and both equal payments." });
    expect(result.status).toBe(200);
    const graded = (await result.json()).session;
    expect(graded.attempts[0]).toMatchObject({ result: "correct", confidence: 0.8 });
    expect(graded.subproblems[1].status).toBe("active");
  });
});

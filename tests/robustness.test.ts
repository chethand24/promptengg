import { randomBytes, randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { openCheckpoint, sealCheckpoint } from "@/lib/checkpoint";
import { revealsAnswer } from "@/lib/guidance";
import { MockProvider } from "@/lib/llm/mock";
import { activityRows, summarizeActivity } from "@/lib/metrics";
import { samples } from "@/lib/samples";
import { decompositionSchema } from "@/lib/schema";
import { dispatch } from "@/lib/server";
import type { PrivateSession, Session } from "@/types";

const actions = ["decompose", "check", "continue", "remedial", "hint", "compare", "resume"] as const;
const mutationActions = ["check", "continue", "remedial", "hint", "resume"] as const;
const ip = () => randomUUID();
function request(name: string, body: string, address: string = ip()) {
  return dispatch(new Request("http://localhost/api/" + name, { method: "POST", body, headers: { "x-real-ip": address } }), name);
}
const send = (name: string, body: object, address?: string) => request(name, JSON.stringify(body), address);

beforeEach(() => {
  vi.stubEnv("STEPWISE_TRUST_PROXY", "1");
  vi.stubEnv("OPENAI_API_KEY", "");
});
afterEach(() => vi.unstubAllEnvs());

describe("route contracts", () => {
  it.each(actions)("%s rejects missing fields, unknown fields, malformed JSON and a large raw body", async action => {
    expect((await request(action, "{")).status).toBe(400);
    expect((await send(action, {})).status).toBe(400);
    expect((await send(action, { unexpected: true })).status).toBe(400);
    expect((await send(action, { data: "a".repeat(1_430_000) })).status).toBe(413);
  });

  it.each(actions)("%s is subject to the same rate limiter", async action => {
    const address = ip();
    for (let index = 0; index < 65; index++) expect((await request(action, "{}", address)).status).toBe(400);
    const response = await request(action, "{}", address);
    expect(response.status).toBe(429);
    expect((await response.json()).error).toMatch(/wait a minute/i);
  });

  it("bounds problem length and answer length independently of the raw request limit", async () => {
    expect((await send("decompose", { text: "a".repeat(4001) })).status).toBe(400);
    expect((await send("compare", { text: "a".repeat(4001) })).status).toBe(400);
    expect((await send("check", { sessionId: ip(), stepId: ip(), revision: 0, answer: "a".repeat(1001) })).status).toBe(400);
    expect((await send("check", { sessionId: ip(), stepId: ip(), revision: 0, answer: "   " })).status).toBe(400);
    expect((await send("unknown", {})).status).toBe(404);
  });

  it("starts and resumes a mock comparison without exposing secrets in its guided session", async () => {
    const response = await send("compare", { text: samples[0].text });
    expect(response.status).toBe(200);
    expect(response.headers.get("cache-control")).toBe("no-store");
    const packet = await response.json();
    expect(packet.conventional).toMatch(/Each notebook costs/);
    expect(JSON.stringify(packet.session)).not.toMatch(/verifier|expectedAnswerHint|3x\+2=17/);
    const resumed = await send("resume", { sessionId: packet.session.problem.id, checkpoint: packet.checkpoint });
    expect(resumed.status).toBe(200);
    expect((await resumed.json()).session).toEqual(packet.session);
  });

  it.each(mutationActions)("%s rejects altered or unrelated checkpoint ciphertext", async action => {
    const started = await (await send("decompose", { text: samples[0].text })).json();
    const other = await (await send("decompose", { text: samples[1].text })).json();
    const base = { sessionId: started.session.problem.id };
    const fields = action === "resume" ? base : { ...base, stepId: started.session.subproblems[0].id, revision: 0 };
    const options = action === "check" ? { answer: "5" } : action === "hint" ? { level: 1 } : {};
    for (const checkpoint of ["A" + started.checkpoint.slice(1), other.checkpoint]) {
      const tampered = checkpoint === started.checkpoint ? "B" + checkpoint.slice(1) : checkpoint;
      expect((await send(action, { ...fields, ...options, checkpoint: tampered })).status).toBe(410);
    }
  });

  it("ignores untrusted IP headers by default", async () => {
    vi.stubEnv("STEPWISE_TRUST_PROXY", "");
    const first = await request("check", "{}");
    expect([400, 429]).toContain(first.status);
    let status = first.status;
    for (let index = 0; index < 65 && status !== 429; index++) status = (await request("check", "{}")).status;
    expect(status).toBe(429);
  });
});

describe("authored guidance", () => {
  const mock = new MockProvider();
  it.each(samples.map(sample => ({ sample })))("validates the complete sample and both hint levels for $sample.title", async ({ sample }) => {
    const lesson = mock.lesson(sample.text, sample.domain)!;
    const steps = lesson.steps.map(({ guidance, ...step }, index) => {
      expect(guidance).toHaveLength(3);
      expect(revealsAnswer(guidance![0], step.verifier)).toBe(false);
      expect(revealsAnswer(guidance![1], step.verifier)).toBe(false);
      return { ...step, prerequisites: index ? [index - 1] : [] };
    });
    expect(decompositionSchema.safeParse({ steps }).success).toBe(true);
  });
});

describe("checkpoint integrity and activity summaries", () => {
  const problem = { id: "a", text: "A demo question", domain: "math", createdAt: "2026-01-01T00:00:00Z" } as const;
  const base: Session = {
    problem, startedAt: problem.createdAt, mode: "demo",
    subproblems: [], attempts: [], hints: [], trace: [],
  };

  it("authenticates encrypted private progress and rejects the wrong key", () => {
    const state: PrivateSession = { ...base, subproblems: [], branches: { privateAnswer: 1 }, revision: 1 };
    const key = randomBytes(32);
    const token = sealCheckpoint(state, key);
    expect(token).not.toContain("privateAnswer");
    expect(token).not.toBe(sealCheckpoint(state, key));
    expect(openCheckpoint(token, key)).toEqual(state);
    expect(openCheckpoint(token, randomBytes(32))).toBeUndefined();
  });

  it("reports empty metrics without dividing by zero", () => {
    expect(summarizeActivity([])).toEqual({ accuracy: null, hints: null, mistakes: null, remedial: 0, time: null, rating: null });
  });

  it("computes assisted and independent completion, durations, mistakes, hints and ratings", () => {
    const step = { id: "s", order: 1, title: "Step", question: "What?", concept: "Math", prerequisiteIds: [] };
    const sessions: Session[] = [
      {
        ...base, finishedAt: "2026-01-01T00:00:20Z", rating: 4,
        subproblems: [{ ...step, type: "main", status: "solved" }, { ...step, id: "r", type: "remedial", status: "solved", solvedWithHelp: true }],
        hints: [{ subproblemId: "r", level: 3, text: "Worked" }],
        trace: [{ type: "mistake", subproblemId: "r", detail: "Try again", timestamp: base.startedAt }],
      },
      { ...base, subproblems: [{ ...step, type: "main", status: "active" }] },
    ];
    expect(summarizeActivity(activityRows(sessions))).toEqual({ accuracy: 1 / 3, hints: 0.5, mistakes: 0.5, remedial: 1, time: 20_000, rating: 4 });
  });
});

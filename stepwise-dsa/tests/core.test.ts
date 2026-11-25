import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  inputSchema,
  decompositionSchema,
  breakdownSchema,
  type Input,
} from "../shared/schema.js";
import { examples } from "../shared/examples.js";
import { analyze } from "../backend/src/services/pipeline.js";
import { mock } from "../backend/src/services/mock.js";
import type { Call } from "../backend/src/services/llm.js";
import {
  start,
  publicView,
  hint,
  answer,
  get,
  metrics,
} from "../backend/src/services/sessions.js";
import { boundedProcess, run } from "../backend/src/services/sandbox.js";
const input: Input = {
  ...examples[0],
  language: "python",
  level: "Beginner",
  mode: "Guided Mode",
};
const validInput = inputSchema.parse({
  problem: input.problem,
  code: input.code,
  language: input.language,
  level: input.level,
  mode: input.mode,
});
const fake: Call = async (name, schema, context) =>
  schema.parse(mock(name, context));
let directory = "";
beforeEach(async () => {
  directory = await mkdtemp(join(tmpdir(), "stepwise-test-"));
  process.env.SESSION_DIR = directory;
  process.env.MOCK_LLM = "true";
  process.env.SANDBOX_ENABLED = "false";
});
afterEach(async () => {
  await rm(directory, { recursive: true, force: true });
});
describe("validation", () => {
  it("rejects prose, blanks, and oversized code", () => {
    for (const code of [
      "",
      "Hello this is just prose",
      "return 1\n".repeat(301),
    ])
      expect(inputSchema.safeParse({ ...validInput, code }).success).toBe(
        false,
      );
  });
  it("rejects future prerequisites and duplicate IDs", () => {
    expect(
      decompositionSchema.safeParse({
        steps: [
          { id: "a", title: "a", why_it_is_needed: "a", depends_on: ["b"] },
        ],
      }).success,
    ).toBe(false);
  });
  it("rejects incomplete output", () =>
    expect(breakdownSchema.safeParse({}).success).toBe(false));
});
describe("pipeline", () => {
  it("passes each prior result into the next call", async () => {
    const calls: { name: string; context: Record<string, unknown> }[] = [];
    const llm: Call = async (name, schema, context) => {
      calls.push({ name, context: structuredClone(context) });
      return fake(name, schema, context);
    };
    const b = await analyze(validInput, () => {}, llm);
    expect(calls.map((c) => c.name)).toEqual([
      "stage0",
      "stage1",
      "stage2",
      "stage2",
      "stage2",
      "stage3",
    ]);
    expect(calls[3].context.previous).toHaveLength(1);
    expect(calls[4].context.previous).toHaveLength(2);
    expect(b.steps).toHaveLength(3);
  });
  it.each([0, 1, 2])("validates seed %i", async (i) => {
    expect(
      (
        await analyze(
          {
            ...validInput,
            problem: examples[i].problem,
            code: examples[i].code,
          },
          () => {},
          fake,
        )
      ).analysis.practice,
    ).toHaveLength(3);
  });
  it("refuses misleading canned analysis for edited code", async () => {
    await expect(
      analyze(
        { ...validInput, code: validInput.code + "\n# edit" },
        () => {},
        fake,
      ),
    ).rejects.toThrow("unchanged");
  });
});
describe("guided progression", () => {
  it("does not expose answers or hidden future questions", async () => {
    const s = await start(await analyze(validInput, () => {}, fake));
    const view = publicView(s);
    expect(JSON.stringify(view)).not.toContain(s.queue[0].answer);
    expect(view.step).not.toHaveProperty("answer");
    expect(JSON.stringify(view)).not.toContain(s.queue[1].question);
  });
  it("clamps hints to three and persists the worked answer only at level three", async () => {
    const s = await start(await analyze(validInput, () => {}, fake));
    for (let i = 1; i <= 4; i++) {
      const view = await hint(s, fake);
      expect(view.step?.hintLevel).toBe(Math.min(i, 3));
      if (i < 3) expect(view.step?.hint).not.toContain(s.queue[0].answer);
    }
    expect(s.trace.filter((t) => t.event === "hint")).toHaveLength(3);
    expect((await get(s.breakdown.id)).queue[0].hintLevel).toBe(3);
  });
  it("inserts remedial work and returns to original question after success", async () => {
    const s = await start(await analyze(validInput, () => {}, fake));
    const original = s.queue[0].id;
    await answer(s, "I do not know", fake);
    expect(s.queue[s.index].remedial).toBe(true);
    expect(s.queue[1].id).toBe(original);
    await answer(s, "2", fake);
    expect(s.queue[s.index].id).toBe(original);
    expect((await metrics())[0].remedialBranches).toBe(1);
  });
  it("does not mark low-confidence grading as correct", async () => {
    const s = await start(await analyze(validInput, () => {}, fake));
    const uncertain: Call = async (n, sc, c) =>
      n === "evaluation"
        ? sc.parse({
            correct: true,
            feedback: "uncertain",
            misconception: "uncertain",
            confidence: 0.2,
          })
        : fake(n, sc, c);
    await answer(s, "anything", uncertain);
    expect(s.index).toBe(0);
    expect(s.trace.find((t) => t.event === "answer")?.correct).toBe(false);
  });
});
describe("sandbox", () => {
  it("terminates a long-running process", async () => {
    await expect(
      boundedProcess(
        process.execPath,
        ["-e", "setInterval(()=>{},1000)"],
        "",
        150,
      ),
    ).rejects.toThrow("timed out");
  });
  it("caps output", async () => {
    await expect(
      boundedProcess(
        process.execPath,
        ["-e", "process.stdout.write('x'.repeat(100000))"],
        "",
        3000,
      ),
    ).rejects.toThrow("64 KiB");
  });
  it("fails closed when sandbox is disabled", async () => {
    expect(
      await run({
        language: "python",
        code: input.code,
        tests: [{ name: "t", input: "1", expected: "1" }],
      }),
    ).toMatchObject({ verified: false, results: [] });
  });
});

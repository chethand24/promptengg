import { readFile, writeFile, mkdir, rename, readdir } from "node:fs/promises";
import { resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import {
  breakdownSchema,
  stepSchema,
  traceSchema,
  evaluationSchema,
  hintSchema,
  type Breakdown,
  type PublicSession,
} from "../../../shared/schema.js";
import { call, type Call } from "./llm.js";
const savedSchema = z.object({
  breakdown: breakdownSchema,
  queue: z.array(
    stepSchema.extend({
      title: z.string(),
      remedial: z.boolean(),
      hintLevel: z.number(),
      hint: z.string().optional(),
    }),
  ),
  index: z.number(),
  trace: z.array(traceSchema),
  started: z.number(),
  branches: z.record(z.string(), z.number()),
});
type Session = z.infer<typeof savedSchema>;
const dir = () => resolve(process.env.SESSION_DIR ?? ".sessions");
export const locks = new Set<string>();
export async function save(s: Session) {
  await mkdir(dir(), { recursive: true });
  const path = resolve(dir(), s.breakdown.id + ".json");
  const tmp = path + "." + randomUUID() + ".tmp";
  await writeFile(tmp, JSON.stringify(s), { mode: 0o600 });
  await rename(tmp, path);
}
export async function get(id: string) {
  if (!z.uuid().safeParse(id).success) throw new Error("Invalid session ID.");
  return savedSchema.parse(
    JSON.parse(await readFile(resolve(dir(), id + ".json"), "utf8")),
  );
}
function log(
  s: Session,
  event: Session["trace"][number]["event"],
  detail: string,
  correct?: boolean,
) {
  const step = s.queue[s.index];
  s.trace.push({
    at: new Date().toISOString(),
    stepId: step?.id ?? "complete",
    event,
    detail,
    hints: step?.hintLevel ?? 0,
    elapsedMs: Date.now() - s.started,
    ...(correct === undefined ? {} : { correct }),
  });
}
export async function start(breakdown: Breakdown) {
  const s: Session = {
    breakdown,
    queue: breakdown.steps.map((s, i) => ({
      ...s,
      title: breakdown.decomposition.steps[i].title,
      remedial: false,
      hintLevel: 0,
    })),
    index: 0,
    trace: [],
    started: Date.now(),
    branches: {},
  };
  log(s, "started", "Session started");
  await save(s);
  return s;
}
export function publicView(s: Session): PublicSession {
  const step = s.queue[s.index];
  return {
    id: s.breakdown.id,
    input: s.breakdown.input,
    source: s.breakdown.source,
    index: s.index,
    total: s.queue.length,
    complete: !step,
    step: step
      ? {
          id: step.id,
          title: step.title,
          question: step.question,
          lines: step.lines,
          remedial: step.remedial,
          hintLevel: step.hintLevel,
          hint: step.hint,
        }
      : null,
    order: s.queue.map((item, i) => ({
      id: item.id,
      title: item.title,
      status:
        i < s.index
          ? "done"
          : i === s.index
            ? "current"
            : item.remedial
              ? "remedial"
              : "pending",
    })),
    trace: s.trace,
  };
}
export async function hint(s: Session, llm: Call = call) {
  const step = s.queue[s.index];
  if (!step) throw new Error("Session is complete.");
  if (step.hintLevel < 3) {
    const level = step.hintLevel + 1;
    step.hint =
      level === 3
        ? `${step.answer}\n${step.explanation}`
        : (
            await llm("hint", hintSchema, {
              input: s.breakdown.input,
              provider: s.breakdown.source,
              step,
              level,
            })
          ).hint;
    step.hintLevel = level;
    log(s, "hint", `Hint ${level} used`);
  }
  await save(s);
  return publicView(s);
}
export async function answer(s: Session, text: string, llm: Call = call) {
  const step = s.queue[s.index];
  if (!step) throw new Error("Session is complete.");
  const result = await llm("evaluation", evaluationSchema, {
    input: s.breakdown.input,
    provider: s.breakdown.source,
    step,
    answer: text,
  });
  const correct = result.correct && result.confidence >= 0.8;
  log(
    s,
    "answer",
    result.feedback + " Misconception: " + result.misconception,
    correct,
  );
  if (correct) {
    log(
      s,
      "completed",
      step.hintLevel === 3 ? "Completed with worked answer" : "Completed",
    );
    s.index++;
    s.started = Date.now();
  } else if (!step.remedial && (s.branches[step.id] ?? 0) < 2) {
    const remedial = await llm("remedial", stepSchema, {
      input: s.breakdown.input,
      provider: s.breakdown.source,
      step,
      evaluation: result,
    });
    if (remedial.lines[1] > s.breakdown.input.code.split("\n").length)
      throw new Error("Invalid remedial code range");
    s.branches[step.id] = (s.branches[step.id] ?? 0) + 1;
    log(s, "remedial", result.misconception);
    s.queue.splice(s.index, 0, {
      ...remedial,
      id: "r-" + randomUUID(),
      title: "Practice: " + result.misconception,
      remedial: true,
      hintLevel: 0,
    });
    s.started = Date.now();
  }
  await save(s);
  return { session: publicView(s), feedback: result.feedback, verified: false };
}
export async function metrics() {
  await mkdir(dir(), { recursive: true });
  const files = (await readdir(dir())).filter((f) => f.endsWith(".json"));
  return Promise.all(
    files.map(async (f) => {
      const s = await get(f.slice(0, -5));
      const answers = s.trace.filter((t) => t.event === "answer");
      return {
        id: s.breakdown.id,
        source: s.breakdown.source,
        completed: s.index === s.queue.length,
        accuracy: answers.length
          ? answers.filter((t) => t.correct).length / answers.length
          : 0,
        attempts: answers.length,
        hints: s.trace.filter((t) => t.event === "hint").length,
        remedialBranches: s.trace.filter((t) => t.event === "remedial").length,
        steps: s.queue.map((step) => ({
          id: step.id,
          title: step.title,
          hints: step.hintLevel,
          timeMs: s.trace
            .filter((t) => t.stepId === step.id)
            .reduce((max, t) => Math.max(max, t.elapsedMs), 0),
        })),
      };
    }),
  );
}

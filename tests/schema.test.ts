import { describe, expect, it } from "vitest";
import { decompositionSchema, judgmentSchema, problemInput, stepSchema } from "@/lib/schema";

const draft = { title: "Define the variable", question: "Which quantity is unknown?", concept: "variables", expectedAnswerHint: "Unit price", verifier: { kind: "exact", payload: "unit price" } };

describe("structured output", () => {
  it("accepts a strictly ordered decomposition", () => {
    expect(decompositionSchema.safeParse({ steps: [{ ...draft, prerequisites: [] }, { ...draft, prerequisites: [0] }] }).success).toBe(true);
  });
  it.each([[1], [2], [0, 0], []].map(prerequisites => ({ prerequisites })))("rejects invalid prerequisite list $prerequisites", ({ prerequisites }) => {
    expect(decompositionSchema.safeParse({ steps: [{ ...draft, prerequisites: [] }, { ...draft, prerequisites }] }).success).toBe(false);
  });
  it("rejects unknown verifier kinds and extra answer fields", () => {
    expect(stepSchema.safeParse({ ...draft, verifier: { kind: "shell", payload: "5" } }).success).toBe(false);
    expect(stepSchema.safeParse({ ...draft, finalAnswer: "5" }).success).toBe(false);
  });
  it("requires a bounded confidence number", () => {
    expect(judgmentSchema.safeParse({ result: "correct", confidence: 0.81 }).success).toBe(true);
    expect(judgmentSchema.safeParse({ result: "correct", confidence: 1.2 }).success).toBe(false);
    expect(judgmentSchema.safeParse({ result: "correct" }).success).toBe(false);
  });
  it("bounds student input", () => {
    expect(problemInput.safeParse({ text: "x".repeat(4001) }).success).toBe(false);
  });
});

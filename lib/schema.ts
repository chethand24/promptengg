import { z } from "zod";

export const checkpointLimit = 1_400_000;

const short = z.string().trim().min(1).max(300);
const detail = z.string().trim().min(1).max(1500);
export const domainSchema = z.enum(["math", "programming", "algorithm"]);
export const stepSchema = z.object({
  title: short, question: detail, concept: short,
  expectedAnswerHint: detail,
  verifier: z.object({ kind: z.enum(["math", "exact", "llm", "none"]), payload: detail }).strict(),
}).strict();
const plannedStep = stepSchema.extend({ prerequisites: z.array(z.number().int().min(0)).max(8) });
export const decompositionSchema = z.object({ steps: z.array(plannedStep).min(2).max(8) }).strict()
  .superRefine(({ steps }, ctx) => steps.forEach((step, index) => {
    const valid = step.prerequisites.every(item => item < index) &&
      new Set(step.prerequisites).size === step.prerequisites.length &&
      (index === 0 || step.prerequisites.length > 0);
    if (!valid) ctx.addIssue({ code: "custom", path: ["steps", index, "prerequisites"], message: "Use distinct earlier step indices." });
  }));
export const feedbackSchema = z.object({ feedback: detail, misconception: short.optional() }).strict();
export const judgmentSchema = z.object({ result: z.enum(["correct", "incorrect", "uncertain"]), confidence: z.number().min(0).max(1) }).strict();
export const textSchema = z.object({ text: detail }).strict();

export const problemInput = z.object({
  text: z.string().trim().min(8).max(4000), domain: domainSchema.optional(),
}).strict();
export const actionInput = z.object({
  sessionId: z.string().uuid(), stepId: z.string().uuid(), revision: z.number().int().nonnegative(),
  checkpoint: z.string().min(1).max(checkpointLimit).optional(),
}).strict();
export const checkInput = actionInput.extend({ answer: z.string().trim().min(1).max(1000), revise: z.boolean().optional() });
export const hintInput = actionInput.extend({ level: z.union([z.literal(1), z.literal(2), z.literal(3)]) });

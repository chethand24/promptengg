import { z } from "zod";
export const language = z.enum(["python", "java", "cpp", "javascript"]);
export const inputSchema = z
  .object({
    problem: z.string().trim().min(15).max(15000),
    code: z
      .string()
      .trim()
      .min(1, "Please paste your solution code.")
      .max(30000)
      .refine(
        (s) => s.split("\n").length <= 300,
        "Please use at most 300 lines.",
      )
      .refine(
        (s) =>
          /\b(def |class |function |return\b|const |let |var |int |public |for\s*\(|while\s*\(|print\(|console\.)|\b[A-Za-z_]\w*\s*(?:\([^\n]*\)|=(?!=))/.test(
            s,
          ),
        "Please paste solution code, not prose.",
      ),
    language,
    level: z.enum(["Beginner", "Intermediate", "Advanced"]),
    mode: z.enum(["Full Breakdown", "Guided Mode"]),
  })
  .strict();
const lines = z
  .tuple([z.number().int().positive(), z.number().int().positive()])
  .refine(([a, b]) => b >= a);
export const testSchema = z.object({
  name: z.string().min(1).max(200),
  input: z.string().max(10000),
  expected: z.string().max(10000),
});
export const understandingSchema = z.object({
  restatement: z.string(),
  inputs: z.array(z.string()),
  outputs: z.array(z.string()),
  constraints: z.array(z.string()),
  edgeCases: z.array(z.string()),
  example: z.string(),
  tests: z.array(testSchema).max(8),
});
export const decompositionSchema = z
  .object({
    steps: z
      .array(
        z.object({
          id: z.string(),
          title: z.string(),
          why_it_is_needed: z.string(),
          depends_on: z.array(z.string()),
        }),
      )
      .min(1)
      .max(12),
  })
  .superRefine(({ steps }, ctx) => {
    const seen = new Set<string>();
    for (const s of steps) {
      if (seen.has(s.id) || s.depends_on.some((d) => !seen.has(d)))
        ctx.addIssue({
          code: "custom",
          message: "Dependencies must refer to earlier unique steps.",
        });
      seen.add(s.id);
    }
  });
export const stepSchema = z.object({
  id: z.string(),
  question: z.string(),
  answer: z.string(),
  explanation: z.string(),
  lines,
  hints: z.tuple([z.string(), z.string()]),
});
export const analysisSchema = z.object({
  variables: z.array(
    z.object({
      name: z.string(),
      type: z.string(),
      purpose: z.string(),
      initial: z.string(),
      changes: z.string(),
      why: z.string(),
      lines,
    }),
  ),
  logic: z.array(z.object({ text: z.string(), lines })),
  technique: z.object({
    name: z.string(),
    confidence: z.number().min(0).max(1),
    why: z.string(),
    whenNot: z.string(),
  }),
  insight: z.string(),
  dryRun: z.array(
    z.object({
      iteration: z.number(),
      values: z.record(z.string(), z.string()),
      explanation: z.string(),
      lines,
    }),
  ),
  complexity: z.object({
    time: z.string(),
    space: z.string(),
    justification: z.array(z.object({ text: z.string(), lines })),
  }),
  edgeCases: z.array(
    z.object({
      case: z.string(),
      handled: z.enum(["handled", "missed", "uncertain"]),
      reason: z.string(),
    }),
  ),
  correctness: z.object({
    status: z.enum(["correct", "incorrect", "uncertain"]),
    risks: z.array(z.string()),
  }),
  alternatives: z.array(
    z.object({
      name: z.string(),
      approach: z.string(),
      time: z.string(),
      space: z.string(),
      tradeoff: z.string(),
    }),
  ),
  optimizations: z.array(z.string()),
  prerequisites: z.array(z.string()),
  practice: z
    .array(z.object({ title: z.string(), pattern: z.string() }))
    .length(3),
});
export const evaluationSchema = z.object({
  correct: z.boolean(),
  feedback: z.string(),
  misconception: z.string(),
  confidence: z.number().min(0).max(1),
});
export const hintSchema = z.object({ hint: z.string() });
export const breakdownSchema = z.object({
  id: z.string(),
  input: inputSchema,
  understanding: understandingSchema,
  decomposition: decompositionSchema,
  steps: z.array(stepSchema),
  analysis: analysisSchema,
  source: z.enum(["mock", "claude", "gemini", "openrouter"]),
});
export type Input = z.infer<typeof inputSchema>;
export type Step = z.infer<typeof stepSchema>;
export type Breakdown = z.infer<typeof breakdownSchema>;
export const traceSchema = z.object({
  at: z.string(),
  stepId: z.string(),
  event: z.enum(["started", "hint", "answer", "remedial", "completed"]),
  detail: z.string(),
  hints: z.number(),
  elapsedMs: z.number(),
  correct: z.boolean().optional(),
});
export type Trace = z.infer<typeof traceSchema>;
export const publicSessionSchema = z.object({
  id: z.string(),
  input: inputSchema,
  source: z.enum(["mock", "claude", "gemini", "openrouter"]),
  index: z.number(),
  total: z.number(),
  complete: z.boolean(),
  step: z
    .object({
      id: z.string(),
      title: z.string(),
      question: z.string(),
      lines,
      remedial: z.boolean(),
      hintLevel: z.number(),
      hint: z.string().optional(),
    })
    .nullable(),
  order: z.array(
    z.object({ id: z.string(), title: z.string(), status: z.string() }),
  ),
  trace: z.array(traceSchema),
});
export type PublicSession = z.infer<typeof publicSessionSchema>;
export const runSchema = z
  .object({
    language,
    code: inputSchema.shape.code,
    tests: z.array(testSchema).min(1).max(8),
  })
  .strict();
export const runResultSchema = z.object({
  verified: z.boolean(),
  reason: z.string().optional(),
  results: z.array(
    z.object({
      name: z.string(),
      passed: z.boolean(),
      actual: z.string(),
      expected: z.string(),
      error: z.string().optional(),
      trace: z
        .array(
          z.object({
            line: z.number().int().positive(),
            values: z.record(z.string(), z.string()),
          }),
        )
        .optional(),
    }),
  ),
});

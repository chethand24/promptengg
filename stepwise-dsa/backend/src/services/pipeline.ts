import { randomUUID } from "node:crypto";
import {
  understandingSchema,
  decompositionSchema,
  stepSchema,
  analysisSchema,
  breakdownSchema,
  type Input,
  type Breakdown,
  type Step,
} from "../../../shared/schema.js";
import { call, type Call } from "./llm.js";
import { providerFor } from "./provider.js";
export async function analyze(
  input: Input,
  progress: (text: string) => void = () => {},
  llm: Call = call,
): Promise<Breakdown> {
  const provider = providerFor(input);
  progress("Stage 0: Understanding the problem");
  const understanding = await llm("stage0", understandingSchema, {
    input,
    provider,
  });
  progress("Stage 1: Ordering prerequisites");
  const decomposition = await llm("stage1", decompositionSchema, {
    input,
    provider,
    understanding,
  });
  const steps: Step[] = [];
  for (const [i, subproblem] of decomposition.steps.entries()) {
    progress(
      `Stage 2: Solving subproblem ${i + 1}/${decomposition.steps.length}`,
    );
    const step = await llm("stage2", stepSchema, {
      input,
      provider,
      understanding,
      decomposition,
      subproblem,
      previous: steps,
    });
    steps.push({ ...step, id: subproblem.id });
  }
  progress("Stage 3: Analyzing the solution");
  const analysis = await llm("stage3", analysisSchema, {
    input,
    provider,
    understanding,
    decomposition,
    steps,
  });
  const max = input.code.split("\n").length;
  for (const item of [
    ...steps,
    ...analysis.variables,
    ...analysis.logic,
    ...analysis.dryRun,
    ...analysis.complexity.justification,
  ])
    if (item.lines[1] > max)
      throw new Error(
        "Tutor referenced a line outside your code. Please retry.",
      );
  return breakdownSchema.parse({
    id: randomUUID(),
    input,
    understanding,
    decomposition,
    steps,
    analysis,
    source: provider,
  });
}

import { it, expect } from "vitest";
import { z } from "zod";
import { validatedJSON } from "../backend/src/services/llm.js";
it("repairs malformed JSON and invalid schema output", async () => {
  const prompts: string[] = [];
  const responses = ["not json", '{"value":false}', '{"value":3}'];
  const result = await validatedJSON(
    z.object({ value: z.number() }),
    async (repair) => {
      prompts.push(repair);
      return responses.shift()!;
    },
  );
  expect(result.value).toBe(3);
  expect(prompts).toHaveLength(3);
  expect(prompts[1]).toContain("Regenerate");
});
it("stops after two repairs", async () => {
  let calls = 0;
  await expect(
    validatedJSON(z.object({ value: z.number() }), async () => {
      calls++;
      return "{}";
    }),
  ).rejects.toThrow("two repair attempts");
  expect(calls).toBe(3);
});

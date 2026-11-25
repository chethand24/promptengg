import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import type { z } from "zod";
import { runSchema, runResultSchema } from "../../../shared/schema.js";
export function boundedProcess(
  command: string,
  args: string[],
  stdin: string,
  timeout = 3000,
): Promise<{ stdout: string; stderr: string; code: number | null }> {
  return new Promise((resolve, reject) => {
    const p = spawn(command, args, { stdio: "pipe", windowsHide: true });
    let stdout = "",
      stderr = "",
      bytes = 0,
      done = false;
    const finish = (error?: Error, code: number | null = null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      if (error) {
        p.kill("SIGKILL");
        reject(error);
      } else resolve({ stdout, stderr, code });
    };
    const timer = setTimeout(
      () => finish(new Error("Execution timed out.")),
      timeout,
    );
    p.on("error", (e) => finish(e));
    p.stdout.on("data", (b: Buffer) => {
      bytes += b.length;
      if (bytes > 65536) finish(new Error("Output exceeded 64 KiB."));
      else stdout += b.toString();
    });
    p.stderr.on("data", (b: Buffer) => {
      bytes += b.length;
      if (bytes > 65536) finish(new Error("Output exceeded 64 KiB."));
      else stderr += b.toString();
    });
    p.on("close", (code) => finish(undefined, code));
    p.stdin.on("error", () => {});
    p.stdin.end(stdin);
  });
}
export async function run(
  request: z.infer<typeof runSchema>,
): Promise<z.infer<typeof runResultSchema>> {
  if (process.env.SANDBOX_ENABLED !== "true")
    return {
      verified: false,
      reason:
        "Docker execution is disabled. Enable SANDBOX_ENABLED after building the sandbox image.",
      results: [],
    };
  try {
    const inspection = await boundedProcess(
      "docker",
      ["image", "inspect", "stepwise-runner:local"],
      "",
      5000,
    );
    if (inspection.code !== 0) throw new Error("Image unavailable");
  } catch {
    return {
      verified: false,
      reason:
        "Docker or the prebuilt stepwise-runner:local image is unavailable.",
      results: [],
    };
  }
  const results = [];
  for (const test of request.tests) {
    const name = "stepwise-" + randomUUID();
    try {
      const result = await boundedProcess(
        "docker",
        [
          "run",
          "--rm",
          "--pull=never",
          "--name",
          name,
          "--network=none",
          "--read-only",
          "--cap-drop=ALL",
          "--security-opt=no-new-privileges",
          "--pids-limit=48",
          "--memory=256m",
          "--memory-swap=256m",
          "--cpus=0.5",
          "--user=65534:65534",
          "--tmpfs=/work:rw,noexec,nosuid,size=16m,mode=1777",
          "--tmpfs=/exec:rw,exec,nosuid,size=32m,mode=1777",
          "-i",
          "stepwise-runner:local",
        ],
        JSON.stringify({
          language: request.language,
          code: request.code,
          input: test.input,
        }),
        10000,
      );
      const trace: { line: number; values: Record<string, string> }[] = [];
      const stderr = result.stderr
        .split("\n")
        .filter((line) => {
          if (line.startsWith("STEPWISE_TRACE:")) {
            try {
              const event = JSON.parse(line.slice(15));
              if (
                Number.isInteger(event.line) &&
                event.line > 0 &&
                event.line <= request.code.split("\n").length &&
                typeof event.values === "object" &&
                event.values !== null &&
                Object.values(event.values).every((v) => typeof v === "string")
              )
                trace.push(event);
            } catch {
              /* Discard malformed trace events. */
            }
            return false;
          }
          return true;
        })
        .join("\n");
      results.push({
        name: test.name,
        trace: trace.slice(0, 100),
        passed:
          result.code === 0 && result.stdout.trim() === test.expected.trim(),
        actual: result.stdout,
        expected: test.expected,
        ...(result.code !== 0
          ? { error: stderr || "Sandbox process failed." }
          : {}),
      });
    } catch (error) {
      results.push({
        name: test.name,
        passed: false,
        actual: "",
        expected: test.expected,
        error: String(error),
      });
    } finally {
      await boundedProcess("docker", ["rm", "-f", name], "", 5000).catch(
        () => {},
      );
    }
  }
  return { verified: true, results };
}

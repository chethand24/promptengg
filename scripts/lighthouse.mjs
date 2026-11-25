import { spawn } from "node:child_process";
import { once } from "node:events";
import { mkdir, readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

const port = 4312;
const base = "http://127.0.0.1:" + port;
const output = "test-results/lighthouse";
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], {
  env: { ...process.env, OPENAI_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1" },
  stdio: "inherit", windowsHide: true,
});
const serverClosed = once(server, "exit");

try {
  let ready = false;
  for (let attempt = 0; attempt < 60; attempt++) {
    if (server.exitCode != null) throw new Error("The production server exited before Lighthouse could connect.");
    try {
      ready = (await fetch(base, { signal: AbortSignal.timeout(800) })).ok;
    } catch {
      // Wait for the production server to begin listening.
    }
    if (ready) break;
    await delay(500);
  }
  if (!ready) throw new Error("The production server did not start.");
  await mkdir(output, { recursive: true });
  for (const [path, name] of [["/", "landing"], ["/solve", "solve"]]) {
    const report = output + "/" + name + ".json";
    const lighthouse = spawn(process.execPath, [
      "node_modules/lighthouse/cli/index.js", base + path, "--only-categories=performance",
      "--chrome-flags=--headless=new", "--quiet", "--output=json", "--output-path=" + report,
    ], { stdio: "inherit", windowsHide: true });
    const [code] = await once(lighthouse, "exit");
    if (code !== 0) throw new Error("Lighthouse failed for " + path);
    const data = JSON.parse(await readFile(report, "utf8"));
    if (data.runtimeError) throw new Error(data.runtimeError.message);
    console.log(path, {
      performance: Math.round(data.categories.performance.score * 100),
      lcp: data.audits["largest-contentful-paint"].displayValue,
      cls: data.audits["cumulative-layout-shift"].displayValue,
    });
  }
} finally {
  server.kill();
  await serverClosed;
}

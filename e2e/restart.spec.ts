import { spawn, type ChildProcess } from "node:child_process";
import { once } from "node:events";
import { setTimeout as delay } from "node:timers/promises";
import { test, expect } from "@playwright/test";

const origin = "http://127.0.0.1:4311";
let child: ChildProcess | undefined;

async function start() {
  const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", "4311"], {
    env: { ...process.env, OPENAI_API_KEY: "", NEXT_TELEMETRY_DISABLED: "1", STEPWISE_SESSION_KEY: "" },
    stdio: "ignore",
    windowsHide: true,
  });
  child = server;
  await expect.poll(async () => {
    if (server.exitCode != null) throw new Error("The restart test server exited during startup");
    try { return (await fetch(origin, { signal: AbortSignal.timeout(1000) })).status; }
    catch { return undefined; }
  }, { timeout: 25000 }).toBe(200);
  return server.pid;
}

async function stop() {
  const server = child;
  if (!server || server.exitCode != null || server.signalCode != null) return;
  const exited = once(server, "exit");
  server.kill();
  await Promise.race([exited, delay(4000)]);
  expect(server.exitCode !== null || server.signalCode !== null).toBe(true);
  child = undefined;
}

test.afterEach(stop);

test("continues a saved lesson after the original Node process exits", async ({ page }) => {
  test.setTimeout(90_000);
  const oldPid = await start();
  await page.goto(origin + "/solve");
  await page.getByRole("button", { name: /The notebook bundle/ }).click();
  await page.getByRole("button", { name: "Break into steps" }).click();
  await page.getByLabel("Your answer").fill("3x+2=17");
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("heading", { name: "Remove the fixed cost" })).toBeVisible();
  await stop();
  expect(await start()).not.toBe(oldPid);
  await page.reload();
  await expect(page.getByRole("heading", { name: "Remove the fixed cost" })).toBeVisible();
  await page.getByLabel("Your answer").fill("15");
  await page.getByRole("button", { name: "Check answer" }).click();
  await expect(page.getByRole("heading", { name: "Find the unit price" })).toBeVisible();
  await expect(page.getByRole("progressbar")).toHaveAttribute("value", "2");
});

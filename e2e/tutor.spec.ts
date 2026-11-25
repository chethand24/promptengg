import { test, expect, type Page } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";
import { readFile } from "node:fs/promises";
import { samples } from "../lib/samples";

const solutions = [
  ["3x+2=17", "15", "5", "17"], ["c+4", "3c+4=25", "7", "11"],
  ["0", "2", "2", "10"], ["7", "5", "12"], ["2", "3", "4", "3"],
  ["[2, 4, 5, 1]", "[2, 4, 5, 1]", "[1, 2, 4, 5]"],
];
let clientNumber = 0;
const errors = new WeakMap<Page, string[]>();
const intentionalBadRequest = new WeakSet<Page>();

test.beforeEach(async ({ page }) => {
  await page.route("**/api/**", route => route.continue({
    headers: { ...route.request().headers(), "x-real-ip": "qa-client-" + clientNumber },
  }));
  clientNumber += 1;
  const messages: string[] = [];
  errors.set(page, messages);
  page.on("pageerror", error => messages.push(error.message));
  page.on("console", message => {
    if (intentionalBadRequest.has(page) && message.location().url.endsWith("/api/decompose") &&
        message.text().includes("status of 400")) return;
    if (["error", "warning"].includes(message.type())) messages.push(message.text());
  });
});

test.afterEach(({ page }) => {
  expect(errors.get(page)).toEqual([]);
});

async function begin(page: Page, index = 0) {
  await page.goto("/solve");
  await page.getByRole("button", { name: new RegExp(samples[index].title) }).click();
  await page.getByRole("button", { name: "Break into steps" }).click();
  await expect(page.getByRole("heading", { name: "Tutor workspace" })).toBeVisible();
  await expect(page.getByLabel("Your answer")).toBeVisible();
}

async function answer(page: Page, text: string) {
  const response = page.waitForResponse(r => r.url().endsWith("/api/check") && r.request().method() === "POST");
  await page.getByLabel("Your answer").fill(text);
  await page.getByRole("button", { name: "Check answer" }).click();
  expect((await response).ok()).toBe(true);
}

async function finish(page: Page, answers: string[]) {
  for (const [index, text] of answers.entries()) {
    const previous = await page.locator('[aria-current="step"]').textContent();
    await answer(page, text);
    const active = page.locator('[aria-current="step"]');
    if (index === answers.length - 1) await expect(active).toHaveCount(0);
    else await expect(active).not.toHaveText(previous ?? "");
  }
  await expect(page.getByRole("heading", { name: "Practice complete." })).toBeVisible();
}

test("landing CTA and all navigation, comparison, about, and empty states", async ({ page }) => {
  await page.goto("/");
  await page.locator("main").getByRole("link", { name: "Start solving", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start a problem." })).toBeVisible();
  const nav = page.getByRole("navigation", { name: "Main navigation" });
  await nav.getByRole("link", { name: "Learning trace" }).click();
  await expect(page.getByRole("heading", { name: "No sessions yet" })).toBeVisible();
  await nav.getByRole("link", { name: "Evaluation" }).click();
  await expect(page.getByRole("heading", { name: "No practice data yet" })).toBeVisible();
  await nav.getByRole("link", { name: "Compare" }).click();
  await page.getByRole("button", { name: "Compare responses" }).click();
  await expect(page.getByRole("heading", { name: "Normal chatbot" })).toBeVisible();
  await expect(page.getByText(/Each notebook costs/)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Write a cost equation" })).toBeVisible();
  await nav.getByRole("link", { name: "About" }).click();
  await expect(page.getByRole("heading", { name: "Limitations" })).toBeVisible();
  await nav.getByRole("link", { name: "Tutor", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Start a problem." })).toBeVisible();
});

for (const [index, sample] of samples.entries()) {
  test("completes " + sample.title, async ({ page }) => {
    await begin(page, index);
    await finish(page, solutions[index]);
    await expect(page.getByRole("link", { name: "Review learning trace" })).toBeVisible();
  });
}

test("branches once, records the trace, rates understanding, and exports evaluated data", async ({ page }, testInfo) => {
  await begin(page);
  await answer(page, "3x=17");
  await expect(page.getByRole("heading", { name: "Practice writing a cost expression" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Problem steps" }).locator(".remedial.active")).toContainText("Extra practice");
  await expect(page.getByRole("status").filter({ hasText: "reasoning about representing a total" })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await answer(page, "2p+3");
  await expect(page.getByRole("heading", { name: "Write a cost equation" })).toBeVisible();
  await finish(page, solutions[0]);
  await page.getByRole("button", { name: "4 out of 5" }).click();
  await page.getByRole("link", { name: "Review learning trace" }).click();
  await expect(page.getByText("Practice added", { exact: true })).toBeVisible();
  await expect(page.getByText("Misconception", { exact: true })).toBeVisible();
  await expect(page.getByText("Correction", { exact: true })).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  await page.getByRole("link", { name: "Evaluation" }).click();
  await expect(page.getByText("100%", { exact: true })).toBeVisible();
  await expect(page.getByText("4.0 / 5", { exact: true })).toBeVisible();
  await expect(page.getByText(/Effectiveness requires classroom\/user testing/)).toBeVisible();
  expect((await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze()).violations).toEqual([]);
  const downloaded = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export CSV" }).click();
  const download = await downloaded;
  const path = testInfo.outputPath("metrics.csv");
  await download.saveAs(path);
  expect(download.suggestedFilename()).toBe("stepwise-evaluation.csv");
  const [header, data] = (await readFile(path, "utf8")).split(/\r?\n/);
  expect(header).toContain("understanding_1_to_5");
  expect(data.split(",").slice(2)).toEqual(["Algebra", "true", "5", "5", "0", "1", "1", expect.stringMatching(/^\d+$/), "4"]);
});

test("enforces hint order and locked steps, reopens dependents after revision, and restores on reload", async ({ page }) => {
  await begin(page);
  await expect(page.getByRole("button", { name: /Hint 2|Show worked step/ })).toHaveCount(0);
  const roadmap = page.getByRole("list", { name: "Problem steps" });
  await expect(roadmap.locator(".locked")).toHaveCount(3);
  await expect(roadmap.locator(".locked").getByRole("button")).toHaveCount(0);
  await page.getByRole("button", { name: "Hint 1 (small clue)" }).click();
  await page.getByRole("button", { name: "Hint 2 (stronger)" }).click();
  await expect(page.getByRole("button", { name: "Show worked step" })).toBeEnabled();
  await page.reload();
  await expect(page.getByText("Which cost repeats for each notebook?")).toBeVisible();
  await page.getByRole("button", { name: "Show worked step" }).click();
  await expect(roadmap.getByText("Solved with help")).toBeVisible();
  await finish(page, solutions[0].slice(1));
  await page.locator(".solution-history summary").filter({ hasText: "Write a cost equation" }).click();
  await page.getByRole("button", { name: "Revise answer" }).click();
  await page.getByLabel("Your answer").fill("17=3x+2");
  await page.getByRole("button", { name: "Verify revision" }).click();
  await expect(roadmap.getByText("Needs recheck")).toHaveCount(3);
  await expect(page.getByRole("heading", { name: "Remove the fixed cost" })).toBeVisible();
});

test("handles loading, whitespace, double submit, errors, uncertainty and special text safely", async ({ page }) => {
  await page.goto("/solve");
  const question = page.getByLabel("Question", { exact: true });
  expect(await question.getAttribute("maxlength")).toBe("4000");
  await question.fill("        ");
  await expect(page.getByRole("button", { name: "Break into steps" })).toBeDisabled();
  let reject = true;
  let calls = 0;
  await page.route("**/api/decompose", async route => {
    calls++;
    if (reject) {
      intentionalBadRequest.add(page);
      await route.fulfill({ status: 400, json: { error: "Check the input and try again." } });
    } else {
      await expect(page.getByText("Preparing your steps…", { exact: true })).toBeVisible();
      await route.fallback();
    }
  });
  const special = "Trace this Python code 😀:\n```\nprint('<img src=x onerror=alert(1)>')\n```";
  await question.fill(special);
  await page.getByRole("button", { name: "Break into steps" }).click();
  await expect(page.getByRole("alert").filter({ hasText: "Check the input" })).toBeVisible();
  reject = false;
  await page.getByRole("button", { name: "Break into steps" }).dblclick();
  await expect(page.getByText(special, { exact: false })).toBeVisible();
  expect(calls).toBe(2);
  expect(await page.locator("img[onerror]").count()).toBe(0);
  const box = page.getByLabel("Your answer");
  await box.fill("   ");
  await expect(page.getByRole("button", { name: "Check answer" })).toBeDisabled();
  await answer(page, "I think the result is 😀");
  await expect(page.getByRole("status").filter({ hasText: "Unverified" })).toBeVisible();
  await expect(page.getByRole("progressbar", { name: "Steps completed" })).toHaveAttribute("value", "0");
  await page.getByRole("button", { name: "Continue without verification" }).click();
  await expect(page.getByRole("heading", { name: "Work through the operation" })).toBeVisible();
  await expect(page.getByRole("list", { name: "Problem steps" }).locator(".skipped")).toContainText("Unverified");
});

test("completes a full lesson with keyboard activation and visible focus", async ({ page }) => {
  await page.goto("/solve");
  await page.getByRole("button", { name: /Trace a running total/ }).press("Enter");
  await page.getByRole("button", { name: "Break into steps" }).press("Enter");
  for (const [index, text] of solutions[2].entries()) {
    const box = page.getByLabel("Your answer");
    await box.pressSequentially(text);
    await page.keyboard.press("Tab");
    const check = page.getByRole("button", { name: "Check answer" });
    await expect(check).toBeFocused();
    expect(await check.evaluate(el => getComputedStyle(el).outlineStyle)).toBe("solid");
    const result = page.waitForResponse(r => r.url().endsWith("/api/check"));
    await page.keyboard.press("Enter");
    expect((await result).ok()).toBe(true);
    if (index < solutions[2].length - 1) await expect(box).toHaveValue("");
  }
  await expect(page.getByRole("heading", { name: "Practice complete." })).toBeVisible();
});

for (const theme of ["light", "dark"] as const) {
  test("axe and layout across all routes in " + theme, async ({ page }) => {
    test.setTimeout(150_000);
    await page.addInitScript(mode => localStorage.setItem("stepwise-theme", mode), theme);
    for (const width of [375, 768, 1280]) {
      await page.setViewportSize({ width, height: 850 });
      for (const path of ["/", "/solve", "/trace", "/evaluate", "/compare", "/about"]) {
        const response = await page.goto(path);
        expect(response?.status()).toBe(200);
        expect(response?.headers()["x-content-type-options"]).toBe("nosniff");
        expect(await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth), path + " at " + width).toBeLessThanOrEqual(1);
        if (width === 1280) {
          const results = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
          expect(results.violations.map(v => ({ id: v.id, impact: v.impact, targets: v.nodes.map(n => n.target) })), theme + " " + path).toEqual([]);
        }
      }
    }
  });
}

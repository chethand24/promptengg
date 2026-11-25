const fs = require("fs");

// Read .env manually
const envText = fs.readFileSync(".env", "utf8");
const env = {};
for (const line of envText.split(/\r?\n/)) {
  const m = line.match(/^([A-Z_]+)=(.*)/);
  if (m) env[m[1]] = m[2].trim();
}

async function main() {
  console.log("=== SIMPLE TEST ===");
  const r1 = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.OPENROUTER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openrouter/free",
      response_format: { type: "json_object" },
      max_tokens: 2048,
      messages: [{ role: "user", content: "Return JSON with keys sum (number 3) and note (string hello)." }],
    }),
  });
  const j1 = await r1.json();
  const c1 = j1.choices && j1.choices[0];
  console.log("STATUS:", r1.status);
  console.log("MODEL:", j1.model);
  console.log("FINISH:", c1 && c1.finish_reason);
  console.log("NATIVE:", c1 && c1.native_finish_reason);
  console.log("ERROR:", JSON.stringify(j1.error));
  console.log("CONTENT:", (c1 && c1.message && c1.message.content || "").slice(0, 300));

  console.log("\n=== STAGE0 TEST ===");
  const tmpl = fs.readFileSync("backend/src/prompts/stage0.v1.txt", "utf8");
  const ctx = JSON.stringify({
    input: {
      problem: "Return sum of two numbers",
      code: "def add(a,b):\n    return a+b",
      language: "python",
      level: "Beginner",
      mode: "Full Breakdown",
    },
  });
  const schema = JSON.stringify({ type: "object", properties: { restatement: { type: "string" }, inputs: { type: "array" }, outputs: { type: "array" }, constraints: { type: "array" }, edgeCases: { type: "array" }, example: { type: "string" }, tests: { type: "array" } }, required: ["restatement", "inputs", "outputs", "constraints", "edgeCases", "example", "tests"] });
  const prompt = tmpl.replace("{{level}}", "Beginner").replace("{{context}}", ctx).replace("{{schema}}", schema);

  const r2 = await fetch("https://openrouter.ai/api/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + env.OPENROUTER_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "openrouter/free",
      response_format: { type: "json_object" },
      max_tokens: 4096,
      messages: [{ role: "user", content: prompt }],
    }),
  });
  const j2 = await r2.json();
  const c2 = j2.choices && j2.choices[0];
  console.log("STATUS:", r2.status);
  console.log("MODEL:", j2.model);
  console.log("FINISH:", c2 && c2.finish_reason);
  console.log("NATIVE:", c2 && c2.native_finish_reason);
  console.log("ERROR:", JSON.stringify(j2.error));
  console.log("USAGE:", JSON.stringify(j2.usage));
  console.log("CONTENT_LEN:", (c2 && c2.message && c2.message.content || "").length);
  console.log("CONTENT:", (c2 && c2.message && c2.message.content || "").slice(0, 500));
}

main().catch(e => { console.error(e); process.exit(1); });


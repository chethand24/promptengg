import { spawn } from "node:child_process";

const env = { ...process.env };
// Playwright sets FORCE_COLOR in its worker environments.
delete env.NO_COLOR;
const child = spawn(process.execPath, ["node_modules/@playwright/test/cli.js", "test", ...process.argv.slice(2)], {
  env, stdio: "inherit",
});
child.on("error", error => { console.error(error.message); process.exitCode = 1; });
child.on("exit", code => { process.exitCode = code ?? 1; });

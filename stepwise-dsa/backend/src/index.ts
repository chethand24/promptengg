import "dotenv/config";
import express from "express";
import { resolve } from "node:path";
import cors from "cors";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { inputSchema, runSchema } from "../../shared/schema.js";
import { analyze } from "./services/pipeline.js";
import {
  start,
  get,
  publicView,
  hint,
  answer,
  metrics,
  locks,
} from "./services/sessions.js";
import { run } from "./services/sandbox.js";
import { providerStatus } from "./services/provider.js";
import { refreshConfiguration } from "./services/configuration.js";
export const app = express();
app.disable("x-powered-by");
app.use(helmet());
app.use(cors({ origin: process.env.CORS_ORIGIN ?? "http://localhost:5173" }));
app.use(express.json({ limit: "100kb" }));
app.use(
  "/api",
  rateLimit({
    windowMs: 60000,
    limit: 30,
    standardHeaders: "draft-8",
    legacyHeaders: false,
  }),
);
app.use("/api", (_req, _res, next) => {
  refreshConfiguration();
  next();
});
app.get("/api/health", (_req, res) =>
  res.json({
    ok: true,
    mock: process.env.MOCK_LLM !== "false",
    ...providerStatus(),
  }),
);
app.post("/api/analyze", async (req, res) => {
  const input = inputSchema.parse(req.body);
  if (input.mode === "Guided Mode") {
    const b = await analyze(input);
    res.json(publicView(await start(b)));
    return;
  }
  if (req.headers.accept?.includes("text/event-stream")) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const timer = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    try {
      const result = await analyze(input, (text) => send("progress", { text }));
      await start(result);
      send("result", result);
    } catch (error) {
      send("error", {
        error: error instanceof Error ? error.message : "Analysis failed",
      });
    } finally {
      clearInterval(timer);
      res.end();
    }
  } else {
    const b = await analyze(input);
    await start(b);
    res.json(b);
  }
});
app.post("/api/guided/start", async (req, res) => {
  const input = inputSchema.parse(req.body);
  const stream = req.headers.accept?.includes("text/event-stream");
  if (stream) {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.flushHeaders();
    const send = (event: string, data: unknown) =>
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    const timer = setInterval(() => res.write(": heartbeat\n\n"), 15000);
    try {
      const b = await analyze({ ...input, mode: "Guided Mode" }, (text) =>
        send("progress", { text }),
      );
      send("result", publicView(await start(b)));
    } catch (e) {
      send("error", {
        error: e instanceof Error ? e.message : "Analysis failed",
      });
    } finally {
      clearInterval(timer);
      res.end();
    }
  } else
    res.json(
      publicView(await start(await analyze({ ...input, mode: "Guided Mode" }))),
    );
});
const sessionRequest = z.object({
  sessionId: z.uuid(),
  stepId: z.string().min(1).max(100),
});
for (const route of ["answer", "hint"])
  app.post("/api/guided/" + route, async (req, res) => {
    const body = (
      route === "answer"
        ? sessionRequest.extend({ answer: z.string().trim().min(1).max(4000) })
        : sessionRequest
    )
      .strict()
      .parse(req.body);
    if (locks.has(body.sessionId)) {
      res.status(409).json({ error: "A request is already in progress." });
      return;
    }
    locks.add(body.sessionId);
    try {
      const s = await get(body.sessionId);
      if (s.queue[s.index]?.id !== body.stepId) {
        res
          .status(409)
          .json({ error: "This step changed. Reload the session." });
        return;
      }
      res.json(
        route === "hint"
          ? await hint(s)
          : await answer(
              s,
              z.object({ answer: z.string() }).parse(body).answer,
            ),
      );
    } finally {
      locks.delete(body.sessionId);
    }
  });
app.get("/api/session/:id/trace", async (req, res) =>
  res.json((await get(req.params.id)).trace),
);
app.get("/api/session/:id", async (req, res) =>
  res.json(publicView(await get(req.params.id))),
);
app.post("/api/run", async (req, res) =>
  res.json(await run(runSchema.parse(req.body))),
);
app.get("/api/metrics", async (_req, res) => res.json(await metrics()));
app.use(express.static(resolve("dist/frontend")));
app.get(["/", "/metrics"], (_req, res) =>
  res.sendFile(resolve("dist/frontend/index.html")),
);
app.use(
  (
    error: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
  ) => {
    const e = error as { code?: string; status?: number };
    res
      .status(
        error instanceof z.ZodError
          ? 400
          : e.code === "ENOENT"
            ? 404
            : e.status === 413
              ? 413
              : e.status === 400
                ? 400
                : 500,
      )
      .json({
        error:
          error instanceof z.ZodError
            ? error.issues.map((i) => i.message).join(" ")
            : error instanceof Error
              ? error.message
              : "Unexpected server error.",
      });
  },
);
app.listen(Number(process.env.PORT ?? 3001), "127.0.0.1", () =>
  console.log("StepWise API: http://localhost:" + (process.env.PORT ?? 3001)),
);

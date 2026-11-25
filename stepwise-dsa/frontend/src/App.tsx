import { useState, useEffect, lazy, Suspense } from "react";
import { z } from "zod";
import {
  BookOpen,
  Sun,
  Moon,
  Play,
  RotateCcw,
  Copy,
  Download,
  Lightbulb,
  Layers,
  BarChart3,
  Code2,
} from "lucide-react";
import { examples } from "../../shared/examples";
import {
  inputSchema,
  traceSchema,
  breakdownSchema,
  publicSessionSchema,
  runResultSchema,
  type Input,
  type Breakdown,
  type PublicSession,
  type Trace,
} from "../../shared/schema";
import { api, stream } from "./api";
import BreakdownView from "./Breakdown";
const CodeEditor = lazy(() => import("./CodeEditor"));
const initial: Input = {
  problem: examples[0].problem,
  code: examples[0].code,
  language: "python",
  level: "Beginner",
  mode: "Full Breakdown",
};
const metricSchema = z.array(
  z.object({
    id: z.string(),
    source: z.string(),
    completed: z.boolean(),
    accuracy: z.number(),
    attempts: z.number(),
    hints: z.number(),
    remedialBranches: z.number(),
    steps: z.array(
      z.object({
        id: z.string(),
        title: z.string(),
        hints: z.number(),
        timeMs: z.number(),
      }),
    ),
  }),
);
function detect(code: string): Input["language"] {
  return /#include|std::/.test(code)
    ? "cpp"
    : /\bclass\s+\w+|\bimport\s+java\.|System\.out/.test(code) &&
        !/\bdef\s/.test(code)
      ? "java"
      : /\bdef |\bimport |\bprint\(/.test(code)
        ? "python"
        : "javascript";
}
function TraceList({ trace }: { trace: Trace[] }) {
  return (
    <>
      <h3>Learning trace</h3>
      {!trace.length && (
        <p>Start Guided Mode to record answers, hints, and practice.</p>
      )}
      {trace.map((t, i) => (
        <div className="trace" key={i}>
          <span className="badge">{t.event}</span>
          <p>
            {t.detail}
            <small>
              {t.hints} hints · {(t.elapsedMs / 1000).toFixed(1)}s
            </small>
          </p>
        </div>
      ))}
    </>
  );
}
export default function App() {
  const [provider, setProvider] = useState<{
    provider: "gemini" | "claude" | "openrouter";
    customCodeReady: boolean;
    demoAvailable: boolean;
  } | null>(null);
  const [checkingProvider, setCheckingProvider] = useState(false);
  async function refreshProvider() {
    setCheckingProvider(true);
    setError("");
    try {
      setProvider(
        await api(
          "/health",
          z.object({
            provider: z.enum(["gemini", "claude", "openrouter"]),
            customCodeReady: z.boolean(),
            demoAvailable: z.boolean(),
          }),
        ),
      );
    } catch {
      setProvider(null);
      setError("Unable to reach the backend. Start it with npm run dev.");
    } finally {
      setCheckingProvider(false);
    }
  }
  useEffect(() => {
    void refreshProvider();
  }, []);
  const [fullTrace, setFullTrace] = useState<Trace[]>([]);
  const [input, setInput] = useState<Input>(initial),
    [dark, setDark] = useState(
      () => localStorage.getItem("stepwise-theme") === "dark",
    ),
    [auto, setAuto] = useState(true),
    [result, setResult] = useState<Breakdown | null>(null),
    [session, setSession] = useState<PublicSession | null>(null),
    [busy, setBusy] = useState(false),
    [progress, setProgress] = useState(""),
    [error, setError] = useState(""),
    [feedback, setFeedback] = useState(""),
    [response, setResponse] = useState(""),
    [lines, setLines] = useState<[number, number]>(),
    [runs, setRuns] = useState<z.infer<typeof runResultSchema> | null>(null),
    [metrics, setMetrics] = useState<z.infer<typeof metricSchema> | null>(null),
    [page, setPage] = useState(
      location.pathname === "/metrics" ? "metrics" : "tutor",
    );
  useEffect(() => {
    document.documentElement.dataset.theme = dark ? "dark" : "light";
    localStorage.setItem("stepwise-theme", dark ? "dark" : "light");
  }, [dark]);
  useEffect(() => {
    const fn = () =>
      setPage(location.pathname === "/metrics" ? "metrics" : "tutor");
    window.addEventListener("popstate", fn);
    return () => window.removeEventListener("popstate", fn);
  }, []);
  useEffect(() => {
    if (page === "metrics")
      api("/metrics", metricSchema)
        .then(setMetrics)
        .catch((e) => setError(e.message));
  }, [page]);
  function navigate(next: string) {
    history.pushState({}, "", next === "metrics" ? "/metrics" : "/");
    setPage(next);
  }
  async function action(fn: () => Promise<void>) {
    if (busy) return;
    setError("");
    setBusy(true);
    try {
      await fn();
    } catch (e) {
      setError(
        e instanceof z.ZodError
          ? e.issues.map((i) => i.message).join(" ")
          : e instanceof Error
            ? e.message
            : "Something went wrong.",
      );
    } finally {
      setBusy(false);
      setProgress("");
    }
  }
  function reset() {
    setFullTrace([]);
    setResult(null);
    setSession(null);
    setRuns(null);
    setFeedback("");
    setResponse("");
    setLines(undefined);
  }
  function load(i: number) {
    reset();
    setInput({
      ...input,
      problem: examples[i].problem,
      code: examples[i].code,
      language: "python",
    });
    setAuto(true);
  }
  async function analyze() {
    await action(async () => {
      const normalized = inputSchema.parse(input);
      setInput(normalized);
      reset();
      if (input.mode === "Guided Mode") {
        const s = await stream(
          "/guided/start",
          normalized,
          publicSessionSchema,
          setProgress,
        );
        setSession(s);
        localStorage.setItem("stepwise-session", s.id);
      } else {
        const b = await stream(
          "/analyze",
          normalized,
          breakdownSchema,
          setProgress,
        );
        setResult(b);
        setFullTrace(await api(`/session/${b.id}/trace`, z.array(traceSchema)));
        localStorage.setItem("stepwise-session", b.id);
      }
    });
  }
  async function guided(kind: "answer" | "hint") {
    if (!session?.step) return;
    await action(async () => {
      const body = {
        sessionId: session.id,
        stepId: session.step!.id,
        ...(kind === "answer" ? { answer: response } : {}),
      };
      if (kind === "hint")
        setSession(await api("/guided/hint", publicSessionSchema, body));
      else {
        const r = await api(
          "/guided/answer",
          z.object({
            session: publicSessionSchema,
            feedback: z.string(),
            verified: z.boolean(),
          }),
          body,
        );
        setSession(r.session);
        setFeedback(r.feedback);
        setResponse("");
      }
    });
  }
  function markdown() {
    if (result)
      return (
        `# StepWise Tutor\n\n${result.understanding.restatement}\n\n` +
        result.steps
          .map((s) => `## ${s.question}\n${s.answer}\n${s.explanation}`)
          .join("\n\n") +
        "\n\n## Structured analysis\n```json\n" +
        JSON.stringify(result.analysis, null, 2) +
        "\n```"
      );
    return (
      "# Guided learning trace\n\n" +
      session?.trace.map((t) => `${t.at} — ${t.event}: ${t.detail}`).join("\n")
    );
  }
  return (
    <div className="app">
      <header className="topbar">
        <a
          className="brand"
          href="/"
          onClick={(e) => {
            e.preventDefault();
            navigate("tutor");
          }}
        >
          <span className="brand-icon">
            <Layers size={22} />
          </span>
          StepWise<span className="brand-sub">/ DSA EDITION</span>
        </a>
        <nav>
          <button
            className={page === "tutor" ? "nav-active" : ""}
            onClick={() => navigate("tutor")}
          >
            Workspace
          </button>
          <button
            className={page === "metrics" ? "nav-active" : ""}
            onClick={() => navigate("metrics")}
          >
            <BarChart3 size={16} />
            Learning metrics
          </button>
        </nav>
        <button
          className="icon"
          aria-label={dark ? "Use light theme" : "Use dark theme"}
          onClick={() => setDark(!dark)}
        >
          {dark ? <Sun size={18} /> : <Moon size={18} />}
        </button>
      </header>
      <main>
        <div className="intro">
          <div>
            <div className="eyebrow">UNDERSTAND THE WHY</div>
            <h1>
              {page === "metrics"
                ? "Your learning, in perspective."
                : "Big problems. Small, clear steps."}
            </h1>
            <p>
              {page === "metrics"
                ? "A record of your practice, hints, and progress."
                : "Turn your solution into a path you can actually follow."}
            </p>
          </div>
          <span className="pill">Least-to-most learning</span>
        </div>
        {provider && page === "tutor" && (
          <section className="callout" aria-label="Custom code support">
            <strong>
              {provider.customCodeReady
                ? "Custom code analysis is configured"
                : "Enable analysis for your own code"}
            </strong>
            <p>
              Paste any Python, Java, C++, or JavaScript solution with its
              matching problem statement. Custom submissions use{" "}
              {provider.provider === "gemini"
                ? "Gemini"
                : provider.provider === "openrouter"
                  ? "OpenRouter"
                  : "Claude"}
              ; the example buttons are optional.
            </p>
            {provider.provider === "gemini" && (
              <p>
                <a
                  href="https://aistudio.google.com/apikey"
                  target="_blank"
                  rel="noreferrer"
                >
                  Get a free-tier Gemini API key
                </a>
                . Keep your project on the Free tier without enabling billing.
                Quotas apply; the app never falls back to a paid provider.
                Free-tier content may be used to improve Google's products.
              </p>
            )}
            {!provider.customCodeReady && (
              <>
                <p>
                  Add your{" "}
                  {provider.provider === "gemini"
                    ? "GEMINI_API_KEY from Google AI Studio"
                    : provider.provider === "openrouter"
                      ? "OPENROUTER_API_KEY"
                      : "ANTHROPIC_API_KEY"}{" "}
                  to <code>stepwise-dsa/.env</code> and set{" "}
                  <code>LLM_MODEL</code>, then click Check connection. Keep the
                  key in that server file only.{" "}
                  {provider.demoAvailable &&
                    "The three demo examples work while you set this up."}
                </p>
                <button disabled={checkingProvider} onClick={refreshProvider}>
                  {checkingProvider ? "Checking…" : "Check connection"}
                </button>
              </>
            )}
          </section>
        )}
        {error && (
          <div className="error" role="alert">
            {error}
          </div>
        )}
        {page === "metrics" ? (
          <section className="panel metrics">
            <h2>Session history</h2>
            <p>
              Accuracy is tutor grading, not code verification. Mock sessions
              use keyword-based grading.
            </p>
            {metrics?.length === 0 && (
              <p>No sessions yet. Start a breakdown to begin.</p>
            )}
            {metrics?.map((m) => (
              <article className="card" key={m.id}>
                <h3>
                  {m.completed ? "Completed" : "In progress"}{" "}
                  <span className="badge">{m.source}</span>
                </h3>
                <div className="metric-grid">
                  <div>
                    <strong>{Math.round(m.accuracy * 100)}%</strong>Answer
                    accuracy
                  </div>
                  <div>
                    <strong>{m.hints}</strong>Hints used
                  </div>
                  <div>
                    <strong>{m.remedialBranches}</strong>Remedial branches
                  </div>
                  <div>
                    <strong>{m.attempts}</strong>Attempts
                  </div>
                </div>
                <details>
                  <summary>Time and hints per step</summary>
                  {m.steps.map((s) => (
                    <p key={s.id}>
                      {s.title} · {s.hints} hints ·{" "}
                      {(s.timeMs / 1000).toFixed(1)} seconds
                    </p>
                  ))}
                </details>
              </article>
            ))}
          </section>
        ) : (
          <div className="workspace">
            <section className="panel input-panel">
              <div className="panel-heading">
                <h2>
                  <Code2 size={18} />
                  Your problem
                </h2>
                <button
                  className="quiet"
                  disabled={busy}
                  onClick={() => {
                    reset();
                    setInput({ ...initial, problem: "", code: "" });
                  }}
                >
                  <RotateCcw size={14} />
                  Start new
                </button>
              </div>
              <div className="input-content">
                <div className="label-row">
                  <span className="label">TRY AN EXAMPLE</span>
                  <span className="muted small">Ready to explore</span>
                </div>
                <div className="seeds">
                  {examples.map((e, i) => (
                    <button
                      disabled={busy}
                      key={e.title}
                      onClick={() => load(i)}
                      className={input.code === e.code ? "selected" : ""}
                    >
                      {e.title}
                    </button>
                  ))}
                </div>
                <label className="field-label" htmlFor="problem">
                  Problem statement
                </label>
                <textarea
                  id="problem"
                  value={input.problem}
                  disabled={busy}
                  onChange={(e) => {
                    reset();
                    setInput({ ...input, problem: e.target.value });
                  }}
                  rows={5}
                  placeholder="Paste the problem, constraints, and an example…"
                />
                <div className="label-row">
                  <label className="field-label" htmlFor="language">
                    Solution code
                  </label>
                  <div className="inline">
                    <label className="small">
                      <input
                        type="checkbox"
                        checked={auto}
                        disabled={busy}
                        onChange={(e) => setAuto(e.target.checked)}
                      />
                      Auto-detect
                    </label>
                    <select
                      id="language"
                      aria-label="Code language"
                      disabled={busy}
                      value={input.language}
                      onChange={(e) => {
                        setAuto(false);
                        reset();
                        setInput({
                          ...input,
                          language: e.target.value as Input["language"],
                        });
                      }}
                    >
                      {["python", "javascript", "java", "cpp"].map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
              <div className="editor">
                <Suspense fallback={<p>Loading code editor…</p>}>
                  <CodeEditor
                    value={input.code}
                    language={input.language}
                    dark={dark}
                    lines={lines}
                    readOnly={busy || !!session}
                    onChange={(code) => {
                      reset();
                      setInput({
                        ...input,
                        code,
                        language: auto ? detect(code) : input.language,
                      });
                    }}
                  />
                </Suspense>
              </div>
              <div className="editor-footer">
                <span>{input.code.split("\n").length} / 300 lines</span>
                <span>
                  {lines
                    ? `Highlighted lines ${lines[0]}–${lines[1]}`
                    : "Line references appear here"}
                </span>
              </div>
              <div className="input-content">
                <div className="settings">
                  <label>
                    Learner level
                    <select
                      aria-label="Learner level"
                      value={input.level}
                      disabled={busy}
                      onChange={(e) => {
                        reset();
                        setInput({
                          ...input,
                          level: e.target.value as Input["level"],
                        });
                      }}
                    >
                      {["Beginner", "Intermediate", "Advanced"].map((l) => (
                        <option key={l}>{l}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Learning mode
                    <select
                      aria-label="Learning mode"
                      value={input.mode}
                      disabled={busy}
                      onChange={(e) => {
                        reset();
                        setInput({
                          ...input,
                          mode: e.target.value as Input["mode"],
                        });
                      }}
                    >
                      <option>Full Breakdown</option>
                      <option>Guided Mode</option>
                    </select>
                  </label>
                </div>
                <button
                  className="primary analyze"
                  disabled={busy}
                  onClick={analyze}
                >
                  <Play size={16} />
                  {busy ? "Working through your solution…" : "Break it down"}
                </button>
                <p className="helper">
                  Build understanding one prerequisite at a time.
                </p>
              </div>
            </section>
            <section className="panel output-panel">
              <div className="panel-heading">
                <h2>
                  <BookOpen size={18} />
                  Your learning path
                </h2>
                <span className="badge">
                  {result?.source === "gemini"
                    ? "Gemini analysis"
                    : result?.source === "openrouter"
                      ? "OpenRouter analysis"
                      : result?.source === "claude"
                        ? "Claude analysis"
                        : result
                          ? "Mock demo"
                          : "DSA TUTOR"}
                </span>
              </div>
              {busy && (
                <div className="progress" role="status">
                  <span className="spinner" />
                  {progress || "Working on this step…"}
                </div>
              )}
              {!result && !session && !busy && (
                <div className="empty">
                  <div className="empty-icon">
                    <Layers size={36} />
                  </div>
                  <span className="eyebrow">FROM CODE TO CLARITY</span>
                  <h2>
                    Don’t just read the solution.
                    <br />
                    Make it click.
                  </h2>
                  <p>
                    Your code becomes a sequence of small discoveries.
                    <br />
                    Start with what you know. Build toward the insight.
                  </p>
                  <div className="empty-path">
                    Understand <span>›</span> Break down <span>›</span> Connect
                  </div>
                  <div className="callout">
                    <Lightbulb size={20} />
                    <strong>Try Guided Mode</strong>
                    <p>
                      Answer a question, uncover a hint, and practice the
                      concepts that need another look.
                    </p>
                  </div>
                  {localStorage.getItem("stepwise-session") && (
                    <button
                      className="quiet"
                      onClick={() =>
                        action(async () => {
                          const s = await api(
                            "/session/" +
                              localStorage.getItem("stepwise-session"),
                            publicSessionSchema,
                          );
                          setInput(s.input);
                          setSession(s);
                        })
                      }
                    >
                      Resume last guided session
                    </button>
                  )}
                </div>
              )}
              {session && (
                <div className="breakdown">
                  <span className="badge">
                    {session.source === "mock"
                      ? "Mock guided practice"
                      : "Guided practice"}{" "}
                    · grading unverified
                  </span>
                  <h2>
                    {session.complete
                      ? "Learning path complete"
                      : `Step ${session.index + 1} of ${session.total}`}
                  </h2>
                  <ol className="stepper">
                    {session.order.map((s) => (
                      <li key={s.id} className={s.status}>
                        <span>
                          {s.status === "done"
                            ? "✓"
                            : s.status === "current"
                              ? "●"
                              : "○"}
                        </span>
                        {s.title}
                      </li>
                    ))}
                  </ol>
                  {session.step && (
                    <article className="card">
                      <span className="badge">
                        {session.step.remedial
                          ? "Remedial practice"
                          : "Your next discovery"}
                      </span>
                      <h3
                        onMouseEnter={() => setLines(session.step!.lines)}
                        onFocus={() => setLines(session.step!.lines)}
                        tabIndex={0}
                      >
                        {session.step.question}
                      </h3>
                      <label htmlFor="answer" className="field-label">
                        Explain in your own words
                      </label>
                      <textarea
                        id="answer"
                        value={response}
                        onChange={(e) => setResponse(e.target.value)}
                        rows={4}
                      />
                      <div className="actions">
                        <button
                          className="primary"
                          disabled={busy || !response.trim()}
                          onClick={() => guided("answer")}
                        >
                          Check my understanding
                        </button>
                        <button
                          disabled={busy || session.step.hintLevel >= 3}
                          onClick={() => guided("hint")}
                        >
                          <Lightbulb size={15} />
                          {session.step.hintLevel === 2
                            ? "Show worked step"
                            : `Hint ${Math.min(3, session.step.hintLevel + 1)}`}
                        </button>
                      </div>
                      {session.step.hint && (
                        <div className="callout">
                          <p>{session.step.hint}</p>
                        </div>
                      )}
                    </article>
                  )}
                  <TraceList trace={session.trace} />
                </div>
              )}
              {result && (
                <BreakdownView
                  data={result}
                  highlight={setLines}
                  trace={<TraceList trace={fullTrace} />}
                  run={() =>
                    action(async () =>
                      setRuns(
                        await api("/run", runResultSchema, {
                          language: input.language,
                          code: input.code,
                          tests: result.understanding.tests,
                        }),
                      ),
                    )
                  }
                />
              )}
              {runs && (
                <div className="callout">
                  <p>{runs.reason}</p>
                  {runs.results.map((r, i) => (
                    <p key={i}>
                      <strong>
                        {r.passed ? "PASS" : "FAIL"} · {r.name}
                      </strong>
                      <br />
                      Expected: {r.expected}
                      <br />
                      Actual: {r.actual || "(no output)"}
                      <br />
                      {r.error}
                    </p>
                  ))}
                  {runs.results.flatMap((r, test) =>
                    r.trace?.length
                      ? [
                          <details key={test}>
                            <summary>Observed Python trace: {r.name}</summary>
                            <div className="table-scroll">
                              <table>
                                <thead>
                                  <tr>
                                    <th>Code line</th>
                                    <th>Runtime values (before line)</th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {r.trace.map((t, i) => (
                                    <tr key={i}>
                                      <td>
                                        <button
                                          onClick={() =>
                                            setLines([t.line, t.line])
                                          }
                                        >
                                          {t.line}
                                        </button>
                                      </td>
                                      <td>
                                        {Object.entries(t.values)
                                          .map(([k, v]) => `${k} = ${v}`)
                                          .join("; ")}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </details>,
                        ]
                      : [],
                  )}
                </div>
              )}
              {feedback && (
                <p className="feedback" role="status">
                  {feedback}
                </p>
              )}
              {(result || session) && (
                <footer className="export">
                  <button
                    disabled={busy}
                    onClick={() =>
                      action(async () => {
                        await navigator.clipboard.writeText(markdown());
                        setFeedback("Copied to clipboard.");
                      })
                    }
                  >
                    <Copy size={14} />
                    Copy Markdown
                  </button>
                  <button onClick={() => window.print()}>
                    <Download size={14} />
                    Export PDF
                  </button>
                  <span className="small muted">
                    Use “Save as PDF” in the print dialog
                  </span>
                </footer>
              )}
            </section>
          </div>
        )}
        <footer className="page-footer">
          <span>StepWise Tutor</span>
          <span>Understand the pattern. Own the solution.</span>
          <button
            className="quiet"
            onClick={() => navigate(page === "metrics" ? "tutor" : "metrics")}
          >
            <BarChart3 size={14} />{" "}
            {page === "metrics" ? "Back to workspace" : "View learning metrics"}
          </button>
        </footer>
      </main>
      {result && (
        <div className="print-only">
          <h1>StepWise Tutor — Full Breakdown</h1>
          <pre>{markdown()}</pre>
        </div>
      )}
    </div>
  );
}

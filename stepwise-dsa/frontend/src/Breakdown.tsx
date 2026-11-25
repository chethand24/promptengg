import { useState } from "react";
import type { Breakdown } from "../../shared/schema";
export const tabs = [
  "Overview",
  "Variables",
  "Logic",
  "Technique",
  "Dry Run",
  "Complexity",
  "Edge Cases",
  "Alternatives",
  "Learning Trace",
];
export default function BreakdownView({
  data,
  highlight,
  run,
  trace,
}: {
  data: Breakdown;
  highlight: (l: [number, number]) => void;
  run: () => void;
  trace: React.ReactNode;
}) {
  const [tab, setTab] = useState("Overview"),
    [index, setIndex] = useState(0);
  const a = data.analysis;
  const line = (l: [number, number]) => ({
    onClick: () => highlight(l),
    onMouseEnter: () => highlight(l),
    onFocus: () => highlight(l),
  });
  const cols = [...new Set(a.dryRun.flatMap((r) => Object.keys(r.values)))];
  return (
    <>
      <div className="tabs" role="tablist" aria-label="Analysis sections">
        {tabs.map((t, i) => (
          <button
            key={t}
            id={"tab" + i}
            role="tab"
            aria-selected={tab === t}
            aria-controls="analysis"
            tabIndex={tab === t ? 0 : -1}
            onClick={() => setTab(t)}
            onKeyDown={(e) => {
              if (["ArrowRight", "ArrowLeft"].includes(e.key)) {
                e.preventDefault();
                const n =
                  (i + (e.key === "ArrowRight" ? 1 : -1) + tabs.length) %
                  tabs.length;
                setTab(tabs[n]);
                document.getElementById("tab" + n)?.focus();
              }
            }}
          >
            {t}
          </button>
        ))}
      </div>
      <div
        className="breakdown"
        id="analysis"
        role="tabpanel"
        aria-labelledby={"tab" + tabs.indexOf(tab)}
      >
        {tab === "Overview" && (
          <>
            <span className="badge" title={a.technique.why}>
              {a.technique.name}
            </span>
            <h2>A smaller step. A stronger understanding.</h2>
            <p>{data.understanding.restatement}</p>
            <div className="columns">
              <section>
                <h4>INPUTS</h4>
                {data.understanding.inputs.map((x) => (
                  <p key={x}>{x}</p>
                ))}
              </section>
              <section>
                <h4>OUTPUTS</h4>
                {data.understanding.outputs.map((x) => (
                  <p key={x}>{x}</p>
                ))}
              </section>
            </div>
            <h4>CONSTRAINTS</h4>
            {data.understanding.constraints.map((x) => (
              <p key={x}>{x}</p>
            ))}
            <div className="callout">
              <strong>The key insight</strong>
              <p>{a.insight}</p>
            </div>
            <h3>Your prerequisite path</h3>
            {data.steps.map((s, i) => (
              <button className="step-card" key={s.id} {...line(s.lines)}>
                <span className="number">{i + 1}</span>
                <div>
                  <h3>{data.decomposition.steps[i].title}</h3>
                  <p>{data.decomposition.steps[i].why_it_is_needed}</p>
                  <p>{s.answer}</p>
                  <small>
                    Lines {s.lines.join("–")} · Prerequisites:{" "}
                    {data.decomposition.steps[i].depends_on.join(", ") ||
                      "None"}
                  </small>
                </div>
              </button>
            ))}
            <h3>Example walkthrough</h3>
            <p>{data.understanding.example}</p>
            <h3>Revise next</h3>
            <p>{a.prerequisites.join(" · ")}</p>
            <h3>Keep practicing</h3>
            {a.practice.map((p) => (
              <p key={p.title}>
                {p.title} <span className="badge">{p.pattern}</span>
              </p>
            ))}
          </>
        )}
        {tab === "Variables" && (
          <>
            <h2>Meet the moving parts</h2>
            {a.variables.map((v) => (
              <button key={v.name} className="card" {...line(v.lines)}>
                <h3>
                  <code>{v.name}</code> <span className="badge">{v.type}</span>
                </h3>
                <p>{v.purpose}</p>
                <dl>
                  <dt>Starts as</dt>
                  <dd>{v.initial}</dd>
                  <dt>Changes by</dt>
                  <dd>{v.changes}</dd>
                  <dt>Why this structure</dt>
                  <dd>{v.why}</dd>
                </dl>
              </button>
            ))}
          </>
        )}
        {tab === "Logic" && (
          <>
            <h2>Follow the flow</h2>
            {a.logic.map((s, i) => (
              <button className="step-card" key={i} {...line(s.lines)}>
                <span className="number">{i + 1}</span>
                <div>
                  <p>{s.text}</p>
                  <small>Lines {s.lines.join("–")}</small>
                </div>
              </button>
            ))}
          </>
        )}
        {tab === "Technique" && (
          <>
            <h2>{a.technique.name}</h2>
            <span className="badge">
              {Math.round(a.technique.confidence * 100)}% model confidence
            </span>
            <h3>Why it fits</h3>
            <p>{a.technique.why}</p>
            <h3>When to choose something else</h3>
            <p>{a.technique.whenNot}</p>
            <div className="callout">{a.insight}</div>
          </>
        )}
        {tab === "Dry Run" && (
          <>
            <h2>Trace the example</h2>
            <span className="badge">Predicted · unverified</span>
            <p>{data.understanding.example}</p>
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Iteration</th>
                    {cols.map((k) => (
                      <th key={k}>{k}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {a.dryRun.map((r, i) => (
                    <tr key={i} className={i === index ? "active-row" : ""}>
                      <td>
                        <button
                          onClick={() => {
                            setIndex(i);
                            highlight(r.lines);
                          }}
                        >
                          {r.iteration}
                        </button>
                      </td>
                      {cols.map((k) => (
                        <td key={k}>{r.values[k] ?? "—"}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p>{a.dryRun[index]?.explanation}</p>
            <div className="actions">
              <button
                disabled={index === 0}
                onClick={() => {
                  setIndex(index - 1);
                  highlight(a.dryRun[index - 1].lines);
                }}
              >
                Previous
              </button>
              <span>
                {index + 1} / {a.dryRun.length}
              </span>
              <button
                disabled={index >= a.dryRun.length - 1}
                onClick={() => {
                  setIndex(index + 1);
                  highlight(a.dryRun[index + 1].lines);
                }}
              >
                Next
              </button>
            </div>
            <h3>Execution checks</h3>
            <p>
              Actual stdout is compared with model-supplied expectations.
              Passing examples are not a correctness proof.
            </p>
            <button onClick={run}>Run in Docker</button>
          </>
        )}
        {tab === "Complexity" && (
          <>
            <h2>What does it cost?</h2>
            <div className="columns">
              <article className="card">
                <h4>TIME</h4>
                <strong>{a.complexity.time}</strong>
              </article>
              <article className="card">
                <h4>SPACE</h4>
                <strong>{a.complexity.space}</strong>
              </article>
            </div>
            {a.complexity.justification.map((j, i) => (
              <button key={i} className="card" {...line(j.lines)}>
                {j.text}
                <small>Lines {j.lines.join("–")}</small>
              </button>
            ))}
          </>
        )}
        {tab === "Edge Cases" && (
          <>
            <h2>Where the solution holds up</h2>
            <span className="badge">
              Correctness: {a.correctness.status} · model assessment
            </span>
            {a.correctness.risks.map((r) => (
              <p key={r}>{r}</p>
            ))}
            {a.edgeCases.map((e) => (
              <article className="card" key={e.case}>
                <span className="badge">{e.handled}</span>
                <h3>{e.case}</h3>
                <p>{e.reason}</p>
              </article>
            ))}
          </>
        )}
        {tab === "Alternatives" && (
          <>
            <h2>Other paths to the answer</h2>
            {a.alternatives.map((x) => (
              <article className="card" key={x.name}>
                <h3>{x.name}</h3>
                <p>{x.approach}</p>
                <span className="badge">
                  Time {x.time} · Space {x.space}
                </span>
                <p>{x.tradeoff}</p>
              </article>
            ))}
            <h3>Cleaner code</h3>
            {a.optimizations.map((o) => (
              <p key={o}>{o}</p>
            ))}
          </>
        )}
        {tab === "Learning Trace" && trace}
      </div>
    </>
  );
}

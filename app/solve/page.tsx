"use client";

import { ArrowLeft, ArrowRight, BookOpen, Check, ChevronDown, GitBranch, Lightbulb, LockKeyhole, PanelRightClose, PanelRightOpen, RotateCcw, Sparkles } from "lucide-react";
import Link from "next/link";
import { useRef, useState, type FormEvent } from "react";
import { SamplePicker } from "@/components/sample-picker";
import { TraceList } from "@/components/trace-list";
import { ApiError, send, useStudy, type Packet } from "@/lib/client";
import { duration, timeLabel } from "@/lib/metrics";
import { domains } from "@/lib/samples";
import type { Domain, PublicStep, Session } from "@/types";

export default function Solve() {
  const [problem, setProblem] = useState("");
  const [domain, setDomain] = useState<Domain | "">("");
  const [sample, setSample] = useState("");
  const [answer, setAnswer] = useState("");
  const [editing, setEditing] = useState<string>();
  const [busy, setBusy] = useState("");
  const pending = useRef(false);
  const [error, setError] = useState("");
  const [conflict, setConflict] = useState(false);
  const [traceOpen, setTraceOpen] = useState(true);
  const [notice, setNotice] = useState("");
  const { sessions, currentId, save, open, rate } = useStudy();
  const packet = currentId ? sessions[currentId] : undefined;
  const session = packet?.session;
  const active = session?.subproblems.find(step => step.status === "active");
  const step = editing ? session?.subproblems.find(step => step.id === editing) : active;
  const latest = session?.attempts.findLast(attempt => attempt.subproblemId === step?.id);
  const hints = session?.hints.filter(hint => hint.subproblemId === step?.id) ?? [];
  const nextHint = (hints.some(hint => hint.level === 2) ? 3 : hints.some(hint => hint.level === 1) ? 2 : 1) as 1 | 2 | 3;
  const key = (source: Packet, stepId: string) => ({ sessionId: source.session.problem.id, stepId, revision: source.revision, checkpoint: source.checkpoint });

  async function run(message: string, operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setError("");
    setConflict(false);
    setNotice("");
    setBusy(message);
    try { await operation(); }
    catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
      setConflict(err instanceof ApiError && err.status === 409);
    } finally {
      pending.current = false;
      setBusy("");
    }
  }

  async function insert(source: Packet, parent: PublicStep) {
    save(await send("remedial", key(source, parent.id)));
    setNotice("The tutor added a short practice step. Finish it to return to your question.");
    setAnswer("");
  }

  function start(event: FormEvent) {
    event.preventDefault();
    if (problem.trim().length < 8) return;
    void run("Preparing your steps…", async () => {
      save(await send("decompose", { text: problem, domain: domain || undefined }));
      setAnswer("");
      setEditing(undefined);
    });
  }

  function check(event: FormEvent) {
    event.preventDefault();
    if (!packet || !step || !answer.trim()) return;
    void run("Checking your answer…", async () => {
      const updated = await send("check", { ...key(packet, step.id), answer, revise: !!editing });
      save(updated);
      setEditing(undefined);
      const outcome = updated.session.attempts.at(-1);
      setNotice(outcome?.result === "correct" ? outcome.feedback : "");
      if (outcome?.result === "correct") setAnswer("");
      if (updated.remedialAvailable && outcome?.result === "incorrect") {
        await insert(updated, step);
        setNotice(outcome.feedback + " Try the practice step below, then return to your question.");
      }
    });
  }

  function hint() {
    if (!packet || !step) return;
    void run("Preparing your hint…", async () => {
      save(await send("hint", { ...key(packet, step.id), level: nextHint }));
      if (nextHint === 3) {
        setNotice("Worked guidance added to your solution history.");
        setAnswer("");
      }
    });
  }

  function advancePractice() {
    if (!packet || !step) return;
    void run("Opening the next step…", async () => {
      save(await send("continue", key(packet, step.id)));
      setAnswer("");
      setNotice("Answer saved as unverified.");
    });
  }

  function revise(item: PublicStep) {
    setEditing(item.id);
    setAnswer(session?.attempts.findLast(attempt => attempt.subproblemId === item.id && attempt.result === "correct")?.studentAnswer ?? "");
    setError("");
    setNotice("");
    document.getElementById("work-card")?.scrollIntoView({ block: "nearest" });
  }

  function reset() {
    open(undefined);
    setEditing(undefined);
    setError("");
    setConflict(false);
    setNotice("");
    setAnswer("");
  }

  if (!session) return <div className="page-width inner-page start-page">
    <div className="section-heading"><p className="eyebrow"><span className="dot" /> Tutor workspace</p><h1>Start a problem.</h1><p>Bring a question or choose a sample to work through.</p></div>
    <div className="start-grid">
      <form className="card editor" onSubmit={start}>
        <div className="card-title"><span className="sample-icon"><BookOpen size={19} /></span><h2>Your problem</h2></div>
        <label htmlFor="problem">Question</label>
        <textarea id="problem" rows={8} minLength={8} maxLength={4000} required value={problem} onChange={event => { setProblem(event.target.value); setSample(""); }} placeholder="Paste a word problem, a code snippet, or an algorithm exercise…" />
        <div className="editor-meta"><label htmlFor="domain">Subject</label><small>{problem.length}/4000</small></div>
        <select id="domain" value={domain} onChange={event => setDomain(event.target.value as Domain | "")}><option value="">Auto-detect</option>{Object.entries(domains).map(([value, name]) => <option value={value} key={value}>{name}</option>)}</select>
        <button className="button" disabled={!!busy || problem.trim().length < 8}>{busy || "Break into steps"} {busy ? <span className="spinner" /> : <ArrowRight size={17} />}</button>
        {busy && <div className="skeleton" aria-hidden="true" />}
        {error && <p role="alert" className="alert error">{error}</p>}
      </form>
      <section className="sample-section"><div className="card-title"><span className="sample-icon amber"><Sparkles size={18} /></span><h2>Try a sample</h2></div><p className="muted">Choose a problem, then break it into steps.</p>
        <SamplePicker selected={sample} onPick={item => { setProblem(item.text); setDomain(item.domain); setSample(item.id); }} />
      </section>
    </div>
  </div>;

  const done = session.subproblems.filter(item => item.status === "solved" || item.status === "skipped").length;
  return <div className="page-width inner-page workspace">
    <div className="workspace-top"><div><p className="eyebrow"><span className="dot" /> {domains[session.problem.domain]}</p><h1>Tutor workspace</h1></div><button className="button secondary" onClick={reset} disabled={!!busy}><ArrowLeft size={16} /> New problem</button></div>
    {session.mode === "practice" && <p className="alert warning">Guided practice is available for this question. For automatic checking in demo mode, choose a built-in sample.</p>}
    <div className={traceOpen ? "work-grid" : "work-grid trace-closed"}>
      <aside className="card roadmap"><h2>Problem</h2><p className="problem-text">{session.problem.text}</p>
        <div className="progress-label"><h3>Your steps</h3><span>{done}/{session.subproblems.length}</span></div>
        <progress value={done} max={session.subproblems.length} aria-label="Steps completed" />
        <ol className="stepper" aria-label="Problem steps">{session.subproblems.map(item => <li key={item.id} className={item.status + (item.type === "remedial" ? " remedial" : "")} aria-current={item.status === "active" ? "step" : undefined}>
          <span>{item.type === "remedial" && item.status !== "solved" ? <GitBranch size={14} /> : item.status === "locked" ? <LockKeyhole size={12} /> : item.status === "solved" ? <Check size={15} /> : item.order}</span>
          <div><strong>{item.title}</strong><small>{item.revisionRequired ? "Needs recheck" : item.solvedWithHelp ? "Solved with help" : item.status === "skipped" ? "Unverified" : item.type === "remedial" ? "Extra practice" : item.status}</small></div>
        </li>)}</ol>
      </aside>
      <div className="work-center">
        <section className="card work-card" id="work-card">
          {notice && <p className="alert success" role="status">{notice}</p>}
          {error && <div className="alert error" role="alert">{error}{conflict && <button className="text-link" disabled={!!busy} onClick={() => void run("Reloading…", async () => { save(await send("resume", { sessionId: session.problem.id, checkpoint: packet.checkpoint })); setEditing(undefined); setAnswer(""); })}>Reload session <RotateCcw size={14} /></button>}</div>}
          {step ? <>
            <p className="eyebrow"><span className="dot" /> {editing ? "Revising a prior answer" : step.type === "remedial" ? "Extra practice" : "Step " + step.order + " of " + session.subproblems.length}</p>
            <h2>{step.title}</h2><p className="step-question">{step.question}</p>
            {step.revisionRequired && <p className="alert warning">An earlier answer changed. Verify this step again.</p>}
            <form className="editor" onSubmit={check}>
              <label htmlFor="answer">Your answer</label>
              <textarea id="answer" rows={3} maxLength={1000} required value={answer} onChange={event => setAnswer(event.target.value)} placeholder="Enter your answer or show your reasoning…" />
              <div className="form-actions"><button className="button" disabled={!!busy || !answer.trim()}>{editing ? "Verify revision" : "Check answer"} <ArrowRight size={17} /></button>
              {editing && <button className="button secondary" type="button" disabled={!!busy} onClick={() => { setEditing(undefined); setAnswer(""); }}>Cancel</button>}</div>
            </form>
            {latest && !editing && latest.result !== "correct" && <div className={"alert " + (latest.result === "uncertain" ? "warning" : "error")}>
              <div role="status"><strong>{latest.result === "uncertain" ? "Unverified" : latest.misconception ?? "Try again"}</strong><p>{latest.feedback}</p></div>
              {session.mode === "practice" && latest.result === "uncertain" && <button className="text-link" type="button" disabled={!!busy} onClick={advancePractice}>Continue without verification <ArrowRight size={16} /></button>}
            </div>}
            {!editing && <div className="hint-area">
              {hints.filter(item => item.level < 3).map(item => <p className="hint-copy" key={item.level}><Lightbulb size={17} /> <span>{item.text}</span></p>)}
              <div className="form-actions"><button className="button secondary" disabled={!!busy} onClick={hint}><Lightbulb size={17} /> {["", "Hint 1 (small clue)", "Hint 2 (stronger)", "Show worked step"][nextHint]}</button>
              {packet.remedialAvailable && active && <button className="button secondary" disabled={!!busy} onClick={() => void run("Preparing practice…", () => insert(packet, active))}><GitBranch size={16} /> Add practice step</button>}</div>
            </div>}
          </> : <Completion session={session} rate={rating => rate(session.problem.id, rating)} />}
          {busy && <div className="pending" role="status"><span className="spinner" /> {busy}<div className="skeleton" aria-hidden="true" /></div>}
        </section>
        <section className="card solution-history"><div className="card-title"><span className="sample-icon"><BookOpen size={16} /></span><h2>Solution history</h2></div>
          {session.attempts.length === 0 && !session.hints.some(hint => hint.level === 3) && <p className="muted">Your submitted answers and worked steps will appear here.</p>}
          {session.subproblems.map(item => {
            const attempts = session.attempts.filter(attempt => attempt.subproblemId === item.id);
            const worked = session.hints.findLast(hint => hint.subproblemId === item.id && hint.level === 3);
            if (!attempts.length && !worked) return null;
            return <details key={item.id}><summary>{item.title} <ChevronDown size={15} /></summary>
              {item.revisionRequired && <p className="alert warning">Needs recheck</p>}
              {attempts.map((attempt, index) => <div className="history-attempt" key={index}><span className={"pill " + attempt.result}>{attempt.result === "uncertain" ? "Unverified" : attempt.result}</span><p>{attempt.studentAnswer}</p><small>{attempt.feedback}</small></div>)}
              {worked && <p className="hint-copy"><Lightbulb size={17} /> <span>{worked.text}</span></p>}
              {item.status === "solved" && <button className="text-link" disabled={!!busy} onClick={() => revise(item)}><RotateCcw size={15} /> Revise answer</button>}
            </details>;
          })}
        </section>
      </div>
      <aside className="card live-trace"><div className="card-title"><h2>{traceOpen ? "Learning trace" : <span className="sr-only">Learning trace</span>}</h2><button className="icon-button" aria-label={traceOpen ? "Hide learning trace" : "Show learning trace"} aria-expanded={traceOpen} onClick={() => setTraceOpen(!traceOpen)}>{traceOpen ? <PanelRightClose size={17} /> : <PanelRightOpen size={17} />}</button></div>
        {traceOpen && <><TraceList session={session} limit={8} /><Link href="/trace" className="text-link">View full trace <ArrowRight size={15} /></Link></>}
      </aside>
    </div>
  </div>;
}

function Completion({ session, rate }: { session: Session; rate: (value: number) => void }) {
  const summary = [[session.attempts.length, "Attempts"], [session.hints.length, "Hints"], [session.trace.filter(item => item.type === "mistake").length, "Mistakes"], [session.subproblems.filter(item => item.type === "remedial").length, "Practice steps"], [timeLabel(duration(session)), "Time"]];
  return <><span className="sample-icon"><Check size={23} /></span><h2>Practice complete.</h2>
    <div className="summary-grid">{summary.map(([value, label]) => <div key={label}><strong>{value}</strong><small>{label}</small></div>)}</div>
    <fieldset className="rating"><legend>Student understanding</legend><p className="muted">How well could you explain your reasoning now?</p><div className="form-actions">{[1, 2, 3, 4, 5].map(value => <button type="button" key={value} aria-label={value + " out of 5"} aria-pressed={session.rating === value} className="button secondary" onClick={() => rate(value)}>{value}</button>)}</div><small>1 means still unsure. 5 means confident.</small></fieldset>
    <Link href="/trace" className="button">Review learning trace <ArrowRight size={17} /></Link>
  </>;
}

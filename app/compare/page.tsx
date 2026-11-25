"use client";

import { ArrowRight, Bot, Lightbulb, Sparkles } from "lucide-react";
import { useRef, useState, type FormEvent } from "react";
import { send, type Packet } from "@/lib/client";
import { samples } from "@/lib/samples";

type Comparison = Packet & { conventional: string | null };

export default function Compare() {
  const [text, setText] = useState<string>(samples[0].text);
  const [data, setData] = useState<Comparison>();
  const [answer, setAnswer] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const step = data?.session.subproblems.find(item => item.status === "active");
  const attempt = data?.session.attempts.findLast(item => item.subproblemId === step?.id);
  const hints = data?.session.hints.filter(item => item.subproblemId === step?.id) ?? [];
  const level = hints.some(item => item.level === 2) ? 3 : hints.length ? 2 : 1;

  async function run(operation: () => Promise<void>) {
    if (pending.current) return;
    pending.current = true;
    setBusy(true);
    setError("");
    try { await operation(); }
    catch (err) { setError(err instanceof Error ? err.message : "Try again."); }
    finally { pending.current = false; setBusy(false); }
  }

  function compare(event: FormEvent) {
    event.preventDefault();
    if (text.trim().length < 8) return;
    void run(async () => {
      setData(await send<Comparison>("compare", { text }));
      setAnswer("");
    });
  }

  function act(action: "check" | "hint") {
    if (!data || !step) return;
    void run(async () => {
      const key = { sessionId: data.session.problem.id, stepId: step.id };
      let updated = await send(action, { ...key, revision: data.revision, checkpoint: data.checkpoint, ...(action === "check" ? { answer } : { level }) });
      setData({ ...updated, conventional: data.conventional });
      if (action === "check" && updated.remedialAvailable) {
        updated = await send("remedial", { ...key, revision: updated.revision, checkpoint: updated.checkpoint });
        setData({ ...updated, conventional: data.conventional });
      }
      if (updated.session.subproblems.find(item => item.status === "active")?.id !== step.id) setAnswer("");
    });
  }

  return <div className="page-width inner-page">
    <div className="section-heading"><p className="eyebrow"><span className="dot" /> Side-by-side demo</p><h1>One question, two approaches.</h1><p>See what each approach gives you, then try answering a guided step.</p></div>
    <form className="card editor compare-input" onSubmit={compare}>
      <label htmlFor="comparison">Question</label><textarea id="comparison" minLength={8} maxLength={4000} required rows={3} value={text} onChange={event => setText(event.target.value)} />
      <div className="form-actions"><button className="button" disabled={busy || text.trim().length < 8}>Compare responses <ArrowRight size={17} /></button>
        <select aria-label="Choose a sample question" value={samples.find(item => item.text === text)?.id ?? ""} onChange={event => { const sample = samples.find(item => item.id === event.target.value); if (sample) setText(sample.text); }}>
          <option value="" disabled>Choose a sample</option>{samples.map(item => <option key={item.id} value={item.id}>{item.title}</option>)}
        </select>
      </div>
      {error && <p role="alert" className="alert error">{error}</p>}
      {busy && <div className="pending" role="status"><span className="spinner" /> Working…</div>}
    </form>
    <div className="compare-grid">
      <section className="card detail-card"><div className="card-title"><span className="sample-icon neutral"><Bot size={20} /></span><h2>Normal chatbot</h2></div><p className="muted">Full solution in one response</p>
        {data ? <><p className="problem-text">{data.session.problem.text}</p><p className="step-question">{data.conventional ?? "A full answer is unavailable for this custom question. Choose a built-in sample to see both responses in demo mode."}</p></> : <p className="alert">Run the comparison to see a response here.</p>}
      </section>
      <section className="card detail-card comparison-guided"><div className="card-title"><span className="sample-icon"><Sparkles size={20} /></span><h2>StepWise</h2></div><p className="muted">One question at a time</p>
        {step ? <>
          <p className="eyebrow">{step.type === "remedial" ? "Extra practice" : "Step " + step.order}</p><h3>{step.title}</h3><p>{step.question}</p>
          <form className="editor" onSubmit={event => { event.preventDefault(); act("check"); }}>
            <label htmlFor="guided-answer">Your answer</label><input id="guided-answer" required maxLength={1000} value={answer} onChange={event => setAnswer(event.target.value)} />
            <div className="form-actions"><button className="button" disabled={busy || !answer.trim()}>Check answer</button><button className="button secondary" type="button" disabled={busy} onClick={() => act("hint")}><Lightbulb size={16} /> {level === 3 ? "Show worked step" : "Hint " + level}</button></div>
          </form>
          {attempt && <p role="status" className={"alert " + (attempt.result === "uncertain" ? "warning" : "error")}>{attempt.result === "uncertain" ? "Unverified. " : ""}{attempt.feedback}</p>}
          {hints.map(item => <p className="hint-copy" key={item.level}><Lightbulb size={16} /><span>{item.text}</span></p>)}
        </> : <p className="alert">{data ? "Guided practice complete." : "Run the comparison to start a guided step."}</p>}
        {data?.session.hints.some(item => item.level === 3) && <details><summary>Worked steps</summary>{data.session.hints.filter(item => item.level === 3).map(item => <p key={item.subproblemId}>{item.text}</p>)}</details>}
      </section>
    </div>
  </div>;
}

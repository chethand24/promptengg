"use client";

import { ArrowRight, NotebookPen } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { TraceList } from "@/components/trace-list";
import { useStudy } from "@/lib/client";
import { domains } from "@/lib/samples";

export default function TracePage() {
  const { sessions, currentId, open } = useStudy();
  const [selected, select] = useState<string>();
  const list = Object.values(sessions).map(packet => packet.session).sort((a, b) => b.startedAt.localeCompare(a.startedAt));
  const id = selected ?? currentId ?? list[0]?.problem.id;
  const session = id ? sessions[id]?.session : undefined;
  return <div className="page-width inner-page">
    <div className="section-heading"><p className="eyebrow"><span className="dot" /> Session history</p><h1>Learning trace.</h1><p>Review the steps, misconceptions, and corrections from your practice.</p></div>
    {!session ? <div className="card empty"><span className="sample-icon"><NotebookPen size={22} /></span><h2>No sessions yet</h2><p className="muted">Begin a problem to start recording your learning trace.</p><Link className="button" href="/solve">Start solving <ArrowRight size={17} /></Link></div> :
      <div className="two-column">
        <aside className="card session-list"><h2>Sessions</h2>{list.map(item => <button key={item.problem.id} className="session-item" aria-pressed={item.problem.id === id} onClick={() => select(item.problem.id)}><small>{domains[item.problem.domain]} · {new Date(item.startedAt).toLocaleDateString()}</small><strong>{item.problem.text}</strong><small>{item.finishedAt ? "Complete" : "In progress"}</small></button>)}</aside>
        <section className="card detail-card"><p className="eyebrow">{session.finishedAt ? "Complete" : "In progress"}</p><h2>Session activity</h2><p className="problem-text">{session.problem.text}</p><TraceList session={session} /><Link className="text-link" href="/solve" onClick={() => open(session.problem.id)}>{session.finishedAt ? "Review solution history" : "Open in tutor"} <ArrowRight size={16} /></Link></section>
      </div>}
  </div>;
}

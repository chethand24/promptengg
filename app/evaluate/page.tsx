"use client";

import { BarChart3, Download, ArrowRight } from "lucide-react";
import Link from "next/link";
import { Bar, BarChart, CartesianGrid, Legend, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { useStudy } from "@/lib/client";
import { activityRows, summarizeActivity, timeLabel } from "@/lib/metrics";

export default function Evaluate() {
  const sessions = useStudy(state => state.sessions);
  const rows = activityRows(Object.values(sessions).map(packet => packet.session));
  const summary = summarizeActivity(rows);
  const metrics = [
    ["Completion accuracy", summary.accuracy === null ? "—" : Math.round(100 * summary.accuracy) + "%"],
    ["Hints per problem", summary.hints?.toFixed(1) ?? "—"],
    ["Mistakes per problem", summary.mistakes?.toFixed(1) ?? "—"],
    ["Remedial steps", summary.remedial],
    ["Average time", summary.time === null ? "—" : timeLabel(summary.time)],
    ["Student understanding", summary.rating === null ? "—" : summary.rating.toFixed(1) + " / 5"],
  ];

  function exportCsv() {
    const header = ["problem", "started_at", "subject", "completed", "steps", "solved_without_worked_step", "hints", "mistakes", "remedial_steps", "time_seconds", "understanding_1_to_5"];
    const lines = rows.map(row => [row.name, row.date, row.domain, row.completed, row.total, row.independent, row.hints, row.mistakes, row.remedial, row.milliseconds === null ? "" : Math.round(row.milliseconds / 1000), row.rating].join(","));
    const url = URL.createObjectURL(new Blob([[header.join(","), ...lines].join("\r\n")], { type: "text/csv;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "stepwise-evaluation.csv";
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return <div className="page-width inner-page">
    <div className="workspace-top"><div className="section-heading"><p className="eyebrow"><span className="dot" /> Practice metrics</p><h1>Evaluation.</h1><p>Review activity from sessions saved in this browser.</p></div><button className="button secondary" disabled={!rows.length} onClick={exportCsv}><Download size={17} /> Export CSV</button></div>
    <div className="metric-grid">{metrics.map(([label, value]) => <div className="card metric" key={label}><p>{label}</p><strong>{value}</strong></div>)}</div>
    <p className="alert warning">Effectiveness requires classroom/user testing; these numbers are indicative, not proof of learning gains.</p>
    {rows.length ? <section className="card detail-card"><h2>Activity by problem</h2><p className="muted">Accuracy counts steps verified without a worked step. Time uses completed sessions.</p>
      <div className="chart"><ResponsiveContainer width="100%" height={320} minWidth={0}><BarChart data={rows} margin={{ top: 10, right: 12, left: -20, bottom: 4 }}>
        <CartesianGrid stroke="var(--border)" vertical={false} /><XAxis dataKey="name" stroke="var(--muted)" /><YAxis allowDecimals={false} stroke="var(--muted)" />
        <Tooltip contentStyle={{ background: "var(--surface)", border: "1px solid var(--border)", borderRadius: 10 }} /><Legend />
        <Bar dataKey="hints" name="Hints" fill="#3e8d70" radius={[4, 4, 0, 0]} /><Bar dataKey="mistakes" name="Mistakes" fill="#bd8334" radius={[4, 4, 0, 0]} /><Bar dataKey="remedial" name="Remedial steps" fill="#777caa" radius={[4, 4, 0, 0]} />
      </BarChart></ResponsiveContainer></div>
      <details><summary>View chart data</summary><div className="table-wrap"><table><thead><tr>{["Problem", "Subject", "Hints", "Mistakes", "Remedial steps"].map(item => <th key={item} scope="col">{item}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.name}><th scope="row">{row.name}</th><td>{row.domain}</td><td>{row.hints}</td><td>{row.mistakes}</td><td>{row.remedial}</td></tr>)}</tbody></table></div></details>
    </section> : <div className="card empty"><span className="sample-icon"><BarChart3 size={22} /></span><h2>No practice data yet</h2><p className="muted">Your activity will appear after starting a tutor session.</p><Link className="button" href="/solve">Start solving <ArrowRight size={17} /></Link></div>}
  </div>;
}

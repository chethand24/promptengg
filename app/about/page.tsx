import { ArrowRight, GitBranch, ListChecks, NotebookPen } from "lucide-react";
import Link from "next/link";

export const metadata = { title: "Methodology" };

export default function AboutPage() {
  return <div className="page-width inner-page about">
    <div className="section-heading"><p className="eyebrow"><span className="dot" /> Methodology</p><h1>Reason through the problem.</h1><p>StepWise Tutor applies Least-to-Most prompting to guided academic practice.</p></div>
    <div className="about-grid">
      <article className="card detail-card"><span className="sample-icon"><ListChecks size={20} /></span><h2>Move from simpler to harder</h2><p>Start with a prerequisite you can answer. StepWise checks your response and unlocks the next available question. Your checked work gives you a starting point for each new step.</p></article>
      <article className="card detail-card"><span className="sample-icon"><GitBranch size={20} /></span><h2>Practice the missing concept</h2><p>When an answer suggests a misconception, the tutor can insert a short exercise before the current step. A sequence of clues and worked guidance gives you additional support.</p></article>
      <article className="card detail-card"><span className="sample-icon"><NotebookPen size={20} /></span><h2>Review your reasoning</h2><p>The learning trace records what you tried, where you asked for help, and how you corrected earlier work. Revising a checked answer reopens steps that depend on it.</p></article>
      <article className="card detail-card"><h2>Limitations</h2><p>Symbolic checks cover supported expression and equation forms. AI judgments can be wrong, and ambiguous answers remain unverified. The six built-in examples have authored solutions. Custom questions in offline mode receive general practice guidance.</p><p>Session history stays in this browser. With an AI provider enabled, the tutor sends problem and answer text to the provider for the requested operation.</p></article>
    </div>
    <Link className="button" href="/solve">Try the tutor <ArrowRight size={17} /></Link>
  </div>;
}

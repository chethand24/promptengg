import { ArrowDown, ArrowRight, ArrowUpRight, Check, CircleHelp, GitBranch, Layers3, ListChecks, LockKeyhole, NotebookPen, Sparkles } from "lucide-react";
import Link from "next/link";

const features = [
  { icon: Layers3, title: "Step-by-step decomposition", body: "Break a complex question into smaller tasks. Each one builds on reasoning you’ve already checked." },
  { icon: ListChecks, title: "Answer verification", body: "Check supported equations and exact answers automatically. Ambiguous responses are marked unverified." },
  { icon: GitBranch, title: "Practice when you get stuck", body: "A wrong turn can add a short exercise on the concept you need, then bring you back to the original step." },
  { icon: CircleHelp, title: "Hints in three levels", body: "Start with a small clue. Request a stronger hint or a worked step when you need more support." },
  { icon: NotebookPen, title: "A learning trace", body: "Review attempts, hints, and corrections. Revise previous answers and revisit the steps that depend on them." },
];

export default function Home() {
  return <>
    <section className="hero page-width">
      <div className="hero-copy">
        <p className="eyebrow"><span className="dot" /> An adaptive problem-solving tutor</p>
        <h1>Learn to solve it.<br /><em>One step at a time.</em></h1>
        <p className="hero-lead">Build the reasoning behind the answer. Work through algebra, programming, and algorithms with a tutor that adapts as you go.</p>
        <div className="hero-actions">
          <Link href="/solve" className="button big">Start solving <ArrowRight size={19} /></Link>
          <Link href="/compare" className="text-link">See the difference <ArrowUpRight size={17} /></Link>
        </div>
      </div>
      <div className="hero-illustration" aria-label="Preview of a four-step algebra lesson">
        <div className="illustration-grid" aria-hidden="true" />
        <div className="preview">
          <div className="preview-top"><span><span className="preview-icon"><NotebookPen size={15} /></span> Algebra practice</span><span className="preview-count">1 of 4 complete</span></div>
          <div className="preview-line"><div /></div>
          <div className="preview-step complete"><span className="preview-state"><Check size={15} /></span><span><b>Write a cost equation</b><small>Completed</small></span></div>
          <div className="preview-step current"><span className="preview-state">2</span><span><b>Remove the fixed cost</b><small>How much do the three notebooks cost together?</small></span></div>
          <div className="preview-step locked"><span className="preview-state"><LockKeyhole size={13} /></span><span><b>Find the unit price</b><small>Unlocks after step 2</small></span></div>
        </div>
        <div className="clue-note"><Sparkles size={17} /> <span><b>A small clue</b><small>Separate the pen’s price from the total.</small></span></div>
      </div>
    </section>
    <section className="method-strip">
      <div className="page-width method-inner">
        <div><p className="eyebrow">The method</p><h2>What is Least-to-Most prompting?</h2></div>
        <p>A conventional chatbot can give you the entire solution in one response. StepWise starts with the simplest piece of reasoning and asks you to try it. Your work on that step prepares you for the next one.</p>
        <Link className="icon-button method-link" href="/about" aria-label="Read about the methodology"><ArrowRight size={22} /></Link>
      </div>
    </section>
    <section className="page-width features">
      <div className="section-heading"><p className="eyebrow">Inside the tutor</p><h2>Support at every step.</h2></div>
      <div className="feature-grid">{features.map(({ icon: Icon, title, body }) => <article key={title} className="card feature"><span className="sample-icon"><Icon size={20} /></span><h3>{title}</h3><p>{body}</p></article>)}</div>
      <Link href="/solve" className="button big">Try a practice problem <ArrowRight size={18} /></Link>
    </section>
    <footer className="footer page-width"><span>StepWise Tutor</span><Link href="/about">Methodology <ArrowUpRight size={15} /></Link><a href="#main" aria-label="Back to top"><ArrowDown size={16} style={{ rotate: "180deg" }} /></a></footer>
  </>;
}

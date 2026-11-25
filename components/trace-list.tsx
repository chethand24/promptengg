import { AlertCircle, Check, GitBranch, Lightbulb, RotateCcw, ShieldQuestion } from "lucide-react";
import type { Session, TraceEvent } from "@/types";

const labels = {
  step_completed: { label: "Step verified", icon: Check },
  mistake: { label: "Misconception", icon: AlertCircle },
  remedial_inserted: { label: "Practice added", icon: GitBranch },
  hint_used: { label: "Hint viewed", icon: Lightbulb },
  correction: { label: "Correction", icon: RotateCcw },
  flagged_uncertain: { label: "Unverified", icon: ShieldQuestion },
} satisfies Record<TraceEvent["type"], { label: string; icon: typeof Check }>;

export function TraceList({ session, limit }: { session: Session; limit?: number }) {
  const trace = limit ? session.trace.slice(-limit).reverse() : session.trace;
  if (!trace.length) return <p className="muted">Attempts, hints, and corrections will appear here as you work.</p>;
  return <ol className="trace-list">{trace.map((event, index) => {
    const { label, icon: Icon } = labels[event.type];
    return <li key={event.timestamp + index} className={event.type}>
      <span className="trace-icon"><Icon size={15} /></span>
      <div><strong>{label}</strong><small>{session.subproblems.find(step => step.id === event.subproblemId)?.title}</small><p>{event.detail}</p><time dateTime={event.timestamp}>{new Date(event.timestamp).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}</time></div>
    </li>;
  })}</ol>;
}

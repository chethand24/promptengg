import { domains } from "@/lib/samples";
import type { Session } from "@/types";

export function duration(session: Session) {
  return Math.max(0, Date.parse(session.finishedAt ?? new Date().toISOString()) - Date.parse(session.startedAt));
}

export function timeLabel(milliseconds: number) {
  const seconds = Math.floor(milliseconds / 1000);
  return seconds < 60 ? seconds + "s" : Math.floor(seconds / 60) + "m " + seconds % 60 + "s";
}

export function activityRows(sessions: Session[]) {
  return [...sessions].sort((a, b) => a.startedAt.localeCompare(b.startedAt)).map((session, index) => ({
    name: "Problem " + (index + 1),
    date: session.startedAt,
    domain: domains[session.problem.domain],
    completed: !!session.finishedAt,
    total: session.subproblems.length,
    independent: session.subproblems.filter(step => step.status === "solved" && !step.solvedWithHelp).length,
    hints: session.hints.length,
    mistakes: session.trace.filter(event => event.type === "mistake").length,
    remedial: session.subproblems.filter(step => step.type === "remedial").length,
    milliseconds: session.finishedAt ? duration(session) : null,
    rating: session.rating ?? null,
  }));
}

type ActivityRow = ReturnType<typeof activityRows>[number];

export function summarizeActivity(rows: ActivityRow[]) {
  const sum = (key: "independent" | "total" | "hints" | "mistakes" | "remedial") => rows.reduce((total, row) => total + row[key], 0);
  const times = rows.flatMap(row => row.milliseconds === null ? [] : [row.milliseconds]);
  const ratings = rows.flatMap(row => row.rating === null ? [] : [row.rating]);
  const mean = (values: number[]) => values.length > 0 ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const total = sum("total");
  return {
    accuracy: total ? sum("independent") / total : null,
    hints: rows.length ? sum("hints") / rows.length : null,
    mistakes: rows.length ? sum("mistakes") / rows.length : null,
    remedial: sum("remedial"),
    time: mean(times),
    rating: mean(ratings),
  };
}

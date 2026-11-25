import type { Attempt, HintUsage, PrivateSession, Session, Subproblem, TraceEvent } from "@/types";

export function publicSession(session: PrivateSession): Session {
  return {
    problem: session.problem, attempts: session.attempts, hints: session.hints, trace: session.trace,
    startedAt: session.startedAt, finishedAt: session.finishedAt, rating: session.rating, mode: session.mode,
    subproblems: session.subproblems.map(step => ({
      id: step.id, order: step.order, title: step.title, question: step.status === "locked" ? "" : step.question,
      prerequisiteIds: step.prerequisiteIds, type: step.type, concept: step.status === "locked" ? "" : step.concept,
      status: step.status, solvedWithHelp: step.solvedWithHelp, revisionRequired: step.revisionRequired,
    })),
  };
}

export function record(session: PrivateSession, step: Subproblem, type: TraceEvent["type"], detail: string) {
  session.trace.push({ type, detail, subproblemId: step.id, timestamp: new Date().toISOString() });
}

function activateNext(session: PrivateSession) {
  if (session.subproblems.some(step => step.status === "active")) return;
  const satisfied = new Set(session.subproblems.filter(step => step.status === "solved" || step.status === "skipped").map(step => step.id));
  const next = session.subproblems.find(step => step.status === "locked" && step.prerequisiteIds.every(id => satisfied.has(id)));
  if (next) next.status = "active";
  if (session.subproblems.every(step => step.status === "solved" || step.status === "skipped")) {
    session.finishedAt = new Date().toISOString();
  }
}

function solve(session: PrivateSession, step: Subproblem, help: boolean, revision = false) {
  const corrected = revision || session.attempts.some(item => item.subproblemId === step.id && item.result === "incorrect");
  step.status = "solved";
  step.solvedWithHelp = help;
  step.revisionRequired = false;
  record(session, step, corrected ? "correction" : "step_completed", help ? "Completed with a worked step." : revision ? "Revised answer verified." : "Answer verified.");
  activateNext(session);
}

export function submitAttempt(session: PrivateSession, step: Subproblem, attempt: Attempt, revise = false) {
  if (revise) {
    const affected = new Set([step.id]);
    for (const item of session.subproblems) {
      if (item.id !== step.id && item.prerequisiteIds.some(id => affected.has(id))) {
        affected.add(item.id);
        item.revisionRequired = item.status === "solved" || item.status === "skipped" || item.revisionRequired;
        item.solvedWithHelp = false;
        item.status = "locked";
      } else if (item.status === "active") {
        item.status = "locked";
      }
    }
    step.status = "active";
    step.solvedWithHelp = false;
    session.finishedAt = undefined;
    session.rating = undefined;
  }

  session.attempts.push(attempt);
  if (attempt.result === "correct") solve(session, step, false, revise);
  else if (attempt.result === "incorrect") record(session, step, "mistake", attempt.misconception ?? attempt.feedback);
  else record(session, step, "flagged_uncertain", "Answer could not be verified.");
}

export function canBranch(session: PrivateSession, step: Subproblem) {
  const last = session.trace.findLast(event => event.subproblemId === step.id && event.type !== "hint_used");
  return step.type === "main" && step.status === "active" && last?.type === "mistake" && (session.branches[step.id] ?? 0) < 2;
}

export function insertRemedial(session: PrivateSession, parent: Subproblem, step: Subproblem) {
  if (!canBranch(session, parent)) return false;
  const count = (session.branches[parent.id] ?? 0) + 1;
  session.branches[parent.id] = count;
  step.prerequisiteIds = [...parent.prerequisiteIds];
  parent.prerequisiteIds = [step.id];
  parent.status = "locked";
  session.subproblems.splice(session.subproblems.indexOf(parent), 0, step);
  session.subproblems.forEach((item, index) => { item.order = index + 1; });
  record(session, parent, "remedial_inserted", "Added practice on " + step.concept.toLowerCase() + ".");
  return true;
}

export function hintsFor(session: Session, stepId: string) {
  return session.hints.filter(item => item.subproblemId === stepId);
}

export function continueUnverified(session: PrivateSession, step: Subproblem, detail: string) {
  step.status = "skipped";
  step.revisionRequired = false;
  record(session, step, "flagged_uncertain", detail);
  activateNext(session);
}

export function giveHint(session: PrivateSession, step: Subproblem, hint: HintUsage) {
  const existing = hintsFor(session, step.id).find(item => item.level === hint.level);
  if (existing && existing.level !== 3) return;
  session.hints.push(hint);
  record(session, step, "hint_used", ["", "Small clue requested.", "Stronger hint requested.", "Worked step viewed."][hint.level]);
  if (hint.level === 3) {
    if (step.verifier.kind === "none") {
      continueUnverified(session, step, "Continued after viewing guidance. This step remains unverified.");
    } else {
      solve(session, step, true);
    }
  }
}

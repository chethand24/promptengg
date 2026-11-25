import { describe, expect, it } from "vitest";
import { canBranch, giveHint, insertRemedial, publicSession, submitAttempt } from "@/lib/session";
import type { Attempt, PrivateSession, Subproblem } from "@/types";

const now = new Date().toISOString();
function step(id: string, status: Subproblem["status"], prerequisiteIds: string[] = []): Subproblem {
  return { id, order: 1, title: id, status, prerequisiteIds, concept: "concept", question: "Question?", expectedAnswerHint: "private answer", verifier: { kind: "exact", payload: "secret" }, type: "main" };
}
function fixture(): PrivateSession {
  return { problem: { id: "test", text: "A sample", domain: "math", createdAt: now }, mode: "demo",
    subproblems: [step("a", "active"), step("b", "locked", ["a"]), step("c", "locked", ["b"])],
    attempts: [], hints: [], trace: [], startedAt: now, branches: {}, revision: 0 };
}
function attempt(session: PrivateSession, item: Subproblem, result: Attempt["result"], revise = false) {
  submitAttempt(session, item, { subproblemId: item.id, studentAnswer: "a submission", result, feedback: "feedback", timestamp: now }, revise);
}

describe("session progression", () => {
  it("inserts one prerequisite per mistake, resumes its parent, and caps branching", () => {
    const session = fixture();
    const [a, b] = session.subproblems;
    for (const id of ["practice1", "practice2"]) {
      attempt(session, a, "incorrect");
      const extra = { ...step(id, "active"), type: "remedial" as const };
      expect(insertRemedial(session, a, extra)).toBe(true);
      expect(canBranch(session, extra)).toBe(false);
      expect(session.subproblems.indexOf(extra)).toBe(session.subproblems.indexOf(a) - 1);
      expect(a.status).toBe("locked");
      attempt(session, extra, "correct");
      expect(a.status).toBe("active");
      expect(canBranch(session, a)).toBe(false);
    }
    attempt(session, a, "incorrect");
    expect(canBranch(session, a)).toBe(false);
    attempt(session, a, "correct");
    expect(b.status).toBe("active");
    expect(session.trace.filter(event => event.type === "remedial_inserted")).toHaveLength(2);
  });

  it("reopens transitive dependents and retains the original attempts", () => {
    const session = fixture();
    const [a, b, c] = session.subproblems;
    for (const item of [a, b, c]) attempt(session, item, "correct");
    expect(session.finishedAt).toBeDefined();
    attempt(session, a, "correct", true);
    expect(b.status).toBe("active");
    expect(c.status).toBe("locked");
    expect([b, c].every(item => item.revisionRequired)).toBe(true);
    expect(session.finishedAt).toBeUndefined();
    expect(session.attempts).toHaveLength(4);
  });

  it("does not advance uncertain answers or expose private fields", () => {
    const session = fixture();
    const [a] = session.subproblems;
    attempt(session, a, "uncertain");
    expect(a.status).toBe("active");
    expect(canBranch(session, a)).toBe(false);
    const response = publicSession(session);
    expect(JSON.stringify(response)).not.toMatch(/private answer|secret|verifier|expectedAnswerHint/);
    expect(response.subproblems[1].question).toBe("");
  });

  it("records a worked step and unlocks the next question", () => {
    const session = fixture();
    const [a, b] = session.subproblems;
    giveHint(session, a, { subproblemId: a.id, level: 3, text: "worked" });
    expect(a.solvedWithHelp).toBe(true);
    expect(b.status).toBe("active");
    expect(session.trace.map(event => event.type)).toEqual(["hint_used", "step_completed"]);
  });
});

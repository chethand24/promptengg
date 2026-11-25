export type Domain = "math" | "programming" | "algorithm";
export type Status = "locked" | "active" | "solved" | "skipped";

export interface Problem {
  id: string;
  domain: Domain;
  text: string;
  createdAt: string;
}

export interface PublicStep {
  id: string;
  order: number;
  title: string;
  question: string;
  prerequisiteIds: string[];
  type: "main" | "remedial";
  concept: string;
  status: Status;
  solvedWithHelp?: boolean;
  revisionRequired?: boolean;
}

export interface Subproblem extends PublicStep {
  expectedAnswerHint: string;
  verifier: { kind: "math" | "exact" | "llm" | "none"; payload: string };
  guidance?: [string, string, string];
}

export interface Attempt {
  subproblemId: string;
  studentAnswer: string;
  result: "correct" | "incorrect" | "uncertain";
  feedback: string;
  misconception?: string;
  confidence?: number;
  timestamp: string;
}

export interface HintUsage {
  subproblemId: string;
  level: 1 | 2 | 3;
  text: string;
}

export interface TraceEvent {
  type: "step_completed" | "mistake" | "remedial_inserted" | "hint_used" | "correction" | "flagged_uncertain";
  subproblemId: string;
  detail: string;
  timestamp: string;
}

export interface Session {
  problem: Problem;
  subproblems: PublicStep[];
  attempts: Attempt[];
  hints: HintUsage[];
  trace: TraceEvent[];
  startedAt: string;
  finishedAt?: string;
  rating?: number;
  mode: "demo" | "ai" | "practice";
}

export interface PrivateSession extends Omit<Session, "subproblems"> {
  subproblems: Subproblem[];
  branches: Record<string, number>;
  revision: number;
}

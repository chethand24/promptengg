import { randomUUID } from "node:crypto";
import type { ZodType } from "zod";
import { openCheckpoint, sealCheckpoint } from "@/lib/checkpoint";
import { revealsAnswer } from "@/lib/guidance";
import { MockProvider, modelOutput } from "@/lib/llm";
import { CHECK_FEEDBACK, COMPARE, DECOMPOSE, HINT, JUDGE, REMEDIAL } from "@/lib/prompts";
import { checkInput, checkpointLimit, decompositionSchema, feedbackSchema, hintInput, judgmentSchema, problemInput, stepSchema, textSchema, actionInput } from "@/lib/schema";
import { detectDomain } from "@/lib/samples";
import { canBranch, continueUnverified, giveHint, hintsFor, insertRemedial, publicSession, submitAttempt } from "@/lib/session";
import { verifyDeterministically } from "@/lib/verify";
import type { Attempt, PrivateSession, Subproblem } from "@/types";

const mock = new MockProvider();
type Cached = { data: PrivateSession; touched: number; busy: boolean };
const runtime = globalThis as typeof globalThis & { stepwiseSessions?: Map<string, Cached>; stepwiseBuckets?: Map<string, { count: number; until: number }> };
const sessions = runtime.stepwiseSessions ??= new Map<string, Cached>();
const buckets = runtime.stepwiseBuckets ??= new Map<string, { count: number; until: number }>();

class RequestError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

function allow(request: Request) {
  const now = Date.now();
  for (const [key, value] of buckets) if (now >= value.until) buckets.delete(key);
  const key = process.env.STEPWISE_TRUST_PROXY === "1" ? request.headers.get("x-real-ip")?.trim() || "local" : "local";
  if (buckets.size >= 3000 && !buckets.has(key)) throw new RequestError("The tutor is busy. Try again shortly.", 429);
  const bucket = buckets.get(key) ?? { count: 0, until: now + 60000 };
  if (++bucket.count > 65) throw new RequestError("Too many requests. Wait a minute and try again.", 429);
  buckets.set(key, bucket);
}

async function input<T>(request: Request, schema: ZodType<T>, limit = 16000): Promise<T> {
  if (!request.body) throw new RequestError("A JSON request is required.", 400);
  const reader = request.body.getReader();
  const decoder = new TextDecoder();
  let body = "";
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new RequestError("This request is too long.", 413);
    }
    body += decoder.decode(value, { stream: true });
  }
  body += decoder.decode();
  try {
    const result = schema.safeParse(JSON.parse(body));
    if (result.success) return result.data;
  } catch {
    // Invalid JSON and invalid fields use the same friendly error.
  }
  throw new RequestError("Check the input and try again.", 400);
}

function packet(session: PrivateSession) {
  const active = session.subproblems.find(step => step.status === "active");
  return { session: publicSession(session), revision: session.revision, checkpoint: sealCheckpoint(session), remedialAvailable: !!active && canBranch(session, active) };
}

const actionBodyLimit = checkpointLimit + 16000;

async function start(problem: { text: string; domain?: PrivateSession["problem"]["domain"] }) {
  const domain = problem.domain ?? detectDomain(problem.text);
  const lesson = mock.lesson(problem.text, domain);
  const ai = lesson ? undefined : await modelOutput(decompositionSchema, DECOMPOSE, { ...problem, domain });
  const drafts = lesson?.steps ?? ai?.steps ?? mock.practice(domain);
  const ids = drafts.map(() => randomUUID());
  const now = new Date().toISOString();
  const data: PrivateSession = {
    problem: { id: randomUUID(), domain, text: problem.text, createdAt: now },
    subproblems: drafts.map((draft, index) => {
      const { prerequisites, ...fields } = { ...draft, prerequisites: ai?.steps[index].prerequisites ?? (index ? [index - 1] : []) };
      return { ...fields, type: "main", id: ids[index], order: index + 1, status: index === 0 ? "active" : "locked", prerequisiteIds: prerequisites.map(i => ids[i]) };
    }),
    attempts: [], hints: [], trace: [], branches: {}, revision: 0, startedAt: now,
    mode: lesson ? "demo" : ai ? "ai" : "practice",
  };
  cache(data);
  return packet(data);
}

function cache(data: PrivateSession) {
  for (const [key, item] of sessions) {
    if (!item.busy && Date.now() - item.touched > 48 * 3600000) sessions.delete(key);
  }
  if (sessions.size >= 500) {
    const oldest = [...sessions.entries()].filter(([, item]) => !item.busy).sort((a, b) => a[1].touched - b[1].touched)[0];
    if (!oldest) throw new RequestError("The tutor is busy. Try again shortly.", 503);
    sessions.delete(oldest[0]);
  }
  const entry = { data, touched: Date.now(), busy: false };
  sessions.set(data.problem.id, entry);
  return entry;
}

function recover(request: { sessionId: string; checkpoint?: string }) {
  const restored = request.checkpoint ? openCheckpoint(request.checkpoint) : undefined;
  if (request.checkpoint && restored?.problem.id !== request.sessionId) throw new RequestError("This session checkpoint is invalid.", 410);
  const existing = sessions.get(request.sessionId);
  if (existing) return existing;
  if (restored?.problem.id !== request.sessionId) throw new RequestError("This session could not be restored. Start a fresh session to continue.", 410);
  return cache(restored);
}

async function mutate(request: { sessionId: string; stepId: string; revision: number; checkpoint?: string; revise?: boolean }, action: (session: PrivateSession, step: Subproblem) => Promise<void>) {
  const cached = recover(request);
  if (cached.busy || cached.data.revision !== request.revision) throw new RequestError("This session changed in another request. Reload the session to continue.", 409);
  const data = structuredClone(cached.data);
  const step = data.subproblems.find(item => item.id === request.stepId);
  if (!step || (request.revise ? step.status !== "solved" : step.status !== "active")) throw new RequestError("Choose an available step first.", 409);
  if (data.trace.length > 500) throw new RequestError("This session has reached its activity limit. Start a fresh problem.", 429);
  cached.busy = true;
  try {
    await action(data, step);
    data.revision += 1;
    const response = packet(data);
    cached.data = data;
    cached.touched = Date.now();
    return response;
  } finally {
    cached.busy = false;
  }
}

const handlers = {
  async resume(request: Request) {
    const payload = await input(request, actionInput.pick({ sessionId: true, checkpoint: true }), actionBodyLimit);
    const cached = recover(payload);
    cached.touched = Date.now();
    return packet(cached.data);
  },
  async decompose(request: Request) { return start(await input(request, problemInput)); },
  async check(request: Request) {
    const payload = await input(request, checkInput, actionBodyLimit);
    return mutate(payload, async (session, step) => {
      let confidence: number | undefined;
      let result = verifyDeterministically(payload.answer, step.verifier);
      if (step.verifier.kind === "llm") {
        const judgment = await modelOutput(judgmentSchema, JUDGE, { question: step.question, rubric: step.verifier.payload, answer: payload.answer });
        confidence = judgment?.confidence ?? 0;
        result = judgment && confidence >= 0.8 ? judgment.result : "uncertain";
      }
      const fallback = result === "correct" ? { feedback: "That answer checks out." } :
        result === "uncertain" ? { feedback: session.mode === "practice"
          ? "Your answer was saved. Guided practice cannot grade this question. You can continue to the next step."
          : "This answer could not be verified. Try explaining your reasoning or use a hint." } :
        { feedback: "Recheck the part of your reasoning about " + step.concept.toLowerCase() + ", then try again.", misconception: step.concept };
      const feedback = result === "incorrect" && session.mode === "ai" ?
        await modelOutput(feedbackSchema, CHECK_FEEDBACK, { question: step.question, concept: step.concept, answer: payload.answer, verdict: result }) : undefined;
      const safeFeedback = feedback && !revealsAnswer(feedback.feedback + " " + (feedback.misconception ?? ""), step.verifier) ? feedback : fallback;
      const attempt: Attempt = { subproblemId: step.id, studentAnswer: payload.answer, result, ...safeFeedback, confidence, timestamp: new Date().toISOString() };
      submitAttempt(session, step, attempt, payload.revise);
    });
  },
  async continue(request: Request) {
    const payload = await input(request, actionInput, actionBodyLimit);
    return mutate(payload, async (session, step) => {
      const latest = session.attempts.findLast(attempt => attempt.subproblemId === step.id);
      if (session.mode !== "practice" || step.verifier.kind !== "none" || latest?.result !== "uncertain") {
        throw new RequestError("Submit an answer to the current guided-practice step first.", 409);
      }
      continueUnverified(session, step, "Saved the answer and continued without verification.");
    });
  },
  async remedial(request: Request) {
    const payload = await input(request, actionInput, actionBodyLimit);
    return mutate(payload, async (session, parent) => {
      if (!canBranch(session, parent)) throw new RequestError("A practice step is unavailable for this attempt.", 409);
      const misconception = session.attempts.findLast(item => item.subproblemId === parent.id)?.misconception;
      const draft = (session.mode === "ai" ? await modelOutput(stepSchema, REMEDIAL, { question: parent.question, concept: parent.concept, misconception }) : undefined) ?? mock.remedial(parent.concept);
      insertRemedial(session, parent, { ...draft, type: "remedial", id: randomUUID(), order: parent.order, status: "active", prerequisiteIds: [] });
    });
  },
  async hint(request: Request) {
    const payload = await input(request, hintInput, actionBodyLimit);
    return mutate(payload, async (session, step) => {
      const hints = hintsFor(session, step.id);
      if (payload.level > 1 && !hints.some(hint => hint.level === payload.level - 1)) throw new RequestError("Open the earlier hint first.", 409);
      const existing = hints.find(hint => hint.level === payload.level);
      const authored = step.guidance?.[payload.level - 1];
      const generated = !existing && !authored && session.mode === "ai"
        ? await modelOutput(textSchema, HINT, { question: step.question, concept: step.concept, level: payload.level, ...(payload.level === 3 ? { solution: step.expectedAnswerHint } : {}) }) : undefined;
      const fallback = payload.level === 1 ? "Identify the information given and the quantity or state this step asks for." :
        payload.level === 2 ? "Write the relationship between the relevant inputs and apply it to the values from your earlier work." : step.expectedAnswerHint;
      const guidance = existing?.text ?? authored ?? generated?.text;
      const safeGuidance = guidance && (payload.level === 3 || !revealsAnswer(guidance, step.verifier)) ? guidance : fallback;
      giveHint(session, step, { subproblemId: step.id, level: payload.level, text: safeGuidance });
    });
  },
  async compare(request: Request) {
    const problem = await input(request, problemInput);
    const domain = problem.domain ?? detectDomain(problem.text);
    const [guided, conventional] = await Promise.all([
      start({ ...problem, domain }),
      Promise.resolve(mock.lesson(problem.text, domain)?.answer).then(async answer =>
        answer ?? (await modelOutput(textSchema, COMPARE, { ...problem, domain }))?.text),
    ]);
    return { ...guided, conventional: conventional ?? null };
  },
};

export async function dispatch(request: Request, name: string) {
  try {
    if (!Object.hasOwn(handlers, name)) throw new RequestError("This tutor operation does not exist.", 404);
    allow(request);
    return Response.json(await handlers[name as keyof typeof handlers](request), { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    if (error instanceof RequestError) return Response.json({ error: error.message }, { status: error.status });
    console.error("Tutor operation failed:", name, error instanceof Error ? error.name : "unknown");
    return Response.json({ error: "The tutor couldn't finish that request. Try again." }, { status: 500 });
  }
}

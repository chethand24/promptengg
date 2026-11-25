import { describe, expect, it } from "vitest";
import { samples } from "@/lib/samples";
import { dispatch } from "@/lib/server";
import type { Session } from "@/types";

type Packet = { session: Session; revision: number; remedialAvailable: boolean };

function request(action: string, payload: unknown) {
  return dispatch(new Request("http://localhost/api/" + action, { method: "POST", body: JSON.stringify(payload) }), action);
}

async function success(action: string, payload: unknown): Promise<Packet> {
  const response = await request(action, payload);
  expect(response.status).toBe(200);
  return response.json();
}

function key(packet: Packet, status: "active" | "locked" = "active") {
  return {
    sessionId: packet.session.problem.id,
    revision: packet.revision,
    stepId: packet.session.subproblems.find(step => step.status === status)?.id,
  };
}

describe("tutor API", () => {
  it("runs a complete authored lesson with practice, hints, and a revision", async () => {
    const started = await success("decompose", { text: samples[0].text });
    expect(started.session.mode).toBe("demo");
    expect(JSON.stringify(started)).not.toMatch(/expectedAnswerHint|verifier|3x\+2=17/);
    expect((await request("hint", { ...key(started, "locked"), level: 1 })).status).toBe(409);
    expect((await request("hint", { ...key(started), level: 3 })).status).toBe(409);

    const checked = await success("check", { ...key(started), answer: "3x=17" });
    expect(checked.remedialAvailable).toBe(true);
    const practice = await success("remedial", key(checked));
    expect(practice.session.subproblems[0].type).toBe("remedial");
    const returned = await success("check", { ...key(practice), answer: "2p+3" });
    expect(key(returned).stepId).toBe(key(started).stepId);

    let packet = returned;
    for (const level of [1, 2, 3]) packet = await success("hint", { ...key(packet), level });
    expect(packet.session.subproblems.find(step => step.id === key(started).stepId)?.solvedWithHelp).toBe(true);
    expect(packet.session.hints.map(hint => hint.level)).toEqual([1, 2, 3]);
    for (const answer of ["15", "5", "17"]) packet = await success("check", { ...key(packet), answer });
    expect(packet.session.finishedAt).toBeDefined();

    const revised = await success("check", { ...key(packet), stepId: key(started).stepId, answer: "3x+2=17", revise: true });
    expect(revised.session.subproblems.filter(step => step.revisionRequired)).toHaveLength(3);
    expect(revised.session.finishedAt).toBeUndefined();
    expect((await request("check", { ...key(returned), answer: "3x+2=17" })).status).toBe(409);
  });

  it("supports all six samples without requiring model judgment", async () => {
    const answers = [
      ["3x+2=17", "15", "5", "17"], ["c+4", "3c+4=25", "7", "11"],
      ["0", "2", "2", "10"], ["7", "5", "12"],
      ["2", "3", "4", "3"], ["[2, 4, 5, 1]", "[2, 4, 5, 1]", "[1, 2, 4, 5]"],
    ];
    for (const [index, sample] of samples.entries()) {
      let packet = await success("decompose", { text: sample.text });
      for (const answer of answers[index]) packet = await success("check", { ...key(packet), answer });
      expect(packet.session.finishedAt).toBeDefined();
      expect(packet.session.attempts.every(attempt => attempt.result === "correct")).toBe(true);
    }
  });
});

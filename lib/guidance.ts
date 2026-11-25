import type { Subproblem } from "@/types";

const number = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)$/;
const compact = (value: string) => value.normalize("NFKC").toLowerCase().replace(/\s+/g, "").replace(/[−–]/g, "-");

// Keep literal answers out of assistant-generated clues and incorrect feedback.
export function revealsAnswer(message: string, verifier: Subproblem["verifier"]) {
  if (verifier.kind !== "math" && verifier.kind !== "exact") return false;
  const answer = compact(verifier.payload);
  if (!answer) return false;
  if (number.test(answer)) {
    return (message.normalize("NFKC").replace(/[−–]/g, "-").match(/[-+]?(?:\d+(?:\.\d*)?|\.\d+)/g) ?? [])
      .some(value => Number(value) === Number(answer));
  }
  if (/^[a-z][a-z ]*$/i.test(verifier.payload)) {
    const words = verifier.payload.trim().toLowerCase().split(/\s+/);
    return new RegExp("\\b" + words.join("\\s+") + "\\b", "i").test(message);
  }
  return compact(message).includes(answer);
}

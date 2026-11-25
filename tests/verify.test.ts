import { describe, expect, it } from "vitest";
import { verifyDeterministically, verifyMath } from "@/lib/verify";

describe("math verification", () => {
  it.each([
    ["2(x + 3)", "2x + 6"], ["2x + 4 = 34", "3x + 2 = 47"], ["17 = 3x + 2", "3x + 2 = 17"],
    ["x = 5", "5"], ["5", "5 = x"], ["0.3333333333", "1/3"], ["$5.00", "5"], ["(x+1)²", "x^2+2x+1"],
    ["  x = 5.0   ", "5.00"], ["-0.75", "-3/4"], [" −5 ", "-10/2"],
  ])("accepts %s as equivalent to %s", (answer, expected) => expect(verifyMath(answer, expected)).toBe(true));

  it.each([
    ["3x + 2 = 16", "3x + 2 = 17"], ["5", "3x + 2 = 17"], ["0=0", "x=5"],
    ["5=5", "5"], ["5=5=5", "5"], ["1/0", "5"], ["1e400", "1e400-1e400+5"],
    ["2y + 6", "2x + 6"], ["x/x", "1"], ["2x+6.01", "2x+6"],
    ["evaluate('5')", "5"], ["x^2", "x"],
    ["", "5"], ["     ", "5"], ["5".repeat(10000), "5"],
  ])("does not accept %s for %s", (answer, expected) => expect(verifyMath(answer, expected)).not.toBe(true));

  it("returns uncertain for unsupported reference equations", () => {
    expect(verifyMath("x=2", "x^2=4")).toBeUndefined();
  });

  it("normalizes exact array output and exact numeric inputs without coercing arbitrary text", () => {
    expect(verifyDeterministically("[2, 4, 5, 1]", { kind: "exact", payload: "2,4,5,1" })).toBe("correct");
    expect(verifyDeterministically("05.00", { kind: "exact", payload: "5" })).toBe("correct");
    expect(verifyDeterministically("0x5", { kind: "exact", payload: "5" })).toBe("incorrect");
    expect(verifyDeterministically("anything", { kind: "none", payload: "open" })).toBe("uncertain");
  });
});

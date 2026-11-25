import { parse, type MathNode, type ConstantNode, type OperatorNode, type ParenthesisNode, type SymbolNode } from "mathjs";
import type { Attempt, Subproblem } from "@/types";

type Polynomial = number[];
const MAX_DEGREE = 12;
const close = (a: number, b: number) => Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a), Math.abs(b));

function normalize(text: string) {
  return text.trim().replace(/^[\$£€]\s*/, "").replace(/[−–]/g, "-").replace(/×/g, "*").replace(/÷/g, "/").replace(/²/g, "^2").replace(/³/g, "^3");
}

function sum(a: Polynomial, b: Polynomial, sign = 1): Polynomial {
  return Array.from({ length: Math.max(a.length, b.length) }, (_, i) => (a[i] ?? 0) + sign * (b[i] ?? 0));
}

function product(a: Polynomial, b: Polynomial): Polynomial {
  if (a.length + b.length - 2 > MAX_DEGREE) throw new Error("Degree exceeded");
  const result = Array<number>(a.length + b.length - 1).fill(0);
  a.forEach((left, i) => b.forEach((right, j) => { result[i + j] += left * right; }));
  return result;
}

function polynomial(node: MathNode, variable: { name?: string }): Polynomial {
  switch (node.type) {
    case "ParenthesisNode":
      return polynomial((node as ParenthesisNode).content, variable);
    case "ConstantNode": {
      const value = (node as ConstantNode).value;
      if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("Invalid number");
      return [value];
    }
    case "SymbolNode": {
      const name = (node as SymbolNode).name;
      if (name === "pi") return [Math.PI];
      if (name === "e") return [Math.E];
      if (!/^[a-z]$/i.test(name) || (variable.name && name !== variable.name)) throw new Error("Unsupported variable");
      variable.name = name;
      return [0, 1];
    }
    case "OperatorNode": {
      const operation = node as OperatorNode;
      const [left, right] = operation.args.map(arg => polynomial(arg, variable));
      switch (operation.op) {
        case "+": return right ? sum(left, right) : left;
        case "-": return right ? sum(left, right, -1) : left.map(item => -item);
        case "*": return product(left, right);
        case "/":
          if (right.length !== 1 || right[0] === 0) throw new Error("Unsupported denominator");
          return left.map(item => item / right[0]);
        case "^": {
          const exponent = right[0];
          if (right.length !== 1 || !Number.isInteger(exponent) || exponent < 0 || exponent > MAX_DEGREE) throw new Error("Unsupported exponent");
          let result = [1];
          for (let i = 0; i < exponent; i++) result = product(result, left);
          return result;
        }
      }
    }
  }
  throw new Error("Unsupported expression");
}

function read(input: string) {
  const text = normalize(input);
  if (text.length > 250 || !text) throw new Error("Invalid expression length");
  const parts = text.split("=");
  if (parts.length > 2) throw new Error("Invalid equation");
  const variable: { name?: string } = {};
  const left = polynomial(parse(parts[0]), variable);
  const right = parts[1] === undefined ? undefined : polynomial(parse(parts[1]), variable);
  const coefficients = right ? sum(left, right, -1) : left;
  if (!coefficients.every(Number.isFinite)) throw new Error("Non-finite result");
  while (coefficients.length > 1 && coefficients.at(-1) === 0) coefficients.pop();
  const root = right && coefficients.length === 2 ? -coefficients[0] / coefficients[1] : undefined;
  const assignment = parts.length === 2 && parts.some(part => /^[a-z]$/i.test(part.trim()) && !/^[ei]$/i.test(part.trim()));
  return { coefficients, variable: variable.name, equation: !!right, root, assignment };
}

export function verifyMath(answer: string, expected: string): boolean | undefined {
  let reference;
  try { reference = read(expected); } catch { return undefined; }
  if (reference.equation && reference.root === undefined) return undefined;

  try {
    const input = read(answer);
    if (input.variable && reference.variable && input.variable !== reference.variable) return false;
    if (reference.equation && input.equation) {
      return input.root !== undefined && Number.isFinite(input.root) && Number.isFinite(reference.root) && close(input.root, reference.root!);
    }
    if (reference.equation !== input.equation) {
      const equation = reference.equation ? reference : input;
      const scalar = reference.equation ? input : reference;
      return equation.assignment && equation.root !== undefined && Number.isFinite(equation.root) &&
        !scalar.variable && close(equation.root, scalar.coefficients[0]);
    }
    return sum(input.coefficients, reference.coefficients, -1)
      .every((_, index) => close(input.coefficients[index] ?? 0, reference.coefficients[index] ?? 0));
  } catch {
    return false;
  }
}

export function verifyDeterministically(answer: string, verifier: Subproblem["verifier"]): Attempt["result"] {
  if (verifier.kind === "math") {
    const result = verifyMath(answer, verifier.payload);
    return result === undefined ? "uncertain" : result ? "correct" : "incorrect";
  }
  if (verifier.kind === "exact") {
    const clean = (value: string) => value.trim().toLowerCase().replace(/^\[(.*)]$/, "$1").replace(/\s*,\s*/g, ",").replace(/\s+/g, " ");
    const a = clean(answer);
    const b = clean(verifier.payload);
    const numeric = /^[-+]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[-+]?\d+)?$/;
    return a === b || (numeric.test(a) && numeric.test(b) && Number.isFinite(Number(a)) && Number(a) === Number(b)) ? "correct" : "incorrect";
  }
  return "uncertain";
}

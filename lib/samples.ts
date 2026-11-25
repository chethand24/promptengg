import type { Domain } from "@/types";

export const domains: Record<Domain, string> = {
  math: "Algebra", programming: "Programming", algorithm: "Algorithms",
};

export const samples = [
  { id: "notebooks", domain: "math", title: "The notebook bundle", text: "Three identical notebooks and a $2 pen cost $17 in total. How much does one notebook cost?" },
  { id: "tickets", domain: "math", title: "A trip to the cinema", text: "An adult cinema ticket costs $4 more than a child ticket. One adult ticket and two child tickets cost $25 total. What does each ticket cost?" },
  { id: "loop", domain: "programming", title: "Trace a running total", text: "Trace this Python code and give its output:\n\ntotal = 0\nfor n in [2, 5, 8]:\n    if n % 2 == 0:\n        total += n\nprint(total)" },
  { id: "swap", domain: "programming", title: "Follow the assignments", text: "What does this Python code print?\n\na = 3\nb = 7\na, b = b, a\nb = b + 2\nprint(a + b)" },
  { id: "binary", domain: "algorithm", title: "Find a value with binary search", text: "Use binary search to find 13 in [2, 5, 8, 13, 21, 34]. Use zero-based indices and round the midpoint down. Which index contains 13?" },
  { id: "sort", domain: "algorithm", title: "Walk through insertion sort", text: "Use insertion sort to sort [4, 2, 5, 1] in ascending order. Show the array after each insertion." },
] as const;

export function detectDomain(text: string): Domain {
  if (/binary search|sort|shortest path|dijkstra|graph|algorithm|complexity/i.test(text)) return "algorithm";
  if (/print\(|console\.log|python|javascript|\bcode\b|\bloop\b|\bfunction\b/i.test(text)) return "programming";
  return "math";
}

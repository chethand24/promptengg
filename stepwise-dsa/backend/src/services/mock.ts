import { examples } from "../../../shared/examples.js";
import type { Input, Step } from "../../../shared/schema.js";
export function mock(name: string, c: Record<string, unknown>): unknown {
  const input = c.input as Input;
  const idx = examples.findIndex(
    (e) => e.code.trim() === input.code.trim() && e.problem === input.problem,
  );
  if (idx < 0 || input.language !== "python")
    throw new Error(
      "Mock mode supports the three unchanged Python seed examples. Load an example, or set MOCK_LLM=false for your own code.",
    );
  const binary = idx === 1,
    dp = idx === 2;
  const end = input.code.split("\n").length;
  const titles = dp
    ? [
        "Identify the base cases",
        "Combine smaller stair counts",
        "Keep only two previous results",
      ]
    : binary
      ? [
          "Define the search interval",
          "Choose and compare the midpoint",
          "Discard the impossible half",
        ]
      : [
          "Remember earlier elements",
          "Find the missing complement",
          "Return distinct indices",
        ];
  const answers = dp
    ? [
        "There is one way to reach stair 0 and one way to reach stair 1.",
        "Ways to n equal ways to n-1 plus ways to n-2.",
        "Previous and current are updated together, using the old values.",
      ]
    : binary
      ? [
          "Left starts at 0 and right starts at len(nums)-1.",
          "The midpoint is (left + right) // 2.",
          "If the middle value is smaller than target, move left to mid+1; otherwise move right to mid-1.",
        ]
      : [
          "A dictionary maps each previously visited value to its index.",
          "Subtract the current value from target to find the complement.",
          "Check the dictionary before inserting the current index, so the two indices are distinct.",
        ];
  const questions = dp
    ? [
        "How many ways reach stairs 0 and 1?",
        "How can the counts for the two previous stairs give the next count?",
        "Why can we keep only two counts instead of an entire array?",
      ]
    : binary
      ? [
          "What are the initial inclusive search bounds?",
          "How do we calculate the midpoint without a fractional index?",
          "If nums[mid] is less than target, which boundary changes and why?",
        ]
      : [
          "What should the dictionary store for each earlier value?",
          "Given target 9 and current value 7, what value do we look up?",
          "Why do we look up the complement before storing the current element?",
        ];
  const step = (i: number): Step => ({
    id: `s${i + 1}`,
    question: questions[i],
    answer: answers[i],
    explanation:
      answers[i] +
      " This result supplies the next step with the information it needs.",
    lines: [Math.min(i + 2, end), Math.min(i + 4, end)],
    hints: [
      [
        "Think about the information needed later.",
        "Express the missing quantity using what you know.",
        "Consider what must remain true after an update.",
      ][i],
      [
        "Focus on the initial state or stored information.",
        "Use the relation between the current value and the goal.",
        "Check which old values are still needed.",
      ][i],
    ],
  });
  if (name === "stage0")
    return {
      restatement: input.problem,
      inputs: dp
        ? ["An integer n, 1 through 45"]
        : ["Array nums", "Integer target"],
      outputs: [
        dp
          ? "Number of ways"
          : binary
            ? "Target index or -1"
            : "Two distinct indices",
      ],
      constraints: dp
        ? ["1 <= n <= 45"]
        : binary
          ? ["Array is sorted ascending"]
          : ["Exactly one pair exists"],
      edgeCases: dp
        ? ["n=1", "n=2"]
        : [
            "Empty array if allowed",
            "Duplicate values",
            "Absent target if allowed",
          ],
      example: dp
        ? "n=5: counts 1, 1, 2, 3, 5, 8 → 8"
        : binary
          ? "[1,3,5,7,9], target=7: mid=2, then mid=3 → 3"
          : "[2,7,11,15], target=9: remember 2 at index 0; 7 needs 2 → [0,1]",
      tests: dp
        ? [
            { name: "Example", input: "5", expected: "8" },
            { name: "Base case", input: "1", expected: "1" },
          ]
        : binary
          ? [
              {
                name: "Example",
                input: '{"nums":[1,3,5,7,9],"target":7}',
                expected: "3",
              },
              {
                name: "Absent",
                input: '{"nums":[1,3],"target":2}',
                expected: "-1",
              },
            ]
          : [
              {
                name: "Example",
                input: '{"nums":[2,7,11,15],"target":9}',
                expected: "[0, 1]",
              },
              {
                name: "Duplicates",
                input: '{"nums":[3,3],"target":6}',
                expected: "[0, 1]",
              },
            ],
    };
  if (name === "stage1")
    return {
      steps: titles.map((title, i) => ({
        id: `s${i + 1}`,
        title,
        why_it_is_needed: answers[i],
        depends_on: i ? [`s${i}`] : [],
      })),
    };
  if (name === "stage2")
    return step(Number((c.subproblem as { id: string }).id.slice(1)) - 1);
  if (name === "evaluation") {
    const a = String(c.answer).toLowerCase();
    const ref = c.step as Step;
    let correct = false;
    if (ref.id.startsWith("r")) correct = /2|two/.test(a);
    else if (dp)
      correct =
        ref.id === "s1"
          ? /one|1/.test(a)
          : ref.id === "s2"
            ? /add|sum|\+/.test(a)
            : /two|2|previous/.test(a);
    else if (binary)
      correct =
        ref.id === "s1"
          ? /0/.test(a) && /len|last|length/.test(a)
          : ref.id === "s2"
            ? /left/.test(a) && /right/.test(a) && /2/.test(a)
            : /left/.test(a) && /mid/.test(a);
    else
      correct =
        ref.id === "s1"
          ? /index|indices/.test(a) && /value|number/.test(a)
          : ref.id === "s2"
            ? /2|two/.test(a)
            : /same|distinct|itself|reuse|different/.test(a);
    return {
      correct,
      feedback: correct
        ? "This matches the demo reference. Demo grading is keyword-based and unverified."
        : "Let’s revisit a smaller prerequisite. Demo grading is keyword-based and unverified.",
      misconception: correct
        ? "none"
        : "Prerequisite or update-order confusion",
      confidence: 0.85,
    };
  }
  if (name === "remedial")
    return {
      id: "remedial",
      question: "A goal is 5 and you already have 3. How much more is needed?",
      answer: "2",
      explanation:
        "5 - 3 = 2. Relate the current state to the goal before updating it.",
      lines: [1, Math.min(end, 4)],
      hints: ["Think of subtraction.", "Calculate 5 minus 3."],
    };
  if (name === "hint") {
    const s = c.step as Step;
    return {
      hint:
        Number(c.level) >= 3
          ? s.answer + " " + s.explanation
          : s.hints[Number(c.level) - 1],
    };
  }
  const names = dp
    ? ["n", "previous", "current", "step"]
    : binary
      ? ["nums", "target", "left", "right", "mid"]
      : ["nums", "target", "seen", "i", "value", "complement"];
  const details: Record<string, string[]> = {
    nums: [
      "list[int]",
      "Input values",
      "Argument",
      "Unchanged",
      "Sequential indexing",
    ],
    target: [
      "int",
      "Desired value or sum",
      "Argument",
      "Unchanged",
      "Constant comparison goal",
    ],
    n: ["int", "Number of stairs", "Argument", "Unchanged", "Integer count"],
    seen: [
      "dict[int,int]",
      "Remember value-to-index mappings",
      "{}",
      "Insert each visited element",
      "Expected constant-time complement lookup",
    ],
    i: [
      "int",
      "Current index",
      "0",
      "Increments per iteration",
      "Return original position",
    ],
    value: [
      "int",
      "Current array element",
      "nums[0]",
      "Next element each iteration",
      "Read current value",
    ],
    complement: [
      "int",
      "Missing partner",
      "target-value",
      "Recomputed each iteration",
      "Translate sum into lookup",
    ],
    left: [
      "int",
      "Inclusive lower bound",
      "0",
      "mid+1 when middle is too small",
      "Avoid revisiting impossible indices",
    ],
    right: [
      "int",
      "Inclusive upper bound",
      "len(nums)-1",
      "mid-1 when middle is too large",
      "Shrink search space",
    ],
    mid: [
      "int",
      "Middle index",
      "(left+right)//2",
      "Recomputed each iteration",
      "Split interval roughly in half",
    ],
    previous: [
      "int",
      "Ways for preceding stair",
      "1",
      "Old current",
      "Only two prior counts are needed",
    ],
    current: [
      "int",
      "Ways for current stair",
      "1",
      "Sum of old previous and current",
      "Constant-space recurrence",
    ],
    step: [
      "int",
      "Stair under consideration",
      "2",
      "Increments through n",
      "Evaluate smaller states first",
    ],
  };
  return {
    variables: names.map((name) => {
      const d = details[name];
      return {
        name,
        type: d[0],
        purpose: d[1],
        initial: d[2],
        changes: d[3],
        why: d[4],
        lines: [1, end],
      };
    }),
    logic: answers.map((text, i) => ({ text, lines: step(i).lines })),
    technique: {
      name: examples[idx].pattern,
      confidence: 1,
      why: dp
        ? "The last move is either one or two stairs; smaller states overlap."
        : binary
          ? "Sorted order lets each comparison eliminate half the interval."
          : "A complement query can reuse previously seen elements.",
      whenNot: dp
        ? "When states have no reusable substructure."
        : binary
          ? "When the array is unsorted."
          : "When memory is severely constrained or hashing guarantees are unsuitable.",
    },
    insight: answers[1],
    dryRun: dp
      ? [
          {
            iteration: 0,
            values: { step: "1", previous: "1", current: "1" },
            explanation: "Initialize",
            lines: [2, 2],
          },
          ...[
            [2, 1, 2],
            [3, 2, 3],
            [4, 3, 5],
            [5, 5, 8],
          ].map(([s, p, v]) => ({
            iteration: s - 1,
            values: {
              step: String(s),
              previous: String(p),
              current: String(v),
            },
            explanation: "Add the previous two counts",
            lines: [3, 4],
          })),
        ]
      : binary
        ? [
            {
              iteration: 0,
              values: { left: "0", right: "4", mid: "2", "nums[mid]": "5" },
              explanation: "5 < 7, move left to 3",
              lines: [4, 8],
            },
            {
              iteration: 1,
              values: { left: "3", right: "4", mid: "3", "nums[mid]": "7" },
              explanation: "Found target, return 3",
              lines: [4, 6],
            },
          ]
        : [
            {
              iteration: 0,
              values: { i: "0", value: "2", complement: "7", seen: "{}" },
              explanation: "7 absent; store 2 → 0",
              lines: [3, 7],
            },
            {
              iteration: 1,
              values: { i: "1", value: "7", complement: "2", seen: "{2: 0}" },
              explanation: "2 found; return [0,1]",
              lines: [3, 6],
            },
          ],
    complexity: {
      time: binary
        ? "O(log n)"
        : dp
          ? "O(n)"
          : "O(n) expected; O(n²) worst-case hash collisions",
      space: idx === 0 ? "O(n)" : "O(1) auxiliary under fixed-width arithmetic",
      justification: [
        {
          text: binary
            ? "Each loop halves the inclusive interval."
            : dp
              ? "One update per stair. Python integers grow; bit complexity is larger for unbounded n."
              : "One pass with expected O(1) dictionary operations.",
          lines: [1, end],
        },
      ],
    },
    edgeCases: [
      {
        case: dp ? "n=1" : binary ? "Target absent" : "Duplicate values",
        handled: "handled",
        reason: dp
          ? "Returns initial current=1"
          : binary
            ? "Loop exits with -1"
            : "Lookup precedes insertion, so indices are distinct.",
      },
    ],
    correctness: {
      status: "uncertain",
      risks: [
        "Authored mock analysis, not a proof or execution result.",
        "Function-only input needs a stdin wrapper to execute.",
      ],
    },
    alternatives: dp
      ? [
          {
            name: "Brute force",
            approach: "Recursively enumerate 1/2-step choices",
            time: "O(2^n)",
            space: "O(n)",
            tradeoff: "Simple but repeats states",
          },
          {
            name: "Better",
            approach: "Store counts in a DP array",
            time: "O(n)",
            space: "O(n)",
            tradeoff: "Useful for inspecting all states",
          },
          {
            name: "Optimal iterative space",
            approach: "Retain the last two counts",
            time: "O(n)",
            space: "O(1)",
            tradeoff: "Cannot inspect historical states",
          },
        ]
      : binary
        ? [
            {
              name: "Brute force",
              approach: "Scan each value",
              time: "O(n)",
              space: "O(1)",
              tradeoff: "Works without sorting",
            },
            {
              name: "Better",
              approach: "Recursive binary search",
              time: "O(log n)",
              space: "O(log n)",
              tradeoff: "Recursion stack",
            },
            {
              name: "Optimal comparison search",
              approach: "Iterative binary search",
              time: "O(log n)",
              space: "O(1)",
              tradeoff: "Requires sorted random-access data",
            },
          ]
        : [
            {
              name: "Brute force",
              approach: "Check every pair",
              time: "O(n²)",
              space: "O(1)",
              tradeoff: "Minimal memory",
            },
            {
              name: "Better",
              approach: "Sort indexed pairs and use two pointers",
              time: "O(n log n)",
              space: "O(n)",
              tradeoff: "Preserve original indices",
            },
            {
              name: "Optimal expected time",
              approach: "Dictionary complement lookup",
              time: "O(n)",
              space: "O(n)",
              tradeoff: "Extra memory and hashing assumptions",
            },
          ],
    optimizations: ["Add type annotations and document input assumptions."],
    prerequisites: dp
      ? ["Recurrence relations", "Simultaneous assignment"]
      : binary
        ? ["Sorted order", "Loop invariants"]
        : ["Dictionaries", "Array indices"],
    practice: (dp
      ? ["Min Cost Climbing Stairs", "House Robber", "Fibonacci Number"]
      : binary
        ? [
            "Search Insert Position",
            "First Bad Version",
            "Find First and Last Position of Element in Sorted Array",
          ]
        : ["Two Sum II", "Contains Duplicate", "Subarray Sum Equals K"]
    ).map((title) => ({
      title,
      pattern:
        idx === 0 && title === "Two Sum II"
          ? "Two Pointers"
          : examples[idx].pattern,
    })),
  };
}

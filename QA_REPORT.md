# StepWise Tutor QA report

## Issues under test

| ID | Severity | Area and reproduction | Root cause | Fix and regression coverage |
| --- | --- | --- | --- | --- |
| QA-01 | High | Start a lesson, restart Node, then submit an answer | Private state was held only in the Node process | Authenticated encrypted checkpoints with a persistent server key; restart browser spec and checkpoint integrity tests |
| QA-02 | Medium | Return valid JSON enclosed in a Markdown code fence from the provider | The adapter parsed the entire response as JSON | Accept a complete JSON fence, keep Zod validation, and retry failures once; provider contract tests |
| QA-03 | High, development only | Run `npm audit` | ESLint and the Vitest/Vite toolchain use versions affected by the same picomatch ReDoS | Runtime audit is clean. No patched release is listed. The suggested Vitest downgrade added critical advisories and was reverted. See [GHSA-fc5q-39xc-vjpf](https://github.com/advisories/GHSA-fc5q-39xc-vjpf). |
| QA-04 | Medium | Run `npm run lint` | The project had no lint command or configuration | Add a Next.js ESLint configuration and include lint in the QA command |
| QA-05 | Medium | Submit a question containing eight spaces | HTML `minLength` counted spaces while the backend measured trimmed text | Reject trimmed questions under eight characters in Tutor and Compare. Browser tests cover whitespace and friendly recovery from a rejected request. |
| QA-06 | High | Stub a generated clue with a literal expected answer | The adapter checked the JSON shape and the clue level, and trusted compliant model text | Filter detectable literal disclosures in generated clues and incorrect feedback. Test all authored clue pairs and a stub that discloses a numeric answer. |
| QA-07 | Medium | Change `X-Real-IP` after reaching the local request limit | The limiter trusted a client-supplied IP header by default | Use a shared default bucket and opt in to trusted proxy headers. API tests cover header spoofing and 429 responses for every route. |
| QA-08 | Medium | Run Lighthouse on `/solve` with slow font requests | The external Google Fonts stylesheet blocked first paint | Self-host the existing typefaces. Compare Lighthouse scores and largest contentful paint before and after. |
| QA-09 | Low | Inspect production response headers and the active step list | Browser security headers and the stepper name were absent | Add a restrictive framing policy, content sniffing protection, referrer and permissions policies, and an accessible stepper name. Browser tests check headers and run axe. |
| QA-10 | Low | Run lint and Playwright in the Windows environment | An anonymous default config export triggered lint, and Playwright workers inherited conflicting color settings | Name the PostCSS config and give Playwright a consistent color environment. |
| QA-11 | Medium | Start a lesson on Windows while creating the first checkpoint key | The first key implementation used filesystem hard links that failed in the sandbox | Create the private key exclusively with normal filesystem writes. API tests and a separate-process browser test exercise checkpoint handling. |

## Baseline and verification notes

- Initial TypeScript check and 36 Vitest tests passed. The baseline project had no lint script, Playwright coverage, or Lighthouse check. A dev dependency downgrade proposed by npm added critical advisories during investigation and was discarded.
- Provider contracts use a test stub for strict JSON, fenced JSON, malformed or invalid JSON, timeout, HTTP 429, HTTP 500, and valid decompose/check/remedial/hint responses. The real network path remains unverified because the environment contained no OpenAI key.
- The browser mock suite runs all six lessons, the revision and restart paths, evaluation and CSV, keyboard navigation, and layout checks at 375 px, 768 px, and 1280 px. Axe checks the six routes in both color themes and checks three populated views.
- The production client scan searches for private field names, provider and checkpoint key names, the provider URL, and a known canonical answer. The server build contains the implementation and private rubric data as expected.

## Final results

| Check | Result |
| --- | --- |
| Issues | 11 recorded, 10 fixed, 1 remaining in development dependencies |
| ESLint and TypeScript | Passed with zero lint warnings and zero type errors |
| Vitest | 85/85 passed across 6 files, including 15 provider contract tests |
| Playwright | 14/14 passed in Chrome, including an actual Node restart and full keyboard lesson |
| Next.js production build | Passed |
| Lighthouse landing | 85/100 performance, 0.9 s LCP, 0.006 CLS |
| Lighthouse tutor | 97/100 performance, 0.8 s LCP, 0.001 CLS, up from 56/100 and 8.1 s LCP |
| Client bundle and key-file scan | Passed. No matched private field or environment names, canonical answer, or provider endpoint in client assets. No key file in build traces. |
| `npm audit --omit=dev` | Passed with zero vulnerabilities |
| `npm audit` | 16 development dependency entries trace to one unpatched picomatch advisory. npm's suggested downgrade failed to clear that advisory and added critical issues in the test toolchain. |

## Remaining limitations

- A live OpenAI smoke test requires a configured server key. All tested provider response and failure contracts used a fake transport. The literal-answer filter covers detectable direct disclosures and does not establish that arbitrary model prose is free of paraphrased answers.
- Checkpoint recovery requires the original encryption key and a browser checkpoint created by the updated application. Public history from older releases remains visible.
- npm flags ESLint 9 as deprecated. The current Next.js lint plugins for imports, JSX accessibility, and React declare ESLint 9 as their latest supported major. The application lint command itself passes with zero warnings.


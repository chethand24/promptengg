# Verification

Verified on 2026-11-24 with Node.js 24 on Windows:

- TypeScript production build for frontend and backend.
- ESLint and Prettier formatting.
- Vitest coverage of schemas, sequential pipeline context, JSON repair limits, all three mock examples, answer privacy, hint limits, disk persistence, remediation return, conservative evaluation, timeout, output limit, and disabled Docker behavior.
- Browser: full breakdown rendering, code editor, dry-run view, guided creation, incorrect-answer remediation, sequential hint ladder, successful return to the original question, and persisted trace entries.
- npm dependency audit after updating Vitest: zero reported vulnerabilities.

Limits: Docker is not installed on this host; container compilation, resource limits, and observed Python traces require the documented Docker smoke checks. No Anthropic credentials were supplied, so the live network integration is compiled but not exercised. No claim of live-model accuracy is made. Monaco is lazy-loaded, but its production chunk triggers Vite's size advisory. PDF export is provided through print CSS and the browser dialog; no automated PDF comparison was performed.

To validate Docker after installation:

1. Build `stepwise-runner:local` and enable `SANDBOX_ENABLED`.
2. Run each seed's example and edge case from Dry Run. Expect the JSON-adapted Python examples to pass.
3. Test an infinite-loop stdin program through `/api/run`. Expect a timeout with no surviving container.
4. Test programs that continuously print, try outbound network access, or attempt to write outside `/work` and `/exec`. Expect output truncation/termination, no network, and a read-only root filesystem.
5. Confirm the Python observed trace includes the actual executed lines. Trace events are before-line snapshots and must not be confused with the model's predicted iteration table.

## Gemini provider update

39 tests pass, including mocked Gemini HTTP responses, schema repair, missing-key handling, authentication errors, quota exhaustion, truncated responses, and blocking old Claude sessions after provider changes. Local health confirms Gemini is selected. No live Gemini request was made: a user-owned Google AI Studio key is still required. Free-tier eligibility and quotas are controlled by Google, not by this application.

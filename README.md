# StepWise Tutor — DSA Edition

An adaptive practice app for algebra, program tracing, and algorithms. The tutor decomposes a problem, checks each response, and opens the next prerequisite-ordered step. Six built-in lessons work without an API key.

## Structure

| Path | Role |
|------|------|
| `app/` | Landing, tutor, learning trace, comparison, evaluation, methodology pages |
| `app/api/[action]/` | Next.js POST Route Handler for decompose, check, remedial, hint, resume, compare |
| `components/` | Navigation, sample picker, trace display |
| `lib/llm/`, `lib/prompts/` | Provider adapter, authored demos, JSON prompt templates |
| `lib/server.ts`, `lib/schema.ts` | Request validation, rate limiting, session state, provider output validation |
| `lib/verify/`, `lib/session.ts` | Deterministic grading and progression |
| `lib/client.ts` | Zustand persistence and browser API client |
| `types/`, `tests/` | Data contracts and Vitest coverage |
| `stepwise-dsa/` | Separate DSA tutor package (backend + frontend + shared schema) |

## Run locally

Use Node.js 24 LTS.

```bash
npm install
npm run dev
```

Visit `http://localhost:3000`.

For the DSA package:

```bash
cd stepwise-dsa
npm install
npm run dev
```

## Environment

Copy `.env.example` to `.env.local` (root) or edit `stepwise-dsa/.env`.

| Variable | Purpose |
|----------|---------|
| `OPENROUTER_API_KEY` | OpenRouter key for custom code analysis |
| `LLM_MODEL` | OpenRouter model. Default `openrouter/free`. Faster free options: `meta-llama/llama-3.1-8b-instruct:free`, `meta-llama/llama-3.2-3b-instruct:free`, `qwen/qwen-2.5-7b-instruct:free` |
| `LLM_PROVIDER` | `gemini` (default), `claude`, or `openrouter` |
| `MOCK_LLM` | `true` keeps demo examples running without an API key |
| `ANTHROPIC_API_KEY`, `GEMINI_API_KEY` | Keys for Claude / Gemini providers |

## Recent change

The OpenRouter request deadline was raised from 90s to 3 minutes in `stepwise-dsa/backend/src/services/openrouter.ts:36` to reduce timeout errors on slow free-tier models.

## Testing

```bash
npm test            # unit + API contracts (Vitest)
npm run qa          # ESLint, TypeScript, Vitest, production build, Playwright
```

Browser tests force mock mode. Playwright uses installed Google Chrome on Windows.

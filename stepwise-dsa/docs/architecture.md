# Architecture

```mermaid
flowchart TD
  UI[React / Vite workspace] -->|Zod input, fetch SSE| API[Express API]
  API --> S0[Stage 0: understand]
  S0 --> S1[Stage 1: prerequisite DAG]
  S1 --> S2[Stage 2: sequential subproblem calls]
  S2 -->|Previous solved steps| S2
  S2 --> S3[Stage 3: solution analysis]
  S0 & S1 & S2 & S3 --> LLM[Gemini, Anthropic, or authored mock]
  LLM --> Validate[Strict JSON + Zod + up to 2 repairs]
  S3 --> Private[Private reference session]
  Private --> Disk[Atomic local JSON storage]
  Private --> Public[Public question and step status]
  Public --> UI
  UI --> Grade[Evaluate student answer]
  Grade -->|Incorrect or uncertain| Remedial[Insert simpler prerequisite]
  Remedial --> Grade
  Grade -->|Correct| Next[Return to original or advance]
  UI --> Runner[Docker runner]
  Runner --> Isolated[No network / no host mounts / resource limits]
  Isolated --> Results[Actual stdout + optional Python trace]
  Results --> UI
  Disk --> Metrics[Metrics and learning trace]
```

Full analysis responses intentionally include reference answers. Guided responses use a separate public schema and never serialize the full breakdown. Each step is evaluated only on the backend. A user's correct answer can advance without hints; the reference answer is available only at hint level 3. Full-code visibility is intentional because the learner supplied it.

# RMango Phase 2 — Engineering Audit and Architecture Plan

**Audit date:** 21 November 2026  
**Repository:** `abdelrmamsaahlan-max/rmango`  
**Scope:** existing Electron desktop client, Next.js cloud API, Supabase schema, Vercel deployment and GitHub Actions.

## Executive status

RMango is an existing cloud-backed Roblox development desktop application, not a blank-slate chatbot. It already has a React/Electron client, a Next.js API, Vercel AI Gateway integration, Supabase Auth/Postgres/private Storage, a streaming chat route, owner-scoped project-file tools, review-before-apply file proposals, and an approval-gated Roblox Studio MCP bridge.

The audited architecture is still an early product foundation. The chat coordinator is concentrated in one large route; there is no durable agent worker, formal tool/skill registry, evaluation harness, vector RAG pipeline, complete project index, or performance telemetry dashboard. The repository contains clear TODO-free areas in the code search, but that does not mean feature work is complete.

**Important operating constraint:** the RMango Supabase project is already provisioned and its initial schema is applied. The global usage policy is verified as `enabled = false`, with daily and monthly USD spend caps at zero. This audit and its code changes do not enable model inference, raise the database plan, create additional paid services, or change those spend controls.

## Existing architecture observed

| Area | Current implementation | Audit assessment |
|---|---|---|
| Desktop | Electron 36, React 19, Vite, TypeScript | Working application foundation |
| Renderer boundary | Context isolation, Node integration disabled, Chromium sandbox enabled | Good baseline; IPC sender checks were missing |
| Cloud API | Next.js 16, Node runtime | Functional API surface, several concerns still concentrated in route handlers |
| Model access | AI SDK + Vercel AI Gateway, deployment OIDC | No desktop provider keys; usage policy must allow a request before inference |
| Routing | Five role profiles; live catalog capability/price metadata; heuristics and fallback filtering | No RMango-specific benchmark dataset yet |
| Conversations | Supabase persistence, local desktop history | Pagination and lifecycle management need work |
| Project context | Owner-scoped project/file tools | Selected project manifest was not automatically loaded into the model context |
| File changes | Pending proposals, original-file hash checking and user approval | Review-before-apply pattern exists; strengthen atomicity and auditing |
| Studio | Local MCP bridge; allowlisted tools; approval required for mutating actions | Useful constrained bridge; command execution remains synchronous/bounded |
| Database | 14 public application tables, RLS enabled, private Storage bucket | Initial owner-scoped schema; workspace and durable-task domains are not implemented |
| Background work | No durable worker/queue | Major missing capability |
| Evaluation | No fixed RMango model/task evaluation suite found | Routing and prompt changes lack regression gates |
| Search/RAG | Metadata list + direct file reads | Full-text/semantic hybrid retrieval not implemented |
| UI | React app concentrated in `App.tsx` (~64.5 KB); stylesheet ~37.1 KB | Functional screen, but oversized component and hard-coded visual tokens |
| Packaging | Windows NSIS installer; latest observed public pre-cloud installer ~83.9 MiB | Establishes a package-size baseline, not a performance benchmark |
| Telemetry | Some operational messages; no complete lifecycle tracing or performance dashboard | Cannot yet report true end-to-end latency or resource baselines |

## Verified database and deployment state

- Supabase project: `rmango-cloud`, ref `jqkcrtnbxewyqrdpnqap`, region `eu-central-1` (Frankfurt), status `ACTIVE_HEALTHY`.
- Migration `202611210001_rmango_cloud.sql` is present in Supabase migration history as `20261121151216_rmango_cloud`.
- The 14 application tables in the `public` schema had Row Level Security enabled when checked.
- The usage-policy row was read back with `enabled = false`, `daily_spend_limit_usd = 0`, and `monthly_spend_limit_usd = 0`.
- The Vercel project contains encrypted `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` settings. The server-only `SUPABASE_SERVICE_ROLE_KEY` was not present in the project environment-variable inventory at audit time; authenticated cloud chat and other admin-client paths therefore still require that administrator setup.
- The GitHub Actions variable `RMANGO_CLOUD_API_URL` was not confirmed configured at audit time. The desktop installer pipeline does not publish a cloud-ready public release without that public HTTPS URL.
- The old public `v0.2.37` installer predates the cloud-enabled configuration and is not the Phase 2 result.

No inference request was intentionally started during this work.

## Security findings and changes

### Already in the repository before this audit

- Electron uses `contextIsolation: true`, `nodeIntegration: false`, and `sandbox: true`.
- The cloud API validates Supabase access tokens with `auth.getUser`.
- Database policies are owner-scoped for the existing personal-project model.
- Project uploads use bounded file-count/size rules and reject unsafe relative paths.
- The Studio bridge only exposes allowlisted tools; mutating tool calls are approval-gated on the desktop.
- Proposed file updates are not applied until user approval and are checked against the original SHA-256.

### Implemented in Phase 2 commits

- All 26 Electron IPC registrations now use a wrapper that verifies the sender is the trusted main renderer frame and that its URL is the expected packaged page or configured development origin.
- New-window creation is denied; navigation away from the trusted renderer is blocked.
- External links must parse as HTTPS and cannot contain embedded username/password credentials before they are passed to the OS browser.
- A renderer Content Security Policy was added with explicit development, cloud, and Supabase connection origins.
- Chat cancellation is wired through the preload API to an AbortController in Electron main. A visible Stop control preserves partial output, flushes trailing chunks and ignores late stream events to prevent duplicate text.
- Local conversation history is encrypted with Electron `safeStorage` on supported Windows builds. Older plaintext history is migrated on first read; subsequent writes use a temporary encrypted file followed by an atomic rename. If secure storage is unavailable, RMango refuses to write new history in plaintext.
- The Roblox Studio MCP child process receives a minimal Windows environment allowlist rather than the full desktop process environment, reducing accidental inheritance of unrelated developer tokens.
- Chat stream deltas are coalesced to at most one renderer state update per animation frame, local history writes are throttled to at most once per second, and the in-memory conversation window is bounded.
- The selected-project context module fetches only project/file metadata through the authenticated owner-scoped Supabase client, never whole project contents. The chat route verifies supplied project ownership on every turn, associates the selected project with the conversation, and appends a bounded file manifest in the user-data channel (not the system-instruction channel). File contents still require an explicit `read_project_file` tool call.
- The project context block is serialized as JSON and marked untrusted. Names, descriptions, and file paths are not treated as executable instructions.

### Remaining security work

- The Supabase advisor reports a warning for the existing `public.claim_studio_commands(uuid,integer)` SECURITY DEFINER function being executable by authenticated users. Its function body includes an authenticated identity and connector ownership check and uses an empty search path, but it should be moved behind a narrower API boundary or replaced with a safer policy after a reviewed migration. Do not make an ad-hoc destructive schema change.
- The current file-change apply flow spans Storage and Postgres operations and should become an idempotent, transactional workflow with durable audit events.
- Add adversarial tests for prompt injection in project descriptions, file names, source files, retrieved documentation, and tool outputs. Prompt wording is only one layer; runtime tool authorization and resource ownership remain decisive.
- Add rate limits to authentication endpoints and request-size controls at the deployment edge.
- Replace local plaintext chat-history storage with an explicitly documented encrypted/private persistence design, or make local persistence optional and clearly disclosed.
- Audit all download, path, project switching, and IPC input schemas as a dedicated security review.

## Model and agent engineering notes

The original Transformer paper describes attention-based sequence modeling, with token embeddings, positional information, scaled dot-product attention over query/key/value representations, multi-head attention, position-wise feed-forward layers, and residual connections with normalization. Modern decoder-only language models generate autoregressively: each next token is sampled or selected conditioned on the previous token sequence. Tokenization maps text/media to model-specific token IDs; tokenization, context size, model weights, serving implementation and sampling policy all affect latency and output.

Model capability is not created by storing chat history. Pretraining optimizes model weights over large datasets; supervised fine-tuning/instruction tuning and preference optimization further update weights using curated examples and feedback objectives. Backpropagation and an optimizer change model parameters during training. A database memory, project index, prompt, tool or retrieval result changes the information and capabilities available to an application at inference time; it does **not** train the underlying hosted model. Fine-tuning is a separate model-training activity with datasets, evaluation and compute requirements.

A production agent is a controlled loop around a model: state/context, a typed tool registry, policy checks, execution, result validation, bounded continuation, persistence and observability. Start with one coordinator and explicit tools. Add specialist-agent handoffs only for work where parallelism or a clear separation of expertise improves measured outcomes. Unbounded recursive agents and multiple calls for trivial tasks increase cost, latency and attack surface.

### Proposed RMango architecture

1. **AI core:** a server-only orchestration module owning request lifecycle, identity, context assembly, routing, quotas, tool policies, stream events, persistence and error recovery. Route handlers should become thin transport adapters.
2. **Model catalogue and router:** capability-validated model profiles with explicit admin-selected primary/fallback IDs; reject models without price metadata while budgets remain enforced. Compare candidate models on a fixed Roblox task set before changing the default router.
3. **Context engine:** conversation window management, selected-project manifest, incremental file metadata index, PostgreSQL full-text search, and only later embeddings/pgvector if measured retrieval quality justifies the dependency. Filter every query by authenticated owner/workspace permissions before ranking or retrieval.
4. **Tools and skills:** typed schemas, risk class, owner/role permissions, deterministic handler, timeout, output-size limit, audit record, version and tests. Skill packs are versioned instruction/data bundles; never grant a skill additional permissions merely because its prompt requests them.
5. **Durable workflow layer:** persist jobs, steps, dependencies, leases, checkpoint state and retry counters. A worker should claim a job transactionally, use idempotency keys, write progress, and recover expired leases. Vercel request handlers should not pretend to be durable background workers.
6. **Evaluations and traces:** store redacted run spans (request, route choice, retrieval IDs, tool calls, approvals, result/error, timings and token accounting). Run deterministic safety and project-task test cases on every release; mark model scores unknown until tested.
7. **Human control:** approval for file writes, Studio mutation, destructive operations, publishing and external effects; support cancellation and a complete audit trail.

## Performance baseline and measurement policy

No controlled before/after benchmark has been run yet. In particular, cold/warm startup time, idle CPU, peak RAM, first-token latency, tokens/second, queue time, context assembly time, tool latency, long-chat behavior and large-project indexing are **not measured**. They must not be reported as improved based on code inspection alone.

The old published installer is approximately 83.9 MiB by its GitHub release asset size. A new Windows build should record installer size and compare the exact same artifact type. Electron's runtime and Chromium are material fixed costs; remove unused dependencies and large assets only after bundle/dependency analysis, not by deleting product features blindly.

The first required instrumentation points are:
- request accepted, auth validated, project context retrieved, quota decision;
- model request started, first stream chunk, stream completed/cancelled;
- each tool start/end/error and approval wait;
- database read/write durations and row counts;
- renderer startup, project scan, UI long tasks, process RSS and idle CPU.

Use bounded caches only for non-sensitive data (for example, the public model catalogue); never share cached project data across users. Avoid indexing the full project on every chat turn.

## Implementation roadmap

| Order | Work | Acceptance criteria |
|---|---|---|
| 1 | Security boundary and cancellation | trusted IPC sender, navigation policy, CSP, AbortController, partial-output preservation |
| 2 | Project-aware context | owner-verified selected project and bounded metadata manifest; file contents retrieved on-demand |
| 3 | API decomposition | thin route handlers, centralized auth/error policy, AI core and typed tool registry |
| 4 | Durable jobs and audit | idempotent job/step transitions, lease recovery, cancellation, audit events |
| 5 | Retrieval and skills | incremental index, full-text retrieval, metadata filters, versioned skills |
| 6 | Evaluation and observability | fixed tests, trace records, model-choice and latency breakdown |
| 7 | Desktop design/performance | tokenized visual system, responsive panels, lazy views, list virtualization, measured bundle/RAM/CPU |
| 8 | Release hardening | migration review, CI tests, security scan, installer artifact and cloud setup verification |

## Research references

- Vaswani et al., [Attention Is All You Need](https://arxiv.org/abs/1706.03762) (2017).
- OpenAI, [Building agents](https://developers.openai.com/tracks/building-agents) and [Evaluate agent workflows](https://developers.openai.com/api/docs/guides/agent-evals).
- Anthropic, [Building effective agents](https://www.anthropic.com/research/building-effective-agents).
- OWASP GenAI Security Project, [2026 Top 10 and Agent Control Standard announcement](https://genai.owasp.org/2026/09/01/owasp-genai-security-project-unveils-2026-top-10-for-llm-applications-new-agent-control-standard-and-sponsors-as-community-tops-30000-members/) and [Agent Control Standard](https://genai.owasp.org/resource/agent-control-standard-acs/).
- NIST, [AI Risk Management Framework 1.0](https://nvlpubs.nist.gov/nistpubs/ai/NIST.AI.100-1.pdf) — Govern, Map, Measure, Manage.
- Electron, [Security recommendations](https://www.electronjs.org/docs/latest/tutorial/security).
- Supabase, [Row Level Security](https://supabase.com/docs/guides/database/postgres/row-level-security).

## Test status

This document is an audit/plan, not a declaration that every planned system is complete. Build, automated tests, adversarial security tests, database isolation tests with multiple identities, and performance benchmarks must be recorded from actual CI/test runs before a release is described as production-verified.


## Phase 2 verification snapshot

- Cloud route and context module: GitHub Actions run `44919263613` completed with `success`; both TypeScript type-check and Next.js production build steps passed for the selected-project context implementation.
- Desktop: GitHub Actions Windows installer run `44919394258` was still in progress at the time of this edit. Do not describe the new installer as built or released until this workflow completes and its artifact is checked.
- No real model request, paid inference, end-to-end authenticated cloud chat, benchmark run, Windows runtime memory/CPU measurement, or security red-team test has been performed. These remain explicitly unverified.

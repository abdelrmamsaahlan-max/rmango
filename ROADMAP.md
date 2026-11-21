# RMango — Autonomous Roblox AI Platform Roadmap

**Working branch:** `feat/rmango-autonomous-platform`  
**Baseline:** the complete stacked implementation through the security / continuous-improvement branch, not the smaller cloud-only desktop branch.  
**Product promise:** install RMango, open it, and start developing. The desktop must not require a local model runtime or a user-supplied provider key.

This roadmap separates existing, verified foundations from work that still needs implementation. A feature is not marked complete because a UI card or database table exists.

## Current architecture and verified foundations

| Area | Existing implementation | Honest boundary |
|---|---|---|
| Windows desktop | React + Electron, context isolation, sandboxing, trusted-renderer IPC checks, restrictive CSP, secure update/install pipeline | Public release still requires the configured HTTPS service and a legitimate code-signing identity |
| Cloud inference | Next.js API, Vercel AI Gateway, OIDC-based model catalogue, five RMango work modes, capability-aware selection and price-bounded fallbacks | Current production adapter is Vercel AI Gateway; direct multi-provider adapters are not yet implemented |
| Chat and project context | Project-owned conversations, source-file tools, proposals with content hashes, persistent project memories | Import is bounded to supported text/source files; binary `.rbxl`/`.rbxm` is not parsed |
| Autonomous task workflow | Vercel Workflow checkpoints, durable task rows/events, plan and implementation passes, run-token fencing, pause/resume/cancel/retry | This is a coordinated workflow agent, not yet a set of independently delegated specialist agents |
| Project intelligence | Luau symbol extraction, common `require` and instance/service/remote references, dependency graph and re-index workflow | Static bounded source analysis, not a Luau compiler or a complete runtime DataModel graph |
| Studio integration | Local Roblox Studio MCP bridge, allowlisted tools, queued commands and explicit approval for mutating actions | Studio must be open and deliberately connected; cloud code cannot claim a playtest ran without recorded evidence |
| Verification | Evidence-based task status checks for explicit playtest and console output; failure and usage events | Generated code and successful tool calls alone do not count as runtime verification |
| Continuous improvement | Compact task-evaluation signals, optional task feedback, project memories | Context/evaluation improvement only; no silent training or model-weight updates |
| Usage controls | Atomic request reservations, per-user limits, global disabled-by-default spend policy and Gateway budget guidance | Cloud spending must remain disabled until an operator explicitly configures a safe budget |

## Staged delivery

### Stage 0 — Preserve and consolidate the strongest implementation

- [x] Use the stacked branch containing the project-aware chat, durable agent workspace, source index, security hardening and evaluation loop as the base.
- [ ] Keep all follow-up work stacked on that base until the parent PR chain is merged in order.
- [x] Run the complete cloud, desktop and Windows installer checks on the consolidated branch.

**Acceptance:** the agent workspace, workflow APIs, indexer, secure IPC and release checks remain present after each new feature is added.

### Stage 1 — Zero-configuration first launch

- [x] Automatically create a private guest identity when the managed service is healthy.
- [x] Store the refresh session only through Windows secure storage.
- [x] Reuse the identity after normal restarts and recover only from a clearly invalid/revoked anonymous refresh token.
- [x] Keep sign-up, email/password, provider keys, terminal commands and model downloads out of the normal first-run flow.
- [x] Show clear service-offline and connection-retry states; never label backend provisioning as a user's local setup task.
- [x] Keep guest data scoped to that generated identity and explain device-local recovery limitations.

**Acceptance:** fresh install → first launch → guest identity → model catalogue → first real chat, without manual account or provider setup. This requires the managed backend to be deployed and its guest-auth provider enabled; code alone cannot make an undeployed service live.

**Implementation status:** client and API integration are implemented and CI-verified. End-to-end guest creation, model-catalogue retrieval and a real chat remain blocked only by the undeployed managed service and its one-time Supabase/Vercel operator configuration. No live inference or provider spend has been triggered.

### Stage 2 — Lead agent and specialist delegation

- [x] Define nine stable specialist contracts: Luau Engineer, Gameplay Designer, UI/UX Designer, World Builder, 3D Asset & Animation Specialist, QA Engineer, Performance Engineer, Security Reviewer and Technical Research Analyst.
- [x] Give every review the same owner-scoped project index, selected source files, dependency references, project memories and active task/run context.
- [x] Let the Lead Architect request up to three distinct, narrow, read-only reviews and receive concise reports.
- [x] Give each specialist call its own model usage reservation and cost accounting; specialist calls fail closed when the operator/user spend policy denies the request.
- [x] Persist specialist requested/started/completed/blocked/failed events in the durable task timeline.
- [ ] Let the Lead Architect formally compare conflicting reports and persist a resolution record.
- [ ] Add cancellation propagation and explicit agent-level cost/time dashboards for in-flight sibling work.
- [ ] Add controlled parallel execution for independent roles after sequential delegation is stable under replay and retry.
- [ ] Add real external-source retrieval for the research role; it currently audits supplied evidence and identifies claims needing official-source verification, but it does not browse externally.

**Acceptance:** a complex task can ask distinct role-specific reviewers for bounded evidence-based advice, display those reports, then let the Lead decide what to implement. Specialist reviews are advisory and read-only; only the Lead uses project mutation tools and the approval-gated Studio bridge. This is a bounded multi-agent foundation, not yet unrestricted autonomous delegation.

### Stage 3 — Deeper project intelligence

- [ ] Upgrade the source scanner with parser-backed Luau analysis and confidence-labelled dependency resolution.
- [ ] Track RemoteEvents/RemoteFunctions, DataStores, UI trees, assets, client/server boundaries and script-to-system relationships.
- [ ] Incrementally re-index changed files and mark dependent symbols stale.
- [ ] Add searchable technical knowledge and retrieval with source references.
- [ ] Add safe, opt-in support for extracting content from Roblox place/model files where a supported parser exists.

**Acceptance:** a change plan names the affected systems and files, traces dependencies with confidence, and verifies that the index was refreshed after approved edits. Unsupported binary formats must be reported, not guessed.

### Stage 4 — Unified model and inference layer

- [ ] Separate RMango task intent and agent logic from the underlying inference adapter.
- [ ] Define a provider-neutral adapter contract for catalogue, capability, generation, tool calls, usage and errors.
- [ ] Keep Vercel AI Gateway as the default managed adapter; add other providers only when their secure server-side auth, pricing and fallbacks are tested.
- [ ] Route automatically by task requirements, latency, context, tool support, image support, reliability and cost.
- [ ] Add model regression evaluations before changing default routing.

**Acceptance:** the desktop sees RMango modes, never raw credentials; every route records its selected model, fallback and actual usage; unknown pricing or over-budget routes fail closed.

### Stage 5 — Safe execution, recovery and history

- [ ] Keep every mutating Studio action approval-gated.
- [ ] Add project snapshots/backups before multi-file apply operations and a tested rollback path.
- [ ] Persist enough task checkpoints to resume after app restart, network loss or worker retry.
- [ ] Add conflict-aware file application and an understandable diff/review UI.
- [ ] Separate low-risk read-only analysis from file writes, script execution, saving, publishing and destructive actions.

**Acceptance:** a cancelled/failed task can be safely inspected or resumed; no destructive or external action happens without explicit approval; rollback restores the previous project state.

### Stage 6 — Evaluation and release readiness

- [ ] Build repeatable Roblox task benchmarks with fixed project fixtures and expected outcomes.
- [ ] Measure task completion, Luau correctness, test pass rate, false verification, recovery, latency, memory and cost.
- [ ] Compare candidate agent instructions and routing against a baseline; reject regressions.
- [ ] Test clean Windows install, first launch, multi-turn chat, guest persistence, reconnect, Studio approval, task recovery, updates, uninstall and reinstall.
- [ ] Add abuse protection (including CAPTCHA for public anonymous guest access), operational monitoring and a service-operator runbook.

**Acceptance:** release claims are backed by CI, test artefacts and explicit live-test scope; the public service has budgets, rate limits, recovery and a security review.

## Current blockers and non-negotiable boundaries

1. **Managed infrastructure:** RMango's dedicated Vercel and Supabase deployment must be provisioned by the repository/service owner. No currently connected unrelated project should be reused.
2. **Spend approval:** global Supabase usage policy and an independent AI Gateway budget remain disabled until an owner explicitly chooses limits.
3. **Guest abuse protection:** Supabase anonymous sign-ins must be enabled and public launch requires tested CAPTCHA/abuse controls. Do not remove provider rate limits.
4. **Guest recovery:** anonymous sessions are not accounts. Until identity linking/recovery is implemented, deleting local app data or switching Windows devices can lose access to the guest workspace.
5. **No fake intelligence:** memories are contextual records; evaluation signals improve workflows; neither silently trains the underlying model.
6. **No false verification:** source generation, proposals, or successful MCP tool invocations do not prove a game works. Only recorded Studio test evidence can support a runtime-verified claim.
7. **No secret in desktop:** service-role credentials, OIDC tokens and model-provider secrets remain server-side.

## Implementation log

- Initial audit: inspected repository tree, PR chain and the stronger stacked implementation. Found PRs #1–#4 are open and layered; the smaller guest-first PR #5 was based directly on `main` and omitted the durable agent workspace and project index.
- This branch starts from the latest security/evaluation branch so new work preserves those existing capabilities.
- Stage 1 guest-first implementation is complete in this branch; the remaining limitation is live service provisioning and end-to-end cloud validation.
- Stage 1 guest-first code: implemented automatic anonymous signup, HTTPS/public-key validation, safeStorage persistence, narrow refresh recovery, no-sign-in UI and explicit device-scoped guest messaging. Added five desktop guest-auth tests.
- PR #6 verification on `47acd22e4013e1a0b9095ef23cf11e52d3a58015`: desktop CI run `44914480238` passed (5/5 guest-auth tests, dependency audit, type-check and production build); cloud CI run `44914479982` passed (4/4 project-index tests, audit, type-check and Next.js production build); Windows installer run `44914480075` passed (audit, 5/5 guest-auth tests, Windows packaging, setup EXE verification and artifact upload).
- Windows test artifact: `Rmango-Setup-0.2.38-x64.exe`, SHA256 `2e541a586c1ef6244314f1620a527b883dcc0d6c4d78dfefe6b6126f707518ae`. This PR-only artifact is unsigned and has an empty cloud URL; it is not a public release and cannot perform hosted chat. It must not be distributed or run by bypassing Windows security warnings.
- Live cloud/anonymous sign-in/chat remain untested because the dedicated RMango Vercel and Supabase resources are not provisioned. No model inference or spend was enabled.

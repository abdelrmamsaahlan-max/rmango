# Rmango architecture — cloud inference

## Product boundary

The user's Windows computer is the desktop UI and a limited local tool connector. **All language-model inference, reasoning, model routing and agent planning happens remotely.** The desktop must not load Ollama, download model weights, send requests to AI-provider APIs directly, or contain AI provider secrets.

## Architecture

~~~text
Windows desktop (React + Electron)
  Chat · attachments · project explorer · diff/proposal review
  Cloud account session · GitHub updater · Studio MCP tool bridge
           │ HTTPS / encrypted account session
           ▼
Vercel Next.js cloud backend
  Supabase auth · model profiles · quota reservation
  AI Gateway streamText · cloud project tools · Studio command queue
       │                         │
       ▼                         ▼
Vercel AI Gateway             Supabase
  Vercel OIDC                 Postgres · Auth · private Storage
  hosted models               accounts · projects · messages
  live model metadata         usage · project changes · connector queue
                                  ▲
                                  │ authenticated outbound polling
                                  │
                         Local Roblox Studio MCP connector
                         Runs only when user connects Studio
                         Never performs AI inference
~~~

## Model routing

- The backend uses Vercel AI Gateway and the AI SDK.
- It reads Gateway's live `/v1/models` catalogue; it does not hardcode the “smartest” model.
- Admin-configured model IDs can override Rmango Fast, Developer, Think, Vision and Agent profiles.
- Fallback model IDs can be configured for each profile.
- Capability and price information is displayed only when present in Gateway metadata. No benchmark scores are fabricated.
- Production Gateway authentication uses the Vercel deployment's OIDC identity. There is no `AI_GATEWAY_API_KEY` fallback and no user provider API key.

## Auth and storage

- Supabase Auth validates the user's account session on every protected API request.
- The desktop stores access/refresh tokens encrypted using Electron safeStorage.
- Postgres tables are protected with row-level security and owner-scoped policies.
- Uploaded source files are stored in a private Supabase Storage bucket; storage paths begin with the authenticated user's UUID.
- The Supabase service-role key is only used server-side for atomic quota reservation/completion. Never expose it as a `NEXT_PUBLIC_*` variable or package it with the desktop app.

## Usage and cost controls

Before starting inference, the cloud backend reserves a request and estimated token budget in Postgres. Requests are blocked when the global policy is disabled or a user's daily/monthly request/token limit is reached. After completion, actual token counts and an estimated cost are recorded. Failed requests release their reservation; abandoned reservations expire after two hours.

Default policy: 40 requests/day, 800/month, 120k tokens/day, 1.5m tokens/month, max output 4096. These are product quotas, not a substitute for a separate administrator-configured Vercel AI Gateway/provider spending budget.

## Agent and project workspace

- Project imports are explicit user actions; the desktop does not silently upload a selected folder.
- Current import supports a bounded set of text/source formats (up to 120 files, 512KB per file).
- Cloud agent tools can list/read project files and create pending file-change proposals.
- Each proposal records the original file hash. Approving applies the proposal to private storage only if the original file still matches; stale proposals become conflicts.
- ZIP export is owner-authenticated and limited to 250 files/40MB.
- Binary Roblox places/models are not parsed in this version.

## Roblox Studio bridge

Roblox Studio's official MCP server runs locally. The desktop starts it through the Windows Roblox MCP launcher, discovers its actual tool names/schemas, registers allowlisted tools with the cloud service, and polls the authenticated command queue.

The local connector:
- Does not run a language model.
- Does not route AI inference.
- Shows an approval prompt for every mutating Studio tool.
- Executes a supported command using the official local MCP client and returns the result.
- Stops polling when the user disconnects.

The cloud agent can therefore operate only on an open Studio session that the user has deliberately connected. No direct cloud-to-local private network assumption is made.

## Desktop updates

The Windows app uses electron-updater with GitHub Releases. The build injects only the public HTTPS `RMANGO_CLOUD_API_URL` GitHub Actions variable; no provider/database secrets enter the client. If the URL is not configured, CI produces an artifact but does not publish a public release. Once configured, stable releases include the installer and `latest.yml`. The app checks shortly after startup and every five minutes, downloads in background, and waits for the user to choose restart/install.

## Development reload

Vite handles React/CSS HMR. Nodemon rebuilds Electron main/preload source and restarts the desktop process in development.

## Not complete yet

- The Vercel cloud deployment and dedicated Supabase database are provisioned. The server-only Supabase service-role secret and desktop public cloud URL still need final configuration; paid inference remains disabled.
- Full authenticated end-to-end tests are still pending. Model inference is intentionally not tested or enabled until a separate paid budget is approved.
- Durable workflow/worker execution for tasks longer than bounded chat request timeouts.
- Admin model policy and cost dashboard.
- Embeddings/vector RAG and project-wide dependency indexing. PDF/DOCX text extraction is now supported for bounded attachments; scanned PDFs without selectable text need screenshots.
- Binary Roblox project file parsing.
- A visual diff viewer for proposed project file changes.

## Deployment

See [cloud/README.md](../cloud/README.md) for Vercel OIDC setup, Supabase migration and GitHub `RMANGO_CLOUD_API_URL` configuration.


## Phase 2 security and context updates

- The Electron main process validates the sender frame for every IPC handler, restricts renderer navigation and new windows, and validates HTTPS external links.
- The renderer has a restrictive Content Security Policy.
- Chat generation can be cancelled from the composer; the desktop aborts the active HTTP stream, preserves partial output and ignores late stream events.
- Local conversation history is encrypted with Windows secure storage and migrated from legacy plaintext on first read.
- The Studio MCP child process is launched with a limited allowlisted Windows environment rather than the full desktop environment.
- The selected-project context layer loads an owner-checked project and a bounded metadata-only file manifest. File contents remain on-demand through the read tool, and all project metadata is treated as untrusted.
- See [Phase 2 audit and architecture plan](../docs/PHASE2-AUDIT.md).


## Roblox skills, multimodal attachments and follow-ups

- The cloud AI core uses a versioned skill selector with focused skill packs for gameplay, Luau, networking/DataStores, UI, 3D/worldbuilding, animation, audio, optimization and testing. It injects at most four relevant skill packs without a second model call.
- Images automatically route to a vision-capable profile. PDF and DOCX are converted to bounded untrusted text on the cloud server before the model sees them.
- During a running turn, the composer accepts additional text/files and queues up to six follow-ups for sequential processing in the same conversation after the active response. A follow-up does not alter the request already generating; this queue is not crash-persistent yet.
- Studio MCP provides generation/edit tools for scripts, scenes, procedural models, meshes, materials, textures, animations and asset search/insertion where exposed by the connected Studio version. Mutations still require user approval.
- The audio skill can author Roblox audio-engine setup and SFX/music integration and search permitted Creator Store assets. It cannot create a finished audio track through this MCP connector.


## Workflow plans, verification state and context-window handling

- The cloud chat coordinator classifies a request into quick, planning, agent, debug or deep-engineering behavior. Multi-step strategies persist an ordered plan with dependencies and observable acceptance criteria in the existing agent-task result JSON; no new database status constraint is required.
- The task row's legacy `status` is a request-lifecycle field. It must not be interpreted as proof that implementation passed acceptance checks. The separate `result.verification.status` is authoritative: ordinary agent/debug/deep responses finish as `unverified` until independent evidence is recorded; planning-only requests use `not_applicable`.
- The desktop task history displays the saved plan and makes the verification state visible instead of presenting a completed model response as a verified implementation.
- Before quota reservation and inference, the chat route estimates text context and applies a conservative reserve for image inputs. When the live model catalogue reports a context window, it drops only the oldest complete user turns, preserves the latest request, reserves output tokens plus a safety margin, and rejects a request that still cannot fit. The character-based tokenizer is explicitly approximate; provider-reported usage remains the source for completed-request usage records.
- This is bounded request-time compaction, not a durable background worker or vector retrieval system. The current workflow plan is persisted and visible, but live per-step editing, worker leases, automatic acceptance-test orchestration and long-running crash recovery remain future work.


## Task-aware project context retrieval

- Selected-project context now ranks file paths and saved memory against the latest user request instead of relying only on alphabetical path order and newest-first memory order.
- The context loader reads bounded metadata only (up to 500 file rows and 60 memory rows), ranks it locally, and includes at most 80 file entries and 20 distinct memory notes. File contents remain on-demand through the existing owner-checked `read_project_file` tool.
- Memory retrieval deduplicates repeated notes by project memory type and title, preferring the newest row returned by the database. The explicit `list_project_memories` tool uses the same ranking and deduplication with an optional search phrase.
- Ranking is deterministic lexical relevance plus a small recency signal, not embeddings or semantic vector search. If no useful query terms exist, existing source ordering is preserved. Deeper project search still uses `search_project_files`.


- Context retrieval emits a live activity item with the number of selected file metadata entries and memory notes. The durable task event records the same counts and whether the manifest is partial, making context selection auditable without logging file contents.
- The relevance helper bounds query text and tokenizes it once per retrieval rather than repeatedly scanning the full request for every candidate.
- Historical PDF/DOCX/text extracts from the recent conversation window are also ranked against the latest follow-up before reuse. The existing six-message lookup and 36,000-character total cap remain in place; attachment content remains marked as untrusted user-level context.

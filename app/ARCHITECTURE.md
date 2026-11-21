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

## Agent execution strategies

The cloud chat coordinator now selects a deterministic execution strategy from the latest user request and the selected model profile. This is policy selection, not a second planner-model call and not a claim that independent agents are running.

- **Quick:** short, non-build requests use a smaller tool-step ceiling and concise context guidance.
- **Debug:** error reports prioritize evidence gathering, call-path tracing, minimal fixes and narrow regression checks.
- **Agent:** multi-step development requests use an inspect/plan/implement/verify/recover/report workflow.
- **Deep engineering:** broad architectural work receives a larger step ceiling and explicit dependency/risk analysis.

The selected strategy and workflow mode are exposed in response headers and persisted in coordinated task metadata. The task record explicitly distinguishes completion of the model response from independent verification of the requested behavior. A generated answer or successful write operation must not be presented as a passing runtime test.

Strategy selection uses the latest prompt and existing profile; it does not change the user's selected model or invent unsupported model capabilities. The workflow still uses the current bounded request lifecycle: durable background execution, resumable task checkpoints and independently persisted acceptance-criteria states remain future work.

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

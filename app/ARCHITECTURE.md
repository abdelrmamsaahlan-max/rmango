# Rmango architecture — cloud inference

## Product boundary

The user's Windows computer is the desktop UI and a limited local tool connector. **All language-model inference, reasoning, model routing and agent planning happens remotely.** The desktop must not load Ollama, download model weights, send requests to AI-provider APIs directly, or contain AI provider secrets.

## Architecture

~~~text
Windows desktop (React + Electron)
  Chat · attachments · project explorer · diff/proposal review
  Encrypted guest session · GitHub updater · Studio MCP tool bridge
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

## Guest-first launch

The first-launch client does not require an email, password or provider key. It waits for the public cloud health check, retrieves only the public Supabase URL and publishable key, and creates an anonymous Supabase Auth user directly from the desktop. The guest access/refresh tokens are saved using Electron safeStorage. Supabase service-role credentials, Vercel OIDC and model/provider secrets remain server-side.

## Auth and storage

- Supabase Auth validates the user's automatically created guest or linked account session on every protected API request.
- On first launch, the desktop fetches only public Supabase configuration and creates an anonymous identity directly with Supabase Auth; it never asks for an AI provider key.
- The desktop stores guest/account access and refresh tokens encrypted using Electron safeStorage. Anonymous workspaces are device-profile scoped until identity linking/recovery is implemented.
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

The Windows app uses electron-updater with GitHub Releases. The build injects only the public HTTPS `RMANGO_CLOUD_API_URL` GitHub Actions variable; no provider/database secrets enter the client. If the URL is not configured, CI produces an artifact but does not publish a public release. Once configured, stable releases include the installer and `latest.yml`. The app checks on startup and every five minutes, downloads in background, and waits for the user to choose restart/install.

## Development reload

Vite handles React/CSS HMR. Nodemon rebuilds Electron main/preload source and restarts the desktop process in development.

## Not complete yet

- Cloud/Vercel project and dedicated Supabase database still need provisioning.
- No live guest-auth/inference/usage/quota/Studio-connector/ZIP end-to-end tests.
- Independent specialist-agent delegation and conflict resolution across separate role-specific agents.
- Admin model policy and cost dashboard.
- PDF/DOCX parsing, embeddings/vector RAG and parser-backed semantic dependency analysis beyond the existing bounded Luau source index.
- Binary Roblox project file parsing.
- A visual diff viewer for proposed project file changes.
- Live anonymous guest creation and hosted chat after the managed RMango cloud is deployed.

## Deployment

See [cloud/README.md](../cloud/README.md) for Vercel OIDC setup, Supabase migration and GitHub `RMANGO_CLOUD_API_URL` configuration.

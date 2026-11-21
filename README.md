# Rmango — Cloud-powered Roblox Studio AI

Rmango is a Windows desktop workspace for Roblox development. **The user's PC is the interface; AI inference is remote.** The desktop does not install Ollama, download language models, use the user's GPU for inference, or ask for AI-provider API keys.

## Current cloud architecture

- **Vercel + Next.js** hosts the API and agent routes.
- **Vercel AI Gateway** routes hosted models and exposes live model capability/pricing metadata.
- **Vercel OIDC** authenticates AI Gateway requests from Vercel deployments. No static AI Gateway key or provider key is configured in production.
- **Supabase Auth, Postgres and private Storage** hold automatically created guest identities, projects, conversations, messages, uploaded source files, project proposals and usage events.
- The Windows desktop automatically creates a private guest identity after the service is healthy, stores its session and local chat history using Windows secure storage, validates the configured cloud URL, and accepts IPC only from its trusted renderer.
- A small local Roblox Studio MCP connector is still needed for a live private Studio session. It is an allowlisted tool bridge only; model inference stays hosted.

## First launch — no account or AI setup

When the managed RMango service is deployed, the desktop automatically creates a private Supabase anonymous guest identity after its health check succeeds. A user can install RMango, launch it and start chatting without entering an email address, creating a password, choosing a model provider, pasting an API key, installing Ollama or downloading model weights.

The app retrieves only the Supabase URL and public publishable key from `/api/public/config`. It creates the anonymous identity directly from the desktop so Supabase applies its per-client-IP abuse and rate limits. The resulting access/refresh session is written using Electron `safeStorage`; no plaintext session is written to disk.

Guest workspace history belongs to that generated identity and normally persists across app restarts on the same Windows profile. It is not currently a recoverable account. Deleting RMango's local app data or moving to another computer can make that guest workspace inaccessible. Identity linking/recovery is a future feature.

This is zero-configuration for users, not infrastructure-free for the RMango operator. Before public launch, enable Supabase Anonymous Sign-Ins, configure CAPTCHA/abuse controls, deploy the cloud service, and explicitly authorize a server-side model usage budget. Do not disable Supabase rate limits.

## Important deployment status

The cloud backend source, migrations and desktop guest flow are committed to GitHub. **The cloud backend is not deployed, and the migrations have not yet been applied to a dedicated Rmango project.** Once the service operator completes the one-time deployment, the app creates a guest workspace automatically; end users will not configure cloud services or AI providers.

No hosted model request or paid inference has been run from this code. No cloud project or provider spend has been activated by this change.

## Cloud deployment prerequisites

1. Authorize the Rmango Vercel team/project scope.
2. Create a dedicated Supabase project for Rmango. Do not reuse an unrelated app database.
3. Apply migrations in order: `202611210001_rmango_cloud.sql`, `202611220001_rmango_agent_workspace.sql`, then `202611230001_rmango_learning_loop.sql`.
4. Enable **Anonymous Sign-Ins** in Supabase Auth for the dedicated RMango project.
5. Create a Vercel project from this repository with Root Directory set to `cloud`.
6. Enable Vercel OIDC for the Vercel project.
7. Add the server-only environment variables described in [cloud/README.md](cloud/README.md).
8. Explicitly authorize an AI Gateway/provider spending budget in the admin account.
9. Set the GitHub Actions repository variable `RMANGO_CLOUD_API_URL` to the public HTTPS Vercel URL.
10. Push/rebuild the desktop installer so the public cloud URL is included in `app/cloud-config.json`.

Cloud inference has a cost. The database usage policy is disabled by default; an administrator must set global daily/monthly USD caps and explicitly enable it before any inference request can start. Per-user request/token quotas and a second Vercel AI Gateway budget provide additional limits.

## Download and install the Windows app

Open [GitHub Releases](https://github.com/abdelrmamsaahlan-max/rmango/releases) and download the newest `Rmango-Setup-<version>-x64.exe`.

The installer is a Windows setup EXE. GitHub's **Code → Download ZIP** is source code, not an installer.

Installed Windows builds check GitHub Releases after startup, every five minutes while running, and when Windows resumes from sleep. Updates download in the background, then wait for your click on **Restart & install**. See [Automatic updates](#automatic-updates).

## Automatic updates

Every push to `main` builds and verifies a versioned Windows NSIS installer artifact. It publishes the EXE and `latest.yml` to a public GitHub Release **only when** the GitHub repository variable `RMANGO_CLOUD_API_URL` is set to the deployed Rmango Cloud HTTPS URL. Without that URL, the installer is retained as a CI artifact and no public release is published.

Public Windows releases are blocked unless both the deployed HTTPS `RMANGO_CLOUD_API_URL` and a valid Authenticode signing certificate are configured. Set GitHub Actions secret `RMANGO_SIGNING_PFX_BASE64`, secret `RMANGO_SIGNING_PFX_PASSWORD`, and repository variable `RMANGO_SIGNING_PUBLISHER_NAME` to the exact signer subject (the subject reported by `Get-AuthenticodeSignature`). The pipeline verifies the signature on both the installer and packaged `Rmango.exe`, and configures signature verification for auto-updates. Pull-request EXEs are unsigned test artifacts and must not be distributed as public installers. A signed publisher identity can reduce Windows warnings, but SmartScreen reputation may still build over time; never disable Defender or bypass a warning just to install an unsigned build.

## Continuous improvement (not instant model retraining)\n\nRMango saves confirmed project decisions and architecture to project-scoped memory, records compact playtest/console verification metrics after completed tasks, and accepts optional helpful/not-helpful feedback on a completed result. These signals improve future project context and evaluation. They do not automatically retrain or change the hosted foundation model's weights, and the learning table does not store full prompts or source files.\n\n## Windows security and signing\n\nThe desktop uses Electron sandboxing, context isolation, renderer-origin checks for every IPC call, a restrictive Content Security Policy, disabled embedded webviews/popups/permissions, HTTPS-only cloud URLs and encrypted local chat/session storage. Public release builds fail closed unless they are Authenticode-signed. Do not turn off SmartScreen or Microsoft Defender to run an unsigned test build.\n\n## Developer hot reload

From `app/`:

~~~powershell
npm install --no-audit --no-fund
npm run dev
~~~

Vite hot-refreshes React/CSS edits. Nodemon rebuilds and restarts Electron when the main/preload process changes. This is a development workflow, not the installed-app auto-updater.

## Local development for the cloud API

From `cloud/`:

~~~powershell
npm install --no-audit --no-fund
npm run typecheck
npm run build
npm run dev
~~~

Authenticated API tests require a dedicated test Supabase project. Production Gateway inference requires a Vercel deployment with OIDC. Do not add model-provider keys to the desktop project.

## Roblox Studio MCP connection

Roblox Studio's official MCP server is started locally by Roblox. Rmango launches it through the Windows Roblox MCP launcher, discovers actual tools, registers the allowlisted schemas with the cloud, then polls for commands.

- Read-only tools can execute without an approval prompt.
- Script edits, Luau execution, asset insertion/uploads, procedural generation, playtesting/input and saving require an explicit approval in the desktop app.
- The local connector only transports tool calls to the user's open Studio instance. All language-model reasoning and inference stays in the cloud.
- Disconnecting Studio stops the bridge.

Setup: in Roblox Studio open **Assistant → … → Manage MCP Servers**, enable **Studio as MCP server**, keep Studio open, then in Rmango choose **Connect to Studio**.

[Official Roblox MCP documentation](https://create.roblox.com/docs/studio/mcp)

## Cloud project workflow

1. Open a local Roblox source folder in Rmango. A private guest workspace is created automatically when the managed service is online.
3. Explicitly choose **Upload project to Cloud**.
4. Supported text/source files upload into the user's private cloud workspace.
5. Ask Rmango Agent to inspect files or propose a change.
6. Review and accept/reject proposed file changes in Rmango.
7. Download the approved cloud project as a ZIP.

Current source-file import is limited to 120 files, 512 KB per file and supported text formats. Binary `.rbxl` / `.rbxm` projects are not parsed by this version.

## Current limitations

- The Vercel cloud app and dedicated Supabase project are not provisioned yet; automatic guest creation and real hosted chat cannot run until the operator completes deployment.
- Model profiles are dynamically selected from Gateway catalogue metadata. No Rmango-specific benchmark runs have been performed; no benchmark scores are displayed as facts.
- The desktop and cloud backend have CI build checks; live anonymous guest creation, hosted inference, quota enforcement against a live database, private upload, Studio bridge and ZIP export still require end-to-end tests after provisioning.
- The Agent Workspace supports durable plan/implementation tasks with saved events, pause/resume/cancel/retry and an incremental source index. Normal chat Studio calls remain synchronous and bounded by request timeouts.
- The Lead agent can request up to three metered, read-only specialist reviews per task (Luau, gameplay, UI/UX, world, assets/animation, QA, performance, security and constrained research analysis). Formal conflict-resolution records, parallel sibling-agent runs, agent-level cost dashboards and external web research are still future work.
- Admin usage dashboard, admin model-routing editor, PDF/DOCX parsing, vector RAG, parser-backed/full semantic project indexing and binary Roblox project import are not complete.
- Current cloud usage policy defaults are 40 requests/day, 800/month, 120,000 tokens/day, 1.5 million tokens/month, and 4,096 max output tokens. A separate Vercel AI Gateway budget is still required.

## Repository structure

- `app/`: React + Electron Windows desktop client.
- `cloud/`: Next.js hosted API and agent service.
- `cloud/lib/ai/models.ts`: live Vercel AI Gateway model discovery and role profiles.
- `cloud/app/api/chat/route.ts`: streaming cloud inference, account/project context, quota reservation and tools.
- `cloud/supabase/migrations/`: owner-scoped cloud database, RLS, storage and usage limits.
- `.github/workflows/cloud-build.yml`: cloud-backend typecheck/production build.
- `.github/workflows/windows-installer.yml`: Windows packaging and GitHub auto-update releases.

Security PR CI now targets the RMango UI base branch explicitly. Public release signing remains required; pull-request installers remain test-only.

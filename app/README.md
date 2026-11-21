# Rmango — Cloud-powered Roblox Studio AI

Rmango is a Windows desktop workspace for Roblox development. **The user's PC is the interface; AI inference is remote.** The desktop does not install Ollama, download language models, use the user's GPU for inference, or ask for AI-provider API keys.

## Current cloud architecture

- **Vercel + Next.js** hosts the API and agent routes.
- **Vercel AI Gateway** routes hosted models and exposes live model capability/pricing metadata.
- **Vercel OIDC** authenticates AI Gateway requests from Vercel deployments. No static AI Gateway key or provider key is configured in production.
- **Supabase Auth, Postgres and private Storage** hold user accounts, projects, conversations, messages, uploaded source files, project proposals and usage events.
- The Windows desktop connects over HTTPS and stores only the user's Rmango account session encrypted with Windows secure storage.
- A small local Roblox Studio MCP connector is still needed for a live private Studio session. It is a tool bridge only; it does not run any AI model.

## Current cloud deployment status

- The Next.js cloud backend is deployed at [rmango-cloud.vercel.app](https://rmango-cloud.vercel.app) with Vercel OIDC enabled.
- The dedicated Supabase project `rmango-cloud` is active in Frankfurt, and migration `202611210001_rmango_cloud.sql` has been applied.
- Encrypted `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` variables are present in Vercel. The server-only `SUPABASE_SERVICE_ROLE_KEY` is still an administrator setup requirement; do not put it in the desktop app or source control.
- The GitHub Actions variable `RMANGO_CLOUD_API_URL` still needs to be configured before a cloud-ready Windows installer can be published.
- The Supabase global AI usage policy is deliberately disabled, with both USD spend caps at zero. No paid inference is authorized or started.

## Remaining cloud setup

1. Add `SUPABASE_SERVICE_ROLE_KEY` as an encrypted server-only Vercel environment variable, then redeploy the cloud backend.
2. Set the GitHub Actions repository variable `RMANGO_CLOUD_API_URL` to `https://rmango-cloud.vercel.app`.
3. Build and verify the first cloud-configured Windows installer before replacing the old pre-cloud release.
4. Keep the database usage policy disabled until the administrator separately approves an AI inference budget.

Cloud inference has a cost. User quotas are enforced in the database before the AI request starts, but they do not replace an administrator-configured provider/Gateway spending limit.

## Download and install the Windows app

Open [GitHub Releases](https://github.com/abdelrmamsaahlan-max/rmango/releases) and download the newest `Rmango-Setup-<version>-x64.exe`.

The installer is a Windows setup EXE. GitHub's **Code → Download ZIP** is source code, not an installer.

Installed Windows builds check GitHub Releases shortly after startup and every five minutes. They download updates in the background, then wait for the user to choose **Restart & install**. See [Automatic updates](#automatic-updates).

## Automatic updates

Every push to `main` builds and verifies a versioned Windows NSIS installer artifact. It publishes the EXE and `latest.yml` to a public GitHub Release **only when** the GitHub repository variable `RMANGO_CLOUD_API_URL` is set to the deployed Rmango Cloud HTTPS URL. Without that URL, the installer is retained as a CI artifact and no public release is published.

The last pre-cloud desktop release is local-AI based and cannot run the new cloud-only client. After the backend is deployed and `RMANGO_CLOUD_API_URL` is configured, install the first cloud-enabled release manually once; later releases can be installed from inside Rmango. Current published build and signing state should be checked on the Releases page.

## Developer hot reload

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

1. Sign in to a Rmango account.
2. Open a local Roblox source folder in Rmango.
3. Explicitly choose **Upload project to Cloud**.
4. Supported text/source files upload into the user's private cloud workspace.
5. Ask Rmango Agent to inspect files or propose a change.
6. Review and accept/reject proposed file changes in Rmango.
7. Download the approved cloud project as a ZIP.

Current source-file import is limited to 120 files, 512 KB per file and supported text formats. Binary `.rbxl` / `.rbxm` projects are not parsed by this version.

## Current limitations

- The Vercel cloud app and Supabase project are not provisioned yet; real account/chat calls are not live.
- Model profiles are dynamically selected from Gateway catalogue metadata. No Rmango-specific benchmark runs have been performed; no benchmark scores are displayed as facts.
- The desktop and cloud backend have CI build checks; full cloud login, hosted inference, quota enforcement against a live database, private upload, Studio bridge and ZIP export still require end-to-end tests after provisioning.
- Long-running agent work is not yet moved to a durable workflow/worker system; current chat requests and Studio tool calls have bounded request timeouts.
- Admin usage dashboard, admin model-routing editor, durable task queue, PDF/DOCX parsing, vector RAG, full project dependency indexing and binary Roblox project import are not complete.
- Current cloud usage policy defaults are 40 requests/day, 800/month, 120,000 tokens/day, 1.5 million tokens/month, and 4,096 max output tokens. A separate Vercel AI Gateway budget is still required.

## Repository structure

- `app/`: React + Electron Windows desktop client.
- `cloud/`: Next.js hosted API and agent service.
- `cloud/lib/ai/models.ts`: live Vercel AI Gateway model discovery and role profiles.
- `cloud/app/api/chat/route.ts`: streaming cloud inference, account/project context, quota reservation and tools.
- `cloud/supabase/migrations/`: owner-scoped cloud database, RLS, storage and usage limits.
- `.github/workflows/cloud-build.yml`: cloud-backend typecheck/production build.
- `.github/workflows/windows-installer.yml`: Windows packaging and GitHub auto-update releases.

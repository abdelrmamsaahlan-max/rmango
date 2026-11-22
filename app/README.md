# Rmango — Cloud-powered Roblox Studio AI

Rmango is a Windows desktop workspace for Roblox development. **The user's PC is the interface; AI inference is remote.** The desktop does not install Ollama, download language models, use the user's GPU for inference, or ask for AI-provider API keys.

## Current cloud architecture

- **Cloudflare Workers + OpenNext** host the Next.js API and agent routes.
- **Cloudflare Workers AI** serves hosted model inference through the Worker's AI binding.
- The desktop uses a public Worker URL only; all AI and Supabase secrets remain server-side.
- **Supabase Auth, Postgres and private Storage** hold user accounts, projects, conversations, messages, uploaded source files, project proposals and usage events.
- The Windows desktop connects over HTTPS and stores only the user's Rmango account session encrypted with Windows secure storage.
- A small local Roblox Studio MCP connector is still needed for a live private Studio session. It is a tool bridge only; it does not run any AI model.

## Current cloud deployment status

- The production API target is `https://rmango.abdosony222.workers.dev`; the live deploy and health gate must pass before this cutover is considered complete.
- The dedicated Supabase project `rmango-cloud` is active in Frankfurt, and migration `202611210001_rmango_cloud.sql` has been applied.
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and the server-only `SUPABASE_SECRET_KEY` must exist as Cloudflare Worker runtime secrets. Never put the server key in the desktop app or source control.
- The Windows installer workflow validates that the packaged endpoint is the approved Cloudflare Worker hostname.
- The deployment is fail-closed: no AI response should be considered ready unless `/api/health` reports `aiReady: true` and the approved spend policy is active.

## Remaining cloud setup

1. Confirm the Cloudflare Worker deploy and production health gate pass.
2. Test desktop sign-in, model listing and a real streamed response with an authorized account.
3. Build and verify a Cloudflare-configured Windows installer before replacing any older release.
4. Keep inference fail-closed unless the administrator has approved the Supabase usage limits and Cloudflare AI spend.

Cloud inference has a cost. User quotas are enforced in the database before the AI request starts; Cloudflare Workers AI usage is also subject to the account's Cloudflare limits and billing.

## Download and install the Windows app

Open [GitHub Releases](https://github.com/abdelrmamsaahlan-max/rmango/releases) and download the newest `Rmango-Setup-<version>-x64.exe`.

The installer is a Windows setup EXE. GitHub's **Code → Download ZIP** is source code, not an installer.

Installed Windows builds check GitHub Releases shortly after startup and every five minutes. Updates download in the background and install on the next normal app exit; you can also choose **Restart & install** as soon as the download finishes. Stable release notes are generated from the commits and shown in the app's update panel. See [Automatic updates](#automatic-updates).

## Automatic updates

Windows releases use the committed Cloudflare endpoint from `app/cloud-config.json`. The Windows workflow rejects any endpoint other than the approved `rmango.abdosony222.workers.dev` Worker and validates every installer. Public releases and `latest.yml` are published only through an explicitly requested signed stable-release build. The release workflow creates a categorized changelog (Added, Fixed, Improved, Maintenance and Other) from commit messages and writes it into the GitHub Release so the in-app updater can display it.

The last pre-cloud desktop release is local-AI based and cannot run the new cloud-only client. After the Cloudflare production health gate passes, install the first Cloudflare-enabled release manually once; later releases can be installed from inside Rmango. Current published build and signing state should be checked on the Releases page.

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

Authenticated API tests require a dedicated test Supabase project or an explicitly authorized test account. Workers AI inference is called only from the Cloudflare Worker; do not add model-provider keys to the desktop project.

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

- The Cloudflare runtime deploy and health gate must pass; full authenticated account/chat calls still require a real desktop-session test.
- Model profiles are dynamically selected from the Cloudflare Workers AI supported-model catalogue. No Rmango-specific benchmark runs have been performed; no benchmark scores are displayed as facts.
- The desktop and cloud backend have CI build checks; full cloud login, hosted inference, quota enforcement against a live database, private upload, Studio bridge and ZIP export still require end-to-end tests after provisioning.
- Long-running agent work is not yet moved to a durable workflow/worker system; current chat requests and Studio tool calls have bounded request timeouts.
- Admin usage dashboard, admin model-routing editor, durable task queue, PDF/DOCX parsing, vector RAG, full project dependency indexing and binary Roblox project import are not complete.
- Current cloud usage policy defaults are 40 requests/day, 800/month, 120,000 tokens/day, 1.5 million tokens/month, and 4,096 max output tokens. Review Cloudflare Workers AI usage and the approved account spend limits.

## Repository structure

- `app/`: React + Electron Windows desktop client.
- `cloud/`: Next.js hosted API and agent service.
- `cloud/lib/ai/models.ts`: live Cloudflare Workers AI supported-model catalogue and role profiles.
- `cloud/app/api/chat/route.ts`: streaming cloud inference, account/project context, quota reservation and tools.
- `cloud/supabase/migrations/`: owner-scoped cloud database, RLS, storage and usage limits.
- `.github/workflows/cloud-build.yml`: cloud-backend typecheck/production build.
- `.github/workflows/windows-installer.yml`: Windows packaging and GitHub auto-update releases.

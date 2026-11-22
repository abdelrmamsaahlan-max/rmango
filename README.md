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
- `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY` and the server-only `SUPABASE_SECRET_KEY` are Cloudflare Worker runtime secrets. Never put the server key in the desktop app or source control.
- The desktop build contains the public Cloudflare Worker endpoint in `app/cloud-config.json`; packaged apps use that committed URL and ignore machine-level legacy endpoint overrides.
- The production inference policy is checked by `/api/health`; it must remain enabled only with administrator-approved request, token and USD caps.

## Remaining cloud setup

1. Keep production Supabase keys in Cloudflare Worker runtime secrets and redeploy after any secret change.
2. Keep `app/cloud-config.json` pointed at the approved Cloudflare Worker.
3. Verify the Cloudflare production health gate before publishing a Windows release.
4. Verify each Windows Release contains both its versioned installer and `latest.yml`; a workflow artifact alone is not an in-app update.
5. Review the Supabase usage policy and Cloudflare Workers AI spend regularly.

Cloud inference has a cost. Fresh deployments default to a disabled global policy; an administrator must explicitly enable usage and set daily/monthly USD caps before inference can start. The current production project has a small enabled budget, but database caps are not a substitute for separate Vercel AI Gateway and provider billing limits. Per-user request/token quotas provide additional limits.

## Download and install the Windows app

Open [GitHub Releases](https://github.com/abdelrmamsaahlan-max/rmango/releases) and download the newest `Rmango-Setup-<version>-x64.exe`.

The installer is a Windows setup EXE. GitHub's **Code → Download ZIP** is source code, not an installer.

Installed Windows builds check GitHub Releases shortly after startup and every five minutes while the app is open. Updates download in the background, but installation always waits for the user to choose **Restart & install**. See [Automatic updates](#automatic-updates).

## Automatic updates

Every push to `main` builds a versioned Windows NSIS installer. When the public HTTPS cloud URL is configured, the workflow publishes the EXE and `latest.yml` to a public GitHub Release, which is the feed read by the in-app updater. A CI workflow artifact by itself is not discoverable by `electron-updater`.

Authenticode publisher signing is optional for the update feed because the desktop updater is configured to accept unsigned updates and validates the HTTPS release metadata and SHA-512 file hash. Unsigned installers do not have a trusted publisher identity and may trigger a Windows SmartScreen unknown-publisher warning. Configure the signing certificate secrets to add publisher identity. Builds older than the first cloud-enabled installer may need one manual install; cloud-enabled builds can update from the GitHub Releases feed.

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

- The production health endpoint checks the Worker AI binding and Supabase usage-policy read. A full desktop sign-in, real hosted model response, private upload, Studio round-trip and ZIP export should still be tested end to end after each release.
- Model profiles are dynamically selected from live Gateway catalogue metadata. Rmango skills are versioned Roblox engineering instruction packs, not separately trained/fine-tuned models. No Rmango-specific benchmark runs have been performed; no benchmark scores are displayed as facts.
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

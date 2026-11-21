# Rmango — Cloud-powered Roblox Studio AI

Rmango is a Windows desktop workspace for Roblox development. The desktop is the interface; model inference runs remotely. The app does not install a local model, download model weights, or use the user's GPU for inference.

## Architecture

- **Cloudflare Workers Free** hosts the Next.js API through the OpenNext Cloudflare adapter.
- **Cloudflare Workers AI** runs `@cf/zai-org/glm-4.7-flash` through the built-in `AI` binding. It supports reasoning and function/tool calling.
- No Vercel AI Gateway, Synap account, external AI API key, prepaid AI credits or paid model subscription is used.
- **Supabase Auth, Postgres and private Storage** continue to hold accounts, projects, conversations, messages, uploaded files, project proposals and usage events.
- The Windows desktop stores the user's Rmango account session encrypted with Windows secure storage.
- The local Roblox Studio MCP connector transports tool calls to the user's Studio process. It does not run an AI model.

## Free-tier limits

Keep the Cloudflare account on **Workers Free**. Do not upgrade to Workers Paid or enable paid AI credits.

- Workers AI includes **10,000 Neurons/day** on Workers Free. Requests fail when the daily free allocation is exhausted; using more requires Workers Paid.
- Workers Free allows **100,000 requests/day** and **10 ms CPU per request**.
- GLM-4.7-Flash supports tool calling, reasoning, a 131,072-token context window and zero data retention.
- The configured RMango model is text-only. Image uploads and the Vision profile are disabled.

This is a useful free development/test tier, not unlimited production capacity. Multi-step agent work can consume multiple model calls. When the free allowance is exhausted, wait for its daily reset rather than upgrading.

## Cloud migration status

The Cloudflare integration is prepared on branch `fix/synap-ai-provider` in draft PR #17. It has **not** yet been deployed or verified using a live Cloudflare account.

The old Vercel endpoint is intentionally left untouched while the migration is tested. Existing installed clients still use their packaged cloud URL until a new Cloudflare URL is configured and a new installer is published.

## Deploy the cloud backend

Requirements: Node.js 22, a Cloudflare account using Workers Free, and the existing Supabase server credentials.

From `cloud/`:

```powershell
npm install --no-audit --no-fund
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SECRET_KEY
npm run cf-deploy
```

Wrangler securely prompts for each Supabase value. Never put the Supabase secret key in source control, the desktop app, or public build variables. The Cloudflare `AI` binding is defined in `cloud/wrangler.jsonc`; no AI provider key is needed.

After the deployment, Wrangler prints your Worker URL, normally:

```text
https://rmango-cloud.<your-account-subdomain>.workers.dev
```

Open `https://<your-worker-url>/api/health`. It should report `status: "ready"` and `aiReady: true` after the Supabase configuration and RMango usage policy are ready.

Then update `app/cloud-config.json` so `apiBaseUrl` contains the exact Cloudflare Worker URL. Rebuild and publish the Windows installer. Existing installations continue using their packaged URL until updated.

**Do not remove the existing Vercel deployment until** Cloudflare health, authenticated chat, a multi-step tool call, project upload, and the new desktop installer have all been tested.

## Local development and CI

From `cloud/`:

```powershell
npm install --no-audit --no-fund
npm run typecheck
npm run cf-build
npm run cf-preview
```

Use a separate test Supabase project for local or CI tests. Local secrets belong in an ignored `.env.development` file, never in Git. The Next.js config initializes the OpenNext local binding bridge.

## Install the Windows app

Open [GitHub Releases](https://github.com/abdelrmamsaahlan-max/rmango/releases) and download the newest `Rmango-Setup-<version>-x64.exe`.

A GitHub **Code → Download ZIP** archive is source code, not the installer.

The updater publishes versioned Windows installers and `latest.yml` to GitHub Releases. A new installer must be built after the Cloudflare API URL is set in `app/cloud-config.json`.

## Roblox Studio MCP connection

In Roblox Studio, open **Assistant → … → Manage MCP Servers**, enable **Studio as MCP server**, and keep Studio open. In Rmango, choose **Connect to Studio**.

- Read-only tools can execute without an approval prompt.
- Script edits, Luau execution, asset insertion/uploads, procedural generation, playtesting/input and saving require explicit approval.
- Disconnecting Studio stops the bridge.

[Official Roblox MCP documentation](https://create.roblox.com/docs/studio/mcp)

## Cloud project workflow

1. Sign in to a Rmango account.
2. Open a local Roblox source folder.
3. Choose **Upload project to Cloud**.
4. Ask Rmango to inspect project files or prepare a change.
5. Review and approve/reject each proposed file change.
6. Download the approved cloud project as a ZIP.

Source-file import is limited to supported text formats and bounded file sizes. Binary `.rbxl` / `.rbxm` projects are not parsed by this version.

## Current limitations

- The Cloudflare migration is not yet production-deployed or end-to-end verified.
- Cloudflare Workers Free has the daily AI Neurons, request and CPU limits listed above.
- Image/vision support is disabled for the selected free model.
- Long-running agent tasks are not yet moved to a durable queue/worker system; chat and Studio calls have bounded timeouts.
- Admin usage dashboard, admin model-routing editor, durable task queue, vector RAG, project-wide dependency indexing and binary Roblox project import are not complete.
- No RMango-specific model benchmark runs have been performed; benchmark scores are not presented as facts.

## Repository structure

- `app/`: React + Electron Windows desktop client.
- `cloud/`: Next.js API adapted to Cloudflare Workers.
- `cloud/lib/ai/models.ts`: Cloudflare Workers AI binding and RMango role profiles.
- `cloud/app/api/chat/route.ts`: streaming chat, project context, usage reservation and tools.
- `cloud/wrangler.jsonc`: Cloudflare deployment and AI binding.
- `cloud/supabase/migrations/`: owner-scoped account, project, storage and usage schema.
- `.github/workflows/cloud-build.yml`: cloud/desktop typechecks and builds, plus Wrangler dry-run validation of the Cloudflare Worker package; deployment remains manual-only.

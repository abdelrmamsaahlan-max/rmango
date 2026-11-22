# Rmango — Cloud-powered Roblox Studio AI

Rmango is a Windows desktop workspace for Roblox development. The desktop is the interface; model inference runs remotely. The app does not install a local model, download model weights, or use the user's GPU for inference.

## Architecture

- **Cloudflare Workers Free** hosts the Next.js API through the OpenNext Cloudflare adapter.
- **Cloudflare Workers AI** runs `@cf/zai-org/glm-4.7-flash` through the built-in `AI` binding. It supports reasoning and function/tool calling.
- No Vercel AI Gateway, Synap account, external AI API key, prepaid AI credits or paid model subscription is used.
- **Supabase Auth, Postgres and private Storage** hold accounts, projects, conversations, messages, uploaded files, project proposals and usage events.
- The Windows desktop stores the user's Rmango account session encrypted with Windows secure storage.
- The local Roblox Studio MCP connector transports tool calls to the user's Studio process. It does not run an AI model.

## Free-tier limits

Keep the Cloudflare account on **Workers Free**. Do not upgrade to Workers Paid or enable paid AI credits.

- Workers AI includes **10,000 Neurons/day** on Workers Free. Requests fail when the daily free allocation is exhausted; using more requires Workers Paid.
- Workers Free allows **100,000 requests/day** and **10 ms CPU per request**.
- GLM-4.7-Flash is the configured reasoning/tool-call model. Confirm current model availability and account quota during live inference testing.
- The configured RMango model is text-only. Image uploads and the Vision profile are disabled.

This is a useful free development/test tier, not unlimited production capacity. Multi-step agent work can consume multiple model calls. When the free allowance is exhausted, wait for its daily reset rather than upgrading.

## Cloud migration status

The Cloudflare OpenNext application bundle is deployed to the existing Worker **`rmango`**, on the account's `abdosony222.workers.dev` subdomain. The deployed production version is **17** (uploaded with Wrangler).

The live Worker has the expected `AI` and `ASSETS` bindings and the three secret bindings `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `SUPABASE_SECRET_KEY`. The Supabase project `rmango-cloud` is active, its RMango schema migrations are applied, and the private `rmango-files` Storage bucket exists. Cloudflare invocation logs and traces are enabled; query-string redaction is on.

**Deployment is not the same as runtime verification.** The public `/api/health` response, real authentication, Workers AI inference, project storage operations, Studio connector round-trip, and desktop compatibility still need live tests. The existence of secret bindings does not validate their underlying values.

The desktop's packaged `app/cloud-config.json` intentionally still points to the Vercel API. Existing installations therefore stay on the working old endpoint until Cloudflare passes the tests below and a new desktop installer is published.

## Verify the deployed cloud backend

The production Worker URL is:

```text
https://rmango.abdosony222.workers.dev
```

Open the health endpoint:

```text
https://rmango.abdosony222.workers.dev/api/health
```

It should return HTTP 200 with `status: "ready"`, `aiReady: true`, `aiBindingConfigured: true`, and `databaseReachable: true`. This endpoint checks bindings, the Supabase usage-policy row and database reachability; it does **not** send a model prompt or prove live inference.

After health succeeds, test in order:
1. Sign in with an existing RMango account.
2. Send an authenticated text-only chat prompt and confirm a real response from Cloudflare Workers AI.
3. Test one approved multi-step tool call.
4. Test project upload, file read/download, and ZIP export through private Supabase Storage.
5. Connect the desktop to Roblox Studio and verify a read-only tool round-trip and an explicitly approved harmless change.

Keep the old Vercel endpoint available until all tests pass.

## Deploy or update the cloud backend

Requirements: Node.js 22, a Cloudflare account using Workers Free, the existing Supabase server credentials, and repository Actions secrets `CLOUDFLARE_API_TOKEN` and `CLOUDFLARE_ACCOUNT_ID`.

From `cloud/`:

```powershell
npm install --no-audit --no-fund
npm run typecheck
npm run cf-check
npm run cf-deploy
```

The AI binding is declared in `cloud/wrangler.jsonc`; no AI provider API key is needed. Supabase values are stored as Worker secrets, not source code or desktop build variables. If rotating them manually, use Wrangler's secure secret prompt:

```powershell
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SECRET_KEY
```

The repository also has a manual GitHub Actions deployment workflow. A dry-run build only validates package/configuration; it does not deploy a Worker.

## Desktop cutover (only after successful live tests)

Once all cloud tests above pass, change `app/cloud-config.json` to the exact verified Worker URL:

```json
{
  "apiBaseUrl": "https://rmango.abdosony222.workers.dev"
}
```

Then run desktop typecheck/build, produce a new Windows installer, install it on a clean test profile, and verify sign-in, streaming chat, update delivery and Studio connection against Cloudflare. Publish the new GitHub Release only after those checks pass.

Do **not** remove the existing Vercel deployment until the updated installer is verified end-to-end. Existing installed clients keep their packaged URL until updated.

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

The updater publishes versioned Windows installers and `latest.yml` to GitHub Releases. A new installer must be built after the Cloudflare API URL is verified and set in `app/cloud-config.json`.

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

- The Cloudflare Worker is deployed, but its public health endpoint and all end-to-end flows still need live verification.
- Cloudflare Workers Free has daily AI Neurons, request and CPU limits; inference is not unlimited.
- Image/vision support is disabled for the selected text-only model.
- Long-running agent tasks are not yet moved to a durable queue/worker system; chat and Studio calls have bounded timeouts.
- Admin usage dashboard, admin model-routing editor, durable task queue, vector RAG, project-wide dependency indexing and binary Roblox project import are not complete.
- No RMango-specific model benchmark runs have been performed; benchmark scores are not presented as facts.

## Repository structure

- `app/`: React + Electron desktop client.
- `cloud/`: Next.js API adapted to Cloudflare Workers.
- `cloud/lib/ai/models.ts`: Cloudflare Workers AI binding and RMango role profiles.
- `cloud/app/api/chat/route.ts`: streaming chat, project context, usage reservation and tools.
- `cloud/wrangler.jsonc`: Cloudflare deployment and AI binding.
- `cloud/supabase/migrations/`: owner-scoped account, project, storage and usage schema.
- `.github/workflows/cloud-build.yml`: cloud/desktop checks, Wrangler dry-run validation, and manually triggered Worker deployment.

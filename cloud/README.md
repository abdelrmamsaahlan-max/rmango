# Rmango Cloud

This folder is the hosted backend for the Rmango Windows desktop client. **Language-model inference runs remotely through Synap.** The desktop does not install Ollama, download model weights, use the user's GPU for inference, or contain the provider API key.

## Architecture

- Next.js App Router API hosted on Vercel.
- Synap's OpenAI-compatible API at `https://synap402.com/v1`, using `qwen3-coder-30b` for text chat and tool calling.
- The Synap API key is configured only in the cloud server's environment; it is never included in the Windows desktop bundle, Git repository, or Supabase database.
- Supabase Auth, Postgres and private Storage for accounts, projects, messages, file metadata, proposals, tasks and usage.
- Windows desktop client connects over HTTPS.
- Optional Roblox Studio MCP bridge runs locally only as a secure tool-transport process. It does not load or run a language model; AI inference remains in the cloud.

## Deployment status

The cloud backend is deployed at `https://rmango-cloud.vercel.app`. Vercel hosts the Next.js backend only; AI requests go directly from the backend to Synap. The dedicated Supabase project `rmango-cloud` (ref `jqkcrtnbxewyqrdpnqap`, Frankfurt) is active and its initial migration has been applied.

Encrypted `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` variables were present in the previous deployment audit. RMango now accepts the recommended server-only `SUPABASE_SECRET_KEY` and the legacy `SUPABASE_SERVICE_ROLE_KEY` for backward compatibility. The health endpoint also verifies an actual read from `usage_policies`, rather than trusting environment-variable presence alone. Recheck the live health endpoint after this deployment.

The Windows installer includes `https://rmango-cloud.vercel.app` as its default public API URL. The optional GitHub Actions variable `RMANGO_CLOUD_API_URL` can override it for another deployment, but is no longer required for the standard RMango build.

The database usage policy remains the final RMango-side spend guard. Synap's free allowance is limited and may be exhausted independently of RMango plan quotas.

## Remaining deployment setup

1. Ensure `SUPABASE_SECRET_KEY` is configured as an encrypted server-only Vercel environment variable. The legacy `SUPABASE_SERVICE_ROLE_KEY` is accepted during migration.
2. Add `SYNAP_API_KEY` as a server-only Vercel environment variable, deploy the backend, and verify `/api/health` reports `status: "ready"` and `aiReady: true` when the database spend policy is enabled.
3. Rebuild and verify the Windows installer. The standard public cloud URL is already included; no repository variable is required.
4. Keep the database spend guard enabled with conservative limits. Synap's free allowance is enforced separately by Synap and is not guaranteed to cover continuous use.

## Vercel setup

Create a Vercel project from this repository and set its **Root Directory** to `cloud`. Use the Next.js framework preset and Node.js 22.

Keep Vercel as the backend host. No Vercel AI Gateway setup or OIDC integration is required for inference. Add `SYNAP_API_KEY` in Project Settings → Environment Variables for Production (and Preview if you test preview deployments), then redeploy.

## Supabase setup

The existing approved Rmango Supabase project is already provisioned. Its initial migration has been applied; do not create another project or reset this database. For a new schema change, add a reviewed, versioned migration and apply it to this project after checking compatibility and recovery requirements.

Initial migration:

`supabase/migrations/202611210001_rmango_cloud.sql`

The migration creates:
- Email/password accounts and user profiles.
- Projects, conversations, messages, private project files and project memories.
- Pending file-change proposals and review status.
- Studio connectors and queued tool commands.
- Per-user usage reservations and usage events.
- A global admin-managed usage policy with daily and monthly request/token limits.
- A private `rmango-files` storage bucket and owner-only row/object policies.

The Supabase Secret API key (or legacy service-role key) is used only by cloud server code for privileged database operations. Never add it to the desktop app, any `NEXT_PUBLIC_*` variable or a public GitHub Actions variable.

## Server environment variables

Set in the Vercel project's server environment only:

| Variable | Required | Purpose |
|---|---:|---|
| `SUPABASE_URL` | Yes | Rmango Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase public/publishable client key used by the server to validate user sessions |
| `SUPABASE_SECRET_KEY` | Yes | Recommended server-only Supabase secret API key (`sb_secret_...`) |
| `SUPABASE_SERVICE_ROLE_KEY` | Legacy | Backward-compatible server-only key for existing deployments |
| `SYNAP_API_KEY` | Yes | Server-only Synap API key; never ship to the desktop app |
| `RMANGO_MAX_OUTPUT_TOKENS` | Optional | Upper bound used by the chat service (maximum 4096 for the free Qwen3 Coder profile) |

The provider API key is required only on the server. RMango desktop users do not enter or receive it.

## GitHub desktop build configuration

The standard public cloud URL is committed in `app/cloud-config.json`. You may set the optional GitHub Actions variable `RMANGO_CLOUD_API_URL` to override it for another deployment. The Windows workflow validates that the URL is HTTPS and never copies database secrets, OIDC tokens or AI-provider credentials into the desktop package.

The desktop code has a compile-time/runtime override `RMANGO_CLOUD_API_URL` for managed deployment environments, but normal installed builds use the packaged public URL.

## Usage and spend controls

The cloud service fails closed by default. The migration seeds a global policy with `enabled = false`, and both daily/monthly USD spend caps default to zero. **No AI inference request can start until an administrator explicitly sets non-zero spend caps and enables the policy in the dedicated Supabase project.**

After authorisation, the default per-user quotas are:
- 40 requests/day.
- 800 requests/month.
- 120,000 tokens/day.
- 1,500,000 tokens/month.
- 4,096 maximum output tokens per request.

The RMango-side global provider spend ceiling is configured in the one-row `public.usage_policies` table. An authorized administrator can enable it in the Supabase SQL editor after choosing a budget:

~~~sql
update public.usage_policies
set enabled = true,
    daily_spend_limit_usd = 2.00,
    monthly_spend_limit_usd = 25.00,
    updated_at = now()
where id = true;
~~~

The example amounts above are illustrative only; do not use them without administrator approval. The database takes a global lock and reserves estimated cost before every model request; it also enforces per-user request/token quotas. Abandoned reservations expire after two hours. RMango uses Synap's published metered Qwen3 Coder prices for conservative reservations even when a request is covered by the provider's free allowance.

The cost reservation estimates text at approximately four characters per token with a 25% margin; this is not an exact provider invoice. Synap enforces its own daily free limits and may reject requests after the allowance is exhausted.

The current free model is text-only and supports tool calling. Synap currently advertises 100,000 tokens/day and 50 requests/day for the first 7 days, then 50,000 tokens/day and 10 requests/day; provider availability and shared free capacity can change. Price figures shown in RMango are conservative metered-cost estimates, not a promise that paid credits are active. Benchmark scores are not fabricated; no automated model benchmarks have been run yet.

## Current endpoints

- `/api/health` — non-secret backend readiness state.
- `/api/auth/sign-up`, `sign-in`, `refresh`, `sign-out` — Rmango accounts.
- `/api/models` — the current Synap model's profile and capability/price metadata.
- `/api/chat` — authenticated streaming cloud chat and cloud agent tools.
- `/api/projects` — account-owned cloud project index/create.
- `/api/projects/:id/files` — private source file upload/list.
- `/api/projects/:id/changes` — pending project changes.
- `/api/projects/:id/changes/:changeId` — approve/reject a file change with original-hash conflict detection.
- `/api/projects/:id/download` — owner-authenticated ZIP export.
- `/api/studio/register`, `poll`, `result`, `disconnect` — authenticated local Studio connector.

## Limitations in this build

- Cloud project import supports text/source files up to 512 KB per file and 120 files per desktop upload. Binary `.rbxl` and `.rbxm` project files are not parsed here.
- The Windows client still has a local-folder picker and local Roblox Studio MCP transport. These are for file selection and Studio control only, not AI inference.
- Studio tool calls are synchronous within a bounded chat route and can time out. A durable WorkflowAgent/queue worker for tasks that outlive a web request is not complete yet.
- Admin usage reports/policy editing UI is not complete. Policies can be managed in the database for now.
- PDF and DOCX text extraction are now supported for bounded attachments (5 MB input cap, 25-page PDF cap, bounded DOCX archive inspection, and 60,000 extracted characters). Scanned PDFs without selectable text still need to be provided as page screenshots.
- Versioned Roblox specialist skills now cover Luau, gameplay architecture, security/DataStores, UI/UX, worldbuilding/3D assets, animation, audio, performance and testing. The selector loads up to four relevant skills without an extra inference call.
- The current free Synap Qwen3 Coder model accepts text only. Image uploads and vision requests are disabled until a vision-capable provider is configured.
- While a response is running, the desktop accepts up to six follow-up messages with files and submits them in order as subsequent turns in the same conversation after the current response. They do not interrupt or alter the already-running generation; the queue is currently in-memory and is not crash-persistent.
- Embeddings/vector RAG, project-wide dependency indexing, diff viewer for proposed file content, durable agent workflow workers and automated Luau test runners are still not complete.
- The Supabase project is provisioned, but full account signup, authenticated project storage, Studio bridge and ZIP-export end-to-end tests remain pending.
- This provider migration has not yet been deployed or tested with a live Synap key. The provider's free allowance is limited; adding paid credits is optional and should never happen without explicit budget approval.

## Local development

You must configure a separate test Supabase project and a server-only `SYNAP_API_KEY` before testing authenticated AI operations. Do not add model keys to a desktop client. For production, deploy the `cloud/` root to Vercel and add the provider key as an encrypted environment variable.


## Phase 2 architecture notes

Selected-project context uses an owner-scoped metadata query with a bounded manifest. Source contents are fetched only when the agent calls the authorized file-read tool. Project names, descriptions, paths, uploaded documents, retrieved content and tool outputs are untrusted data; runtime ownership and tool permissions are the security boundary.

See [the Phase 2 audit and architecture plan](../docs/PHASE2-AUDIT.md) for current findings, design choices, research links and the uncompleted roadmap.


Roblox Studio operations use the allowlisted tool categories supplied by the connected official Studio MCP: script editing, scene generation, procedural models, meshes, materials, textures, animations, asset search/insertion, and playtest/Output inspection where supported. All mutating operations retain user approval. The current connector does not synthesize completed music files; RMango can build AudioPlayer/Emitter/Listener/Wire/effects systems and search for permitted Creator Store audio assets.


### Attachment context continuity

For subsequent follow-up turns, the cloud API retains bounded text excerpts from PDF/DOCX attachments in the user's conversation message. It retrieves excerpts only from the previous six user messages for the same authenticated owner and conversation, with a 36,000-character combined cap. This stores extracted text (not original document or image blobs); users should reattach images when referring to their visual details in a later turn.

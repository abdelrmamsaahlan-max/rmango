# Rmango Cloud

This folder is the hosted backend for the Rmango Windows desktop client. **All language-model inference runs remotely through Vercel AI Gateway.** The desktop does not install Ollama, download model weights, use the user's GPU for inference, or request an AI-provider key.

## Architecture

- Next.js App Router API hosted on Vercel.
- Vercel AI Gateway for model routing, capability catalogue, live model prices, and fallback models.
- Vercel OIDC for Gateway authentication. Production does not use AI_GATEWAY_API_KEY or provider API keys.
- Supabase Auth, Postgres and private Storage for accounts, projects, messages, file metadata, proposals, tasks and usage.
- Windows desktop client connects over HTTPS.
- Optional Roblox Studio MCP bridge runs locally only as a secure tool-transport process. It does not load or run a language model; AI inference remains in the cloud.

## Deployment status

The cloud backend is deployed at `https://rmango-cloud.vercel.app` with Vercel OIDC enabled. The dedicated Supabase project `rmango-cloud` (ref `jqkcrtnbxewyqrdpnqap`, Frankfurt) is active and its initial migration has been applied.

Encrypted `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` variables are present in Vercel. The server-only `SUPABASE_SERVICE_ROLE_KEY` is still required before database-backed admin operations can be considered ready. The GitHub Actions variable `RMANGO_CLOUD_API_URL` is still needed before publishing a cloud-configured desktop installer.

The database usage policy remains `enabled = false` with daily and monthly spend caps set to zero. No paid model inference has been enabled or tested.

## Remaining deployment setup

1. Add `SUPABASE_SERVICE_ROLE_KEY` as an encrypted server-only Vercel environment variable and redeploy.
2. Add `RMANGO_CLOUD_API_URL=https://rmango-cloud.vercel.app` as a GitHub Actions repository variable.
3. Rebuild and verify the cloud-configured Windows installer.
4. Keep paid AI inference disabled until a separate budget is explicitly approved.

## Vercel setup

Create a Vercel project from this repository and set its **Root Directory** to `cloud`. Use the Next.js framework preset and Node.js 22.

Enable Vercel OIDC for the project. The production AI Gateway provider uses the Vercel deployment identity (`VERCEL_OIDC_TOKEN`); it does not read a static AI key or any user-supplied provider key.

After the first deployment, set the Vercel environment variables below and redeploy.

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

The service-role key is only used in cloud server code for atomic usage accounting. Never add it to the desktop app, any `NEXT_PUBLIC_*` variable or a public GitHub Actions variable.

## Server environment variables

Set in the Vercel project's server environment only:

| Variable | Required | Purpose |
|---|---:|---|
| `SUPABASE_URL` | Yes | Rmango Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Yes | Supabase public/publishable client key used by the server to validate user sessions |
| `SUPABASE_SERVICE_ROLE_KEY` | Yes | Server-only service role, used only for usage-reservation RPCs |
| `VERCEL_OIDC_TOKEN` | Automatic on Vercel | Authentication to AI Gateway; no static AI key |
| `RMANGO_MODEL_FAST` | Optional | Admin-selected Gateway model ID for Rmango Fast |
| `RMANGO_MODEL_DEVELOPER` | Optional | Admin-selected Gateway model ID for Rmango Developer |
| `RMANGO_MODEL_THINK` | Optional | Admin-selected Gateway model ID for Rmango Think |
| `RMANGO_MODEL_VISION` | Optional | Admin-selected Gateway model ID for Rmango Vision |
| `RMANGO_MODEL_AGENT` | Optional | Admin-selected Gateway model ID for Rmango Agent |
| `RMANGO_MODEL_FALLBACKS_*` | Optional | Comma-separated compatible model IDs for fallback routing |
| `RMANGO_MAX_OUTPUT_TOKENS` | Optional | Upper bound used by the chat service (clamped by the DB policy) |

No AI provider or AI Gateway API key is supported in the production configuration. Model calls are authenticated by Vercel OIDC.

## GitHub desktop build configuration

After Vercel is deployed, set the GitHub repository Actions variable:

- `RMANGO_CLOUD_API_URL` = the public HTTPS base URL of the Rmango Cloud deployment, without a trailing slash.

The Windows workflow copies only this public URL into `app/cloud-config.json`. It does not put database secrets, OIDC tokens or AI-provider credentials into the desktop package.

The desktop code has a compile-time/runtime override `RMANGO_CLOUD_API_URL` for managed deployment environments, but normal installed builds use the packaged public URL.

## Usage and spend controls

The cloud service fails closed by default. The migration seeds a global policy with `enabled = false`, and both daily/monthly USD spend caps default to zero. **No AI inference request can start until an administrator explicitly sets non-zero spend caps and enables the policy in the dedicated Supabase project.**

After authorisation, the default per-user quotas are:
- 40 requests/day.
- 800 requests/month.
- 120,000 tokens/day.
- 1,500,000 tokens/month.
- 4,096 maximum output tokens per request.

The global provider/Gateway spend ceiling is configured in the one-row `public.usage_policies` table. An authorized administrator can enable it in the Supabase SQL editor after choosing a budget:

~~~sql
update public.usage_policies
set enabled = true,
    daily_spend_limit_usd = 2.00,
    monthly_spend_limit_usd = 25.00,
    updated_at = now()
where id = true;
~~~

The example amounts above are illustrative only; do not use them without administrator approval. Configure a matching hard budget in Vercel AI Gateway as a second independent control. The database takes a global lock and reserves estimated cost before every model request; it also enforces per-user request/token quotas. Abandoned reservations expire after two hours. Models without published input/output price metadata are rejected before inference. Fallback models must have known per-token prices no higher than the primary model.

The cost reservation estimates text at approximately four characters per token with a 25% margin and reserves 20,000 input tokens per image as a conservative heuristic; this is not an exact provider invoice. The Vercel Gateway/provider budget remains authoritative.

Model catalogue data is fetched live from Gateway metadata. Price information shown in the client is provider catalogue data, not a promise that requests are free. Benchmark scores are not fabricated; no automated model benchmarks have been run yet.

## Current endpoints

- `/api/health` — non-secret backend readiness state.
- `/api/auth/sign-up`, `sign-in`, `refresh`, `sign-out` — Rmango accounts.
- `/api/models` — live model profiles and capability/price metadata.
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
- Image attachments automatically route to the Vision model profile.
- While a response is running, the desktop accepts up to six follow-up messages with files and submits them in order as subsequent turns in the same conversation after the current response. They do not interrupt or alter the already-running generation; the queue is currently in-memory and is not crash-persistent.
- Embeddings/vector RAG, project-wide dependency indexing, diff viewer for proposed file content, durable agent workflow workers and automated Luau test runners are still not complete.
- The Supabase project is provisioned, but full account signup, authenticated project storage, Studio bridge and ZIP-export end-to-end tests remain pending. The server-only service-role secret is not yet configured in Vercel.
- Paid model inference is deliberately disabled and has not been tested. Do not enable it without a separately approved budget.

## Local development

You must configure a separate test Supabase project and a secure Vercel OIDC/development setup before testing authenticated API operations. Do not add model keys to a desktop client. For production, deploy the `cloud/` root to Vercel and use Vercel OIDC.


## Phase 2 architecture notes

Selected-project context uses an owner-scoped metadata query with a bounded manifest. Source contents are fetched only when the agent calls the authorized file-read tool. Project names, descriptions, paths, uploaded documents, retrieved content and tool outputs are untrusted data; runtime ownership and tool permissions are the security boundary.

See [the Phase 2 audit and architecture plan](../docs/PHASE2-AUDIT.md) for current findings, design choices, research links and the uncompleted roadmap.


Roblox Studio operations use the allowlisted tool categories supplied by the connected official Studio MCP: script editing, scene generation, procedural models, meshes, materials, textures, animations, asset search/insertion, and playtest/Output inspection where supported. All mutating operations retain user approval. The current connector does not synthesize completed music files; RMango can build AudioPlayer/Emitter/Listener/Wire/effects systems and search for permitted Creator Store audio assets.


### Attachment context continuity

For subsequent follow-up turns, the cloud API retains bounded text excerpts from PDF/DOCX attachments in the user's conversation message. It retrieves excerpts only from the previous six user messages for the same authenticated owner and conversation, with a 36,000-character combined cap. This stores extracted text (not original document or image blobs); users should reattach images when referring to their visual details in a later turn.

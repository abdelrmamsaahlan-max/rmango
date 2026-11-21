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

The backend source and database migration are committed in this repository. They are **not yet deployed** and the migration has **not yet been applied to a Supabase project**. No paid model inference request has been made.

Deployment requires:
1. An approved Vercel project in the account/team that owns the Rmango domain and release.
2. A new dedicated Supabase project for Rmango. Do not reuse unrelated projects.
3. Vercel OIDC enabled for the cloud project.
4. The database migration applied to that Supabase project.
5. Server-only environment variables configured in Vercel.
6. An HTTPS deployment URL added as the GitHub repository variable RMANGO_CLOUD_API_URL.
7. An administrator explicitly authorizing the cloud Gateway budget/spend policy before model-generation requests are enabled.

## Vercel setup

Create a Vercel project from this repository and set its **Root Directory** to `cloud`. Use the Next.js framework preset and Node.js 22.

Enable Vercel OIDC for the project. The production AI Gateway provider uses the Vercel deployment identity (`VERCEL_OIDC_TOKEN`); it does not read a static AI key or any user-supplied provider key.

After the first deployment, set the Vercel environment variables below and redeploy.

## Supabase setup

Create a **new** Supabase project for Rmango. Apply:

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

The migration seeds a conservative default policy:
- 40 requests/day per user.
- 800 requests/month per user.
- 120,000 tokens/day per user.
- 1,500,000 tokens/month per user.
- 4,096 maximum output tokens per request.

The database reserves request/token budget **before** starting inference and records usage after completion. Failed/cancelled requests release reservations. Administrators must configure a matching provider/Gateway spend budget in Vercel. Per-user quotas are not a substitute for a provider-level spending cap.

Model catalogue data is fetched live from Gateway metadata. Price information shown in the client is indicative per-token model pricing, not a promise that requests are free. Benchmark scores are not fabricated; no automated model benchmarks have been run yet.

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
- PDF/DOCX parsing, embeddings/vector RAG, project-wide dependency indexing, diff viewer for proposed file content, and automated Luau test runners are not complete.
- No end-to-end cloud inference, real account signup, Studio bridge or ZIP export test has been performed because the cloud database/project has not been provisioned.

## Local development

You must configure a separate test Supabase project and a secure Vercel OIDC/development setup before testing authenticated API operations. Do not add model keys to a desktop client. For production, deploy the `cloud/` root to Vercel and use Vercel OIDC.

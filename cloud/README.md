# Rmango Cloud

This folder is the hosted backend for the Rmango Windows desktop client. **All language-model inference runs remotely through Vercel AI Gateway.** The desktop does not install Ollama, download model weights, use the user's GPU for inference, or request an AI-provider key.

## Architecture

- Next.js App Router API hosted on Vercel.
- Vercel AI Gateway for model routing, capability catalogue, live model prices, and fallback models.
- Vercel OIDC for Gateway authentication. Production does not use AI_GATEWAY_API_KEY or provider API keys.
- Supabase Auth, Postgres and private Storage for anonymous guest identities, optional future accounts, projects, messages, file metadata, proposals, tasks and usage.
- Windows desktop client connects over HTTPS.
- Optional Roblox Studio MCP bridge runs locally only as a secure tool-transport process. It does not load or run a language model; AI inference remains in the cloud.

## Deployment status

The backend source and database migration are committed in this repository. They are **not yet deployed** and the migration has **not yet been applied to a dedicated Supabase project**. No paid model inference request has been made. Once the service is deployed and guest access is enabled, the desktop creates its guest identity automatically; end users do not sign up or configure cloud providers.

Deployment requires:
1. An approved Vercel project in the account/team that owns the Rmango domain and release.
2. A new dedicated Supabase project for Rmango. Do not reuse unrelated projects.
3. Vercel OIDC enabled for the cloud project.
4. The database migration applied to that Supabase project.
5. **Anonymous Sign-Ins enabled** in Supabase Authentication → Providers for the Rmango project.
6. Server-only environment variables configured in Vercel.
7. An HTTPS deployment URL added as the GitHub repository variable RMANGO_CLOUD_API_URL.
8. An administrator explicitly authorizing the cloud Gateway budget/spend policy before model-generation requests are enabled.

## Automatic guest access (end-user experience)

The desktop app creates the Supabase anonymous user directly from the user's machine after /api/health reports that the managed service is ready. It calls the public Supabase Auth signup endpoint with the public publishable key and a small app display-name field. Doing this from the client preserves Supabase's per-client-IP anonymous-sign-in rate limit instead of funneling every guest through the Vercel server's outbound IP.

- Users do not need email, password, a Rmango account, an AI-provider key, or a local model runtime.
- /api/public/config returns only SUPABASE_URL and SUPABASE_PUBLISHABLE_KEY. These are public client settings. It must never return SUPABASE_SERVICE_ROLE_KEY, VERCEL_OIDC_TOKEN, or any provider secret.
- Guest access uses the normal authenticated user role and every user-owned record remains scoped by the existing owner_id = auth.uid() row-level security policies.
- The desktop persists the access/refresh session using Electron safeStorage; it never writes the session as plaintext. A guest identity is not recoverable after the user deletes local app data, clears the saved session, or changes computers. Account linking/recovery is not implemented in this version.

Enable Anonymous Sign-Ins in Supabase Auth for the dedicated Rmango project. Supabase currently documents a default limit of 30 anonymous sign-ins per hour per IP and recommends CAPTCHA protection to reduce automated abuse. The desktop guest flow currently does not send a CAPTCHA token, so add and test a Turnstile/CAPTCHA challenge before promoting the service to a broad public launch. Do not disable Supabase rate limits.

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

No AI provider or AI Gateway API key is supported in the production configuration. The desktop needs no user account or provider credentials; the one-time operator setup remains server-side. Model calls are authenticated by Vercel OIDC.

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
- `/api/public/config` — public Supabase URL and publishable key for automatic guest creation; no server secrets.
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

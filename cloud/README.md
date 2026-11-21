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
4. Apply the base database migration, then the incremental workspace/index migration, then the project learning/evaluation migration.
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

The two migrations create:
- Email/password accounts and user profiles.
- Projects, conversations, messages, private project files and project memories.
- Pending file-change proposals and review status.
- Studio connectors and queued tool commands, including task-linked commands and approval state.
- Per-user usage reservations and usage events.
- A global admin-managed usage policy with daily and monthly request/token limits.
- A versioned source index with Luau symbols, dependency edges and index-run history.
- Compact project task-evaluation signals and optional helpful/not-helpful feedback; these are context/evaluation data, not foundation-model training.
- A private `rmango-files` storage bucket and owner-only row/object policies.

Apply `supabase/migrations/202611210001_rmango_cloud.sql` first, followed by `supabase/migrations/202611220001_rmango_agent_workspace.sql`. The second migration is incremental and expects the base project tables to exist. Apply `supabase/migrations/202611230001_rmango_learning_loop.sql` third; it adds owner-scoped task evaluation and optional feedback records.

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
- `/api/agent/tasks` — create a durable project-scoped agent workflow and list the user's tasks.
- `/api/agent/tasks/:taskId` — read task state/events and pause, resume, cancel or retry an owned task.
- `/api/projects/:id/index` — inspect index coverage and start a full project re-index.
- `/api/studio/register`, `poll`, `result`, `disconnect`, `approval` — authenticated local Studio connector, task-linked commands and approval decisions.

## Limitations in this build

- Desktop import scans up to 2,000 non-hidden project entries and uploads supported text/source files up to 512 KB each. Binary `.rbxl` and `.rbxm` files, assets and files outside the supported text formats are reported as skipped; they are not unpacked or parsed.
- The Luau index is a lightweight, versioned source scanner. It extracts module/function/service/remote symbols and common `require`/instance references; it is not a full Luau AST, type checker, or proof that a referenced instance exists in the live DataModel. Ambiguous or unresolved links retain low confidence.
- Durable tasks index stale uploaded source files, create an implementation plan, run a WorkflowAgent loop, and can call the currently registered allowlisted Roblox Studio MCP tools through the local desktop bridge. Studio commands are persisted against the task; mutating tools wait for the desktop approval decision. Pausing/cancelling also cancels pending Studio commands.
- The Electron Agent Workspace reads task state and event history from cloud storage, so task lists, plans, activity, errors and reports remain available after the desktop app closes. The UI polls saved task state; it does not depend on a single open window or chat transcript.
- Playtest verification is conservative. RMango marks runtime verified only when the connected Studio subagent returns an explicit passing playtest result and a subsequent console inspection gives a clean result. A started play session, successful code edit or successful tool call alone is not a pass.
- Normal chat Studio calls remain synchronous and can time out; the durable Studio tool path is used by the Agent Workspace task workflow.
- Admin usage reports/policy editing UI is not complete. Policies can be managed in the database for now.
- Full Luau AST/type analysis, automated arbitrary game-specific test generation, vector/embedding RAG, full binary place/model parsing, complete semantic dependency analysis, side-by-side proposal diff UI and specialist-agent delegation are not complete.
- Cloud inference, signup, storage, and real Roblox Studio playtest still require an activated Rmango Supabase/Vercel deployment and a connected desktop Studio session. This PR's CI verifies code builds and unit tests; it does not substitute for a live game playtest.

## Local development

You must configure a separate test Supabase project and a secure Vercel OIDC/development setup before testing authenticated API operations. Do not add model keys to a desktop client. For production, deploy the `cloud/` root to Vercel and use Vercel OIDC.

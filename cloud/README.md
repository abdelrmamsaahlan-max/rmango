# RMango Cloud

RMango's hosted Next.js API runs on **Cloudflare Workers** through OpenNext. It uses the existing Supabase project for authentication, user profiles, projects, conversations, messages, project files, memories, agent tasks and usage accounting. Model inference uses the Cloudflare Workers AI binding.

## Existing Supabase project

Use the already-provisioned project only:

- Project: `rmango-cloud`
- Ref: `jqkcrtnbxewyqrdpnqap`
- Region: `eu-central-1`
- URL: `https://jqkcrtnbxewyqrdpnqap.supabase.co`

Its existing migrations and application tables are already present. Do not create a new Supabase project or reset production data. Inspected public tables have RLS enabled.

## Cloudflare build settings

Repository: `abdelrmamsaahlan-max/rmango`, production branch: `main`.

The Cloudflare Git build for this Worker must use:

| Setting | Value |
|---|---|
| Root directory | `/cloud` |
| Build command | `npm run build:cloudflare` |
| Deploy command | `npm run deploy:cloudflare` |
| Production branch | `main` |

The app's Worker configuration is in `cloud/wrangler.jsonc`. The OpenNext output entrypoint is `.open-next/worker.js`. The `AI` binding is declared in Wrangler config. The `keep_vars` setting preserves dashboard-managed variables and secrets across deploys.

## Runtime secrets

These must exist as **Production runtime** secrets under the Worker Settings → Variables and Secrets. Build-configuration secrets are not sufficient.

| Name | Value |
|---|---|
| `SUPABASE_URL` | Existing project URL above |
| `SUPABASE_PUBLISHABLE_KEY` | Existing project's active publishable key |
| `SUPABASE_SECRET_KEY` | Existing project's server-only secret key |

The secret API key must never be exposed to the browser or desktop app, committed to Git, or logged. Do not use `NEXT_PUBLIC_*` for any of these values.

## Workers AI profiles

RMango retains the five existing model profiles:

| Profile | Default model |
|---|---|
| Fast | `@cf/zai-org/glm-4.7-flash` |
| Developer | `@cf/zai-org/glm-4.7-flash` |
| Agent | `@cf/zai-org/glm-4.7-flash` |
| Think | `@cf/google/gemma-4-26b-a4b-it` |
| Vision | `@cf/google/gemma-4-26b-a4b-it` |

Model capabilities and pricing are declared in `lib/ai/models.ts` using Cloudflare's published model information. The chat route calls `createAI({ binding: env.AI })` from `agents/models/ai-sdk` and streams through the existing AI SDK tools. No Vercel OIDC token, Vercel AI Gateway API key, or user-supplied model-provider key is needed.

## Spend controls

The existing `public.usage_policies` row remains the authoritative budget and quota gate. The latest verified row is enabled with USD $0.10 daily and USD $1.00 monthly global spend caps. These existing settings were not modified by the Cloudflare migration. Monitor usage and do not increase limits without explicit administrator approval.

## Health and API routes

- `GET /api/health` checks Worker AI binding presence, Supabase runtime configuration and a real read from `public.usage_policies`.
- `/api/auth/sign-up`, `sign-in`, `refresh`, `sign-out` provide Supabase account functions.
- `/api/models` returns the five RMango AI profiles.
- `/api/chat` provides authenticated streaming model responses and existing project/Studio tools.
- `/api/projects` manages account-owned projects.
- `/api/projects/:id/files` manages private project source-file uploads.
- `/api/projects/:id/changes` handles proposed project changes and approvals.
- `/api/projects/:id/download` exports an owner-authenticated project archive.
- `/api/studio/register`, `poll`, `result`, `disconnect` provide the local Studio connector.

## Local validation

Run from this directory:

1. `npm install`
2. Configure a private, ignored `.dev.vars` file for Supabase secrets.
3. `npx wrangler types`
4. `npm run typecheck`
5. `npm run build:cloudflare`
6. `npm run preview:cloudflare`

The production desktop API URL must not be changed until Cloudflare health, auth, model listing, chat streaming, project CRUD, private file storage and conversation persistence have been tested end-to-end.

## Remaining limitations

- Binary Roblox place/model files (`.rbxl`, `.rbxm`) are not parsed by the cloud project importer.
- Studio operations still depend on the user's local Roblox Studio and RMango desktop connector, with approval required for mutations.
- Studio tool calls run within a bounded chat request; durable long-running job execution is not complete.
- The admin usage-management UI, embeddings/vector retrieval, project-wide indexing and automated Luau test runner are not complete.

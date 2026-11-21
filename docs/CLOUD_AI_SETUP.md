# Activating Rmango Cloud AI

The desktop app is intentionally a thin client. Model inference, Studio orchestration, project APIs, and usage accounting run on the hosted service.

## 1. Add the server-only Supabase key

The Vercel production deployment currently has the Supabase project URL and publishable key, but does not have the server-only key required by the cloud API.

In the Vercel project **rmango-cloud → Settings → Environment Variables**, add:

- Name: `SUPABASE_SECRET_KEY`
- Value: the Supabase project's server-side secret key from **Supabase → Project Settings → API Keys**
- Environments: Production, Preview, and Development

The legacy `SUPABASE_SERVICE_ROLE_KEY` variable is supported for compatibility, but the newer `SUPABASE_SECRET_KEY` is preferred.

Do not put this key in the desktop app, renderer code, GitHub source files, screenshots, or chat messages. Redeploy the Vercel project after adding it.

## 2. Verify infrastructure

Open the production `/api/health` endpoint. The service should report that its database is configured and reachable. The Supabase project itself can be healthy while the Vercel deployment is unable to connect because the server key is absent.

## 3. Authorize a usage budget

The database's `public.usage_policies` row currently has `enabled = false` and daily/monthly spend limits set to zero. The chat route rejects requests before calling a model while this policy is disabled.

An administrator must explicitly choose and configure positive daily and monthly spend limits, plus appropriate request and token caps, before enabling inference. Rmango does not enable paid model usage automatically. The cloud route also rejects requests when published model pricing metadata is unavailable and reserves estimated usage before starting inference.

Once the server key and approved budget are in place, sign in to Rmango Desktop, use **Test cloud connection**, and confirm the cloud status says ready before sending a prompt.

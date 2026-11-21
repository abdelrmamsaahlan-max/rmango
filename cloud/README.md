# Rmango Cloud

The Rmango cloud backend is a Next.js App Router application deployed to **Cloudflare Workers Free** using the OpenNext Cloudflare adapter. Model inference uses **Cloudflare Workers AI**. The desktop app contains no AI provider key and does not run a local language model.

## Architecture

- Cloudflare Workers Free runs the Next.js API through `@opennextjs/cloudflare`.
- Workers AI uses the built-in `AI` binding and model `@cf/zai-org/glm-4.7-flash`.
- GLM-4.7-Flash supports tool/function calling, reasoning, a 131,072-token context window and zero data retention.
- Supabase Auth, Postgres and private Storage continue to hold Rmango accounts, projects, conversations, messages, files, approved changes and usage events.
- The Roblox Studio MCP connector remains local to the Windows desktop and only transports approved Studio tools.

There is no Vercel AI Gateway, Synap API key, Google Gemini key, external AI provider key, prepaid AI credit, or paid model subscription in this configuration.

## Free plan limits

Keep the Cloudflare account on **Workers Free**. Do not upgrade to Workers Paid or enable paid AI credits.

- Workers AI: 10,000 Neurons/day at no charge. Requests fail when the daily free allocation is exhausted; using more requires Workers Paid.
- Workers hosting: 100,000 requests/day and 10 ms CPU per request on Workers Free.
- The model has published metered prices on paid plans, but this RMango configuration relies on the Workers Free allocation. Do not enable paid billing.

This is a free development/test tier, not unlimited production capacity. The daily AI allocation can be consumed faster when the agent performs multiple tool-calling steps. When the free allowance is exhausted, wait for its daily reset rather than upgrading.

The selected model is text-only in this RMango configuration. Image uploads and the Vision profile are disabled.

## Deploy to Cloudflare Workers

Requirements: Node.js 22, a Cloudflare account with Workers Free enabled, and the existing Supabase server credentials. No Vercel account or AI provider key is required.

From this folder:

```powershell
npm install --no-audit --no-fund
npx wrangler login
npx wrangler secret put SUPABASE_URL
npx wrangler secret put SUPABASE_PUBLISHABLE_KEY
npx wrangler secret put SUPABASE_SECRET_KEY
npm run cf-deploy
```

Wrangler prompts for each secret. Use the existing values from the approved Supabase project. Never put the Supabase secret key in source control, the desktop application, or a public build variable. The `AI` binding is already declared in `wrangler.jsonc`; Cloudflare supplies the model service without an API key.

The deploy command prints your Worker URL, normally `https://rmango-cloud.<your-account-subdomain>.workers.dev`.

After deploying:

1. Open `https://<your-worker-url>/api/health`. It should report `status: "ready"` and `aiReady: true`.
2. Verify an authenticated chat request and a multi-step tool call.
3. Update `app/cloud-config.json` so `apiBaseUrl` is the exact Cloudflare Worker URL.
4. Build and publish a new Windows installer. Existing installed clients continue using their packaged URL until updated.

Do not remove the old Vercel deployment until the Cloudflare endpoint and a new desktop installer have passed those checks.

## Local development and verification

```powershell
npm install --no-audit --no-fund
npm run typecheck
npm run cf-build
npm run cf-preview
```

Use a separate test Supabase project for local or CI tests. Local development can use a local `.env.development`; never commit it. The Next.js configuration initializes the OpenNext local binding bridge so the app can use Cloudflare bindings during development.

## Supabase configuration

The existing Supabase project remains the source of truth. Do not create a replacement database or reset its schema during this migration.

Required runtime secrets:

| Secret | Purpose |
|---|---|
| `SUPABASE_URL` | Existing Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase public/publishable key used to validate sessions |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret API key |
| `SUPABASE_SERVICE_ROLE_KEY` | Optional legacy fallback for existing deployments |

Set each with `npx wrangler secret put NAME` or Cloudflare's Worker Settings → Variables and Secrets. Secrets are available server-side through Node-compatible `process.env`; the Workers configuration enables Node.js compatibility.

The RMango database usage policy is a second, internal request guard. It does not make a payment to Cloudflare. Cloudflare's Workers Free limit is the upstream hard stop. The health endpoint will report `aiReady: false` while the RMango usage policy is disabled.

## Repository files

- `cloud/app/api/chat/route.ts`: authenticated streaming chat, project context, and Roblox Studio tools.
- `cloud/lib/ai/models.ts`: Cloudflare Workers AI model binding and profile metadata.
- `cloud/wrangler.jsonc`: Workers Free deployment, AI binding, assets, CPU cap and observability.
- `cloud/open-next.config.ts`: Next.js adapter configuration.
- `cloud/supabase/migrations/`: owner-scoped account, project, conversation, storage and usage schema.
- `app/cloud-config.json`: public cloud API URL packaged with the Windows desktop client.

## Known limitations

- Cloudflare Workers Free is limited to 10,000 Workers AI Neurons/day, 100,000 Worker requests/day and 10 ms CPU per request.
- The configured GLM-4.7-Flash model is text-only here; image/vision requests are disabled.
- The free allowance is not guaranteed to cover long agent sessions. Tool calls can create multiple model invocations.
- Full end-to-end Cloudflare deployment, sign-in, project file storage, Studio bridge, and ZIP export must be verified before removing the old Vercel endpoint.
- Long-running agent work is not yet moved to a durable queue/worker system. Studio tool calls remain bounded by the cloud route timeout.

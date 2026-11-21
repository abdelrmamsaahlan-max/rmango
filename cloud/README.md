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

## Deploy to Cloudflare Workers with GitHub Actions

The existing `.github/workflows/cloud-build.yml` workflow includes a **manual-only** Cloudflare deploy job. The deploy job does not run on pushes or pull requests; it runs only when you manually dispatch the workflow and explicitly select `confirm_deploy: yes`. Normal pull-request checks still build and type-check both the desktop and cloud app.

### One-time Cloudflare setup

1. Keep the account on **Workers Free**.
2. Open [Cloudflare Workers & Pages](https://dash.cloudflare.com/?to=/:account/workers-and-pages) once. A new account may not yet have a `workers.dev` subdomain; Cloudflare creates it when the Workers & Pages landing page is first opened.
3. In Cloudflare, create an **Account API token** using the **Edit Cloudflare Workers** template. Scope it to only the account where RMango will be deployed. Do not use the Global API Key.
4. In the GitHub repository, open **Settings → Secrets and variables → Actions → New repository secret** and add:
   - `CLOUDFLARE_API_TOKEN`: the API token created above.
   - `CLOUDFLARE_ACCOUNT_ID`: the account ID shown in Cloudflare's account overview.

Never paste either value into chat, commit it, or put it in a source file. Keep Workers Paid and paid AI credits disabled.

### Deploy

1. Open the repository's **Actions** tab.
2. Select **Build Rmango Cloud Backend**.
3. Select branch `fix/synap-ai-provider` (or the reviewed deployment branch).
4. Leave the confirmation at `no` unless you are deliberately deploying. Select `yes` only when ready.
5. Run the workflow and read the deployment URL in the logs or Cloudflare Workers & Pages.

The workflow installs dependencies, checks the Cloudflare credentials, builds the OpenNext Worker, and deploys the Worker named `rmango-cloud`. It does not edit the desktop app's production API URL.

### Configure Supabase runtime secrets

After the first Worker deploy, open **Workers & Pages → rmango-cloud → Settings → Variables and Secrets** and add these as encrypted secrets using the existing Supabase project values:

| Secret | Purpose |
|---|---|
| `SUPABASE_URL` | Existing Supabase project URL |
| `SUPABASE_PUBLISHABLE_KEY` | Supabase public/publishable key |
| `SUPABASE_SECRET_KEY` | Server-only Supabase secret API key |

Keep `SUPABASE_SECRET_KEY` server-side. Do not add it to the desktop app, GitHub variables, or source control. The optional legacy `SUPABASE_SERVICE_ROLE_KEY` is supported as a fallback if already used.

After setting secrets, deploy the same branch again using the manual workflow. Open `https://<your-worker-url>/api/health`; it should report `status: "ready"` and `aiReady: true` once the database and existing RMango usage policy are ready.

Then verify authenticated chat, at least one multi-step tool call, project file storage, the Studio connector round-trip, and ZIP export. **Do not change `app/cloud-config.json` or remove the old Vercel deployment before those checks pass.**

Only after verification, update `app/cloud-config.json` to the exact Cloudflare Worker URL and build/publish a new Windows installer. Existing installed clients continue using their currently packaged URL until updated.

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

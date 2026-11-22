# RMango Cloud AI Operations

The Windows desktop is a thin client. Authentication, model selection, inference, project APIs, Studio orchestration and usage accounting run through RMango Cloud.

## Production endpoint

Packaged desktop builds use only:

`https://rmango.abdosony222.workers.dev`

The endpoint is committed in `app/cloud-config.json`. Packaged builds ignore the legacy `RMANGO_CLOUD_API_URL` environment override, so an old machine-level Vercel URL cannot redirect production traffic.

## Cloudflare Worker configuration

The production Worker is named `rmango` and must have:

- The Workers AI binding named `AI`.
- Runtime secrets `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SECRET_KEY`.
- `SUPABASE_URL=https://jqkcrtnbxewyqrdpnqap.supabase.co`.

Keep the Supabase secret key in Cloudflare Worker secrets only. Never put it in desktop files, renderer code, Git, screenshots or chat messages.

**RMango does not use Vercel AI Gateway.** The cloud chat route uses the Cloudflare Workers AI binding. No Vercel project, Vercel environment variable, AI Gateway card setup or external model-provider API key is required for inference.

## Health and spend controls

Check:

`https://rmango.abdosony222.workers.dev/api/health`

A healthy result must confirm the Cloudflare AI binding, Supabase configuration, database reachability and enabled inference policy. The production deployment's CI smoke test checks these fields after deployment.

The global Supabase `public.usage_policies` row is the final RMango-side inference gate. Its current verified configuration is enabled with a USD $0.10 daily spend limit and USD $1.00 monthly spend limit. Do not increase these limits without administrator approval. Cloudflare Workers AI usage is also subject to the Cloudflare account's applicable limits and billing.

Per-user request/token quotas are enforced before inference. They do not replace account-level spend controls.

## Desktop validation

The desktop CI checks:

- Saved cloud-session validation.
- Built-in Roblox Studio MCP executable-path discovery.
- Renderer and Electron TypeScript checks.
- Renderer and Electron production builds.
- Windows NSIS installer creation.

The Cloudflare CI checks:

- Cloud backend TypeScript.
- Authentication URL and refresh-input tests.
- Project source-search tests.
- Studio connector heartbeat and approval timing tests.
- OpenNext/Cloudflare build.
- Production deployment and live health smoke test.

A production health check is an infrastructure test, not a substitute for a real authenticated desktop sign-in, streamed AI response, private project upload/download, or a live Roblox Studio connection. Those user-session flows must be tested with an authorized account and an open Studio instance.

## Release behavior

Pushes to `main` create a versioned Windows setup artifact for testing. They do not automatically publish a stable GitHub Release or update feed. Public stable releases require explicit release intent and a valid trusted Windows signing certificate; the workflow verifies the setup EXE and `latest.yml` before publishing.

Unsigned CI artifacts can be downloaded for testing but may show a Windows unknown-publisher warning.
import { NextResponse } from "next/server";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createAdminClient } from "@/lib/supabase";
import { publicApiStatus } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(_request: Request) {
  const { env } = await getCloudflareContext({ async: true });
  const configuration = publicApiStatus(Boolean(env.AI));

  let databaseReachable = false;
  let inferenceEnabled = false;
  if (configuration.databaseConfigured) {
    try {
      // Read the global policy using the server-only key. The policy is the
      // final spend gate; report it separately from infrastructure readiness.
      const { data: policy, error } = await createAdminClient()
        .from("usage_policies")
        .select("id,enabled,daily_spend_limit_usd,monthly_spend_limit_usd")
        .eq("id", true)
        .maybeSingle();
      if (error) {
        // Log only a bounded PostgREST diagnostic. Never include request headers,
        // API keys, credentials, or full request URLs in public health output.
        const diagnosticError = error as typeof error & { status?: number };
        const diagnostic = {
          code: error.code || "unknown",
          name: error.name || "PostgrestError",
          status: Number.isInteger(diagnosticError.status) ? diagnosticError.status : null,
          message: String(error.message || "No PostgREST error message.")
            .replace(/[\r\n\t]+/g, " ")
            .slice(0, 240),
        };
        console.error("[rmango-health] Supabase usage-policy query failed " + JSON.stringify(diagnostic));
      }
      databaseReachable = !error && Boolean(policy);
      inferenceEnabled = Boolean(
        policy?.enabled &&
        Number(policy.daily_spend_limit_usd) > 0 &&
        Number(policy.monthly_spend_limit_usd) > 0
      );
    } catch (cause) {
      const name = cause instanceof Error ? cause.name : "UnknownError";
      console.error(`[rmango-health] Supabase usage-policy connection failed name=${name}`);
      databaseReachable = false;
      inferenceEnabled = false;
    }
  }

  const infrastructureReady = configuration.aiBindingConfigured &&
    configuration.databaseConfigured &&
    databaseReachable;
  const aiReady = infrastructureReady && inferenceEnabled;

  let error: string | undefined;
  if (!configuration.aiBindingConfigured) {
    error = "Cloudflare Workers AI binding is missing.";
  } else if (!configuration.databaseConfigured) {
    error = "Supabase configuration is incomplete. The cloud needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and a server-only SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).";
  } else if (!databaseReachable) {
    error = "Rmango could not read the Supabase usage policy. Check the server key, database connection, and applied migration.";
  } else if (!inferenceEnabled) {
    error = "The cloud backend is online, but AI inference is disabled because the global usage policy is off or its spend limits are zero. An administrator must explicitly authorize a budget before inference can start.";
  }

  return NextResponse.json({
    service: "rmango-cloud",
    status: infrastructureReady ? "ready" : "configuration_required",
    aiReady,
    ...configuration,
    databaseReachable,
    inferenceEnabled,
    error,
  }, { status: infrastructureReady ? 200 : 503 });
}

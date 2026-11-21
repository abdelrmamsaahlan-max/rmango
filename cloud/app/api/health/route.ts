import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { publicApiStatus } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  // Vercel can provide the deployment OIDC token per request rather than as
  // a process-wide environment snapshot. Never return or log the token itself.
  const configuration = publicApiStatus(Boolean(request.headers.get("x-vercel-oidc-token")));

  let databaseReachable = false;
  let inferenceEnabled = false;
  if (configuration.databaseConfigured) {
    try {
      // Read the global policy using the server-only key. The policy is the
      // final spend gate; health must not advertise AI readiness while disabled.
      const { data: policy, error } = await createAdminClient()
        .from("usage_policies")
        .select("id,enabled,daily_spend_limit_usd,monthly_spend_limit_usd")
        .eq("id", true)
        .maybeSingle();
      databaseReachable = !error && Boolean(policy);
      inferenceEnabled = Boolean(
        policy?.enabled &&
        Number(policy.daily_spend_limit_usd) > 0 &&
        Number(policy.monthly_spend_limit_usd) > 0
      );
    } catch {
      databaseReachable = false;
      inferenceEnabled = false;
    }
  }

  const ready = configuration.gatewayConfigured &&
    configuration.databaseConfigured &&
    databaseReachable &&
    inferenceEnabled;

  let error: string | undefined;
  if (!configuration.gatewayConfigured) {
    error = "Vercel AI Gateway deployment identity is missing.";
  } else if (!configuration.databaseConfigured) {
    error = "Supabase configuration is incomplete. The cloud needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and a server-only SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).";
  } else if (!databaseReachable) {
    error = "Rmango could not read the Supabase usage policy. Check the server key, database connection, and applied migration.";
  } else if (!inferenceEnabled) {
    error = "Cloud AI is safely disabled because the global usage policy is disabled or its spend limits are zero. An administrator must explicitly authorize a budget before inference can start.";
  }

  return NextResponse.json({
    service: "rmango-cloud",
    status: ready ? "ready" : "configuration_required",
    ...configuration,
    databaseReachable,
    inferenceEnabled,
    error,
  }, { status: ready ? 200 : 503 });
}

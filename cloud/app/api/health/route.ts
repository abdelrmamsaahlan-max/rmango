import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { publicApiStatus } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const configuration = publicApiStatus();

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

  const infrastructureReady = configuration.providerConfigured &&
    configuration.databaseConfigured &&
    databaseReachable;
  const aiReady = infrastructureReady && inferenceEnabled;

  let error: string | undefined;
  if (!configuration.providerConfigured) {
    error = "Synap is not configured. Add SYNAP_API_KEY as a server-only environment variable in the RMango Cloud deployment.";
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

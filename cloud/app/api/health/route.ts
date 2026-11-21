import { NextResponse } from "next/server";
import { createAdminClient } from "@/lib/supabase";
import { publicApiStatus } from "@/lib/env";
import { isWorkersAiConfigured } from "@/lib/ai/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const configuration = publicApiStatus();
  const aiBindingConfigured = isWorkersAiConfigured();

  let databaseReachable = false;
  let inferenceEnabled = false;
  if (configuration.databaseConfigured) {
    try {
      // Read the global policy using the server-only key. The policy is the
      // final RMango-side spend guard; Cloudflare enforces the Workers AI free allowance.
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

  const infrastructureReady = aiBindingConfigured &&
    configuration.databaseConfigured &&
    databaseReachable;
  const aiReady = infrastructureReady && inferenceEnabled;

  let error: string | undefined;
  if (!aiBindingConfigured) {
    error = "Cloudflare Workers AI is not available. Deploy this backend to Cloudflare Workers and enable the AI binding.";
  } else if (!configuration.databaseConfigured) {
    error = "Supabase configuration is incomplete. The cloud needs SUPABASE_URL, SUPABASE_PUBLISHABLE_KEY, and a server-only SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY).";
  } else if (!databaseReachable) {
    error = "Rmango could not read the Supabase usage policy. Check the server key, database connection, and applied migration.";
  } else if (!inferenceEnabled) {
    error = "The cloud backend is online, but the RMango-side usage policy is disabled or its spend limits are zero. An administrator must enable the policy before inference can start.";
  }

  return NextResponse.json({
    service: "rmango-cloud",
    status: infrastructureReady ? "ready" : "configuration_required",
    aiReady,
    ...configuration,
    aiBindingConfigured,
    databaseReachable,
    inferenceEnabled,
    provider: "cloudflare-workers-ai",
    model: "@cf/zai-org/glm-4.7-flash",
    error,
  }, { status: infrastructureReady ? 200 : 503 });
}

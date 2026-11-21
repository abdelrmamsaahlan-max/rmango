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
  if (configuration.databaseConfigured) {
    try {
      // The initial RMango migration creates usage_policies. This read-only
      // query validates the configured key, network and expected schema.
      const { error } = await createAdminClient()
        .from("usage_policies")
        .select("id")
        .limit(1);
      databaseReachable = !error;
    } catch {
      databaseReachable = false;
    }
  }

  const ready = configuration.gatewayConfigured && configuration.databaseConfigured && databaseReachable;
  return NextResponse.json({
    service: "rmango-cloud",
    status: ready ? "ready" : "configuration_required",
    ...configuration,
    databaseReachable,
  }, { status: ready ? 200 : 503 });
}

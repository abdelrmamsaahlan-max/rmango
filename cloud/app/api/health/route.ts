import { NextResponse } from "next/server";
import { publicApiStatus } from "@/lib/env";

export const runtime = "nodejs";

export async function GET(request: Request) {
  // Vercel can provide the deployment OIDC token per request rather than as
  // a process-wide environment snapshot. Never return or log the token itself.
  const status = publicApiStatus(Boolean(request.headers.get("x-vercel-oidc-token")));
  return NextResponse.json({
    service: "rmango-cloud",
    status: status.databaseConfigured && status.gatewayConfigured ? "ready" : "configuration_required",
    ...status,
  });
}

import { NextResponse } from "next/server";
import { publicApiStatus } from "@/lib/env";

export const runtime = "nodejs";

export async function GET() {
  const status = publicApiStatus();
  return NextResponse.json({
    service: "rmango-cloud",
    status: status.databaseConfigured && status.gatewayConfigured ? "ready" : "configuration_required",
    ...status,
  });
}

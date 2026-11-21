import { NextResponse } from "next/server";
import { requiredEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// Only intentionally public client configuration is returned here.
// Never include SUPABASE_SERVICE_ROLE_KEY, Vercel OIDC tokens, or model-provider secrets.
export async function GET() {
  try {
    return NextResponse.json(
      {
        supabaseUrl: requiredEnv("SUPABASE_URL").replace(/\\/+$/, ""),
        publishableKey: requiredEnv("SUPABASE_PUBLISHABLE_KEY"),
      },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
    );
  } catch {
    return NextResponse.json(
      { error: "Rmango guest access is not configured on the server yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

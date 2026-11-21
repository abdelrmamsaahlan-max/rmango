import { NextResponse } from "next/server";
import { requiredEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// This intentionally returns only public client configuration. Never return
// the Supabase service-role key, Vercel OIDC token, or model-provider secrets.
export async function GET() {
  try {
    return NextResponse.json(
      {
        supabaseUrl: new URL(requiredEnv("SUPABASE_URL")).origin,
        publishableKey: requiredEnv("SUPABASE_PUBLISHABLE_KEY"),
      },
      { headers: { "Cache-Control": "public, max-age=300, s-maxage=300" } },
    );
  } catch {
    return NextResponse.json(
      { error: "RMango guest access is not configured on the server yet." },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}

import { NextResponse } from "next/server";
import { requiredEnv } from "@/lib/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  const supabaseUrl = requiredEnv("SUPABASE_URL");
  const publishableKey = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
  let googleEnabled: boolean | null = null;

  try {
    const response = await fetch(new URL("/auth/v1/settings", supabaseUrl), {
      method: "GET",
      headers: { apikey: publishableKey },
      cache: "no-store",
      signal: AbortSignal.timeout(5_000),
    });
    if (response.ok) {
      const settings = await response.json() as { external?: { google?: unknown } };
      if (typeof settings.external?.google === "boolean") {
        googleEnabled = settings.external.google;
      }
    }
  } catch {
    // The desktop may still attempt OAuth; Supabase will return the authoritative provider error.
  }

  return NextResponse.json({
    supabaseUrl,
    publishableKey,
    providers: { google: googleEnabled },
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

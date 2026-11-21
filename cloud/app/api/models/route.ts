import { NextResponse } from "next/server";
import { getAuthErrorResponse } from "@/lib/supabase";
import { getModelProfiles } from "@/lib/ai/models";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { response } = await getAuthErrorResponse(request);
  if (response) return response;

  try {
    const catalogue = await getModelProfiles();
    return NextResponse.json({
      profiles: catalogue.profiles,
      availableModelCount: catalogue.availableModelCount,
      source: "vercel-ai-gateway-live-catalogue",
      benchmarkScores: null,
    }, {
      headers: { "Cache-Control": "private, max-age=60" },
    });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "The cloud model catalogue is unavailable.",
    }, { status: 503 });
  }
}

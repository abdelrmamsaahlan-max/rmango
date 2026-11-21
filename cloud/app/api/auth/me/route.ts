import { NextResponse } from "next/server";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;

  const user = context!.user;
  const displayName = typeof user.user_metadata?.name === "string"
    ? user.user_metadata.name.slice(0, 60)
    : "";

  return NextResponse.json({
    user: {
      id: user.id,
      email: user.email,
      displayName,
      emailVerified: Boolean(user.email_confirmed_at),
      createdAt: user.created_at,
    },
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

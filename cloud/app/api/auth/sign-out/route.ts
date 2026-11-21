import { NextResponse } from "next/server";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { error } = await context!.supabase.auth.signOut();
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true });
}

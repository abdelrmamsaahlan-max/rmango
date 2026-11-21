import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase";

export const runtime = "nodejs";

const schema = z.object({ refreshToken: z.string().min(20).max(4096) });

export async function POST(request: Request) {
  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "A valid session refresh token is required." }, { status: 400 });
  }

  const supabase = createAuthClient();
  const { data, error } = await supabase.auth.refreshSession({ refresh_token: payload.refreshToken });
  if (error || !data.session || !data.user) {
    return NextResponse.json({ error: error?.message || "Your session has expired. Sign in again." }, { status: 401 });
  }

  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
  });
}

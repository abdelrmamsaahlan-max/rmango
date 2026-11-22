import { NextResponse } from "next/server";
import { parseRefreshSessionInput } from "@/lib/auth/refresh-session-input";
import { createAuthClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The session refresh request must contain valid JSON." }, { status: 400 });
  }

  const parsed = parseRefreshSessionInput(body);
  if (!parsed.success) {
    // An invalid or truncated refresh token means the saved credentials are no
    // longer usable. Return 401 so older desktop builds also clear the session.
    return NextResponse.json({ error: "Your saved session is invalid. Sign in again." }, { status: 401 });
  }
  const payload = parsed.data;

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

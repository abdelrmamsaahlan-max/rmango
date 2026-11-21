import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().email().max(254),
  password: z.string().min(10).max(128),
  displayName: z.string().trim().min(1).max(60).optional(),
});

export async function POST(request: Request) {
  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter a valid email and a password with at least 10 characters." }, { status: 400 });
  }

  const supabase = createAuthClient();
  const { data, error } = await supabase.auth.signUp({
    email: payload.email,
    password: payload.password,
    options: { data: { name: payload.displayName || payload.email.split("@")[0] } },
  });
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json({
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
    session: data.session ? {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    } : null,
    requiresEmailConfirmation: !data.session,
  }, { status: 201 });
}

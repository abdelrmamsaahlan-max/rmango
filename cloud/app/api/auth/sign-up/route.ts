import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
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
    options: {
      data: { name: payload.displayName || payload.email.split("@")[0] },
      emailRedirectTo: new URL("/auth/confirmed", request.url).toString(),
    },
  });
  if (error) {
    const status = (error as { status?: number }).status;
    const message = status === 429
      ? "Too many account attempts. Please wait a little before trying again."
      : "We could not create your account with those details. Check the information and try again.";
    return NextResponse.json(
      { error: message },
      { status: status === 429 ? 429 : 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  return NextResponse.json({
    user: data.user ? { id: data.user.id, email: data.user.email } : null,
    session: data.session ? {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    } : null,
    requiresEmailConfirmation: !data.session,
  }, {
    status: 201,
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  password: z.string().min(1).max(128),
});

export async function POST(request: Request) {
  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter your account email and password." }, { status: 400 });
  }

  const supabase = createAuthClient();
  const { data, error } = await supabase.auth.signInWithPassword({
    email: payload.email.toLowerCase(),
    password: payload.password,
  });
  if (error || !data.session || !data.user) {
    const authCode = (error as { code?: string } | null)?.code;
    const message = authCode === "invalid_credentials"
      ? "Email or password was not accepted. Check the email address and try again. If you already created your account and cannot remember the password, use Forgot password to receive a recovery link."
      : authCode === "email_not_confirmed"
        ? "Confirm your Rmango email address before signing in. Check your inbox and spam folder for the confirmation email."
        : "We could not sign you in right now. Please try again in a moment.";
    return NextResponse.json(
      { error: message },
      { status: 401, headers: { "Cache-Control": "no-store, max-age=0" } },
    );
  }

  return NextResponse.json({
    user: { id: data.user.id, email: data.user.email },
    session: {
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    },
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

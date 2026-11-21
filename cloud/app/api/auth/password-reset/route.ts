import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

export async function POST(request: Request) {
  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Enter the email address for your Rmango account." }, { status: 400 });
  }

  try {
    const supabase = createAuthClient();
    const redirectTo = new URL("/auth/reset-password", request.url).toString();
    const { error } = await supabase.auth.resetPasswordForEmail(payload.email, { redirectTo });

    if (error) {
      return NextResponse.json({
        error: "Rmango could not send a recovery email. Check the cloud Auth configuration and try again.",
      }, { status: 503 });
    }

    // Supabase deliberately returns success for unknown email addresses to avoid
    // exposing whether an account exists. Keep the desktop response generic too.
    return NextResponse.json({
      ok: true,
      message: "If an account exists for that address, a password recovery email has been sent.",
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({
      error: "The Rmango password recovery service is unavailable. Please try again later.",
    }, { status: 503 });
  }
}

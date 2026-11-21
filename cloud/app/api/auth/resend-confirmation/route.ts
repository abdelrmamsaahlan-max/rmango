import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient } from "@/lib/supabase";

export const runtime = "nodejs";

const schema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
});

function genericResponse() {
  return NextResponse.json({
    ok: true,
    message: "If this address has an account awaiting verification, a new confirmation email has been sent. Check your inbox and spam folder.",
  }, {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}

export async function POST(request: Request) {
  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json(
      { error: "Enter the email address used for your Rmango account." },
      { status: 400, headers: { "Cache-Control": "no-store" } },
    );
  }

  try {
    const supabase = createAuthClient();
    const emailRedirectTo = new URL("/auth/confirmed", request.url).toString();
    const { error } = await supabase.auth.resend({
      type: "signup",
      email: payload.email,
      options: { emailRedirectTo },
    });

    // Do not reveal whether an address exists or is already confirmed.
    // Supabase enforces its configured resend/rate limits.
    if (error) {
      const status = (error as { status?: number }).status;
      if (status === 429) {
        return NextResponse.json({
          error: "Please wait a little before requesting another confirmation email.",
        }, {
          status: 429,
          headers: { "Cache-Control": "no-store" },
        });
      }
      return genericResponse();
    }

    return genericResponse();
  } catch {
    return NextResponse.json({
      error: "The Rmango email verification service is temporarily unavailable. Please try again later.",
    }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

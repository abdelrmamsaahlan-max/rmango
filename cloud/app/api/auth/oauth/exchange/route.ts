import { NextResponse } from "next/server";
import { z } from "zod";
import { createAuthClient, getSupabasePublicConfig } from "@/lib/supabase";
import { isValidOAuthCodeVerifier } from "@/lib/auth/oauth";

export const runtime = "nodejs";

const schema = z.object({
  code: z.string().trim().min(1).max(2048),
  codeVerifier: z.string().refine(isValidOAuthCodeVerifier),
});

export async function POST(request: Request) {
  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "The sign-in response was incomplete or expired. Start again." }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const config = getSupabasePublicConfig();
    const tokenUrl = new URL("/auth/v1/token?grant_type=pkce", config.url);
    const tokenResponse = await fetch(tokenUrl, {
      method: "POST",
      headers: {
        apikey: config.publishableKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        auth_code: payload.code,
        code_verifier: payload.codeVerifier,
      }),
      cache: "no-store",
    });

    const tokenPayload = await tokenResponse.json().catch(() => ({})) as {
      access_token?: unknown;
      refresh_token?: unknown;
      expires_at?: unknown;
      expires_in?: unknown;
    };

    if (!tokenResponse.ok ||
        typeof tokenPayload.access_token !== "string" ||
        typeof tokenPayload.refresh_token !== "string") {
      return NextResponse.json({ error: "Google or Roblox did not complete sign-in. Check provider setup and try again." }, {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const accessToken = tokenPayload.access_token;
    const refreshToken = tokenPayload.refresh_token;
    const { data, error } = await createAuthClient(accessToken).auth.getUser(accessToken);
    if (error || !data.user) {
      return NextResponse.json({ error: "The returned account could not be verified. Please sign in again." }, {
        status: 401,
        headers: { "Cache-Control": "no-store" },
      });
    }

    const expiresAt = typeof tokenPayload.expires_at === "number"
      ? tokenPayload.expires_at
      : typeof tokenPayload.expires_in === "number"
        ? Math.floor(Date.now() / 1000) + tokenPayload.expires_in
        : undefined;

    return NextResponse.json({
      user: {
        id: data.user.id,
        email: data.user.email,
      },
      session: {
        accessToken,
        refreshToken,
        expiresAt,
      },
    }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Rmango could not verify the social sign-in response. Please try again." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

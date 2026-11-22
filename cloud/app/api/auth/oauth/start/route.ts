import { NextResponse } from "next/server";
import { z } from "zod";
import { getSupabasePublicConfig } from "@/lib/supabase";
import {
  createSupabaseOAuthAuthorizeUrl,
  isRmangoOAuthProvider,
  isValidOAuthCodeChallenge,
} from "@/lib/auth/oauth";

export const runtime = "nodejs";

const schema = z.object({
  provider: z.string().refine(isRmangoOAuthProvider),
  codeChallenge: z.string().refine(isValidOAuthCodeChallenge),
});

export async function POST(request: Request) {
  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Choose a supported sign-in provider and retry." }, {
      status: 400,
      headers: { "Cache-Control": "no-store" },
    });
  }

  try {
    const config = getSupabasePublicConfig();
    const authorizeUrl = createSupabaseOAuthAuthorizeUrl(config.url, payload.provider, payload.codeChallenge);
    return NextResponse.json({ authorizeUrl }, {
      headers: { "Cache-Control": "no-store" },
    });
  } catch {
    return NextResponse.json({ error: "Social sign-in is not configured on the Rmango cloud service yet." }, {
      status: 503,
      headers: { "Cache-Control": "no-store" },
    });
  }
}

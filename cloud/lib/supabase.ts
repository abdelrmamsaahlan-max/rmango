import "server-only";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { requiredEnv } from "@/lib/env";

export type AuthContext = {
  supabase: SupabaseClient;
  user: User;
};

export function createAuthClient(accessToken?: string) {
  const url = requiredEnv("SUPABASE_URL");
  const key = requiredEnv("SUPABASE_PUBLISHABLE_KEY");
  return createClient(url, key, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    global: accessToken
      ? { headers: { Authorization: "Bearer " + accessToken } }
      : undefined,
  });
}

export async function getAuthContext(request: Request): Promise<AuthContext> {
  const authorization = request.headers.get("authorization") || "";
  const match = authorization.match(/^Bearer\s+(.+)$/i);
  if (!match) throw new Error("Sign in to your Rmango account first.");

  const token = match[1];
  const supabase = createAuthClient(token);
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) throw new Error("Your Rmango session is invalid or has expired. Sign in again.");

  return { supabase, user: data.user };
}

export async function getAuthErrorResponse(request: Request) {
  try {
    return { context: await getAuthContext(request), response: null };
  } catch (error) {
    return {
      context: null,
      response: Response.json(
        { error: error instanceof Error ? error.message : "Authentication failed." },
        { status: 401 },
      ),
    };
  }
}

import "server-only";
import { getCloudflareContext } from "@opennextjs/cloudflare";
import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";
import { getSupabaseServerKey, type SupabaseRuntimeEnv } from "@/lib/env";
import { selectSupabaseRuntimeEnv, validateSupabaseProjectUrl } from "@/lib/supabase-runtime-env";

/**
 * Resolve secrets from the actual Cloudflare request context. OpenNext's
 * Node.js route runtime exposes the request bindings asynchronously; a
 * synchronous lookup can throw and accidentally fall back to stale build
 * variables. Production must fail closed if Worker bindings are unavailable.
 */
async function getRuntimeSupabaseEnv(): Promise<SupabaseRuntimeEnv> {
  let workerEnv: SupabaseRuntimeEnv | undefined;
  try {
    const context = await getCloudflareContext({ async: true });
    workerEnv = context.env as SupabaseRuntimeEnv;
  } catch {
    // Local Next.js development has no Worker context. Production does not
    // silently fall back to process.env because that can point at another host.
  }
  return selectSupabaseRuntimeEnv(workerEnv, process.env, process.env.NODE_ENV === "production");
}

function requiredRuntimeEnv(name: keyof SupabaseRuntimeEnv, env: SupabaseRuntimeEnv): string {
  const value = env[name]?.trim();
  if (!value) {
    throw new Error("Cloud backend is not configured: missing " + name + ".");
  }
  return value;
}

/**
 * Supabase's newer sb_secret_* keys are opaque API keys, not JWTs. supabase-js
 * normally sends its configured key in both apikey and Authorization: Bearer.
 * Supabase requires new publishable/secret keys on apikey only, so remove the
 * automatically-added Bearer header for server-side secret-key requests.
 */
const fetchWithSecretKeyAuth: typeof fetch = async (input, init) => {
  const headers = new Headers(input instanceof Request ? input.headers : undefined);
  new Headers(init?.headers).forEach((value, name) => headers.set(name, value));
  headers.delete("authorization");
  return fetch(input, { ...init, headers });
};

export type AuthContext = {
  supabase: SupabaseClient;
  user: User;
};

export async function createAdminClient(): Promise<SupabaseClient> {
  const runtimeEnv = await getRuntimeSupabaseEnv();
  const serverKey = getSupabaseServerKey(runtimeEnv);
  if (!serverKey) {
    throw new Error(
      "Cloud backend is not configured: add the server-only SUPABASE_SECRET_KEY (or legacy SUPABASE_SERVICE_ROLE_KEY) to the cloud environment.",
    );
  }

  return createClient(validateSupabaseProjectUrl(requiredRuntimeEnv("SUPABASE_URL", runtimeEnv)), serverKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
      detectSessionInUrl: false,
    },
    // Legacy service_role keys are JWTs and keep the SDK's default Bearer
    // behavior. New sb_secret_* keys are sent only through the apikey header.
    ...(serverKey.startsWith("sb_secret_")
      ? { global: { fetch: fetchWithSecretKeyAuth } }
      : {}),
  });
}

export async function getSupabasePublicConfig() {
  const runtimeEnv = await getRuntimeSupabaseEnv();
  return {
    url: validateSupabaseProjectUrl(requiredRuntimeEnv("SUPABASE_URL", runtimeEnv)),
    publishableKey: requiredRuntimeEnv("SUPABASE_PUBLISHABLE_KEY", runtimeEnv),
  };
}

export async function createAuthClient(accessToken?: string): Promise<SupabaseClient> {
  const runtimeEnv = await getRuntimeSupabaseEnv();
  const url = validateSupabaseProjectUrl(requiredRuntimeEnv("SUPABASE_URL", runtimeEnv));
  const key = requiredRuntimeEnv("SUPABASE_PUBLISHABLE_KEY", runtimeEnv);
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
  const supabase = await createAuthClient(token);
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

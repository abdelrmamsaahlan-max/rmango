export type SupabaseRuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

/**
 * Use Cloudflare Worker bindings when they exist. Only local development may
 * fall back to process.env; production must never inherit unrelated build vars.
 */
export function selectSupabaseRuntimeEnv<T extends object>(
  workerEnv: T | null | undefined,
  fallbackEnv: T,
  isProduction: boolean,
): T {
  if (workerEnv) return workerEnv;
  if (isProduction) {
    throw new Error("Cloudflare runtime bindings are unavailable. Refusing to use process.env for Supabase configuration.");
  }
  return fallbackEnv;
}

/** Accept only HTTPS Supabase project origins, never a Worker or legacy Vercel URL. */
export function validateSupabaseProjectUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("SUPABASE_URL must be a valid HTTPS Supabase project URL.");
  }

  if (
    parsed.protocol !== "https:" ||
    parsed.username ||
    parsed.password ||
    parsed.search ||
    parsed.hash ||
    parsed.pathname !== "/" ||
    !/^[a-z0-9-]+\.supabase\.co$/i.test(parsed.hostname)
  ) {
    throw new Error("SUPABASE_URL must be the HTTPS origin of a Supabase project, not an app or Worker URL.");
  }

  return parsed.origin;
}

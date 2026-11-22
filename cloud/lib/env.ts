export type SupabaseRuntimeEnv = {
  SUPABASE_URL?: string;
  SUPABASE_PUBLISHABLE_KEY?: string;
  SUPABASE_SECRET_KEY?: string;
  SUPABASE_SERVICE_ROLE_KEY?: string;
};

export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Cloud backend is not configured: missing " + name + ".");
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getSupabaseServerKey(runtimeEnv?: SupabaseRuntimeEnv): string | undefined {
  // Supabase recommends the newer sb_secret_ key for server-side access.
  // Keep the legacy service_role variable as a migration fallback.
  const source = runtimeEnv ?? process.env;
  return source.SUPABASE_SECRET_KEY?.trim() ||
    source.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    undefined;
}

export function publicApiStatus(
  aiBindingAvailable = false,
  runtimeEnv?: SupabaseRuntimeEnv,
) {
  // Prefer the request's Cloudflare bindings. Falling back to process.env is
  // reserved for local/test environments where no Worker context exists.
  const source = runtimeEnv ?? process.env;
  const supabaseUrlConfigured = Boolean(source.SUPABASE_URL?.trim());
  const publishableKeyConfigured = Boolean(source.SUPABASE_PUBLISHABLE_KEY?.trim());
  const serverKeyConfigured = Boolean(getSupabaseServerKey(runtimeEnv));

  return {
    deployment: "cloudflare-workers",
    aiBindingConfigured: aiBindingAvailable,
    supabaseUrlConfigured,
    publishableKeyConfigured,
    serverKeyConfigured,
    databaseConfigured: supabaseUrlConfigured && publishableKeyConfigured && serverKeyConfigured,
  };
}

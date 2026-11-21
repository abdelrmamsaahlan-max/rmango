export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Cloud backend is not configured: missing " + name + ".");
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function getSupabaseServerKey(): string | undefined {
  // Supabase recommends the newer sb_secret_ key for server-side access.
  // Keep the legacy service_role variable as a migration fallback.
  return optionalEnv("SUPABASE_SECRET_KEY") || optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
}

export function publicApiStatus() {
  const supabaseUrlConfigured = Boolean(optionalEnv("SUPABASE_URL"));
  const publishableKeyConfigured = Boolean(optionalEnv("SUPABASE_PUBLISHABLE_KEY"));
  const serverKeyConfigured = Boolean(getSupabaseServerKey());

  return {
    deployment: "cloudflare-workers",
    supabaseUrlConfigured,
    publishableKeyConfigured,
    serverKeyConfigured,
    databaseConfigured: supabaseUrlConfigured && publishableKeyConfigured && serverKeyConfigured,
  };
}

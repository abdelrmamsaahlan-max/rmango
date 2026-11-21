export function requiredEnv(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error("Cloud backend is not configured: missing " + name + ".");
  return value;
}

export function optionalEnv(name: string): string | undefined {
  const value = process.env[name]?.trim();
  return value || undefined;
}

export function publicApiStatus(requestOidcAvailable = false) {
  return {
    deployment: process.env.VERCEL_ENV || "self-hosted",
    gatewayConfigured: Boolean(process.env.VERCEL_OIDC_TOKEN) || requestOidcAvailable,
    databaseConfigured: Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_PUBLISHABLE_KEY && process.env.SUPABASE_SERVICE_ROLE_KEY),
  };
}

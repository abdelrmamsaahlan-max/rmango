export function getPasswordRecoveryRedirect(configuredPublicUrl?: string): string {
  const candidate = configuredPublicUrl?.trim() || "https://rmango.abdosony222.workers.dev";
  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new Error("RMANGO_PUBLIC_URL must be a valid absolute URL.");
  }

  const isLocalDevelopment = parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1";
  if ((parsed.protocol !== "https:" && !(isLocalDevelopment && parsed.protocol === "http:")) ||
      parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("RMANGO_PUBLIC_URL must be an HTTPS origin (HTTP is permitted only for localhost development).");
  }

  return new URL("/auth/reset-password", parsed.origin).toString();
}

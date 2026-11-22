export type RmangoOAuthProvider = "google" | "custom:roblox";

export const RMANGO_OAUTH_CALLBACK_URL = "rmango://auth/callback";

const PKCE_CHALLENGE_PATTERN = /^[A-Za-z0-9_-]{43}$/;

export function isRmangoOAuthProvider(value: unknown): value is RmangoOAuthProvider {
  return value === "google" || value === "custom:roblox";
}

export function isValidOAuthCodeChallenge(value: unknown): value is string {
  return typeof value === "string" && PKCE_CHALLENGE_PATTERN.test(value);
}

export function isValidOAuthCodeVerifier(value: unknown): value is string {
  return typeof value === "string" &&
    value.length >= 43 &&
    value.length <= 128 &&
    /^[A-Za-z0-9._~-]+$/.test(value);
}

export function createSupabaseOAuthAuthorizeUrl(
  supabaseUrl: string,
  provider: RmangoOAuthProvider,
  codeChallenge: string,
): string {
  if (!isRmangoOAuthProvider(provider)) throw new Error("Unsupported sign-in provider.");
  if (!isValidOAuthCodeChallenge(codeChallenge)) throw new Error("Invalid OAuth security challenge.");

  const base = new URL(supabaseUrl);
  if (base.protocol !== "https:" || base.username || base.password) {
    throw new Error("The Supabase authentication endpoint must use HTTPS.");
  }

  const authorizeUrl = new URL("/auth/v1/authorize", base);
  authorizeUrl.searchParams.set("provider", provider);
  authorizeUrl.searchParams.set("redirect_to", RMANGO_OAUTH_CALLBACK_URL);
  authorizeUrl.searchParams.set("code_challenge", codeChallenge);
  authorizeUrl.searchParams.set("code_challenge_method", "s256");
  return authorizeUrl.toString();
}

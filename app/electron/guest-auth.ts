export type GuestSession = {
  accessToken: string;
  refreshToken: string;
  expiresAt: number;
  user: { id: string; isAnonymous: true };
};

type UnknownRecord = Record<string, unknown>;

function asRecord(value: unknown): UnknownRecord | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as UnknownRecord
    : null;
}

export function publicSupabaseOrigin(value: unknown): string {
  if (typeof value !== "string" || value.length > 2_048) {
    throw new Error("The RMango service returned an invalid guest-auth endpoint.");
  }

  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("The RMango service returned an invalid guest-auth endpoint.");
  }

  if (
    url.protocol !== "https:" ||
    !url.hostname ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== "/" ||
    ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname.toLowerCase()) ||
    url.hostname.toLowerCase().endsWith(".localhost")
  ) {
    throw new Error("The RMango guest service must use a public HTTPS Supabase origin.");
  }

  return url.origin;
}

export function parseAnonymousGuestSession(payload: unknown, nowMs = Date.now()): GuestSession {
  const root = asRecord(payload);
  const user = asRecord(root?.user);
  const accessToken = root?.access_token;
  const refreshToken = root?.refresh_token;
  const userId = user?.id;

  if (
    typeof accessToken !== "string" || accessToken.length < 20 || accessToken.length > 8_192 ||
    typeof refreshToken !== "string" || refreshToken.length < 20 || refreshToken.length > 8_192 ||
    typeof userId !== "string" || userId.length < 8 || userId.length > 128
  ) {
    throw new Error("Supabase did not return a complete guest session.");
  }
  if (user?.is_anonymous !== true) {
    throw new Error("Supabase did not create an anonymous guest identity. Enable Anonymous Sign-Ins for RMango.");
  }

  const expiresAt = root?.expires_at;
  const expiresIn = root?.expires_in;
  const absoluteExpiry = typeof expiresAt === "number" && Number.isFinite(expiresAt) && expiresAt > 0
    ? Math.floor(expiresAt)
    : Math.floor(nowMs / 1_000) + (
      typeof expiresIn === "number" && Number.isFinite(expiresIn) && expiresIn > 0
        ? Math.floor(expiresIn)
        : 3_600
    );

  return {
    accessToken,
    refreshToken,
    expiresAt: absoluteExpiry,
    user: { id: userId, isAnonymous: true },
  };
}

export function isInvalidGuestRefreshError(message: string): boolean {
  const value = String(message || "");
  return /invalid refresh token|refresh token.*(?:not found|expired|invalid|already used)|already used.*refresh token|session (?:has )?expired/i.test(value);
}

export function describeGuestAuthFailure(status: number, payload: unknown): string {
  const record = asRecord(payload);
  const detail = [record?.msg, record?.message, record?.error_description, record?.error]
    .find(value => typeof value === "string" && value.trim()) as string | undefined;

  if (status === 429) return "RMango guest sign-ins are temporarily rate-limited. Please try again later.";
  if (detail) return detail.slice(0, 400);
  return "Could not create your RMango guest workspace. Check the service configuration and try again.";
}

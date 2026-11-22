type CloudSessionRecord = {
  accessToken: string;
  refreshToken: string;
  user: { id: string };
  expiresAt?: number | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isUsableToken(value: unknown): value is string {
  return typeof value === "string"
    && value.length >= 20
    && value.length <= 4096
    && value.trim() === value;
}

/**
 * Reject damaged or legacy session files before they can be reported as signed in.
 * Supabase refresh tokens are opaque strings; only validate their shape here and
 * let Supabase itself verify their authenticity.
 */
export function isValidStoredCloudSession(value: unknown): value is CloudSessionRecord {
  if (!isRecord(value) || !isRecord(value.user)) return false;
  if (!isUsableToken(value.accessToken) || !isUsableToken(value.refreshToken)) return false;
  if (typeof value.user.id !== "string" || value.user.id.trim().length === 0) return false;
  if (value.expiresAt !== undefined && value.expiresAt !== null
    && (typeof value.expiresAt !== "number" || !Number.isFinite(value.expiresAt) || value.expiresAt <= 0)) {
    return false;
  }
  return true;
}

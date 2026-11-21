import test from "node:test";
import assert from "node:assert/strict";
import {
  describeGuestAuthFailure,
  isInvalidGuestRefreshError,
  parseAnonymousGuestSession,
  publicSupabaseOrigin,
} from "./guest-auth.ts";

test("accepts only a public HTTPS Supabase origin", () => {
  assert.equal(publicSupabaseOrigin("https://example.supabase.co/"), "https://example.supabase.co");
  for (const input of [
    "http://example.supabase.co",
    "https://user:pass@example.supabase.co",
    "https://example.supabase.co/auth/v1",
    "https://localhost",
    "https://example.supabase.co?secret=value",
  ]) {
    assert.throws(() => publicSupabaseOrigin(input));
  }
});

test("parses a complete anonymous session and normalizes its expiry", () => {
  const session = parseAnonymousGuestSession({
    access_token: "a".repeat(40),
    refresh_token: "r".repeat(40),
    expires_in: 1_800,
    user: { id: "guest-user-123456", is_anonymous: true },
  }, 1_700_000_000_000);

  assert.deepEqual(session, {
    accessToken: "a".repeat(40),
    refreshToken: "r".repeat(40),
    expiresAt: 1_700_001_800,
    user: { id: "guest-user-123456", isAnonymous: true },
  });
});

test("rejects malformed or non-anonymous Auth responses", () => {
  assert.throws(() => parseAnonymousGuestSession({}), /complete guest session/i);
  assert.throws(() => parseAnonymousGuestSession({
    access_token: "a".repeat(40),
    refresh_token: "r".repeat(40),
    user: { id: "guest-user-123456", is_anonymous: false },
  }), /anonymous guest identity/i);
});

test("only resets a guest session for an explicitly invalid refresh token", () => {
  assert.equal(isInvalidGuestRefreshError("Invalid Refresh Token: Refresh Token Not Found"), true);
  assert.equal(isInvalidGuestRefreshError("Invalid Refresh Token: Already Used"), true);
  assert.equal(isInvalidGuestRefreshError("fetch failed: network timeout"), false);
  assert.equal(isInvalidGuestRefreshError("The cloud service is temporarily unavailable"), false);
});

test("rate-limit errors do not leak raw response payloads", () => {
  assert.match(describeGuestAuthFailure(429, { message: "anything" }), /rate-limited/i);
});

import assert from "node:assert/strict";
import test from "node:test";
import { parseRefreshSessionInput } from "../lib/auth/refresh-session-input.ts";

test("accepts a plausible opaque Supabase refresh token", () => {
  const result = parseRefreshSessionInput({ refreshToken: "r".repeat(48) });
  assert.equal(result.success, true);
});

test("rejects the short token shape that caused repeated desktop refresh failures", () => {
  const result = parseRefreshSessionInput({ refreshToken: "r".repeat(12) });
  assert.equal(result.success, false);
});

test("rejects missing, empty, non-string, and oversized refresh tokens", () => {
  assert.equal(parseRefreshSessionInput({}).success, false);
  assert.equal(parseRefreshSessionInput({ refreshToken: "" }).success, false);
  assert.equal(parseRefreshSessionInput({ refreshToken: 42 }).success, false);
  assert.equal(parseRefreshSessionInput({ refreshToken: "r".repeat(4097) }).success, false);
});

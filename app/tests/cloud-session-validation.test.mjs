import assert from "node:assert/strict";
import test from "node:test";
import { isValidStoredCloudSession } from "../electron/cloud-session-validation.ts";

const validSession = () => ({
  accessToken: "a".repeat(32),
  refreshToken: "r".repeat(48),
  expiresAt: 1_800_000_000,
  user: { id: "user-id" },
});

test("accepts a well-formed saved cloud session", () => {
  assert.equal(isValidStoredCloudSession(validSession()), true);
});

test("rejects the short refresh token shape observed in production requests", () => {
  const session = validSession();
  session.refreshToken = "t".repeat(12);
  assert.equal(isValidStoredCloudSession(session), false);
});

test("rejects missing tokens and missing account identity", () => {
  const noAccess = validSession();
  noAccess.accessToken = "";
  const noRefresh = validSession();
  noRefresh.refreshToken = "";
  const noUser = validSession();
  noUser.user.id = "  ";
  assert.equal(isValidStoredCloudSession(noAccess), false);
  assert.equal(isValidStoredCloudSession(noRefresh), false);
  assert.equal(isValidStoredCloudSession(noUser), false);
});

test("rejects oversized or whitespace-padded tokens", () => {
  const oversized = validSession();
  oversized.refreshToken = "r".repeat(4097);
  const padded = validSession();
  padded.refreshToken = " " + padded.refreshToken;
  assert.equal(isValidStoredCloudSession(oversized), false);
  assert.equal(isValidStoredCloudSession(padded), false);
});

test("rejects malformed expiry metadata", () => {
  const session = validSession();
  session.expiresAt = "tomorrow";
  assert.equal(isValidStoredCloudSession(session), false);
});

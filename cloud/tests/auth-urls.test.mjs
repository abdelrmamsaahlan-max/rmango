import assert from "node:assert/strict";
import test from "node:test";
import { getPasswordRecoveryRedirect } from "../lib/auth-urls.ts";

test("uses the canonical production recovery URL by default", () => {
  assert.equal(
    getPasswordRecoveryRedirect(),
    "https://rmango-cloud.vercel.app/auth/reset-password",
  );
});

test("uses the configured public origin, not an incoming request host", () => {
  assert.equal(
    getPasswordRecoveryRedirect("https://accounts.example.com/anything"),
    "https://accounts.example.com/auth/reset-password",
  );
});

test("permits localhost HTTP only for local development", () => {
  assert.equal(
    getPasswordRecoveryRedirect("http://127.0.0.1:3000"),
    "http://127.0.0.1:3000/auth/reset-password",
  );
});

test("rejects insecure non-local origins and credential-bearing URLs", () => {
  assert.throws(() => getPasswordRecoveryRedirect("http://accounts.example.com"));
  assert.throws(() => getPasswordRecoveryRedirect("https://user:pass@example.com"));
  assert.throws(() => getPasswordRecoveryRedirect("https://example.com?next=https://evil.example"));
});

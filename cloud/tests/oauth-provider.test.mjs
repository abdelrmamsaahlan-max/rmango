import test from "node:test";
import assert from "node:assert/strict";
import {
  createSupabaseOAuthAuthorizeUrl,
  isRmangoOAuthProvider,
  isValidOAuthCodeChallenge,
  isValidOAuthCodeVerifier,
  RMANGO_OAUTH_CALLBACK_URL,
} from "../lib/auth/oauth.ts";

const challenge = "a".repeat(43);

test("accepts only the configured OAuth providers", () => {
  assert.equal(isRmangoOAuthProvider("google"), true);
  assert.equal(isRmangoOAuthProvider("custom:roblox"), true);
  assert.equal(isRmangoOAuthProvider("roblox"), false);
  assert.equal(isRmangoOAuthProvider("github"), false);
});

test("validates PKCE challenge and verifier formats", () => {
  assert.equal(isValidOAuthCodeChallenge(challenge), true);
  assert.equal(isValidOAuthCodeChallenge("bad"), false);
  assert.equal(isValidOAuthCodeVerifier("b".repeat(43)), true);
  assert.equal(isValidOAuthCodeVerifier("short"), false);
  assert.equal(isValidOAuthCodeVerifier("x".repeat(129)), false);
});

test("builds a Google authorization URL with a fixed app callback and PKCE", () => {
  const url = new URL(createSupabaseOAuthAuthorizeUrl(
    "https://example.supabase.co",
    "google",
    challenge,
  ));
  assert.equal(url.origin, "https://example.supabase.co");
  assert.equal(url.pathname, "/auth/v1/authorize");
  assert.equal(url.searchParams.get("provider"), "google");
  assert.equal(url.searchParams.get("redirect_to"), RMANGO_OAUTH_CALLBACK_URL);
  assert.equal(url.searchParams.get("code_challenge"), challenge);
  assert.equal(url.searchParams.get("code_challenge_method"), "s256");
});

test("builds a Roblox custom OIDC provider authorization URL", () => {
  const url = new URL(createSupabaseOAuthAuthorizeUrl(
    "https://example.supabase.co",
    "custom:roblox",
    challenge,
  ));
  assert.equal(url.searchParams.get("provider"), "custom:roblox");
});

test("rejects insecure Supabase URLs and invalid PKCE challenges", () => {
  assert.throws(() => createSupabaseOAuthAuthorizeUrl("http://example.supabase.co", "google", challenge));
  assert.throws(() => createSupabaseOAuthAuthorizeUrl("https://example.supabase.co", "google", "invalid"));
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  selectSupabaseRuntimeEnv,
  validateSupabaseProjectUrl,
} from "../lib/supabase-runtime-env.ts";

test("prefers Cloudflare Worker bindings over build environment values", () => {
  const worker = { SUPABASE_URL: "https://rmango-project.supabase.co" };
  const fallback = { SUPABASE_URL: "https://old-project.vercel.app" };
  assert.equal(selectSupabaseRuntimeEnv(worker, fallback, true), worker);
});

test("fails closed in production when Worker bindings cannot be read", () => {
  const fallback = { SUPABASE_URL: "https://old-project.vercel.app" };
  assert.throws(
    () => selectSupabaseRuntimeEnv(undefined, fallback, true),
    /Refusing to use process\.env/,
  );
});

test("allows process environment fallback for local development only", () => {
  const fallback = { SUPABASE_URL: "https://local-project.supabase.co" };
  assert.equal(selectSupabaseRuntimeEnv(null, fallback, false), fallback);
});

test("accepts a canonical HTTPS Supabase project origin", () => {
  assert.equal(
    validateSupabaseProjectUrl("https://rmango-project.supabase.co"),
    "https://rmango-project.supabase.co",
  );
});

test("rejects app hosts, insecure schemes, credentials and URL paths", () => {
  for (const value of [
    "https://rmango.vercel.app",
    "https://rmango.abdosony222.workers.dev",
    "http://rmango-project.supabase.co",
    "https://user:pass@rmango-project.supabase.co",
    "https://rmango-project.supabase.co/auth/v1",
  ]) {
    assert.throws(() => validateSupabaseProjectUrl(value));
  }
});

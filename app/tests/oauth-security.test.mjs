import assert from "node:assert/strict";
import test from "node:test";
import {
  GOOGLE_OAUTH_CALLBACK_HOST,
  isValidGoogleOAuthCallback,
} from "../electron/oauth-security.ts";

const validRequest = {
  method: "GET",
  url: "/auth/callback?state=state-for-test&code=one-time-code",
  host: GOOGLE_OAUTH_CALLBACK_HOST,
  remoteAddress: "127.0.0.1",
};

test("accepts a one-time callback on the expected loopback host and state", () => {
  assert.equal(isValidGoogleOAuthCallback(validRequest, "state-for-test"), true);
});

test("rejects a callback with a different state", () => {
  assert.equal(isValidGoogleOAuthCallback(validRequest, "different-state"), false);
});

test("rejects requests from non-loopback addresses", () => {
  assert.equal(isValidGoogleOAuthCallback({ ...validRequest, remoteAddress: "192.168.1.4" }, "state-for-test"), false);
});

test("rejects an unexpected host or port", () => {
  assert.equal(isValidGoogleOAuthCallback({ ...validRequest, host: "localhost:43821" }, "state-for-test"), false);
});

test("rejects methods other than GET", () => {
  assert.equal(isValidGoogleOAuthCallback({ ...validRequest, method: "POST" }, "state-for-test"), false);
});

test("rejects an unexpected callback path or origin", () => {
  assert.equal(isValidGoogleOAuthCallback({ ...validRequest, url: "/other?state=state-for-test" }, "state-for-test"), false);
  assert.equal(isValidGoogleOAuthCallback({ ...validRequest, url: "http://localhost:43821/auth/callback?state=state-for-test" }, "state-for-test"), false);
});

test("rejects a callback without state", () => {
  assert.equal(isValidGoogleOAuthCallback({ ...validRequest, url: "/auth/callback?code=one-time-code" }, "state-for-test"), false);
});

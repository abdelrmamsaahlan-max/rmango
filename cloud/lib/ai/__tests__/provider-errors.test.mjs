import assert from "node:assert/strict";
import test from "node:test";
import { classifyProviderFailure, formatProviderFailure } from "../provider-errors.ts";

test("recognizes the exact Vercel AI Gateway payment-method block", () => {
  const failure = classifyProviderFailure(new Error(
    "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=add-credit-card",
  ));
  assert.equal(failure.code, "gateway_payment_method_required");
  assert.equal(failure.retryable, false);
  assert.equal(failure.accountActionRequired, true);
  assert.ok(failure.message.includes("account-level requirement"));
  assert.ok(failure.nextStep.includes("adult or administrator"));
  assert.ok(!formatProviderFailure(failure).includes("add-credit-card"));
});

test("classifies a nested customer verification error from provider objects", () => {
  const failure = classifyProviderFailure({
    statusCode: 403,
    responseBody: { error: { code: "customer_verification_required", message: "payment verification required" } },
  });
  assert.equal(failure.code, "gateway_payment_method_required");
});

test("distinguishes credits, rate limit, authentication, context and unavailable model failures", () => {
  assert.equal(classifyProviderFailure(new Error("insufficient credits")).code, "provider_credits_exhausted");
  assert.equal(classifyProviderFailure(new Error("429 rate limit exceeded")).code, "provider_rate_limited");
  assert.equal(classifyProviderFailure(new Error("401 invalid API key")).code, "provider_authentication_failed");
  assert.equal(classifyProviderFailure(new Error("maximum context length exceeded")).code, "model_context_exceeded");
  assert.equal(classifyProviderFailure(new Error("model not found")).code, "model_unavailable");
});

test("does not echo unclassified raw provider messages or secrets", () => {
  const failure = classifyProviderFailure(new Error("private internal endpoint failed token=secret-value"));
  assert.equal(failure.code, "provider_request_failed");
  assert.ok(!JSON.stringify(failure).includes("secret-value"));
});

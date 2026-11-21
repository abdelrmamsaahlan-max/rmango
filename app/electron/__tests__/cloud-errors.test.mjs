import assert from "node:assert/strict";
import test from "node:test";
import { formatCloudSendError } from "../cloud-errors.ts";

test("normalizes raw Vercel AI Gateway card errors without echoing billing URLs", () => {
  const result = formatCloudSendError(
    "AI Gateway requires a valid credit card on file to service requests. Please visit https://vercel.com/d?to=%2Fadd-credit-card",
  );
  assert.ok(result.includes("account-level requirement"));
  assert.ok(result.includes("adult or administrator"));
  assert.ok(!result.includes("vercel.com/d?"));
  assert.ok(!result.includes("Error invoking remote method"));
});

test("prefers safe structured provider diagnostics and their next steps", () => {
  const result = formatCloudSendError({
    code: "gateway_payment_method_required",
    title: "Vercel AI Gateway account verification required",
    error: "Provider blocked request.",
    nextStep: "Contact the team administrator.",
  });
  assert.ok(result.includes("administrator who manages the Vercel team"));
  assert.ok(result.includes("RMango cannot bypass it"));
});

test("preserves safe non-billing error payloads and status fallbacks", () => {
  assert.equal(formatCloudSendError({ error: "Context limit reached." }), "Context limit reached.");
  assert.equal(formatCloudSendError({ title: "Provider unavailable", message: "Try again later.", nextStep: "Wait briefly." }), "Provider unavailable\n\nTry again later.\n\nWait briefly.");
  assert.equal(formatCloudSendError("", 503), "RMango Cloud returned HTTP 503.");
});

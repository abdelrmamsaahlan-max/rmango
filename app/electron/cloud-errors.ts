export type CloudSendErrorPayload = {
  error?: unknown;
  message?: unknown;
  title?: unknown;
  nextStep?: unknown;
  code?: unknown;
  retryable?: unknown;
  accountActionRequired?: unknown;
};

const PAYMENT_METHOD_PATTERN = /customer_verification_required|valid credit card on file|payment method on file|add-credit-card/i;

export function formatCloudSendError(value: unknown, statusCode?: number): string {
  const payload = value && typeof value === "object"
    ? value as CloudSendErrorPayload
    : null;
  const raw = typeof value === "string"
    ? value
    : [
        payload?.title,
        payload?.error,
        payload?.message,
        payload?.nextStep,
      ].filter(part => typeof part === "string").join("\n");
  const text = raw.slice(0, 12_000);

  if (
    payload?.code === "gateway_payment_method_required" ||
    PAYMENT_METHOD_PATTERN.test(text)
  ) {
    return [
      "Vercel AI Gateway account verification required",
      "",
      "Vercel AI Gateway blocked the request because the Vercel team does not have a verified payment method on file. This is an account-level requirement, not an RMango sign-in or connection problem. RMango cannot bypass it.",
      "",
      "Ask the adult or administrator who manages the Vercel team to review its AI Gateway billing settings, or ask the deployment administrator to configure a separately authorized provider. Switching models or reconnecting RMango will not fix this requirement.",
    ].join("\n");
  }

  const safeMessage = payload?.message ?? payload?.error ?? value;
  const message = typeof safeMessage === "string" ? safeMessage : "The RMango cloud request failed.";
  const nextStep = typeof payload?.nextStep === "string" ? payload.nextStep : "";
  const title = typeof payload?.title === "string" ? payload.title : "";
  const parts = [title, message, nextStep].filter(Boolean);
  const formatted = parts.join("\n\n");
  if (formatted) return formatted.slice(0, 2_000);
  return statusCode
    ? "RMango Cloud returned HTTP " + statusCode + "."
    : "The RMango cloud request failed.";
}

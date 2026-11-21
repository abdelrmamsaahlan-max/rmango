export type ProviderFailureCode =
  | "gateway_payment_method_required"
  | "provider_credits_exhausted"
  | "provider_rate_limited"
  | "provider_authentication_failed"
  | "model_context_exceeded"
  | "model_unavailable"
  | "provider_unavailable"
  | "provider_request_failed";

export type ProviderFailure = {
  code: ProviderFailureCode;
  title: string;
  message: string;
  nextStep: string;
  retryable: boolean;
  accountActionRequired: boolean;
};

function collectErrorText(value: unknown, depth = 0, seen = new Set<unknown>()): string {
  if (depth > 4 || value === null || value === undefined) return "";
  if (typeof value === "string") return value.slice(0, 8_000);
  if (typeof value !== "object" || seen.has(value)) return "";
  seen.add(value);
  if (value instanceof Error) {
    return [
      value.name,
      value.message,
      collectErrorText((value as Error & { cause?: unknown }).cause, depth + 1, seen),
    ].filter(Boolean).join(" ");
  }
  const record = value as Record<string, unknown>;
  const parts: string[] = [];
  for (const key of ["message", "error", "code", "type", "status", "statusCode", "responseBody", "body", "cause"]) {
    if (key in record) parts.push(collectErrorText(record[key], depth + 1, seen));
  }
  return parts.join(" ").slice(0, 12_000);
}

/**
 * Converts provider-specific errors into safe, actionable product diagnostics.
 * Raw upstream payloads are deliberately not returned to the desktop client.
 */
export function classifyProviderFailure(error: unknown): ProviderFailure {
  const text = collectErrorText(error).toLocaleLowerCase();
  if (
    /customer_verification_required/.test(text) ||
    /valid credit card on file/.test(text) ||
    /payment method on file/.test(text) ||
    /add-credit-card/.test(text)
  ) {
    return {
      code: "gateway_payment_method_required",
      title: "Vercel AI Gateway account verification required",
      message: "Vercel AI Gateway blocked inference because the Vercel team does not have a verified payment method on file. This is an account-level requirement, not an RMango sign-in or connection problem. RMango cannot bypass it.",
      nextStep: "Ask the adult or administrator who manages the Vercel team to review its AI Gateway payment settings, or ask the deployment administrator to configure a separately authorized model provider. Switching models or reconnecting RMango will not resolve this account-level block.",
      retryable: false,
      accountActionRequired: true,
    };
  }

  if (/insufficient[_ ]credits|credit balance|payment required|billing limit|spend limit/.test(text) || /\b402\b/.test(text)) {
    return {
      code: "provider_credits_exhausted",
      title: "AI provider credits are unavailable",
      message: "The configured AI provider rejected the request because its available credits or spending allowance are exhausted.",
      nextStep: "Ask the deployment administrator to check the provider's current credits and configured spending limits. RMango did not retry the request with a more expensive model.",
      retryable: false,
      accountActionRequired: true,
    };
  }

  if (/rate[_ -]?limit|too many requests|\b429\b/.test(text)) {
    return {
      code: "provider_rate_limited",
      title: "AI provider rate limit reached",
      message: "The AI provider temporarily rate-limited this request.",
      nextStep: "Wait briefly before retrying. Repeated failures may require the deployment administrator to review the provider's rate limits.",
      retryable: true,
      accountActionRequired: false,
    };
  }

  if (/invalid api key|authentication failed|unauthorized|invalid token|\b401\b/.test(text)) {
    return {
      code: "provider_authentication_failed",
      title: "AI provider authentication failed",
      message: "RMango reached the configured AI provider, but the provider rejected its authentication credentials.",
      nextStep: "Ask the deployment administrator to verify the server-side provider credentials and deployment environment. Do not paste API keys into chat.",
      retryable: false,
      accountActionRequired: true,
    };
  }

  if (/context length|context[_ -]?window|maximum context|too many tokens|prompt is too long/.test(text)) {
    return {
      code: "model_context_exceeded",
      title: "Model context limit exceeded",
      message: "The selected model could not accept the assembled conversation and project context.",
      nextStep: "Reduce the attachment size or conversation history, or select a model with a larger supported context window.",
      retryable: false,
      accountActionRequired: false,
    };
  }

  if (/model.*(not found|unavailable|does not exist)|unknown model|unsupported model/.test(text)) {
    return {
      code: "model_unavailable",
      title: "Selected model is unavailable",
      message: "The configured model is not currently available from the selected provider.",
      nextStep: "Ask the deployment administrator to refresh the model catalogue and check the configured model ID and its supported capabilities.",
      retryable: false,
      accountActionRequired: true,
    };
  }

  if (/\b(502|503|504)\b|provider.*(unavailable|overloaded)|temporarily unavailable|gateway timeout/.test(text)) {
    return {
      code: "provider_unavailable",
      title: "AI provider temporarily unavailable",
      message: "The configured AI provider did not complete the request because the service is temporarily unavailable.",
      nextStep: "Wait and retry once. If the issue continues, check the provider's service status and deployment logs.",
      retryable: true,
      accountActionRequired: false,
    };
  }

  return {
    code: "provider_request_failed",
    title: "AI request failed",
    message: "The AI provider could not complete this request. RMango did not receive a usable response.",
    nextStep: "Retry once. If the problem continues, ask the deployment administrator to inspect the sanitized request trace and provider logs.",
    retryable: false,
    accountActionRequired: false,
  };
}

export function formatProviderFailure(failure: ProviderFailure): string {
  return failure.title + "\n\n" + failure.message + "\n\n" + failure.nextStep;
}

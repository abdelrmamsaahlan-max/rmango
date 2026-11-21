const SECRET_KEY = /(password|secret|api[_-]?key|authorization|cookie|credential|private[_-]?key|refresh[_-]?token|access[_-]?token|session[_-]?token)/i;
const SECRET_PATTERNS: Array<[RegExp, string]> = [
  [/\bBearer\s+[A-Za-z0-9._~+\/-]+=*/gi, "Bearer [REDACTED]"],
  [/\b(?:sk-[A-Za-z0-9_-]{16,}|gh[pousr]_[A-Za-z0-9]{20,}|github_pat_[A-Za-z0-9_]{20,}|xox[baprs]-[A-Za-z0-9-]{20,})\b/g, "[REDACTED_TOKEN]"],
  [/\bAKIA[0-9A-Z]{16}\b/g, "[REDACTED_AWS_KEY]"],
  [/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]"],
  [/\b(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|SUPABASE_SECRET_KEY|SUPABASE_SERVICE_ROLE_KEY|VERCEL_OIDC_TOKEN)\s*[:=]\s*[^\s,;]+/gi, "[REDACTED_ENV_SECRET]"],
];
function redactString(value: string, limit: number): string {
  let redacted = value;
  for (const [pattern, replacement] of SECRET_PATTERNS) redacted = redacted.replace(pattern, replacement);
  return redacted.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, " ").slice(0, limit);
}

/** Bounded JSON-safe trace output; sensitive fields and common token formats are removed. */
export function redactTraceValue(value: unknown, depth = 0): unknown {
  if (value === null || value === undefined) return null;
  if (typeof value === "string") return redactString(value, 700);
  if (typeof value === "number" || typeof value === "boolean") return value;
  if (typeof value === "bigint") return value.toString();
  if (value instanceof Error) return { name: value.name.slice(0, 80), message: redactString(value.message, 500) };
  if (depth >= 5) return "[MAX_TRACE_DEPTH]";
  if (Array.isArray(value)) return value.slice(0, 20).map(item => redactTraceValue(item, depth + 1));
  if (typeof value === "object") {
    const result: Record<string, unknown> = {};
    for (const [key, item] of Object.entries(value as Record<string, unknown>).slice(0, 40)) {
      if (SECRET_KEY.test(key)) result[key] = "[REDACTED]";
      else if (/^(?:dataBase64|imageData|binary|image|attachmentBytes)$/i.test(key)) result[key] = "[OMITTED_BINARY_DATA]";
      else result[key] = redactTraceValue(item, depth + 1);
    }
    return result;
  }
  return String(value).slice(0, 100);
}
export function boundedTraceData(value: Record<string, unknown>): Record<string, unknown> {
  const safe = redactTraceValue(value) as Record<string, unknown>;
  const encoded = JSON.stringify(safe);
  if (encoded.length <= 12_000) return safe;
  return { truncated: true, preview: redactString(encoded, 11_500) };
}

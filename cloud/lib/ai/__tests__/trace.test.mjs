import assert from "node:assert/strict";
import test from "node:test";
import { boundedTraceData, redactTraceValue } from "../trace.ts";

test("redacts sensitive keys and common bearer, provider and GitHub tokens", () => {
  const safe = boundedTraceData({
    password: "not-for-logs",
    accessToken: "also-not-for-logs",
    authorization: "Bearer opaque",
    detail: "Bearer abc.def.ghi sk-1234567890abcdefghijkl ghp_123456789012345678901234",
  });
  const encoded = JSON.stringify(safe);
  assert.ok(!encoded.includes("not-for-logs"));
  assert.ok(!encoded.includes("opaque"));
  assert.ok(!encoded.includes("abc.def.ghi"));
  assert.ok(!encoded.includes("sk-1234567890abcdefghijkl"));
  assert.ok(!encoded.includes("ghp_123456789012345678901234"));
  assert.equal((safe.password as string), "[REDACTED]");
});

test("omits binary data and bounds depth, arrays and large strings", () => {
  const safe = redactTraceValue({
    image: "huge-image-payload",
    nested: { code: "x".repeat(10_000) },
    values: Array.from({ length: 100 }, (_, i) => i),
  }) as Record<string, any>;
  assert.equal(safe.image, "[OMITTED_BINARY_DATA]");
  assert.equal(safe.nested.code.length, 700);
  assert.equal(safe.values.length, 20);
});

test("bounds total persisted trace data", () => {
  const safe = boundedTraceData({ body: "x".repeat(20_000) });
  assert.equal(safe.truncated, true);
  assert.ok(JSON.stringify(safe).length <= 12_000);
});

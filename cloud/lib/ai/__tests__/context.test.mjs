import assert from "node:assert/strict";
import test from "node:test";
import { compactMessagesToContextWindow } from "../context.ts";

test("removes only complete older user turns and preserves the current request", () => {
  const messages = [
    { role: "user", content: "old request ".repeat(2_000) },
    { role: "assistant", content: "old response ".repeat(2_000) },
    { role: "user", content: "Please fix the current issue." },
  ];

  const result = compactMessagesToContextWindow({
    messages,
    systemPrompt: "You are a careful development assistant.",
    contextWindowTokens: 4_096,
    maxOutputTokens: 512,
  });

  assert.equal(result.removedMessageCount, 2);
  assert.deepEqual(result.messages, [messages[2]]);
  assert.equal(result.fits, true);
  assert.ok(result.estimatedInputTokens <= (result.maxInputTokens ?? 0));
});

test("never drops the latest request when that request cannot fit", () => {
  const latest = { role: "user", content: "essential context ".repeat(2_000) };
  const result = compactMessagesToContextWindow({
    messages: [latest],
    systemPrompt: "system",
    contextWindowTokens: 2_048,
    maxOutputTokens: 512,
  });

  assert.equal(result.removedMessageCount, 0);
  assert.deepEqual(result.messages, [latest]);
  assert.equal(result.fits, false);
});

test("does not count image payload bytes as text and uses the explicit image reserve", () => {
  const messages = [{
    role: "user",
    content: [
      { type: "image", image: "binary-payload-placeholder".repeat(10_000) },
      { type: "text", text: "Describe the visible UI." },
    ],
  }];

  const result = compactMessagesToContextWindow({
    messages,
    systemPrompt: "system",
    contextWindowTokens: 4_096,
    maxOutputTokens: 512,
    imageTokenReserve: 256,
  });

  assert.equal(result.fits, true);
  assert.ok(result.estimatedInputTokens < 512);
  assert.ok(result.estimatedInputTokens >= 256);
});

test("leaves enforcement to the provider when context capacity is unknown", () => {
  const messages = [
    { role: "user", content: "first" },
    { role: "assistant", content: "answer" },
    { role: "user", content: "latest" },
  ];
  const result = compactMessagesToContextWindow({
    messages,
    systemPrompt: "system",
    contextWindowTokens: 0,
    maxOutputTokens: 512,
  });

  assert.equal(result.maxInputTokens, null);
  assert.equal(result.removedMessageCount, 0);
  assert.equal(result.fits, true);
  assert.equal(result.messages.length, 3);
});

test("reserves the output budget and a minimum context safety margin", () => {
  const result = compactMessagesToContextWindow({
    messages: [{ role: "user", content: "hello" }],
    systemPrompt: "system",
    contextWindowTokens: 4_096,
    maxOutputTokens: 2_048,
  });

  assert.equal(result.maxInputTokens, 1_536);
});

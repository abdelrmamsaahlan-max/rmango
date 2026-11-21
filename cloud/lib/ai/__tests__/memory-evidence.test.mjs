import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { validateMemoryEvidence } from "../memory-evidence.ts";

function build(source, overrides = {}) {
  return {
    relativePath: "ServerScriptService/InventoryService.luau",
    sizeBytes: Buffer.byteLength(source),
    indexedSha256: createHash("sha256").update(source).digest("hex"),
    sourceText: source,
    evidenceSnippet: "function InventoryService:AddItem(player, itemId)",
    ...overrides,
  };
}

test("accepts an exact excerpt from the current SHA-256 indexed source file", () => {
  const source = "local InventoryService = {}\nfunction InventoryService:AddItem(player, itemId)\nend";
  const result = validateMemoryEvidence(build(source));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.provenance, "source_excerpt");
  assert.equal(result.verificationStatus, "excerpt_present");
  assert.equal(result.confidence, "source_excerpt_present");
  assert.equal(result.sourceRef, "ServerScriptService/InventoryService.luau");
  assert.equal(result.fileSha256, createHash("sha256").update(source).digest("hex"));
});

test("rejects an excerpt that is not present in the current file", () => {
  const result = validateMemoryEvidence(build("local inventory = {}"));
  assert.deepEqual(result, { ok: false, reason: "excerpt_not_found" });
});

test("rejects changed source bytes when the indexed SHA-256 no longer matches", () => {
  const source = "function InventoryService:AddItem(player, itemId)";
  const result = validateMemoryEvidence(build(source, { indexedSha256: "a".repeat(64) }));
  assert.deepEqual(result, { ok: false, reason: "source_hash_mismatch" });
});

test("rejects missing hash, unsupported formats, oversized content and short excerpts", () => {
  const source = "function InventoryService:AddItem(player, itemId)";
  assert.deepEqual(validateMemoryEvidence(build(source, { indexedSha256: null })), { ok: false, reason: "source_hash_missing" });
  assert.deepEqual(validateMemoryEvidence(build(source, { relativePath: "Assets/scene.rbxl" })), { ok: false, reason: "unsupported_file" });
  assert.deepEqual(validateMemoryEvidence(build(source, { sizeBytes: 512_001 })), { ok: false, reason: "source_too_large" });
  assert.deepEqual(validateMemoryEvidence(build(source, { evidenceSnippet: "AddItem" })), { ok: false, reason: "invalid_snippet" });
});

test("does not treat a valid source excerpt as proof of its interpretation", () => {
  const source = "function InventoryService:AddItem(player, itemId)";
  const result = validateMemoryEvidence(build(source));
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.confidence, "source_excerpt_present");
  assert.notEqual(result.confidence, "verified_truth");
});

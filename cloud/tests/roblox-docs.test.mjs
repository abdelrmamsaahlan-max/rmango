import test from "node:test";
import assert from "node:assert/strict";
import {
  parseRobloxDocumentationIndex,
  validateRobloxDocumentationPath,
} from "../lib/ai/roblox-docs.ts";

test("parses official Creator Hub index entries and skips untrusted URLs", () => {
  const entries = parseRobloxDocumentationIndex([
    "- [Scripting](/docs/en-us/scripting.md): Luau and script basics",
    "- [Engine API](/docs/reference/engine/classes/Instance.md): Engine API reference",
    "- [Open Cloud](/docs/cloud/reference/users.md): HTTP API reference",
    "- [Bad link](https://example.com): not Roblox",
    "- [Traversal](/docs/en-us/../../secrets.md): invalid path",
  ].join("\n"), "all");

  assert.equal(entries.length, 3);
  assert.equal(entries[0].title, "Scripting");
  assert.equal(entries[1].area, "all");
});

test("only reads paths in the official documentation namespace", () => {
  assert.equal(
    validateRobloxDocumentationPath("/docs/en-us/scripting"),
    "/docs/en-us/scripting.md",
  );
  assert.equal(
    validateRobloxDocumentationPath("/docs/reference/engine/classes/Instance.md"),
    "/docs/reference/engine/classes/Instance.md",
  );
  assert.throws(() => validateRobloxDocumentationPath("https://example.com/roblox.md"));
  assert.throws(() => validateRobloxDocumentationPath("/docs/en-us/../../secrets"));
  assert.throws(() => validateRobloxDocumentationPath("/docs/en-us/scripting?next=https://example.com"));
});

import assert from "node:assert/strict";
import test from "node:test";
import {
  deduplicateProjectMemories,
  rankProjectItems,
  rankProjectItemsWithEvidence,
  tokenizeProjectQuery,
} from "../lib/ai/project-relevance.ts";

test("removes common instruction filler from retrieval terms", () => {
  assert.deepEqual(tokenizeProjectQuery("Please help me debug the PlayerDataService saving bug"), [
    "debug", "player", "data", "service", "saving", "bug",
  ]);
});

test("ranks a matching project file above an unrelated alphabetically earlier file", () => {
  const files = [
    { path: "Assets/ChairModel.lua", name: "ChairModel.lua" },
    { path: "Systems/PlayerDataService.luau", name: "PlayerDataService.luau" },
    { path: "UI/ShopController.client.lua", name: "ShopController.client.lua" },
  ];
  const ranked = rankProjectItems(files, "fix PlayerDataService saving", {
    getText: file => file.path + " " + file.name,
    nowMs: 1_800_000_000_000,
  });
  assert.equal(ranked[0].name, "PlayerDataService.luau");
});

test("ranks relevant architecture and bug memories above unrelated notes", () => {
  const memories = [
    { memory_type: "feature", title: "Shop UI", content: "The shop controller renders item cards." },
    { memory_type: "bug", title: "Player save failure", content: "UpdateAsync retries failed because the key format was wrong." },
    { memory_type: "architecture", title: "Player data architecture", content: "PlayerDataService owns profile loading and saving." },
  ];
  const ranked = rankProjectItems(memories, "debug player data saving", {
    getText: item => [item.memory_type, item.title, item.content].join(" "),
  });
  assert.ok(ranked.slice(0, 2).some(item => item.title === "Player save failure"));
  assert.ok(ranked.slice(0, 2).some(item => item.title === "Player data architecture"));
  assert.equal(ranked[2].title, "Shop UI");
});

test("deduplicates by memory type and title while retaining the newest row", () => {
  const items = [
    { memory_type: "bug", title: "Save error", content: "Newest note" },
    { memory_type: "bug", title: "Save error", content: "Older note" },
    { memory_type: "decision", title: "Save error", content: "Different type" },
  ];
  assert.deepEqual(deduplicateProjectMemories(items), [items[0], items[2]]);
});

test("preserves source order when all query tokens are stop words", () => {
  const items = [{ name: "a" }, { name: "b" }];
  assert.deepEqual(rankProjectItems(items, "please help me with this", {
    getText: item => item.name,
  }), items);
});

test("recency is a small boost and cannot outrank a strong lexical match", () => {
  const now = 1_800_000_000_000;
  const items = [
    { title: "Save error", updated_at: new Date(now - 90 * 86_400_000).toISOString() },
    { title: "Unrelated visual style", updated_at: new Date(now).toISOString() },
  ];
  const ranked = rankProjectItems(items, "save error", {
    getText: item => item.title,
    updatedAt: item => item.updated_at,
    nowMs: now,
  });
  assert.equal(ranked[0].title, "Save error");
});

test("returns matched-term evidence for the selected context", () => {
  const ranked = rankProjectItemsWithEvidence(
    [{ path: "ServerScriptService/InventoryService.luau" }, { path: "Workspace/Chair.lua" }],
    "InventoryService",
    { getText: item => item.path },
  );
  assert.equal(ranked[0].item.path, "ServerScriptService/InventoryService.luau");
  assert.ok(ranked[0].matchedTerms.includes("inventory"));
  assert.ok(ranked[0].matchedTerms.includes("service"));
  assert.equal(ranked[0].retrievalMethod, "bm25");
});

test("bounds custom relevance boosts", () => {
  const ranked = rankProjectItemsWithEvidence(
    [{ id: "match", text: "inventory service add item" }, { id: "other", text: "audio music ambience" }],
    "inventory service",
    { getText: item => item.text, boost: item => item.id === "other" ? 50 : 0 },
  );
  assert.equal(ranked[0].item.id, "match");
});

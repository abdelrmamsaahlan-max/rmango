import assert from "node:assert/strict";
import test from "node:test";
import {
  deduplicateProjectMemories,
  rankProjectItems,
  scoreProjectRelevance,
  tokenizeProjectQuery,
} from "../project-relevance.ts";

test("tokenizes a request without common instruction filler", () => {
  assert.deepEqual(tokenizeProjectQuery("Please help me debug the PlayerDataService saving bug"), [
    "debug", "player", "data", "service", "saving", "bug",
  ]);
});

test("ranks a matching file over unrelated alphabetically earlier files", () => {
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

test("ranks architecture and bug memories above unrelated memories", () => {
  const memories = [
    { memory_type: "feature", title: "Shop UI", content: "The shop controller renders item cards." },
    { memory_type: "bug", title: "Player save failure", content: "UpdateAsync retries failed because the key format was wrong." },
    { memory_type: "architecture", title: "Player data architecture", content: "PlayerDataService owns profile loading and saving." },
  ];
  const ranked = rankProjectItems(memories, "debug player data saving", {
    getText: item => [item.memory_type, item.title, item.content].join(" "),
  });

  const relevantTitles = ranked.slice(0, 2).map(item => item.title);
  assert.ok(relevantTitles.includes("Player save failure"));
  assert.ok(relevantTitles.includes("Player data architecture"));
  assert.equal(ranked[2].title, "Shop UI");
});

test("deduplicates the newest note by type and title", () => {
  const items = [
    { memory_type: "bug", title: "Save error", content: "Newest note" },
    { memory_type: "bug", title: "Save error", content: "Older note" },
    { memory_type: "decision", title: "Save error", content: "Different type" },
  ];
  const deduplicated = deduplicateProjectMemories(items);

  assert.deepEqual(deduplicated, [items[0], items[2]]);
});

test("keeps stable source order when a query contains only stop words", () => {
  const items = [{ name: "a" }, { name: "b" }];
  const ranked = rankProjectItems(items, "please help me with this", {
    getText: item => item.name,
  });

  assert.deepEqual(ranked, items);
});

test("gives a modest recency boost without outranking strong lexical evidence", () => {
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
  assert.ok(scoreProjectRelevance("save error", "Save error") > scoreProjectRelevance("save error", "Unrelated visual style"));
});


test("ranks earlier attachment extracts by the active follow-up request", () => {
  const attachments = [
    { name: "ShopDesign.pdf", text: "Visual layout notes for the shop UI and item cards." },
    { name: "PlayerDataNotes.docx", text: "PlayerDataService profile loading, DataStore keys, UpdateAsync retries." },
    { name: "MapIdeas.txt", text: "Street layout and environment art references." },
  ];
  const ranked = rankProjectItems(attachments, "debug PlayerDataService DataStore saving", {
    getText: item => item.name + " " + item.text,
  });

  assert.equal(ranked[0].name, "PlayerDataNotes.docx");
});

import test from "node:test";
import assert from "node:assert/strict";
import { scoreSourcePath, searchSourceContent } from "../lib/ai/source-search.ts";

test("scores a matching Luau path above an unrelated path", () => {
  assert.ok(scoreSourcePath("ServerScriptService/PlayerDataService.luau", "player data") > 0);
  assert.equal(scoreSourcePath("ReplicatedStorage/Weather.luau", "player data"), 0);
});

test("returns line-numbered snippets for matching source code", () => {
  const source = [
    "local Players = game:GetService(\"Players\")",
    "",
    "local function savePlayerData(player, dataStore)",
    "    return dataStore:SetAsync(player.UserId, player.Data)",
    "end",
  ].join("\n");
  const matches = searchSourceContent("PlayerDataService.luau", source, "save player data");
  assert.ok(matches.length > 0);
  assert.equal(matches[0].line, 3);
  assert.match(matches[0].snippet, /SetAsync/);
  assert.match(matches[0].snippet, /3 \| local function savePlayerData/);
});

test("matches Roblox identifiers without requiring exact case", () => {
  const matches = searchSourceContent(
    "RemoteHandler.luau",
    "local function OnPlayerAdded(player)\n  player.CharacterAdded:Connect(onSpawn)",
    "player added",
  );
  assert.equal(matches[0]?.line, 1);
});

test("does not return matches for stop-word-only queries", () => {
  assert.deepEqual(searchSourceContent("A.luau", "local player = true", "find the code in my file"), []);
});

test("keeps result count bounded", () => {
  const source = Array.from({ length: 50 }, (_, i) => "SavePlayerData(player, payload) -- " + i).join("\n");
  assert.equal(searchSourceContent("Data.luau", source, "SavePlayerData", 2).length, 2);
});

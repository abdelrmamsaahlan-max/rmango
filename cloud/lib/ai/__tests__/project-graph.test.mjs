import assert from "node:assert/strict";
import test from "node:test";
import { parseProjectSource, resolveProjectImportHint } from "../project-graph.ts";

test("indexes Luau functions, module tables, exported types and script.Parent requires", () => {
  const source = [
    "local PlayerData = require(script.Parent.Data.PlayerData)",
    "local InventoryService = {}",
    "function InventoryService:AddItem(player, itemId)",
    "  return true",
    "end",
    "local function loadProfile(player)",
    "end",
    "export type InventoryItem = { id: string }",
  ].join("\n");
  const graph = parseProjectSource("ServerScriptService/Systems/InventoryService.luau", source);
  assert.ok(graph.symbols.some(s => s.symbol_name === "InventoryService" && s.symbol_kind === "module"));
  assert.ok(graph.symbols.some(s => s.symbol_name === "InventoryService:AddItem" && s.symbol_kind === "function"));
  assert.ok(graph.symbols.some(s => s.symbol_name === "loadProfile" && s.symbol_kind === "function"));
  assert.ok(graph.symbols.some(s => s.symbol_name === "InventoryItem" && s.symbol_kind === "type"));
  assert.equal(graph.edges.length, 1);
  assert.equal(graph.edges[0].target_hint, "ServerScriptService/Systems/Data/PlayerData");
});

test("resolves relative imports and game service module paths", () => {
  assert.equal(resolveProjectImportHint("src/features/shop/controller.ts", "../data/store.ts"), "src/features/data/store");
  assert.equal(resolveProjectImportHint("ServerScriptService/Shop.server.lua", 'game:GetService("ReplicatedStorage").Modules.Items'), "ReplicatedStorage/Modules/Items");
});

test("indexes TypeScript declarations plus static and dynamic imports", () => {
  const source = [
    'import { store } from "../data/store";',
    'export { helper } from "./helper.js";',
    'const lazy = import("./lazy");',
    "export interface InventoryState { count: number }",
    "export class InventoryController {}",
    "export function addItem() {}",
    "export const MAX_ITEMS = 20;",
  ].join("\n");
  const graph = parseProjectSource("src/features/inventory.ts", source);
  assert.equal(graph.edges.length, 3);
  assert.ok(graph.symbols.some(s => s.symbol_name === "InventoryState" && s.symbol_kind === "type"));
  assert.ok(graph.symbols.some(s => s.symbol_name === "InventoryController" && s.symbol_kind === "class"));
  assert.ok(graph.symbols.some(s => s.symbol_name === "addItem" && s.symbol_kind === "function"));
  assert.ok(graph.symbols.some(s => s.symbol_name === "MAX_ITEMS" && s.symbol_kind === "variable"));
});

test("does not index unsupported or oversized files", () => {
  assert.equal(parseProjectSource("Assets/scene.rbxl", "binary").skippedReason, "unsupported_file");
  assert.equal(parseProjectSource("src/huge.luau", "x".repeat(512_001)).skippedReason, "source_too_large");
});

test("caps pathological source files to bounded symbol and edge rows", () => {
  const source = Array.from({ length: 2_500 }, (_, i) => "local function fn" + i + "() end\nlocal M" + i + " = require('./module" + i + "')").join("\n");
  const graph = parseProjectSource("src/main.luau", source);
  assert.ok(graph.symbols.length <= 2_000);
  assert.ok(graph.edges.length <= 1_000);
});

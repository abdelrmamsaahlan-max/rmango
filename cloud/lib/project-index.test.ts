import { describe, expect, it } from "vitest";
import { indexLuauSource, normalizeProjectPath } from "./project-index";

describe("project source index", () => {
  it("normalizes source paths", () => {
    expect(normalizeProjectPath(".\\src\\Server\\Main.server.luau")).toBe("src/Server/Main.server.luau");
  });

  it("extracts module, function, service, remote and require references", () => {
    const source = [
      "local Players = game:GetService('Players')",
      "local RoundService = require(script.Parent.Services.RoundService)",
      "local StartRound = Instance.new('RemoteEvent')",
      "local function startRound()",
      "  local module = require(script.Parent:WaitForChild('InventoryService'))",
      "end",
    ].join("\n");
    const result = indexLuauSource("src/Server/MatchService.server.luau", source, [
      "src/Server/Services/RoundService.luau",
      "src/Server/Services/InventoryService.luau",
    ]);

    expect(result.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbolType: "module", symbolName: "matchservice.server" }),
      expect.objectContaining({ symbolType: "function", symbolName: "startRound" }),
      expect.objectContaining({ symbolType: "service", symbolName: "Players" }),
      expect.objectContaining({ symbolType: "remote", symbolName: "StartRound" }),
    ]));
    expect(result.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dependencyType: "module_require",
        targetName: "RoundService",
        targetRelativePath: "src/Server/Services/RoundService.luau",
        confidence: 0.95,
      }),
      expect.objectContaining({
        dependencyType: "module_require",
        targetName: "InventoryService",
        targetRelativePath: "src/Server/Services/InventoryService.luau",
      }),
      expect.objectContaining({ dependencyType: "service_reference", targetName: "Players" }),
      expect.objectContaining({ dependencyType: "instance_reference", targetName: "InventoryService" }),
    ]));
  });

  it("indexes DataStore and MemoryStore names as exact project resources", () => {
    const source = [
      "local DataStoreService = game:GetService('DataStoreService')",
      "local ProfileStore = DataStoreService:GetDataStore('PlayerProfiles_v2')",
      "local ScoreStore = DataStoreService:GetOrderedDataStore('GlobalScores')",
      "local MemoryStoreService = game:GetService('MemoryStoreService')",
      "local MatchQueue = MemoryStoreService:GetQueue('MatchQueue')",
    ].join("\n");
    const result = indexLuauSource("src/Server/DataService.luau", source, []);

    expect(result.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbolType: "datastore", symbolName: "DataStore:PlayerProfiles_v2" }),
      expect.objectContaining({ symbolType: "datastore", symbolName: "OrderedDataStore:GlobalScores" }),
      expect.objectContaining({ symbolType: "datastore", symbolName: "MemoryStoreQueue:MatchQueue" }),
    ]));
    expect(result.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dependencyType: "datastore_reference",
        targetName: "PlayerProfiles_v2",
        targetRelativePath: null,
        confidence: 0.98,
      }),
      expect.objectContaining({ dependencyType: "datastore_reference", targetName: "GlobalScores" }),
      expect.objectContaining({ dependencyType: "datastore_reference", targetName: "MatchQueue" }),
    ]));
  });

  it("maps common remote event and function use sites to their declared remote names", () => {
    const source = [
      "local ReplicatedStorage = game:GetService('ReplicatedStorage')",
      "local PurchaseRemote = ReplicatedStorage:WaitForChild('PurchaseItem')",
      "PurchaseRemote.OnServerEvent:Connect(function(player, itemId) end)",
      "local InventoryRemote = ReplicatedStorage:WaitForChild('InventoryUpdated')",
      "InventoryRemote:FireClient(player, inventory)",
    ].join("\n");
    const result = indexLuauSource("src/Server/Commerce.server.luau", source, []);

    expect(result.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dependencyType: "remote_reference",
        targetName: "PurchaseItem",
        confidence: 0.93,
      }),
      expect.objectContaining({
        dependencyType: "remote_reference",
        targetName: "InventoryUpdated",
        confidence: 0.93,
      }),
    ]));
  });

  it("indexes common UI instances and developer-assigned UI names", () => {
    const source = [
      "local MainGui = Instance.new('ScreenGui')",
      "MainGui.Name = 'MainHUD'",
      "local StartButton = Instance.new('TextButton')",
      "StartButton.Name = 'StartButton'",
      "local List = Instance.new('ScrollingFrame')",
    ].join("\n");
    const result = indexLuauSource("src/Client/Hud.client.luau", source, []);

    expect(result.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbolType: "ui_element", symbolName: "MainHUD" }),
      expect.objectContaining({ symbolType: "ui_element", symbolName: "StartButton" }),
      expect.objectContaining({ symbolType: "ui_element", symbolName: "List:ScrollingFrame" }),
    ]));
    expect(result.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({ dependencyType: "ui_reference", targetName: "MainHUD", confidence: 0.95 }),
      expect.objectContaining({ dependencyType: "ui_reference", targetName: "StartButton", confidence: 0.95 }),
      expect.objectContaining({ dependencyType: "ui_reference", targetName: "List:ScrollingFrame", confidence: 0.72 }),
    ]));
  });

  it("indexes Roblox asset IDs and thumbnail IDs without inventing asset metadata", () => {
    const source = [
      "local Sound = Instance.new('Sound')",
      "Sound.SoundId = 'rbxassetid://123456789'",
      "local thumbnail = 'rbxthumb://type=Asset&id=987654321&w=150&h=150'",
    ].join("\n");
    const result = indexLuauSource("src/Client/Audio.client.luau", source, []);

    expect(result.symbols).toEqual(expect.arrayContaining([
      expect.objectContaining({ symbolType: "asset", symbolName: "rbxassetid://123456789" }),
      expect.objectContaining({ symbolType: "asset", symbolName: "rbxthumb://987654321" }),
    ]));
    expect(result.dependencies).toEqual(expect.arrayContaining([
      expect.objectContaining({
        dependencyType: "asset_reference",
        targetName: "rbxassetid://123456789",
        confidence: 1,
      }),
      expect.objectContaining({
        dependencyType: "asset_reference",
        targetName: "rbxthumb://987654321",
        confidence: 1,
      }),
    ]));
  });

  it("ignores commented-out APIs and Luau long-bracket strings", () => {
    const source = [
      "-- local FakeStore = DataStoreService:GetDataStore('NotReal')",
      "local Notes = [[",
      "  Example only: MemoryStoreService:GetQueue('NotRealEither')",
      "]]",
      "local RealStore = DataStoreService:GetDataStore('RealStore')",
    ].join("\n");
    const result = indexLuauSource("src/Server/Store.luau", source, []);

    expect(result.symbols.filter(item => item.symbolType === "datastore")).toEqual([
      expect.objectContaining({ symbolName: "DataStore:RealStore" }),
    ]);
    expect(result.dependencies.filter(item => item.dependencyType === "datastore_reference")).toHaveLength(1);
  });

  it("does not turn arbitrary text files into Luau index records", () => {
    expect(indexLuauSource("assets/readme.md", "require(foo)", ["foo.luau"])).toEqual({
      symbols: [],
      dependencies: [],
    });
  });

  it("keeps unresolved modules visible instead of inventing a target path", () => {
    const result = indexLuauSource("Server/Main.server.lua", "local x = require(script.Parent.Missing)", []);
    expect(result.dependencies[0]).toMatchObject({
      targetName: "Missing",
      targetRelativePath: null,
      confidence: 0.15,
    });
  });
});

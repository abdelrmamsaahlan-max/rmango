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

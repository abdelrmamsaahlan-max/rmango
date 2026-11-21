import assert from "node:assert/strict";
import test from "node:test";
import { detectProjectDependencyCycles } from "../project-graph-analysis.ts";

test("detects a fully resolved three-file circular dependency", () => {
  const files = [
    { id: "a", relative_path: "ServerScriptService/A.luau" },
    { id: "b", relative_path: "ServerScriptService/B.luau" },
    { id: "c", relative_path: "ServerScriptService/C.luau" },
  ];
  const result = detectProjectDependencyCycles(files, [
    { source_file_id: "a", target_hint: "ServerScriptService/B" },
    { source_file_id: "b", target_hint: "ServerScriptService/C" },
    { source_file_id: "c", target_hint: "ServerScriptService/A" },
  ]);

  assert.equal(result.cycleCount, 1);
  assert.deepEqual(result.cycles[0], [
    "ServerScriptService/A.luau",
    "ServerScriptService/B.luau",
    "ServerScriptService/C.luau",
    "ServerScriptService/A.luau",
  ]);
  assert.equal(result.resolvedEdges, 3);
});

test("does not report a cycle when the graph is acyclic or dependencies cannot be resolved", () => {
  const files = [
    { id: "a", relative_path: "src/a.ts" },
    { id: "b", relative_path: "src/b.ts" },
  ];
  const result = detectProjectDependencyCycles(files, [
    { source_file_id: "a", target_hint: "src/b" },
    { source_file_id: "b", target_hint: "missing/runtime-reference" },
  ]);

  assert.equal(result.cycleCount, 0);
  assert.equal(result.resolvedEdges, 1);
  assert.equal(result.unresolvedEdges, 1);
});

test("bounds cycle output and reports when additional cycles are omitted", () => {
  const files = [
    { id: "a", relative_path: "a.lua" },
    { id: "b", relative_path: "b.lua" },
    { id: "c", relative_path: "c.lua" },
  ];
  const result = detectProjectDependencyCycles(files, [
    { source_file_id: "a", target_hint: "b" },
    { source_file_id: "b", target_hint: "a" },
    { source_file_id: "b", target_hint: "c" },
    { source_file_id: "c", target_hint: "b" },
  ], 1);

  assert.equal(result.cycles.length, 1);
  assert.equal(result.cyclesTruncated, true);
});

import assert from "node:assert/strict";
import test from "node:test";
import { boundGitDiff, parseGitStatus } from "../git-workspace.ts";

test("parses branch, staged, unstaged, untracked and conflicted files", () => {
  const parsed = parseGitStatus([
    "## feature/inventory...origin/feature/inventory [ahead 2, behind 1]",
    "M  src/InventoryService.luau",
    " M src/Shop.client.lua",
    "A  src/NewModule.luau",
    "?? docs/notes.md",
    "UU src/Conflict.luau",
  ].join("\n"));
  assert.equal(parsed.branch, "feature/inventory");
  assert.equal(parsed.ahead, 2);
  assert.equal(parsed.behind, 1);
  assert.equal(parsed.staged, 2);
  assert.equal(parsed.unstaged, 1);
  assert.equal(parsed.untracked, 1);
  assert.equal(parsed.conflicted, 1);
  assert.equal(parsed.changes[0].path, "src/InventoryService.luau");
});

test("handles unborn and detached branches", () => {
  assert.equal(parseGitStatus("## No commits yet on main").branch, "main");
  assert.equal(parseGitStatus("## HEAD (no branch)").branch, "(detached HEAD)");
  assert.equal(parseGitStatus("## main").ahead, 0);
});

test("bounds large diff previews with an explicit marker", () => {
  const result = boundGitDiff("x".repeat(5_000), 2_000);
  assert.equal(result.truncated, true);
  assert.ok(result.text.length <= 2_000);
  assert.ok(result.text.includes("Diff preview truncated"));
});

test("keeps complete small unified diffs unchanged", () => {
  const source = "diff --git a/a.lua b/a.lua\n+print('ok')\n";
  assert.deepEqual(boundGitDiff(source), { text: source, truncated: false });
});

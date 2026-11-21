import assert from "node:assert/strict";
import test from "node:test";
import { createIntelligencePlan } from "../intelligence-controller.ts";
import { intelligenceRoutingCases } from "../evaluations/fixtures/intelligence-routing-cases.mjs";

function legacyFixedDefault(item) {
  return {
    modelProfile: item.options?.hasImage ? "vision" : (item.options?.requestedProfile || "developer"),
    level: "focused",
    projectTools: Boolean(item.options?.hasSelectedProject),
  };
}

test("routing benchmark: controller matches the curated task matrix", () => {
  const rows = intelligenceRoutingCases.map(item => {
    const actual = createIntelligencePlan({
      prompt: item.prompt,
      requestedProfile: item.options?.requestedProfile || "auto",
      levelSetting: item.options?.levelSetting || "auto",
      hasImage: item.options?.hasImage,
      hasDocument: item.options?.hasDocument,
      hasSelectedProject: item.options?.hasSelectedProject,
      projectFileCount: item.options?.projectFileCount,
    });
    const observed = {
      intent: actual.intent,
      level: actual.level,
      modelProfile: actual.modelProfile,
      projectTools: actual.budget.useProjectTools,
    };
    return { id: item.id, expected: item.expected, observed };
  });
  const mismatches = rows.filter(row =>
    Object.entries(row.expected).some(([key, value]) => row.observed[key] !== value)
  );
  assert.deepEqual(mismatches, [], JSON.stringify(mismatches, null, 2));
});

test("routing benchmark: Auto beats the legacy fixed Developer/Focused default on task fit", () => {
  let baselineCorrect = 0;
  let controllerCorrect = 0;
  for (const item of intelligenceRoutingCases) {
    const baseline = legacyFixedDefault(item);
    const plan = createIntelligencePlan({
      prompt: item.prompt,
      requestedProfile: item.options?.requestedProfile || "auto",
      levelSetting: item.options?.levelSetting || "auto",
      hasImage: item.options?.hasImage,
      hasDocument: item.options?.hasDocument,
      hasSelectedProject: item.options?.hasSelectedProject,
      projectFileCount: item.options?.projectFileCount,
    });
    const expected = item.expected;
    if (
      baseline.modelProfile === expected.modelProfile &&
      baseline.level === expected.level &&
      baseline.projectTools === expected.projectTools
    ) baselineCorrect++;
    if (
      plan.modelProfile === expected.modelProfile &&
      plan.level === expected.level &&
      plan.budget.useProjectTools === expected.projectTools
    ) controllerCorrect++;
  }
  assert.equal(controllerCorrect, intelligenceRoutingCases.length);
  assert.ok(controllerCorrect > baselineCorrect);
});

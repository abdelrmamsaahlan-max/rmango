import assert from "node:assert/strict";
import test from "node:test";
import { createIntelligencePlan } from "../intelligence-controller.ts";

const run = (prompt, options = {}) => createIntelligencePlan({
  prompt,
  requestedProfile: "auto",
  ...options,
});

test("routes simple explanations to instant and the efficient profile", () => {
  const plan = run("What is a ModuleScript in Roblox?");
  assert.equal(plan.level, "instant");
  assert.equal(plan.modelProfile, "fast");
  assert.equal(plan.budget.maxSteps, 2);
  assert.equal(plan.budget.useProjectTools, false);
});

test("routes ordinary one-system coding to focused with a developer-capable model", () => {
  const plan = run("Add a cooldown to this Roblox RemoteEvent handler.");
  assert.equal(plan.intent, "implementation");
  assert.equal(plan.level, "focused");
  assert.equal(plan.modelProfile, "developer");
  assert.equal(plan.budget.minimumEvidenceBeforeEdits, 1);
});

test("routes root-cause debugging to a focused investigation with hypotheses", () => {
  const plan = run("Debug why my inventory save randomly fails and find the root cause.");
  assert.equal(plan.intent, "debugging");
  assert.ok(plan.level === "focused" || plan.level === "advanced");
  assert.ok(plan.budget.maxHypotheses >= 2);
});

test("routes broad cross-system architecture to deep engineering", () => {
  const plan = run("Redesign the entire game architecture across networking, persistence, inventory, UI, and progression; compare options and implement safely.", {
    hasSelectedProject: true,
    projectFileCount: 240,
  });
  assert.equal(plan.level, "deep");
  assert.equal(plan.modelProfile, "agent");
  assert.equal(plan.budget.compareApproaches, true);
  assert.equal(plan.budget.verificationDepth, "strong");
  assert.ok(plan.budget.maxProjectFiles > 20);
});

test("routes current documentation and benchmarking to research mode", () => {
  const plan = run("Research the latest official Roblox DataStore documentation and benchmark safe persistence options.");
  assert.equal(plan.level, "research");
  assert.equal(plan.intent, "research");
  assert.equal(plan.modelProfile, "think");
  assert.equal(plan.budget.verificationDepth, "strong");
  assert.equal(plan.budget.verificationDepth, "strong");
});

test("honors explicit model profile and manual intelligence-level overrides", () => {
  const plan = createIntelligencePlan({
    prompt: "What is a RemoteEvent?",
    requestedProfile: "developer",
    levelSetting: "deep",
  });
  assert.equal(plan.modelProfile, "developer");
  assert.equal(plan.profileWasAutoSelected, false);
  assert.equal(plan.level, "deep");
  assert.equal(plan.budget.maxSteps, 14);
});

test("forces image-compatible profile for image attachments without overriding manual level", () => {
  const plan = run("Explain this Roblox screenshot.", {
    hasImage: true,
    levelSetting: "focused",
  });
  assert.equal(plan.modelProfile, "vision");
  assert.equal(plan.level, "focused");
});

test("does not grant project or Studio tools to ordinary instant questions", () => {
  const plan = run("Explain what task.defer does.");
  assert.equal(plan.budget.useProjectTools, false);
  assert.equal(plan.budget.useStudioTools, false);
});

test("increases context and verification budgets monotonically by level", () => {
  const levels = ["instant", "focused", "advanced", "deep"];
  const budgets = levels.map(level => run("Explain this system.", { levelSetting: level }).budget);
  for (let i = 1; i < budgets.length; i++) {
    assert.ok(budgets[i].maxSteps >= budgets[i - 1].maxSteps);
    assert.ok(budgets[i].maxProjectFiles >= budgets[i - 1].maxProjectFiles);
    assert.ok(budgets[i].maxMemoryCharacters >= budgets[i - 1].maxMemoryCharacters);
  }
});


test("detects project-navigation questions from selected-project references", () => {
  const plan = run("Explain how the inventory save system works in this project.", {
    hasSelectedProject: true,
  });
  assert.equal(plan.intent, "project_navigation");
  assert.equal(plan.budget.useProjectTools, true);
});

test("focused debugging selects the developer profile; deep debugging selects agent", () => {
  const focused = run("Debug why this one function returns nil.");
  const deep = run("Deep engineering investigation: debug the entire inventory and persistence architecture.", {
    hasSelectedProject: true,
    projectFileCount: 180,
  });
  assert.equal(focused.modelProfile, "developer");
  assert.equal(deep.modelProfile, "agent");
});


test("keeps an explicit planning-only request in planning mode even when it says create an implementation plan", () => {
  const plan = run("Create an implementation plan for a Roblox tycoon with persistence, NPCs and a responsive UI. Do not write code yet.", {
    hasSelectedProject: true,
  });
  assert.equal(plan.intent, "planning");
  assert.equal(plan.budget.useProjectTools, true);
});


test("uses selected-project tools when the user asks to explain a named existing system", () => {
  const plan = run("Explain InventoryService and how it handles player items.", {
    hasSelectedProject: true,
  });
  assert.equal(plan.intent, "project_navigation");
  assert.equal(plan.budget.useProjectTools, true);
});

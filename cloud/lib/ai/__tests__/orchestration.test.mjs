import assert from "node:assert/strict";
import test from "node:test";
import { buildAgentWorkflowContext } from "../orchestration.ts";

test("routes simple questions to the quick focused strategy", () => {
  const workflow = buildAgentWorkflowContext({
    profile: "developer",
    prompt: "What does a RemoteEvent do in Roblox?",
  });

  assert.equal(workflow.strategy, "quick");
  assert.equal(workflow.mode, "focused");
  assert.equal(workflow.plan.length, 0);
});

test("recognizes make-a-plan requests as planning only", () => {
  const workflow = buildAgentWorkflowContext({
    profile: "developer",
    prompt: "Make a plan for a tycoon architecture with dependencies and acceptance criteria.",
  });

  assert.equal(workflow.strategy, "planning");
  assert.equal(workflow.mode, "coordinated");
  assert.equal(workflow.plan.length, 4);
  assert.ok(workflow.plan.every(item => item.status === "pending"));
  assert.ok(workflow.plan[1].dependsOn.includes("inspect"));
});

test("routes root-cause investigations to debug strategy", () => {
  const workflow = buildAgentWorkflowContext({
    profile: "developer",
    prompt: "Diagnose why the Luau data store save is broken and find the root cause.",
  });

  assert.equal(workflow.strategy, "debug");
  assert.equal(workflow.plan[0].id, "reproduce");
});

test("routes connected multi-domain feature work to agent strategy", () => {
  const workflow = buildAgentWorkflowContext({
    profile: "developer",
    prompt: "Build a tycoon gameplay loop in Luau with a responsive UI.",
  });

  assert.equal(workflow.strategy, "agent");
  assert.equal(workflow.mode, "coordinated");
  assert.ok(workflow.domains.includes("luau"));
  assert.ok(workflow.domains.includes("gameplay"));
  assert.ok(workflow.domains.includes("ui"));
});

test("prioritizes deep engineering for broad production architecture requests", () => {
  const workflow = buildAgentWorkflowContext({
    profile: "developer",
    prompt: "Design a production-ready architecture with Luau, tycoon gameplay, UI and DataStore persistence.",
  });

  assert.equal(workflow.strategy, "deep");
  assert.equal(workflow.maxSteps, 16);
});

test("marks risky planning subjects without enabling execution", () => {
  const workflow = buildAgentWorkflowContext({
    profile: "developer",
    prompt: "Make a plan for a DataStore migration that deletes obsolete records.",
  });

  assert.equal(workflow.strategy, "planning");
  assert.equal(workflow.riskLevel, "high");
});

import { describe, expect, it } from "vitest";
import {
  getSpecialistDefinition,
  getSpecialistDelegationError,
  MAX_SPECIALIST_DELEGATIONS_PER_TASK,
  SPECIALIST_ROLES,
} from "./specialists";

describe("RMango specialist contracts", () => {
  it("defines distinct roles with a responsibility and safety boundary", () => {
    expect(new Set(SPECIALIST_ROLES).size).toBe(SPECIALIST_ROLES.length);
    expect(SPECIALIST_ROLES.length).toBe(9);

    for (const role of SPECIALIST_ROLES) {
      const specialist = getSpecialistDefinition(role);
      expect(specialist.title.length).toBeGreaterThan(5);
      expect(specialist.responsibility.length).toBeGreaterThan(20);
      expect(specialist.systemPrompt).toContain("read-only specialist");
      expect(specialist.systemPrompt).toContain("Do not edit files");
      expect(specialist.systemPrompt).toContain("Do not reveal hidden chain-of-thought");
    }
  });

  it("limits one attempt to three distinct specialist reviews", () => {
    expect(MAX_SPECIALIST_DELEGATIONS_PER_TASK).toBe(3);
    expect(getSpecialistDelegationError("luau_engineer", [])).toBeNull();
    expect(getSpecialistDelegationError("luau_engineer", ["luau_engineer"])).toMatch(/already reviewed/i);
    expect(getSpecialistDelegationError(
      "qa_engineer",
      ["luau_engineer", "gameplay_designer", "security_reviewer"],
    )).toMatch(/limit of 3/i);
  });

  it("is honest that the research specialist cannot browse externally", () => {
    const researcher = getSpecialistDefinition("research_agent");
    expect(researcher.systemPrompt).toContain("no external web-browsing tool");
    expect(researcher.systemPrompt).toContain("Do not pretend to have browsed the web");
  });

  it("keeps each specialist's review focus distinct", () => {
    const security = getSpecialistDefinition("security_reviewer").systemPrompt;
    const gameplay = getSpecialistDefinition("gameplay_designer").systemPrompt;
    expect(security).toContain("RemoteEvent");
    expect(gameplay).toContain("progression");
    expect(security).not.toContain("difficulty curves");
  });
});

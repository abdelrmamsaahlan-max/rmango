import "server-only";

import type { ModelProfile } from "@/lib/ai/models";

export type AgentWorkflowMode = "focused" | "coordinated";

export type AgentWorkflowContext = {
  mode: AgentWorkflowMode;
  maxSteps: number;
  domains: string[];
  systemText: string;
};

const DOMAIN_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: "luau", pattern: /\b(luau|lua|script|module.?script|server.?script|local.?script|remote.?event|remote.?function|debug|refactor)\b/i },
  { id: "gameplay", pattern: /\b(gameplay|game loop|round system|quest|tycoon|simulator|progression|inventory|combat|npc|customer|player system)\b/i },
  { id: "world", pattern: /\b(map|terrain|workspace|part|building|environment|world|level|scene|spawn|landscape)\b/i },
  { id: "ui", pattern: /\b(ui|ux|interface|screen.?gui|hud|menu|button|shop|inventory screen|responsive layout)\b/i },
  { id: "assets", pattern: /\b(3d|mesh|model|texture|material|asset|prop|creator store|avatar)\b/i },
  { id: "animation", pattern: /\b(animation|animate|animator|motor6d|keyframe|rig|r6|r15|walk cycle|emote)\b/i },
  { id: "audio", pattern: /\b(audio|sound|sfx|music|voice|footstep|spatial audio)\b/i },
  { id: "data-security", pattern: /\b(datastore|data store|saving|persistence|remote validation|security|exploit|rate.?limit|purchase|currency|leaderboard)\b/i },
  { id: "testing", pattern: /\b(test|playtest|regression|output|console|diagnostic|performance|profiling|optimi[sz]e)\b/i },
];

const BUILD_INTENT = /\b(build|create|make|implement|add|generate|design|rebuild|refactor|fix|debug|upgrade|automate|wire up|set up)\b/i;
const LARGE_SCOPE = /\b(complete|full|entire|end[- ]to[- ]end|from scratch|whole game|production[- ]ready|multiple systems|all systems)\b/i;

export function buildAgentWorkflowContext(input: {
  profile: ModelProfile;
  prompt: string;
}): AgentWorkflowContext {
  const prompt = input.prompt.slice(-24_000);
  const domains = DOMAIN_PATTERNS
    .filter(item => item.pattern.test(prompt))
    .map(item => item.id);

  const isBuildRequest = BUILD_INTENT.test(prompt);
  const coordinated =
    input.profile === "agent" ||
    (isBuildRequest && domains.length >= 2) ||
    (isBuildRequest && LARGE_SCOPE.test(prompt));

  if (!coordinated) {
    return {
      mode: "focused",
      maxSteps: 8,
      domains,
      systemText: "",
    };
  }

  return {
    mode: "coordinated",
    maxSteps: 12,
    domains,
    systemText: [
      "RMANGO COORDINATED WORKFLOW — deterministic policy, no extra planner-model call.",
      "You are the coordinator. Use the selected specialist skill packs as role-specific expertise; they are instruction modules, not separately trained models.",
      "1. INSPECT: when Studio tools are available, discover the active place and inspect only the relevant Explorer branches and scripts. Read the original script and its callers before replacing code. For a cloud project, inspect owner-authorized files through the project tools.",
      "2. PLAN: produce a compact ordered plan with dependencies and observable acceptance criteria before the first mutation. Split unrelated systems into independently verifiable work packages.",
      "3. DELEGATE: use the official subagent tool only when its live schema is available and parallel read-only exploration or a playtest adds value. Prefer at most one explore handoff and one playtest handoff. Do not recursively spawn agents, and do not ask multiple agents to mutate the same place or scripts concurrently.",
      "4. IMPLEMENT: use the actual registered Studio tool schemas; never invent tool names, arguments, asset IDs, API members, or successful outcomes. Apply changes in small dependency-ordered batches. Keep writes sequential. Mutating tools must pass through the desktop approval gate. Preserve unrelated instances and existing systems.",
      "5. VERIFY: re-read changed scripts and inspect affected instances after each batch. When Studio supports it, run a playtest, inspect server/client Output, and capture the scene or playtest state. Fix concrete failures and repeat the relevant check. A successful tool call is not proof that gameplay behavior is correct.",
      "6. REPORT: distinguish implemented, tool-confirmed, playtested, and still-unverified work. Include exact blockers. Stop after two unsuccessful repair cycles and explain the remaining failure instead of looping.",
      "For an offline Studio session, do not claim real-time edits. Prepare the code or proposal and state that Studio execution awaits reconnection.",
      "Use no customer-supplied provider API keys. Model inference is performed only by the configured RMango cloud gateway; never ask the user to paste provider credentials into chat or the desktop app.",
      "Do not publish an experience, overwrite unrelated content, delete large hierarchies, or perform irreversible actions without explicit approval."
    ].join("\n"),
  };
}

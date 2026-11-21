import "server-only";

import type { ModelProfile } from "@/lib/ai/models";

export type AgentWorkflowMode = "focused" | "coordinated";
export type AgentTaskIntent = "debug" | "build" | "audit" | "design" | "explain" | "general";

export type AgentWorkflowContext = {
  mode: AgentWorkflowMode;
  intent: AgentTaskIntent;
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

const BUILD_INTENT = /\b(build|create|make|implement|add|generate|rebuild|refactor|fix|debug|upgrade|improve|automate|wire up|set up)\b/i;
const LARGE_SCOPE = /\b(complete|full|entire|end[- ]to[- ]end|from scratch|whole game|production[- ]ready|multiple systems|all systems|everything)\b/i;
const DEBUG_INTENT = /\b(not working|doesn.t work|broken|bug|error|exception|crash|fails?|failing|debug|fix this|fix the)\b/i;
const AUDIT_INTENT = /\b(audit|review|inspect|assess|check|evaluate|find problems|what needs improvement)\b/i;
const DESIGN_INTENT = /\b(brainstorm|concept|game design|design a|plan a|ideas for|player experience|visual direction)\b/i;
const EXPLAIN_INTENT = /^(\s*)(what is|what are|how does|how do|why does|why do|explain|teach me|help me understand)\b/i;

function classifyIntent(prompt: string): AgentTaskIntent {
  if (DEBUG_INTENT.test(prompt)) return "debug";
  if (AUDIT_INTENT.test(prompt)) return "audit";
  if (DESIGN_INTENT.test(prompt) && !BUILD_INTENT.test(prompt)) return "design";
  if (EXPLAIN_INTENT.test(prompt.trim())) return "explain";
  if (BUILD_INTENT.test(prompt)) return "build";
  return "general";
}

function buildTaskMethod(intent: AgentTaskIntent): string {
  const methods: Record<AgentTaskIntent, string> = {
    debug: [
      "DEBUG METHOD: First establish the actual symptom and expected behavior. Inspect the relevant source, callers, state transitions and available logs. Trace the failure to a concrete cause before editing. Make the smallest safe fix, then run the closest reproducible regression check. If the cause or test cannot be confirmed, say exactly what remains unknown.",
    ].join(" "),
    build: [
      "IMPLEMENTATION METHOD: Convert the request into a short acceptance checklist. Inspect the existing architecture and reuse working systems. Identify dependencies and server/client ownership, implement in dependency order, and verify each important behavior. Do not stop after returning a plan when tools allow implementation.",
    ].join(" "),
    audit: [
      "AUDIT METHOD: Inspect evidence before judging. Group findings by severity and user impact, cite the file/instance/tool evidence available, distinguish confirmed defects from risks, and give prioritized fixes. Do not silently mutate the project during a review-only request.",
    ].join(" "),
    design: [
      "DESIGN METHOD: Clarify the intended player experience, constraints, audience and art direction from the available context. Produce a coherent concept with core loop, player journey, progression, UI/asset needs, technical dependencies and testable acceptance criteria. Separate recommendations from implemented work.",
    ].join(" "),
    explain: [
      "EXPLANATION METHOD: Answer the precise question first, use a small example when useful, and explain Roblox-specific caveats accurately. Do not invoke tools or produce a large implementation plan unless evidence or the user's request requires it.",
    ].join(" "),
    general: [
      "GENERAL METHOD: Infer whether the user needs an explanation, diagnosis, design or implementation. Be direct, use relevant project context, and avoid unnecessary ceremony. When uncertainty changes the answer materially, state it or ask one focused question.",
    ].join(" "),
  };
  return methods[intent];
}

export function buildAgentWorkflowContext(input: {
  profile: ModelProfile;
  prompt: string;
}): AgentWorkflowContext {
  const prompt = input.prompt.slice(-24_000);
  const domains = DOMAIN_PATTERNS
    .filter(item => item.pattern.test(prompt))
    .map(item => item.id);
  const intent = classifyIntent(prompt);
  const isBuildRequest = intent === "build" || intent === "debug";
  const coordinated =
    input.profile === "agent" ||
    (isBuildRequest && domains.length >= 2) ||
    (isBuildRequest && LARGE_SCOPE.test(prompt));

  const method = buildTaskMethod(intent);
  if (!coordinated) {
    return {
      mode: "focused",
      intent,
      maxSteps: 8,
      domains,
      systemText: [
        "RMANGO FOCUSED WORKFLOW — use the method that matches the user's actual intent.",
        method,
        "Use the available tools only when they materially improve accuracy or complete requested work. Keep changes bounded. Never expose private chain-of-thought; show concise conclusions and evidence.",
      ].join("\n"),
    };
  }

  return {
    mode: "coordinated",
    intent,
    maxSteps: 14,
    domains,
    systemText: [
      "RMANGO COORDINATED WORKFLOW — deterministic task orchestration with a bounded tool loop.",
      "You are the lead coordinator. Selected specialist skills are focused instruction packs, not independently trained models or separate agents.",
      method,
      "1. INSPECT: discover the active place or owner-authorized cloud project. Read the relevant Explorer branches, scripts, callers, project memories and dependency references. Do not re-read unrelated files.",
      "2. ACCEPTANCE: turn the request into observable acceptance criteria. Preserve explicit constraints and the current project's decisions. Identify what can be verified in the available environment.",
      "3. PLAN: order work by dependency and risk. Split unrelated work into bounded packages, but keep coupled changes together. Do not spend a model/tool step producing a plan that you then fail to execute.",
      "4. IMPLEMENT: use only actual registered Studio schemas and owner-authorized project tools. Read before replacing, keep writes sequential, avoid duplicate systems, and preserve unrelated content. Mutations must pass through the user's approval gate.",
      "5. REVIEW: re-read changed scripts and inspect affected instances. Check Luau syntax, API contracts, nil paths, lifecycle cleanup, event duplication, server/client authority, race conditions and failure recovery where relevant.",
      "6. VERIFY: run the closest available playtest, console inspection or focused test. Fix concrete failures and repeat the relevant check. Stop after two unsuccessful repair cycles and report the blocker.",
      "7. REPORT: provide a compact change summary mapped to the acceptance checklist. Distinguish implemented, tool-confirmed, playtested and unverified work. Name exact files/instances and failures when known; never inflate completion status.",
      "DELEGATION: use a specialist/subagent only when an actual registered tool/schema exists and a separate read-only review or test adds value. Never pretend a specialist ran. Do not allow parallel agents to edit the same files or place.",
      "For an offline Studio session, prepare a proposal or code but clearly state that live Studio execution awaits reconnection.",
      "Do not publish an experience, delete substantial hierarchies, overwrite unrelated content or perform irreversible actions without explicit approval.",
      "Use no user-supplied model-provider credentials. Hosted inference is performed only through the configured RMango gateway.",
    ].join("\n"),
  };
}

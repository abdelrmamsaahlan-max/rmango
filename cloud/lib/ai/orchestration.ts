import "server-only";

import type { ModelProfile } from "@/lib/ai/models";

export type AgentWorkflowMode = "focused" | "coordinated";

export type AgentWorkflowContext = {
  mode: AgentWorkflowMode;
  maxSteps: number;
  domains: string[];
  systemText: string;
};

/**
 * Deterministic routing only selects relevant working guidance. It is not a
 * substitute for understanding the user's request or inspecting project data.
 */
const DOMAIN_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: "luau", pattern: /\b(luau|lua|script|module.?script|server.?script|local.?script|remote.?event|remote.?function|debug|refactor)\b/i },
  { id: "gameplay", pattern: /\b(gameplay|game loop|round system|quest|tycoon|simulator|progression|inventory|combat|npc|customer|player system)\b/i },
  { id: "world", pattern: /\b(map|terrain|workspace|part|building|environment|world|level|scene|spawn|landscape)\b/i },
  { id: "ui", pattern: /\b(ui|ux|interface|screen.?gui|hud|menu|button|shop|inventory screen|responsive layout|design system)\b/i },
  { id: "assets", pattern: /\b(3d|mesh|model|texture|material|asset|prop|creator store|avatar|blender|fbx|gltf)\b/i },
  { id: "animation", pattern: /\b(animation|animate|animator|motor6d|keyframe|rig|r6|r15|walk cycle|emote)\b/i },
  { id: "audio", pattern: /\b(audio|sound|sfx|music|voice|footstep|spatial audio)\b/i },
  { id: "data-security", pattern: /\b(datastore|data store|database|sql|saving|persistence|remote validation|security|exploit|rate.?limit|purchase|currency|leaderboard|authentication|auth|rls)\b/i },
  { id: "cloud-backend", pattern: /\b(api|endpoint|backend|frontend|server|cloud|supabase|worker|cloudflare|storage|upload|download|websocket|streaming|deployment|deploy)\b/i },
  { id: "desktop-app", pattern: /\b(electron|desktop|windows app|installer|release|auto.?updater|packaging|renderer|vite|ipc)\b/i },
  { id: "testing", pattern: /\b(test|playtest|regression|output|console|diagnostic|performance|profiling|optimi[sz]e|benchmark|ci|workflow)\b/i },
];

const BUILD_INTENT = /\b(build|create|make|implement|add|generate|design|rebuild|refactor|fix|debug|upgrade|automate|wire up|set up|improve|integrate|migrate|connect|update)\b/i;
const LARGE_SCOPE = /\b(complete|full|entire|end[- ]to[- ]end|from scratch|whole game|production[- ]ready|multiple systems|all systems|everything|from start to finish)\b/i;

export function buildAgentWorkflowContext(input: {
  profile: ModelProfile;
  prompt: string;
}): AgentWorkflowContext {
  const prompt = input.prompt.slice(-24_000);
  const domains = DOMAIN_PATTERNS
    .filter(item => item.pattern.test(prompt))
    .map(item => item.id);

  const isBuildRequest = BUILD_INTENT.test(prompt);
  const isLargeRequest = LARGE_SCOPE.test(prompt);
  const coordinated =
    input.profile === "agent" ||
    (isBuildRequest && domains.length >= 2) ||
    (isBuildRequest && isLargeRequest);

  if (!coordinated) {
    return {
      mode: "focused",
      maxSteps: input.profile === "fast" ? 4 : input.profile === "think" ? 10 : 8,
      domains,
      systemText: "",
    };
  }

  const maxSteps = input.profile === "agent"
    ? 16
    : input.profile === "fast"
      ? 8
      : input.profile === "think"
        ? 14
        : (domains.length >= 4 || isLargeRequest ? 14 : 12);

  return {
    mode: "coordinated",
    maxSteps,
    domains,
    systemText: [
      "RMANGO COORDINATED WORKFLOW — deterministic execution policy; do not spend an extra model call only to produce a plan.",
      "The selected specialist skills provide relevant instructions. They are not separate models or real subagents.",
      "Detected domains: " + (domains.length ? domains.join(", ") : "general") + ". This is only a routing hint; follow the user's actual request.",
      "1. INSPECT: establish the active project, its current state, and the tools genuinely available. Read only the relevant memories, files, scripts, and callers. Do not claim access that is not present.",
      "2. PLAN: for multi-step work, create a compact ordered plan with dependencies and observable acceptance criteria. Continue into execution instead of stopping after the plan unless approval or an external dependency blocks you.",
      "3. DELEGATE: use a subagent only when a real registered schema exists and parallel read-only exploration adds value. Do not invent subagent capabilities, recursively spawn agents, or run conflicting writes in parallel.",
      "4. IMPLEMENT: use registered tool schemas and current API evidence. Make small, coherent changes in dependency order. Keep writes sequential and route mutations through the user's approval gate. Preserve unrelated systems.",
      "5. VERIFY: re-read changed code or inspect affected instances. Run relevant typechecks, tests, or Studio playtests when available. A successful tool call is not proof that behavior works.",
      "6. RECOVER: inspect each tool error and adapt the next attempt. Do not repeat an identical failing call. Stop after two meaningful repair attempts and report the remaining blocker.",
      "7. REPORT: separate completed work, tool-confirmed results, tested behavior, and unverified work. State the exact next action if a device, approval, credential, or user action is required.",
      "Avoid repeated reads and duplicate tool calls. Batch independent read-only checks, but keep mutations sequential.",
      "If the user's PC or Roblox Studio is offline, continue with repository/cloud work that is available. Clearly label Studio actions that require reconnection.",
      "Use only the configured RMango cloud model gateway. Never request provider API keys in chat or expose secrets.",
      "Do not publish an experience, overwrite unrelated content, delete user data, or perform irreversible actions without explicit approval.",
    ].join("\n"),
  };
}

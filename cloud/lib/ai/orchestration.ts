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
 * Lightweight deterministic routing. These labels are hints, not facts:
 * the model must still read the user request and available project evidence.
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
  { id: "cloud-backend", pattern: /\b(api|endpoint|backend|frontend|server|cloud|supabase|worker|cloudflare|storage|upload|download|websocket|streaming)\b/i },
  { id: "desktop-app", pattern: /\b(electron|desktop|windows app|installer|release|auto.?updater|packaging|renderer|vite)\b/i },
  { id: "testing", pattern: /\b(test|playtest|regression|output|console|diagnostic|performance|profiling|optimi[sz]e|benchmark)\b/i },
];

const BUILD_INTENT = /\b(build|create|make|implement|add|generate|design|rebuild|refactor|fix|debug|upgrade|automate|wire up|set up|improve|integrate|migrate|connect)\b/i;
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
      maxSteps: input.profile === "fast" ? 4 : 8,
      domains,
      systemText: "",
    };
  }

  const maxSteps = input.profile === "agent"
    ? 16
    : input.profile === "fast"
      ? 8
      : (domains.length >= 4 || isLargeRequest ? 14 : 12);

  return {
    mode: "coordinated",
    maxSteps,
    domains,
    systemText: [
      "RMANGO COORDINATED WORKFLOW — execution policy; do not spend a separate model call just to plan.",
      "You are responsible for coordinating the task. The skill packs provide relevant specialist instructions; they are not separate models or real subagents.",
      "Detected task domains: " + (domains.length ? domains.join(", ") : "general") + ". Treat this classification as a hint and correct it using the user's actual request.",
      "1. INSPECT: establish the active project, current state and relevant tools. Read only the necessary project memories, files, scripts and callers. Do not assume a default hierarchy or claim access that is not present.",
      "2. PLAN: for multi-step work, create a compact ordered plan with dependencies and observable acceptance criteria. Do not stop after presenting the plan; execute it unless a missing approval, device or external dependency blocks you.",
      "3. DELEGATE: use a subagent only if a real registered schema is available and parallel read-only exploration adds value. Never invent subagent capabilities, recursively spawn agents or run conflicting writes in parallel.",
      "4. IMPLEMENT: use registered tool schemas and current API evidence. Make the smallest coherent changes in dependency order. Keep mutating actions sequential and behind the user's approval gate. Preserve unrelated systems.",
      "5. VERIFY: re-read changed code or inspect affected instances. Run focused typechecks, tests or Studio playtests when available. A successful tool call is not proof that the resulting behavior works.",
      "6. RECOVER: when a tool fails, inspect the returned error and adapt the next attempt. Do not repeat an identical failing call. Limit retries to two meaningful repair attempts before reporting the blocker.",
      "7. REPORT: separate completed, tool-confirmed, tested and unverified work. Include the exact remaining blocker and the next action needed.",
      "Avoid unnecessary rereads and duplicate tool calls. Batch independent read-only inspections, but keep writes sequential.",
      "If Studio or the user's device is offline, continue with repository/cloud work that is available; clearly label any Studio action that still requires reconnection.",
      "Use only the configured RMango cloud model gateway. Never request a provider key in chat or expose secrets.",
      "Do not publish an experience, overwrite unrelated content, delete user data or perform irreversible actions without explicit approval.",
    ].join("\n"),
  };
}

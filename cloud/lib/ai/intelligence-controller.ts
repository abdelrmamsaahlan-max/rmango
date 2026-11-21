export type HostedModelProfile = "fast" | "developer" | "think" | "vision" | "agent";
export type RequestedModelProfile = HostedModelProfile | "auto";
export type IntelligenceLevel = "instant" | "focused" | "advanced" | "deep" | "research";
export type IntelligenceLevelSetting = IntelligenceLevel | "auto";
export type IntelligenceIntent =
  | "question"
  | "planning"
  | "debugging"
  | "implementation"
  | "code_review"
  | "project_navigation"
  | "research";

export type IntelligenceControllerInput = {
  prompt: string;
  requestedProfile: RequestedModelProfile;
  levelSetting?: IntelligenceLevelSetting;
  hasImage?: boolean;
  hasDocument?: boolean;
  hasSelectedProject?: boolean;
  projectFileCount?: number;
  conversationMessageCount?: number;
};

export type IntelligenceBudget = {
  maxSteps: number;
  maxOutputTokens: number;
  maxProjectFiles: number;
  maxMemoryNotes: number;
  maxMemoryCharacters: number;
  maxHypotheses: number;
  minimumEvidenceBeforeEdits: number;
  verificationDepth: "none" | "basic" | "focused" | "strong" | "independent";
  compareApproaches: boolean;
  useProjectTools: boolean;
  useStudioTools: boolean;
};

export type IntelligencePlan = {
  intent: IntelligenceIntent;
  level: IntelligenceLevel;
  complexityScore: number;
  modelProfile: HostedModelProfile;
  profileWasAutoSelected: boolean;
  reasons: string[];
  budget: IntelligenceBudget;
};

const INTENT_PATTERNS: Array<{ intent: IntelligenceIntent; pattern: RegExp }> = [
  { intent: "debugging", pattern: /\b(debug|diagnos\w*|troubleshoot|root cause|stack trace|regression|not working|doesn't work|doesnt work|broken|crash|error|bug)\b/i },
  { intent: "planning", pattern: /\b(plan|roadmap|break down|implementation plan|before coding|design an architecture|architecture proposal)\b/i },
  { intent: "code_review", pattern: /\b(code review|review (?:my|the|this) code|audit|security review|performance review|inspect (?:the )?changes)\b/i },
  { intent: "project_navigation", pattern: /\b(where is|find (?:the|a)|locate|which files|what file|who calls|which scripts|depend(?:s|encies|ents) on|used by)\b/i },
  { intent: "research", pattern: /\b(research|latest|current documentation|compare (?:the|these)|benchmark|evaluate (?:the|these)|official docs|look up|investigate unfamiliar)\b/i },
  { intent: "implementation", pattern: /\b(implement|build|create|make|write|code|modify|edit|add|fix|refactor|upgrade|generate|wire up|set up|automate)\b/i },
];

const DOMAIN_PATTERNS: RegExp[] = [
  /\b(luau|lua|script|module.?script|remote.?event|remote.?function)\b/i,
  /\b(gameplay|game loop|quest|tycoon|simulator|progression|inventory|npc|economy|round system)\b/i,
  /\b(server|client|replication|network|datastore|persistence|multiplayer|security|permissions)\b/i,
  /\b(ui|ux|interface|screengui|hud|menu|responsive layout|accessibility)\b/i,
  /\b(map|terrain|workspace|3d|mesh|model|texture|asset|animation|rig|physics)\b/i,
  /\b(database|api|authentication|billing|provider|deployment|architecture|infrastructure)\b/i,
  /\b(test|playtest|regression|output|console|diagnostic|performance|profiling|benchmark)\b/i,
];

const COMPLEX_SCOPE = /\b(entire|whole project|whole game|end[- ]to[- ]end|production[- ]ready|multiple systems|all systems|comprehensive|from scratch|large[- ]scale|architecture|migrate|migration|redesign)\b/i;
const STRONG_RESEARCH = /\b(research|latest|current documentation|official docs|benchmark|compare (?:models|providers|architectures)|literature review)\b/i;
const IMPLEMENTATION = /\b(implement|build|create|make|write|code|modify|edit|add|fix|refactor|upgrade|generate|wire up|set up|automate)\b/i;

const BUDGETS: Record<IntelligenceLevel, Omit<IntelligenceBudget, "useProjectTools" | "useStudioTools">> = {
  instant: {
    maxSteps: 2,
    maxOutputTokens: 1_024,
    maxProjectFiles: 0,
    maxMemoryNotes: 0,
    maxMemoryCharacters: 0,
    maxHypotheses: 0,
    minimumEvidenceBeforeEdits: 0,
    verificationDepth: "none",
    compareApproaches: false,
  },
  focused: {
    maxSteps: 5,
    maxOutputTokens: 2_048,
    maxProjectFiles: 12,
    maxMemoryNotes: 6,
    maxMemoryCharacters: 5_000,
    maxHypotheses: 2,
    minimumEvidenceBeforeEdits: 1,
    verificationDepth: "basic",
    compareApproaches: false,
  },
  advanced: {
    maxSteps: 9,
    maxOutputTokens: 4_096,
    maxProjectFiles: 28,
    maxMemoryNotes: 12,
    maxMemoryCharacters: 10_000,
    maxHypotheses: 3,
    minimumEvidenceBeforeEdits: 2,
    verificationDepth: "focused",
    compareApproaches: true,
  },
  deep: {
    maxSteps: 14,
    maxOutputTokens: 6_144,
    maxProjectFiles: 56,
    maxMemoryNotes: 20,
    maxMemoryCharacters: 16_000,
    maxHypotheses: 4,
    minimumEvidenceBeforeEdits: 2,
    verificationDepth: "strong",
    compareApproaches: true,
  },
  research: {
    maxSteps: 18,
    maxOutputTokens: 8_192,
    maxProjectFiles: 44,
    maxMemoryNotes: 16,
    maxMemoryCharacters: 12_000,
    maxHypotheses: 3,
    minimumEvidenceBeforeEdits: 2,
    verificationDepth: "independent",
    compareApproaches: true,
  },
};

function detectIntent(prompt: string): IntelligenceIntent {
  for (const item of INTENT_PATTERNS) {
    if (item.pattern.test(prompt)) {
      if (item.intent === "planning" && IMPLEMENTATION.test(prompt)) return "implementation";
      return item.intent;
    }
  }
  return "question";
}

function chooseAutomaticLevel(input: {
  prompt: string;
  intent: IntelligenceIntent;
  hasImage: boolean;
  hasDocument: boolean;
  hasSelectedProject: boolean;
  projectFileCount: number;
  conversationMessageCount: number;
}): { level: IntelligenceLevel; score: number; reasons: string[] } {
  const { prompt, intent } = input;
  const domains = DOMAIN_PATTERNS.filter(pattern => pattern.test(prompt)).length;
  const constraints = (prompt.match(/(?:^|\n)\s*(?:[-*•]|\d+[.)])\s+/g) || []).length;
  const isLarge = COMPLEX_SCOPE.test(prompt);
  const isResearch = STRONG_RESEARCH.test(prompt);
  let score = intent === "question" ? 0 : intent === "planning" ? 2 : intent === "project_navigation" ? 2 : 3;
  const reasons: string[] = ["intent:" + intent];
  if (domains >= 2) { score += Math.min(2, domains - 1); reasons.push("multiple_engineering_domains:" + domains); }
  if (domains >= 4) { score += 1; reasons.push("cross_system_scope"); }
  if (isLarge) { score += 3; reasons.push("large_scope_language"); }
  if (constraints >= 3) { score += 2; reasons.push("many_explicit_requirements:" + constraints); }
  if (constraints === 2) { score += 1; reasons.push("multiple_explicit_requirements"); }
  if (input.hasImage) { score += 1; reasons.push("visual_evidence_attached"); }
  if (input.hasDocument) { score += 1; reasons.push("document_evidence_attached"); }
  if (input.hasSelectedProject && intent !== "question") { score += 1; reasons.push("project_context_available"); }
  if (input.projectFileCount > 100 && intent !== "question") { score += 1; reasons.push("large_project_manifest"); }
  if (input.conversationMessageCount > 12) { score += 1; reasons.push("long_conversation"); }
  if (prompt.length > 2_000) { score += 1; reasons.push("long_requirement_text"); }
  if (isResearch) { score += 3; reasons.push("research_or_freshness_required"); }

  let level: IntelligenceLevel;
  if (isResearch) level = "research";
  else if (score >= 8) level = "deep";
  else if (score >= 5) level = "advanced";
  else if (score >= 2) level = "focused";
  else level = "instant";

  if (intent === "debugging" && level === "instant") level = "focused";
  if (intent === "implementation" && level === "instant") level = "focused";
  return { level, score, reasons };
}

function automaticProfile(input: {
  intent: IntelligenceIntent;
  level: IntelligenceLevel;
  hasImage: boolean;
  hasSelectedProject: boolean;
}): HostedModelProfile {
  if (input.hasImage) return "vision";
  if (input.intent === "question" || input.level === "instant") return "fast";
  if (input.intent === "research" && !input.hasSelectedProject) return "think";
  if (input.level === "deep" || input.level === "research" || input.intent === "debugging" || input.intent === "implementation") {
    return "agent";
  }
  if (input.intent === "planning" && !input.hasSelectedProject) return "think";
  return "developer";
}

export function createIntelligencePlan(input: IntelligenceControllerInput): IntelligencePlan {
  const prompt = String(input.prompt || "").slice(-24_000);
  const hasImage = Boolean(input.hasImage);
  const hasDocument = Boolean(input.hasDocument);
  const hasSelectedProject = Boolean(input.hasSelectedProject);
  const projectFileCount = Math.max(0, Math.floor(input.projectFileCount || 0));
  const conversationMessageCount = Math.max(0, Math.floor(input.conversationMessageCount || 0));
  const intent = detectIntent(prompt);
  const automatic = chooseAutomaticLevel({
    prompt, intent, hasImage, hasDocument, hasSelectedProject, projectFileCount, conversationMessageCount,
  });
  const level = input.levelSetting && input.levelSetting !== "auto"
    ? input.levelSetting
    : automatic.level;
  const profileWasAutoSelected = input.requestedProfile === "auto";
  const modelProfile = profileWasAutoSelected
    ? automaticProfile({ intent, level, hasImage, hasSelectedProject })
    : input.requestedProfile;

  const toolIntent = intent !== "question" && level !== "instant";
  const useProjectTools = hasSelectedProject && toolIntent;
  const useStudioTools = toolIntent && /\b(studio|playtest|output window|datamodel|workspace|script|roblox game|place file)\b/i.test(prompt);
  const baseBudget = BUDGETS[level];

  return {
    intent,
    level,
    complexityScore: automatic.score,
    modelProfile,
    profileWasAutoSelected,
    reasons: automatic.reasons,
    budget: {
      ...baseBudget,
      useProjectTools,
      useStudioTools,
    },
  };
}

export function getIntelligenceLevelLabel(level: IntelligenceLevel): string {
  return ({
    instant: "Instant",
    focused: "Focused",
    advanced: "Advanced",
    deep: "Deep Engineering",
    research: "Research & Verification",
  })[level];
}

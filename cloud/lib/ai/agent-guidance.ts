import { readFileSync } from "node:fs";
import { join } from "node:path";

const AGENT_GUIDANCE_DIRECTORY = join(process.cwd(), "lib", "ai", "agent");

function readRequiredGuidanceFile(fileName: string): string {
  try {
    return readFileSync(join(AGENT_GUIDANCE_DIRECTORY, fileName), "utf8").trim();
  } catch (error) {
    const detail = error instanceof Error ? error.message : "unknown file error";
    throw new Error("[RMango] Required agent guidance file could not be loaded (" + fileName + "): " + detail);
  }
}

function splitSkillDocument(source: string) {
  const match = source.match(/^---\s*\r?\n([\s\S]*?)\r?\n---\s*\r?\n/);
  if (!match) {
    throw new Error("[RMango] Core SKILL.md is missing its Agent Skills YAML frontmatter.");
  }

  const frontmatter = match[1];
  const body = source.slice(match[0].length).trim();
  const readScalar = (key: string) => {
    const value = frontmatter.match(new RegExp("^" + key + ":\\s*(.+)$", "m"))?.[1]?.trim();
    return value?.replace(/^["']|["']$/g, "") ?? "";
  };
  const name = readScalar("name");
  const description = readScalar("description");

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || description.length < 40 || !body) {
    throw new Error("[RMango] Core SKILL.md has invalid name, description, or instruction body.");
  }

  const version = body.match(/^\*\*Version:\*\*\s*([0-9]+(?:\.[0-9]+){1,2})/m)?.[1] ?? "unversioned";
  return { name, description, version, body };
}

function readVersion(source: string, fallback: string) {
  return source.match(/^\*\*Version:\*\*\s*([0-9]+(?:\.[0-9]+){1,2})/m)?.[1] ?? fallback;
}

const SOUL = readRequiredGuidanceFile("SOUL.md");
const CORE_SKILL_SOURCE = readRequiredGuidanceFile("SKILL.md");
const CORE_SKILL = splitSkillDocument(CORE_SKILL_SOURCE);

export type AgentGuidanceMetadata = {
  soulVersion: string;
  coreSkillName: string;
  coreSkillVersion: string;
  coreSkillDescription: string;
};

export type RuntimeCapabilityInput = {
  intent: string;
  level: string;
  modelProfile: string;
  hasSelectedProject: boolean;
  registeredProjectToolNames: string[];
  activeProjectToolNames: string[];
  registeredStudioToolNames: string[];
  activeStudioToolNames: string[];
  debugHypothesisToolActive: boolean;
};

export type RuntimeCapabilityMetadata = {
  intent: string;
  level: string;
  modelProfile: string;
  hasSelectedProject: boolean;
  registeredProjectToolNames: string[];
  activeProjectToolNames: string[];
  registeredStudioToolNames: string[];
  activeStudioToolNames: string[];
  debugHypothesisToolActive: boolean;
  webSearchAvailable: false;
  independentReviewerAvailable: false;
  specialistDelegationAvailable: false;
  generalLocalFilesystemAvailable: false;
};

export function buildAgentGuidanceContext() {
  const metadata: AgentGuidanceMetadata = {
    soulVersion: readVersion(SOUL, "unversioned"),
    coreSkillName: CORE_SKILL.name,
    coreSkillVersion: CORE_SKILL.version,
    coreSkillDescription: CORE_SKILL.description,
  };

  return {
    metadata,
    systemText: [
      "RMANGO SOUL — canonical identity and operating constitution (v" + metadata.soulVersion + ").",
      SOUL,
      "RMANGO CORE SKILL — " + CORE_SKILL.name + " (v" + CORE_SKILL.version + ").",
      "Skill description: " + CORE_SKILL.description,
      CORE_SKILL.body,
    ].join("\n\n"),
  };
}

function sanitizeToolNames(names: string[]) {
  return [...new Set(names)]
    .filter(name => /^[a-zA-Z0-9_.:-]{1,80}$/.test(name))
    .sort()
    .slice(0, 60);
}

/**
 * Describes the capabilities exposed to the model for this exact chat request.
 * This is deliberately conservative: static product limitations remain false
 * until the route actually configures a corresponding tool or agent runtime.
 */
export function buildRuntimeCapabilityContext(input: RuntimeCapabilityInput) {
  const metadata: RuntimeCapabilityMetadata = {
    intent: input.intent,
    level: input.level,
    modelProfile: input.modelProfile,
    hasSelectedProject: input.hasSelectedProject,
    registeredProjectToolNames: sanitizeToolNames(input.registeredProjectToolNames),
    activeProjectToolNames: sanitizeToolNames(input.activeProjectToolNames),
    registeredStudioToolNames: sanitizeToolNames(input.registeredStudioToolNames),
    activeStudioToolNames: sanitizeToolNames(input.activeStudioToolNames),
    debugHypothesisToolActive: input.debugHypothesisToolActive,
    webSearchAvailable: false,
    independentReviewerAvailable: false,
    specialistDelegationAvailable: false,
    generalLocalFilesystemAvailable: false,
  };

  const projectLine = metadata.activeProjectToolNames.length
    ? metadata.activeProjectToolNames.join(", ")
    : "none enabled";
  const studioRegisteredLine = metadata.registeredStudioToolNames.length
    ? metadata.registeredStudioToolNames.join(", ")
    : "none registered";
  const studioActiveLine = metadata.activeStudioToolNames.length
    ? metadata.activeStudioToolNames.join(", ")
    : "none enabled for this request";

  const systemText = [
    "RMANGO LIVE CAPABILITY SNAPSHOT — generated from the server's actual tool registry for this request. This block is authoritative about available capabilities; do not infer additional tools.",
    "Task route: intent=" + metadata.intent + "; intelligence level=" + metadata.level + "; model profile=" + metadata.modelProfile + ".",
    "Selected cloud project: " + (metadata.hasSelectedProject ? "yes (ownership is checked by the server)" : "no") + ".",
    "Cloud project tools enabled now: " + projectLine + ". Registered project tools before task gating: " +
      (metadata.registeredProjectToolNames.join(", ") || "none") + ".",
    "Studio tools registered for this session: " + studioRegisteredLine + ". Studio tools enabled for this request: " + studioActiveLine + ". A registered tool is not permission to bypass its approval gate.",
    "Task-local debugging hypothesis recorder: " + (metadata.debugHypothesisToolActive ? "available" : "not enabled") + ".",
    "Live external web/documentation search in this cloud chat route: unavailable. Do not claim current web research was performed.",
    "Independent second-model reviewer: unavailable. A self-review is not an independent review.",
    "Specialist subagent delegation: unavailable. The selected skills are instruction modules, not separate agents.",
    "General access to the creator's local desktop filesystem: unavailable. Use only the cloud-project and Studio tools listed above.",
    "Tool and permission discipline: use only the enabled tool schemas. A tool may still require explicit local or creator approval. Tool execution is not acceptance verification.",
  ].join("\n");

  return { metadata, systemText };
}

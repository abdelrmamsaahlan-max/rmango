import "server-only";
import { createAI } from "agents/models/ai-sdk";
import { getCloudflareContext } from "@opennextjs/cloudflare";

export type ModelProfile = "fast" | "developer" | "think" | "vision" | "agent";

export type ModelChoice = {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  temperature: number;
  instructions: string;
  inputModalities: string[];
  capabilities: string[];
  inputUsdPerMillionTokens: number | null;
  outputUsdPerMillionTokens: number | null;
  profile: ModelProfile;
  profileLabel: string;
};

const MODEL_ID = "@cf/zai-org/glm-4.7-flash";
const MODEL_NAME = "GLM-4.7-Flash";
const CONTEXT_WINDOW = 131_072;
const INPUT_USD_PER_MILLION = 0.0605;
const OUTPUT_USD_PER_MILLION = 0.40;

const PROFILE_LABELS: Record<ModelProfile, string> = {
  fast: "Rmango Fast",
  developer: "Rmango Developer",
  think: "Rmango Think",
  vision: "Rmango Vision",
  agent: "Rmango Agent",
};

const PROFILE_DESCRIPTIONS: Record<Exclude<ModelProfile, "vision">, string> = {
  fast: "GLM-4.7-Flash with a concise, low-latency preset for quick development questions.",
  developer: "GLM-4.7-Flash tuned for Roblox Luau, debugging, architecture and code changes.",
  think: "GLM-4.7-Flash with a deliberate analysis and review preset for complex decisions.",
  agent: "GLM-4.7-Flash with execution-focused orchestration for multi-step project and Roblox Studio tasks.",
};

/**
 * Profiles share one hosted model, but they are distinct request policies:
 * each has its own response budget, sampling setting, and task instructions.
 * This avoids pretending that profile names select separate model weights.
 */
const PROFILE_SETTINGS: Record<Exclude<ModelProfile, "vision">, {
  maxOutputTokens: number;
  temperature: number;
  instructions: string;
}> = {
  fast: {
    maxOutputTokens: 1536,
    temperature: 0.2,
    instructions: [
      "ACTIVE PROFILE: FAST.",
      "Prioritize a correct, direct answer with the smallest useful amount of explanation.",
      "For simple questions, answer immediately; do not create a plan or call tools unless a tool is needed to answer accurately.",
      "For a small code fix, inspect the relevant source, make the narrow change, and run the most relevant available check.",
      "Do not sacrifice correctness, safety, or factual grounding for speed. State uncertainty instead of guessing.",
    ].join("\n"),
  },
  developer: {
    maxOutputTokens: 3072,
    temperature: 0.15,
    instructions: [
      "ACTIVE PROFILE: DEVELOPER.",
      "Work as a careful Roblox software engineer. Establish the current architecture and constraints before recommending changes.",
      "For code tasks, inspect the relevant entry points, callers, data contracts, and server/client boundaries before editing.",
      "Prefer typed, maintainable, minimal-diff implementations. Explain important trade-offs and include focused verification.",
      "Do not output a full replacement file when a smaller patch is safer. Do not claim code was tested unless a test actually ran.",
    ].join("\n"),
  },
  think: {
    maxOutputTokens: 4096,
    temperature: 0.1,
    instructions: [
      "ACTIVE PROFILE: THINK.",
      "Use a deliberate problem-solving process: define the goal, constraints, known evidence, assumptions, alternatives, edge cases, and a way to verify the conclusion.",
      "Check whether the apparent problem is a symptom of a deeper architectural or data-flow issue before proposing a fix.",
      "For consequential recommendations, compare the strongest practical alternatives and state why the selected option is preferable.",
      "Keep private reasoning private. Present the conclusion, key evidence, material assumptions, and concise rationale rather than hidden chain-of-thought.",
      "Do not overcomplicate simple requests or invent certainty where evidence is missing.",
    ].join("\n"),
  },
  agent: {
    maxOutputTokens: 4096,
    temperature: 0.15,
    instructions: [
      "ACTIVE PROFILE: AGENT.",
      "You are expected to make concrete progress with the tools actually available, not merely describe a plan.",
      "First inspect the current project state and the relevant connected tools. Produce a compact plan only when the task spans multiple dependent steps.",
      "Execute work in dependency order. Use read-only tools to establish facts, request approval for mutations, and verify each important result before depending on it.",
      "Recover intelligently from tool errors: inspect the returned error, adjust the approach, and avoid repeating the same failed call unchanged.",
      "Continue through implementation and verification while the request and execution budget allow. Never report an unperformed action as complete.",
      "At the end, separate completed work, verified work, and blockers that require the user's device, credentials, approval, or external action.",
    ].join("\n"),
  },
};

type WorkersAiBinding = NonNullable<Parameters<typeof createAI>[0]["binding"]>;

function getWorkersAiBinding(): WorkersAiBinding | undefined {
  const context = getCloudflareContext();
  const environment = context.env as unknown as { AI?: WorkersAiBinding };
  return environment.AI;
}

export function isWorkersAiConfigured(): boolean {
  try {
    return Boolean(getWorkersAiBinding());
  } catch {
    return false;
  }
}

export function getWorkersAiModel(modelId: string) {
  if (modelId !== MODEL_ID) {
    throw new Error("The selected Cloudflare Workers AI model is not supported by this RMango build.");
  }
  const binding = getWorkersAiBinding();
  if (!binding) {
    throw new Error("Cloudflare Workers AI is not connected. Deploy RMango Cloud to Cloudflare Workers with the AI binding enabled.");
  }
  return createAI({ binding })(MODEL_ID);
}

function normalise(profile: Exclude<ModelProfile, "vision">): ModelChoice {
  const settings = PROFILE_SETTINGS[profile];
  return {
    id: MODEL_ID,
    name: MODEL_NAME,
    description: PROFILE_DESCRIPTIONS[profile],
    contextWindow: CONTEXT_WINDOW,
    maxOutputTokens: settings.maxOutputTokens,
    temperature: settings.temperature,
    instructions: settings.instructions,
    inputModalities: ["text"],
    capabilities: ["tool-use", "reasoning"],
    inputUsdPerMillionTokens: INPUT_USD_PER_MILLION,
    outputUsdPerMillionTokens: OUTPUT_USD_PER_MILLION,
    profile,
    profileLabel: PROFILE_LABELS[profile],
  };
}

export function resolveProfile(profile: ModelProfile) {
  if (profile === "vision") {
    throw new Error("The current free Cloudflare GLM-4.7-Flash model is text-only. Remove image attachments and choose Fast, Developer, Think or Agent. Image understanding is not enabled in this zero-cost configuration.");
  }
  return {
    primary: normalise(profile),
    fallbackIds: [] as string[],
  };
}

export function getModelProfiles() {
  const profiles: Exclude<ModelProfile, "vision">[] = ["fast", "developer", "think", "agent"];
  return {
    profiles: profiles.map(normalise),
    availableModelCount: 1,
  };
}

export function isModelProfile(value: unknown): value is ModelProfile {
  return value === "fast" || value === "developer" || value === "think" || value === "vision" || value === "agent";
}

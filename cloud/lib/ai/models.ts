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
  fast: "GLM-4.7-Flash with a concise-response preset for quick development questions.",
  developer: "GLM-4.7-Flash for Roblox Luau, debugging, architecture and code changes.",
  think: "A more deliberate planning preset using the same reasoning-capable model.",
  agent: "GLM-4.7-Flash with function calling for multi-step project and Roblox Studio tasks.",
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
  return {
    id: MODEL_ID,
    name: MODEL_NAME,
    description: PROFILE_DESCRIPTIONS[profile],
    contextWindow: CONTEXT_WINDOW,
    maxOutputTokens: 4096,
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

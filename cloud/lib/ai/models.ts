import "server-only";
import { createOpenAICompatible } from "@ai-sdk/openai-compatible";
import { optionalEnv } from "@/lib/env";

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

const MODEL_ID = "qwen3-coder-30b";
const MODEL_NAME = "Qwen3 Coder 30B";
const CONTEXT_WINDOW = 98_304;

// Use the provider's published metered price for conservative spend reservations.
// Synap's free allowance is enforced upstream; these estimates also protect the
// RMango database budget if the provider/account later uses paid credits.
const INPUT_USD_PER_MILLION = 0.0675;
const OUTPUT_USD_PER_MILLION = 0.27;

const PROFILE_LABELS: Record<ModelProfile, string> = {
  fast: "Rmango Fast",
  developer: "Rmango Developer",
  think: "Rmango Think",
  vision: "Rmango Vision",
  agent: "Rmango Agent",
};

const PROFILE_DESCRIPTIONS: Record<Exclude<ModelProfile, "vision">, string> = {
  fast: "Qwen3 Coder 30B with a concise-response preset for quick development questions.",
  developer: "Qwen3 Coder 30B for Roblox Luau, debugging, architecture and code changes.",
  think: "A more deliberate task-planning preset using the same model; it is not a separate reasoning model.",
  agent: "Qwen3 Coder 30B with tool calling for multi-step project and Roblox Studio tasks.",
};

function normalise(profile: Exclude<ModelProfile, "vision">): ModelChoice {
  return {
    id: MODEL_ID,
    name: MODEL_NAME,
    description: PROFILE_DESCRIPTIONS[profile],
    contextWindow: CONTEXT_WINDOW,
    maxOutputTokens: 4096,
    inputModalities: ["text"],
    capabilities: ["tool-use"],
    inputUsdPerMillionTokens: INPUT_USD_PER_MILLION,
    outputUsdPerMillionTokens: OUTPUT_USD_PER_MILLION,
    profile,
    profileLabel: PROFILE_LABELS[profile],
  };
}

export function getSynapModel(modelId: string) {
  if (modelId !== MODEL_ID) {
    throw new Error("The selected Synap model is not supported by this RMango build.");
  }
  const apiKey = optionalEnv("SYNAP_API_KEY");
  if (!apiKey) {
    throw new Error("Synap is not configured. Add SYNAP_API_KEY as a server-only environment variable in the RMango Cloud deployment, then redeploy.");
  }

  const synap = createOpenAICompatible({
    name: "synap",
    baseURL: "https://synap402.com/v1",
    apiKey,
  });
  return synap.chatModel(MODEL_ID);
}

export function resolveProfile(profile: ModelProfile) {
  if (profile === "vision") {
    throw new Error("The current free Synap Qwen3 Coder model is text-only. Remove image attachments and choose Fast, Developer, Think or Agent. Image understanding is not available on this provider profile.");
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

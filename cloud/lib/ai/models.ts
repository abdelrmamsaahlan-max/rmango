import "server-only";
import { optionalEnv } from "@/lib/env";
import type { CloudflareLanguageModelId } from "agents/models/ai-sdk";

export type CloudflareAIModel = {
  id: CloudflareLanguageModelId;
  name: string;
  description: string;
  type: "language";
  tags: string[];
  modalities: { input: string[]; output: string[] };
  context_window: number;
  max_tokens: number;
  pricing: { input: string; output: string };
  supported_parameters: string[];
};

export type ModelProfile = "fast" | "developer" | "think" | "vision" | "agent";

export type ModelChoice = {
  id: CloudflareLanguageModelId;
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

const PROFILE_LABELS: Record<ModelProfile, string> = {
  fast: "Rmango Fast",
  developer: "Rmango Developer",
  think: "Rmango Think",
  vision: "Rmango Vision",
  agent: "Rmango Agent",
};

const PROFILE_ENV: Record<ModelProfile, string> = {
  fast: "RMANGO_MODEL_FAST",
  developer: "RMANGO_MODEL_DEVELOPER",
  think: "RMANGO_MODEL_THINK",
  vision: "RMANGO_MODEL_VISION",
  agent: "RMANGO_MODEL_AGENT",
};

const FALLBACK_ENV: Record<ModelProfile, string> = {
  fast: "RMANGO_MODEL_FALLBACKS_FAST",
  developer: "RMANGO_MODEL_FALLBACKS_DEVELOPER",
  think: "RMANGO_MODEL_FALLBACKS_THINK",
  vision: "RMANGO_MODEL_FALLBACKS_VISION",
  agent: "RMANGO_MODEL_FALLBACKS_AGENT",
};

// Prices are USD per token, based on Cloudflare's current published model pages.
const WORKERS_AI_CATALOG: CloudflareAIModel[] = [
  {
    id: "@cf/zai-org/glm-4.7-flash",
    name: "GLM-4.7-Flash",
    description: "Fast multilingual reasoning and coding model with native function calling and multi-turn tool use.",
    type: "language",
    tags: ["fast", "coding", "tool-use", "reasoning"],
    modalities: { input: ["text"], output: ["text"] },
    context_window: 131072,
    max_tokens: 4096,
    pricing: { input: "0.0000000605", output: "0.0000004" },
    supported_parameters: ["tools", "reasoning"],
  },
  {
    id: "@cf/google/gemma-4-26b-a4b-it",
    name: "Gemma 4 26B A4B",
    description: "Long-context multimodal reasoning model with function calling, tool use and vision.",
    type: "language",
    tags: ["reasoning", "vision", "tool-use"],
    modalities: { input: ["text", "image"], output: ["text"] },
    context_window: 256000,
    max_tokens: 4096,
    pricing: { input: "0.0000001", output: "0.0000003" },
    supported_parameters: ["tools", "reasoning"],
  },
];

const DEFAULT_MODEL_IDS: Record<ModelProfile, string> = {
  fast: "@cf/zai-org/glm-4.7-flash",
  developer: "@cf/zai-org/glm-4.7-flash",
  think: "@cf/google/gemma-4-26b-a4b-it",
  vision: "@cf/google/gemma-4-26b-a4b-it",
  agent: "@cf/zai-org/glm-4.7-flash",
};

function capabilityTags(model: CloudflareAIModel): string[] {
  const tags = new Set(model.tags);
  if (model.modalities.input.includes("image")) tags.add("vision");
  if (model.supported_parameters.includes("tools")) tags.add("tool-use");
  if (model.supported_parameters.includes("reasoning")) tags.add("reasoning");
  return Array.from(tags);
}

function pricePerMillion(value: string): number | null {
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric * 1_000_000 : null;
}

function normalise(model: CloudflareAIModel, profile: ModelProfile): ModelChoice {
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    contextWindow: model.context_window,
    maxOutputTokens: model.max_tokens,
    inputModalities: model.modalities.input,
    capabilities: capabilityTags(model),
    inputUsdPerMillionTokens: pricePerMillion(model.pricing.input),
    outputUsdPerMillionTokens: pricePerMillion(model.pricing.output),
    profile,
    profileLabel: PROFILE_LABELS[profile],
  };
}

function scoreCost(model: CloudflareAIModel): number {
  return Number(model.pricing.input) + Number(model.pricing.output);
}

function supports(model: CloudflareAIModel, capability: string): boolean {
  return capabilityTags(model).includes(capability);
}

function supportsProfile(model: CloudflareAIModel, profile: ModelProfile): boolean {
  const inputs = model.modalities.input;
  if (!inputs.includes("text")) return false;
  if (profile === "vision" && !inputs.includes("image")) return false;
  if (profile === "think" && !supports(model, "reasoning")) return false;
  if ((profile === "agent" || profile === "developer") && !supports(model, "tool-use")) return false;
  return true;
}

function pickCandidate(models: CloudflareAIModel[], profile: ModelProfile): CloudflareAIModel | undefined {
  let candidates = models.filter(model =>
    model.modalities.input.includes("text") && Number.isFinite(scoreCost(model))
  );

  if (profile === "vision") candidates = candidates.filter(model => model.modalities.input.includes("image"));
  else if (profile === "think") candidates = candidates.filter(model => supports(model, "reasoning"));
  else if (profile === "agent") candidates = candidates.filter(model => supports(model, "tool-use"));
  else if (profile === "developer") {
    const coders = candidates.filter(model =>
      supports(model, "tool-use") && /coder|code|coding|developer/i.test(model.name + " " + model.description)
    );
    candidates = coders.length ? coders : candidates.filter(model => supports(model, "tool-use"));
  } else if (profile === "fast") {
    const fast = candidates.filter(model => supports(model, "fast"));
    if (fast.length) candidates = fast;
  }

  candidates.sort((a, b) =>
    (profile === "think" || profile === "developer" || profile === "agent")
      ? (b.context_window - a.context_window) || (scoreCost(a) - scoreCost(b))
      : scoreCost(a) - scoreCost(b)
  );
  return candidates[0];
}

export async function getWorkersAICatalog(): Promise<CloudflareAIModel[]> {
  return WORKERS_AI_CATALOG;
}

function resolvePrimary(profile: ModelProfile, catalog: CloudflareAIModel[]): CloudflareAIModel | undefined {
  const configured = optionalEnv(PROFILE_ENV[profile]);
  const selectedId = configured || DEFAULT_MODEL_IDS[profile];
  const model = catalog.find(item => item.id === selectedId);
  if (configured && !model) {
    throw new Error("The configured " + PROFILE_LABELS[profile] + " model is not present in this Workers AI catalogue.");
  }
  return model || pickCandidate(catalog, profile);
}

export async function resolveProfile(profile: ModelProfile) {
  const catalog = await getWorkersAICatalog();
  const primary = resolvePrimary(profile, catalog);
  if (!primary || !supportsProfile(primary, profile)) {
    throw new Error(
      "No compatible Cloudflare Workers AI model is configured for " + PROFILE_LABELS[profile] + "."
    );
  }

  const noMoreExpensive = (candidate: CloudflareAIModel) =>
    Number(candidate.pricing.input) <= Number(primary.pricing.input) &&
    Number(candidate.pricing.output) <= Number(primary.pricing.output);

  const map = new Map(catalog.map(item => [item.id, item]));
  const configuredFallbacks = (optionalEnv(FALLBACK_ENV[profile]) || "")
    .split(",")
    .map(item => item.trim())
    .filter(Boolean)
    .map(id => map.get(id as CloudflareLanguageModelId))
    .filter((item): item is CloudflareAIModel => item !== undefined)
    .filter(item => item.id !== primary.id && supportsProfile(item, profile) && noMoreExpensive(item))
    .map(item => item.id);

  const automaticFallback = pickCandidate(
    catalog.filter(item =>
      item.id !== primary.id && supportsProfile(item, profile) && noMoreExpensive(item)
    ),
    profile,
  );
  const fallbackIds = configuredFallbacks.length
    ? configuredFallbacks
    : [automaticFallback?.id].filter((value): value is CloudflareLanguageModelId => value !== undefined);

  return { primary: normalise(primary, profile), fallbackIds };
}

export async function getModelProfiles() {
  const catalog = await getWorkersAICatalog();
  const profiles = (["fast", "developer", "think", "vision", "agent"] as ModelProfile[])
    .map(profile => {
      const model = resolvePrimary(profile, catalog);
      return model && supportsProfile(model, profile) ? normalise(model, profile) : null;
    })
    .filter((item): item is ModelChoice => Boolean(item));
  return { profiles, availableModelCount: catalog.length };
}

export function isModelProfile(value: unknown): value is ModelProfile {
  return value === "fast" || value === "developer" || value === "think" || value === "vision" || value === "agent";
}

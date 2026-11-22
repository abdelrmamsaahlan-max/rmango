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
  temperature: number;
  instructions: string;
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


type ProfilePolicy = {
  maxOutputTokens: number;
  temperature: number;
  instructions: string;
};

/**
 * These policies make the UI profiles behaviorally distinct even when two
 * profiles use the same underlying model. They do not pretend to be separate
 * model weights or guarantee a benchmark improvement.
 */
const PROFILE_POLICIES: Record<ModelProfile, ProfilePolicy> = {
  fast: {
    maxOutputTokens: 1536,
    temperature: 0.2,
    instructions: [
      "ACTIVE PROFILE: FAST.",
      "Answer simple questions directly and concisely. Do not create a plan or call tools unless a tool is needed for accuracy.",
      "For a small code fix, inspect the relevant source, make a narrow change, and run the most relevant available check.",
      "Never trade correctness, safety, or factual grounding for speed. State uncertainty instead of guessing.",
    ].join("\n"),
  },
  developer: {
    maxOutputTokens: 3072,
    temperature: 0.15,
    instructions: [
      "ACTIVE PROFILE: DEVELOPER.",
      "Act as a careful Roblox software engineer. Establish the current architecture and constraints before recommending changes.",
      "For code tasks, inspect relevant entry points, callers, data contracts, and server/client boundaries before editing.",
      "Prefer typed, maintainable, minimal-diff implementations. Explain important trade-offs and include focused verification.",
      "Do not output a full replacement file when a smaller patch is safer. Never claim code was tested unless a test actually ran.",
    ].join("\n"),
  },
  think: {
    maxOutputTokens: 4096,
    temperature: 0.1,
    instructions: [
      "ACTIVE PROFILE: THINK.",
      "For difficult problems, define the goal, constraints, known evidence, assumptions, alternatives, edge cases, and a verification method.",
      "Check whether the apparent problem is a symptom of a deeper architectural or data-flow issue before proposing a fix.",
      "Compare practical alternatives for consequential decisions and explain why the chosen option fits the evidence.",
      "Keep private reasoning private. Present conclusions, key evidence, material assumptions, and concise rationale rather than hidden chain-of-thought.",
      "Do not overcomplicate simple requests or invent certainty where evidence is missing.",
    ].join("\n"),
  },
  vision: {
    maxOutputTokens: 3072,
    temperature: 0.1,
    instructions: [
      "ACTIVE PROFILE: VISION.",
      "Use only visual details actually present in the supplied images and relevant conversation context.",
      "Separate direct observations from interpretations. Mention ambiguity when an image is cropped, blurry, small, or missing context.",
      "For Roblox Studio screenshots, identify visible UI, hierarchy, error text, and layout details before proposing changes.",
      "Do not claim to inspect hidden project files or unseen Studio state from a screenshot.",
    ].join("\n"),
  },
  agent: {
    maxOutputTokens: 4096,
    temperature: 0.15,
    instructions: [
      "ACTIVE PROFILE: AGENT.",
      "Make concrete progress with the tools actually available instead of only describing a plan.",
      "Inspect the current project state and relevant tool schemas. Make a compact ordered plan only when the task spans dependent steps.",
      "Execute in dependency order. Use read-only tools to establish facts, approval gates for mutations, and verification before relying on a result.",
      "When a tool fails, inspect the error, adapt the approach, and do not repeat an identical failing call unchanged.",
      "Distinguish completed work, tool-confirmed work, tested behavior, and blockers requiring the user's device or approval.",
    ].join("\n"),
  },
};

function normalise(model: CloudflareAIModel, profile: ModelProfile): ModelChoice {
  const policy = PROFILE_POLICIES[profile];
  return {
    id: model.id,
    name: model.name,
    description: model.description,
    contextWindow: model.context_window,
    maxOutputTokens: Math.min(model.max_tokens, policy.maxOutputTokens),
    temperature: policy.temperature,
    instructions: policy.instructions,
    inputModalities: model.modalities.input,
    capabilities: capabilityTags(model),
    inputUsdPerMillionTokens: pricePerMillion(model.pricing.input),
    outputUsdPerMillionTokens: pricePerMillion(model.pricing.output),
    profile,
    profileLabel: PROFILE_LABELS[profile],
  };
}

/** Public model metadata deliberately excludes internal prompt instructions and sampling policy. */
function toPublicModelChoice(model: CloudflareAIModel, profile: ModelProfile): Omit<ModelChoice, "temperature" | "instructions"> {
  const choice = normalise(model, profile);
  return {
    id: choice.id,
    name: choice.name,
    description: choice.description,
    contextWindow: choice.contextWindow,
    maxOutputTokens: choice.maxOutputTokens,
    inputModalities: choice.inputModalities,
    capabilities: choice.capabilities,
    inputUsdPerMillionTokens: choice.inputUsdPerMillionTokens,
    outputUsdPerMillionTokens: choice.outputUsdPerMillionTokens,
    profile: choice.profile,
    profileLabel: choice.profileLabel,
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
      return model && supportsProfile(model, profile) ? toPublicModelChoice(model, profile) : null;
    })
    .filter((item): item is Omit<ModelChoice, "temperature" | "instructions"> => Boolean(item));
  return { profiles, availableModelCount: catalog.length };
}

export function isModelProfile(value: unknown): value is ModelProfile {
  return value === "fast" || value === "developer" || value === "think" || value === "vision" || value === "agent";
}

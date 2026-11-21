import "server-only";
import { optionalEnv } from "@/lib/env";

export type GatewayModel = {
  id: string;
  name?: string;
  description?: string;
  type?: string;
  tags?: string[];
  modalities?: { input?: string[]; output?: string[] };
  context_window?: number;
  max_tokens?: number;
  pricing?: { input?: string; output?: string };
  supported_parameters?: string[];
};

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

function capabilityTags(model: GatewayModel): string[] {
  const tags = new Set(model.tags || []);
  const inputs = model.modalities?.input || [];
  if (inputs.includes("image")) tags.add("vision");
  if ((model.supported_parameters || []).includes("tools")) tags.add("tool-use");
  if ((model.supported_parameters || []).includes("reasoning")) tags.add("reasoning");
  return Array.from(tags);
}

function pricePerMillion(value?: string): number | null {
  if (value === undefined || value === null) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) && numeric >= 0 ? numeric * 1_000_000 : null;
}

function normalise(model: GatewayModel, profile: ModelProfile): ModelChoice {
  const tags = capabilityTags(model);
  return {
    id: model.id,
    name: model.name || model.id,
    description: model.description || "",
    contextWindow: model.context_window || 0,
    maxOutputTokens: model.max_tokens || 0,
    inputModalities: model.modalities?.input || ["text"],
    capabilities: tags,
    inputUsdPerMillionTokens: pricePerMillion(model.pricing?.input),
    outputUsdPerMillionTokens: pricePerMillion(model.pricing?.output),
    profile,
    profileLabel: PROFILE_LABELS[profile],
  };
}

let cachedCatalog: { until: number; models: GatewayModel[] } | undefined;

export async function getGatewayCatalog(requestOidcToken?: string | null): Promise<GatewayModel[]> {
  if (cachedCatalog && cachedCatalog.until > Date.now()) return cachedCatalog.models;

  const token = requestOidcToken || process.env.VERCEL_OIDC_TOKEN;
  if (!token) {
    throw new Error("Vercel AI Gateway authentication is not available in this deployment. Configure Vercel OIDC for the cloud project.");
  }

  const response = await fetch("https://ai-gateway.vercel.sh/v1/models", {
    headers: { Authorization: "Bearer " + token, Accept: "application/json" },
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error("AI Gateway model catalogue returned HTTP " + response.status + ".");
  const payload = await response.json() as { data?: GatewayModel[] };
  if (!Array.isArray(payload.data)) throw new Error("AI Gateway returned an unexpected model catalogue.");
  const models = payload.data.filter(model => model && typeof model.id === "string" && model.type === "language");
  cachedCatalog = { until: Date.now() + 5 * 60_000, models };
  return models;
}

function scoreCost(model: GatewayModel): number {
  const input = Number(model.pricing?.input);
  const output = Number(model.pricing?.output);
  if (!Number.isFinite(input) || !Number.isFinite(output)) return Number.POSITIVE_INFINITY;
  return input + output;
}

function supports(model: GatewayModel, capability: string) {
  return capabilityTags(model).includes(capability);
}

function supportsProfile(model: GatewayModel, profile: ModelProfile) {
  const inputs = model.modalities?.input || [];
  if (!inputs.includes("text")) return false;
  if (profile === "vision" && !inputs.includes("image")) return false;
  if (profile === "think" && !supports(model, "reasoning")) return false;
  if ((profile === "agent" || profile === "developer") && !supports(model, "tool-use")) return false;
  return true;
}

function modelCapabilityScore(model: GatewayModel, profile: ModelProfile): number {
  // Gateway metadata is an imperfect quality signal, not a benchmark. Prefer explicit
  // capabilities first; use context/output size only as secondary tie-breakers.
  const tags = new Set(capabilityTags(model).map(tag => tag.toLowerCase()));
  const has = (tag: string) => tags.has(tag);
  const text = ((model.name || "") + " " + (model.description || "")).toLowerCase();
  const contextBonus = Math.min(2, Math.max(0, Math.log2(Math.max(1, model.context_window || 1) / 32_000))) * 0.8;
  const outputBonus = Math.min(2, Math.max(0, Math.log2(Math.max(1, model.max_tokens || 1) / 4_096))) * 0.55;
  const costPenalty = Math.log1p(scoreCost(model) * 1_000_000);
  const featuredBonus = ["recommended", "featured", "frontier"].some(tag => has(tag)) ? 1.5 : 0;
  let score = contextBonus + outputBonus + featuredBonus;

  if (profile === "fast") {
    if (has("fast") || has("low-latency")) score += 6;
    if (/\\b(fast|speed|instant|flash|haiku)\\b/.test(text)) score += 1.5;
    score -= costPenalty * 1.7;
  } else if (profile === "developer") {
    if (has("tool-use")) score += 6;
    if (has("reasoning")) score += 1.5;
    if (/\\b(code|coder|coding|developer|programming)\\b/.test(text)) score += 4;
    score -= costPenalty * 0.45;
  } else if (profile === "think") {
    if (has("reasoning")) score += 8;
    if (has("tool-use")) score += 1.5;
    score += contextBonus * 0.65 + outputBonus * 0.5;
    score -= costPenalty * 0.3;
  } else if (profile === "agent") {
    if (has("tool-use")) score += 8;
    if (has("reasoning")) score += 4;
    if (has("structured-outputs") || has("json-mode")) score += 1;
    score += contextBonus * 0.75 + outputBonus * 0.6;
    score -= costPenalty * 0.35;
  } else {
    if ((model.modalities?.input || []).includes("image")) score += 8;
    if (has("reasoning")) score += 2;
    if (has("tool-use")) score += 1;
    score -= costPenalty * 0.35;
  }

  return score;
}

function pickCandidate(models: GatewayModel[], profile: ModelProfile): GatewayModel | undefined {
  const candidates = models.filter(model =>
    supportsProfile(model, profile) &&
    Number.isFinite(scoreCost(model)) &&
    Number.isFinite(modelCapabilityScore(model, profile))
  );
  if (!candidates.length) return undefined;

  candidates.sort((a, b) =>
    modelCapabilityScore(b, profile) - modelCapabilityScore(a, profile) ||
    scoreCost(a) - scoreCost(b) ||
    (b.context_window || 0) - (a.context_window || 0)
  );
  return candidates[0];
}

export async function resolveProfile(profile: ModelProfile, requestOidcToken?: string | null) {
  const catalog = await getGatewayCatalog(requestOidcToken);
  const modelMap = new Map(catalog.map(model => [model.id, model]));
  const configured = optionalEnv(PROFILE_ENV[profile]);
  const primary = configured ? modelMap.get(configured) : pickCandidate(catalog, profile);
  if (!primary || !supportsProfile(primary, profile)) {
    throw new Error(
      "No currently available compatible model supports the " + PROFILE_LABELS[profile] +
      " profile. Check the administrator-selected model's text, vision, reasoning and tool capabilities."
    );
  }

  const noMoreExpensive = (candidate: GatewayModel) => {
    const primaryInput = Number(primary.pricing?.input);
    const primaryOutput = Number(primary.pricing?.output);
    const candidateInput = Number(candidate.pricing?.input);
    const candidateOutput = Number(candidate.pricing?.output);
    return Number.isFinite(primaryInput) && Number.isFinite(primaryOutput)
      && Number.isFinite(candidateInput) && Number.isFinite(candidateOutput)
      && candidateInput <= primaryInput && candidateOutput <= primaryOutput;
  };
  const configuredFallbacks = (optionalEnv(FALLBACK_ENV[profile]) || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .map(id => modelMap.get(id))
    .filter((model): model is GatewayModel => Boolean(model))
    .filter(model => model.id !== primary.id && supportsProfile(model, profile) && noMoreExpensive(model))
    .map(model => model.id);

  const automaticFallback = pickCandidate(
    catalog.filter(model => model.id !== primary.id && supportsProfile(model, profile) && noMoreExpensive(model)),
    profile,
  );
  const fallbacks = configuredFallbacks.length
    ? configuredFallbacks
    : [automaticFallback?.id].filter((value): value is string => Boolean(value));

  return {
    primary: normalise(primary, profile),
    fallbackIds: fallbacks,
  };
}

export async function getModelProfiles(requestOidcToken?: string | null) {
  const catalog = await getGatewayCatalog(requestOidcToken);
  const profiles = (["fast", "developer", "think", "vision", "agent"] as ModelProfile[])
    .map(profile => {
      const configured = optionalEnv(PROFILE_ENV[profile]);
      const selected = configured
        ? catalog.find(model => model.id === configured)
        : pickCandidate(catalog, profile);
      return selected && supportsProfile(selected, profile) ? normalise(selected, profile) : null;
    })
    .filter((value): value is ModelChoice => Boolean(value));

  return { profiles, availableModelCount: catalog.length };
}

export function isModelProfile(value: unknown): value is ModelProfile {
  return value === "fast" || value === "developer" || value === "think" || value === "vision" || value === "agent";
}

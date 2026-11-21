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

export async function getGatewayCatalog(): Promise<GatewayModel[]> {
  if (cachedCatalog && cachedCatalog.until > Date.now()) return cachedCatalog.models;

  const token = process.env.VERCEL_OIDC_TOKEN;
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

function pickCandidate(models: GatewayModel[], profile: ModelProfile): GatewayModel | undefined {
  let candidates = models.filter(model => (model.modalities?.input || []).includes("text"));
  if (profile === "vision") {
    candidates = candidates.filter(model => (model.modalities?.input || []).includes("image"));
  } else if (profile === "think") {
    candidates = candidates.filter(model => supports(model, "reasoning"));
  } else if (profile === "agent") {
    candidates = candidates.filter(model => supports(model, "tool-use"));
  } else if (profile === "developer") {
    const coder = candidates.filter(model => supports(model, "tool-use") && /coder|code|coding|developer/i.test((model.name || "") + " " + (model.description || "")));
    if (coder.length) candidates = coder;
    else candidates = candidates.filter(model => supports(model, "tool-use"));
  } else if (profile === "fast") {
    const fast = candidates.filter(model => supports(model, "fast"));
    if (fast.length) candidates = fast;
  }

  if (!candidates.length) return undefined;
  if (profile === "think" || profile === "developer" || profile === "agent") {
    candidates.sort((a, b) => (b.context_window || 0) - (a.context_window || 0) || scoreCost(a) - scoreCost(b));
  } else {
    candidates.sort((a, b) => scoreCost(a) - scoreCost(b));
  }
  return candidates[0];
}

export async function resolveProfile(profile: ModelProfile) {
  const catalog = await getGatewayCatalog();
  const modelMap = new Map(catalog.map(model => [model.id, model]));
  const configured = optionalEnv(PROFILE_ENV[profile]);
  const primary = configured ? modelMap.get(configured) : pickCandidate(catalog, profile);
  if (!primary) {
    throw new Error("No currently available model supports the " + PROFILE_LABELS[profile] + " profile. Ask an administrator to configure a model.");
  }

  const configuredFallbacks = (optionalEnv(FALLBACK_ENV[profile]) || "")
    .split(",")
    .map(value => value.trim())
    .filter(Boolean)
    .filter(id => modelMap.has(id) && id !== primary.id);
  const fallbacks = configuredFallbacks.length
    ? configuredFallbacks
    : [pickCandidate(catalog.filter(model => model.id !== primary.id), profile)?.id].filter((value): value is string => Boolean(value));

  return {
    primary: normalise(primary, profile),
    fallbackIds: fallbacks,
  };
}

export async function getModelProfiles() {
  const catalog = await getGatewayCatalog();
  const profiles = (["fast", "developer", "think", "vision", "agent"] as ModelProfile[])
    .map(profile => {
      const configured = optionalEnv(PROFILE_ENV[profile]);
      const selected = configured
        ? catalog.find(model => model.id === configured)
        : pickCandidate(catalog, profile);
      return selected ? normalise(selected, profile) : null;
    })
    .filter((value): value is ModelChoice => Boolean(value));

  return { profiles, availableModelCount: catalog.length };
}

export function isModelProfile(value: unknown): value is ModelProfile {
  return value === "fast" || value === "developer" || value === "think" || value === "vision" || value === "agent";
}

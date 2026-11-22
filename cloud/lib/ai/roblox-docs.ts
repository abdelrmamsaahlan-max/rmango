import "server-only";

const CREATOR_HUB_ORIGIN = "https://create.roblox.com";
const INDEX_SOURCES = [
  { area: "all", path: "/docs/llms.txt" },
  { area: "engine", path: "/docs/reference/engine/llms.txt" },
  { area: "open-cloud", path: "/docs/cloud/llms.txt" },
] as const;

export type RobloxDocumentationArea = "all" | "studio" | "engine" | "open-cloud";
export type RobloxDocumentationEntry = {
  title: string;
  path: string;
  description: string;
  area: "all" | "engine" | "open-cloud";
};

let cachedIndex: { expiresAt: number; entries: RobloxDocumentationEntry[] } | null = null;
let pendingIndex: Promise<RobloxDocumentationEntry[]> | null = null;
const INDEX_TTL_MS = 5 * 60 * 1000;
const MAX_INDEX_BYTES = 1_200_000;
const MAX_PAGE_CHARS = 24_000;

function isDocumentationPath(value: string): boolean {
  if (
    !value.startsWith("/docs/") ||
    value.startsWith("//") ||
    value.includes("\\") ||
    value.includes("?") ||
    value.includes("#") ||
    value.split("/").some(part => part === "." || part === "..")
  ) return false;

  return value.startsWith("/docs/en-us/") ||
    value.startsWith("/docs/reference/engine/") ||
    value.startsWith("/docs/cloud/");
}

export function validateRobloxDocumentationPath(value: string): string {
  const path = value.trim();
  if (!path || path.length > 300 || !isDocumentationPath(path)) {
    throw new Error("Choose a documentation path returned by the official Roblox Creator Hub index.");
  }

  return path.endsWith(".md") ? path : path + ".md";
}

export function parseRobloxDocumentationIndex(
  source: string,
  area: RobloxDocumentationEntry["area"],
): RobloxDocumentationEntry[] {
  const entries: RobloxDocumentationEntry[] = [];
  for (const line of source.split(/\r?\n/)) {
    const match = line.match(/^\s*-\s+\[([^\]]{1,180})\]\((\/docs\/[^)]+)\):\s*(.{0,600})\s*$/);
    if (!match) continue;
    const [, title, path, description] = match;
    if (!isDocumentationPath(path)) continue;
    entries.push({ title: title.trim(), path, description: description.trim(), area });
  }
  return entries;
}

function tokenize(value: string): string[] {
  return value.toLowerCase().match(/[a-z0-9_+#.-]{2,}/g) || [];
}

function scoreEntry(entry: RobloxDocumentationEntry, terms: string[]): number {
  const title = entry.title.toLowerCase();
  const description = entry.description.toLowerCase();
  const path = entry.path.toLowerCase();
  let score = 0;
  for (const term of terms) {
    if (title.includes(term)) score += 5;
    if (description.includes(term)) score += 2;
    if (path.includes(term)) score += 1;
  }
  if (entry.area === "engine") score += 1;
  return score;
}

async function fetchIndex(url: string, area: RobloxDocumentationEntry["area"]): Promise<RobloxDocumentationEntry[]> {
  const response = await fetch(url, {
    headers: { Accept: "text/plain" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) throw new Error("Roblox Creator Hub index returned HTTP " + response.status + ".");
  const raw = await response.text();
  if (raw.length > MAX_INDEX_BYTES) {
    return parseRobloxDocumentationIndex(raw.slice(0, MAX_INDEX_BYTES), area);
  }
  return parseRobloxDocumentationIndex(raw, area);
}

async function loadDocumentationIndex(): Promise<RobloxDocumentationEntry[]> {
  if (cachedIndex && cachedIndex.expiresAt > Date.now()) return cachedIndex.entries;
  if (pendingIndex) return pendingIndex;

  pendingIndex = (async () => {
    const results = await Promise.allSettled(
      INDEX_SOURCES.map(source => fetchIndex(CREATOR_HUB_ORIGIN + source.path, source.area)),
    );
    const entries = results.flatMap(result => result.status === "fulfilled" ? result.value : []);
    if (!entries.length) {
      throw new Error("Roblox Creator Hub documentation is temporarily unavailable.");
    }
    const unique = new Map(entries.map(entry => [entry.path, entry]));
    const all = [...unique.values()];
    cachedIndex = { expiresAt: Date.now() + INDEX_TTL_MS, entries: all };
    return all;
  })();

  try {
    return await pendingIndex;
  } finally {
    pendingIndex = null;
  }
}

export async function searchRobloxDocumentation(
  query: string,
  area: RobloxDocumentationArea = "all",
  limit = 6,
) {
  const cleanQuery = query.trim().slice(0, 180);
  const terms = [...new Set(tokenize(cleanQuery))];
  if (terms.length === 0) throw new Error("Enter a Roblox topic, API name, Studio setting or feature to search.");

  const requestedArea = area === "studio" ? "all" : area;
  const entries = await loadDocumentationIndex();
  const ranked = entries
    .filter(entry => requestedArea === "all" || entry.area === requestedArea || entry.area === "all")
    .map(entry => ({ entry, score: scoreEntry(entry, terms) }))
    .filter(item => item.score > 0)
    .sort((a, b) => b.score - a.score || a.entry.title.localeCompare(b.entry.title))
    .slice(0, Math.max(1, Math.min(8, Math.trunc(limit) || 6)));

  return {
    source: "Roblox Creator Hub",
    query: cleanQuery,
    area,
    results: ranked.map(({ entry, score }) => ({
      title: entry.title,
      description: entry.description,
      path: entry.path,
      url: CREATOR_HUB_ORIGIN + entry.path,
      score,
      apiFamily: entry.path.startsWith("/docs/reference/engine/")
        ? "Roblox Engine API"
        : entry.path.startsWith("/docs/cloud/")
          ? "Roblox Open Cloud API"
          : "Creator and Studio documentation",
    })),
  };
}

export async function readRobloxDocumentation(path: string) {
  const markdownPath = validateRobloxDocumentationPath(path);
  const url = CREATOR_HUB_ORIGIN + markdownPath;
  const response = await fetch(url, {
    headers: { Accept: "text/markdown, text/plain;q=0.9" },
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error("Roblox Creator Hub page could not be loaded (HTTP " + response.status + ").");
  }

  const contentType = response.headers.get("content-type") || "";
  if (contentType.includes("text/html")) {
    throw new Error("Roblox Creator Hub returned HTML instead of its agent-readable Markdown page.");
  }

  const markdown = await response.text();
  if (!markdown.trim()) throw new Error("The selected Roblox documentation page was empty.");
  return {
    source: "Roblox Creator Hub",
    url,
    contentType,
    truncated: markdown.length > MAX_PAGE_CHARS,
    markdown: markdown.slice(0, MAX_PAGE_CHARS),
  };
}

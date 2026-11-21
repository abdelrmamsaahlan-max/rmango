export type ProjectSymbol = {
  symbol_name: string;
  symbol_kind: "function" | "type" | "class" | "constant" | "module" | "variable";
  line_number: number;
  signature: string;
};
export type ProjectEdge = {
  edge_type: "import" | "require";
  specifier: string;
  target_hint: string | null;
  line_number: number;
};
export type ProjectFileGraph = {
  symbols: ProjectSymbol[];
  edges: ProjectEdge[];
  skippedReason?: "unsupported_file" | "source_too_large";
};

const MAX_SOURCE_BYTES = 512_000;
const MAX_SYMBOLS_PER_FILE = 2_000;
const MAX_EDGES_PER_FILE = 1_000;
const SOURCE_EXTENSION = /\.(?:server|client)\.(?:lua|luau)$|\.(?:lua|luau|tsx?|jsx?|mjs|cjs)$/i;

function normalizeSegments(parts: string[]): string[] {
  const result: string[] = [];
  for (const part of parts) {
    if (!part || part === ".") continue;
    if (part === "..") { if (result.length) result.pop(); continue; }
    result.push(part);
  }
  return result;
}
function sourceDirectory(relativePath: string): string[] {
  const parts = relativePath.replace(/\\/g, "/").split("/");
  parts.pop();
  return parts.filter(Boolean);
}
function stripSourceExtension(value: string): string {
  return value.replace(SOURCE_EXTENSION, "");
}

export function resolveProjectImportHint(sourcePath: string, specifier: string): string | null {
  const normalizedSource = sourcePath.replace(/\\/g, "/");
  if (specifier.startsWith("./") || specifier.startsWith("../")) {
    return stripSourceExtension(normalizeSegments([
      ...sourceDirectory(normalizedSource), ...specifier.split("/"),
    ]).join("/"));
  }
  if (specifier.startsWith("script.")) {
    const parts = sourceDirectory(normalizedSource);
    let parentSeen = false;
    for (const token of specifier.slice("script.".length).split(".")) {
      if (!token) continue;
      if (token === "Parent") {
        if (parentSeen && parts.length) parts.pop();
        parentSeen = true;
      } else parts.push(token);
    }
    return parts.length ? parts.join("/") : null;
  }
  const service = specifier.match(/^game:GetService\(["']([A-Za-z0-9_]+)["']\)(.*)$/);
  if (service) {
    const suffix = service[2].replace(/^\./, "");
    return [service[1], ...suffix.split(".").filter(Boolean)].join("/");
  }
  return null;
}

function addSymbol(
  symbols: ProjectSymbol[],
  seen: Set<string>,
  name: string,
  kind: ProjectSymbol["symbol_kind"],
  lineNumber: number,
  signature: string,
): void {
  const cleanName = name.trim().slice(0, 160);
  if (!cleanName) return;
  const key = kind + "|" + cleanName + "|" + lineNumber;
  if (seen.has(key) || symbols.length >= MAX_SYMBOLS_PER_FILE) return;
  seen.add(key);
  symbols.push({
    symbol_name: cleanName,
    symbol_kind: kind,
    line_number: lineNumber,
    signature: signature.replace(/[\u0000-\u001f]+/g, " ").trim().slice(0, 300),
  });
}
function addEdge(
  edges: ProjectEdge[],
  seen: Set<string>,
  sourcePath: string,
  specifier: string,
  edgeType: ProjectEdge["edge_type"],
  lineNumber: number,
): void {
  const clean = specifier.trim().slice(0, 300);
  if (!clean || edges.length >= MAX_EDGES_PER_FILE) return;
  const key = edgeType + "|" + lineNumber + "|" + clean;
  if (seen.has(key)) return;
  seen.add(key);
  edges.push({
    edge_type: edgeType,
    specifier: clean,
    target_hint: resolveProjectImportHint(sourcePath, clean),
    line_number: lineNumber,
  });
}

/**
 * Bounded deterministic first-pass structural indexer. It stores declarations
 * and import/require relationships only; it never executes project source.
 * This is not a full Luau/TypeScript parser and intentionally reports partial
 * coverage for dynamic or unusual runtime references.
 */
export function parseProjectSource(relativePath: string, source: string): ProjectFileGraph {
  const normalizedPath = relativePath.replace(/\\/g, "/");
  const extension = normalizedPath.slice(normalizedPath.lastIndexOf(".")).toLowerCase();
  if (![".lua", ".luau", ".ts", ".tsx", ".js", ".jsx", ".mjs", ".cjs", ".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml", ".toml", ".css", ".html", ".py"].includes(extension)) {
    return { symbols: [], edges: [], skippedReason: "unsupported_file" };
  }
  if (new TextEncoder().encode(source).byteLength > MAX_SOURCE_BYTES) {
    return { symbols: [], edges: [], skippedReason: "source_too_large" };
  }

  const symbols: ProjectSymbol[] = [];
  const symbolSeen = new Set<string>();
  const edges: ProjectEdge[] = [];
  const edgeSeen = new Set<string>();
  const lines = source.split(/\r?\n/);

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].slice(0, 2_000);
    const lineNumber = index + 1;
    let match: RegExpExecArray | null;

    match = /^\s*(?:export\s+)?(?:local\s+)?function\s+([A-Za-z_$][\w$]*(?:(?:\.|:)[A-Za-z_$][\w$]*)*)/.exec(line);
    if (match) addSymbol(symbols, symbolSeen, match[1], "function", lineNumber, line);
    match = /^\s*(?:local\s+)?([A-Za-z_$][\w$]*(?:(?:\.|:)[A-Za-z_$][\w$]*)*)\s*=\s*(?:async\s+)?function\b/.exec(line);
    if (match) addSymbol(symbols, symbolSeen, match[1], "function", lineNumber, line);
    match = /^\s*(?:export\s+)?(?:local\s+)?(type|export\s+type|interface|class)\s+([A-Za-z_$][\w$]*)/.exec(line);
    if (match) {
      const kind = match[1].includes("type") ? "type" : "class";
      addSymbol(symbols, symbolSeen, match[2], kind, lineNumber, line);
    }
    match = /^\s*(?:export\s+)?(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=/.exec(line);
    if (match) addSymbol(symbols, symbolSeen, match[1], "variable", lineNumber, line);
    match = /^\s*local\s+([A-Za-z_$][\w$]*)\s*=\s*\{/.exec(line);
    if (match) addSymbol(symbols, symbolSeen, match[1], "module", lineNumber, line);

    const patterns: Array<{ regex: RegExp; kind: ProjectEdge["edge_type"] }> = [
      { regex: /\b(?:import|export)\b[^;\n]*?\bfrom\s*["']([^"']+)["']/g, kind: "import" },
      { regex: /\bimport\s*["']([^"']+)["']/g, kind: "import" },
      { regex: /\bimport\s*\(\s*["']([^"']+)["']\s*\)/g, kind: "import" },
      { regex: /\brequire\s*\(\s*["']([^"']+)["']\s*\)/g, kind: "require" },
      { regex: /\brequire\s*\(\s*(script(?:\.[A-Za-z_$][\w$]*)+|game:GetService\(["'][A-Za-z0-9_]+["']\)(?:\.[A-Za-z_$][\w$]*)*)\s*\)/g, kind: "require" },
    ];
    for (const pattern of patterns) {
      while ((match = pattern.regex.exec(line)) !== null) {
        addEdge(edges, edgeSeen, normalizedPath, match[1], pattern.kind, lineNumber);
      }
    }
  }
  return { symbols, edges };
}

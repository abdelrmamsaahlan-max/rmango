export const PROJECT_INDEX_VERSION = 1;

export type IndexedSymbol = {
  symbolType: "module" | "function" | "remote" | "service";
  symbolName: string;
  lineNumber: number;
};

export type IndexedDependency = {
  dependencyType: "module_require" | "instance_reference" | "service_reference" | "remote_reference";
  reference: string;
  targetName: string | null;
  targetRelativePath: string | null;
  confidence: number;
  lineNumber: number;
};

export type ProjectIndexResult = {
  symbols: IndexedSymbol[];
  dependencies: IndexedDependency[];
};

const SOURCE_EXTENSIONS = new Set([".lua", ".luau"]);

export function normalizeProjectPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\/+/, "").replace(/\/+/g, "/");
}

function basenameWithoutExtension(value: string): string {
  const name = normalizeProjectPath(value).split("/").pop() || value;
  return name.replace(/\.(lua|luau)$/i, "").toLowerCase();
}

function lineAt(source: string, offset: number): number {
  return source.slice(0, offset).split("\n").length;
}

function unique<T>(items: T[], key: (item: T) => string): T[] {
  const seen = new Set<string>();
  return items.filter(item => {
    const token = key(item);
    if (seen.has(token)) return false;
    seen.add(token);
    return true;
  });
}

function resolveTarget(name: string | null, filePaths: string[]): { path: string | null; confidence: number } {
  if (!name) return { path: null, confidence: 0 };
  const normalized = name.toLowerCase();
  const matches = filePaths.filter(path => SOURCE_EXTENSIONS.has(extension(path)) && basenameWithoutExtension(path) === normalized);
  if (matches.length === 1) return { path: normalizeProjectPath(matches[0]), confidence: 0.95 };
  if (matches.length > 1) return { path: null, confidence: 0.35 };
  return { path: null, confidence: 0.15 };
}

function extension(value: string): string {
  const index = value.lastIndexOf(".");
  return index < 0 ? "" : value.slice(index).toLowerCase();
}

export function indexLuauSource(relativePath: string, source: string, projectPaths: string[]): ProjectIndexResult {
  const symbols: IndexedSymbol[] = [];
  const dependencies: IndexedDependency[] = [];
  const currentPath = normalizeProjectPath(relativePath);
  if (!SOURCE_EXTENSIONS.has(extension(currentPath))) return { symbols, dependencies };

  const base = basenameWithoutExtension(currentPath);
  if (base && base !== "init") {
    symbols.push({ symbolType: "module", symbolName: base, lineNumber: 1 });
  }

  const addDependency = (
    dependencyType: IndexedDependency["dependencyType"],
    reference: string,
    targetName: string | null,
    offset: number,
  ) => {
    const target = resolveTarget(targetName, projectPaths);
    dependencies.push({
      dependencyType,
      reference: reference.trim().slice(0, 500),
      targetName,
      targetRelativePath: target.path,
      confidence: target.confidence,
      lineNumber: lineAt(source, offset),
    });
  };

  const functionPattern = /^\s*(?:local\s+)?function\s+([A-Za-z_]\w*(?:[.:][A-Za-z_]\w*)*)/gm;
  for (const match of source.matchAll(functionPattern)) {
    if (match[1]) symbols.push({ symbolType: "function", symbolName: match[1].replace(/:/g, "."), lineNumber: lineAt(source, match.index || 0) });
  }

  const assignedFunctionPattern = /^\s*(?:local\s+)?([A-Za-z_]\w*)\s*=\s*function\b/gm;
  for (const match of source.matchAll(assignedFunctionPattern)) {
    if (match[1]) symbols.push({ symbolType: "function", symbolName: match[1], lineNumber: lineAt(source, match.index || 0) });
  }

  const servicePattern = /GetService\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(servicePattern)) {
    const name = match[1];
    if (name) {
      symbols.push({ symbolType: "service", symbolName: name, lineNumber: lineAt(source, match.index || 0) });
      addDependency("service_reference", match[0], name, match.index || 0);
    }
  }

  const remotePattern = /Instance\.new\s*\(\s*["'](RemoteEvent|RemoteFunction|UnreliableRemoteEvent|BindableEvent|BindableFunction)["']\s*\)/g;
  for (const match of source.matchAll(remotePattern)) {
    const kind = match[1] || "RemoteEvent";
    const start = match.index || 0;
    const lineStart = source.lastIndexOf("\n", start) + 1;
    const lineEnd = source.indexOf("\n", start);
    const line = source.slice(lineStart, lineEnd < 0 ? source.length : lineEnd);
    const assigned = line.match(/(?:local\s+)?([A-Za-z_]\w*)\s*=\s*Instance\.new/);
    const name = assigned?.[1] || kind;
    symbols.push({ symbolType: "remote", symbolName: name, lineNumber: lineAt(source, start) });
    addDependency("remote_reference", match[0], name, start);
  }

  const requirePattern = /require\s*\(\s*([^)]+?)\s*\)/g;
  for (const match of source.matchAll(requirePattern)) {
    const expression = match[1] || "";
    const childName = [...expression.matchAll(/WaitForChild\s*\(\s*["']([^"']+)["']\s*\)/g)].at(-1)?.[1];
    const dotName = expression.match(/\.([A-Za-z_]\w*)\s*$/)?.[1];
    const name = childName || dotName || null;
    addDependency("module_require", expression, name, match.index || 0);
  }

  const waitPattern = /:WaitForChild\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of source.matchAll(waitPattern)) {
    const name = match[1];
    if (!name) continue;
    const start = match.index || 0;
    addDependency("instance_reference", match[0], name, start);
  }

  return {
    symbols: unique(symbols, item => item.symbolType + ":" + item.symbolName + ":" + item.lineNumber),
    dependencies: unique(dependencies, item => item.dependencyType + ":" + item.reference + ":" + item.lineNumber),
  };
}

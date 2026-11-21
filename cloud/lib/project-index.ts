export const PROJECT_INDEX_VERSION = 2;

export type IndexedSymbol = {
  symbolType: "module" | "function" | "remote" | "service" | "datastore" | "ui_element" | "asset";
  symbolName: string;
  lineNumber: number;
};

export type IndexedDependency = {
  dependencyType:
    | "module_require"
    | "instance_reference"
    | "service_reference"
    | "remote_reference"
    | "datastore_reference"
    | "ui_reference"
    | "asset_reference";
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

const UI_CLASSES = new Set([
  "ScreenGui", "SurfaceGui", "BillboardGui",
  "Frame", "ScrollingFrame", "CanvasGroup",
  "TextButton", "ImageButton", "TextLabel", "ImageLabel", "TextBox",
  "ViewportFrame", "VideoFrame",
  "UIListLayout", "UIGridLayout", "UIPageLayout",
  "UIPadding", "UICorner", "UIStroke", "UIGradient",
  "UIAspectRatioConstraint", "UISizeConstraint", "UITableLayout",
]);

const REMOTE_METHODS = new Set([
  "OnServerEvent", "OnClientEvent", "OnServerInvoke", "OnClientInvoke",
  "FireServer", "FireClient", "FireAllClients", "InvokeServer", "InvokeClient",
]);

const DATASTORE_METHODS = new Set([
  "GetDataStore", "GetOrderedDataStore",
  "GetSortedMap", "GetHashMap", "GetQueue",
]);

const ASSET_PROPERTY_NAMES = new Set([
  "AnimationId", "TextureID", "Texture", "MeshId", "MeshID",
  "SoundId", "Image", "Video", "AssetId",
]);

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

function extension(value: string): string {
  const index = value.lastIndexOf(".");
  return index < 0 ? "" : value.slice(index).toLowerCase();
}

function resolveTarget(name: string | null, filePaths: string[]): { path: string | null; confidence: number } {
  if (!name) return { path: null, confidence: 0 };
  const normalized = name.toLowerCase();
  const matches = filePaths.filter(path => SOURCE_EXTENSIONS.has(extension(path)) && basenameWithoutExtension(path) === normalized);
  if (matches.length === 1) return { path: normalizeProjectPath(matches[0]), confidence: 0.95 };
  if (matches.length > 1) return { path: null, confidence: 0.35 };
  return { path: null, confidence: 0.15 };
}

// Replace comments with spaces while preserving offsets and newlines. Strings
// remain intact because their literal values are part of many Roblox APIs.
function maskLuauComments(source: string): string {
  const chars = source.split("");
  let index = 0;

  const blank = (start: number, end: number) => {
    for (let cursor = start; cursor < end; cursor++) {
      if (chars[cursor] !== "\n" && chars[cursor] !== "\r") chars[cursor] = " ";
    }
  };

  while (index < source.length) {
    const character = source[index];

    if (character === "'" || character === '"' || character === "`") {
      const quote = character;
      index++;
      let escaped = false;
      while (index < source.length) {
        const current = source[index];
        if (escaped) escaped = false;
        else if (current === "\\") escaped = true;
        else if (current === quote) {
          index++;
          break;
        }
        index++;
      }
      continue;
    }

    if (character === "-" && source[index + 1] === "-") {
      const commentStart = index;
      const bracket = source.slice(index + 2).match(/^\[(=*)\[/);
      if (bracket) {
        const equals = bracket[1] || "";
        const close = "]" + equals + "]";
        const bodyStart = index + 2 + bracket[0].length;
        const closeAt = source.indexOf(close, bodyStart);
        const end = closeAt < 0 ? source.length : closeAt + close.length;
        blank(commentStart, end);
        index = end;
      } else {
        const newlineAt = source.indexOf("\n", index + 2);
        const end = newlineAt < 0 ? source.length : newlineAt;
        blank(commentStart, end);
        index = end;
      }
      continue;
    }

    index++;
  }

  return chars.join("");
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^\u0024{}()|[\]\\]/g, "\\$&");
}

function addKnownDependency(
  dependencies: IndexedDependency[],
  dependencyType: IndexedDependency["dependencyType"],
  reference: string,
  targetName: string | null,
  source: string,
  offset: number,
  confidence: number,
) {
  dependencies.push({
    dependencyType,
    reference: reference.trim().slice(0, 500),
    targetName,
    targetRelativePath: null,
    confidence: Math.max(0, Math.min(1, confidence)),
    lineNumber: lineAt(source, offset),
  });
}

export function indexLuauSource(relativePath: string, source: string, projectPaths: string[]): ProjectIndexResult {
  const symbols: IndexedSymbol[] = [];
  const dependencies: IndexedDependency[] = [];
  const currentPath = normalizeProjectPath(relativePath);
  if (!SOURCE_EXTENSIONS.has(extension(currentPath))) return { symbols, dependencies };

  const code = maskLuauComments(source);
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
  for (const match of code.matchAll(functionPattern)) {
    if (match[1]) symbols.push({ symbolType: "function", symbolName: match[1].replace(/:/g, "."), lineNumber: lineAt(source, match.index || 0) });
  }

  const assignedFunctionPattern = /^\s*(?:local\s+)?([A-Za-z_]\w*)\s*=\s*function\b/gm;
  for (const match of code.matchAll(assignedFunctionPattern)) {
    if (match[1]) symbols.push({ symbolType: "function", symbolName: match[1], lineNumber: lineAt(source, match.index || 0) });
  }

  const servicePattern = /GetService\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of code.matchAll(servicePattern)) {
    const name = match[1];
    if (name) {
      symbols.push({ symbolType: "service", symbolName: name, lineNumber: lineAt(source, match.index || 0) });
      addDependency("service_reference", match[0], name, match.index || 0);
    }
  }

  const remotePattern = /Instance\.new\s*\(\s*["'](RemoteEvent|RemoteFunction|UnreliableRemoteEvent|BindableEvent|BindableFunction)["']\s*\)/g;
  for (const match of code.matchAll(remotePattern)) {
    const kind = match[1] || "RemoteEvent";
    const start = match.index || 0;
    const lineStart = code.lastIndexOf("\n", start) + 1;
    const lineEnd = code.indexOf("\n", start);
    const line = code.slice(lineStart, lineEnd < 0 ? code.length : lineEnd);
    const assigned = line.match(/(?:local\s+)?([A-Za-z_]\w*)\s*=\s*Instance\.new/);
    const name = assigned?.[1] || kind;
    symbols.push({ symbolType: "remote", symbolName: name, lineNumber: lineAt(source, start) });
    addDependency("remote_reference", match[0], name, start);
  }

  // Static DataStore and MemoryStore names. These are exact source literals,
  // not evidence that a store exists or that a live DataStore call succeeded.
  const datastorePattern = /\b(GetDataStore|GetOrderedDataStore|GetSortedMap|GetHashMap|GetQueue)\s*\(\s*(["'])([^"']+)\2\s*\)/g;
  for (const match of code.matchAll(datastorePattern)) {
    const method = match[1];
    const name = match[3];
    if (!method || !name) continue;
    const storeKind = method === "GetDataStore" ? "DataStore" :
      method === "GetOrderedDataStore" ? "OrderedDataStore" :
      method === "GetSortedMap" ? "MemoryStoreSortedMap" :
      method === "GetHashMap" ? "MemoryStoreHashMap" : "MemoryStoreQueue";
    const offset = match.index || 0;
    symbols.push({
      symbolType: "datastore",
      symbolName: storeKind + ":" + name,
      lineNumber: lineAt(source, offset),
    });
    addKnownDependency(dependencies, "datastore_reference", match[0], name, source, offset, 0.98);
  }

  // Remote aliases are identified from WaitForChild plus a remote-specific
  // method/property. This is a source-level association, not a runtime type check.
  const remoteAliases = new Map<string, string>();
  const remoteAliasPattern = /(?:local\s+)?([A-Za-z_]\w*)\s*=\s*[^;\n]*?WaitForChild\s*\(\s*(["'])([^"']+)\2\s*\)/g;
  for (const match of code.matchAll(remoteAliasPattern)) {
    if (match[1] && match[3]) remoteAliases.set(match[1], match[3]);
  }

  const remoteUsePattern = /\b([A-Za-z_]\w*)\s*:\s*(OnServerEvent|OnClientEvent|OnServerInvoke|OnClientInvoke|FireServer|FireClient|FireAllClients|InvokeServer|InvokeClient)\b/g;
  for (const match of code.matchAll(remoteUsePattern)) {
    const variable = match[1];
    const method = match[2];
    if (!variable || !method || !REMOTE_METHODS.has(method)) continue;
    const remoteName = remoteAliases.get(variable) || variable;
    addKnownDependency(
      dependencies,
      "remote_reference",
      match[0],
      remoteName,
      source,
      match.index || 0,
      remoteAliases.has(variable) ? 0.93 : 0.72,
    );
  }

  const uiPattern = /Instance\.new\s*\(\s*(["'])(ScreenGui|SurfaceGui|BillboardGui|Frame|ScrollingFrame|CanvasGroup|TextButton|ImageButton|TextLabel|ImageLabel|TextBox|ViewportFrame|VideoFrame|UIListLayout|UIGridLayout|UIPageLayout|UIPadding|UICorner|UIStroke|UIGradient|UIAspectRatioConstraint|UISizeConstraint|UITableLayout)\1\s*\)/g;
  for (const match of code.matchAll(uiPattern)) {
    const uiClass = match[2];
    if (!uiClass || !UI_CLASSES.has(uiClass)) continue;
    const offset = match.index || 0;
    const lineStart = code.lastIndexOf("\n", offset) + 1;
    const lineEnd = code.indexOf("\n", offset);
    const line = code.slice(lineStart, lineEnd < 0 ? code.length : lineEnd);
    const assigned = line.match(/(?:local\s+)?([A-Za-z_]\w*)\s*=\s*Instance\.new/);
    const variable = assigned?.[1];
    let displayName = uiClass;
    let nameOffset = offset;
    let confidence = 0.72;

    if (variable) {
      const namePattern = new RegExp("\\b" + escapeRegExp(variable) + "\\.Name\\s*=\\s*([\"'])([^\"']+)\\1");
      const nearby = code.slice(offset, Math.min(code.length, offset + 2_000));
      const nameMatch = namePattern.exec(nearby);
      if (nameMatch?.[2]) {
        displayName = nameMatch[2];
        nameOffset = offset + (nameMatch.index || 0);
        confidence = 0.95;
      } else {
        displayName = variable + ":" + uiClass;
      }
    }

    symbols.push({ symbolType: "ui_element", symbolName: displayName, lineNumber: lineAt(source, nameOffset) });
    addKnownDependency(
      dependencies,
      "ui_reference",
      match[0],
      displayName,
      source,
      offset,
      confidence,
    );
  }

  const assetPattern = /\b(rbxassetid|rbxthumb):\/\/([0-9]+)/gi;
  for (const match of code.matchAll(assetPattern)) {
    const scheme = match[1]?.toLowerCase();
    const id = match[2];
    if (!scheme || !id) continue;
    const reference = scheme + "://" + id;
    const offset = match.index || 0;
    symbols.push({ symbolType: "asset", symbolName: reference, lineNumber: lineAt(source, offset) });
    addKnownDependency(dependencies, "asset_reference", reference, reference, source, offset, 1);
  }

  const requireStart = /\brequire\s*\(/g;
  for (const match of code.matchAll(requireStart)) {
    const expressionStart = (match.index || 0) + match[0].length;
    let cursor = expressionStart;
    let depth = 1;
    let quote: "'" | '"' | "`" | null = null;
    let escaped = false;

    for (; cursor < code.length; cursor++) {
      const character = code[cursor];
      if (quote) {
        if (escaped) {
          escaped = false;
        } else if (character === "\\") {
          escaped = true;
        } else if (character === quote) {
          quote = null;
        }
        continue;
      }
      if (character === "'" || character === '"' || character === "`") {
        quote = character;
      } else if (character === "(") {
        depth++;
      } else if (character === ")") {
        depth--;
        if (depth === 0) break;
      }
    }

    if (depth !== 0) continue;
    const expression = code.slice(expressionStart, cursor).trim();
    const childName = [...expression.matchAll(/WaitForChild\s*\(\s*["']([^"']+)["']\s*\)/g)].at(-1)?.[1];
    const dotName = expression.match(/\.([A-Za-z_]\w*)\s*$/)?.[1];
    const name = childName || dotName || null;
    addDependency("module_require", expression, name, match.index || 0);
  }

  const waitPattern = /:WaitForChild\s*\(\s*["']([^"']+)["']\s*\)/g;
  for (const match of code.matchAll(waitPattern)) {
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

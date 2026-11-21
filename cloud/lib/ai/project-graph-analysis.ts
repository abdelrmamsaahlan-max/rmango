export type GraphFile = {
  id: string;
  relative_path: string;
};

export type GraphDependency = {
  source_file_id: string;
  target_hint: string | null;
};

export type CircularDependencyAnalysis = {
  cycles: string[][];
  cycleCount: number;
  cyclesTruncated: boolean;
  resolvedEdges: number;
  unresolvedEdges: number;
};

const SOURCE_SUFFIX = /\.(?:server|client)\.(?:lua|luau)$|\.(?:lua|luau|tsx?|jsx?|mjs|cjs)$/i;

function normalizeGraphPath(value: string): string {
  return value.replace(/\\/g, "/").replace(/^\.\//, "").replace(SOURCE_SUFFIX, "").replace(/\/$/, "").toLocaleLowerCase();
}

/**
 * Finds cycles among file-level edges whose target hints resolve to a known
 * project file. This deliberately ignores unresolved/dynamic references and
 * returns bounded evidence rather than claiming a complete semantic graph.
 */
export function detectProjectDependencyCycles(
  files: GraphFile[],
  edges: GraphDependency[],
  maxCycles = 50,
): CircularDependencyAnalysis {
  const pathToFile = new Map<string, string>();
  const ambiguous = new Set<string>();
  const pathById = new Map(files.map(file => [file.id, file.relative_path]));
  for (const file of files) {
    const key = normalizeGraphPath(file.relative_path);
    const existing = pathToFile.get(key);
    if (existing && existing !== file.id) {
      pathToFile.delete(key);
      ambiguous.add(key);
    } else if (!ambiguous.has(key)) {
      pathToFile.set(key, file.id);
    }
  }

  const adjacency = new Map<string, Set<string>>();
  let resolvedEdges = 0;
  let unresolvedEdges = 0;
  for (const edge of edges) {
    const target = edge.target_hint ? pathToFile.get(normalizeGraphPath(edge.target_hint)) : undefined;
    if (!target || !pathById.has(edge.source_file_id)) {
      unresolvedEdges += 1;
      continue;
    }
    resolvedEdges += 1;
    const targets = adjacency.get(edge.source_file_id) || new Set<string>();
    targets.add(target);
    adjacency.set(edge.source_file_id, targets);
  }

  const state = new Map<string, 0 | 1 | 2>();
  const stack: string[] = [];
  const stackIndex = new Map<string, number>();
  const cycles: string[][] = [];
  const seenCycles = new Set<string>();
  let cyclesTruncated = false;
  const limit = Math.max(1, Math.min(100, Math.floor(maxCycles) || 50));

  const visit = (node: string) => {
    state.set(node, 1);
    stackIndex.set(node, stack.length);
    stack.push(node);

    for (const next of adjacency.get(node) || []) {
      if (state.get(next) === 1) {
        const start = stackIndex.get(next);
        if (start === undefined) continue;
        const cycleIds = stack.slice(start);
        const canonical = [...cycleIds].sort().join("|");
        if (!seenCycles.has(canonical)) {
          seenCycles.add(canonical);
          if (cycles.length < limit) cycles.push([...cycleIds, next].map(id => pathById.get(id) || id));
          else cyclesTruncated = true;
        }
      } else if (!state.has(next)) {
        visit(next);
      }
    }

    stack.pop();
    stackIndex.delete(node);
    state.set(node, 2);
  };

  for (const file of files) {
    if (!state.has(file.id)) visit(file.id);
  }

  return {
    cycles,
    cycleCount: cycles.length,
    cyclesTruncated,
    resolvedEdges,
    unresolvedEdges,
  };
}

export type ProjectRelevanceOptions<T> = {
  getText: (item: T) => string;
  updatedAt?: (item: T) => string | null | undefined;
  nowMs?: number;
};

const STOP_WORDS = new Set([
  "a", "about", "after", "again", "all", "also", "an", "and", "any", "are",
  "as", "at", "be", "because", "before", "but", "by", "can", "could", "do",
  "does", "for", "from", "get", "give", "help", "how", "i", "if", "in",
  "into", "is", "it", "its", "make", "me", "my", "of", "on", "or", "our",
  "please", "should", "so", "that", "the", "their", "then", "there", "this",
  "to", "use", "using", "what", "when", "where", "which", "with", "would",
  "you", "your",
]);

function normalize(value: string): string {
  return value
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenizeProjectQuery(query: string): string[] {
  return [...new Set(normalize(query)
    .split(/\s+/)
    .filter(token => token.length > 1 && !STOP_WORDS.has(token)))];
}

function recencyScore(updatedAt: string | null | undefined, nowMs: number): number {
  if (!updatedAt) return 0;
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, (nowMs - timestamp) / 86_400_000);
  return 0.5 * Math.exp(-ageDays / 45);
}

/**
 * Deterministic lexical ranking for project metadata and memories.
 * Scores only metadata text; file contents are still read on demand via tools.
 * Input order is preserved as the tie-breaker (callers normally supply
 * alphabetically ordered file metadata or newest-first memories).
 */
function scoreWithPreparedQuery(terms: string[], normalizedQuery: string, candidateText: string): number {
  if (!terms.length) return 0;

  const candidate = normalize(candidateText);
  const candidateTokens = new Set(candidate.split(/\s+/).filter(Boolean));
  let score = 0;
  for (const term of terms) {
    if (candidateTokens.has(term)) score += 1;
    else if (term.length >= 4 && candidate.includes(term)) score += 0.45;
  }

  if (normalizedQuery.length >= 5 && candidate.includes(normalizedQuery)) score += 2;
  return score;
}

export function scoreProjectRelevance(query: string, candidateText: string): number {
  const boundedQuery = query.slice(-24_000);
  return scoreWithPreparedQuery(
    tokenizeProjectQuery(boundedQuery),
    normalize(boundedQuery),
    candidateText,
  );
}

export function rankProjectItems<T>(
  items: T[],
  query: string,
  options: ProjectRelevanceOptions<T>,
): T[] {
  // Tokenize and normalize once, not once per file/memory candidate. This keeps
  // indexing cost proportional to one query plus the bounded metadata corpus.
  const boundedQuery = query.slice(-24_000);
  const terms = tokenizeProjectQuery(boundedQuery);
  if (!terms.length) return items.slice();
  const normalizedQuery = normalize(boundedQuery);

  const nowMs = options.nowMs ?? Date.now();
  return items
    .map((item, index) => {
      const score = scoreWithPreparedQuery(terms, normalizedQuery, options.getText(item)) +
        recencyScore(options.updatedAt?.(item), nowMs);
      return { item, index, score };
    })
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .map(entry => entry.item);
}
/**
 * Memory rows are fetched newest-first. Keep the newest version of each
 * project/type/title note so duplicate saves don't consume the context budget.
 */
export function deduplicateProjectMemories<T extends {
  memory_type?: string | null;
  title?: string | null;
  content?: string | null;
}>(items: T[]): T[] {
  const seen = new Set<string>();
  const result: T[] = [];
  for (const item of items) {
    const type = normalize(String(item.memory_type || "note"));
    const title = normalize(String(item.title || ""));
    const content = normalize(String(item.content || ""));
    const identity = type + "|" + (title || content.slice(0, 180));
    if (seen.has(identity)) continue;
    seen.add(identity);
    result.push(item);
  }
  return result;
}

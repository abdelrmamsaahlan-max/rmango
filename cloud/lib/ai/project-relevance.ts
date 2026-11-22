export type ProjectRelevanceOptions<T> = {
  getText: (item: T) => string;
  updatedAt?: (item: T) => string | null | undefined;
  boost?: (item: T) => number;
  nowMs?: number;
};

export type ProjectRelevanceEvidence<T> = {
  item: T;
  score: number;
  matchedTerms: string[];
  retrievalMethod: "bm25";
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
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function tokenizeProjectQuery(query: string): string[] {
  return [...new Set(
    normalize(query)
      .split(/\s+/)
      .filter(token => token.length > 1 && !STOP_WORDS.has(token)),
  )].slice(0, 64);
}

function recencyScore(updatedAt: string | null | undefined, nowMs: number): number {
  if (!updatedAt) return 0;
  const timestamp = Date.parse(updatedAt);
  if (!Number.isFinite(timestamp)) return 0;
  const ageDays = Math.max(0, (nowMs - timestamp) / 86_400_000);
  return 0.18 * Math.exp(-ageDays / 60);
}

/**
 * BM25 ranks bounded project metadata and memory text. It is lexical retrieval,
 * not vector/semantic search; callers must read source files before treating
 * metadata hits as implementation evidence.
 */
export function rankProjectItemsWithEvidence<T>(
  items: T[],
  query: string,
  options: ProjectRelevanceOptions<T>,
): ProjectRelevanceEvidence<T>[] {
  const boundedQuery = query.slice(-24_000);
  const terms = tokenizeProjectQuery(boundedQuery);
  if (!terms.length) {
    return items.map(item => ({
      item,
      score: 0,
      matchedTerms: [],
      retrievalMethod: "bm25" as const,
    }));
  }

  const normalizedQuery = normalize(boundedQuery);
  const docs = items.map(item => {
    const normalizedText = normalize(options.getText(item).slice(0, 8_000));
    const tokens = normalizedText.split(/\s+/).filter(Boolean);
    const frequencies = new Map<string, number>();
    for (const token of tokens) frequencies.set(token, (frequencies.get(token) || 0) + 1);
    return { item, normalizedText, tokens, frequencies };
  });
  const documentFrequency = new Map<string, number>();
  for (const term of terms) {
    documentFrequency.set(term, docs.reduce(
      (count, doc) => count + (doc.frequencies.has(term) ? 1 : 0),
      0,
    ));
  }
  const averageLength = docs.length
    ? docs.reduce((sum, doc) => sum + doc.tokens.length, 0) / docs.length
    : 0;
  const safeAverageLength = Math.max(1, averageLength);
  const nowMs = options.nowMs ?? Date.now();

  return docs.map(doc => {
    let score = 0;
    const matchedTerms: string[] = [];
    for (const term of terms) {
      const frequency = doc.frequencies.get(term) || 0;
      if (!frequency) continue;
      matchedTerms.push(term);
      const df = documentFrequency.get(term) || 0;
      const inverseDocumentFrequency = Math.log(
        1 + (docs.length - df + 0.5) / (df + 0.5),
      );
      const k1 = 1.2;
      const b = 0.75;
      const lengthNormalization = frequency + k1 * (
        1 - b + b * (doc.tokens.length / safeAverageLength)
      );
      score += inverseDocumentFrequency * (frequency * (k1 + 1)) / lengthNormalization;
    }

    if (normalizedQuery.length >= 5 && doc.normalizedText.includes(normalizedQuery)) score += 1.25;
    const recency = options.updatedAt ? recencyScore(options.updatedAt(doc.item), nowMs) : 0;
    const customBoost = Math.max(-0.25, Math.min(0.75, Number(options.boost?.(doc.item) || 0)));
    score += recency + customBoost;

    return {
      item: doc.item,
      score,
      matchedTerms,
      retrievalMethod: "bm25" as const,
    };
  }).sort((a, b) => b.score - a.score);
}

export function rankProjectItems<T>(
  items: T[],
  query: string,
  options: ProjectRelevanceOptions<T>,
): T[] {
  return rankProjectItemsWithEvidence(items, query, options).map(result => result.item);
}

/**
 * Memory rows are fetched newest-first. Keep the newest version of each
 * project/type/title note so duplicate saves do not consume context budget.
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

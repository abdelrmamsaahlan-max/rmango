export type SourceCodeMatch = {
  line: number;
  score: number;
  snippet: string;
};

const STOP_WORDS = new Set([
  "a", "an", "and", "are", "as", "at", "be", "by", "can", "do", "does", "for",
  "from", "how", "i", "in", "is", "it", "me", "my", "of", "on", "or", "our",
  "show", "tell", "that", "the", "their", "this", "to", "where", "which", "who",
  "why", "with", "you", "your", "find", "search", "look", "for", "code", "file",
  "files", "script", "scripts", "project", "implementation", "implemented",
]);

function normalizeWords(value: string): string[] {
  const separated = value.replace(/([a-z0-9])([A-Z])/g, "$1 $2").toLowerCase();
  return Array.from(new Set(
    separated.match(/[a-z0-9_]{2,}/g) || [],
  )).filter(term => !STOP_WORDS.has(term)).slice(0, 10);
}

export function scoreSourcePath(relativePath: string, query: string): number {
  const path = relativePath.replace(/\\/g, "/").toLowerCase();
  const normalizedQuery = query.trim().toLowerCase();
  if (!normalizedQuery) return 0;
  let score = path.includes(normalizedQuery) ? 10 : 0;
  for (const term of normalizeWords(query)) {
    if (path.includes(term)) score += 2;
  }
  return score;
}

export function searchSourceContent(
  relativePath: string,
  source: string,
  query: string,
  maxMatches = 3,
): SourceCodeMatch[] {
  const normalizedQuery = query.trim().toLowerCase();
  const terms = normalizeWords(query);
  if (!normalizedQuery || terms.length === 0 || !source) return [];

  const lines = source.replace(/\r\n?/g, "\n").split("\n");
  const candidates: SourceCodeMatch[] = [];

  for (let index = 0; index < lines.length; index++) {
    const line = lines[index].slice(0, 2_000);
    const lower = line.toLowerCase();
    let score = lower.includes(normalizedQuery) ? 8 : 0;
    let hitCount = 0;

    for (const term of terms) {
      if (!lower.includes(term)) continue;
      hitCount += 1;
      score += 2;
      const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp("(^|[^a-z0-9_])" + escaped + "($|[^a-z0-9_])", "i").test(line)) {
        score += 1;
      }
    }

    if (hitCount === 0) continue;
    if (hitCount > 1) score += hitCount;
    candidates.push({ line: index + 1, score, snippet: "" });
  }

  candidates.sort((a, b) => b.score - a.score || a.line - b.line);
  const chosen = candidates.slice(0, Math.max(1, Math.min(6, maxMatches)));
  return chosen.map(match => {
    const start = Math.max(0, match.line - 3);
    const end = Math.min(lines.length, match.line + 2);
    const snippet = lines.slice(start, end).map((value, offset) => {
      const number = start + offset + 1;
      return String(number).padStart(5, " ") + " | " + value.slice(0, 260);
    }).join("\n").slice(0, 1_500);
    return { ...match, snippet };
  });
}

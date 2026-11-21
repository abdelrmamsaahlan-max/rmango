import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

export type SelectedProjectContext = {
  project: {
    id: string;
    name: string;
    description: string;
    updatedAt: string;
  };
  files: Array<{
    id: string;
    path: string;
    name: string;
    mimeType: string;
    sizeBytes: number;
    sha256: string | null;
  }>;
  manifestTruncated: boolean;
  memories: Array<{
    id: string;
    type: string;
    title: string;
    content: string;
    sourceRef: string | null;
    updatedAt: string;
  }>;
};

/**
 * Fetches only metadata for a project owned by the authenticated user.
 * File contents are deliberately retrieved on-demand through read_project_file.
 */
export async function loadSelectedProjectContext(
  supabase: SupabaseClient,
  ownerId: string,
  projectId: string,
  query = "",
): Promise<SelectedProjectContext | null> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,name,description,updated_at")
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (projectError) throw new Error("Could not load selected project metadata.");
  if (!project) return null;

  const manifestLimit = 80;
  const { data: files, error: filesError } = await supabase
    .from("project_files")
    .select("id,relative_path,file_name,mime_type,size_bytes,sha256")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("relative_path", { ascending: true })
    .limit(manifestLimit + 1);

  if (filesError) throw new Error("Could not load the selected project's file manifest.");

  const { data: memories, error: memoriesError } = await supabase
    .from("project_memories")
    .select("id,memory_type,title,content,source_ref,updated_at")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(60);

  if (memoriesError) throw new Error("Could not load the selected project's saved memories.");

  const rows = files || [];
  const stopWords = new Set(["the", "and", "for", "with", "that", "this", "from", "what", "when", "where", "why", "how", "can", "could", "would", "should", "make", "build", "create", "please", "about", "into", "your", "have", "need", "want", "there", "then", "them", "they", "our"]);
  const queryTerms = Array.from(new Set(
    (query.toLocaleLowerCase().match(/[a-z0-9_]{3,}/g) || []).filter(term => !stopWords.has(term)),
  )).slice(0, 32);
  const intentText = query.toLocaleLowerCase();
  const memoryTypeBoost = (type: string): number => {
    if (type === "decision" && /\\b(prefer|must|constraint|don't want|avoid|decision|should not)\\b/i.test(intentText)) return 2.5;
    if (type === "architecture" && /\\b(architecture|system|module|service|integrat|structure|workflow)\\b/i.test(intentText)) return 2.5;
    if (type === "bug" && /\\b(bug|broken|error|fix|not working|doesn't work|issue|crash)\\b/i.test(intentText)) return 3;
    if (type === "feature" && /\\b(build|implement|add|feature|upgrade|improve)\\b/i.test(intentText)) return 1.8;
    if (type === "concept" && /\\b(design|concept|idea|game loop|player experience)\\b/i.test(intentText)) return 1.8;
    if (type === "task" && /\\b(task|todo|next|remaining|pending)\\b/i.test(intentText)) return 1.5;
    return 0;
  };
  const rankedMemories = (memories || []).map((memory, index) => {
    const title = String(memory.title || "").toLocaleLowerCase();
    const content = String(memory.content || "").toLocaleLowerCase();
    const titleMatches = queryTerms.filter(term => title.includes(term)).length;
    const contentMatches = queryTerms.filter(term => content.includes(term)).length;
    const relevance = titleMatches * 4 + Math.min(8, contentMatches) + memoryTypeBoost(String(memory.memory_type || ""));
    return { memory, score: relevance, recency: index };
  }).sort((a, b) => b.score - a.score || a.recency - b.recency);
  let memoryCharactersRemaining = 16_000;
  const boundedMemories = rankedMemories.slice(0, 24).flatMap(({ memory }) => {
    if (memoryCharactersRemaining <= 0) return [];
    const content = String(memory.content || "").slice(0, Math.min(1_500, memoryCharactersRemaining));
    memoryCharactersRemaining -= content.length;
    return [{
      id: memory.id,
      type: String(memory.memory_type || "note").slice(0, 40),
      title: String(memory.title || "").slice(0, 160),
      content,
      sourceRef: memory.source_ref ? String(memory.source_ref).slice(0, 300) : null,
      updatedAt: String(memory.updated_at || ""),
    }];
  });
  return {
    project: {
      id: project.id,
      name: String(project.name || "").slice(0, 120),
      description: String(project.description || "").slice(0, 1000),
      updatedAt: project.updated_at,
    },
    files: rows.slice(0, manifestLimit).map(file => ({
      id: file.id,
      path: String(file.relative_path || "").slice(0, 500),
      name: String(file.file_name || "").slice(0, 200),
      mimeType: String(file.mime_type || "application/octet-stream").slice(0, 120),
      sizeBytes: Math.max(0, Number(file.size_bytes) || 0),
      sha256: file.sha256 ? String(file.sha256).slice(0, 64) : null,
    })),
    manifestTruncated: rows.length > manifestLimit,
    memories: boundedMemories,
  };
}

/**
 * JSON is escaped by JSON.stringify. Consumers must still treat every value
 * as untrusted metadata and must fetch/inspect file contents with a tool.
 */
export function formatSelectedProjectContext(context: SelectedProjectContext): string {
  return [
    "BEGIN_RMANGO_SELECTED_PROJECT_METADATA_UNTRUSTED_JSON",
    JSON.stringify(context),
    "END_RMANGO_SELECTED_PROJECT_METADATA_UNTRUSTED_JSON",
  ].join("\n");
}

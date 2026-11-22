import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import {
  deduplicateProjectMemories,
  rankProjectItemsWithEvidence,
  tokenizeProjectQuery,
} from "./project-relevance";

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
  retrieval: {
    method: "bm25";
    queryTerms: string[];
    fileCandidates: number;
    filesWithMatches: number;
    memoryCandidates: number;
    memoriesWithMatches: number;
    candidateWindowTruncated: boolean;
  };
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
 * Fetches owner-checked metadata only, then ranks the bounded candidate window
 * against the active request. File contents remain on-demand through
 * read_project_file; BM25 metadata matches are navigation hints, not proof.
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
  const candidateLimit = 500;
  const { data: files, error: filesError } = await supabase
    .from("project_files")
    .select("id,relative_path,file_name,mime_type,size_bytes,sha256")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("relative_path", { ascending: true })
    .limit(candidateLimit + 1);

  if (filesError) throw new Error("Could not load the selected project's file manifest.");

  const { data: memories, error: memoriesError } = await supabase
    .from("project_memories")
    .select("id,memory_type,title,content,source_ref,updated_at")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(60);

  if (memoriesError) throw new Error("Could not load the selected project's saved memories.");

  const fileRows = files || [];
  const fileEvidence = rankProjectItemsWithEvidence(fileRows, query, {
    getText: file => [file.relative_path, file.file_name].join(" "),
  });
  const selectedFiles = fileEvidence.slice(0, manifestLimit).map(result => result.item);

  const distinctMemories = deduplicateProjectMemories(memories || []);
  const memoryEvidence = rankProjectItemsWithEvidence(distinctMemories, query, {
    getText: memory => [
      memory.memory_type,
      memory.title,
      String(memory.content || "").slice(0, 2_000),
      memory.source_ref,
    ].join(" "),
    updatedAt: memory => memory.updated_at,
  });

  let memoryCharactersRemaining = 16_000;
  const boundedMemories = memoryEvidence.slice(0, 20).flatMap(({ item: memory }) => {
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
      description: String(project.description || "").slice(0, 1_000),
      updatedAt: project.updated_at,
    },
    files: selectedFiles.map(file => ({
      id: file.id,
      path: String(file.relative_path || "").slice(0, 500),
      name: String(file.file_name || "").slice(0, 200),
      mimeType: String(file.mime_type || "application/octet-stream").slice(0, 120),
      sizeBytes: Math.max(0, Number(file.size_bytes) || 0),
      sha256: file.sha256 ? String(file.sha256).slice(0, 64) : null,
    })),
    manifestTruncated: fileRows.length > manifestLimit,
    retrieval: {
      method: "bm25",
      queryTerms: tokenizeProjectQuery(query).slice(0, 16),
      fileCandidates: fileRows.length,
      filesWithMatches: fileEvidence.filter(result => result.matchedTerms.length > 0).length,
      memoryCandidates: distinctMemories.length,
      memoriesWithMatches: memoryEvidence.filter(result => result.matchedTerms.length > 0).length,
      candidateWindowTruncated: fileRows.length > candidateLimit,
    },
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

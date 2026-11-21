import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deduplicateProjectMemories, rankProjectItems } from "@/lib/ai/project-relevance";

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
  taskPrompt = "",
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
  // Fetch metadata only, then rank paths against this task. Do not download
  // project file contents while constructing the default context.
  const { data: files, error: filesError } = await supabase
    .from("project_files")
    .select("id,relative_path,file_name,mime_type,size_bytes,sha256")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("relative_path", { ascending: true })
    .limit(501);

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
  const rankedFiles = rankProjectItems(rows, taskPrompt, {
    getText: file => [file.relative_path, file.file_name].filter(Boolean).join(" "),
  }).slice(0, manifestLimit);
  const rankedMemories = deduplicateProjectMemories(memories || []);
  const selectedMemories = rankProjectItems(rankedMemories, taskPrompt, {
    getText: memory => [memory.memory_type, memory.title, memory.content, memory.source_ref]
      .filter(Boolean).join(" "),
    updatedAt: memory => memory.updated_at,
  }).slice(0, 20);

  let memoryCharactersRemaining = 16_000;
  const boundedMemories = selectedMemories.flatMap(memory => {
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
    files: rankedFiles.map(file => ({
      id: file.id,
      path: String(file.relative_path || "").slice(0, 500),
      name: String(file.file_name || "").slice(0, 200),
      mimeType: String(file.mime_type || "application/octet-stream").slice(0, 120),
      sizeBytes: Math.max(0, Number(file.size_bytes) || 0),
      sha256: file.sha256 ? String(file.sha256).slice(0, 64) : null,
    })),
    // If the metadata cap was reached, additional files may exist outside this
    // ranked sample. The model should use search_project_files for deeper lookup.
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

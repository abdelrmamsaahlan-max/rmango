import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";
import { deduplicateProjectMemories, rankProjectItems, rankProjectItemsWithEvidence } from "@/lib/ai/project-relevance";

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
    freshness: "recent" | "aging" | "stale";
    provenance: "legacy_unverified" | "model_unverified" | "source_excerpt";
    verificationStatus: "unverified" | "excerpt_present" | "source_changed" | "source_deleted";
    confidence: "unverified" | "source_excerpt_present";
    revisionCount: number | null;
  }>;
  retrieval: {
    method: "bm25+dependency-graph" | "bm25";
    fileCandidates: number;
    fileMatches: number;
    dependencyExpandedFiles: number;
    memoryCandidates: number;
    memoryMatches: number;
    graphAvailable: boolean;
  };
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
  budget: { maxFiles?: number; maxMemories?: number; maxMemoryCharacters?: number } = {},
): Promise<SelectedProjectContext | null> {
  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id,name,description,updated_at")
    .eq("id", projectId)
    .eq("owner_id", ownerId)
    .maybeSingle();

  if (projectError) throw new Error("Could not load selected project metadata.");
  if (!project) return null;

  const manifestLimit = Math.max(0, Math.min(80, Math.floor(budget.maxFiles ?? 32)));
  const memoryLimit = Math.max(0, Math.min(20, Math.floor(budget.maxMemories ?? 12)));
  const memoryCharacterLimit = Math.max(0, Math.min(16_000, Math.floor(budget.maxMemoryCharacters ?? 10_000)));
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

  const extendedMemoryQuery = await supabase
    .from("project_memories")
    .select("id,memory_type,title,content,source_ref,updated_at,provenance,verification_status,confidence,revision_count")
    .eq("project_id", projectId)
    .eq("owner_id", ownerId)
    .order("updated_at", { ascending: false })
    .limit(60);
  const provenanceMissing = Boolean(extendedMemoryQuery.error && (
    extendedMemoryQuery.error.code === "PGRST204" ||
    extendedMemoryQuery.error.code === "42703" ||
    /schema cache|column .* does not exist/i.test(extendedMemoryQuery.error.message || "")
  ));
  const legacyMemoryQuery = provenanceMissing
    ? await supabase.from("project_memories")
        .select("id,memory_type,title,content,source_ref,updated_at")
        .eq("project_id", projectId)
        .eq("owner_id", ownerId)
        .order("updated_at", { ascending: false })
        .limit(60)
    : null;
  const memories = provenanceMissing ? legacyMemoryQuery?.data : extendedMemoryQuery.data;
  const memoriesError = provenanceMissing ? legacyMemoryQuery?.error : extendedMemoryQuery.error;
  const provenanceAvailable = !provenanceMissing && !extendedMemoryQuery.error;

  if (memoriesError) throw new Error("Could not load the selected project's saved memories.");

  const rows = files || [];
  const fileEvidence = rankProjectItemsWithEvidence(rows, taskPrompt, {
    getText: file => [file.relative_path, file.file_name].filter(Boolean).join(" "),
  });
  const selectedById = new Map<string, (typeof rows)[number]>();
  const directLimit = manifestLimit > 0 ? Math.max(1, Math.ceil(manifestLimit * 0.7)) : 0;
  for (const item of fileEvidence.slice(0, directLimit)) selectedById.set(item.item.id, item.item);

  // Expand high-confidence file matches through the structural graph when the
  // migration is installed. Missing graph tables are a supported partial-index
  // state and must not make ordinary project context unavailable.
  let graphAvailable = false;
  if (selectedById.size > 0 && manifestLimit > selectedById.size) {
    const { data: edges, error: edgeError } = await supabase
      .from("project_file_edges")
      .select("source_file_id,target_hint")
      .eq("project_id", projectId)
      .eq("owner_id", ownerId)
      .limit(2_500);
    if (!edgeError && Array.isArray(edges)) {
      graphAvailable = true;
      const pathKey = (value: string) => value
        .replace(/\\\\/g, "/")
        .replace(/\\.(?:server|client)\\.(?:lua|luau)$|\\.(?:lua|luau|tsx?|jsx?|mjs|cjs)$/i, "")
        .toLocaleLowerCase();
      const fileById = new Map(rows.map(file => [file.id, file]));
      const fileByPath = new Map(rows.map(file => [pathKey(file.relative_path), file]));
      const anchorIds = new Set(selectedById.keys());
      const neighbours = new Map<string, number>();
      for (const edge of edges) {
        const target = typeof edge.target_hint === "string" ? fileByPath.get(pathKey(edge.target_hint)) : undefined;
        const source = fileById.get(edge.source_file_id);
        if (anchorIds.has(edge.source_file_id) && target && !selectedById.has(target.id)) {
          neighbours.set(target.id, (neighbours.get(target.id) || 0) + 1);
        }
        if (target && anchorIds.has(target.id) && source && !selectedById.has(source.id)) {
          neighbours.set(source.id, (neighbours.get(source.id) || 0) + 1);
        }
      }
      const byId = new Map(rows.map(file => [file.id, file]));
      for (const [id] of [...neighbours.entries()].sort((a, b) => b[1] - a[1])) {
        const file = byId.get(id);
        if (file && selectedById.size < manifestLimit) selectedById.set(id, file);
      }
    }
  }

  const selectedIds = new Set(selectedById.keys());
  for (const item of fileEvidence) {
    if (selectedById.size >= manifestLimit) break;
    if (!selectedIds.has(item.item.id)) {
      selectedById.set(item.item.id, item.item);
      selectedIds.add(item.item.id);
    }
  }
  const selectedFileRows = [...selectedById.values()];
  const rankedMemories = deduplicateProjectMemories(memories || []);
  const selectedMemories = rankProjectItemsWithEvidence(rankedMemories, taskPrompt, {
    getText: memory => [memory.memory_type, memory.title, memory.content, memory.source_ref]
      .filter(Boolean).join(" "),
    updatedAt: memory => memory.updated_at,
    boost: memory => memory.memory_type === "architecture" || memory.memory_type === "decision" || memory.memory_type === "bug"
      ? 0.15
      : 0,
  }).slice(0, memoryLimit);

  let memoryCharactersRemaining = memoryCharacterLimit;
  const boundedMemories = selectedMemories.flatMap(memory => {
    if (memoryCharactersRemaining <= 0) return [];
    const sourceMemory = memory.item;
    const content = String(sourceMemory.content || "").slice(0, Math.min(1_500, memoryCharactersRemaining));
    memoryCharactersRemaining -= content.length;
    const updatedAt = String(sourceMemory.updated_at || "");
    const ageDays = Number.isFinite(Date.parse(updatedAt))
      ? Math.max(0, (Date.now() - Date.parse(updatedAt)) / 86_400_000)
      : Number.POSITIVE_INFINITY;
    return [{
      id: sourceMemory.id,
      type: String(sourceMemory.memory_type || "note").slice(0, 40),
      title: String(sourceMemory.title || "").slice(0, 160),
      content,
      sourceRef: sourceMemory.source_ref ? String(sourceMemory.source_ref).slice(0, 300) : null,
      updatedAt,
      freshness: ageDays >= 180 ? "stale" as const : ageDays >= 60 ? "aging" as const : "recent" as const,
      provenance: provenanceAvailable
        ? String(sourceMemory.provenance || "legacy_unverified") as "legacy_unverified" | "model_unverified" | "source_excerpt"
        : "legacy_unverified",
      verificationStatus: provenanceAvailable
        ? String(sourceMemory.verification_status || "unverified") as "unverified" | "excerpt_present" | "source_changed" | "source_deleted"
        : "unverified",
      confidence: provenanceAvailable
        ? String(sourceMemory.confidence || "unverified") as "unverified" | "source_excerpt_present"
        : "unverified",
      revisionCount: provenanceAvailable ? Number(sourceMemory.revision_count || 0) : null,
    }];
  });
  return {
    project: {
      id: project.id,
      name: String(project.name || "").slice(0, 120),
      description: String(project.description || "").slice(0, 1000),
      updatedAt: project.updated_at,
    },
    files: selectedFileRows.map(file => {
      const evidence = fileEvidence.find(item => item.item.id === file.id);
      return {
        id: file.id,
        path: String(file.relative_path || "").slice(0, 500),
        name: String(file.file_name || "").slice(0, 200),
        mimeType: String(file.mime_type || "application/octet-stream").slice(0, 120),
        sizeBytes: Math.max(0, Number(file.size_bytes) || 0),
        sha256: file.sha256 ? String(file.sha256).slice(0, 64) : null,
        retrievalScore: evidence?.score ?? 0,
        matchedTerms: evidence?.matchedTerms ?? [],
        retrievedBy: evidence && evidence.score > 0 ? "text-match" : graphAvailable ? "dependency-neighbour" : "manifest-fallback",
      };
    }),
    // If the metadata cap was reached, additional files may exist outside this
    // ranked sample. The model should use search_project_files for deeper lookup.
    manifestTruncated: rows.length > selectedFileRows.length,
    memories: boundedMemories,
    retrieval: {
      method: graphAvailable ? "bm25+dependency-graph" : "bm25",
      fileCandidates: rows.length,
      fileMatches: fileEvidence.filter(item => item.score > 0).length,
      dependencyExpandedFiles: selectedFileRows.filter(file => !fileEvidence.some(item => item.item.id === file.id)).length,
      memoryCandidates: rankedMemories.length,
      memoryMatches: selectedMemories.filter(item => item.score > 0).length,
      graphAvailable,
    },
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

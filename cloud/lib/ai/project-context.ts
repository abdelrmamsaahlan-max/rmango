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
};

/**
 * Fetches only metadata for a project owned by the authenticated user.
 * File contents are deliberately retrieved on-demand through read_project_file.
 */
export async function loadSelectedProjectContext(
  supabase: SupabaseClient,
  ownerId: string,
  projectId: string,
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

  const rows = files || [];
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

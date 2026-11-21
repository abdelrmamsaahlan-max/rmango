import type { SupabaseClient } from "@supabase/supabase-js";
import { parseProjectSource } from "@/lib/ai/project-graph";

export async function indexCloudProjectFile(
  supabase: SupabaseClient,
  fileId: string,
  relativePath: string,
  source: string,
) {
  const parsed = parseProjectSource(relativePath, source);
  if (parsed.skippedReason) {
    return { indexed: false, symbolCount: 0, edgeCount: 0, reason: parsed.skippedReason };
  }
  const { data, error } = await supabase.rpc("replace_project_file_graph", {
    p_file_id: fileId,
    p_symbols: parsed.symbols,
    p_edges: parsed.edges,
  });
  if (error) {
    return {
      indexed: false,
      symbolCount: 0,
      edgeCount: 0,
      reason: error.code === "PGRST202" ? "graph_migration_required" : "graph_index_write_failed",
    };
  }
  const result = data && typeof data === "object" ? data as Record<string, unknown> : {};
  return {
    indexed: true,
    symbolCount: Number(result.symbols ?? parsed.symbols.length),
    edgeCount: Number(result.edges ?? parsed.edges.length),
  };
}

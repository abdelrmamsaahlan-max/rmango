import { NextResponse } from "next/server";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  request: Request,
  context: { params: Promise<{ projectId: string }> },
) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId } = await context.params;
  const { supabase, user } = auth!;

  const { data: project, error: projectError } = await supabase
    .from("projects").select("id").eq("id", projectId).eq("owner_id", user.id).maybeSingle();
  if (projectError || !project) return NextResponse.json({ error: "Cloud project not found." }, { status: 404 });

  const { data: checkpoints, error } = await supabase
    .from("project_checkpoints")
    .select("id,label,checkpoint_kind,status,created_at,restored_at,source_change_id")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Could not load project recovery points. Apply the checkpoint migration if this deployment has not been upgraded." }, { status: 503 });

  const checkpointIds = (checkpoints || []).map(item => item.id);
  let files: Array<Record<string, unknown>> = [];
  if (checkpointIds.length) {
    const { data, error: filesError } = await supabase
      .from("project_checkpoint_files")
      .select("id,checkpoint_id,relative_path,file_name,existed_before,original_sha256,applied_sha256,size_bytes")
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .in("checkpoint_id", checkpointIds)
      .order("relative_path", { ascending: true });
    if (filesError) return NextResponse.json({ error: "Could not load checkpoint file details." }, { status: 503 });
    files = data || [];
  }

  const byCheckpoint = new Map<string, Array<Record<string, unknown>>>();
  for (const file of files) {
    const id = String(file.checkpoint_id);
    const group = byCheckpoint.get(id) || [];
    group.push(file);
    byCheckpoint.set(id, group);
  }

  return NextResponse.json({
    checkpoints: (checkpoints || []).map(item => ({
      ...item,
      files: byCheckpoint.get(item.id) || [],
    })),
  });
}

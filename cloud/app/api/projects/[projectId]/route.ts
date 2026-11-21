import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const updateSchema = z.object({
  name: z.string().trim().min(1).max(100).optional(),
  description: z.string().trim().max(2000).optional(),
}).refine(value => value.name !== undefined || value.description !== undefined);

export async function GET(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId } = await params;
  if (!idSchema.safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });

  const { data, error } = await context!.supabase
    .from("projects")
    .select("id,name,description,created_at,updated_at")
    .eq("id", projectId)
    .eq("owner_id", context!.user.id)
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: "Cloud project not found." }, { status: 404 });
  return NextResponse.json({ project: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId } = await params;
  if (!idSchema.safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });

  let payload: z.infer<typeof updateSchema>;
  try { payload = updateSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Provide a valid project name or description." }, { status: 400 }); }

  const { data, error } = await context!.supabase
    .from("projects")
    .update({ ...payload, updated_at: new Date().toISOString() })
    .eq("id", projectId)
    .eq("owner_id", context!.user.id)
    .select("id,name,description,created_at,updated_at")
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: "Project not found or could not be updated." }, { status: 404 });
  return NextResponse.json({ project: data }, { headers: { "Cache-Control": "private, no-store" } });
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId } = await params;
  if (!idSchema.safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });

  const { data: project, error: projectError } = await context!.supabase
    .from("projects")
    .select("id,name")
    .eq("id", projectId)
    .eq("owner_id", context!.user.id)
    .maybeSingle();
  if (projectError || !project) return NextResponse.json({ error: "Project not found." }, { status: 404 });

  const { data: files, error: filesError } = await context!.supabase
    .from("project_files")
    .select("storage_path")
    .eq("project_id", projectId)
    .eq("owner_id", context!.user.id)
    .limit(5_000);
  if (filesError) return NextResponse.json({ error: "Could not inspect project storage before deletion." }, { status: 503 });

  const paths = (files || []).map(file => String(file.storage_path || "")).filter(Boolean);

  // Checkpoints store backup objects outside project_files, so include those
  // private objects in project deletion rather than leaving orphaned snapshots.
  const { data: checkpointFiles, error: checkpointFilesError } = await context!.supabase
    .from("project_checkpoint_files")
    .select("backup_storage_path")
    .eq("project_id", projectId)
    .eq("owner_id", context!.user.id)
    .limit(10_000);
  if (checkpointFilesError) {
    return NextResponse.json({ error: "Could not inspect recovery storage before deletion." }, { status: 503 });
  }
  const backupPaths = (checkpointFiles || [])
    .map(file => String(file.backup_storage_path || ""))
    .filter(Boolean);
  const storagePaths = [...paths, ...backupPaths];
  for (let offset = 0; offset < storagePaths.length; offset += 100) {
    const { error } = await context!.supabase.storage.from("rmango-files").remove(storagePaths.slice(offset, offset + 100));
    if (error) {
      return NextResponse.json({
        error: "Could not remove all private project files. The project database record was kept so you can retry safely.",
      }, { status: 503 });
    }
  }

  const { error: deleteError } = await context!.supabase
    .from("projects")
    .delete()
    .eq("id", projectId)
    .eq("owner_id", context!.user.id);

  if (deleteError) {
    return NextResponse.json({
      error: "The private files were removed, but the project record could not be deleted. Refresh the project list and retry.",
    }, { status: 503 });
  }

  return NextResponse.json({ ok: true, deletedProjectId: projectId, deletedFileCount: paths.length, deletedCheckpointObjectCount: backupPaths.length });
}

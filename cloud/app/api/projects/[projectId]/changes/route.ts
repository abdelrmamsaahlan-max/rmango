import { NextResponse } from "next/server";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId } = await context.params;
  const { supabase, user } = auth!;

  const { data: project, error: projectError } = await supabase
    .from("projects").select("id,name").eq("id", projectId).eq("owner_id", user.id).maybeSingle();
  if (projectError || !project) return NextResponse.json({ error: "Cloud project not found." }, { status: 404 });

  const { data, error } = await supabase
    .from("project_changes")
    .select("id,relative_path,file_name,change_summary,original_sha256,proposed_sha256,status,created_at,reviewed_at")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(100);
  if (error) return NextResponse.json({ error: "Could not load proposed project changes." }, { status: 503 });
  return NextResponse.json({ project, changes: data || [] });
}

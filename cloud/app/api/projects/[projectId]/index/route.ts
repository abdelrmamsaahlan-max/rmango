import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";
import { getAuthErrorResponse } from "@/lib/supabase";
import { runProjectIndexWorkflow } from "@/workflows/project-index";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });

  const { supabase, user } = auth!;
  const { data: project, error: projectError } = await supabase.from("projects")
    .select("id,name")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (projectError || !project) return NextResponse.json({ error: "That cloud project was not found." }, { status: 404 });

  const [{ data: latestRun }, { count: fileCount }, { count: indexedCount }, { count: dependencyCount }, { count: symbolCount }] = await Promise.all([
    supabase.from("project_index_runs")
      .select("id,status,file_count,indexed_count,dependency_count,symbol_count,error_count,error,started_at,completed_at")
      .eq("project_id", projectId)
      .eq("owner_id", user.id)
      .order("started_at", { ascending: false })
      .limit(1)
      .maybeSingle(),
    supabase.from("project_files").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("owner_id", user.id),
    supabase.from("project_files").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("owner_id", user.id).gte("index_version", 1),
    supabase.from("project_file_dependencies").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("owner_id", user.id),
    supabase.from("project_file_symbols").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("owner_id", user.id),
  ]);

  return NextResponse.json({
    project,
    index: {
      latestRun: latestRun || null,
      fileCount: fileCount || 0,
      indexedCount: indexedCount || 0,
      dependencyCount: dependencyCount || 0,
      symbolCount: symbolCount || 0,
      coverage: fileCount ? Math.round(((indexedCount || 0) / fileCount) * 100) : 0,
    },
  });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId } = await context.params;
  if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });

  const { supabase, user } = auth!;
  const { data: project, error: projectError } = await supabase.from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (projectError || !project) return NextResponse.json({ error: "That cloud project was not found." }, { status: 404 });

  const { data: activeRun } = await supabase.from("project_index_runs")
    .select("id,status,started_at")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .eq("status", "running")
    .order("started_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (activeRun) return NextResponse.json({ run: activeRun, alreadyRunning: true }, { status: 202 });

  try {
    const run = await start(runProjectIndexWorkflow, [projectId, user.id]);
    return NextResponse.json({ workflowRunId: run.runId, status: "running" }, { status: 202 });
  } catch (error) {
    return NextResponse.json({
      error: error instanceof Error ? error.message : "Could not start project indexing.",
    }, { status: 503 });
  }
}

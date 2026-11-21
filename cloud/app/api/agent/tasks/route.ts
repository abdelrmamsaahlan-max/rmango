import { NextResponse } from "next/server";
import { start } from "workflow/api";
import { z } from "zod";
import { createAdminClient, getAuthErrorResponse } from "@/lib/supabase";
import { isModelProfile, type ModelProfile } from "@/lib/ai/models";
import { runAgentTask } from "@/workflows/agent-task";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  projectId: z.string().uuid(),
  conversationId: z.string().uuid().optional(),
  taskText: z.string().trim().min(8).max(12_000),
  profile: z.enum(["fast", "developer", "think", "vision", "agent"]).default("agent"),
});

async function appendEvent(ownerId: string, taskId: string, eventType: string, message: string) {
  const admin = createAdminClient();
  await admin.from("agent_events").insert({ owner_id: ownerId, task_id: taskId, event_type: eventType, message });
}

export async function GET(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { supabase, user } = context!;
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  let query = supabase.from("agent_tasks")
    .select("id,project_id,conversation_id,workflow_run_id,status,task_text,result,error,created_at,updated_at")
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(30);
  if (projectId) {
    if (!z.string().uuid().safeParse(projectId).success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
    query = query.eq("project_id", projectId);
  }
  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load your agent tasks." }, { status: 503 });
  return NextResponse.json({ tasks: data || [] });
}

export async function POST(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { supabase, user } = context!;

  let payload: z.infer<typeof createSchema>;
  try { payload = createSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Provide a project, a task description, and a valid model profile." }, { status: 400 }); }

  const { data: project, error: projectError } = await supabase.from("projects")
    .select("id,name")
    .eq("id", payload.projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (projectError || !project) return NextResponse.json({ error: "That cloud project does not belong to this account." }, { status: 404 });

  let conversationId = payload.conversationId;
  if (conversationId) {
    const { data: conversation, error } = await supabase.from("conversations")
      .select("id,project_id")
      .eq("id", conversationId)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (error || !conversation) return NextResponse.json({ error: "That conversation does not belong to this account." }, { status: 404 });
    if (conversation.project_id && conversation.project_id !== payload.projectId) {
      return NextResponse.json({ error: "The selected conversation belongs to a different project." }, { status: 409 });
    }
    if (!conversation.project_id) {
      const { error: linkError } = await supabase.from("conversations")
        .update({ project_id: payload.projectId })
        .eq("id", conversationId)
        .eq("owner_id", user.id)
        .is("project_id", null);
      if (linkError) return NextResponse.json({ error: "Could not link the task to the conversation." }, { status: 503 });
    }
  } else {
    const { data: conversation, error } = await supabase.from("conversations").insert({
      owner_id: user.id,
      project_id: payload.projectId,
      title: payload.taskText.replace(/\s+/g, " ").slice(0, 80),
      model_profile: payload.profile,
    }).select("id").single();
    if (error || !conversation) return NextResponse.json({ error: "Could not create a conversation for this task." }, { status: 503 });
    conversationId = conversation.id;
  }

  const { data: task, error: taskError } = await supabase.from("agent_tasks").insert({
    owner_id: user.id,
    project_id: payload.projectId,
    conversation_id: conversationId,
    status: "queued",
    task_text: payload.taskText,
    result: { modelProfile: payload.profile, stage: "queued" },
  }).select("id,project_id,conversation_id,status,task_text,result,created_at,updated_at").single();

  if (taskError || !task) return NextResponse.json({ error: "Could not create the durable agent task." }, { status: 503 });
  await appendEvent(user.id, task.id, "queued", "Task accepted and added to the durable workflow queue.");

  try {
    const run = await start(runAgentTask, [task.id, user.id, payload.profile as ModelProfile]);
    const { error: runUpdateError } = await supabase.from("agent_tasks")
      .update({ workflow_run_id: run.runId, updated_at: new Date().toISOString() })
      .eq("id", task.id)
      .eq("owner_id", user.id);
    if (runUpdateError) {
      await appendEvent(user.id, task.id, "warning", "Workflow started, but its run ID could not be recorded.");
    }
    return NextResponse.json({
      task: { ...task, workflow_run_id: run.runId },
      conversationId,
      workflowRunId: run.runId,
    }, { status: 202 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not start the workflow.";
    await supabase.from("agent_tasks").update({
      status: "failed",
      error: message.slice(0, 2_000),
      updated_at: new Date().toISOString(),
    }).eq("id", task.id).eq("owner_id", user.id);
    await appendEvent(user.id, task.id, "failed", message);
    return NextResponse.json({ error: "The task was saved but its workflow could not be started: " + message, taskId: task.id }, { status: 503 });
  }
}

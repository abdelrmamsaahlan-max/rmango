import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resumeHook, start } from "workflow/api";
import { z } from "zod";
import { createAdminClient, getAuthErrorResponse } from "@/lib/supabase";
import { isModelProfile, type ModelProfile } from "@/lib/ai/models";
import { runAgentTask } from "@/workflows/agent-task";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const actionSchema = z.object({ action: z.enum(["pause", "resume", "cancel", "retry"]) });

async function appendEvent(ownerId: string, taskId: string, eventType: string, message: string) {
  const admin = createAdminClient();
  await admin.from("agent_events").insert({ owner_id: ownerId, task_id: taskId, event_type: eventType, message });
}

async function cancelPendingStudioCommands(ownerId: string, taskId: string, reason: string) {
  const admin = createAdminClient();
  const { data: commands } = await admin.from("studio_commands")
    .select("id")
    .eq("task_id", taskId)
    .eq("owner_id", ownerId)
    .in("execution_status", ["queued", "running"])
    .limit(30);
  for (const command of commands || []) {
    await admin.from("studio_commands")
      .update({
        execution_status: "cancelled",
        error: reason.slice(0, 1_000),
        updated_at: new Date().toISOString(),
      })
      .eq("id", command.id)
      .eq("owner_id", ownerId)
      .in("execution_status", ["queued", "running"]);
    try {
      await resumeHook(command.id, { ok: false, error: reason });
    } catch {
      // The local result may already have resumed the hook.
    }
  }
}
export async function GET(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { taskId } = await context.params;
  if (!z.string().uuid().safeParse(taskId).success) return NextResponse.json({ error: "Invalid task ID." }, { status: 400 });

  const { supabase, user } = auth!;
  const { data: task, error } = await supabase.from("agent_tasks")
    .select("id,project_id,conversation_id,workflow_run_id,status,task_text,result,error,created_at,updated_at")
    .eq("id", taskId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (error || !task) return NextResponse.json({ error: "Agent task not found." }, { status: 404 });

  const { data: events, error: eventError } = await supabase.from("agent_events")
    .select("id,event_type,message,data,created_at")
    .eq("task_id", taskId)
    .eq("owner_id", user.id)
    .order("created_at", { ascending: false })
    .limit(200);
  if (eventError) return NextResponse.json({ error: "Could not load task events." }, { status: 503 });
  return NextResponse.json({ task, events: (events || []).reverse() });
}

export async function PATCH(request: Request, context: { params: Promise<{ taskId: string }> }) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { taskId } = await context.params;
  if (!z.string().uuid().safeParse(taskId).success) return NextResponse.json({ error: "Invalid task ID." }, { status: 400 });

  let payload: z.infer<typeof actionSchema>;
  try { payload = actionSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Choose pause, resume, cancel or retry." }, { status: 400 }); }

  const { supabase, user } = auth!;
  const { data: task, error: taskError } = await supabase.from("agent_tasks")
    .select("id,owner_id,project_id,conversation_id,status,task_text,result")
    .eq("id", taskId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (taskError || !task) return NextResponse.json({ error: "Agent task not found." }, { status: 404 });

  if (payload.action === "pause") {
    if (!["queued", "running", "waiting_approval"].includes(task.status)) {
      return NextResponse.json({ error: "Only queued or running tasks can be paused." }, { status: 409 });
    }
    const { data, error } = await supabase.from("agent_tasks")
      .update({ status: "paused", updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("owner_id", user.id)
      .in("status", ["queued", "running", "waiting_approval"])
      .select("id")
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: "The task changed before it could be paused. Refresh and try again." }, { status: 409 });
    await cancelPendingStudioCommands(user.id, taskId, "Task paused by the user. The pending Studio tool call was cancelled.");
    await appendEvent(user.id, taskId, "paused", "Pause requested. Pending Studio tools were cancelled and the workflow will resume from its saved checkpoint.");
    return NextResponse.json({ ok: true, status: "paused", checkpointPause: true });
  }

  if (payload.action === "cancel") {
    if (task.status === "cancelled") return NextResponse.json({ ok: true, status: "cancelled" });
    if (!["queued", "running", "paused", "waiting_approval"].includes(task.status)) {
      return NextResponse.json({ error: "This task can no longer be cancelled." }, { status: 409 });
    }
    const { data, error } = await supabase.from("agent_tasks")
      .update({ status: "cancelled", updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("owner_id", user.id)
      .in("status", ["queued", "running", "paused", "waiting_approval"])
      .select("id")
      .maybeSingle();
    if (error || !data) return NextResponse.json({ error: "The task changed before cancellation could be saved." }, { status: 409 });
    await cancelPendingStudioCommands(user.id, taskId, "Task cancelled by the user. The pending Studio tool call was cancelled.");
    await appendEvent(user.id, taskId, "cancelled", "Cancellation saved. Pending Studio commands were cancelled and the durable workflow was signalled to stop.");
    return NextResponse.json({ ok: true, status: "cancelled", checkpointCancel: true });
  }

  const isResume = payload.action === "resume";
  const expectedStatus = isResume ? "paused" : "failed";
  if (task.status !== expectedStatus) {
    return NextResponse.json({ error: isResume ? "Only paused tasks can be resumed." : "Only failed tasks can be retried." }, { status: 409 });
  }

  const previousResult = (task.result || {}) as Record<string, unknown>;
  const storedProfile = previousResult.modelProfile;
  const profile: ModelProfile = isModelProfile(storedProfile) ? storedProfile : "agent";
  const runToken = randomUUID();
  const nextResult = isResume
    ? { ...previousResult, modelProfile: profile, runToken }
    : { modelProfile: profile, stage: "queued", runToken };

  const { data: queued, error: queueError } = await supabase.from("agent_tasks")
    .update({
      status: "queued",
      error: null,
      result: nextResult,
      updated_at: new Date().toISOString(),
    })
    .eq("id", taskId)
    .eq("owner_id", user.id)
    .eq("status", expectedStatus)
    .select("id")
    .maybeSingle();
  if (queueError || !queued) return NextResponse.json({ error: "The task changed before it could be queued again." }, { status: 409 });

  try {
    const run = await start(runAgentTask, [taskId, user.id, profile, runToken]);
    const { error: runError } = await supabase.from("agent_tasks")
      .update({ workflow_run_id: run.runId, updated_at: new Date().toISOString() })
      .eq("id", taskId)
      .eq("owner_id", user.id);
    if (runError) await appendEvent(user.id, taskId, "warning", "Workflow was restarted, but its run ID could not be recorded.");
    await appendEvent(user.id, taskId, isResume ? "resumed" : "retried", isResume ? "Resumed from the last saved workflow checkpoint." : "Started a new attempt after the previous failure.");
    return NextResponse.json({ ok: true, status: "queued", workflowRunId: run.runId });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Could not restart the task workflow.";
    await supabase.from("agent_tasks").update({
      status: expectedStatus,
      error: message.slice(0, 2_000),
      updated_at: new Date().toISOString(),
    }).eq("id", taskId).eq("owner_id", user.id).eq("status", "queued");
    await appendEvent(user.id, taskId, "restart_failed", message);
    return NextResponse.json({ error: "Could not restart the task: " + message }, { status: 503 });
  }
}

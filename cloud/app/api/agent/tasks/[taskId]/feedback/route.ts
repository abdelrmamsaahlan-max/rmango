import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const feedbackSchema = z.object({
  helpful: z.boolean(),
}).strict();

export async function POST(
  request: Request,
  context: { params: Promise<{ taskId: string }> },
) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;

  const { taskId } = await context.params;
  if (!z.string().uuid().safeParse(taskId).success) {
    return NextResponse.json({ error: "Invalid task ID." }, { status: 400 });
  }

  let payload: z.infer<typeof feedbackSchema>;
  try {
    payload = feedbackSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Choose helpful or not helpful." }, { status: 400 });
  }

  const { supabase, user } = auth!;
  const { data: task, error: taskError } = await supabase.from("agent_tasks")
    .select("id,owner_id,project_id,status")
    .eq("id", taskId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (taskError || !task) {
    return NextResponse.json({ error: "Agent task not found." }, { status: 404 });
  }
  if (task.status !== "completed" || !task.project_id) {
    return NextResponse.json({ error: "Feedback is available only after a completed project task." }, { status: 409 });
  }

  const updatedAt = new Date().toISOString();
  const admin = createAdminClient();
  const { error } = await admin.from("agent_learning_events").upsert({
    task_id: taskId,
    owner_id: user.id,
    project_id: task.project_id,
    signal_type: "user_feedback",
    signal_data: { helpful: payload.helpful },
    updated_at: updatedAt,
  }, { onConflict: "task_id,signal_type" });

  if (error) {
    return NextResponse.json({ error: "Could not save your feedback." }, { status: 503 });
  }

  return NextResponse.json({
    feedback: { helpful: payload.helpful, updated_at: updatedAt },
  });
}

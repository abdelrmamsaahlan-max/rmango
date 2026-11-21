import { NextResponse } from "next/server";
import { z } from "zod";
import { createAdminClient, getAuthErrorResponse } from "@/lib/supabase";
import { verifyConnector } from "@/lib/studio-connector";

export const runtime = "nodejs";

const schema = z.object({
  connectorId: z.string().uuid(),
  connectorSecret: z.string().min(32).max(256),
  commandId: z.string().uuid(),
  approved: z.boolean(),
});

export async function POST(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { supabase, user } = context!;

  let payload: z.infer<typeof schema>;
  try { payload = schema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Invalid Studio approval decision." }, { status: 400 }); }

  const connector = await verifyConnector(supabase, user, payload.connectorId, payload.connectorSecret);
  if (!connector) return NextResponse.json({ error: "Studio connector authentication failed." }, { status: 401 });

  const { data: command, error: commandError } = await supabase.from("studio_commands")
    .select("id,task_id,approval_status,execution_status")
    .eq("id", payload.commandId)
    .eq("connector_id", payload.connectorId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (commandError || !command) return NextResponse.json({ error: "Studio command not found." }, { status: 404 });
  if (command.execution_status !== "running" || command.approval_status !== "pending") {
    return NextResponse.json({ error: "That approval request is no longer pending." }, { status: 409 });
  }

  const approvalStatus = payload.approved ? "approved" : "denied";
  const { data: updated, error: updateError } = await supabase.from("studio_commands")
    .update({ approval_status: approvalStatus, updated_at: new Date().toISOString() })
    .eq("id", payload.commandId)
    .eq("connector_id", payload.connectorId)
    .eq("owner_id", user.id)
    .eq("execution_status", "running")
    .eq("approval_status", "pending")
    .select("id")
    .maybeSingle();
  if (updateError || !updated) return NextResponse.json({ error: "The Studio approval state changed before the decision was saved." }, { status: 409 });

  if (command.task_id) {
    const admin = createAdminClient();
    const { data: task } = await admin.from("agent_tasks")
      .select("id,status")
      .eq("id", command.task_id)
      .eq("owner_id", user.id)
      .maybeSingle();
    if (task?.status === "waiting_approval") {
      await admin.from("agent_tasks").update({
        status: "running",
        updated_at: new Date().toISOString(),
      }).eq("id", command.task_id).eq("owner_id", user.id).eq("status", "waiting_approval");
    }
    await admin.from("agent_events").insert({
      task_id: command.task_id,
      owner_id: user.id,
      event_type: payload.approved ? "approval_granted" : "approval_denied",
      message: payload.approved ? "Studio action approved in the desktop app." : "Studio action denied in the desktop app. The agent can recover or choose another approach.",
      data: { commandId: command.id },
    });
  }

  return NextResponse.json({ ok: true, approvalStatus });
}

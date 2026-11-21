import { NextResponse } from "next/server";
import { resumeHook } from "workflow/api";
import { z } from "zod";
import { createAdminClient, getAuthErrorResponse } from "@/lib/supabase";
import { verifyConnector } from "@/lib/studio-connector";

export const runtime = "nodejs";

const schema = z.object({
  connectorId: z.string().uuid(),
  connectorSecret: z.string().min(32).max(256),
  commandId: z.string().uuid(),
  ok: z.boolean(),
  result: z.unknown().optional(),
  error: z.string().max(4000).optional(),
});

export async function POST(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { supabase, user } = context!;

  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid Studio command result." }, { status: 400 });
  }

  const connector = await verifyConnector(supabase, user, payload.connectorId, payload.connectorSecret);
  if (!connector) return NextResponse.json({ error: "Studio connector authentication failed." }, { status: 401 });

  const { data, error } = await supabase
    .from("studio_commands")
    .update({
      execution_status: payload.ok ? "completed" : "failed",
      tool_result: payload.ok ? (payload.result ?? null) : null,
      error: payload.ok ? null : (payload.error || "The local Studio action failed."),
      updated_at: new Date().toISOString(),
    })
    .eq("id", payload.commandId)
    .eq("connector_id", payload.connectorId)
    .eq("owner_id", user.id)
    .eq("execution_status", "running")
    .select("id,task_id")
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json({ error: "That Studio command is no longer pending." }, { status: 409 });
  }

  let workflowResumed = false;
  try {
    await resumeHook(payload.commandId, payload.ok
      ? { ok: true, result: payload.result ?? null }
      : { ok: false, error: payload.error || "The local Studio tool failed." });
    workflowResumed = true;
  } catch {
    // The durable command row remains the source of truth if the workflow hook has expired.
  }

  if (data.task_id) {
    const admin = createAdminClient();
    await admin.from("agent_events").insert({
      task_id: data.task_id,
      owner_id: user.id,
      event_type: payload.ok ? "studio_tool_completed" : "studio_tool_failed",
      message: payload.ok ? "Roblox Studio completed the requested tool call." : "Roblox Studio returned an error for the requested tool call.",
      data: { commandId: payload.commandId, workflowResumed },
    });
  }

  return NextResponse.json({ ok: true, workflowResumed });
}

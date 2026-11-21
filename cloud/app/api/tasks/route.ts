import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;

  const url = new URL(request.url);
  const limitValue = Number(url.searchParams.get("limit") || 20);
  const limit = Number.isFinite(limitValue) ? Math.min(50, Math.max(1, Math.floor(limitValue))) : 20;
  const projectId = url.searchParams.get("projectId");

  let query = context!.supabase
    .from("agent_tasks")
    .select("id,project_id,conversation_id,status,task_text,result,error,created_at,updated_at")
    .eq("owner_id", context!.user.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (projectId) {
    const parsed = z.string().uuid().safeParse(projectId);
    if (!parsed.success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
    query = query.eq("project_id", parsed.data);
  }

  const { data: tasks, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load agent task history." }, { status: 503 });

  const ids = (tasks || []).map(task => task.id);
  let events: Array<Record<string, unknown>> = [];
  if (ids.length) {
    const { data, error: eventsError } = await context!.supabase
      .from("agent_events")
      .select("id,task_id,event_type,message,data,created_at")
      .eq("owner_id", context!.user.id)
      .in("task_id", ids)
      .order("created_at", { ascending: true })
      .limit(500);
    if (eventsError) return NextResponse.json({ error: "Could not load agent task events." }, { status: 503 });
    events = data || [];
  }

  const grouped = new Map<string, Array<Record<string, unknown>>>();
  for (const event of events) {
    const key = String(event.task_id || "");
    const rows = grouped.get(key) || [];
    rows.push(event);
    grouped.set(key, rows);
  }

  return NextResponse.json({
    tasks: (tasks || []).map(task => ({ ...task, events: grouped.get(task.id) || [] })),
  }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

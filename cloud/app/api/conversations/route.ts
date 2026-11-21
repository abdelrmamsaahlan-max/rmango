import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  title: z.string().trim().min(1).max(80).default("New chat"),
  projectId: z.string().uuid().nullable().optional(),
  modelProfile: z.enum(["fast", "developer", "think", "vision", "agent"]).default("developer"),
});

export async function GET(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;

  const url = new URL(request.url);
  const rawLimit = Number(url.searchParams.get("limit") || 30);
  const limit = Number.isFinite(rawLimit) ? Math.min(50, Math.max(1, Math.floor(rawLimit))) : 30;
  const projectId = url.searchParams.get("projectId");

  let query = context!.supabase
    .from("conversations")
    .select("id,project_id,title,model_profile,created_at,updated_at")
    .eq("owner_id", context!.user.id)
    .order("updated_at", { ascending: false })
    .limit(limit);

  if (projectId) {
    const parsed = z.string().uuid().safeParse(projectId);
    if (!parsed.success) return NextResponse.json({ error: "Invalid project ID." }, { status: 400 });
    query = query.eq("project_id", parsed.data);
  }

  const { data, error } = await query;
  if (error) return NextResponse.json({ error: "Could not load conversation history." }, { status: 503 });
  return NextResponse.json({ conversations: data || [] }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function POST(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;

  let body: z.infer<typeof createSchema>;
  try {
    body = createSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid conversation details." }, { status: 400 });
  }

  if (body.projectId) {
    const { data: project, error } = await context!.supabase
      .from("projects")
      .select("id")
      .eq("id", body.projectId)
      .eq("owner_id", context!.user.id)
      .maybeSingle();
    if (error || !project) return NextResponse.json({ error: "That project does not belong to this account." }, { status: 404 });
  }

  const { data, error } = await context!.supabase
    .from("conversations")
    .insert({
      owner_id: context!.user.id,
      project_id: body.projectId || null,
      title: body.title,
      model_profile: body.modelProfile,
    })
    .select("id,project_id,title,model_profile,created_at,updated_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Could not create the conversation." }, { status: 503 });
  return NextResponse.json({ conversation: data }, { status: 201, headers: { "Cache-Control": "private, no-store" } });
}

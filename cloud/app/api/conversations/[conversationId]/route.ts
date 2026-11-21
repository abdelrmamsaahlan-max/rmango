import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const idSchema = z.string().uuid();
const updateSchema = z.object({ title: z.string().trim().min(1).max(80) });

export async function GET(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;

  const { conversationId } = await params;
  if (!idSchema.safeParse(conversationId).success) {
    return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  }

  const { data: conversation, error: conversationError } = await context!.supabase
    .from("conversations")
    .select("id,project_id,title,model_profile,created_at,updated_at")
    .eq("id", conversationId)
    .eq("owner_id", context!.user.id)
    .maybeSingle();
  if (conversationError || !conversation) {
    return NextResponse.json({ error: "Conversation not found." }, { status: 404 });
  }

  const { data: messages, error: messagesError } = await context!.supabase
    .from("messages")
    .select("id,role,content,model_profile,created_at")
    .eq("conversation_id", conversationId)
    .eq("owner_id", context!.user.id)
    .in("role", ["user", "assistant"])
    .order("created_at", { ascending: true })
    .limit(100);

  if (messagesError) return NextResponse.json({ error: "Could not load the conversation messages." }, { status: 503 });
  return NextResponse.json({ conversation, messages: messages || [] }, {
    headers: { "Cache-Control": "private, no-store" },
  });
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ conversationId: string }> },
) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;

  const { conversationId } = await params;
  if (!idSchema.safeParse(conversationId).success) {
    return NextResponse.json({ error: "Invalid conversation ID." }, { status: 400 });
  }

  let body: z.infer<typeof updateSchema>;
  try { body = updateSchema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Invalid conversation title." }, { status: 400 }); }

  const { data, error } = await context!.supabase
    .from("conversations")
    .update({ title: body.title, updated_at: new Date().toISOString() })
    .eq("id", conversationId)
    .eq("owner_id", context!.user.id)
    .select("id,project_id,title,model_profile,created_at,updated_at")
    .maybeSingle();

  if (error || !data) return NextResponse.json({ error: "Could not rename this conversation." }, { status: 404 });
  return NextResponse.json({ conversation: data }, { headers: { "Cache-Control": "private, no-store" } });
}

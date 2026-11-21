import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const createSchema = z.object({
  name: z.string().trim().min(1).max(100),
  description: z.string().trim().max(2000).optional(),
});

export async function GET(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { supabase, user } = context!;
  const { data, error } = await supabase
    .from("projects")
    .select("id,name,description,created_at,updated_at")
    .eq("owner_id", user.id)
    .order("updated_at", { ascending: false })
    .limit(50);
  if (error) return NextResponse.json({ error: "Could not load your cloud projects." }, { status: 503 });
  return NextResponse.json({ projects: data || [] });
}

export async function POST(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { supabase, user } = context!;

  let payload: z.infer<typeof createSchema>;
  try {
    payload = createSchema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Project name must be between 1 and 100 characters." }, { status: 400 });
  }

  const { data, error } = await supabase
    .from("projects")
    .insert({
      owner_id: user.id,
      name: payload.name,
      description: payload.description || "Roblox project uploaded from Rmango Desktop.",
    })
    .select("id,name,description,created_at,updated_at")
    .single();

  if (error || !data) return NextResponse.json({ error: "Could not create the cloud project." }, { status: 503 });
  return NextResponse.json({ project: data }, { status: 201 });
}

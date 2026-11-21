import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthErrorResponse } from "@/lib/supabase";
import { verifyConnector } from "@/lib/studio-connector";

export const runtime = "nodejs";

const schema = z.object({
  connectorId: z.string().uuid(),
  connectorSecret: z.string().min(32).max(256),
});

export async function POST(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { supabase, user } = context!;

  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "Invalid connector disconnect request." }, { status: 400 });
  }

  const connector = await verifyConnector(supabase, user, payload.connectorId, payload.connectorSecret);
  if (!connector) return NextResponse.json({ error: "Studio connector authentication failed." }, { status: 401 });

  const { error } = await supabase.from("studio_connectors")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("id", payload.connectorId)
    .eq("owner_id", user.id);
  if (error) return NextResponse.json({ error: "Could not disconnect Studio." }, { status: 503 });
  return NextResponse.json({ ok: true });
}

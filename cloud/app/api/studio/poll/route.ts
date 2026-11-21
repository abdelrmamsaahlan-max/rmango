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
    return NextResponse.json({ error: "Invalid connector polling request." }, { status: 400 });
  }

  const connector = await verifyConnector(supabase, user, payload.connectorId, payload.connectorSecret);
  if (!connector) return NextResponse.json({ error: "Studio connector authentication failed." }, { status: 401 });

  const { data, error } = await supabase.rpc("claim_studio_commands", {
    p_connector_id: payload.connectorId,
    p_limit: 5,
  });
  if (error) {
    return NextResponse.json({ error: "Could not retrieve pending Studio commands." }, { status: 503 });
  }

  return NextResponse.json({
    commands: data || [],
    serverTime: new Date().toISOString(),
  });
}

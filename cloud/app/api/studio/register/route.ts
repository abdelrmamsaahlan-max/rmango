import { randomBytes } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthErrorResponse } from "@/lib/supabase";
import { hashConnectorSecret, isAllowedStudioTool } from "@/lib/studio-connector";

export const runtime = "nodejs";

const toolSchema = z.object({
  name: z.string().min(1).max(120),
  description: z.string().max(3000).optional(),
  inputSchema: z.record(z.string(), z.unknown()),
});

const schema = z.object({
  connectorName: z.string().trim().min(1).max(80).default("Rmango Desktop"),
  tools: z.array(toolSchema).max(100),
});

export async function POST(request: Request) {
  const { context, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { supabase, user } = context!;

  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "The Studio connector registration is invalid." }, { status: 400 });
  }

  const tools = payload.tools
    .filter(item => isAllowedStudioTool(item.name))
    .map(item => ({
      name: item.name,
      description: item.description || "",
      inputSchema: item.inputSchema,
    }));

  if (tools.length === 0) {
    return NextResponse.json({ error: "No supported Roblox Studio MCP tools were discovered." }, { status: 400 });
  }

  const { error: disconnectError } = await supabase
    .from("studio_connectors")
    .update({ disconnected_at: new Date().toISOString() })
    .eq("owner_id", user.id)
    .is("disconnected_at", null);

  if (disconnectError) {
    return NextResponse.json({ error: "Could not replace the previous Studio connector." }, { status: 503 });
  }

  const connectorSecret = randomBytes(32).toString("base64url");
  const { data, error } = await supabase
    .from("studio_connectors")
    .insert({
      owner_id: user.id,
      connector_name: payload.connectorName,
      connector_secret_hash: hashConnectorSecret(connectorSecret),
      studio_tools: tools,
      last_seen_at: new Date().toISOString(),
    })
    .select("id,connector_name")
    .single();

  if (error || !data) {
    return NextResponse.json({ error: "Could not register the Studio connector." }, { status: 503 });
  }

  return NextResponse.json({
    connectorId: data.id,
    connectorSecret,
    connectorName: data.connector_name,
    toolCount: tools.length,
  });
}

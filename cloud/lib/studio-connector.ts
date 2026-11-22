import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { shouldRefreshStudioConnectorHeartbeat } from "./studio-heartbeat";

export const STUDIO_READ_ONLY_TOOLS = new Set([
  "list_roblox_studios", "get_studio_state", "script_read", "script_search",
  "script_grep", "search_game_tree", "inspect_instance", "get_console_output",
  "screen_capture", "http_get", "skill", "list_skills", "search_asset", "wait_job_finished", "store_image",
]);

export const STUDIO_APPROVAL_TOOLS = new Set([
  "multi_edit", "execute_luau", "generate_mesh", "generate_material", "generate_texture",
  "generate_procedural_model", "generate_scene", "generate_animation", "generate_avatar",
  "auto_setup_avatar", "segment_mesh", "insert_asset", "upload_image",
  "start_stop_play", "character_navigation", "user_keyboard_input", "user_mouse_input",
  "save_place", "subagent", "open_cloud_invoke", "create_skill", "edit_skill",
]);

export function isAllowedStudioTool(name: string) {
  return STUDIO_READ_ONLY_TOOLS.has(name) || STUDIO_APPROVAL_TOOLS.has(name);
}

export function hashConnectorSecret(value: string) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

export function safeEqualHash(value: string, expectedHash: string) {
  const actual = Buffer.from(hashConnectorSecret(value), "hex");
  const expected = Buffer.from(expectedHash, "hex");
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}

export async function verifyConnector(
  supabase: SupabaseClient,
  user: User,
  connectorId: string,
  connectorSecret: string,
) {
  const { data, error } = await supabase
    .from("studio_connectors")
    .select("id,owner_id,connector_secret_hash,studio_tools,disconnected_at,last_seen_at")
    .eq("id", connectorId)
    .eq("owner_id", user.id)
    .is("disconnected_at", null)
    .maybeSingle();

  if (error || !data || !safeEqualHash(connectorSecret, data.connector_secret_hash)) return null;

  // The chat route only exposes Studio tools when last_seen_at is newer than
  // 30 seconds. Refresh it during authenticated polling/result requests, but
  // throttle writes so the 1.4 second desktop poll does not write every time.
  if (shouldRefreshStudioConnectorHeartbeat(data.last_seen_at)) {
    const { data: heartbeat, error: heartbeatError } = await supabase
      .from("studio_connectors")
      .update({ last_seen_at: new Date().toISOString() })
      .eq("id", connectorId)
      .eq("owner_id", user.id)
      .is("disconnected_at", null)
      .select("id")
      .maybeSingle();

    if (heartbeatError || !heartbeat) return null;
  }

  return data;
}

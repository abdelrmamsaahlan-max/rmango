import { createHash } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";

const schema = z.object({ decision: z.enum(["approve", "reject"]) });

function extension(value: string) {
  const index = value.lastIndexOf(".");
  return index >= 0 ? value.slice(index).toLowerCase() : "";
}

function mimeForExtension(ext: string) {
  if (ext === ".json") return "application/json";
  if (ext === ".csv") return "text/csv";
  if (ext === ".md") return "text/markdown";
  return "text/plain";
}

export async function PATCH(request: Request, context: { params: Promise<{ projectId: string; changeId: string }> }) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId, changeId } = await context.params;
  const { supabase, user } = auth!;

  let payload: z.infer<typeof schema>;
  try { payload = schema.parse(await request.json()); }
  catch { return NextResponse.json({ error: "Choose approve or reject for this change." }, { status: 400 }); }

  const { data: proposal, error: proposalError } = await supabase
    .from("project_changes")
    .select("id,project_id,owner_id,relative_path,file_name,original_sha256,proposed_content,proposed_sha256,change_summary,status")
    .eq("id", changeId)
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();

  if (proposalError || !proposal) return NextResponse.json({ error: "Project change proposal not found." }, { status: 404 });
  if (proposal.status !== "pending") return NextResponse.json({ error: "This proposal has already been reviewed." }, { status: 409 });

  if (payload.decision === "reject") {
    const { error } = await supabase.from("project_changes")
      .update({ status: "rejected", reviewed_at: new Date().toISOString() })
      .eq("id", changeId).eq("owner_id", user.id).eq("status", "pending");
    if (error) return NextResponse.json({ error: "Could not reject this proposal." }, { status: 503 });
    return NextResponse.json({ ok: true, status: "rejected" });
  }

  if (Buffer.byteLength(proposal.proposed_content, "utf8") > 512_000) {
    return NextResponse.json({ error: "The proposed file exceeds the 512 KB limit." }, { status: 413 });
  }

  const { data: currentFile, error: fileError } = await supabase
    .from("project_files")
    .select("id,sha256")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .eq("relative_path", proposal.relative_path)
    .maybeSingle();
  if (fileError) return NextResponse.json({ error: "Could not check the original project file." }, { status: 503 });

  const currentHash = currentFile?.sha256 || null;
  if (currentHash !== (proposal.original_sha256 || null)) {
    await supabase.from("project_changes")
      .update({ status: "conflict", reviewed_at: new Date().toISOString() })
      .eq("id", changeId).eq("owner_id", user.id).eq("status", "pending");
    return NextResponse.json({
      error: "The original file changed after this proposal was created. Refresh the project and ask the agent to propose the change again.",
      status: "conflict",
    }, { status: 409 });
  }

  const bytes = Buffer.from(proposal.proposed_content, "utf8");
  const actualHash = createHash("sha256").update(bytes).digest("hex");
  if (actualHash !== proposal.proposed_sha256) {
    return NextResponse.json({ error: "The saved proposal content did not match its recorded SHA-256 hash." }, { status: 409 });
  }

  const storagePath = user.id + "/" + projectId + "/" + Buffer.from(proposal.relative_path).toString("base64url");
  const mimeType = mimeForExtension(extension(proposal.file_name));
  const { error: storageError } = await supabase.storage.from("rmango-files").upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: true,
    cacheControl: "3600",
  });
  if (storageError) return NextResponse.json({ error: "Could not apply the proposed file to private storage." }, { status: 503 });

  const { error: indexError } = await supabase.from("project_files").upsert({
    project_id: projectId,
    owner_id: user.id,
    storage_path: storagePath,
    relative_path: proposal.relative_path,
    file_name: proposal.file_name,
    mime_type: mimeType,
    size_bytes: bytes.length,
    sha256: actualHash,
    indexed_at: new Date().toISOString(),
  }, { onConflict: "project_id,relative_path" });
  if (indexError) return NextResponse.json({ error: "The file was stored but its project index could not be updated. Contact Rmango support." }, { status: 503 });

  const { error: reviewError } = await supabase.from("project_changes")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", changeId).eq("owner_id", user.id).eq("status", "pending");
  if (reviewError) return NextResponse.json({ error: "The file was applied but the proposal status could not be saved." }, { status: 503 });

  return NextResponse.json({ ok: true, status: "approved", relativePath: proposal.relative_path, sha256: actualHash });
}

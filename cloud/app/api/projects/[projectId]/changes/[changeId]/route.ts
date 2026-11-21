import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthErrorResponse } from "@/lib/supabase";
import { indexCloudProjectFile } from "@/lib/ai/project-graph-storage";

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
    .select("id,sha256,storage_path,file_name,mime_type,size_bytes")
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

  // Create a durable recovery point before changing the live object. The file's
  // pre-change bytes are hash-verified before they are copied into private storage.
  const checkpointId = randomUUID();
  const checkpointBackupPath = user.id + "/" + projectId + "/.rmango-checkpoints/" +
    checkpointId + "/" + Buffer.from(proposal.relative_path).toString("base64url");
  let originalBytes: Buffer | null = null;
  let originalHash: string | null = null;

  const { error: checkpointError } = await supabase.from("project_checkpoints").insert({
    id: checkpointId,
    project_id: projectId,
    owner_id: user.id,
    source_change_id: changeId,
    label: "Before changing " + proposal.relative_path,
    checkpoint_kind: "before_change",
    status: "creating",
  });
  if (checkpointError) {
    return NextResponse.json({ error: "Could not create a recovery checkpoint. No project file was changed." }, { status: 503 });
  }

  if (currentFile) {
    const { data: existingBlob, error: backupReadError } = await supabase.storage
      .from("rmango-files").download(currentFile.storage_path);
    if (backupReadError || !existingBlob) {
      await supabase.from("project_checkpoints").delete().eq("id", checkpointId).eq("owner_id", user.id);
      return NextResponse.json({ error: "Could not read the original file for a recovery checkpoint. No project file was changed." }, { status: 503 });
    }
    originalBytes = Buffer.from(await existingBlob.arrayBuffer());
    originalHash = createHash("sha256").update(originalBytes).digest("hex");
    if (currentFile.sha256 && originalHash !== currentFile.sha256) {
      await supabase.from("project_checkpoints").delete().eq("id", checkpointId).eq("owner_id", user.id);
      return NextResponse.json({ error: "The stored original file does not match its indexed SHA-256. No changes were applied." }, { status: 409 });
    }
    if (originalBytes.length > 512_000) {
      await supabase.from("project_checkpoints").delete().eq("id", checkpointId).eq("owner_id", user.id);
      return NextResponse.json({ error: "The original file exceeds the recovery checkpoint limit. No changes were applied." }, { status: 413 });
    }

    const { error: backupError } = await supabase.storage.from("rmango-files").upload(
      checkpointBackupPath,
      originalBytes,
      { contentType: currentFile.mime_type || "text/plain", upsert: false, cacheControl: "3600" },
    );
    if (backupError) {
      await supabase.from("project_checkpoints").delete().eq("id", checkpointId).eq("owner_id", user.id);
      return NextResponse.json({ error: "Could not save the original file checkpoint. No project file was changed." }, { status: 503 });
    }
  }

  const { error: checkpointFileError } = await supabase.from("project_checkpoint_files").insert({
    checkpoint_id: checkpointId,
    project_id: projectId,
    owner_id: user.id,
    relative_path: proposal.relative_path,
    file_name: currentFile?.file_name || proposal.file_name,
    mime_type: currentFile?.mime_type || mimeType,
    existed_before: Boolean(currentFile),
    backup_storage_path: currentFile ? checkpointBackupPath : null,
    source_storage_path: currentFile?.storage_path || storagePath,
    original_sha256: originalHash,
    applied_sha256: actualHash,
    size_bytes: originalBytes?.length || 0,
  });
  if (checkpointFileError) {
    if (currentFile) await supabase.storage.from("rmango-files").remove([checkpointBackupPath]);
    await supabase.from("project_checkpoints").delete().eq("id", checkpointId).eq("owner_id", user.id);
    return NextResponse.json({ error: "Could not save checkpoint metadata. No project file was changed." }, { status: 503 });
  }

  // Re-check the indexed version immediately before the write. If a concurrent
  // update arrived while the snapshot was being prepared, preserve it untouched.
  const { data: latestFile, error: latestFileError } = await supabase.from("project_files")
    .select("sha256")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .eq("relative_path", proposal.relative_path)
    .maybeSingle();
  if (latestFileError || (latestFile?.sha256 || null) !== (currentFile?.sha256 || null)) {
    await supabase.from("project_checkpoints").update({ status: "conflict" })
      .eq("id", checkpointId).eq("owner_id", user.id);
    return NextResponse.json({ error: "The file changed while its checkpoint was being prepared. The newer version was not overwritten; a recovery record was retained.", checkpointId }, { status: 409 });
  }

  const { error: storageError } = await supabase.storage.from("rmango-files").upload(storagePath, bytes, {
    contentType: mimeType,
    upsert: true,
    cacheControl: "3600",
  });
  if (storageError) return NextResponse.json({ error: "Could not apply the proposed file to private storage." }, { status: 503 });

  const { data: appliedFile, error: indexError } = await supabase.from("project_files").upsert({
    project_id: projectId,
    owner_id: user.id,
    storage_path: storagePath,
    relative_path: proposal.relative_path,
    file_name: proposal.file_name,
    mime_type: mimeType,
    size_bytes: bytes.length,
    sha256: actualHash,
    indexed_at: null,
  }, { onConflict: "project_id,relative_path" }).select("id").single();
  if (indexError || !appliedFile) {
    // If the metadata commit failed after the object write, put back the exact
    // snapshot. If this was a newly-created path, remove the unindexed object.
    let rollbackError: unknown = null;
    if (currentFile && originalBytes) {
      const restored = await supabase.storage.from("rmango-files").upload(storagePath, originalBytes, {
        contentType: currentFile.mime_type || "text/plain",
        upsert: true,
        cacheControl: "3600",
      });
      rollbackError = restored.error;
    } else if (!currentFile) {
      const removed = await supabase.storage.from("rmango-files").remove([storagePath]);
      rollbackError = removed.error;
    }
    await supabase.from("project_checkpoints").update({
      status: rollbackError ? "restore_conflict" : "failed",
    }).eq("id", checkpointId).eq("owner_id", user.id);
    return NextResponse.json({
      error: rollbackError
        ? "The file object was written but its index failed, and automatic recovery also failed. Use the retained checkpoint for manual recovery."
        : "The project index failed; the original file was restored and the proposal was not applied.",
      checkpointId,
    }, { status: 503 });
  }

  await supabase.from("project_checkpoints").update({ status: "ready" })
    .eq("id", checkpointId).eq("owner_id", user.id);

  // Indexing is recoverable and must not make an already applied source change
  // appear to be unreviewed. A missing graph migration leaves the index pending.
  const graphIndex = await indexCloudProjectFile(supabase, appliedFile.id, proposal.relative_path, proposal.proposed_content);

  const { error: reviewError } = await supabase.from("project_changes")
    .update({ status: "approved", reviewed_at: new Date().toISOString() })
    .eq("id", changeId).eq("owner_id", user.id).eq("status", "pending");
  if (reviewError) return NextResponse.json({ error: "The file was applied but the proposal status could not be saved." }, { status: 503 });

  return NextResponse.json({
    ok: true,
    status: "approved",
    relativePath: proposal.relative_path,
    sha256: actualHash,
    checkpointId,
    graphIndex: {
      status: graphIndex.indexed ? "indexed" : "pending",
      symbols: graphIndex.symbolCount,
      dependencies: graphIndex.edgeCount,
      reason: graphIndex.reason || null,
    },
  });
}

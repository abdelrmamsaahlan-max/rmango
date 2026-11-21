import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getAuthErrorResponse } from "@/lib/supabase";
import { indexCloudProjectFile } from "@/lib/ai/project-graph-storage";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function canonicalStoragePath(ownerId: string, projectId: string, relativePath: string) {
  return ownerId + "/" + projectId + "/" + Buffer.from(relativePath).toString("base64url");
}

function checkpointStoragePath(ownerId: string, projectId: string, checkpointId: string, relativePath: string) {
  return ownerId + "/" + projectId + "/.rmango-checkpoints/" + checkpointId + "/" +
    Buffer.from(relativePath).toString("base64url");
}

export async function POST(
  request: Request,
  context: { params: Promise<{ projectId: string; checkpointId: string }> },
) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId, checkpointId } = await context.params;
  const { supabase, user } = auth!;

  const { data: project, error: projectError } = await supabase
    .from("projects").select("id").eq("id", projectId).eq("owner_id", user.id).maybeSingle();
  if (projectError || !project) return NextResponse.json({ error: "Cloud project not found." }, { status: 404 });

  const { data: checkpoint, error: checkpointError } = await supabase
    .from("project_checkpoints")
    .select("id,label,status,checkpoint_kind")
    .eq("id", checkpointId)
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (checkpointError || !checkpoint) return NextResponse.json({ error: "Recovery point not found." }, { status: 404 });
  if (checkpoint.status !== "ready") {
    return NextResponse.json({ error: "This recovery point is not in a restorable state.", status: checkpoint.status }, { status: 409 });
  }

  const { data: checkpointFiles, error: checkpointFilesError } = await supabase
    .from("project_checkpoint_files")
    .select("id,relative_path,file_name,mime_type,existed_before,backup_storage_path,source_storage_path,original_sha256,applied_sha256,size_bytes")
    .eq("checkpoint_id", checkpointId)
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .limit(20);
  if (checkpointFilesError || !checkpointFiles?.length) {
    return NextResponse.json({ error: "This recovery point has no restorable file entries." }, { status: 409 });
  }

  // This version creates one-file checkpoints for a single approved proposal.
  // Reject unexpected multi-file rows instead of doing a partially atomic restore.
  if (checkpointFiles.length !== 1) {
    return NextResponse.json({ error: "This recovery point contains an unsupported multi-file change set." }, { status: 409 });
  }

  const entry = checkpointFiles[0];
  const { data: currentFile, error: currentError } = await supabase
    .from("project_files")
    .select("id,storage_path,file_name,mime_type,size_bytes,sha256,relative_path")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .eq("relative_path", entry.relative_path)
    .maybeSingle();
  if (currentError) return NextResponse.json({ error: "Could not inspect the current project file." }, { status: 503 });

  const currentHash = currentFile?.sha256 || null;
  const targetAlreadyRestored = entry.existed_before
    ? currentHash === entry.original_sha256
    : !currentFile;
  if (targetAlreadyRestored) {
    await supabase.from("project_checkpoints").update({
      status: "restored",
      restored_at: new Date().toISOString(),
    }).eq("id", checkpointId).eq("owner_id", user.id);
    return NextResponse.json({ ok: true, status: "already_restored", checkpointId });
  }

  const expectedAppliedStateMatches = entry.applied_sha256
    ? Boolean(currentFile && currentHash === entry.applied_sha256)
    : !currentFile;
  if (!expectedAppliedStateMatches) {
    await supabase.from("project_checkpoints").update({ status: "conflict" })
      .eq("id", checkpointId).eq("owner_id", user.id);
    return NextResponse.json({
      error: "The live file no longer matches the state recorded by this checkpoint. It was not overwritten.",
      status: "conflict",
      currentSha256: currentHash,
      expectedSha256: entry.applied_sha256,
    }, { status: 409 });
  }

  let restoreBytes: Buffer | null = null;
  if (entry.existed_before) {
    if (!entry.backup_storage_path || !entry.original_sha256) {
      return NextResponse.json({ error: "The recovery point is missing its original file snapshot." }, { status: 503 });
    }
    const { data: backupBlob, error: backupReadError } = await supabase.storage
      .from("rmango-files").download(entry.backup_storage_path);
    if (backupReadError || !backupBlob) {
      return NextResponse.json({ error: "Could not retrieve the original file snapshot." }, { status: 503 });
    }
    restoreBytes = Buffer.from(await backupBlob.arrayBuffer());
    const backupHash = createHash("sha256").update(restoreBytes).digest("hex");
    if (backupHash !== entry.original_sha256 || restoreBytes.length > 512_000) {
      return NextResponse.json({ error: "The checkpoint file failed SHA-256 or size validation. Nothing was restored." }, { status: 409 });
    }
  }

  // Make a rollback checkpoint of the currently live state so this restore can
  // itself be undone (the practical redo path). A missing current file is also
  // recorded as a state, allowing a restored deletion to be reversed.
  const rollbackId = randomUUID();
  const rollbackPath = checkpointStoragePath(user.id, projectId, rollbackId, entry.relative_path);
  const { error: rollbackInsertError } = await supabase.from("project_checkpoints").insert({
    id: rollbackId,
    project_id: projectId,
    owner_id: user.id,
    label: "Before restoring " + entry.relative_path,
    checkpoint_kind: "before_restore",
    status: "creating",
  });
  if (rollbackInsertError) {
    return NextResponse.json({ error: "Could not create a rollback point. No restore was performed." }, { status: 503 });
  }

  let rollbackBackupPath: string | null = null;
  let rollbackBytes: Buffer | null = null;
  if (currentFile) {
    const { data: liveBlob, error: liveReadError } = await supabase.storage
      .from("rmango-files").download(currentFile.storage_path);
    if (liveReadError || !liveBlob) {
      await supabase.from("project_checkpoints").delete().eq("id", rollbackId).eq("owner_id", user.id);
      return NextResponse.json({ error: "Could not snapshot the current file. No restore was performed." }, { status: 503 });
    }
    rollbackBytes = Buffer.from(await liveBlob.arrayBuffer());
    const liveHash = createHash("sha256").update(rollbackBytes).digest("hex");
    if ((currentFile.sha256 && currentFile.sha256 !== liveHash) || rollbackBytes.length > 512_000) {
      await supabase.from("project_checkpoints").delete().eq("id", rollbackId).eq("owner_id", user.id);
      return NextResponse.json({ error: "The current file changed or exceeded checkpoint limits. No restore was performed." }, { status: 409 });
    }
    rollbackBackupPath = rollbackPath;
    const { error: rollbackStorageError } = await supabase.storage.from("rmango-files").upload(
      rollbackPath,
      rollbackBytes,
      { contentType: currentFile.mime_type || "text/plain", upsert: false, cacheControl: "3600" },
    );
    if (rollbackStorageError) {
      await supabase.from("project_checkpoints").delete().eq("id", rollbackId).eq("owner_id", user.id);
      return NextResponse.json({ error: "Could not save the rollback snapshot. No restore was performed." }, { status: 503 });
    }
  }

  const { error: rollbackFileError } = await supabase.from("project_checkpoint_files").insert({
    checkpoint_id: rollbackId,
    project_id: projectId,
    owner_id: user.id,
    relative_path: entry.relative_path,
    file_name: currentFile?.file_name || entry.file_name,
    mime_type: currentFile?.mime_type || entry.mime_type || "text/plain",
    existed_before: Boolean(currentFile),
    backup_storage_path: rollbackBackupPath,
    source_storage_path: currentFile?.storage_path || entry.source_storage_path || canonicalStoragePath(user.id, projectId, entry.relative_path),
    original_sha256: rollbackBytes
      ? createHash("sha256").update(rollbackBytes).digest("hex")
      : null,
    applied_sha256: entry.existed_before ? entry.original_sha256 : null,
    size_bytes: rollbackBytes?.length || 0,
  });
  if (rollbackFileError) {
    if (rollbackBackupPath) await supabase.storage.from("rmango-files").remove([rollbackBackupPath]);
    await supabase.from("project_checkpoints").delete().eq("id", rollbackId).eq("owner_id", user.id);
    return NextResponse.json({ error: "Could not save rollback metadata. No restore was performed." }, { status: 503 });
  }

  const targetStoragePath = currentFile?.storage_path ||
    entry.source_storage_path || canonicalStoragePath(user.id, projectId, entry.relative_path);

  if (entry.existed_before && restoreBytes) {
    const { error: restoreUploadError } = await supabase.storage.from("rmango-files").upload(
      targetStoragePath,
      restoreBytes,
      { contentType: entry.mime_type || "text/plain", upsert: true, cacheControl: "3600" },
    );
    if (restoreUploadError) {
      await supabase.from("project_checkpoints").update({ status: "failed" }).eq("id", rollbackId).eq("owner_id", user.id);
      return NextResponse.json({ error: "Could not restore the checkpoint file. The rollback point was retained.", rollbackCheckpointId: rollbackId }, { status: 503 });
    }

    // Verify the actual private-storage bytes before committing restored metadata.
    const { data: restoredBlob, error: restoredReadError } = await supabase.storage
      .from("rmango-files").download(targetStoragePath);
    const readBackHash = restoredBlob
      ? createHash("sha256").update(Buffer.from(await restoredBlob.arrayBuffer())).digest("hex")
      : null;
    if (restoredReadError || readBackHash !== entry.original_sha256) {
      let rollbackVerified = !rollbackBytes;
      if (rollbackBytes) {
        const restoredLive = await supabase.storage.from("rmango-files").upload(targetStoragePath, rollbackBytes, {
          contentType: currentFile?.mime_type || "text/plain", upsert: true,
        });
        if (!restoredLive.error) {
          const { data: rollbackBlob, error: rollbackReadError } = await supabase.storage
            .from("rmango-files").download(targetStoragePath);
          const rollbackHash = rollbackBlob
            ? createHash("sha256").update(Buffer.from(await rollbackBlob.arrayBuffer())).digest("hex")
            : null;
          rollbackVerified = !rollbackReadError && rollbackHash === createHash("sha256").update(rollbackBytes).digest("hex");
        }
      } else {
        const removed = await supabase.storage.from("rmango-files").remove([targetStoragePath]);
        rollbackVerified = !removed.error;
      }
      await supabase.from("project_checkpoints").update({
        status: rollbackVerified ? "failed" : "restore_conflict",
      }).eq("id", rollbackId).eq("owner_id", user.id);
      return NextResponse.json({
        error: rollbackVerified
          ? "The restored object failed hash verification. The current live version was restored; no checkpoint restore was applied."
          : "The restored object failed hash verification and automatic recovery could not be confirmed. Keep the rollback checkpoint for manual recovery.",
        rollbackCheckpointId: rollbackId,
      }, { status: 503 });
    }

    const { data: restoredFile, error: upsertError } = await supabase.from("project_files").upsert({
      project_id: projectId,
      owner_id: user.id,
      storage_path: targetStoragePath,
      relative_path: entry.relative_path,
      file_name: entry.file_name,
      mime_type: entry.mime_type || "text/plain",
      size_bytes: restoreBytes.length,
      sha256: entry.original_sha256,
      indexed_at: null,
    }, { onConflict: "project_id,relative_path" }).select("id").single();
    if (upsertError || !restoredFile) {
      // Best-effort compensation: restore the just-snapshotted live bytes.
      if (rollbackBytes) {
        await supabase.storage.from("rmango-files").upload(targetStoragePath, rollbackBytes, {
          contentType: currentFile?.mime_type || "text/plain", upsert: true,
        });
      }
      await supabase.from("project_checkpoints").update({ status: "failed" }).eq("id", rollbackId).eq("owner_id", user.id);
      return NextResponse.json({ error: "The file content was restored but the project index update failed. The rollback point was retained.", rollbackCheckpointId: rollbackId }, { status: 503 });
    }

    await indexCloudProjectFile(supabase, restoredFile.id, entry.relative_path, restoreBytes.toString("utf8"));
  } else {
    if (currentFile) {
      const { error: removeError } = await supabase.storage.from("rmango-files").remove([currentFile.storage_path]);
      if (removeError) {
        await supabase.from("project_checkpoints").update({ status: "failed" }).eq("id", rollbackId).eq("owner_id", user.id);
        return NextResponse.json({ error: "Could not remove the file created by the approved change. The rollback point was retained.", rollbackCheckpointId: rollbackId }, { status: 503 });
      }
      const { error: deleteError } = await supabase.from("project_files").delete()
        .eq("id", currentFile.id).eq("project_id", projectId).eq("owner_id", user.id);
      if (deleteError) {
        if (rollbackBytes) await supabase.storage.from("rmango-files").upload(currentFile.storage_path, rollbackBytes, {
          contentType: currentFile.mime_type || "text/plain", upsert: true,
        });
        await supabase.from("project_checkpoints").update({ status: "failed" }).eq("id", rollbackId).eq("owner_id", user.id);
        return NextResponse.json({ error: "The file object was removed but its index could not be updated. The rollback point was retained.", rollbackCheckpointId: rollbackId }, { status: 503 });
      }
    }
  }

  await supabase.from("project_checkpoints").update({
    status: "ready",
  }).eq("id", rollbackId).eq("owner_id", user.id);
  await supabase.from("project_checkpoints").update({
    status: "restored",
    restored_at: new Date().toISOString(),
  }).eq("id", checkpointId).eq("owner_id", user.id);

  return NextResponse.json({
    ok: true,
    status: "restored",
    relativePath: entry.relative_path,
    rollbackCheckpointId: rollbackId,
    message: "The selected file state was restored. A new recovery point was created so you can undo this restore.",
  });
}

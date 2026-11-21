import { createAdminClient } from "@/lib/supabase";
import { PROJECT_INDEX_VERSION, indexLuauSource } from "@/lib/project-index";

const INDEXABLE_EXTENSIONS = new Set([".lua", ".luau", ".json", ".md", ".txt", ".toml", ".yaml", ".yml", ".xml", ".csv"]);

function extension(path: string) {
  const index = path.lastIndexOf(".");
  return index < 0 ? "" : path.slice(index).toLowerCase();
}

export async function indexProjectStep(projectId: string, ownerId: string, taskId?: string, force = false) {
  "use step";
  const admin = createAdminClient();
  const { data: run, error: runError } = await admin.from("project_index_runs").insert({
    project_id: projectId,
    owner_id: ownerId,
    task_id: taskId || null,
    status: "running",
  }).select("id").single();
  if (runError || !run) throw new Error("Could not create a project index run.");

  let indexedCount = 0;
  let dependencyCount = 0;
  let symbolCount = 0;
  let errorCount = 0;
  const errorSamples: string[] = [];

  try {
    const { data: files, error: filesError } = await admin.from("project_files")
      .select("id,relative_path,file_name,storage_path,size_bytes,indexed_at,index_version")
      .eq("project_id", projectId)
      .eq("owner_id", ownerId)
      .order("relative_path", { ascending: true })
      .range(0, 1999);
    if (filesError) throw new Error("Could not load the full project file index: " + filesError.message);
    const allFiles = files || [];
    const projectPaths = allFiles.map(file => file.relative_path);
    const pathToId = new Map(allFiles.map(file => [file.relative_path.replace(/\\/g, "/"), file.id]));
    const pending = force
      ? allFiles
      : allFiles.filter(file => (file.index_version || 0) < PROJECT_INDEX_VERSION);

    for (let offset = 0; offset < pending.length; offset += 8) {
      const batch = pending.slice(offset, offset + 8);
      await Promise.all(batch.map(async file => {
        if (!INDEXABLE_EXTENSIONS.has(extension(file.file_name))) {
          const { error } = await admin.from("project_files")
            .update({ indexed_at: new Date().toISOString(), index_version: PROJECT_INDEX_VERSION })
            .eq("id", file.id)
            .eq("owner_id", ownerId);
          if (error) {
            errorCount++;
            if (errorSamples.length < 10) errorSamples.push(file.relative_path + ": index state could not be saved");
          } else {
            indexedCount++;
          }
          return;
        }
        if (file.size_bytes > 512_000) {
          errorCount++;
          if (errorSamples.length < 10) errorSamples.push(file.relative_path + ": file exceeds the 512 KB source-index limit");
          return;
        }
        try {
          const { data: blob, error: downloadError } = await admin.storage.from("rmango-files").download(file.storage_path);
          if (downloadError || !blob) throw new Error("private source file could not be downloaded");
          const source = await blob.text();
          const parsed = indexLuauSource(file.relative_path, source, projectPaths);

          const [{ error: symbolDeleteError }, { error: dependencyDeleteError }] = await Promise.all([
            admin.from("project_file_symbols").delete().eq("file_id", file.id).eq("owner_id", ownerId),
            admin.from("project_file_dependencies").delete().eq("source_file_id", file.id).eq("owner_id", ownerId),
          ]);
          if (symbolDeleteError || dependencyDeleteError) throw new Error("previous index records could not be replaced");

          if (parsed.symbols.length) {
            const { error } = await admin.from("project_file_symbols").insert(parsed.symbols.map(item => ({
              project_id: projectId,
              owner_id: ownerId,
              file_id: file.id,
              symbol_type: item.symbolType,
              symbol_name: item.symbolName,
              line_number: item.lineNumber,
            })));
            if (error) throw new Error("project symbols could not be saved");
          }

          if (parsed.dependencies.length) {
            const { error } = await admin.from("project_file_dependencies").insert(parsed.dependencies.map(item => ({
              project_id: projectId,
              owner_id: ownerId,
              source_file_id: file.id,
              target_file_id: item.targetRelativePath ? (pathToId.get(item.targetRelativePath) || null) : null,
              dependency_type: item.dependencyType,
              reference: item.reference,
              target_name: item.targetName,
              confidence: item.confidence,
              line_number: item.lineNumber,
            })));
            if (error) throw new Error("project dependency edges could not be saved");
          }

          const { error: updateError } = await admin.from("project_files")
            .update({ indexed_at: new Date().toISOString(), index_version: PROJECT_INDEX_VERSION })
            .eq("id", file.id)
            .eq("owner_id", ownerId);
          if (updateError) throw new Error("indexed file version could not be saved");

          indexedCount++;
          dependencyCount += parsed.dependencies.length;
          symbolCount += parsed.symbols.length;
        } catch (error) {
          errorCount++;
          if (errorSamples.length < 10) {
            errorSamples.push(file.relative_path + ": " + (error instanceof Error ? error.message : "index failed"));
          }
        }
      }));
    }

    const [{ count: totalIndexed }, { count: totalDependencies }, { count: totalSymbols }] = await Promise.all([
      admin.from("project_files").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("owner_id", ownerId).gte("index_version", PROJECT_INDEX_VERSION),
      admin.from("project_file_dependencies").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("owner_id", ownerId),
      admin.from("project_file_symbols").select("id", { count: "exact", head: true }).eq("project_id", projectId).eq("owner_id", ownerId),
    ]);

    const status = errorCount > 0 ? "partial" : "completed";
    const summary = {
      runId: run.id,
      status,
      fileCount: allFiles.length,
      indexedCount: totalIndexed ?? indexedCount,
      dependencyCount: totalDependencies ?? dependencyCount,
      symbolCount: totalSymbols ?? symbolCount,
      errorCount,
      errors: errorSamples,
    };
    const { error: finishError } = await admin.from("project_index_runs").update({
      status,
      file_count: allFiles.length,
      indexed_count: summary.indexedCount,
      dependency_count: summary.dependencyCount,
      symbol_count: summary.symbolCount,
      error_count: errorCount,
      error: errorSamples.length ? errorSamples.join("\n").slice(0, 4_000) : null,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id).eq("owner_id", ownerId);
    if (finishError) throw new Error("The index was calculated but its run summary could not be saved.");
    return summary;
  } catch (error) {
    await admin.from("project_index_runs").update({
      status: "failed",
      error: (error instanceof Error ? error.message : "Project indexing failed.").slice(0, 4_000),
      error_count: errorCount + 1,
      completed_at: new Date().toISOString(),
    }).eq("id", run.id).eq("owner_id", ownerId);
    throw error;
  }
}

export async function runProjectIndexWorkflow(projectId: string, ownerId: string, force = true) {
  "use workflow";
  return indexProjectStep(projectId, ownerId, undefined, force);
}

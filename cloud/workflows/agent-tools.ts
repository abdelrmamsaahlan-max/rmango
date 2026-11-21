import { createHash, randomUUID } from "node:crypto";
import { tool, type ToolSet } from "ai";
import { createHook, sleep } from "workflow";
import { z } from "zod";
import { createAdminClient } from "@/lib/supabase";
import { isAllowedStudioTool, STUDIO_APPROVAL_TOOLS } from "@/lib/studio-connector";

type StudioToolInfo = {
  name: string;
  description?: string;
  inputSchema?: Record<string, unknown>;
};

type ProjectAgentContext = {
  taskId: string;
  ownerId: string;
  projectId: string;
  conversationId: string | null;
  runToken: string;
};

const SEARCHABLE_EXTENSIONS = new Set([
  ".lua", ".luau", ".json", ".md", ".txt", ".toml", ".yaml", ".yml",
  ".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".csv", ".xml",
]);

function extension(value: string) {
  const index = value.lastIndexOf(".");
  return index >= 0 ? value.slice(index).toLowerCase() : "";
}

function safeRelativePath(input: string): string | null {
  const value = input.trim().replace(/\\/g, "/");
  if (!value || value.startsWith("/") || /^[a-zA-Z]:/.test(value) || value.includes("\0")) return null;
  const segments = value.split("/");
  if (segments.some(segment => !segment || segment === "." || segment === "..")) return null;
  return value;
}

function summarizeValue(value: unknown, max = 1_200): string {
  let serialized: string;
  try { serialized = typeof value === "string" ? value : JSON.stringify(value); }
  catch { serialized = String(value); }
  return serialized.length > max ? serialized.slice(0, max) + "… [truncated]" : serialized;
}

async function assertCurrentTaskStep(context: ProjectAgentContext, allowApprovalWait = false) {
  "use step";
  const admin = createAdminClient();
  const { data, error } = await admin.from("agent_tasks")
    .select("status")
    .eq("id", context.taskId)
    .eq("owner_id", context.ownerId)
    .filter("result->>runToken", "eq", context.runToken)
    .maybeSingle();
  const allowed = allowApprovalWait ? ["running", "waiting_approval"] : ["running"];
  if (error || !data || !allowed.includes(data.status)) {
    throw new Error("This task is paused, cancelled, or no longer the active attempt. No new changes were made.");
  }
}

export async function appendTaskEventStep(
  taskId: string,
  ownerId: string,
  eventType: string,
  message: string,
  data: Record<string, unknown> = {},
) {
  "use step";
  const admin = createAdminClient();
  const { error } = await admin.from("agent_events").insert({
    task_id: taskId,
    owner_id: ownerId,
    event_type: eventType,
    message: message.slice(0, 2_000),
    data,
  });
  if (error) throw new Error("Could not persist agent workspace activity: " + error.message);
}

async function listProjectFilesStep(context: ProjectAgentContext, search?: string) {
  "use step";
  await assertCurrentTaskStep(context, true);
  const admin = createAdminClient();
  let query = admin.from("project_files")
    .select("id,relative_path,file_name,mime_type,size_bytes,sha256,index_version,indexed_at")
    .eq("project_id", context.projectId)
    .eq("owner_id", context.ownerId)
    .order("relative_path", { ascending: true })
    .range(0, 1999);
  if (search) query = query.ilike("file_name", "%" + search.replace(/[%_]/g, "") + "%");
  const { data, error } = await query;
  if (error) throw new Error("Could not list project source files: " + error.message);
  return data || [];
}

async function readProjectFileStep(context: ProjectAgentContext, relativePath: string) {
  "use step";
  await assertCurrentTaskStep(context, true);
  const safePath = safeRelativePath(relativePath);
  if (!safePath || !SEARCHABLE_EXTENSIONS.has(extension(safePath))) throw new Error("That file path or extension is not supported.");
  const admin = createAdminClient();
  const { data: file, error } = await admin.from("project_files")
    .select("file_name,storage_path,size_bytes,sha256")
    .eq("project_id", context.projectId)
    .eq("owner_id", context.ownerId)
    .eq("relative_path", safePath)
    .maybeSingle();
  if (error || !file) throw new Error("That project file was not found.");
  if (file.size_bytes > 512_000) throw new Error("That file exceeds the 512 KB file-read limit.");
  const { data: blob, error: downloadError } = await admin.storage.from("rmango-files").download(file.storage_path);
  if (downloadError || !blob) throw new Error("Could not download the selected project file.");
  const content = await blob.text();
  return { relativePath: safePath, sha256: file.sha256, content: content.slice(0, 48_000), truncated: content.length > 48_000 };
}

async function searchProjectFilesStep(context: ProjectAgentContext, search: string) {
  "use step";
  await assertCurrentTaskStep(context, true);
  const admin = createAdminClient();
  const { data: files, error } = await admin.from("project_files")
    .select("relative_path,file_name,storage_path,size_bytes")
    .eq("project_id", context.projectId)
    .eq("owner_id", context.ownerId)
    .order("relative_path", { ascending: true })
    .range(0, 1999);
  if (error) throw new Error("Could not list project files for source search: " + error.message);

  const terms = Array.from(new Set(search.toLowerCase().match(/[\p{L}\p{N}_]{2,}/gu) || [])).slice(0, 18);
  const sourceFiles = (files || []).filter(file =>
    SEARCHABLE_EXTENSIONS.has(extension(file.file_name)) && file.size_bytes <= 512_000
  );
  const matches: Array<{ path: string; score: number; lines: string[] }> = [];
  let scannedFiles = 0;
  let scannedBytes = 0;
  const byteBudget = 16 * 1024 * 1024;

  for (let offset = 0; offset < sourceFiles.length && scannedFiles < 2000 && scannedBytes < byteBudget; offset += 10) {
    const batch = [];
    let batchBytes = scannedBytes;
    for (const file of sourceFiles.slice(offset, offset + 10)) {
      if (batchBytes + file.size_bytes > byteBudget) continue;
      batch.push(file);
      batchBytes += file.size_bytes;
    }
    if (!batch.length) break;
    const results = await Promise.all(batch.map(async file => {
      const { data: blob, error: storageError } = await admin.storage.from("rmango-files").download(file.storage_path);
      if (storageError || !blob) return null;
      const content = await blob.text();
      const lines = content.split(/\r?\n/);
      const loweredPath = file.relative_path.toLowerCase();
      let score = terms.reduce((sum, term) => sum + (loweredPath.includes(term) ? 3 : 0), 0);
      const snippets: string[] = [];
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const hits = terms.reduce((sum, term) => sum + (line.toLowerCase().includes(term) ? 1 : 0), 0);
        score += hits;
        if (hits && snippets.length < 6) snippets.push((i + 1) + ": " + line.trim().slice(0, 420));
      }
      return score ? { path: file.relative_path, score, lines: snippets } : null;
    }));
    scannedFiles += batch.length;
    scannedBytes += batch.reduce((sum, file) => sum + file.size_bytes, 0);
    for (const result of results) if (result) matches.push(result);
  }

  matches.sort((a, b) => b.score - a.score || a.path.localeCompare(b.path));
  return {
    query: search,
    scannedFiles,
    scannedBytes,
    truncated: sourceFiles.length > scannedFiles || scannedBytes >= byteBudget,
    matches: matches.slice(0, 30),
  };
}

async function getProjectDependencyGraphStep(context: ProjectAgentContext, relativePath?: string) {
  "use step";
  await assertCurrentTaskStep(context, true);
  const admin = createAdminClient();
  const [{ data: dependencies, error: dependencyError }, { data: symbols, error: symbolError }] = await Promise.all([
    admin.from("project_file_dependencies")
      .select("dependency_type,reference,target_name,confidence,line_number,source:project_files!project_file_dependencies_source_file_id_fkey(relative_path),target:project_files!project_file_dependencies_target_file_id_fkey(relative_path)")
      .eq("project_id", context.projectId)
      .eq("owner_id", context.ownerId)
      .order("confidence", { ascending: false })
      .limit(500),
    admin.from("project_file_symbols")
      .select("symbol_type,symbol_name,line_number,file:project_files!project_file_symbols_file_id_fkey(relative_path)")
      .eq("project_id", context.projectId)
      .eq("owner_id", context.ownerId)
      .order("symbol_name", { ascending: true })
      .limit(500),
  ]);
  if (dependencyError || symbolError) throw new Error("Could not read the indexed project architecture.");
  const needle = relativePath?.toLowerCase();
  const filteredDependencies = needle
    ? (dependencies || []).filter(item => summarizeValue(item.source, 500).toLowerCase().includes(needle) || summarizeValue(item.target, 500).toLowerCase().includes(needle))
    : (dependencies || []);
  const filteredSymbols = needle
    ? (symbols || []).filter(item => summarizeValue(item.file, 500).toLowerCase().includes(needle))
    : (symbols || []);
  return {
    indexedDependencies: filteredDependencies.slice(0, 300),
    indexedSymbols: filteredSymbols.slice(0, 300),
    note: "This is a static source index. Unresolved references and low-confidence edges are not proof that a target exists in the live Roblox DataModel.",
  };
}

async function findProjectSymbolsStep(context: ProjectAgentContext, search: string) {
  "use step";
  await assertCurrentTaskStep(context, true);
  const admin = createAdminClient();
  const { data, error } = await admin.from("project_file_symbols")
    .select("symbol_type,symbol_name,line_number,file:project_files!project_file_symbols_file_id_fkey(relative_path)")
    .eq("project_id", context.projectId)
    .eq("owner_id", context.ownerId)
    .ilike("symbol_name", "%" + search.replace(/[%_]/g, "") + "%")
    .limit(100);
  if (error) throw new Error("Could not search indexed project symbols.");
  return data || [];
}

async function listProjectMemoriesStep(context: ProjectAgentContext, search?: string) {
  "use step";
  await assertCurrentTaskStep(context, true);
  const admin = createAdminClient();
  let query = admin.from("project_memories")
    .select("id,memory_type,title,content,source_ref,updated_at")
    .eq("project_id", context.projectId)
    .eq("owner_id", context.ownerId)
    .order("updated_at", { ascending: false })
    .limit(80);
  if (search) query = query.or("title.ilike.%" + search.replace(/[%_]/g, "") + "%,content.ilike.%" + search.replace(/[%_]/g, "") + "%");
  const { data, error } = await query;
  if (error) throw new Error("Could not load saved project memories.");
  return data || [];
}

async function proposeProjectFileChangeStep(
  context: ProjectAgentContext,
  relativePath: string,
  content: string,
  summary: string,
) {
  "use step";
  await assertCurrentTaskStep(context);
  const safePath = safeRelativePath(relativePath);
  if (!safePath || !SEARCHABLE_EXTENSIONS.has(extension(safePath))) throw new Error("That proposal path or file extension is not supported.");
  if (Buffer.byteLength(content, "utf8") > 512_000) throw new Error("Proposed file content exceeds the 512 KB limit.");
  const admin = createAdminClient();
  const { data: existing, error: existingError } = await admin.from("project_files")
    .select("sha256,file_name")
    .eq("project_id", context.projectId)
    .eq("owner_id", context.ownerId)
    .eq("relative_path", safePath)
    .maybeSingle();
  if (existingError) throw new Error("Could not inspect the original project file.");
  const proposedHash = createHash("sha256").update(Buffer.from(content, "utf8")).digest("hex");
  const fileName = safePath.split("/").pop() || safePath;
  const { data: proposal, error } = await admin.from("project_changes").insert({
    project_id: context.projectId,
    owner_id: context.ownerId,
    conversation_id: context.conversationId,
    relative_path: safePath,
    file_name: fileName,
    original_sha256: existing?.sha256 || null,
    proposed_content: content,
    proposed_sha256: proposedHash,
    change_summary: summary,
    status: "pending",
  }).select("id").single();
  if (error || !proposal) throw new Error("Could not create the reviewable file-change proposal.");
  return { proposalId: proposal.id, relativePath: safePath, status: "pending", sha256: proposedHash };
}

function assertMemoryContainsNoSecrets(title: string, content: string, sourceRef?: string) {
  const combined = [title, content, sourceRef || ""].join("\n");
  const secretPatterns = [
    /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
    /\b(?:api[_ -]?key|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|password)\s*[:=]\s*["']?[^\s"'\u0060,;]{6,}/i,
    /\b(?:sk-[A-Za-z0-9_-]{20,}|gh[pousr]_[A-Za-z0-9]{20,}|xox[baprs]-[A-Za-z0-9-]{15,})\b/i,
  ];
  if (secretPatterns.some(pattern => pattern.test(combined))) {
    throw new Error("Project memories cannot contain passwords, API keys, access tokens, or private-key material.");
  }
}

async function getProjectLearningSignalsStep(context: ProjectAgentContext) {
  "use step";
  await assertCurrentTaskStep(context, true);
  const admin = createAdminClient();
  const { data: evaluations, error } = await admin.from("agent_learning_events")
    .select("task_id,signal_data,created_at")
    .eq("project_id", context.projectId)
    .eq("owner_id", context.ownerId)
    .eq("signal_type", "task_evaluated")
    .order("created_at", { ascending: false })
    .limit(50);
  if (error) throw new Error("Could not load prior task evaluation signals.");

  const rows = evaluations || [];
  if (!rows.length) {
    return {
      sampleSize: 0,
      runtimeVerifiedRate: null,
      playtestPassRate: null,
      cleanConsoleRate: null,
      failedStudioToolRate: null,
      userFeedbackCount: 0,
      helpfulRate: null,
    };
  }

  const taskIds = rows.map(row => row.task_id);
  const { data: ratings, error: ratingError } = await admin.from("agent_learning_events")
    .select("task_id,signal_data")
    .eq("project_id", context.projectId)
    .eq("owner_id", context.ownerId)
    .eq("signal_type", "user_feedback")
    .in("task_id", taskIds);
  if (ratingError) throw new Error("Could not load prior task feedback.");

  const attemptedPlaytests = rows.filter(row => row.signal_data?.playtestAttempted === true);
  const inspectedConsoles = rows.filter(row => row.signal_data?.consoleInspected === true);
  const studioCalls = rows.reduce((sum, row) => sum + Math.max(0, Number(row.signal_data?.studioToolCount) || 0), 0);
  const studioFailures = rows.reduce((sum, row) => sum + Math.max(0, Number(row.signal_data?.failedStudioToolCount) || 0), 0);
  const ratingRows = ratings || [];
  const helpfulCount = ratingRows.filter(row => row.signal_data?.helpful === true).length;

  return {
    sampleSize: rows.length,
    runtimeVerifiedRate: Number((rows.filter(row => row.signal_data?.runtimeVerified === true).length / rows.length).toFixed(3)),
    playtestPassRate: attemptedPlaytests.length
      ? Number((attemptedPlaytests.filter(row => row.signal_data?.playtestPassed === true).length / attemptedPlaytests.length).toFixed(3))
      : null,
    cleanConsoleRate: inspectedConsoles.length
      ? Number((inspectedConsoles.filter(row => row.signal_data?.consoleClean === true).length / inspectedConsoles.length).toFixed(3))
      : null,
    failedStudioToolRate: studioCalls
      ? Number((studioFailures / studioCalls).toFixed(3))
      : null,
    userFeedbackCount: ratingRows.length,
    helpfulRate: ratingRows.length
      ? Number((helpfulCount / ratingRows.length).toFixed(3))
      : null,
  };
}

async function saveProjectMemoryStep(
  context: ProjectAgentContext,
  memoryType: "decision" | "architecture" | "bug" | "constraint" | "preference" | "status" | "other",
  title: string,
  content: string,
  sourceRef?: string,
) {
  "use step";
  await assertCurrentTaskStep(context);
  if (!title.trim() || title.length > 180 || !content.trim() || content.length > 4_000) {
    throw new Error("Project memories need a title (max 180 characters) and concise content (max 4,000 characters).");
  }
  if (sourceRef && sourceRef.length > 240) throw new Error("Memory source reference exceeds the allowed length.");
  assertMemoryContainsNoSecrets(title, content, sourceRef);
  const admin = createAdminClient();
  const { data: existing } = await admin.from("project_memories")
    .select("id")
    .eq("project_id", context.projectId)
    .eq("owner_id", context.ownerId)
    .eq("memory_type", memoryType)
    .eq("title", title)
    .limit(1)
    .maybeSingle();
  if (existing) {
    const { error } = await admin.from("project_memories")
      .update({ content, source_ref: sourceRef || null, updated_at: new Date().toISOString() })
      .eq("id", existing.id)
      .eq("owner_id", context.ownerId);
    if (error) throw new Error("Could not update the saved project memory.");
    return { id: existing.id, status: "updated", title, memoryType };
  }
  const { data, error } = await admin.from("project_memories").insert({
    project_id: context.projectId,
    owner_id: context.ownerId,
    memory_type: memoryType,
    title,
    content,
    source_ref: sourceRef || null,
  }).select("id").single();
  if (error || !data) throw new Error("Could not save the project memory.");
  return { id: data.id, status: "saved", title, memoryType };
}

export async function getActiveStudioToolsStep(ownerId: string): Promise<StudioToolInfo[]> {
  "use step";
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 45_000).toISOString();
  const { data, error } = await admin.from("studio_connectors")
    .select("id,studio_tools,last_seen_at")
    .eq("owner_id", ownerId)
    .is("disconnected_at", null)
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error || !data || !Array.isArray(data.studio_tools)) return [];
  return (data.studio_tools as StudioToolInfo[])
    .filter(item => item && typeof item.name === "string" && isAllowedStudioTool(item.name))
    .slice(0, 100);
}

async function createStudioCommandIdStep() {
  "use step";
  return randomUUID();
}

async function enqueueStudioCommandStep(
  context: ProjectAgentContext,
  commandId: string,
  toolName: string,
  toolArguments: Record<string, unknown>,
) {
  "use step";
  await assertCurrentTaskStep(context, true);
  if (!isAllowedStudioTool(toolName)) throw new Error("That Studio tool is not enabled in RMango.");
  const admin = createAdminClient();
  const cutoff = new Date(Date.now() - 45_000).toISOString();
  const { data: connector, error: connectorError } = await admin.from("studio_connectors")
    .select("id,studio_tools,last_seen_at")
    .eq("owner_id", context.ownerId)
    .is("disconnected_at", null)
    .gte("last_seen_at", cutoff)
    .order("last_seen_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (connectorError || !connector) throw new Error("Roblox Studio is not connected to RMango Cloud. Connect Studio in the desktop app and retry.");
  const tools = Array.isArray(connector.studio_tools) ? connector.studio_tools as StudioToolInfo[] : [];
  const registeredTool = tools.find(item => item.name === toolName && isAllowedStudioTool(item.name));
  if (!registeredTool) throw new Error("The connected Studio session does not expose the requested tool: " + toolName);

  const needsApproval = STUDIO_APPROVAL_TOOLS.has(toolName);
  const { error: insertError } = await admin.from("studio_commands").insert({
    id: commandId,
    connector_id: connector.id,
    owner_id: context.ownerId,
    task_id: context.taskId,
    tool_name: toolName,
    tool_arguments: toolArguments,
    approval_status: "pending",
    execution_status: "queued",
  });
  if (insertError) throw new Error("Could not queue the Studio tool call: " + insertError.message);

  if (needsApproval) {
    await admin.from("agent_tasks").update({
      status: "waiting_approval",
      updated_at: new Date().toISOString(),
    }).eq("id", context.taskId)
      .eq("owner_id", context.ownerId)
      .eq("status", "running")
      .filter("result->>runToken", "eq", context.runToken);
  }
  await admin.from("agent_events").insert({
    task_id: context.taskId,
    owner_id: context.ownerId,
    event_type: needsApproval ? "approval_required" : "studio_tool_queued",
    message: needsApproval
      ? "A Studio action is waiting for your approval in the RMango desktop app."
      : "A read-only Studio inspection was queued for the connected Roblox place.",
    data: { commandId, toolName, requiresApproval: needsApproval },
  });
  return { commandId, requiresApproval: needsApproval, connectorId: connector.id };
}

async function getStudioCommandResultStep(ownerId: string, commandId: string) {
  "use step";
  const admin = createAdminClient();
  const { data, error } = await admin.from("studio_commands")
    .select("execution_status,tool_result,error,approval_status")
    .eq("id", commandId)
    .eq("owner_id", ownerId)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function expireStudioCommandStep(context: ProjectAgentContext, commandId: string) {
  "use step";
  const admin = createAdminClient();
  await admin.from("studio_commands")
    .update({
      execution_status: "cancelled",
      error: "The local Studio connector did not return a result before the durable task timeout.",
      updated_at: new Date().toISOString(),
    })
    .eq("id", commandId)
    .eq("owner_id", context.ownerId)
    .in("execution_status", ["queued", "running"]);
  await admin.from("agent_tasks").update({
    status: "running",
    updated_at: new Date().toISOString(),
  }).eq("id", context.taskId)
    .eq("owner_id", context.ownerId)
    .eq("status", "waiting_approval")
    .filter("result->>runToken", "eq", context.runToken);
  await admin.from("agent_events").insert({
    task_id: context.taskId,
    owner_id: context.ownerId,
    event_type: "studio_tool_timeout",
    message: "The Studio connector did not return a result before the command timeout.",
    data: { commandId },
  });
}

async function callStudioToolWorkflow(
  context: ProjectAgentContext,
  toolName: string,
  toolArguments: Record<string, unknown>,
) {
  const commandId = await createStudioCommandIdStep();
  const hook = createHook<{ ok: boolean; result?: unknown; error?: string }>({ token: commandId });
  const queued = await enqueueStudioCommandStep(context, commandId, toolName, toolArguments);
  const hookedResult = await Promise.race([
    hook,
    sleep("5m").then(() => null),
  ]);
  let result = hookedResult;
  if (!result) {
    const current = await getStudioCommandResultStep(context.ownerId, commandId);
    if (current?.execution_status === "completed") {
      result = { ok: true, result: current.tool_result };
    } else if (current?.execution_status === "failed") {
      result = { ok: false, error: current.error || "Studio tool failed." };
    } else {
      await expireStudioCommandStep(context, commandId);
      throw new Error("Studio command timed out. Check that Roblox Studio remains open and connected, then retry.");
    }
  }
  if (!result.ok) throw new Error(result.error || "Roblox Studio reported a tool error.");
  await appendTaskEventStep(context.taskId, context.ownerId, "studio_tool_result", "Roblox Studio returned a result for " + toolName + ".", {
    commandId,
    toolName,
    resultPreview: summarizeValue(result.result, 1_600),
    requiresApproval: queued.requiresApproval,
  });
  return result.result ?? { ok: true };
}

export function createProjectAgentTools(context: ProjectAgentContext, studioTools: StudioToolInfo[]): ToolSet {
  const tools: ToolSet = {
    list_project_files: tool({
      description: "List all indexed files in the current Roblox project. Use search to narrow by filename.",
      inputSchema: z.object({ search: z.string().trim().max(120).optional() }),
      execute: ({ search }) => listProjectFilesStep(context, search),
    }),
    read_project_file: tool({
      description: "Read an exact uploaded Luau, Lua or text file from the current project.",
      inputSchema: z.object({ relativePath: z.string().trim().min(1).max(500) }),
      execute: ({ relativePath }) => readProjectFileStep(context, relativePath),
    }),
    search_project_files: tool({
      description: "Search source contents across the uploaded project. Returns ranked paths and line snippets; no code is executed.",
      inputSchema: z.object({ query: z.string().trim().min(2).max(200) }),
      execute: ({ query }) => searchProjectFilesStep(context, query),
    }),
    get_project_dependency_graph: tool({
      description: "Inspect the indexed project dependency graph, symbols, require relationships, services and remote references. Low-confidence references are not proof of a live instance.",
      inputSchema: z.object({ relativePath: z.string().trim().max(500).optional() }),
      execute: ({ relativePath }) => getProjectDependencyGraphStep(context, relativePath),
    }),
    find_project_symbols: tool({
      description: "Find function, module, service and remote symbols in the source index.",
      inputSchema: z.object({ search: z.string().trim().min(2).max(120) }),
      execute: ({ search }) => findProjectSymbolsStep(context, search),
    }),
    list_project_memories: tool({
      description: "Retrieve durable confirmed project decisions, architecture facts, constraints, bugs and preferences.",
      inputSchema: z.object({ search: z.string().trim().max(160).optional() }),
      execute: ({ search }) => listProjectMemoriesStep(context, search),
    }),
    get_project_learning_signals: tool({
      description: "Retrieve privacy-limited aggregate success, playtest, console, Studio-tool and user-rating trends from this project. These are historical quality signals, not model-training data.",
      inputSchema: z.object({}),
      execute: () => getProjectLearningSignalsStep(context),
    }),
    propose_project_file_change: tool({
      description: "Create a pending cloud source-file proposal. The user must approve it before the cloud copy is changed.",
      inputSchema: z.object({
        relativePath: z.string().trim().min(1).max(500),
        content: z.string().max(512_000),
        summary: z.string().trim().min(2).max(500),
      }),
      execute: ({ relativePath, content, summary }) => proposeProjectFileChangeStep(context, relativePath, content, summary),
    }),
    save_project_memory: tool({
      description: "Save or update a durable, confirmed project decision, architecture fact, bug, constraint or preference. Never save secrets or uncertain assumptions.",
      inputSchema: z.object({
        memoryType: z.enum(["decision", "architecture", "bug", "constraint", "preference", "status", "other"]),
        title: z.string().trim().min(2).max(160),
        content: z.string().trim().min(2).max(4_000),
        sourceRef: z.string().trim().max(300).optional(),
      }),
      execute: ({ memoryType, title, content, sourceRef }) => saveProjectMemoryStep(context, memoryType, title, content, sourceRef),
    }),
  };

  for (const studioTool of studioTools) {
    if (!studioTool || !isAllowedStudioTool(studioTool.name)) continue;
    const key = "studio_" + studioTool.name.replace(/[^a-zA-Z0-9_]/g, "_");
    const description = [
      "Call the connected user's actual Roblox Studio MCP tool named " + studioTool.name + ".",
      studioTool.description || "No additional tool description was provided by Studio.",
      "Use arguments matching the exact input schema: " + summarizeValue(studioTool.inputSchema || {}, 4_000),
      "Mutating tools trigger the desktop approval prompt and wait for the local Studio result. Do not claim success until this tool returns.",
    ].join("\n");
    tools[key] = tool({
      description,
      inputSchema: z.record(z.string(), z.unknown()),
      execute: argumentsObject => callStudioToolWorkflow(context, studioTool.name, argumentsObject),
    });
  }

  return tools;
}

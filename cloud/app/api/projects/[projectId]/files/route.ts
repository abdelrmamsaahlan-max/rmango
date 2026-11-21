import { NextResponse } from "next/server";
import { z } from "zod";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const textExtensions = new Set([
  ".lua", ".luau", ".txt", ".md", ".json", ".csv", ".xml", ".yaml", ".yml",
  ".toml", ".js", ".jsx", ".ts", ".tsx", ".css", ".html", ".py",
]);

const schema = z.object({
  relativePath: z.string().min(1).max(500),
  fileName: z.string().min(1).max(200),
  mimeType: z.string().min(1).max(120),
  sizeBytes: z.number().int().nonnegative().max(512_000),
  dataBase64: z.string().min(1).max(700_000),
});

function safeRelativePath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (normalized.startsWith("/") || normalized.includes("\0") || segments.some(segment => !segment || segment === "." || segment === "..")) {
    return null;
  }
  return normalized;
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId } = await context.params;
  const { supabase, user } = auth!;

  const { data, error } = await supabase
    .from("project_files")
    .select("id,relative_path,file_name,mime_type,size_bytes,sha256,created_at,indexed_at")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .order("relative_path", { ascending: true })
    .limit(500);
  if (error) return NextResponse.json({ error: "Could not list cloud project files." }, { status: 503 });
  return NextResponse.json({ files: data || [] });
}

export async function POST(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId } = await context.params;
  const { supabase, user } = auth!;

  const { data: project, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .eq("id", projectId)
    .eq("owner_id", user.id)
    .maybeSingle();
  if (projectError || !project) return NextResponse.json({ error: "Cloud project not found." }, { status: 404 });

  let payload: z.infer<typeof schema>;
  try {
    payload = schema.parse(await request.json());
  } catch {
    return NextResponse.json({ error: "The project file is invalid or exceeds the 512 KB file limit." }, { status: 400 });
  }

  const relativePath = safeRelativePath(payload.relativePath);
  const extension = payload.fileName.slice(payload.fileName.lastIndexOf(".")).toLowerCase();
  if (!relativePath || !textExtensions.has(extension)) {
    return NextResponse.json({ error: "Only supported source and text files can be imported in this version." }, { status: 400 });
  }

  const bytes = Buffer.from(payload.dataBase64, "base64");
  if (bytes.length !== payload.sizeBytes || bytes.length > 512_000) {
    return NextResponse.json({ error: "The file size does not match its content or exceeds the upload limit." }, { status: 413 });
  }

  const safeName = payload.fileName.replace(/[\\/:*?"<>|]/g, "_").slice(0, 180) || "source.txt";
  const storagePath = user.id + "/" + projectId + "/" + Buffer.from(relativePath).toString("base64url");
  const { error: storageError } = await supabase.storage
    .from("rmango-files")
    .upload(storagePath, bytes, {
      contentType: payload.mimeType,
      upsert: true,
      cacheControl: "3600",
    });
  if (storageError) {
    return NextResponse.json({ error: "Could not store " + safeName + " in the private cloud workspace." }, { status: 503 });
  }

  const { data: file, error: insertError } = await supabase
    .from("project_files")
    .upsert({
      project_id: projectId,
      owner_id: user.id,
      storage_path: storagePath,
      relative_path: relativePath,
      file_name: safeName,
      mime_type: payload.mimeType,
      size_bytes: bytes.length,
      sha256: null,
      indexed_at: null,
    }, { onConflict: "project_id,relative_path" })
    .select("id,relative_path,file_name,mime_type,size_bytes,created_at")
    .single();

  if (insertError || !file) {
    await supabase.storage.from("rmango-files").remove([storagePath]);
    return NextResponse.json({ error: "Could not index the uploaded source file." }, { status: 503 });
  }

  return NextResponse.json({ file }, { status: 201 });
}

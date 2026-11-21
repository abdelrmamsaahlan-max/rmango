import JSZip from "jszip";
import { NextResponse } from "next/server";
import { getAuthErrorResponse } from "@/lib/supabase";

export const runtime = "nodejs";
export const maxDuration = 120;

function safeZipPath(value: string) {
  const normalized = value.replace(/\\/g, "/");
  const segments = normalized.split("/");
  if (normalized.startsWith("/") || segments.some(segment => !segment || segment === "." || segment === "..")) return null;
  return normalized;
}

function safeArchiveName(value: string) {
  return value.replace(/[^A-Za-z0-9._ -]/g, "_").slice(0, 70) || "Roblox-Project";
}

export async function GET(request: Request, context: { params: Promise<{ projectId: string }> }) {
  const { context: auth, response } = await getAuthErrorResponse(request);
  if (response) return response;
  const { projectId } = await context.params;
  const { supabase, user } = auth!;

  const { data: project, error: projectError } = await supabase
    .from("projects").select("id,name").eq("id", projectId).eq("owner_id", user.id).maybeSingle();
  if (projectError || !project) return NextResponse.json({ error: "Cloud project not found." }, { status: 404 });

  const { data: files, error: listError } = await supabase
    .from("project_files")
    .select("storage_path,relative_path,size_bytes")
    .eq("project_id", projectId)
    .eq("owner_id", user.id)
    .order("relative_path", { ascending: true })
    .limit(250);
  if (listError) return NextResponse.json({ error: "Could not list cloud project files." }, { status: 503 });
  if (!files?.length) return NextResponse.json({ error: "This cloud project does not have any uploaded files yet." }, { status: 404 });

  const totalBytes = files.reduce((sum, file) => sum + Number(file.size_bytes || 0), 0);
  if (files.length > 250 || totalBytes > 40 * 1024 * 1024) {
    return NextResponse.json({ error: "This project exceeds the 250-file or 40 MB ZIP export limit." }, { status: 413 });
  }

  const zip = new JSZip();
  for (const file of files) {
    const relativePath = safeZipPath(file.relative_path);
    if (!relativePath) continue;
    const { data, error } = await supabase.storage.from("rmango-files").download(file.storage_path);
    if (error || !data) return NextResponse.json({ error: "Could not download " + relativePath + " from private storage." }, { status: 503 });
    zip.file(relativePath, await data.arrayBuffer());
  }

  const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE", compressionOptions: { level: 6 } });
  const filename = safeArchiveName(project.name) + ".zip";
  return new Response(buffer, {
    status: 200,
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": "attachment; filename=\"" + filename + "\"",
      "Content-Length": String(buffer.byteLength),
      "Cache-Control": "private, no-store",
    },
  });
}

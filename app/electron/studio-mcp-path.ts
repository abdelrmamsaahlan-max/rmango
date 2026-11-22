import fs from "node:fs/promises";
import path from "node:path";

/**
 * Locate the newest built-in Roblox Studio MCP executable on Windows.
 *
 * Launching StudioMCP.exe directly avoids errors in some versions of Roblox's
 * mcp.bat wrapper when the Windows user/profile path contains spaces.
 */
export async function findStudioMcpExecutable(localAppData: string): Promise<string | null> {
  if (!localAppData.trim()) return null;

  const versionsRoot = path.join(localAppData, "Roblox", "Versions");
  let entries;

  try {
    entries = await fs.readdir(versionsRoot, { withFileTypes: true });
  } catch {
    return null;
  }

  const candidates = await Promise.all(
    entries
      .filter(entry => entry.isDirectory() && /^version-/i.test(entry.name))
      .map(async entry => {
        const executablePath = path.join(versionsRoot, entry.name, "StudioMCP.exe");
        try {
          const stats = await fs.stat(executablePath);
          return stats.isFile() ? { executablePath, modifiedAt: stats.mtimeMs } : null;
        } catch {
          return null;
        }
      }),
  );

  candidates.sort((left, right) => (right?.modifiedAt ?? -1) - (left?.modifiedAt ?? -1));
  return candidates.find((candidate): candidate is NonNullable<typeof candidate> => candidate !== null)?.executablePath ?? null;
}

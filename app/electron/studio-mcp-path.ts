import fs from "node:fs/promises";
import path from "node:path";

/**
 * Locate the newest built-in Roblox Studio MCP executable on Windows.
 *
 * Roblox Studio has used both a versioned Roblox\Versions directory and a
 * standalone Roblox Studio directory. Prefer the newest executable found in
 * either layout, before falling back to Roblox's generated mcp.bat wrapper.
 */
export async function findStudioMcpExecutable(localAppData: string): Promise<string | null> {
  if (!localAppData.trim()) return null;

  const candidates: Array<{ executablePath: string; modifiedAt: number }> = [];

  const addCandidate = async (executablePath: string) => {
    try {
      const stats = await fs.stat(executablePath);
      if (stats.isFile()) candidates.push({ executablePath, modifiedAt: stats.mtimeMs });
    } catch {
      // A missing layout is normal; check the other supported install path.
    }
  };

  await addCandidate(path.join(localAppData, "Roblox Studio", "StudioMCP.exe"));

  const versionsRoot = path.join(localAppData, "Roblox", "Versions");
  try {
    const entries = await fs.readdir(versionsRoot, { withFileTypes: true });
    await Promise.all(
      entries
        .filter(entry => entry.isDirectory() && /^version-/i.test(entry.name))
        .map(entry => addCandidate(path.join(versionsRoot, entry.name, "StudioMCP.exe"))),
    );
  } catch {
    // The versioned install layout may not exist on newer installations.
  }

  candidates.sort((left, right) => right.modifiedAt - left.modifiedAt);
  return candidates[0]?.executablePath ?? null;
}

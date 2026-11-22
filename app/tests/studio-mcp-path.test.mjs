import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findStudioMcpExecutable } from "../electron/studio-mcp-path.ts";

test("returns null when Roblox Studio is not installed", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmango-no-studio-"));
  try {
    assert.equal(await findStudioMcpExecutable(root), null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("selects the newest installed StudioMCP.exe and supports profile paths containing spaces", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmango-studio path "));
  try {
    const versionsRoot = path.join(root, "Roblox", "Versions");
    const older = path.join(versionsRoot, "version-older");
    const newer = path.join(versionsRoot, "version-newer");
    await fs.mkdir(older, { recursive: true });
    await fs.mkdir(newer, { recursive: true });

    const olderExe = path.join(older, "StudioMCP.exe");
    const newerExe = path.join(newer, "StudioMCP.exe");
    await fs.writeFile(olderExe, "older");
    await fs.writeFile(newerExe, "newer");

    const oldTime = new Date("2026-01-01T00:00:00.000Z");
    const newTime = new Date("2026-11-22T00:00:00.000Z");
    await fs.utimes(olderExe, oldTime, oldTime);
    await fs.utimes(newerExe, newTime, newTime);

    assert.equal(await findStudioMcpExecutable(root), newerExe);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("supports the standalone Roblox Studio installation directory", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmango-studio-standalone-"));
  try {
    const standaloneExe = path.join(root, "Roblox Studio", "StudioMCP.exe");
    await fs.mkdir(path.dirname(standaloneExe), { recursive: true });
    await fs.writeFile(standaloneExe, "studio-mcp");
    assert.equal(await findStudioMcpExecutable(root), standaloneExe);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("chooses the newest executable across both supported Roblox install layouts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmango-studio-layouts-"));
  try {
    const standaloneExe = path.join(root, "Roblox Studio", "StudioMCP.exe");
    const versionedExe = path.join(root, "Roblox", "Versions", "version-abc", "StudioMCP.exe");
    await fs.mkdir(path.dirname(standaloneExe), { recursive: true });
    await fs.mkdir(path.dirname(versionedExe), { recursive: true });
    await fs.writeFile(standaloneExe, "standalone");
    await fs.writeFile(versionedExe, "versioned");

    const older = new Date("2026-01-01T00:00:00.000Z");
    const newer = new Date("2026-11-22T00:00:00.000Z");
    await fs.utimes(standaloneExe, older, older);
    await fs.utimes(versionedExe, newer, newer);

    assert.equal(await findStudioMcpExecutable(root), versionedExe);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("ignores folders without StudioMCP.exe", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "rmango-empty-version-"));
  try {
    await fs.mkdir(path.join(root, "Roblox", "Versions", "version-no-mcp"), { recursive: true });
    await fs.writeFile(path.join(root, "Roblox", "Versions", "not-a-version.txt"), "ignore");
    assert.equal(await findStudioMcpExecutable(root), null);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
});

test("rejects a blank local app-data path", async () => {
  assert.equal(await findStudioMcpExecutable("  "), null);
});

# Rmango — Roblox Studio AI

Rmango is a Windows desktop workspace for Roblox development. It is local-first: the default AI runs on your computer through Ollama, with no hosted AI-provider API key.

## Download and install

Open the [GitHub Releases page](https://github.com/abdelrmamsaahlan-max/rmango/releases) and download the newest **Rmango-Setup-<version>-x64.exe** asset.

The installer is a Windows setup EXE. GitHub's **Code → Download ZIP** is only source code, not an installer.

## Automatic GitHub updates

The installed Windows app checks the public Rmango GitHub Releases feed shortly after startup and every four hours. You can also press **Check updates** in the top bar.

When a newer release is found, Rmango downloads it in the background and shows the version and download progress. It does **not** unexpectedly close your app: once the download finishes, choose **Restart & install** to apply it.

The GitHub Actions workflow builds and publishes a new stable release on pushes to the main branch. It assigns a monotonically increasing patch version (0.2.<GitHub workflow run number>) and uploads both the NSIS installer and Electron's latest.yml update manifest. The workflow checks that the EXE and manifest are actually present in the release before it succeeds. A release containing only an EXE is not a valid auto-update release.

**One-time migration:** the original 0.2.0 installer was built before the updater was added. That older copy cannot update itself. Install the first updater-enabled release from GitHub Releases once; subsequent releases can be installed from inside Rmango.

### Development hot reload

From the app/ directory, run:

~~~powershell
npm install --no-audit --no-fund
npm run dev
~~~

Vite hot-refreshes React/CSS renderer edits. Nodemon watches electron/main.ts and electron/preload.cts, rebuilds the Electron TypeScript output, and restarts the desktop process when either changes. This is a development-only workflow, not an installed-app updater.

## First-run setup: local AI

1. Install [Ollama for Windows](https://ollama.com/download/windows).
2. Open Ollama once and leave it running.
3. Open Rmango → **Settings → Local AI**.
4. Press **Check**. When Rmango detects Ollama, download the default qwen3.5:4b model.
5. Once it is downloaded, chat with Rmango. Model requests are sent to the local Ollama service at 127.0.0.1:11434; Rmango does not send prompts to an AI provider.

The model weights are downloaded once. After they are present, local inference can work without an internet connection. The first runtime/model installation needs an internet connection. Local speed and quality depend on your hardware and the selected model; a small local model is not equivalent to a frontier hosted model.

## Photos and files

The chat composer accepts images (PNG, JPEG, WebP, GIF) and text/code files (Luau, Lua, TXT, Markdown, JSON, CSV, XML, YAML, TOML, JavaScript, TypeScript, CSS, and HTML). Images are sent to the selected local vision model; text files are included as context. Current limits are 8 attachments per message, 8 MB per image, and 512 KB per text file.

## Connect Roblox Studio with MCP

MCP means **Model Context Protocol**. It is the connector between the AI model and Roblox Studio. The model decides which action to request; the MCP client sends that request to Studio; Studio runs the corresponding tool.

Roblox Studio already includes its own MCP server. You do not need to write a second Roblox plugin/server just to connect Rmango:

1. Open Roblox Studio and the place you want Rmango to work on.
2. Open **Assistant → … → Manage MCP Servers**.
3. Enable **Studio as MCP server**.
4. Keep Studio open and switch to Rmango.
5. Press **Connect to Studio** in the right-hand panel.

On Windows, the Roblox MCP launcher is normally at %LOCALAPPDATA%\Roblox\mcp.bat. Rmango starts that local process using stdio transport and discovers the available tools.

For other MCP clients, Roblox documents this Windows entry:

~~~json
{
  "mcpServers": {
    "Roblox_Studio": {
      "command": "cmd.exe",
      "args": ["/c", "%LOCALAPPDATA%\\Roblox\\mcp.bat"]
    }
  }
}
~~~

## Studio permissions

Read-only inspection tools can run without an approval prompt. Script edits, Luau execution, procedural models, asset insertion, uploads, playtest controls, player input, and saving a place require a visible **Approve / Deny** decision in Rmango. Denying or allowing an action is your choice. Rmango does not expose publishing or deletion tools in this build.

A map workflow should start by inspecting the existing place, then propose the layout and scale. After you approve a specific Studio operation, Rmango can use the available procedural-model, mesh/material, asset, and Luau tools in focused passes. Tool availability varies by Roblox Studio version.

## Windows Smart App Control and publisher signing

The installer can be produced without a certificate, but an unsigned installer may be blocked by Windows Smart App Control because Windows cannot verify its publisher. That is not a reason to disable Windows protection. Automatic updates do not remove this first-install warning.

For a trusted publisher identity, the application binaries and installer must be signed using a valid code-signing certificate from a certificate authority in Microsoft's Trusted Root Program (or Microsoft's supported Artifact Signing service). A self-signed test certificate does not establish a trusted publisher for Smart App Control.

The GitHub workflow supports a PFX certificate through these repository secrets:
- RMANGO_SIGNING_PFX_BASE64: Base64 contents of the certificate PFX.
- RMANGO_SIGNING_PFX_PASSWORD: PFX password.

Only the repository owner or an authorized adult maintainer should manage a real publisher certificate and its secrets. When a valid certificate is configured, the build signs the installer and the updater verifies the downloaded update's publisher. Without it, the current public build uses HTTPS GitHub releases and the generated SHA-512 update checksum, but Windows publisher-signature verification is disabled for that unsigned build. Protect the GitHub repository and its Actions write permissions accordingly.

## Build from source

Requirements: Windows 10/11, Node.js 22+, npm, and internet access for dependency/model downloads.

~~~powershell
cd app
npm install --no-audit --no-fund
npm run dev
~~~

For a local Windows NSIS setup executable that does not publish a release, run **npm run dist:win**. The CI-only release command is **npm run dist:win:publish** and requires a GitHub token with release write permission.

## Repository structure

- app/: editable React + Electron application.
- app/electron/main.ts: Ollama/local inference, optional cloud adapters, MCP client, file context, approval gate, and GitHub updater.
- app/electron/preload.cts: typed, context-isolated IPC surface for the renderer.
- app/src/App.tsx: workspace UI, attachment composer, local AI setup, Studio inspector, approval dialog, and update controls.
- app/src/styles.css: mango yellow / forest green visual system and update status.
- app/build/generate-icon.ps1: generates the 256×256 mango Windows icon.
- .github/workflows/windows-installer.yml: automatic versioning, Windows packaging, optional signing, GitHub publishing, and update-feed verification.

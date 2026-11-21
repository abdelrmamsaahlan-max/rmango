# Rmango — Roblox AI Studio

Rmango is a Windows-first, local-first desktop workspace for AI-assisted Roblox development.

## Download and install

**The installer is a Windows `.exe`, not a ZIP.** Open the [GitHub Releases page](https://github.com/abdelrmamsaahlan-max/rmango/releases) and download the asset named `Rmango-Setup-x.y.z-x64.exe`.

Do not use GitHub's green **Code → Download ZIP** button to install Rmango. That download contains source code only.

1. Open the latest GitHub Release.
2. Under **Assets**, download `Rmango-Setup-...-x64.exe`.
3. Double-click the EXE and follow the Windows setup wizard.
4. Choose an install folder, then finish setup.
5. Launch **Rmango** from the Start Menu or desktop shortcut.

The installer supports a custom installation directory, creates shortcuts, and preserves your local settings/chat when uninstalling. Remove the app through Windows Settings → Apps.

> The repository's `source/Rmango-source.zip` is a developer source bundle used by the automated Windows build. It is not the installer.

## Build the installer from source

Requirements: Windows 10/11, Node.js 22+, npm, and an internet connection.

1. Download `source/Rmango-source.zip` from this repository.
2. Extract it into a folder.
3. Run `build-windows-installer.bat`, or run:

```powershell
npm install --no-audit --no-fund
npm run dist:win
```

The output is written to `release/Rmango-Setup-0.1.1-x64.exe` (the version follows `package.json`).

## Automated GitHub releases

The workflow at `.github/workflows/windows-installer.yml` extracts the source bundle, builds Rmango on a Windows GitHub Actions runner, verifies that an `.exe` was produced, and attaches **only the setup `.exe`** to a GitHub Release.

To publish a new build:
- Push a version tag such as `v0.1.1`, or
- Open **Actions → Build Windows Installer → Run workflow** and enter a new tag name.

## Included capabilities

- Studio-style workspace with chat, project explorer, Studio inspector, and activity log.
- Anthropic and OpenAI provider adapters with editable model IDs.
- Separate encrypted local API-key storage per provider using Electron `safeStorage` when available.
- Roblox Studio built-in MCP connection via `%LOCALAPPDATA%\Roblox\mcp.bat`.
- Read-only Studio tools: read/search scripts, inspect state, view console output, and capture the viewport (depending on the Studio MCP version).
- Local project-folder explorer and restricted source/text-file reader.
- Local chat history in the app's user-data directory.

## Configure AI

1. Open **Settings**.
2. Choose Anthropic or OpenAI.
3. Enter a model ID supported by that provider account. Suggested IDs are available in the model field.
4. Paste that provider's API key and save.

Suggested model IDs include `claude-fable-5-2`, `claude-opus-5-5`, `claude-sonnet-5-5`, `gpt-6.2-astra`, and `gpt-6.2-sol`. Availability and pricing are controlled by the provider. API usage is billed separately; Rmango does not include model credits.

API keys are stored locally. When Windows secure storage is available, keys are encrypted with Electron's OS-backed storage. Provider keys are kept separately so switching between Anthropic and OpenAI does not send the wrong provider's key.

## Connect Roblox Studio

1. Open Roblox Studio and your place.
2. Open **Assistant → Manage MCP Servers**.
3. Enable **Studio as MCP server**.
4. Keep Studio running and click **Connect to Studio** in Rmango.

## Safety and MVP limits

- Studio editing, publishing, inserting assets, and destructive actions are not enabled yet. Current Studio access is read-only.
- Local project files are inspected only when requested by the agent and are not uploaded wholesale.
- The project reader blocks path traversal and symlinks that resolve outside the selected project folder.
- The app talks directly to your selected AI provider; there is no Rmango-hosted backend.
- Review code suggestions before using them in a published experience.

See [ARCHITECTURE.md](./ARCHITECTURE.md) inside the source bundle for technical details.

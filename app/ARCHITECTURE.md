# Rmango architecture

## Product shape

Rmango is a local-first Windows desktop Roblox development agent. The renderer owns presentation; Electron's main process owns model connections, secrets, local files, MCP, and the approval policy.

## Runtime layout

```text
React renderer
  Chat · image/file attachments · project explorer · Studio inspector
  Local runtime status · pending Studio approval cards
          │ context-isolated preload / IPC
          ▼
Electron main process
  Settings vault · local file reader · session history
  Model router · tool-call loop · approval broker
       │                         │
       ▼                         ▼
Ollama localhost             MCP stdio client
127.0.0.1:11434              %LOCALAPPDATA%\Roblox\mcp.bat
       │                         │
       ▼                         ▼
Local model weights          Roblox Studio MCP server
on this PC                   Open Studio place/session
```

Optional Anthropic/OpenAI adapters remain available, but they are not required and are not the default.

## Main modules

- `electron/main.ts`: Ollama model detection and pull, local multimodal chat, optional cloud adapters, project file access, Roblox MCP transport, tool policy, and approval waiters.
- `electron/preload.cts`: narrow IPC bridge with context isolation enabled and renderer Node access disabled.
- `src/App.tsx`: mango-themed desktop UI, attachment handling, local model setup, Studio controls, approval dialog.
- `src/styles.css`: forest green and mango gold design system.
- `src/types.ts`: renderer/main IPC contracts.

## Local AI

1. User installs Ollama for Windows.
2. Rmango checks `http://127.0.0.1:11434/api/tags`.
3. The user downloads a model from Rmango Settings, which calls Ollama's local `/api/pull` endpoint.
4. Chat requests use `/api/chat`, with the local model, image attachments, project context, and the allowed MCP tool schemas.
5. The model's tool calls enter the same policy checks as cloud adapters.

No Rmango backend relays prompts. A model must already be downloaded on the PC. The local model is a pretrained model running locally, not a model trained by Rmango.

## Attachments

- PNG/JPEG/WebP/GIF images are passed as base64 image content to Ollama's vision-capable chat endpoint.
- Text and code files are decoded locally and appended as labelled context.
- Renderer session history stores attachment metadata only; file/image bytes are not persisted as chat history.
- Current limits: eight attachments per message, 8 MB per image, 512 KB per text file.

## Roblox Studio MCP and approval policy

Roblox Studio already ships an MCP server. Rmango is the MCP client and starts the Roblox launcher through Windows stdio transport.

- Read-only tool allowlist: state, script inspection/search, DataModel inspection, screenshots, output, documentation, asset search, and image storage.
- Approval-required tool allowlist: script edits, Luau execution, procedural models, meshes/materials, animations/avatars, asset insertion/upload, playtest start/stop, simulated user input, character navigation, and save-place.
- Every approval-required call sends a request to the renderer and waits for an explicit Approve/Deny response. A two-minute timeout denies the call.
- Publishing, destructive delete, account access, and shell-command execution are not exposed.

For map tasks, the agent should inspect the place first, plan the layout, then build in incremental passes. Every mutation is visible to the user before it reaches Studio.

## Security boundaries

- Electron context isolation enabled; renderer Node integration disabled.
- API keys are encrypted using Electron safeStorage where supported; local Ollama uses no API key.
- Local project file reads are restricted to approved text/code extensions, capped at 512 KB each, and resolved inside the selected folder.
- No symlinks are traversed by the project explorer.
- External links require HTTPS.
- MCP tool calls must be in the explicit allowlist; mutations are never sent without user approval.

## Windows installer and publisher signing

Electron Builder produces an x64 NSIS installer named `Rmango-Setup-0.2.0-x64.exe`. The build generates a 256x256 PNG-backed mango ICO before packaging.

When `RMANGO_SIGNING_PFX_BASE64` and `RMANGO_SIGNING_PFX_PASSWORD` GitHub Secrets are configured with a valid trusted Windows code-signing certificate, electron-builder signs the packaged Windows binaries and installer. Without those secrets, the build is unsigned; Windows Smart App Control may block it because the publisher cannot be verified. The code does not disable or bypass Windows security.

## Next engineering milestones

1. Model-aware specialist workflows for architect, Luau, UI, 3D map, and QA tasks.
2. Snapshot/rollback and structured diffs for Studio edits.
3. Better tool-output parsing and Studio-ID routing across multiple open Studio instances.
4. Automated playtest loops with explicit approval and stop conditions.
5. Evaluation projects to measure whether model/tool changes improve results rather than relying on claims.

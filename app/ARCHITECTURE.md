# Rmango architecture

## Product shape

Rmango is a local-first Windows desktop agent. The desktop shell owns secrets, file access, and subprocesses. The renderer owns presentation and user interaction. The agent coordinator owns model requests, tool policy, and iterative tool execution.

## Runtime layers

```text
┌─────────────────────────────────────────────────────────────┐
│ React renderer                                               │
│ Chat · Project Explorer · Studio Inspector · Activity       │
└───────────────────────────┬─────────────────────────────────┘
                            │ context-isolated preload / IPC
┌───────────────────────────▼─────────────────────────────────┐
│ Electron main process                                        │
│ Settings vault · Local project reader · Session persistence  │
│ Provider router · Agent loop · Tool policy                    │
└───────────────┬───────────────────────────┬─────────────────┘
                │                           │
       ┌────────▼─────────┐        ┌────────▼──────────────┐
       │ Provider adapters│        │ MCP client            │
       │ Anthropic        │        │ stdio transport       │
       │ OpenAI           │        └────────┬──────────────┘
       └────────┬─────────┘                 │
                │                 ┌─────────▼──────────────┐
                │                 │ Roblox Studio MCP     │
                │                 │ active local session  │
                │                 └───────────────────────┘
                ▼
       Provider API over HTTPS
```

## Key modules

- `electron/main.ts`: Electron lifecycle, secure settings, project selection/reading, MCP connection, AI provider adapters, read-only agent loop.
- `electron/preload.ts`: narrow IPC bridge exposed with `contextIsolation` enabled and `nodeIntegration` disabled.
- `src/App.tsx`: workspace UI and renderer state.
- `src/styles.css`: desktop workspace visual system.
- `src/types.ts`: IPC and app-state contracts.

## Agent loop

1. Renderer submits the conversation.
2. Main process loads the configured provider key from OS-encrypted app settings.
3. The provider adapter sends the system prompt, recent conversation, and the allowlisted tools.
4. If the model requests a tool, the coordinator validates it against an explicit read-only allowlist.
5. The MCP client executes the tool against the connected Studio ID/session through Roblox's own launcher.
6. Tool output is added to the model conversation and the agent is called again, with a hard cap of six model turns per user request.
7. Rmango returns the final answer and an activity log to the renderer.

## Security boundaries in MVP

- Context isolation and no Node access in the renderer.
- API keys are encrypted with Electron `safeStorage` when the OS secure-storage backend is available.
- No API key is sent to an Rmango server; requests go directly to the selected provider from the main process.
- Only a strict allowlist of read-only Studio tool names is passed to the model. A model cannot call editing, insertion, publishing, or destructive Studio tools.
- The local project reader resolves paths under the selected root, rejects traversal outside that root, restricts file extensions, and limits individual files to 120 KB.
- External links are restricted to HTTPS.

## Next engineering milestones

1. Add approval cards for mutations: explain the exact target, diff, and risk; require user approval before execution.
2. Add backups, change journal, rollback, and post-change validation.
3. Add robust task planning and specialist roles (architect, Luau engineer, UI builder, 3D workflow, QA).
4. Add screenshot understanding and a persistent game/project map.
5. Integrate Blender through a separately permissioned adapter.
6. Add automated playtest loops using explicit limits and stop conditions.
7. Add repeatable Roblox benchmarks so agent improvements are measured rather than guessed.


## Windows packaging

Electron Builder creates an NSIS installer for x64 Windows. The installer is named `Rmango-Setup-${version}-x64.exe`, supports a custom install directory, creates Start Menu and desktop shortcuts, runs after installation, and preserves user data when the app is uninstalled. GitHub Actions runs the packaging step on `windows-latest` and attaches only the `.exe` setup file to a GitHub Release. The ZIP produced by GitHub's Code menu is a source archive, not an installable application.

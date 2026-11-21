import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getAppState: () => ipcRenderer.invoke('app:get-state'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: { provider: 'anthropic' | 'openai'; model: string; apiKey?: string }) =>
    ipcRenderer.invoke('settings:save', settings),
  openProject: () => ipcRenderer.invoke('project:open'),
  clearProject: () => ipcRenderer.invoke('project:clear'),
  connectRoblox: () => ipcRenderer.invoke('mcp:connect'),
  disconnectRoblox: () => ipcRenderer.invoke('mcp:disconnect'),
  getMcpState: () => ipcRenderer.invoke('mcp:state'),
  listMcpTools: () => ipcRenderer.invoke('mcp:list-tools'),
  runDiagnostics: () => ipcRenderer.invoke('mcp:diagnostics'),
  loadMessages: () => ipcRenderer.invoke('chat:load'),
  saveMessages: (messages: Array<{ role: 'user' | 'assistant'; content: string; createdAt: string }>) =>
    ipcRenderer.invoke('chat:save', messages),
  sendMessage: (payload: { messages: Array<{ role: 'user' | 'assistant'; content: string }>; mode: string }) =>
    ipcRenderer.invoke('chat:send', payload),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
};

contextBridge.exposeInMainWorld('rmango', api);

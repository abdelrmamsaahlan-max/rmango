import { contextBridge, ipcRenderer } from 'electron';

const api = {
  getAppState: () => ipcRenderer.invoke('app:get-state'),
  getSettings: () => ipcRenderer.invoke('settings:get'),
  saveSettings: (settings: { provider: 'ollama' | 'anthropic' | 'openai'; model: string; apiKey?: string }) =>
    ipcRenderer.invoke('settings:save', settings),
  getLocalAiState: (model?: string) => ipcRenderer.invoke('local-ai:state', model),
  pullLocalModel: (model: string) => ipcRenderer.invoke('local-ai:pull', model),
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
  sendMessage: (payload: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    attachments?: Array<{ name: string; mimeType: string; kind: 'image' | 'file'; size: number; data: string }>;
    mode: string;
  }) => ipcRenderer.invoke('chat:send', payload),
  onToolApproval: (callback: (request: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: any) => callback(request);
    ipcRenderer.on('studio:approval-request', listener);
    return () => ipcRenderer.removeListener('studio:approval-request', listener);
  },
  respondToolApproval: (requestId: string, approved: boolean) =>
    ipcRenderer.invoke('studio:approval-result', { requestId, approved }),
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
};

contextBridge.exposeInMainWorld('rmango', api);

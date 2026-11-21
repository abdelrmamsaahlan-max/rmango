import { contextBridge, ipcRenderer } from 'electron';

type CloudProfile = 'fast' | 'developer' | 'think' | 'vision' | 'agent';

const api = {
  getAppState: () => ipcRenderer.invoke('app:get-state'),
  getCloudState: () => ipcRenderer.invoke('cloud:state'),
  cloudSignIn: (credentials: { email: string; password: string }) => ipcRenderer.invoke('cloud:sign-in', credentials),
  cloudSignUp: (credentials: { email: string; password: string; displayName?: string }) => ipcRenderer.invoke('cloud:sign-up', credentials),
  cloudSignOut: () => ipcRenderer.invoke('cloud:sign-out'),
  getCloudModels: () => ipcRenderer.invoke('cloud:models'),
  openProject: () => ipcRenderer.invoke('project:open'),
  clearProject: () => ipcRenderer.invoke('project:clear'),
  uploadCloudProject: () => ipcRenderer.invoke('project:upload-cloud'),
  getCloudProjectChanges: (projectId: string) => ipcRenderer.invoke('project:changes', projectId),
  reviewCloudProjectChange: (payload: { projectId: string; changeId: string; decision: 'approve' | 'reject' }) => ipcRenderer.invoke('project:review-change', payload),
  downloadCloudProject: (projectId: string) => ipcRenderer.invoke('project:download-cloud', projectId),
  onProjectUploadProgress: (callback: (event: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: any) => callback(payload);
    ipcRenderer.on('project:upload-progress', listener);
    return () => ipcRenderer.removeListener('project:upload-progress', listener);
  },
  connectRoblox: () => ipcRenderer.invoke('mcp:connect'),
  disconnectRoblox: () => ipcRenderer.invoke('mcp:disconnect'),
  getMcpState: () => ipcRenderer.invoke('mcp:state'),
  listMcpTools: () => ipcRenderer.invoke('mcp:list-tools'),
  runDiagnostics: () => ipcRenderer.invoke('mcp:diagnostics'),
  loadMessages: () => ipcRenderer.invoke('chat:load'),
  saveMessages: (messages: Array<{ role: 'user' | 'assistant'; content: string; createdAt: string }>) =>
    ipcRenderer.invoke('chat:save', messages),
  cancelMessage: (requestId: string) => ipcRenderer.invoke('cloud:cancel', requestId),
  sendMessage: (payload: {
    messages: Array<{ role: 'user' | 'assistant'; content: string }>;
    attachments?: Array<{ name: string; mimeType: string; kind: 'image' | 'file'; size: number; data: string }>;
    profile: CloudProfile;
    projectId?: string;
    conversationId?: string;
    requestId?: string;
  }) => ipcRenderer.invoke('cloud:send', payload),
  onCloudChatDelta: (callback: (event: { requestId: string; delta: string }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { requestId: string; delta: string }) => callback(payload);
    ipcRenderer.on('cloud:chat-delta', listener);
    return () => ipcRenderer.removeListener('cloud:chat-delta', listener);
  },
  onToolApproval: (callback: (request: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, request: any) => callback(request);
    ipcRenderer.on('studio:approval-request', listener);
    return () => ipcRenderer.removeListener('studio:approval-request', listener);
  },
  respondToolApproval: (requestId: string, approved: boolean) =>
    ipcRenderer.invoke('studio:approval-result', { requestId, approved }),
  getUpdateState: () => ipcRenderer.invoke('updates:get-state'),
  checkForUpdates: () => ipcRenderer.invoke('updates:check'),
  installUpdate: () => ipcRenderer.invoke('updates:install'),
  onUpdateStatus: (callback: (state: any) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, state: any) => callback(state);
    ipcRenderer.on('updates:status', listener);
    return () => ipcRenderer.removeListener('updates:status', listener);
  },
  openExternal: (url: string) => ipcRenderer.invoke('app:open-external', url),
};

contextBridge.exposeInMainWorld('rmango', api);

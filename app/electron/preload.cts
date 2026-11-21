import { contextBridge, ipcRenderer } from 'electron';

type CloudProfile = 'fast' | 'developer' | 'think' | 'vision' | 'agent';

const api = {
  getAppState: () => ipcRenderer.invoke('app:get-state'),
  setAppearance: (theme: 'dark' | 'light' | 'system') => ipcRenderer.invoke('settings:appearance', theme),
  updateSettings: (patch: Record<string, unknown>) => ipcRenderer.invoke('settings:update', patch),
  getCloudState: () => ipcRenderer.invoke('cloud:state'),
  getCloudUsage: () => ipcRenderer.invoke('cloud:usage'),
  cloudSignIn: (credentials: { email: string; password: string }) => ipcRenderer.invoke('cloud:sign-in', credentials),
  requestPasswordReset: (payload: { email: string }) => ipcRenderer.invoke('cloud:password-reset', payload),
  cloudSignUp: (credentials: { email: string; password: string; displayName?: string }) => ipcRenderer.invoke('cloud:sign-up', credentials),
  cloudSignOut: () => ipcRenderer.invoke('cloud:sign-out'),
  getCloudModels: () => ipcRenderer.invoke('cloud:models'),
  getCloudConversations: (projectId?: string) => ipcRenderer.invoke('cloud:conversations:list', projectId),
  getCloudTasks: (projectId?: string) => ipcRenderer.invoke('cloud:tasks:list', projectId),
  getCloudProjects: () => ipcRenderer.invoke('cloud:projects:list'),
  createCloudProject: (payload: { name: string; description?: string }) => ipcRenderer.invoke('cloud:projects:create', payload),
  updateCloudProject: (payload: { projectId: string; name?: string; description?: string }) => ipcRenderer.invoke('cloud:projects:update', payload),
  deleteCloudProject: (projectId: string) => ipcRenderer.invoke('cloud:projects:delete', projectId),
  setCurrentCloudProjectId: (projectId?: string | null) => ipcRenderer.invoke('cloud:project:set-active', projectId),
  loadCloudConversation: (conversationId: string) => ipcRenderer.invoke('cloud:conversations:load', conversationId),
  createCloudConversation: (payload: { title?: string; projectId?: string; modelProfile: CloudProfile }) => ipcRenderer.invoke('cloud:conversations:create', payload),
  setCurrentConversationId: (conversationId?: string | null) => ipcRenderer.invoke('cloud:conversation:set-active', conversationId),
  openProject: () => ipcRenderer.invoke('project:open'),
  getGitWorkspaceState: () => ipcRenderer.invoke('git:status'),
  getGitWorkspaceDiff: () => ipcRenderer.invoke('git:diff'),
  clearProject: () => ipcRenderer.invoke('project:clear'),
  uploadCloudProject: () => ipcRenderer.invoke('project:upload-cloud'),
  getCloudProjectChanges: (projectId: string) => ipcRenderer.invoke('project:changes', projectId),
  getCloudProjectCheckpoints: (projectId: string) => ipcRenderer.invoke('project:checkpoints', projectId),
  restoreCloudProjectCheckpoint: (payload: { projectId: string; checkpointId: string }) => ipcRenderer.invoke('project:checkpoint-restore', payload),
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
  selectStudioInstance: (studioId: string) => ipcRenderer.invoke('mcp:select-studio', studioId),
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
  onCloudChatActivity: (callback: (event: { requestId: string; activity: { id: string; name: string; detail: string; ok: boolean; status?: 'running' | 'completed' | 'failed' | 'cancelled' } }) => void) => {
    const listener = (_event: Electron.IpcRendererEvent, payload: { requestId: string; activity: { id: string; name: string; detail: string; ok: boolean; status?: 'running' | 'completed' | 'failed' | 'cancelled' } }) => callback(payload);
    ipcRenderer.on('cloud:chat-activity', listener);
    return () => ipcRenderer.removeListener('cloud:chat-activity', listener);
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

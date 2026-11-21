export type AIProvider = 'ollama' | 'anthropic' | 'openai';

export type AttachmentKind = 'image' | 'file';

export type ChatAttachment = {
  id: string;
  name: string;
  mimeType: string;
  kind: AttachmentKind;
  size: number;
  previewUrl?: string;
};

export type AttachmentPayload = {
  name: string;
  mimeType: string;
  kind: AttachmentKind;
  size: number;
  data: string;
};

export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  attachments?: ChatAttachment[];
};

export type ProjectFile = {
  name: string;
  path: string;
  kind: 'file' | 'folder';
};

export type AppState = {
  appVersion: string;
  platform: string;
  projectPath: string;
  projectFiles?: ProjectFile[];
  studioConnected: boolean;
  studioToolCount: number;
};

export type Settings = {
  provider: AIProvider;
  model: string;
  keyConfigured: boolean;
  configuredProviders?: string[];
  secureStorageAvailable: boolean;
};

export type LocalAiState = {
  running: boolean;
  modelInstalled: boolean;
  models: string[];
  model: string;
  error?: string;
};

export type StudioApprovalRequest = {
  requestId: string;
  name: string;
  description: string;
  arguments: Record<string, unknown>;
};

export type AgentActivity = { name: string; detail: string; ok: boolean };

declare global {
  interface Window {
    rmango: {
      getAppState: () => Promise<AppState>;
      getSettings: () => Promise<Settings>;
      saveSettings: (settings: { provider: AIProvider; model: string; apiKey?: string }) => Promise<any>;
      getLocalAiState: (model?: string) => Promise<LocalAiState>;
      pullLocalModel: (model: string) => Promise<{ ok: boolean; message: string }>;
      openProject: () => Promise<{ canceled?: boolean; path?: string; files?: ProjectFile[] }>;
      clearProject: () => Promise<any>;
      connectRoblox: () => Promise<any>;
      disconnectRoblox: () => Promise<any>;
      getMcpState: () => Promise<any>;
      listMcpTools: () => Promise<any>;
      runDiagnostics: () => Promise<any>;
      loadMessages: () => Promise<ChatMessage[]>;
      saveMessages: (messages: ChatMessage[]) => Promise<any>;
      sendMessage: (payload: {
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        attachments?: AttachmentPayload[];
        mode: string;
      }) => Promise<{ content: string; activity: AgentActivity[] }>;
      onToolApproval: (callback: (request: StudioApprovalRequest) => void) => () => void;
      respondToolApproval: (requestId: string, approved: boolean) => Promise<{ ok: boolean }>;
      openExternal: (url: string) => Promise<any>;
    };
  }
}

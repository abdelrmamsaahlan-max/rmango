export type ChatMessage = {
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
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
  provider: 'anthropic' | 'openai';
  model: string;
  keyConfigured: boolean;
  configuredProviders?: string[];
  secureStorageAvailable: boolean;
};

declare global {
  interface Window {
    rmango: {
      getAppState: () => Promise<AppState>;
      getSettings: () => Promise<Settings>;
      saveSettings: (settings: { provider: 'anthropic' | 'openai'; model: string; apiKey?: string }) => Promise<any>;
      openProject: () => Promise<{ canceled?: boolean; path?: string; files?: ProjectFile[] }>;
      clearProject: () => Promise<any>;
      connectRoblox: () => Promise<any>;
      disconnectRoblox: () => Promise<any>;
      getMcpState: () => Promise<any>;
      listMcpTools: () => Promise<any>;
      runDiagnostics: () => Promise<any>;
      loadMessages: () => Promise<ChatMessage[]>;
      saveMessages: (messages: ChatMessage[]) => Promise<any>;
      sendMessage: (payload: { messages: Array<{ role: 'user' | 'assistant'; content: string }>; mode: string }) => Promise<{ content: string; activity: Array<{ name: string; detail: string; ok: boolean }> }>;
      openExternal: (url: string) => Promise<any>;
    };
  }
}

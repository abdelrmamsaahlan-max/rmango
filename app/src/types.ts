export type CloudProfile = 'fast' | 'developer' | 'think' | 'vision' | 'agent';

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
  id?: string;
  role: 'user' | 'assistant';
  content: string;
  createdAt: string;
  attachments?: ChatAttachment[];
  modelProfile?: CloudProfile;
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

export type CloudState = {
  configured: boolean;
  serviceReady?: boolean;
  signedIn: boolean;
  email?: string;
  apiHost?: string;
  message?: string;
};

export type CloudModelProfile = {
  id: string;
  name: string;
  description: string;
  contextWindow: number;
  maxOutputTokens: number;
  inputModalities: string[];
  capabilities: string[];
  inputUsdPerMillionTokens: number | null;
  outputUsdPerMillionTokens: number | null;
  profile: CloudProfile;
  profileLabel: string;
};

export type CloudModels = {
  profiles: CloudModelProfile[];
  availableModelCount: number;
  source: string;
  benchmarkScores: null;
};

export type StudioApprovalRequest = {
  requestId: string;
  name: string;
  description: string;
  arguments: Record<string, unknown>;
};

export type AgentActivity = { name: string; detail: string; ok: boolean };

export type UpdateState = {
  status: 'idle' | 'unsupported' | 'checking' | 'downloading' | 'downloaded' | 'not-available' | 'error';
  currentVersion: string;
  availableVersion?: string;
  progress?: number;
  message?: string;
  error?: string;
};

declare global {
  interface Window {
    rmango: {
      getAppState: () => Promise<AppState>;
      getCloudState: () => Promise<CloudState>;
      cloudSignIn: (credentials: { email: string; password: string }) => Promise<{ ok: boolean; user: { id: string; email?: string } }>;
      cloudSignUp: (credentials: { email: string; password: string; displayName?: string }) => Promise<{ ok: boolean; requiresEmailConfirmation: boolean; user: { id: string; email?: string } }>;
      cloudSignOut: () => Promise<{ ok: boolean }>;
      getCloudModels: () => Promise<CloudModels>;
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
        profile: CloudProfile;
        projectId?: string;
        conversationId?: string;
        requestId?: string;
      }) => Promise<{ requestId: string; content: string; activity: AgentActivity[]; conversationId?: string; modelId?: string; profile: CloudProfile }>;
      onCloudChatDelta: (callback: (event: { requestId: string; delta: string }) => void) => () => void;
      onToolApproval: (callback: (request: StudioApprovalRequest) => void) => () => void;
      respondToolApproval: (requestId: string, approved: boolean) => Promise<{ ok: boolean }>;
      getUpdateState: () => Promise<UpdateState>;
      checkForUpdates: () => Promise<UpdateState>;
      installUpdate: () => Promise<{ ok: boolean; message?: string }>;
      onUpdateStatus: (callback: (state: UpdateState) => void) => () => void;
      openExternal: (url: string) => Promise<any>;
    };
  }
}

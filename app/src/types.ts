export type CloudProfile = 'fast' | 'developer' | 'think' | 'vision' | 'agent';

export type AppPreferences = {
  appearance: 'dark' | 'light' | 'system';
  density: 'comfortable' | 'compact';
  animationsEnabled: boolean;
  reducedMotion: boolean;
  fontSize: 'small' | 'medium' | 'large';
  sendOnEnter: boolean;
  desktopNotifications: boolean;
  autoUpdatesEnabled: boolean;
  defaultCloudProfile: CloudProfile;
  saveLocalChatHistory: boolean;
  showInspectorByDefault: boolean;
};

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

export type CloudProjectChange = {
  id: string;
  relative_path: string;
  file_name: string;
  change_summary: string;
  original_sha256: string | null;
  proposed_sha256: string;
  status: 'pending' | 'approved' | 'rejected' | 'conflict';
  created_at: string;
};

export type ProjectUploadProgress = {
  projectId: string;
  completed: number;
  total: number;
  uploaded: number;
  skipped: number;
  currentFile: string;
};

export type ProjectFile = {
  name: string;
  path: string;
  kind: 'file' | 'folder';
};
export type StudioInstance = {
  id: string;
  name: string;
  placeId?: string;
};

export type AppState = AppPreferences & {
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
  displayName?: string;
  emailVerified?: boolean;
  accountVerified?: boolean;
  apiHost?: string;
  message?: string;
  currentProjectId?: string;
  currentConversationId?: string;
};

export type CloudUsage = {
  role: 'user' | 'admin';
  plan: 'free' | 'builder' | 'creator' | 'admin';
  planLabel: string;
  unlimitedAccount: boolean;
  usage: {
    dailyRequests: number;
    monthlyRequests: number;
    dailyTokens: number;
    monthlyTokens: number;
  };
  limits: {
    dailyRequests: number | null;
    monthlyRequests: number | null;
    dailyTokens: number | null;
    monthlyTokens: number | null;
    maxOutputTokens: number;
  };
  remaining: {
    dailyRequests: number | null;
    monthlyRequests: number | null;
    dailyTokens: number | null;
    monthlyTokens: number | null;
  };
  globalSpendGuard: boolean;
};

export type CloudConversation = {
  id: string;
  project_id: string | null;
  title: string;
  model_profile: CloudProfile;
  created_at: string;
  updated_at: string;
};
export type CloudAgentTask = {
  id: string;
  project_id: string | null;
  conversation_id: string | null;
  status: 'queued' | 'running' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';
  task_text: string;
  result: Record<string, unknown> | null;
  error: string | null;
  created_at: string;
  updated_at: string;
  events: Array<{
    id: number;
    task_id: string;
    event_type: string;
    message: string;
    data: Record<string, unknown>;
    created_at: string;
  }>;
};
export type CloudProject = {
  id: string;
  name: string;
  description: string;
  created_at: string;
  updated_at: string;
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

export type AgentActivity = { id?: string; requestId?: string; name: string; detail: string; ok: boolean; status?: 'running' | 'completed' | 'failed' | 'cancelled' };

export type UpdateState = {
  status: 'idle' | 'unsupported' | 'checking' | 'downloading' | 'downloaded' | 'not-available' | 'error';
  currentVersion: string;
  availableVersion?: string;
  progress?: number;
  message?: string;
  error?: string;
  releaseNotes?: string;
};

declare global {
  interface Window {
    rmango: {
      getAppState: () => Promise<AppState>;
      setAppearance: (theme: 'dark' | 'light' | 'system') => Promise<{ ok: boolean; appearance: 'dark' | 'light' | 'system' }>;
      updateSettings: (patch: Partial<AppPreferences>) => Promise<{ ok: boolean; settings: AppPreferences }>;
      getCloudState: () => Promise<CloudState>;
      getCloudUsage: () => Promise<CloudUsage>;
      cloudSignIn: (credentials: { email: string; password: string }) => Promise<{ ok: boolean; user: { id: string; email?: string } }>;
      cloudSignInWithGoogle: () => Promise<{ ok: boolean; user: { id: string; email?: string } }>;
      cancelGoogleSignIn: () => Promise<{ ok: boolean; message?: string }>;
      requestPasswordReset: (payload: { email: string }) => Promise<{ ok: boolean; message: string }>;
      cloudSignUp: (credentials: { email: string; password: string; displayName?: string }) => Promise<{ ok: boolean; requiresEmailConfirmation: boolean; user: { id: string; email?: string } }>;
      cloudSignOut: () => Promise<{ ok: boolean }>;
      getCloudModels: () => Promise<CloudModels>;
      getCloudConversations: (projectId?: string) => Promise<CloudConversation[]>;
      getCloudTasks: (projectId?: string) => Promise<CloudAgentTask[]>;
      getCloudProjects: () => Promise<CloudProject[]>;
      createCloudProject: (payload: { name: string; description?: string }) => Promise<CloudProject>;
      updateCloudProject: (payload: { projectId: string; name?: string; description?: string }) => Promise<CloudProject>;
      deleteCloudProject: (projectId: string) => Promise<{ ok: boolean; deletedProjectId: string; deletedFileCount: number }>;
      setCurrentCloudProjectId: (projectId?: string | null) => Promise<{ ok: boolean }>;
      loadCloudConversation: (conversationId: string) => Promise<{ conversation: CloudConversation; messages: ChatMessage[] }>;
      createCloudConversation: (payload: { title?: string; projectId?: string; modelProfile: CloudProfile }) => Promise<CloudConversation>;
      setCurrentConversationId: (conversationId?: string | null) => Promise<{ ok: boolean }>;
      openProject: () => Promise<{ canceled?: boolean; path?: string; files?: ProjectFile[] }>;
      clearProject: () => Promise<any>;
      uploadCloudProject: () => Promise<{ ok: boolean; projectId: string; projectName: string; totalFiles: number; uploaded: number; unchanged: number; removed: number; skipped: Array<{ name: string; reason: string }> }>;
      getCloudProjectChanges: (projectId: string) => Promise<{ project: { id: string; name: string }; changes: CloudProjectChange[] }>;
      reviewCloudProjectChange: (payload: { projectId: string; changeId: string; decision: 'approve' | 'reject' }) => Promise<{ ok: boolean; status: string; relativePath?: string }>;
      downloadCloudProject: (projectId: string) => Promise<{ canceled: boolean; path?: string; sizeBytes?: number }>;
      onProjectUploadProgress: (callback: (event: ProjectUploadProgress) => void) => () => void;
      connectRoblox: () => Promise<any>;
      disconnectRoblox: () => Promise<any>;
      getMcpState: () => Promise<{ connected: boolean; studioReady: boolean; cloudLinked: boolean; toolCount: number; tools: string[]; studioId: string | null; studioInstances: StudioInstance[] }>;
      selectStudioInstance: (studioId: string) => Promise<{ ok: boolean; studioId: string; studioReady: boolean }>;
      listMcpTools: () => Promise<any>;
      runDiagnostics: () => Promise<any>;
      loadMessages: () => Promise<ChatMessage[]>;
      saveMessages: (messages: ChatMessage[]) => Promise<any>;
      cancelMessage: (requestId: string) => Promise<{ ok: boolean }>;
      sendMessage: (payload: {
        messages: Array<{ role: 'user' | 'assistant'; content: string }>;
        attachments?: AttachmentPayload[];
        profile: CloudProfile;
        projectId?: string;
        conversationId?: string;
        requestId?: string;
      }) => Promise<{ requestId: string; content: string; activity: AgentActivity[]; conversationId?: string; modelId?: string; profile: CloudProfile }>;
      onCloudChatDelta: (callback: (event: { requestId: string; delta: string }) => void) => () => void;
      onCloudChatActivity: (callback: (event: { requestId: string; activity: AgentActivity }) => void) => () => void;
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

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

export type AgentTaskStatus = 'queued' | 'running' | 'paused' | 'waiting_approval' | 'completed' | 'failed' | 'cancelled';

export type AgentTask = {
  id: string;
  project_id: string | null;
  conversation_id: string | null;
  workflow_run_id?: string | null;
  status: AgentTaskStatus;
  task_text: string;
  result: Record<string, any> | null;
  error?: string | null;
  created_at: string;
  updated_at: string;
};

export type AgentTaskEvent = {
  id: number;
  event_type: string;
  message: string;
  data: Record<string, any>;
  created_at: string;
};

export type AgentTaskDetail = { task: AgentTask; events: AgentTaskEvent[] };

export type ProjectIndexStatus = {
  project: { id: string; name: string };
  index: {
    latestRun: {
      id: string;
      status: 'running' | 'completed' | 'partial' | 'failed';
      file_count: number;
      indexed_count: number;
      dependency_count: number;
      symbol_count: number;
      error_count: number;
      error?: string | null;
      started_at: string;
      completed_at?: string | null;
    } | null;
    fileCount: number;
    indexedCount: number;
    dependencyCount: number;
    symbolCount: number;
    coverage: number;
  };
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
  currentProjectId?: string;
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
  taskId?: string;
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
      uploadCloudProject: () => Promise<{ ok: boolean; projectId: string; projectName: string; totalFiles: number; uploaded: number; skipped: Array<{ name: string; reason: string }> }>;
      getCloudProjectChanges: (projectId: string) => Promise<{ project: { id: string; name: string }; changes: CloudProjectChange[] }>;
      getAgentTasks: (projectId?: string) => Promise<{ tasks: AgentTask[] }>;
      getAgentTask: (taskId: string) => Promise<AgentTaskDetail>;
      createAgentTask: (payload: { projectId: string; conversationId?: string; taskText: string; profile: CloudProfile }) => Promise<{ task: AgentTask; conversationId: string; workflowRunId: string }>;
      controlAgentTask: (payload: { taskId: string; action: 'pause' | 'resume' | 'cancel' | 'retry' }) => Promise<{ ok: boolean; status: AgentTaskStatus; workflowRunId?: string }>;
      getCloudProjectIndex: (projectId: string) => Promise<ProjectIndexStatus>;
      startCloudProjectIndex: (projectId: string) => Promise<{ workflowRunId?: string; status: string; alreadyRunning?: boolean }>;
      reviewCloudProjectChange: (payload: { projectId: string; changeId: string; decision: 'approve' | 'reject' }) => Promise<{ ok: boolean; status: string; relativePath?: string }>;
      downloadCloudProject: (projectId: string) => Promise<{ canceled: boolean; path?: string; sizeBytes?: number }>;
      onProjectUploadProgress: (callback: (event: ProjectUploadProgress) => void) => () => void;
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
